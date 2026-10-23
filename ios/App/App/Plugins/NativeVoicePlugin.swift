import Foundation
import AVFoundation
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
    /// Last line whose mic was opened: the headset toggle's target.
    private(set) var lastMicCallId: String?
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
    private var interruptedWithoutEnd: Bool = false

    public override func load() {
        NativeVoicePlugin.current = self
        // AudioRoutePlugin starts on the speaker route.
        NativeVoicePlugin.configureWebRTCAudio(speaker: true)
        NotificationCenter.default.addObserver(
            self, selector: #selector(audioInterruption(_:)),
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance()
        )
        // Posted by HeadsetButtonPlugin (remote commands) and the CallKit delegate.
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
            AudioRoutePlugin.resetReinforce()
            self.holdSession()
            self.calls[callId] = voiceCall
            self.callOrder.append(callId)
            voiceCall.start()
            // The initial "connecting" is not emitted as a transition.
            self.updateKeepAlive()
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
        interruptedWithoutEnd = false
        // WebRTC reactivates by itself when its count is > 0 (our hold). Through its wrapper
        // so isActive and the audio unit restart agree, and balanced: no extra count stays.
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
        for callId in callOrder {
            calls[callId]?.setMicEnabled(false, source: "interrupção")
        }
        emitDiag("INTERRUPÇÃO", "fim da interrupção", "áudio retomado, microfones fechados")
        playCue("start-connection-451")
        // The interruption paused the keep-alive loop too.
        updateKeepAlive()
    }

    /// Main queue. Catches an interruption that never ended and a session activation that
    /// failed at join (e.g. joined during a phone call).
    @objc private func appBecameActive(_ note: Notification) {
        if calls.isEmpty { return }
        if interruptedWithoutEnd {
            emitDiag("INTERRUPÇÃO", "app reaberto", "interrupção sem fim: retomando")
            resumeAfterInterruption()
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
    /// line the user may talk on.
    private func toggleMicFromHeadset() {
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
        let open: Bool = !voiceCall.micEnabled
        voiceCall.setMicEnabled(open, source: "fone")
        if open {
            lastMicCallId = callId
        }
        playCue(open ? "start-connection-451" : "stop-connection-451")
        emitDiag("FONE", open ? "ligou" : "desligou", "linha \(voiceCall.lineId)")
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
        let needed: Bool = !states.contains("connected")
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
