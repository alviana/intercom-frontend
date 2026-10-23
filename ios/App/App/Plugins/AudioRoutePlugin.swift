import Foundation
import AVFoundation
import UIKit
import Capacitor
import WebRTC

@objc(AudioRoutePlugin)
public class AudioRoutePlugin: CAPPlugin {

    /// Read-only use: setters go through `rtc` (see applyRoute).
    private let session = AVAudioSession.sharedInstance()
    private let rtc = RTCAudioSession.sharedInstance()
    /// For NativeVoicePlugin.holdSession (the plugin instance lives as long as the bridge).
    private static weak var current: AudioRoutePlugin?
    // Route and tone state: main queue only.
    private var toneNode: AVAudioPlayerNode?
    private var toneEngine: AVAudioEngine?
    /// Ends the test tone and gives back its session activation.
    private var toneEnd: DispatchWorkItem?
    private var toneHoldsSession: Bool = false
    private var preferredRoute: String = "speaker"
    /// Diagnostics: the last failure applying a route ("" after a success), sent in the payload.
    private var lastError: String = ""
    /// Diagnostics: the applyRoute step running when it threw (rota / categoria / entrada / saída).
    private var applyStep: String = ""
    /// Headset-mic reinforcement after route changes (see reinforceInput): the one pending
    /// check, the systemUptime of the attempts in the last minute, and the cap switch.
    private var reinforceWork: DispatchWorkItem?
    private var reinforceTimes: [TimeInterval] = []
    private var reinforceCapped: Bool = false

    /// Main queue, from NativeVoicePlugin.join: a new line lifts the reinforcement cap.
    static func resetReinforce() {
        current?.reinforceTimes = []
        current?.reinforceCapped = false
    }

    /// Main queue, right after NativeVoicePlugin activated the session for the first line and
    /// on every line connect: the preferred input and the output override only take on an
    /// active session, and WebRTC's audio unit reconfigures the session when it starts.
    /// Returns the outcome for NativeVoicePlugin's "diag" (pt-BR).
    @discardableResult
    static func reapplyRoute() -> String {
        guard let plugin = current else { return "erro: plugin de rota ausente" }
        let route: String = plugin.preferredRoute
        if !plugin.rtc.isActive {
            return "sessão inativa: nada pedido (\(route))"
        }
        // Preferred input / mic before this reapply: proves "set, then undone by WebRTC".
        let before: String = plugin.inputState()
        let outcome: String
        do {
            try plugin.applyRoute(route)
            plugin.lastError = ""
            let asked: String = plugin.session.preferredInput?.portName ?? "nenhum"
            // iOS moves to HFP asynchronously: the 0.5 s reapply line is the one to judge.
            let mic: String = plugin.session.currentRoute.inputs.first?.portName ?? "?"
            outcome = "ok: antes \(before) · \(route)→\(asked) · mic agora: \(mic)"
        } catch {
            plugin.lastError = "\(plugin.applyStep) \(route): \(error.localizedDescription)"
            outcome = "erro: antes \(before) · \(plugin.lastError)"
        }
        plugin.emitRoutes()
        return outcome
    }

    public override func load() {
        AudioRoutePlugin.current = self
        // Category only: the session is activated when the first line opens (NativeVoicePlugin),
        // so launching the app never stops the user's music.
        do {
            try applyRoute(preferredRoute)
        } catch {
            lastError = "\(preferredRoute): \(error.localizedDescription)"
            CAPLog.print("AudioRoutePlugin: failed to configure session: \(error)")
        }

        NotificationCenter.default.addObserver(
            self, selector: #selector(routeChanged(_:)),
            name: AVAudioSession.routeChangeNotification, object: nil
        )
        emitRoutes()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        stopToneInternal()
    }

    @objc private func routeChanged(_ note: Notification) {
        emitRoutes()
        // Posted on an arbitrary thread; route state is main-only.
        DispatchQueue.main.async {
            self.scheduleReinforce(after: 0.3)
        }
    }

    /// One pending check at a time: a burst of route changes gets a single trailing check.
    private func scheduleReinforce(after delay: TimeInterval) {
        if reinforceWork != nil { return }
        let work = DispatchWorkItem { [weak self] in
            self?.reinforceInput()
        }
        reinforceWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    /// iOS drops the headset mic (preferredInput back to nil, built-in mic in use) after our
    /// reapply while a line is open. Puts back ONLY the preferred input (no category, override
    /// or activation, so it cannot feed WebRTC's reconfiguration), at most once per second and
    /// 10 times per minute; past the cap it stops until setRoute or a new line.
    private func reinforceInput() {
        reinforceWork = nil
        let route: String = preferredRoute
        guard !reinforceCapped, rtc.isActive,
              route == "bluetooth" || route == "headset" || route.hasPrefix("device:"),
              let wanted = preferredInput(for: route), wanted.portType != .builtInMic else { return }
        let inUse: AVAudioSessionPortDescription? = session.currentRoute.inputs.first
        if inUse?.uid == wanted.uid && session.preferredInput != nil { return }
        let now: TimeInterval = ProcessInfo.processInfo.systemUptime
        reinforceTimes = reinforceTimes.filter { (t: TimeInterval) -> Bool in now - t < 60 }
        if let last = reinforceTimes.last, now - last < 1 {
            scheduleReinforce(after: 1 - (now - last))
            return
        }
        if reinforceTimes.count >= 10 {
            reinforceCapped = true
            NativeVoicePlugin.diag("ROTA", "reforço", "parado: 10 tentativas em 1 min (volta ao escolher a saída ou entrar em linha)")
            return
        }
        reinforceTimes.append(now)
        let before: String = inputState()
        let result: String
        rtc.lockForConfiguration()
        do {
            try rtc.setPreferredInput(wanted)
            // The input switch itself can land later (async): the next ROTA line shows it.
            result = "antes \(before) → depois \(inputState())"
        } catch {
            result = "erro: antes \(before) · \(error.localizedDescription)"
        }
        rtc.unlockForConfiguration()
        NativeVoicePlugin.diag("ROTA", "reforço", result)
    }

    /// "<preferred input|nenhum>/<input in use>" for the ROTA diagnostics.
    private func inputState() -> String {
        let preferred: String = session.preferredInput?.portName ?? "nenhum"
        let inUse: String = session.currentRoute.inputs.first?.portName ?? "?"
        return "\(preferred)/\(inUse)"
    }

    @objc func hasBluetoothPermission(_ call: CAPPluginCall) {
        // iOS handles Bluetooth via the audio-session permission set; no separate runtime grant
        call.resolve(["granted": true])
    }

    @objc func requestBluetoothPermission(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func getAvailableRoutes(_ call: CAPPluginCall) {
        call.resolve(buildRoutesPayload())
    }

    @objc func setRoute(_ call: CAPPluginCall) {
        guard let route = call.getString("route") else {
            call.reject("Missing 'route'")
            return
        }

        DispatchQueue.main.async {
            let previous = self.preferredRoute
            self.preferredRoute = route
            do {
                try self.applyRoute(route)
                self.lastError = ""
                // The user chose again: lift the reinforcement cap.
                self.reinforceTimes = []
                self.reinforceCapped = false
                call.resolve(["active": self.activeRouteId() as Any])
                self.emitRoutes()
            } catch {
                self.preferredRoute = previous
                let failed: String = "\(self.applyStep) \(route): \(error.localizedDescription)"
                // The category may already have changed before the failure: put the old route back.
                try? self.applyRoute(previous)
                self.lastError = failed
                call.reject("Failed to set route: \(error.localizedDescription)")
                self.emitRoutes()
            }
        }
    }

    @objc func playTestTone(_ call: CAPPluginCall) {
        let durationMs: Int = call.getInt("durationMs") ?? 5000
        let frequencyHz: Int = call.getInt("frequencyHz") ?? 440
        let requested: String? = call.getString("route")
        DispatchQueue.main.async {
            let route: String = requested ?? self.preferredRoute
            self.stopToneInternal()
            do {
                // One activation for the tone, given back by stopToneInternal.
                try self.setSessionActive(true)
                self.toneHoldsSession = true
                try self.applyRoute(route)
                self.preferredRoute = route
                self.startTone(durationMs: durationMs, frequencyHz: frequencyHz)
            } catch {
                self.stopToneInternal()
                call.reject("Failed to activate audio session: \(error.localizedDescription)")
                return
            }
            let end = DispatchWorkItem { [weak self] in
                self?.stopToneInternal()
            }
            self.toneEnd = end
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(durationMs) / 1000.0, execute: end)
            call.resolve()
        }
    }

    @objc func stopTestTone(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.stopToneInternal()
            call.resolve()
        }
    }

    // MARK: - Helpers

    private func builtInMicInput() -> AVAudioSessionPortDescription? {
        return session.availableInputs?.first { $0.portType == .builtInMic }
    }

    private func firstInput(ofTypes types: [AVAudioSession.Port]) -> AVAudioSessionPortDescription? {
        return session.availableInputs?.first { types.contains($0.portType) }
    }

    private func findInputById(_ id: String) -> AVAudioSessionPortDescription? {
        return session.availableInputs?.first { "device:\($0.uid)" == id }
    }

    private func buildRoutesPayload() -> [String: Any] {
        var routes: [[String: Any]] = []

        let inputs = session.availableInputs ?? []
        let currentOutputs = session.currentRoute.outputs
        let outputTypes = Set(currentOutputs.map { $0.portType })

        let hasBuiltInMic = inputs.contains { $0.portType == .builtInMic }
        let isPhone = UIDevice.current.userInterfaceIdiom == .phone
        let bluetoothInputs = inputs.filter {
            $0.portType == .bluetoothHFP || $0.portType == .bluetoothA2DP || $0.portType == .bluetoothLE
        }
        let headsetInputs = inputs.filter {
            $0.portType == .headsetMic || $0.portType == .headphones || $0.portType == .usbAudio || $0.portType == .lineIn
        }

        if hasBuiltInMic || isPhone {
            routes.append(routeObj(id: "earpiece", label: "Phone earpiece", available: true, type: "earpiece"))
        }
        routes.append(routeObj(id: "speaker", label: "Phone speaker", available: true, type: "speaker"))
        let firstHeadset = headsetInputs.first
        let firstBluetooth = bluetoothInputs.first
        if let h = firstHeadset {
            routes.append(routeObj(id: "headset", label: routeLabel(prefix: "Wired headset", port: h), available: true, type: "headset", name: h.portName))
        }
        if let b = firstBluetooth {
            routes.append(routeObj(id: "bluetooth", label: routeLabel(prefix: "Bluetooth audio", port: b), available: true, type: "bluetooth", name: b.portName))
        }
        // Also expose other specific devices so the JS layer can target by uid
        // (skipping the ones already listed above, which showed the same headset twice).
        for input in inputs {
            if input.uid == firstHeadset?.uid || input.uid == firstBluetooth?.uid { continue }
            let type = portTypeString(input.portType)
            guard type != nil else { continue }
            routes.append(routeObj(
                id: "device:\(input.uid)",
                label: routeLabel(prefix: portTypePrefix(input.portType), port: input),
                available: true,
                type: type!,
                name: input.portName
            ))
        }

        return [
            "routes": routes,
            "active": activeRouteId(outputTypes: outputTypes) as Any,
            // Diagnostics: the mic actually in use and whether Bluetooth mics are allowed now.
            "input": session.currentRoute.inputs.first?.portName ?? "",
            "hfp": session.categoryOptions.contains(.allowBluetoothHFP),
            // Why the mic is not the headset's: what was asked, what iOS offers, what failed.
            "preferred": preferredRoute,
            "preferredInput": session.preferredInput?.portName ?? "",
            "inputs": describePorts(inputs),
            "output": describePorts(currentOutputs),
            "lastError": lastError,
            "mode": session.mode.rawValue,
            "options": Int(session.categoryOptions.rawValue),
            "sampleRate": Int(session.sampleRate),
        ]
    }

    private func describePorts(_ ports: [AVAudioSessionPortDescription]) -> String {
        return ports.map { (port: AVAudioSessionPortDescription) -> String in
            "\(port.portName) (\(port.portType.rawValue))"
        }.joined(separator: ", ")
    }

    private func routeObj(id: String, label: String, available: Bool, type: String, name: String = "") -> [String: Any] {
        return ["id": id, "label": label, "available": available, "type": type, "name": name]
    }

    private func routeLabel(prefix: String, port: AVAudioSessionPortDescription) -> String {
        let name = port.portName.trimmingCharacters(in: .whitespaces)
        if name.isEmpty || name.compare(prefix, options: .caseInsensitive) == .orderedSame {
            return prefix
        }
        return "\(prefix): \(name)"
    }

    private func portTypeString(_ port: AVAudioSession.Port) -> String? {
        switch port {
        case .bluetoothHFP, .bluetoothA2DP, .bluetoothLE: return "bluetooth"
        case .builtInSpeaker: return "speaker"
        case .builtInMic, .builtInReceiver: return "earpiece"
        case .headsetMic, .headphones, .usbAudio, .lineIn: return "headset"
        default: return nil
        }
    }

    private func portTypePrefix(_ port: AVAudioSession.Port) -> String {
        switch portTypeString(port) {
        case "bluetooth": return "Bluetooth audio"
        case "speaker": return "Phone speaker"
        case "earpiece": return "Phone earpiece"
        case "headset": return "Wired headset"
        default: return "Audio output"
        }
    }

    private func activeRouteId(outputTypes: Set<AVAudioSession.Port>? = nil) -> String? {
        let outs = outputTypes ?? Set(session.currentRoute.outputs.map { $0.portType })
        if outs.contains(where: { $0 == .bluetoothHFP || $0 == .bluetoothA2DP || $0 == .bluetoothLE }) {
            return "bluetooth"
        }
        if outs.contains(.builtInSpeaker) { return "speaker" }
        if outs.contains(where: { $0 == .headphones || $0 == .headsetMic || $0 == .usbAudio || $0 == .lineIn }) {
            return "headset"
        }
        if outs.contains(.builtInReceiver) { return "earpiece" }
        return nil
    }

    private func emitRoutes() {
        notifyListeners("audioRouteChanged", data: buildRoutesPayload())
    }

    // A route is the whole headset: its mic and its output together. Session values from the
    // iOS native audio plan, the same ones WebRTC gets (NativeVoicePlugin.configureWebRTCAudio)
    // so its audio unit never reconfigures them. Not mixable: only a non-mixable session can
    // be the "Now Playing" app, which is what routes headset presses to HeadsetButtonPlugin.
    // Set through RTCAudioSession under its lock: WebRTC's audio unit takes the same lock when
    // it configures the session. Never activates: lines (NativeVoicePlugin) and the test tone
    // hold the activation, so the user's music is not stopped while no line is open.
    private func applyRoute(_ route: String) throws {
        applyStep = "rota"
        guard route.hasPrefix("device:") || ["speaker", "earpiece", "headset", "bluetooth"].contains(route) else {
            throw NSError(
                domain: "AudioRoutePlugin",
                code: 2,
                userInfo: [NSLocalizedDescriptionKey: "Unknown route: \(route)"]
            )
        }
        let speaker: Bool = route == "speaker"
        NativeVoicePlugin.configureWebRTCAudio(speaker: speaker)
        var options: AVAudioSession.CategoryOptions = [.allowBluetoothHFP]
        if speaker {
            options.insert(.defaultToSpeaker)
        }
        rtc.lockForConfiguration()
        defer { rtc.unlockForConfiguration() }
        applyStep = "categoria"
        try rtc.setCategory(.playAndRecord, mode: .voiceChat, options: options)
        // Preferred input and override only take on an active session; while none is open they
        // are applied by reapplyRoute when the first line activates it.
        if !rtc.isActive {
            return
        }
        // After the category: the inputs on offer (Bluetooth HFP) depend on it.
        applyStep = "entrada"
        guard let input = preferredInput(for: route) else {
            throw NSError(
                domain: "AudioRoutePlugin",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Route not available: \(route)"]
            )
        }
        try rtc.setPreferredInput(input)
        applyStep = "saída"
        try rtc.overrideOutputAudioPort(speaker ? AVAudioSession.PortOverride.speaker : .none)
    }

    /// The mic that goes with a route. Choosing an HFP/wired mic also moves the output there.
    private func preferredInput(for route: String) -> AVAudioSessionPortDescription? {
        if route.hasPrefix("device:") {
            return findInputById(route)
        }
        switch route {
        case "bluetooth":
            return firstInput(ofTypes: [.bluetoothHFP, .bluetoothLE])
        case "headset":
            return firstInput(ofTypes: [.headsetMic, .usbAudio, .lineIn]) ?? builtInMicInput()
        default:
            // speaker, earpiece
            return builtInMicInput()
        }
    }

    private func startTone(durationMs: Int, frequencyHz: Int) {
        let engine = AVAudioEngine()
        let player = AVAudioPlayerNode()
        engine.attach(player)

        let sampleRate: Double = 48000
        let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: sampleRate, channels: 1, interleaved: false)
        guard let format = format else { return }
        engine.connect(player, to: engine.mainMixerNode, format: format)

        let totalFrames = AVAudioFrameCount(Double(durationMs) * sampleRate / 1000.0)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: totalFrames) else { return }
        buffer.frameLength = totalFrames
        let channel = buffer.floatChannelData![0]
        let twoPiF = 2.0 * Double.pi * Double(frequencyHz)
        for i in 0..<Int(totalFrames) {
            channel[i] = Float(sin(twoPiF * Double(i) / sampleRate) * 0.12)
        }

        do {
            try engine.start()
            player.scheduleBuffer(buffer, completionHandler: nil)
            player.play()
            self.toneEngine = engine
            self.toneNode = player
        } catch {
            CAPLog.print("AudioRoutePlugin: failed to start tone engine: \(error)")
        }
    }

    /// Balanced activation through WebRTC's counter: the session is deactivated (notifying
    /// other apps) only by the last setActive(false).
    private func setSessionActive(_ active: Bool) throws {
        rtc.lockForConfiguration()
        defer { rtc.unlockForConfiguration() }
        try rtc.setActive(active)
    }

    fileprivate func stopToneInternal() {
        toneEnd?.cancel()
        toneEnd = nil
        toneNode?.stop()
        toneEngine?.stop()
        toneNode = nil
        toneEngine = nil
        if toneHoldsSession {
            toneHoldsSession = false
            do {
                try setSessionActive(false)
            } catch {
                CAPLog.print("AudioRoutePlugin: failed to release tone session: \(error)")
            }
        }
    }
}
