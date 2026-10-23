import Foundation
import AVFoundation
import CallKit
import UIKit
import Capacitor
import WebRTC

/// iOS call audio for every line, natively (contract: src/mobile-overlay/native-voice.ts).
/// All state lives on the main queue; plugin methods hop to it.
@objc(NativeVoicePlugin)
public class NativeVoicePlugin: CAPPlugin {

    /// For AppDelegate.applicationWillTerminate (the plugin instance lives as long as the bridge).
    private static weak var current: NativeVoicePlugin?

    private var calls: [String: NativeVoiceCall] = [:]
    /// callIds in join order, so listCalls restores lines in the order they were opened.
    private var callOrder: [String] = []
    /// Main queue: fired on any change of `lineSnapshots()` (set by the widget controller).
    var onLinesChanged: (() -> Void)?
    /// Last line whose mic was opened: the headset toggle's target.
    private(set) var lastMicCallId: String? {
        didSet {
            // The headset line (first row of the widget) may have moved.
            if oldValue != lastMicCallId { onLinesChanged?() }
        }
    }
    /// systemUptime of the last headset press acted on (400 ms debounce).
    private var lastHeadsetPress: TimeInterval = -Double.infinity
    private var cuePlayer: AVAudioPlayer?
    /// The one RTCAudioSession activation held while at least one line is open.
    private var holdsSession: Bool = false
    /// Gives the activation back after the last line's stop cue; cancelled by a new join.
    private var releaseWork: DispatchWorkItem?
    /// Silent loop while lines (re)connect and none is connected: closing a peer connection stops
    /// WebRTC's audio unit, and with no audio running iOS suspends the app and its retries.
    private var keepAlivePlayer: AVAudioPlayer?
    /// An interruption .began with no .ended yet (some apps never send it).
    private var interruptedWithoutEnd: Bool = false {
        didSet {
            // Every line's status ("pausa").
            if oldValue != interruptedWithoutEnd { onLinesChanged?() }
        }
    }

    // CallKit mode (experimental switch, off by default): while on, one CallKit call owns the
    // audio session so a Bluetooth headset in HFP sends its button presses to the app.
    /// The switch as JS last sent it.
    private var callKitWanted: Bool = false
    /// Latched at the join that opens the first line; cleared once the call and its audio end.
    private var callKitMode: Bool = false
    private var callKitProvider: CXProvider?
    private lazy var callKitController: CXCallController = CXCallController()
    private lazy var callKitObserver: CXCallObserver = {
        let observer = CXCallObserver()
        observer.setDelegate(self, queue: nil)
        return observer
    }()
    /// Our current call (set when its start is requested).
    private var callKitUUID: UUID?
    /// Every call of ours CallKit may still list; the rest are phone calls.
    private var callKitMine: Set<UUID> = []
    /// Ends the app asked for (any other end of our call is the headset button).
    private var callKitAppEnds: Set<UUID> = []
    /// A CXTransaction in flight: one at a time (see reconcileCallKit).
    private var callKitBusy: Bool = false
    /// Between provider(didActivate:) and provider(didDeactivate:).
    private var callKitAudioActive: Bool = false
    /// Cue held until CallKit activates the session (AVAudioPlayer would activate it itself).
    private var pendingCue: String?
    /// CallKit mode: until when interruptions are our own end/new call after a headset press.
    private var callKitRestartUntil: TimeInterval = 0
    /// CallKit mode, after a press: the old call the new one waits for (one call group).
    private var callKitWaitEnd: UUID?
    /// CallKit mode: start retries after a transient error (at most 5, then fallback).
    private var callKitRetries: Int = 0

    public override func load() {
        NativeVoicePlugin.current = self
        // AudioRoutePlugin starts on the speaker route.
        NativeVoicePlugin.configureWebRTCAudio(speaker: true)
        NotificationCenter.default.addObserver(
            self, selector: #selector(audioInterruption(_:)),
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance()
        )
        // Posted by HeadsetButtonPlugin (remote commands); CallKit presses arrive below.
        NotificationCenter.default.addObserver(
            self, selector: #selector(headsetButton(_:)),
            name: .intercomHeadsetButton, object: nil
        )
        NotificationCenter.default.addObserver(
            self, selector: #selector(appBecameActive(_:)),
            name: UIApplication.didBecomeActiveNotification, object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    /// Swiping the app away kills it without running JS: DELETE every native session
    /// synchronously (2 s at most in total). Native knows the current session ids even after a
    /// reconnect that happened while JS was asleep. Main thread (applicationWillTerminate).
    static func leaveAllOnTerminate() {
        guard let plugin = current else { return }
        let group = DispatchGroup()
        for callId in plugin.callOrder {
            guard let voiceCall = plugin.calls[callId] else { continue }
            for request in voiceCall.terminateRequests(timeout: 2) {
                group.enter()
                URLSession.shared.dataTask(with: request) { (_: Data?, _: URLResponse?, _: Error?) in
                    group.leave()
                }.resume()
            }
        }
        _ = group.wait(timeout: .now() + 2)
    }

    /// Main queue: whether some line is open (AudioRoutePlugin reinforces the mic only then).
    static var hasCalls: Bool {
        return current?.calls.isEmpty == false
    }

    /// Main queue: a "diag" event from another plugin (AudioRoutePlugin's mic reinforcement).
    static func diag(_ key: String, _ action: String, _ result: String) {
        current?.emitDiag(key, action, result)
    }

    /// WebRTC (re)configures the shared AVAudioSession when audio starts; make it apply the
    /// app's values so it never sets something different.
    static func configureWebRTCAudio(speaker: Bool) {
        let config: RTCAudioSessionConfiguration = RTCAudioSessionConfiguration.webRTC()
        config.category = AVAudioSession.Category.playAndRecord.rawValue
        config.mode = AVAudioSession.Mode.voiceChat.rawValue
        var options: AVAudioSession.CategoryOptions = [.allowBluetoothHFP]
        if speaker {
            options.insert(.defaultToSpeaker)
        }
        config.categoryOptions = options
        RTCAudioSessionConfiguration.setWebRTC(config)
    }

    // MARK: - Contract methods

    @objc func join(_ call: CAPPluginCall) {
        guard let callId = call.getString("callId"),
              let baseUrl = call.getString("baseUrl"),
              let productionId = call.getString("productionId"),
              let lineId = call.getString("lineId"),
              let username = call.getString("username") else {
            call.reject("join: faltam callId, baseUrl, productionId, lineId ou username")
            return
        }
        let apiKey: String = call.getString("apiKey") ?? ""
        let canTalk: Bool = call.getBool("canTalk") ?? false
        let meta: String = call.getString("meta") ?? ""
        DispatchQueue.main.async {
            // Idempotent per callId: after a WebView reload JS attaches to the running call.
            if let existing = self.calls[callId] {
                call.resolve(existing.info())
                return
            }
            let voiceCall = NativeVoiceCall(callId: callId, baseUrl: baseUrl, apiKey: apiKey,
                                            productionId: productionId, lineId: lineId,
                                            username: username, canTalk: canTalk, meta: meta)
            voiceCall.emit = { [weak self] (event: String, data: [String: Any]) in
                self?.notifyListeners(event, data: data)
                if event == "callState" {
                    self?.updateKeepAlive()
                }
            }
            voiceCall.diag = { [weak self] (key: String, action: String, result: String) in
                self?.emitDiag(key, action, result)
            }
            voiceCall.onConnected = { [weak self] in
                self?.playCue("start-connection-451")
                self?.reassertRoute(lineId: lineId)
            }
            voiceCall.onChanged = { [weak self] in
                self?.onLinesChanged?()
            }
            AudioRoutePlugin.resetReinforce()
            // The switch takes effect when the first line opens with no activation of ours left.
            if self.calls.isEmpty && !self.holdsSession && !self.callKitMode && self.callKitWanted {
                self.beginCallKitMode()
            }
            if self.callKitMode {
                self.releaseWork?.cancel()
                self.releaseWork = nil
            } else {
                self.holdSession()
            }
            self.calls[callId] = voiceCall
            self.callOrder.append(callId)
            self.reconcileCallKit()
            voiceCall.start()
            // The initial "connecting" is not emitted as a transition.
            self.updateKeepAlive()
            self.onLinesChanged?()
            call.resolve(voiceCall.info())
        }
    }

    @objc func leave(_ call: CAPPluginCall) {
        let callId: String = call.getString("callId") ?? ""
        DispatchQueue.main.async {
            guard let voiceCall = self.calls.removeValue(forKey: callId) else {
                call.resolve()
                return
            }
            self.callOrder.removeAll { (id: String) -> Bool in id == callId }
            if self.lastMicCallId == callId {
                self.lastMicCallId = nil
            }
            voiceCall.close()
            self.playCue("stop-connection-451")
            self.emitDiag("LINHA", "sair da linha", "ok")
            if self.calls.isEmpty {
                self.interruptedWithoutEnd = false
                self.scheduleRelease(after: (self.cuePlayer?.duration ?? 0) + 1.0)
            }
            self.onLinesChanged?()
            call.resolve()
        }
    }

    /// From JS: idempotent and silent (JS already knows the new state).
    @objc func setMicEnabled(_ call: CAPPluginCall) {
        let callId: String = call.getString("callId") ?? ""
        let enabled: Bool = call.getBool("enabled") ?? false
        DispatchQueue.main.async {
            guard let voiceCall = self.calls[callId] else {
                call.reject("Linha nativa não encontrada")
                return
            }
            voiceCall.setMicEnabled(enabled, source: nil)
            if enabled && voiceCall.micEnabled {
                self.lastMicCallId = callId
            }
            call.resolve()
        }
    }

    @objc func setOutputMuted(_ call: CAPPluginCall) {
        let callId: String = call.getString("callId") ?? ""
        let muted: Bool = call.getBool("muted") ?? false
        DispatchQueue.main.async {
            guard let voiceCall = self.calls[callId] else {
                call.reject("Linha nativa não encontrada")
                return
            }
            voiceCall.setOutputMuted(muted)
            call.resolve()
        }
    }

    @objc func setVolume(_ call: CAPPluginCall) {
        let callId: String = call.getString("callId") ?? ""
        let volume: Double = call.getDouble("volume") ?? 0.75
        DispatchQueue.main.async {
            guard let voiceCall = self.calls[callId] else {
                call.reject("Linha nativa não encontrada")
                return
            }
            voiceCall.setVolume(volume)
            call.resolve()
        }
    }

    @objc func sendData(_ call: CAPPluginCall) {
        let callId: String = call.getString("callId") ?? ""
        let message: String = call.getString("message") ?? ""
        DispatchQueue.main.async {
            guard let voiceCall = self.calls[callId] else {
                call.reject("Linha nativa não encontrada")
                return
            }
            if voiceCall.sendData(message) {
                call.resolve()
            } else {
                call.reject("Canal de dados não está aberto")
            }
        }
    }

    @objc func listCalls(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let list: [[String: Any]] = self.callOrder.compactMap { (id: String) -> [String: Any]? in
                return self.calls[id]?.info()
            }
            call.resolve(["calls": list])
        }
    }

    @objc func checkMicPermission(_ call: CAPPluginCall) {
        let status = AVAudioSession.sharedInstance().recordPermission
        call.resolve(["granted": status == .granted])
    }

    @objc func requestMicPermission(_ call: CAPPluginCall) {
        AVAudioSession.sharedInstance().requestRecordPermission { (granted: Bool) in
            call.resolve(["granted": granted])
        }
    }

    /// Experimental. Sent at app start and on every change of the switch; latched at the next
    /// first-line join so a live session never changes owner.
    @objc func setCallKitMode(_ call: CAPPluginCall) {
        let enabled: Bool = call.getBool("enabled") ?? false
        DispatchQueue.main.async {
            if self.callKitWanted != enabled {
                self.callKitWanted = enabled
                let when: String = self.calls.isEmpty
                    ? "vale na próxima linha"
                    : "vale ao sair de todas as linhas e entrar de novo"
                self.emitDiag("CALLKIT", enabled ? "botão do fone ligado" : "botão do fone desligado", when)
            }
            call.resolve()
        }
    }

    // MARK: - Interruptions (phone call, Siri, alarm, another app's audio)

    /// The user stays in every line during the interruption (heartbeats go on). When it ends,
    /// audio resumes with every mic closed, so nobody talks into the line by surprise.
    @objc private func audioInterruption(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        // Posted on an arbitrary thread; call state is main-only.
        DispatchQueue.main.async {
            self.handleInterruption(type)
        }
    }

    private func handleInterruption(_ type: AVAudioSession.InterruptionType) {
        if calls.isEmpty { return }
        // Before the switch: an ignored .began must not set interruptedWithoutEnd.
        if callKitMode && ProcessInfo.processInfo.systemUptime < callKitRestartUntil {
            emitDiag("INTERRUPÇÃO", type == .began ? "início" : "fim", "ignorada: nova chamada do botão do fone")
            return
        }
        switch type {
        case .began:
            interruptedWithoutEnd = true
            emitDiag("INTERRUPÇÃO", "áudio interrompido", "linhas mantidas")
        case .ended:
            resumeAfterInterruption()
        @unknown default:
            break
        }
    }

    /// Also run from appBecameActive when a .began never got its .ended.
    private func resumeAfterInterruption() {
        if callKitMode {
            // CallKit owns the activation: only make sure our call is back.
            reconcileCallKit()
        } else {
            reactivateHeldSession()
        }
        for callId in callOrder {
            calls[callId]?.setMicEnabled(false, source: "interrupção")
        }
        // After the mics closed, so the widget never shows an open mic out of "pausa".
        interruptedWithoutEnd = false
        emitDiag("INTERRUPÇÃO", "fim da interrupção", "áudio retomado, microfones fechados")
        playCue("start-connection-451")
        // The interruption paused the keep-alive loop too.
        updateKeepAlive()
    }

    /// WebRTC reactivates by itself when its count is > 0 (our hold). Through its wrapper
    /// so isActive and the audio unit restart agree, and balanced: no extra count stays.
    private func reactivateHeldSession() {
        let rtc: RTCAudioSession = RTCAudioSession.sharedInstance()
        if !holdsSession {
            // The join-time activation failed (e.g. during a phone call): take it now.
            holdSession()
        } else if !rtc.isActive {
            rtc.lockForConfiguration()
            do {
                // Our hold keeps the count >= 1, so this setActive(false) only gives back the
                // count the setActive(true) added; it never deactivates.
                try rtc.setActive(true)
                try rtc.setActive(false)
            } catch {
                emitDiag("INTERRUPÇÃO", "retomar áudio", "falhou: \(error.localizedDescription)")
            }
            rtc.unlockForConfiguration()
        }
    }

    /// Main queue. Catches an interruption that never ended and a session activation that
    /// failed at join (e.g. joined during a phone call).
    @objc private func appBecameActive(_ note: Notification) {
        if calls.isEmpty { return }
        if interruptedWithoutEnd {
            emitDiag("INTERRUPÇÃO", "app reaberto", "interrupção sem fim: retomando")
            resumeAfterInterruption()
        } else if callKitMode {
            reconcileCallKit()
        } else if !holdsSession {
            holdSession()
            if holdsSession {
                emitDiag("ÁUDIO", "ativar sessão", "ok (nova tentativa)")
            }
        }
    }

    // MARK: - Headset button (the only toggle on iOS: JS HeadsetButtonManager is inert there)

    @objc private func headsetButton(_ note: Notification) {
        DispatchQueue.main.async {
            self.toggleMicFromHeadset()
        }
    }

    /// One press toggles the mic of the last line whose mic was opened, else of the first
    /// line the user may talk on. `cueLater`: a CallKit press, whose session goes down and up.
    private func toggleMicFromHeadset(cueLater: Bool = false) {
        let now: TimeInterval = ProcessInfo.processInfo.systemUptime
        if now - lastHeadsetPress < 0.4 {
            emitDiag("FONE", "ignorado", "repetido")
            return
        }
        lastHeadsetPress = now
        guard let callId = headsetTarget(), let voiceCall = calls[callId] else {
            emitDiag("FONE", "ignorado", calls.isEmpty ? "sem linha" : "linha só ouvinte")
            return
        }
        let open: Bool = flipMic(callId, voiceCall, source: "fone", cueLater: cueLater)
        emitDiag("FONE", open ? "ligou" : "desligou", "linha \(voiceCall.lineId)")
    }

    /// Toggles one line's mic with its cue (reported to JS as micChanged `source`); returns
    /// whether it is now open. An opened line becomes the headset target.
    private func flipMic(_ callId: String, _ voiceCall: NativeVoiceCall, source: String, cueLater: Bool) -> Bool {
        let open: Bool = !voiceCall.micEnabled
        if open {
            // Before the change, so the snapshot it triggers already has the new headset line.
            lastMicCallId = callId
        }
        voiceCall.setMicEnabled(open, source: source)
        let cue: String = open ? "start-connection-451" : "stop-connection-451"
        if cueLater {
            pendingCue = cue
        } else {
            playCue(cue)
        }
        return open
    }

    // MARK: - Widget (main queue; contract for the lock-screen Live Activity)

    /// Every open line, the headset line first, then join order.
    func lineSnapshots() -> [LineSnapshot] {
        let headsetId: String? = headsetTarget()
        // A phone call ended our CallKit call (CallKit mode): lines kept, paused like an interruption.
        let paused: Bool = interruptedWithoutEnd || (callKitMode && otherCallPresent())
        var ids: [String] = callOrder
        if let first = headsetId, let index = ids.firstIndex(of: first) {
            ids.remove(at: index)
            ids.insert(first, at: 0)
        }
        return ids.compactMap { (id: String) -> LineSnapshot? in
            guard var line = calls[id]?.snapshot() else { return nil }
            line.isHeadsetLine = id == headsetId
            if paused {
                line.status = "pausa"
            }
            return line
        }
    }

    /// A widget Mic tap: like a headset press on that line (cue, headset target), reported to
    /// JS as micChanged "widget".
    func toggleMic(callId: String) {
        guard let voiceCall = calls[callId], voiceCall.canTalk else {
            emitDiag("WIDGET", "microfone", calls[callId] == nil ? "ignorado: linha fechada" : "ignorado: linha só ouvinte")
            return
        }
        let open: Bool = flipMic(callId, voiceCall, source: "widget", cueLater: false)
        emitDiag("WIDGET", open ? "microfone ligado" : "microfone desligado", "linha \(voiceCall.lineId)")
    }

    /// A widget Som tap: flips the line's output mute, reported to JS as outputChanged.
    func toggleOutput(callId: String) {
        guard let voiceCall = calls[callId] else {
            emitDiag("WIDGET", "som", "ignorado: linha fechada")
            return
        }
        let muted: Bool = !voiceCall.outputMuted
        voiceCall.setOutputMuted(muted, report: true)
        emitDiag("WIDGET", muted ? "som desligado" : "som ligado", "linha \(voiceCall.lineId)")
    }

    private func headsetTarget() -> String? {
        if let id = lastMicCallId, calls[id]?.canTalk == true {
            return id
        }
        return callOrder.first { (id: String) -> Bool in calls[id]?.canTalk == true }
    }

    // MARK: - Session activation (main queue)

    /// Takes the one activation for the open lines (idempotent). Non-mixable: from here on the
    /// app is the Now Playing app, so headset presses reach HeadsetButtonPlugin.
    private func holdSession() {
        releaseWork?.cancel()
        releaseWork = nil
        if holdsSession { return }
        let rtc: RTCAudioSession = RTCAudioSession.sharedInstance()
        rtc.lockForConfiguration()
        do {
            try rtc.setActive(true)
            holdsSession = true
        } catch {
            emitDiag("ÁUDIO", "ativar sessão", "falhou: \(error.localizedDescription)")
        }
        rtc.unlockForConfiguration()
        if holdsSession {
            emitDiag("ROTA", "reaplicar ao ativar sessão", AudioRoutePlugin.reapplyRoute())
        }
    }

    /// WebRTC's audio unit configures the session when it starts, after the reapply at
    /// activation, and the headset mic can fall back to the built-in one: assert the user's
    /// route again on every transition into "connected" and once more 0.5 s later. One-shot
    /// per transition (never from route-change notifications, so no loop).
    private func reassertRoute(lineId: String) {
        emitDiag("ROTA", "reaplicar ao conectar linha \(lineId)", AudioRoutePlugin.reapplyRoute())
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            guard let self = self, !self.calls.isEmpty else { return }
            self.emitDiag("ROTA", "reaplicar 0,5 s após conectar linha \(lineId)", AudioRoutePlugin.reapplyRoute())
        }
    }

    private func scheduleRelease(after delay: TimeInterval) {
        releaseWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            self?.releaseSession()
        }
        releaseWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    /// Last balanced setActive(false): RTCAudioSession deactivates with
    /// .notifyOthersOnDeactivation, so the user's music resumes.
    private func releaseSession() {
        releaseWork = nil
        if callKitMode {
            // Ending our call makes CallKit deactivate the session (didDeactivate).
            reconcileCallKit()
            return
        }
        guard holdsSession, calls.isEmpty else { return }
        holdsSession = false
        let rtc: RTCAudioSession = RTCAudioSession.sharedInstance()
        rtc.lockForConfiguration()
        do {
            try rtc.setActive(false)
        } catch {
            emitDiag("ÁUDIO", "liberar sessão", "falhou: \(error.localizedDescription)")
        }
        rtc.unlockForConfiguration()
    }

    // MARK: - Helpers (main queue)

    private func emitDiag(_ key: String, _ action: String, _ result: String) {
        notifyListeners("diag", data: ["key": key, "action": action, "result": result])
    }

    /// On while some line is connecting/reconnecting and none is connected; off otherwise.
    /// Its own player, so cues never cut it; the session hold keeps the session active meanwhile.
    private func updateKeepAlive() {
        let states: [String] = calls.values.map { (c: NativeVoiceCall) -> String in c.state }
        // CallKit mode: nothing plays before CallKit activates the session (see playCue).
        let audioUp: Bool = !callKitMode || callKitAudioActive
        let needed: Bool = audioUp && !states.contains("connected")
            && (states.contains("connecting") || states.contains("reconnecting"))
        if !needed {
            if let player = keepAlivePlayer {
                player.stop()
                keepAlivePlayer = nil
                emitDiag("RECONEXÃO", "manter app acordado", "som mudo desligado")
            }
            return
        }
        if let player = keepAlivePlayer {
            if !player.isPlaying {
                player.play()
            }
            return
        }
        guard let url = Bundle.main.url(forResource: "start-connection-451", withExtension: "wav") else {
            emitDiag("RECONEXÃO", "manter app acordado", "falhou: arquivo não encontrado")
            return
        }
        do {
            let player = try AVAudioPlayer(contentsOf: url)
            player.volume = 0
            player.numberOfLoops = -1
            player.prepareToPlay()
            player.play()
            keepAlivePlayer = player
            emitDiag("RECONEXÃO", "manter app acordado", "som mudo ligado")
        } catch {
            emitDiag("RECONEXÃO", "manter app acordado", "falhou: \(error.localizedDescription)")
        }
    }

    private func playCue(_ name: String) {
        if callKitMode && !callKitAudioActive {
            pendingCue = name
            return
        }
        guard let url = Bundle.main.url(forResource: name, withExtension: "wav") else {
            emitDiag("SOM", "tocar \(name)", "falhou: arquivo não encontrado")
            return
        }
        do {
            let player = try AVAudioPlayer(contentsOf: url)
            player.prepareToPlay()
            player.play()
            cuePlayer = player
        } catch {
            emitDiag("SOM", "tocar \(name)", "falhou: \(error.localizedDescription)")
        }
    }
}

// MARK: - CallKit mode (experimental; contract: setCallKitMode)

/// One CallKit call while lines are open, so a Bluetooth headset in HFP sends its button to
/// the app (iOS routes HFP call control only to a CallKit call). Standard WebRTC + CallKit:
/// CallKit activates the session and RTCAudioSession is told so (useManualAudio,
/// audioSessionDidActivate/Deactivate, isAudioEnabled). Delegate queue nil: main queue.
extension NativeVoicePlugin: CXProviderDelegate, CXCallObserverDelegate {

    private func beginCallKitMode() {
        callKitMode = true
        let rtc: RTCAudioSession = RTCAudioSession.sharedInstance()
        // The audio unit waits for CallKit's activation (provider didActivate).
        rtc.useManualAudio = true
        rtc.isAudioEnabled = false
        emitDiag("CALLKIT", "modo chamada do iPhone", "ativo nestas linhas")
    }

    /// One CallKit transaction at a time; every completion and CallKit event runs this again,
    /// so joins, leaves, presses and phone calls converge. Does nothing outside CallKit mode.
    private func reconcileCallKit() {
        guard callKitMode, !callKitBusy else { return }
        // After the last leave the call lasts until the stop cue played (releaseWork).
        let wanted: Bool = !calls.isEmpty || releaseWork != nil
        if wanted && callKitUUID == nil {
            // After a press the new call waits until the old one ended (callObserver / 1 s timer).
            if callKitWaitEnd == nil {
                startCallKitCall()
            }
        } else if !wanted, let uuid = callKitUUID {
            endCallKitCall(uuid)
        } else if !wanted && !callKitAudioActive {
            // Over: the next first-line join reads the switch again.
            callKitMode = false
            pendingCue = nil
            callKitWaitEnd = nil
            callKitRetries = 0
            RTCAudioSession.sharedInstance().useManualAudio = false
            emitDiag("CALLKIT", "modo chamada do iPhone", "encerrado")
        }
    }

    private func startCallKitCall() {
        if otherCallPresent() {
            // callObserver runs reconcileCallKit again when that call is over.
            emitDiag("CALLKIT", "iniciar chamada", "aguardando: outra chamada no iPhone")
            return
        }
        let provider: CXProvider = callKitProviderInstance()
        let uuid = UUID()
        let handle = CXHandle(type: .generic, value: "Intercom ac24horas")
        let transaction = CXTransaction(action: CXStartCallAction(call: uuid, handle: handle))
        callKitUUID = uuid
        callKitMine.insert(uuid)
        callKitBusy = true
        callKitController.request(transaction) { [weak self] (error: Error?) in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.callKitBusy = false
                if let error = error {
                    self.callKitMine.remove(uuid)
                    if self.callKitUUID == uuid {
                        self.callKitUUID = nil
                    }
                    self.emitDiag("CALLKIT", "iniciar chamada", "falhou: \(error.localizedDescription)")
                    if !self.calls.isEmpty && self.callKitRetries < 5
                        && NativeVoicePlugin.isTransientStartError(error) {
                        self.callKitRetries += 1
                        let now: TimeInterval = ProcessInfo.processInfo.systemUptime
                        if now < self.callKitRestartUntil {
                            // The press's interruption window covers the retries too.
                            self.callKitRestartUntil = max(self.callKitRestartUntil, now + 2)
                        }
                        self.emitDiag("CALLKIT", "tentar de novo \(self.callKitRetries)", "em 0,5 s")
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                            self?.reconcileCallKit()
                        }
                        return
                    }
                    // Out of retries (or a lasting error): lines must not stay silent, so back
                    // to the app's own activation until they are all closed.
                    if !self.calls.isEmpty {
                        self.fallBackFromCallKit()
                    }
                    return
                }
                self.callKitRetries = 0
                if self.callKitUUID == uuid {
                    provider.reportOutgoingCall(with: uuid, connectedAt: nil)
                    let update = CXCallUpdate()
                    // No "Hold & Accept": a phone call ends ours (see CXEndCallAction).
                    update.supportsHolding = false
                    update.supportsGrouping = false
                    update.supportsUngrouping = false
                    update.supportsDTMF = false
                    provider.reportCall(with: uuid, updated: update)
                    self.emitDiag("CALLKIT", "iniciar chamada", "ok")
                    // A press cue waits for didActivate; if iOS kept the session up, play it now.
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
                        guard let self = self, self.callKitAudioActive else { return }
                        self.flushPendingCue()
                    }
                }
                self.reconcileCallKit()
            }
        }
    }

    private func endCallKitCall(_ uuid: UUID) {
        callKitAppEnds.insert(uuid)
        callKitBusy = true
        let transaction = CXTransaction(action: CXEndCallAction(call: uuid))
        callKitController.request(transaction) { [weak self] (error: Error?) in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.callKitBusy = false
                // Forgotten even on error, so reconcile cannot loop on it.
                if self.callKitUUID == uuid {
                    self.callKitUUID = nil
                }
                if let error = error {
                    // The delegate never saw it: a later end of that call is not the app's.
                    self.callKitAppEnds.remove(uuid)
                    self.emitDiag("CALLKIT", "encerrar chamada", "falhou: \(error.localizedDescription)")
                } else {
                    self.emitDiag("CALLKIT", "encerrar chamada", "ok")
                }
                self.reconcileCallKit()
            }
        }
    }

    /// The CallKit call could not start with lines open: the app's own activation (today's
    /// path) until every line is closed.
    private func fallBackFromCallKit() {
        callKitMode = false
        RTCAudioSession.sharedInstance().useManualAudio = false
        holdSession()
        emitDiag("CALLKIT", "voltar ao áudio sem chamada do iPhone", holdsSession ? "ok" : "falhou")
        flushPendingCue()
        updateKeepAlive()
    }

    /// Start errors worth a retry: the old call still counted (maximumCallGroupsReached, 7)
    /// or CallKit's "unknown" (0).
    private static func isTransientStartError(_ error: Error) -> Bool {
        let ns: NSError = error as NSError
        guard ns.domain == CXErrorDomainRequestTransaction else { return false }
        return ns.code == CXErrorCodeRequestTransactionError.Code.maximumCallGroupsReached.rawValue
            || ns.code == CXErrorCodeRequestTransactionError.Code.unknown.rawValue
    }

    /// True when CallKit lists a live call that is not ours (a phone or other VoIP call).
    private func otherCallPresent() -> Bool {
        return callKitObserver.calls.contains { (c: CXCall) -> Bool in
            !c.hasEnded && !self.callKitMine.contains(c.uuid)
        }
    }

    private func callKitProviderInstance() -> CXProvider {
        if let existing = callKitProvider {
            return existing
        }
        // Name shown by iOS: CFBundleDisplayName ("Intercom ac24horas"); init(localizedName:)
        // is deprecated since iOS 14.
        let config = CXProviderConfiguration()
        config.supportsVideo = false
        config.maximumCallsPerCallGroup = 1
        config.maximumCallGroups = 1
        config.supportedHandleTypes = [.generic]
        config.includesCallsInRecents = false
        let provider = CXProvider(configuration: config)
        provider.setDelegate(self, queue: nil)
        callKitProvider = provider
        return provider
    }

    private func flushPendingCue() {
        guard let cue = pendingCue else { return }
        pendingCue = nil
        playCue(cue)
    }

    // MARK: CXCallObserverDelegate

    /// A phone call came or went: our call comes back once no other call is left.
    public func callObserver(_ callObserver: CXCallObserver, callChanged call: CXCall) {
        if call.hasEnded {
            callKitMine.remove(call.uuid)
            if call.uuid == callKitWaitEnd {
                callKitWaitEnd = nil
            }
        }
        reconcileCallKit()
        // A phone call came or went: "pausa" in lineSnapshots.
        onLinesChanged?()
    }

    // MARK: CXProviderDelegate

    public func providerDidReset(_ provider: CXProvider) {
        callKitUUID = nil
        callKitMine.removeAll()
        callKitAppEnds.removeAll()
        callKitBusy = false
        callKitWaitEnd = nil
        if callKitAudioActive {
            callKitAudioActive = false
            let rtc: RTCAudioSession = RTCAudioSession.sharedInstance()
            rtc.audioSessionDidDeactivate(AVAudioSession.sharedInstance())
            rtc.isAudioEnabled = false
        }
        emitDiag("CALLKIT", "CallKit reiniciado pelo iOS", calls.isEmpty ? "sem linhas" : "nova chamada")
        reconcileCallKit()
    }

    public func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: nil)
        action.fulfill()
    }

    public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        let uuid: UUID = action.callUUID
        if callKitAppEnds.remove(uuid) != nil || uuid != callKitUUID {
            // Asked by the app (last line left), or an older call of ours.
            if callKitUUID == uuid {
                callKitUUID = nil
            }
            action.fulfill()
            return
        }
        callKitUUID = nil
        if otherCallPresent() {
            // "End & Accept" of a phone call: the lines stay, mics closed; callObserver
            // brings our call back when the phone call is over.
            for callId in callOrder {
                calls[callId]?.setMicEnabled(false, source: "interrupção")
            }
            emitDiag("CALLKIT", "chamada encerrada por ligação", "linhas mantidas, microfones fechados")
            action.fulfill()
            return
        }
        // Not asked by the app: the headset button (HFP "hang up"). Failing it made the
        // headset drop the call link, so end it and start a fresh call once it has ended:
        // requesting it before failed with maximumCallGroupsReached (one call group).
        callKitRestartUntil = ProcessInfo.processInfo.systemUptime + 3
        callKitWaitEnd = uuid
        toggleMicFromHeadset(cueLater: true)
        action.fulfill()
        emitDiag("CALLKIT", "botão do fone (encerrar)", "nova chamada ao fim da anterior")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
            guard let self = self, self.callKitWaitEnd == uuid else { return }
            self.callKitWaitEnd = nil
            self.emitDiag("CALLKIT", "fim da chamada anterior", "sem aviso em 1 s: nova chamada")
            self.reconcileCallKit()
        }
    }

    public func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        // AirPods-style headsets ask for mute instead of hanging up: the same toggle.
        if !otherCallPresent() {
            emitDiag("CALLKIT", "botão do fone (mudo)", "alternar microfone")
            toggleMicFromHeadset()
        }
        action.fulfill()
    }

    public func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        let rtc: RTCAudioSession = RTCAudioSession.sharedInstance()
        rtc.audioSessionDidActivate(audioSession)
        rtc.isAudioEnabled = true
        callKitAudioActive = true
        emitDiag("CALLKIT", "sessão de áudio ativada", calls.isEmpty ? "sem linhas" : "áudio ligado")
        emitDiag("ROTA", "reaplicar ao ativar sessão (CallKit)", AudioRoutePlugin.reapplyRoute())
        flushPendingCue()
        updateKeepAlive()
    }

    public func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        let rtc: RTCAudioSession = RTCAudioSession.sharedInstance()
        rtc.audioSessionDidDeactivate(audioSession)
        rtc.isAudioEnabled = false
        callKitAudioActive = false
        emitDiag("CALLKIT", "sessão de áudio desativada", calls.isEmpty ? "ok" : "linhas mantidas")
        if !callKitMode && holdsSession {
            // Fell back while CallKit still had the session: take ours up again.
            reactivateHeldSession()
        }
        reconcileCallKit()
    }
}
