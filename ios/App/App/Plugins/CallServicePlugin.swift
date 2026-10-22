import Foundation
import AVFoundation
import CallKit
import MediaPlayer
import UserNotifications
import Capacitor

extension Notification.Name {
    /// userInfo: ["key": String, "action": String, "source": String]
    static let intercomHeadsetButton = Notification.Name("intercomHeadsetButton")
}

fileprivate func postHeadsetButton(key: String, source: String) {
    let info: [String: Any] = ["key": key, "action": "down", "source": source]
    NotificationCenter.default.post(name: .intercomHeadsetButton, object: nil, userInfo: info)
}

@objc(CallServicePlugin)
public class CallServicePlugin: CAPPlugin {

    fileprivate static weak var sharedRef: CallServicePlugin?
    public static var shared: CallServicePlugin? { sharedRef }

    private var provider: CXProvider?
    private var callController: CXCallController?
    // All state below is only touched on the main queue.
    private var activeCallUUID: UUID?
    private var running: Bool = false
    private var desiredRunning: Bool = false
    private var transactionInFlight: Bool = false
    fileprivate var endingByApp: Bool = false
    // Bumped by didReset(); completions from an older epoch are ignored.
    private var epoch: Int = 0
    private let callObserver = CXCallObserver()

    public override func load() {
        CallServicePlugin.sharedRef = self

        let config = CXProviderConfiguration()
        config.supportsVideo = false
        config.maximumCallsPerCallGroup = 1
        config.maximumCallGroups = 1
        config.supportedHandleTypes = [.generic]
        provider = CXProvider(configuration: config)
        provider?.setDelegate(CallServiceDelegate.shared, queue: nil)
        callController = CXCallController()
    }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.startInternal()
            call.resolve(["running": self.running])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.stopInternal()
            call.resolve(["running": self.running])
        }
    }

    @objc func isRunning(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["running": self.running])
        }
    }

    @objc func hasNotificationPermission(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let granted = settings.authorizationStatus == .authorized
                || settings.authorizationStatus == .provisional
                || settings.authorizationStatus == .ephemeral
            call.resolve(["granted": granted])
        }
    }

    @objc func hasRecordAudioPermission(_ call: CAPPluginCall) {
        let status = AVAudioSession.sharedInstance().recordPermission
        call.resolve(["granted": status == .granted])
    }

    @objc func requestNotificationPermission(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in
            call.resolve()
        }
    }

    // MARK: - Internal (main queue only)

    func startInternal() {
        desiredRunning = true
        reconcile()
    }

    func stopInternal() {
        desiredRunning = false
        reconcile()
    }

    /// Issues at most one CallKit transaction at a time; each completion re-runs this,
    /// so fast join/leave sequences converge to `desiredRunning`.
    private func reconcile() {
        if transactionInFlight { return }
        if desiredRunning && !running {
            requestStart()
        } else if !desiredRunning && running {
            requestEnd()
        }
    }

    private func requestStart() {
        guard let controller = callController else { return }
        let uuid = UUID()
        let handle = CXHandle(type: .generic, value: "Intercom ac24horas")
        let action = CXStartCallAction(call: uuid, handle: handle)
        let transaction = CXTransaction(action: action)
        transactionInFlight = true
        let e = epoch
        controller.request(transaction) { (error: Error?) in
            DispatchQueue.main.async {
                guard e == self.epoch else { return }
                self.transactionInFlight = false
                if let error = error {
                    // No retry here (would loop); the next start() tries again.
                    CAPLog.print("CallServicePlugin: failed to start CallKit call: \(error)")
                    return
                }
                self.provider?.reportOutgoingCall(with: uuid, connectedAt: nil)
                self.activeCallUUID = uuid
                self.running = true
                self.reconcile()
            }
        }
    }

    private func requestEnd() {
        guard let controller = callController, let uuid = activeCallUUID else {
            running = false
            activeCallUUID = nil
            return
        }
        let action = CXEndCallAction(call: uuid)
        let transaction = CXTransaction(action: action)
        endingByApp = true
        transactionInFlight = true
        let e = epoch
        controller.request(transaction) { (error: Error?) in
            DispatchQueue.main.async {
                guard e == self.epoch else { return }
                self.transactionInFlight = false
                if let error = error {
                    // The delegate never saw this end, so the flag must not leak to the next
                    // EarPods press. State is cleared anyway so reconcile cannot loop on it.
                    self.endingByApp = false
                    CAPLog.print("CallServicePlugin: failed to end CallKit call: \(error)")
                }
                self.activeCallUUID = nil
                self.running = false
                self.reconcile()
            }
        }
    }

    /// True when CallKit knows a live call other than `uuid` (e.g. an incoming phone call).
    fileprivate func otherCallPresent(besides uuid: UUID) -> Bool {
        return callObserver.calls.contains { (c: CXCall) -> Bool in
            c.uuid != uuid && !c.hasEnded
        }
    }

    fileprivate func didReset() {
        // CallKit dropped our call; do not restart until JS calls start() again.
        epoch += 1
        desiredRunning = false
        running = false
        activeCallUUID = nil
        transactionInFlight = false
        endingByApp = false
    }
}

private class CallServiceDelegate: NSObject, CXProviderDelegate {
    static let shared = CallServiceDelegate()

    // Delegate queue is nil, so every callback below arrives on the main queue.

    func providerDidReset(_ provider: CXProvider) {
        CallServicePlugin.shared?.didReset()
    }

    func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: nil)
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        if let plugin = CallServicePlugin.shared, plugin.endingByApp {
            plugin.endingByApp = false
            action.fulfill()
            return
        }
        if let plugin = CallServicePlugin.shared, plugin.otherCallPresent(besides: action.callUUID) {
            // "End & Accept" of a phone call: failing this would block the phone call.
            plugin.didReset()
            action.fulfill()
            return
        }
        // Not requested by the app: an EarPods centre press during a CallKit call is a
        // hang-up. Treat it as a headset tap and keep the call; leaving is done with
        // "Sair da linha".
        postHeadsetButton(key: "CALLKIT_END", source: "callkit")
        action.fail()
    }

    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        // Mic state lives in JS; the audio session is left untouched.
        postHeadsetButton(key: "CALLKIT_MUTE", source: "callkit")
        action.fulfill()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        // System has activated the audio session; nothing to do — AudioRoutePlugin
        // already configured the category at app load.
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
    }
}

@objc(HeadsetButtonPlugin)
public class HeadsetButtonPlugin: CAPPlugin {

    private var commandTargets: [(MPRemoteCommand, Any)] = []

    public override func load() {
        NotificationCenter.default.addObserver(
            self, selector: #selector(headsetButton(_:)),
            name: .intercomHeadsetButton, object: nil
        )

        let center = MPRemoteCommandCenter.shared()
        addCommand(center.togglePlayPauseCommand, key: "MEDIA_PLAY_PAUSE")
        addCommand(center.playCommand, key: "MEDIA_PLAY")
        addCommand(center.pauseCommand, key: "MEDIA_PAUSE")
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        for (command, target) in commandTargets {
            command.removeTarget(target)
        }
    }

    private func addCommand(_ command: MPRemoteCommand, key: String) {
        command.isEnabled = true
        let target = command.addTarget { (_: MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus in
            postHeadsetButton(key: key, source: "remote_command")
            return .success
        }
        commandTargets.append((command, target))
    }

    @objc private func headsetButton(_ note: Notification) {
        guard let info = note.userInfo as? [String: Any] else { return }
        notifyListeners("headsetButton", data: info)
    }
}
