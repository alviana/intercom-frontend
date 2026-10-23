import Foundation
import AVFoundation
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

/// iOS: Android's call service contract. CallKit lives in NativeVoicePlugin (experimental
/// switch), so start/stop only report "not running"; the plugin keeps the sessions to leave
/// when the app is swiped away and the permission helpers.
@objc(CallServicePlugin)
public class CallServicePlugin: CAPPlugin {

    fileprivate static weak var sharedRef: CallServicePlugin?
    public static var shared: CallServicePlugin? { sharedRef }

    public override func load() {
        CallServicePlugin.sharedRef = self
    }

    @objc func start(_ call: CAPPluginCall) {
        call.resolve(["running": false])
    }

    @objc func stop(_ call: CAPPluginCall) {
        call.resolve(["running": false])
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
        call.resolve(["running": false])
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
}

/// Turns headset presses into `.intercomHeadsetButton` (NativeVoicePlugin toggles the mic from it)
/// and forwards them to JS as `headsetButton` events (diagnostics only on iOS).
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
