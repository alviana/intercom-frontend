import ActivityKit
import Foundation

/// Live Activity for the open lines (lock screen + Dynamic Island). Compiled into the App and the widget extension.
struct IntercomLineActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        /// At most 2 lines, headset line first.
        var lines: [Line]
        /// Open lines not shown ("+N linhas").
        var extraLines: Int
        var updatedAt: Date
    }

    /// Mirrors `LineSnapshot` (NativeVoiceCall.swift).
    struct Line: Codable, Hashable {
        var callId: String
        /// "PRODUÇÃO / LINHA" uppercased (just "LINHA" when there is no production name).
        var title: String
        var isHeadsetLine: Bool
        var canTalk: Bool
        var micEnabled: Bool
        var outputMuted: Bool
        /// "ok" | "reconectando" | "pausa"
        var status: String
        /// "Você" | name | "Alguém falando" | "Ninguém falando"; "" on a program line.
        var talker: String
        var isProgramLine: Bool
    }
}
