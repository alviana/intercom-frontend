import Foundation
import AVFoundation
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
    private var cuePlayer: AVAudioPlayer?

    public override func load() {
        NativeVoicePlugin.current = self
        // AudioRoutePlugin starts on the speaker route.
        NativeVoicePlugin.configureWebRTCAudio(speaker: true)
        NotificationCenter.default.addObserver(
            self, selector: #selector(audioInterruption(_:)),
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance()
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
            }
            voiceCall.diag = { [weak self] (key: String, action: String, result: String) in
                self?.emitDiag(key, action, result)
            }
            voiceCall.onConnected = { [weak self] in
                self?.playCue("start-connection-451")
            }
            self.calls[callId] = voiceCall
            self.callOrder.append(callId)
            voiceCall.start()
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
            emitDiag("INTERRUPÇÃO", "áudio interrompido", "linhas mantidas")
        case .ended:
            do {
                try AVAudioSession.sharedInstance().setActive(true)
            } catch {
                emitDiag("INTERRUPÇÃO", "retomar áudio", "falhou: \(error.localizedDescription)")
            }
            for callId in callOrder {
                calls[callId]?.setMicEnabled(false, source: "interrupção")
            }
            emitDiag("INTERRUPÇÃO", "fim da interrupção", "áudio retomado, microfones fechados")
            playCue("start-connection-451")
        @unknown default:
            break
        }
    }

    // MARK: - Helpers (main queue)

    private func emitDiag(_ key: String, _ action: String, _ result: String) {
        notifyListeners("diag", data: ["key": key, "action": action, "result": result])
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
