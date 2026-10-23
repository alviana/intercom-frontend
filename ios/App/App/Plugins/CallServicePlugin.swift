import Foundation
import AVFoundation
import CallKit
import MediaPlayer
import UIKit
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
public class CallServicePlugin: CAPPlugin, CXCallObserverDelegate {

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
    // Bumped by releaseCall(); completions from an older epoch are ignored.
    private var epoch: Int = 0
    private let callWatcher = CXCallObserver()

    public override func load() {
        CallServicePlugin.sharedRef = self

        let config = CXProviderConfiguration()
        config.supportsVideo = false
        config.maximumCallsPerCallGroup = 1
        config.maximumCallGroups = 1
        config.supportedHandleTypes = [.generic]
        config.includesCallsInRecents = false
        provider = CXProvider(configuration: config)
        provider?.setDelegate(CallServiceDelegate.shared, queue: nil)
        callController = CXCallController()
        callWatcher.setDelegate(self, queue: nil)
    }

    // Main queue (delegate queue nil). When a phone call goes away, take our call back
    // or retry a start that failed during it; does nothing while one is still live.
    public func callObserver(_ callObserver: CXCallObserver, callChanged call: CXCall) {
        if transactionInFlight { return }
        if otherCallPresent(besides: activeCallUUID) { return }
        reconcile()
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

    private var leaveBaseUrl = ""
    private var leaveApiKey = ""
    private var leaveSessionIds: [String] = []

    @objc func setSessions(_ call: CAPPluginCall) {
        let baseUrl = call.getString("baseUrl") ?? ""
        let apiKey = call.getString("apiKey") ?? ""
        let ids = call.getArray("sessionIds", String.self) ?? []
        DispatchQueue.main.async {
            self.leaveBaseUrl = baseUrl
            self.leaveApiKey = apiKey
            self.leaveSessionIds = ids
        }
        call.resolve()
    }

    // Swiping the app away kills it without running JS: leave the sessions so the user does
    // not linger as a ghost in the line until the server times out.
    public func leaveSessionsOnTerminate() {
        var base = leaveBaseUrl
        guard !base.isEmpty, !leaveSessionIds.isEmpty else { return }
        if !base.hasSuffix("/") { base += "/" }
        let group = DispatchGroup()
        for id in leaveSessionIds {
            guard let encoded = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
                  let url = URL(string: base + "session/" + encoded) else { continue }
            var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 2)
            request.httpMethod = "DELETE"
            if !leaveApiKey.isEmpty {
                request.setValue("Bearer \(leaveApiKey)", forHTTPHeaderField: "Authorization")
            }
            group.enter()
            URLSession.shared.dataTask(with: request) { _, _, _ in group.leave() }.resume()
        }
        _ = group.wait(timeout: .now() + 2)
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
    fileprivate func otherCallPresent(besides uuid: UUID?) -> Bool {
        return callWatcher.calls.contains { (c: CXCall) -> Bool in
            c.uuid != uuid && !c.hasEnded
        }
    }

    /// True when CallKit asks to end a call we no longer want, or one that is not ours.
    fileprivate func isUnwantedCall(_ uuid: UUID) -> Bool {
        if !desiredRunning { return true }
        // activeCallUUID is nil while our own start is in flight; that call is not stray.
        if let active = activeCallUUID, active != uuid { return true }
        return false
    }

    fileprivate func forgetCall(_ uuid: UUID) {
        if uuid == activeCallUUID {
            running = false
            activeCallUUID = nil
        }
    }

    fileprivate func didReset() {
        // CallKit dropped every call; do not restart until JS calls start() again.
        desiredRunning = false
        releaseCall()
    }

    /// Our call is gone without the app asking; desiredRunning is kept so reconcile can bring it back.
    fileprivate func releaseCall() {
        epoch += 1
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
        guard let plugin = CallServicePlugin.shared else {
            action.fulfill()
            return
        }
        if plugin.endingByApp {
            plugin.endingByApp = false
            action.fulfill()
            return
        }
        if plugin.isUnwantedCall(action.callUUID) {
            // e.g. the WebView reloaded and JS never sent stop(): let the user hang it up.
            plugin.forgetCall(action.callUUID)
            action.fulfill()
            return
        }
        if plugin.otherCallPresent(besides: action.callUUID) {
            // "End & Accept" of a phone call: failing this would block the phone call.
            // Our call comes back in callObserver(_:callChanged:) when the phone call ends.
            plugin.releaseCall()
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

        // Headset presses only reach the "Now Playing" app: claim it with a live item.
        DispatchQueue.main.async {
            UIApplication.shared.beginReceivingRemoteControlEvents()
            MPNowPlayingInfoCenter.default().nowPlayingInfo = [
                MPMediaItemPropertyTitle: "Intercom ac24horas",
                MPNowPlayingInfoPropertyIsLiveStream: true,
                MPNowPlayingInfoPropertyPlaybackRate: 1.0,
            ]
        }
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
