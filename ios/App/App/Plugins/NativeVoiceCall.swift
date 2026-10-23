import Foundation
import WebRTC

/// One line's call: the server session (HTTP) and one RTCPeerConnection.
/// Main queue only: every WebRTC and URLSession callback hops to the main queue,
/// and callbacks from a peer connection that is no longer current are dropped.
final class NativeVoiceCall: NSObject {

    static let factory: RTCPeerConnectionFactory = {
        _ = RTCInitializeSSL()
        return RTCPeerConnectionFactory()
    }()

    private static let activityThreshold: Double = 0.02
    private static let iceGatherTimeout: TimeInterval = 5.0
    private static let statsInterval: TimeInterval = 0.1
    private static let heartbeatInterval: TimeInterval = 10.0
    private static let disconnectGrace: TimeInterval = 5.0
    /// Wait before reconnect attempt n (1-based); after the list, every `steadyBackoff`.
    private static let backoff: [TimeInterval] = [2.0, 4.0, 8.0]
    private static let steadyBackoff: TimeInterval = 15.0

    let callId: String
    let meta: String
    let canTalk: Bool
    private let baseUrl: String
    private let apiKey: String
    private let productionId: String
    private let lineId: String
    private let username: String

    /// "connecting" | "connected" | "reconnecting" | "failed" | "closed"
    private(set) var state: String = "connecting"
    private(set) var sessionId: String?
    /// The user's mic choice; starts closed and is applied to every local track created.
    private(set) var micEnabled: Bool = false

    /// Set by the plugin: (event name, payload) for notifyListeners.
    var emit: ((String, [String: Any]) -> Void)?
    /// Set by the plugin: (key, action, result) for the "diag" event.
    var diag: ((String, String, String) -> Void)?
    /// Called on every transition into "connected" (start cue).
    var onConnected: (() -> Void)?

    private var peerConnection: RTCPeerConnection?
    private var dataChannel: RTCDataChannel?
    private var localTrack: RTCAudioTrack?
    private var outputMuted: Bool = false
    private var volume: Double = 0.75
    private var statsTimer: Timer?
    private var statsInFlight: Bool = false
    private var lastActive: Bool = false
    private var gatherTimeout: DispatchWorkItem?
    private var pendingAnswerSdp: String?
    private var closed: Bool = false
    private var heartbeatTimer: Timer?
    /// PC `disconnected`: reconnect if it is not back within `disconnectGrace`.
    private var disconnectWork: DispatchWorkItem?
    /// The next reconnect attempt (backoff); cancelled by teardown, so `leave` stops retries.
    private var retryWork: DispatchWorkItem?
    /// Reconnect attempts since the line was last connected.
    private var attempt: Int = 0
    /// Dropped sessions whose DELETE got no answer (offline): DELETEd again before the next
    /// POST, so the line never shows the user twice once the network is back.
    private var staleSessionIds: [String] = []

    init(callId: String, baseUrl: String, apiKey: String, productionId: String,
         lineId: String, username: String, canTalk: Bool, meta: String) {
        self.callId = callId
        self.baseUrl = baseUrl
        self.apiKey = apiKey
        self.productionId = productionId
        self.lineId = lineId
        self.username = username
        self.canTalk = canTalk
        self.meta = meta
        super.init()
    }

    func info() -> [String: Any] {
        var sid: Any = NSNull()
        if let s = sessionId { sid = s }
        return [
            "callId": callId,
            "meta": meta,
            "sessionId": sid,
            "state": state,
            "micEnabled": micEnabled,
        ]
    }

    // MARK: - Lifecycle

    func start() {
        diag?("LINHA", "entrar na linha \(lineId)", "pedindo sessão")
        openSession()
    }

    /// Leaves for good: tears the connection down (cancelling any pending reconnect) and
    /// DELETEs the session (best effort).
    func close() {
        if closed { return }
        closed = true
        teardownPeer()
        if let id = sessionId {
            deleteSession(id)
        }
        flushStaleSessions()
        setState("closed")
    }

    private func openSession() {
        // The server expects numeric ids (the web app sends parseInt values).
        var production: Any = productionId
        if let n = Int(productionId) { production = n }
        var line: Any = lineId
        if let n = Int(lineId) { line = n }
        let body: [String: Any] = ["productionId": production, "lineId": line, "username": username]
        // Strong capture: after a leave the call must still DELETE a session created meanwhile.
        request("POST", "session/", body: body) { (status: Int, data: Data?, error: Error?) in
            let json = NativeVoiceCall.parseObject(data)
            let newId = json?["sessionId"] as? String
            if self.closed {
                // Left while the POST was in flight: do not leave a ghost behind.
                if let id = newId { self.deleteSession(id) }
                return
            }
            let reason: String = "POST session: \(NativeVoiceCall.describe(status: status, error: error))"
            guard (200..<300).contains(status), let id = newId else {
                // 4xx: the line or production is gone (or the key is refused); retrying cannot help.
                if (400..<500).contains(status) {
                    self.fail(reason)
                } else {
                    self.reconnect(reason)
                }
                return
            }
            self.sessionId = id
            guard let sdp = json?["sdp"] as? String else {
                self.reconnect("POST session: resposta sem SDP")
                return
            }
            self.emitState()
            self.connect(offer: sdp)
        }
    }

    // MARK: - Peer connection

    private func connect(offer: String) {
        let config = RTCConfiguration()
        config.iceServers = [
            RTCIceServer(urlStrings: ["stun:stun.l.google.com:19302"]),
            RTCIceServer(urlStrings: ["stun:stun1.l.google.com:19302"]),
        ]
        config.sdpSemantics = .unifiedPlan
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        guard let pc = NativeVoiceCall.factory.peerConnection(with: config, constraints: constraints, delegate: self) else {
            reconnect("não foi possível criar a conexão")
            return
        }
        peerConnection = pc

        if canTalk {
            let source: RTCAudioSource = NativeVoiceCall.factory.audioSource(with: constraints)
            let track: RTCAudioTrack = NativeVoiceCall.factory.audioTrack(with: source, trackId: "mic-\(callId)")
            track.isEnabled = micEnabled
            _ = pc.add(track, streamIds: ["mic-\(callId)"])
            localTrack = track
        }

        let dcConfig = RTCDataChannelConfiguration()
        dcConfig.isOrdered = true
        let dc: RTCDataChannel? = pc.dataChannel(forLabel: "conference-data-channel", configuration: dcConfig)
        dc?.delegate = self
        dataChannel = dc

        let remote = RTCSessionDescription(type: .offer, sdp: offer)
        pc.setRemoteDescription(remote) { (error: Error?) in
            DispatchQueue.main.async {
                guard self.isCurrent(pc) else { return }
                if let error = error {
                    self.reconnect("oferta do servidor: \(error.localizedDescription)")
                    return
                }
                self.applyOutput()
                self.createAnswer(pc, constraints: constraints)
            }
        }
    }

    private func createAnswer(_ pc: RTCPeerConnection, constraints: RTCMediaConstraints) {
        pc.answer(for: constraints) { (sdp: RTCSessionDescription?, error: Error?) in
            DispatchQueue.main.async {
                guard self.isCurrent(pc) else { return }
                guard let answer = sdp else {
                    self.reconnect("resposta SDP: \(error?.localizedDescription ?? "vazia")")
                    return
                }
                pc.setLocalDescription(answer) { (error: Error?) in
                    DispatchQueue.main.async {
                        guard self.isCurrent(pc) else { return }
                        if let error = error {
                            self.reconnect("descrição local: \(error.localizedDescription)")
                            return
                        }
                        self.waitForIceGathering(pc, answerSdp: answer.sdp)
                    }
                }
            }
        }
    }

    // No trickle ICE: wait for gathering (at most 5 s), then PATCH. Like the web app, the answer
    // goes as created; the server learns our address from the connectivity checks.
    private func waitForIceGathering(_ pc: RTCPeerConnection, answerSdp: String) {
        if pc.iceGatheringState == .complete {
            patchAnswer(answerSdp)
            return
        }
        pendingAnswerSdp = answerSdp
        let work = DispatchWorkItem { [weak self] in
            self?.iceGatheringDone()
        }
        gatherTimeout = work
        DispatchQueue.main.asyncAfter(deadline: .now() + NativeVoiceCall.iceGatherTimeout, execute: work)
    }

    private func iceGatheringDone() {
        gatherTimeout?.cancel()
        gatherTimeout = nil
        guard let sdp = pendingAnswerSdp else { return }
        pendingAnswerSdp = nil
        patchAnswer(sdp)
    }

    private func patchAnswer(_ sdp: String) {
        guard let id = sessionId else { return }
        let pc = peerConnection
        request("PATCH", "session/" + NativeVoiceCall.encode(id), body: ["sdpAnswer": sdp]) { (status: Int, _: Data?, error: Error?) in
            guard let pc = pc, self.isCurrent(pc) else { return }
            if !(200..<300).contains(status) {
                self.reconnect("PATCH session: \(NativeVoiceCall.describe(status: status, error: error))")
            }
        }
    }

    private func isCurrent(_ pc: RTCPeerConnection) -> Bool {
        return !closed && peerConnection === pc
    }

    private func handlePeerState(_ newState: RTCPeerConnectionState) {
        switch newState {
        case .connected:
            disconnectWork?.cancel()
            disconnectWork = nil
            setState("connected")
        case .disconnected:
            // Often recovers by itself (e.g. Wi-Fi to cellular); reconnect only if it lasts.
            if disconnectWork != nil { return }
            guard let pc = peerConnection else { return }
            let work = DispatchWorkItem { [weak self] in
                guard let self = self, self.isCurrent(pc) else { return }
                self.disconnectWork = nil
                self.reconnect("conexão de áudio sem resposta por mais de 5 s")
            }
            disconnectWork = work
            DispatchQueue.main.asyncAfter(deadline: .now() + NativeVoiceCall.disconnectGrace, execute: work)
        case .failed:
            reconnect("conexão de áudio caiu")
        default:
            break
        }
    }

    /// Terminal (POST 4xx only): drops the connection and the server session, reports "failed".
    private func fail(_ reason: String) {
        if closed { return }
        diag?("LINHA", "conectar linha \(lineId)", "falhou: \(reason)")
        dropSession()
        setState("failed")
    }

    /// Drops the attempt (best-effort DELETE of its session) and schedules the next POST
    /// after 2 s, 4 s, 8 s, then every 15 s, until connected, `fail` or `close`.
    /// The mic keeps the user's choice: the next local track is created with `micEnabled`.
    private func reconnect(_ reason: String) {
        if closed { return }
        diag?("LINHA", "conectar linha \(lineId)", "falhou: \(reason)")
        dropSession()
        attempt += 1
        let delay: TimeInterval = attempt <= NativeVoiceCall.backoff.count
            ? NativeVoiceCall.backoff[attempt - 1]
            : NativeVoiceCall.steadyBackoff
        setState("reconnecting")
        diag?("RECONEXÃO", "tentativa \(attempt)", "aguardando \(Int(delay)) s")
        let work = DispatchWorkItem { [weak self] in
            guard let self = self, !self.closed else { return }
            self.retryWork = nil
            self.flushStaleSessions()
            self.openSession()
        }
        retryWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    private func dropSession() {
        teardownPeer()
        if let id = sessionId {
            deleteSession(id)
            sessionId = nil
        }
    }

    /// Stops everything tied to the current attempt: timers, pending retry, peer connection.
    private func teardownPeer() {
        stopStats()
        stopHeartbeat()
        disconnectWork?.cancel()
        disconnectWork = nil
        retryWork?.cancel()
        retryWork = nil
        gatherTimeout?.cancel()
        gatherTimeout = nil
        pendingAnswerSdp = nil
        dataChannel?.delegate = nil
        dataChannel?.close()
        dataChannel = nil
        peerConnection?.close()
        peerConnection = nil
        localTrack = nil
        if lastActive {
            lastActive = false
            emit?("activity", ["callId": callId, "active": false])
        }
    }

    private func setState(_ newState: String) {
        if newState == state { return }
        let previous: String = state
        state = newState
        emitState()
        if newState == "connected" {
            if previous == "reconnecting" {
                diag?("RECONEXÃO", "linha \(lineId)", "reconectada após \(attempt) tentativa(s)")
            } else {
                diag?("LINHA", "conectar linha \(lineId)", "conectado")
            }
            attempt = 0
            startStats()
            startHeartbeat()
            onConnected?()
        }
    }

    private func emitState() {
        var sid: Any = NSNull()
        if let s = sessionId { sid = s }
        emit?("callState", ["callId": callId, "state": state, "sessionId": sid])
    }

    // MARK: - Mic, output, data

    /// Idempotent. `source` nil = asked by JS (it already knows, no event); otherwise a
    /// native-originated change ("fone" | "interrupção" | "remoto") reported as micChanged.
    func setMicEnabled(_ enabled: Bool, source: String?) {
        if !canTalk || enabled == micEnabled { return }
        micEnabled = enabled
        localTrack?.isEnabled = enabled
        if let source = source {
            emit?("micChanged", ["callId": callId, "enabled": enabled, "source": source])
        }
    }

    func setOutputMuted(_ muted: Bool) {
        outputMuted = muted
        applyOutput()
    }

    func setVolume(_ value: Double) {
        volume = min(max(value, 0.0), 1.0)
        applyOutput()
    }

    // The source volume is a linear gain (1 = unity, max 10); 0..1 maps 1:1 like
    // HTMLAudioElement.volume on the web.
    private func applyOutput() {
        guard let pc = peerConnection else { return }
        let gain: Double = outputMuted ? 0.0 : volume
        for receiver in pc.receivers {
            if let track = receiver.track as? RTCAudioTrack {
                track.source.volume = gain
            }
        }
    }

    /// False when the data channel is not open.
    func sendData(_ message: String) -> Bool {
        guard let dc = dataChannel, dc.readyState == .open else { return false }
        let buffer = RTCDataBuffer(data: Data(message.utf8), isBinary: false)
        return dc.sendData(buffer)
    }

    private func handleMessage(_ data: Data) {
        guard let msg = NativeVoiceCall.parseObject(data), let type = msg["type"] as? String else { return }
        if type == "DominantSpeaker" {
            if let endpoint = msg["endpoint"] as? String {
                emit?("dominantSpeaker", ["callId": callId, "endpoint": endpoint])
            }
        } else if type == "EndpointMessage" {
            let payload = msg["payload"] as? [String: Any]
            let to = msg["to"] as? String
            let from = msg["from"] as? String
            if (payload?["muteParticipant"] as? String) == "mute" && to != from {
                setMicEnabled(false, source: "remoto")
            }
        }
    }

    // MARK: - Activity (stats every 100 ms, reported only on change)

    private func startStats() {
        stopStats()
        let timer = Timer(timeInterval: NativeVoiceCall.statsInterval, repeats: true) { [weak self] (_: Timer) in
            self?.pollStats()
        }
        RunLoop.main.add(timer, forMode: .common)
        statsTimer = timer
    }

    private func stopStats() {
        statsTimer?.invalidate()
        statsTimer = nil
        statsInFlight = false
    }

    private func pollStats() {
        guard !statsInFlight, let pc = peerConnection else { return }
        statsInFlight = true
        pc.statistics { (report: RTCStatisticsReport) in
            let active: Bool = NativeVoiceCall.hasActivity(report)
            DispatchQueue.main.async {
                guard self.isCurrent(pc) else { return }
                self.statsInFlight = false
                if active != self.lastActive {
                    self.lastActive = active
                    self.emit?("activity", ["callId": self.callId, "active": active])
                }
            }
        }
    }

    /// Inbound or local audio level above the threshold (same rule as the web app).
    private static func hasActivity(_ report: RTCStatisticsReport) -> Bool {
        for (_, stat) in report.statistics {
            if stat.type == "inbound-rtp" || stat.type == "media-source" {
                if let level = stat.values["audioLevel"] as? NSNumber,
                   level.doubleValue > activityThreshold {
                    return true
                }
            }
        }
        return false
    }

    // MARK: - Heartbeat (presence; 410 = the server dropped the session)

    private func startHeartbeat() {
        stopHeartbeat()
        let timer = Timer(timeInterval: NativeVoiceCall.heartbeatInterval, repeats: true) { [weak self] (_: Timer) in
            self?.sendHeartbeat()
        }
        RunLoop.main.add(timer, forMode: .common)
        heartbeatTimer = timer
    }

    private func stopHeartbeat() {
        heartbeatTimer?.invalidate()
        heartbeatTimer = nil
    }

    private func sendHeartbeat() {
        guard let id = sessionId else { return }
        request("GET", "heartbeat/" + NativeVoiceCall.encode(id), body: nil) { (status: Int, _: Data?, _: Error?) in
            // Drop answers for a session that was already replaced or left.
            guard !self.closed, self.sessionId == id else { return }
            if status == 410 {
                self.reconnect("servidor encerrou a sessão (heartbeat 410)")
            }
        }
    }

    // MARK: - HTTP

    /// DELETEs of the current and stale sessions with a short timeout, for the synchronous
    /// leave on app terminate.
    func terminateRequests(timeout: TimeInterval) -> [URLRequest] {
        var ids: [String] = staleSessionIds
        if let id = sessionId { ids.append(id) }
        return ids.compactMap { (id: String) -> URLRequest? in
            return makeRequest("DELETE", "session/" + NativeVoiceCall.encode(id), body: nil, timeout: timeout)
        }
    }

    private func deleteSession(_ id: String) {
        // 500 when the session is already gone is harmless; no answer at all = try again later.
        request("DELETE", "session/" + NativeVoiceCall.encode(id), body: nil) { (status: Int, _: Data?, _: Error?) in
            if status == 0 && !self.closed {
                self.staleSessionIds.append(id)
            }
        }
    }

    private func flushStaleSessions() {
        let stale: [String] = staleSessionIds
        staleSessionIds = []
        for id in stale {
            deleteSession(id)
        }
    }

    /// Completion runs on the main queue with the HTTP status (0 when there was no response).
    private func request(_ method: String, _ path: String, body: [String: Any]?,
                         completion: @escaping (Int, Data?, Error?) -> Void) {
        guard let req = makeRequest(method, path, body: body, timeout: 15) else {
            diag?("SESSAO", "\(method) \(path)", "falhou: URL inválida")
            completion(0, nil, nil)
            return
        }
        let lineId = self.lineId
        URLSession.shared.dataTask(with: req) { (data: Data?, response: URLResponse?, error: Error?) in
            let status: Int = (response as? HTTPURLResponse)?.statusCode ?? 0
            DispatchQueue.main.async {
                if !(200..<300).contains(status) && !(method == "DELETE" && status == 500) {
                    self.diag?("SESSAO", "\(method) sessão (linha \(lineId))",
                                "falhou: \(NativeVoiceCall.describe(status: status, error: error))")
                }
                completion(status, data, error)
            }
        }.resume()
    }

    private func makeRequest(_ method: String, _ path: String, body: [String: Any]?,
                             timeout: TimeInterval) -> URLRequest? {
        var base = baseUrl
        if !base.hasSuffix("/") { base += "/" }
        guard let url = URL(string: base + path) else { return nil }
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
        req.httpMethod = method
        if !apiKey.isEmpty {
            req.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }
        if let body = body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try? JSONSerialization.data(withJSONObject: body, options: [])
        }
        return req
    }

    private static func describe(status: Int, error: Error?) -> String {
        if let error = error { return error.localizedDescription }
        return "HTTP \(status)"
    }

    private static func encode(_ id: String) -> String {
        return id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
    }

    private static func parseObject(_ data: Data?) -> [String: Any]? {
        guard let data = data else { return nil }
        return (try? JSONSerialization.jsonObject(with: data, options: [])) as? [String: Any]
    }
}

// MARK: - WebRTC delegates (WebRTC threads; hop to main)

extension NativeVoiceCall: RTCPeerConnectionDelegate {

    @objc(peerConnection:didChangeSignalingState:)
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}

    @objc(peerConnection:didAddStream:)
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}

    @objc(peerConnection:didRemoveStream:)
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}

    @objc(peerConnectionShouldNegotiate:)
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}

    @objc(peerConnection:didChangeIceConnectionState:)
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {}

    @objc(peerConnection:didChangeIceGatheringState:)
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {
        if newState != .complete { return }
        DispatchQueue.main.async { [weak self] in
            guard let self = self, self.isCurrent(peerConnection) else { return }
            self.iceGatheringDone()
        }
    }

    @objc(peerConnection:didGenerateIceCandidate:)
    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {}

    @objc(peerConnection:didRemoveIceCandidates:)
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}

    @objc(peerConnection:didOpenDataChannel:)
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}

    @objc(peerConnection:didChangeConnectionState:)
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCPeerConnectionState) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, self.isCurrent(peerConnection) else { return }
            self.handlePeerState(newState)
        }
    }
}

extension NativeVoiceCall: RTCDataChannelDelegate {

    @objc(dataChannelDidChangeState:)
    func dataChannelDidChangeState(_ dataChannel: RTCDataChannel) {}

    @objc(dataChannel:didReceiveMessageWithBuffer:)
    func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
        let data = buffer.data
        DispatchQueue.main.async { [weak self] in
            guard let self = self, !self.closed, self.dataChannel === dataChannel else { return }
            self.handleMessage(data)
        }
    }
}
