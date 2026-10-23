import Foundation
import AVFoundation
import UIKit
import Capacitor

@objc(AudioRoutePlugin)
public class AudioRoutePlugin: CAPPlugin {

    private let session = AVAudioSession.sharedInstance()
    private var toneNode: AVAudioPlayerNode?
    private var toneEngine: AVAudioEngine?
    private var preferredRoute: String = "speaker"

    public override func load() {
        do {
            try applyRoute(preferredRoute)
        } catch {
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

        do {
            try applyRoute(route)
            preferredRoute = route
            call.resolve(["active": activeRouteId() as Any])
            emitRoutes()
        } catch {
            call.reject("Failed to set route: \(error.localizedDescription)")
        }
    }

    @objc func playTestTone(_ call: CAPPluginCall) {
        let durationMs = call.getInt("durationMs") ?? 5000
        let frequencyHz = call.getInt("frequencyHz") ?? 440
        let route = call.getString("route") ?? preferredRoute
        stopToneInternal()
        do {
            try applyRoute(route)
            preferredRoute = route
            startTone(durationMs: durationMs, frequencyHz: frequencyHz)
        } catch {
            call.reject("Failed to activate audio session: \(error.localizedDescription)")
            return
        }
        call.resolve()
    }

    @objc func stopTestTone(_ call: CAPPluginCall) {
        stopToneInternal()
        call.resolve()
    }

    // MARK: - Helpers

    private func builtInMicInput() -> AVAudioSessionPortDescription? {
        return session.availableInputs?.first { $0.portType == .builtInMic }
    }

    private func firstInput(ofTypes types: [String]) -> AVAudioSessionPortDescription? {
        let want = Set(types)
        return session.availableInputs?.first { want.contains($0.portType.rawValue) }
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
            routes.append(routeObj(id: "headset", label: routeLabel(prefix: "Wired headset", port: h), available: true, type: "headset"))
        }
        if let b = firstBluetooth {
            routes.append(routeObj(id: "bluetooth", label: routeLabel(prefix: "Bluetooth audio", port: b), available: true, type: "bluetooth"))
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
                type: type!
            ))
        }

        return [
            "routes": routes,
            "active": activeRouteId(outputTypes: outputTypes) as Any,
        ]
    }

    private func routeObj(id: String, label: String, available: Bool, type: String) -> [String: Any] {
        return ["id": id, "label": label, "available": available, "type": type]
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

    private func configureAudioSession(defaultToSpeaker: Bool) throws {
        // HFP only: with A2DP allowed iOS could route a Bluetooth headset as media output with
        // the phone mic, and its button then became a media key the app never receives.
        // Not mixable: only a non-mixable session can be the "Now Playing" app, which is what
        // routes headset play/pause presses to HeadsetButtonPlugin.
        var options: AVAudioSession.CategoryOptions = [
            .allowBluetoothHFP,
        ]
        if defaultToSpeaker {
            options.insert(.defaultToSpeaker)
        }
        try session.setCategory(
            .playAndRecord,
            mode: .voiceChat,
            options: options
        )
    }

    private func applyRoute(_ route: String) throws {
        try configureAudioSession(defaultToSpeaker: route == "speaker")
        try session.setActive(true, options: [])

        if route.hasPrefix("device:") {
            if let input = findInputById(route) {
                try session.setPreferredInput(input)
                try session.overrideOutputAudioPort(.none)
                return
            }
            throw NSError(
                domain: "AudioRoutePlugin",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Unknown route: \(route)"]
            )
        }

        switch route {
        case "speaker":
            try session.setPreferredInput(builtInMicInput())
            try session.overrideOutputAudioPort(.speaker)
        case "earpiece":
            try session.setPreferredInput(builtInMicInput())
            try session.overrideOutputAudioPort(.none)
        case "headset":
            try session.setPreferredInput(firstInput(ofTypes: [
                AVAudioSession.Port.headsetMic.rawValue,
                AVAudioSession.Port.headphones.rawValue,
                AVAudioSession.Port.usbAudio.rawValue,
                AVAudioSession.Port.lineIn.rawValue,
            ]) ?? builtInMicInput())
            try session.overrideOutputAudioPort(.none)
        case "bluetooth":
            try session.setPreferredInput(firstInput(ofTypes: [
                AVAudioSession.Port.bluetoothHFP.rawValue,
                AVAudioSession.Port.bluetoothA2DP.rawValue,
                AVAudioSession.Port.bluetoothLE.rawValue,
            ]))
            try session.overrideOutputAudioPort(.none)
        default:
            throw NSError(
                domain: "AudioRoutePlugin",
                code: 2,
                userInfo: [NSLocalizedDescriptionKey: "Unknown route: \(route)"]
            )
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

    fileprivate func stopToneInternal() {
        toneNode?.stop()
        toneEngine?.stop()
        toneNode = nil
        toneEngine = nil
    }
}
