@preconcurrency import ActivityKit
import Foundation

/// The lock-screen Live Activity of the open lines (IntercomLineActivityAttributes), rendered
/// from NativeVoice's snapshots only, and the target of its buttons (LineIntentHandling).
/// Main queue, except the ActivityKit calls, which run one at a time (see `enqueue`).
final class LineActivityController: LineIntentHandling {

    private weak var plugin: NativeVoicePlugin?
    /// systemUptime of the last push: changes not made by the user are coalesced to >= 1 s apart.
    private var lastPush: TimeInterval = -Double.infinity
    private var pendingPush: DispatchWorkItem?
    /// Last ActivityKit call queued: an end never overtakes a later request or update.
    private var tail: Task<Void, Never>?
    /// Last WIDGET diag result, so a repeated failure is reported once.
    private var lastReport: String = ""

    /// NativeVoicePlugin.load(): no line is open yet.
    init(plugin: NativeVoicePlugin) {
        self.plugin = plugin
        plugin.onLinesChanged = { [weak self] in
            self?.linesChanged()
        }
        // Set at load, so a widget tap that cold-launches the app in the background finds it.
        LineIntentHandler.shared = self
        // An activity left by a killed process shows lines that no longer exist.
        enqueue {
            await LineActivityController.endAll()
        }
    }

    /// AppDelegate.applicationWillTerminate (main thread): ends the activity before the process
    /// dies, waiting 1 s at most. Detached: the main thread is blocked meanwhile.
    static func endAllOnTerminate() {
        let done = DispatchSemaphore(value: 0)
        Task.detached {
            await LineActivityController.endAll()
            done.signal()
        }
        _ = done.wait(timeout: .now() + 1)
    }

    // MARK: - LineIntentHandling (iOS 17 widget buttons; main actor)

    /// One tap = one native toggle; the activity is re-rendered from the resulting snapshot.
    func toggleMic(callId: String) {
        plugin?.toggleMic(callId: callId)
    }

    func toggleSound(callId: String) {
        plugin?.toggleOutput(callId: callId)
    }

    // MARK: - Updates (main queue)

    private func linesChanged() {
        if plugin?.linesChangeIsUserAction == true {
            // A widget tap or a headset press: pushed at once, on the next main-queue turn so
            // every part of the change (headset line, mic) goes in the one push.
            pendingPush?.cancel()
            schedulePush(after: 0)
        } else if pendingPush == nil {
            let now: TimeInterval = ProcessInfo.processInfo.systemUptime
            schedulePush(after: max(0, lastPush + 1 - now))
        }
    }

    private func schedulePush(after delay: TimeInterval) {
        let work = DispatchWorkItem { [weak self] in
            self?.push()
        }
        pendingPush = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    private func push() {
        pendingPush = nil
        lastPush = ProcessInfo.processInfo.systemUptime
        let snapshots: [LineSnapshot] = plugin?.lineSnapshots() ?? []
        if snapshots.isEmpty {
            // Last line left.
            enqueue {
                await LineActivityController.endAll()
            }
            report("encerrada")
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            report("desligada nos Ajustes do iPhone")
            return
        }
        let lines: [IntercomLineActivityAttributes.Line] = snapshots.prefix(2).map { (s: LineSnapshot) -> IntercomLineActivityAttributes.Line in
            return LineActivityController.line(s)
        }
        let state = IntercomLineActivityAttributes.ContentState(
            lines: lines,
            extraLines: max(0, snapshots.count - 2),
            updatedAt: Date()
        )
        enqueue {
            let result: String
            do {
                try await LineActivityController.show(state)
                result = "ativa"
            } catch {
                result = "falhou: \(error.localizedDescription)"
            }
            DispatchQueue.main.async { [weak self] in
                self?.report(result)
            }
        }
    }

    private func report(_ result: String) {
        if result == lastReport { return }
        lastReport = result
        NativeVoicePlugin.diag("WIDGET", "atividade ao vivo", result)
    }

    private func enqueue(_ operation: @escaping () async -> Void) {
        let previous: Task<Void, Never>? = tail
        tail = Task {
            await previous?.value
            await operation()
        }
    }

    // MARK: - ActivityKit (off the main queue, one call at a time)

    private static func show(_ state: IntercomLineActivityAttributes.ContentState) async throws {
        let live: [Activity<IntercomLineActivityAttributes>] = Activity<IntercomLineActivityAttributes>.activities.filter {
            (activity: Activity<IntercomLineActivityAttributes>) -> Bool in
            return activity.activityState == .active
        }
        if let current = live.first {
            for extra in live.dropFirst() {
                await extra.end(dismissalPolicy: .immediate)
            }
            if #available(iOS 16.2, *) {
                await current.update(ActivityContent(state: state, staleDate: nil))
            } else {
                await current.update(using: state)
            }
            return
        }
        // None yet, or the user dismissed it: a new one (fails while the app is in the background).
        if #available(iOS 16.2, *) {
            _ = try Activity<IntercomLineActivityAttributes>.request(
                attributes: IntercomLineActivityAttributes(),
                content: ActivityContent(state: state, staleDate: nil),
                pushType: nil
            )
        } else {
            _ = try Activity<IntercomLineActivityAttributes>.request(
                attributes: IntercomLineActivityAttributes(),
                contentState: state,
                pushType: nil
            )
        }
    }

    /// Every activity of this type (never the old IntercomOverlayAttributes one).
    private static func endAll() async {
        for activity in Activity<IntercomLineActivityAttributes>.activities {
            await activity.end(dismissalPolicy: .immediate)
        }
    }

    private static func line(_ s: LineSnapshot) -> IntercomLineActivityAttributes.Line {
        let title: String = s.productionName.isEmpty ? s.lineName : "\(s.productionName) / \(s.lineName)"
        return IntercomLineActivityAttributes.Line(
            callId: s.callId,
            title: title.uppercased(),
            isHeadsetLine: s.isHeadsetLine,
            canTalk: s.canTalk,
            micEnabled: s.micEnabled,
            outputMuted: s.outputMuted,
            status: s.status,
            talker: s.talker,
            isProgramLine: s.isProgramLine
        )
    }
}
