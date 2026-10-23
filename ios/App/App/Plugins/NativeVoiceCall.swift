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

    /// Leaves for good: tears the connection down and DELETEs the session (best effort).
    func close() {
        if closed { return }
        closed = true
        teardownPeer()
        if let id = sessionId {
            deleteSession(id)
        }
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
            guard (200..<300).contains(status), let id = newId, let sdp = json?["sdp"] as? String else {
                self.fail("POST session: \(NativeVoiceCall.describe(status: status, error: error))")
                return
            }
            self.sessionId = id
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
            fail("não foi possível criar a conexão")
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
                    self.fail("oferta do servidor: \(error.localizedDescription)")
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
                    self.fail("resposta SDP: \(error?.localizedDescription ?? "vazia")")
                    return
                }
                pc.setLocalDescription(answer) { (error: Error?) in
                    DispatchQueue.main.async {
                        guard self.isCurrent(pc) else { return }
                        if let error = error {
                            self.fail("descrição local: \(error.localizedDescription)")
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
                self.fail("PATCH session: \(NativeVoiceCall.describe(status: status, error: error))")
            }
        }
    }

    private func isCurrent(_ pc: RTCPeerConnection) -> Bool {
        return !closed && peerConnection === pc
    }

    private func handlePeerState(_ newState: RTCPeerConnectionState) {
        // Reconnect (disconnected > 5 s, heartbeat 410) builds on this switch.
        switch newState {
        case .connected:
            setState("connected")
        case .failed:
            fail("conexão de áudio caiu")
        default:
            break
        }
    }

    /// Ends the attempt: drops the connection and the server session, reports "failed".
    private func fail(_ reason: String) {
        if closed { return }
        diag?("LINHA", "conectar linha \(lineId)", "falhou: \(reason)")
        teardownPeer()
        if let id = sessionId {
            deleteSession(id)
            sessionId = nil
        }
        setState("failed")
    }

    private func teardownPeer() {
        stopStats()
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
        let wasConnected = state == "connected"
        state = newState
        emitState()
        if newState == "connected" && !wasConnected {
            diag?("LINHA", "conectar linha \(lineId)", "conectado")
            startStats()
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

    // MARK: - HTTP

    private func deleteSession(_ id: String) {
        // 500 when the session is already gone is harmless.
        request("DELETE", "session/" + NativeVoiceCall.encode(id), body: nil) { (_: Int, _: Data?, _: Error?) in }
    }

    /// Completion runs on the main queue with the HTTP status (0 when there was no response).
    private func request(_ method: String, _ path: String, body: [String: Any]?,
                         completion: @escaping (Int, Data?, Error?) -> Void) {
        var base = baseUrl
        if !base.hasSuffix("/") { base += "/" }
        guard let url = URL(string: base + path) else {
            diag?("SESSAO", "\(method) \(path)", "falhou: URL inválida")
            completion(0, nil, nil)
            return
        }
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        req.httpMethod = method
        if !apiKey.isEmpty {
            req.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }
        if let body = body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try? JSONSerialization.data(withJSONObject: body, options: [])
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
