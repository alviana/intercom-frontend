import AppIntents
import Foundation

/// Implemented by the App (NativeVoice). Compiled into the App and the widget extension.
protocol LineIntentHandling: AnyObject {
    func toggleMic(callId: String)
    func toggleSound(callId: String)
}

enum LineIntentHandler {
    /// Set by the App target. LiveActivityIntents run in the app process; in the extension this stays nil.
    static var shared: LineIntentHandling?
}

@available(iOS 17.0, *)
struct ToggleLineMicIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Microfone da linha"

    @Parameter(title: "Linha")
    var callId: String

    init() {
        self.callId = ""
    }

    init(callId: String) {
        self.callId = callId
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        LineIntentHandler.shared?.toggleMic(callId: callId)
        return .result()
    }
}

@available(iOS 17.0, *)
struct ToggleLineSoundIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Som da linha"

    @Parameter(title: "Linha")
    var callId: String

    init() {
        self.callId = ""
    }

    init(callId: String) {
        self.callId = callId
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        LineIntentHandler.shared?.toggleSound(callId: callId)
        return .result()
    }
}
