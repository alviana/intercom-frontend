import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

/// Lock screen + Dynamic Island for `IntercomLineActivityAttributes`.
/// 1 line → "H2" card; 2 lines → "M2"; more → first 2 + "+N linhas". iOS 16: same views, buttons are plain labels.
struct IntercomLineActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: IntercomLineActivityAttributes.self) { context in
            LineLockScreenView(state: context.state)
                .activityBackgroundTint(lineCardColor)
                .activitySystemActionForegroundColor(.white)
                .widgetURL(lineOpenURL)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.bottom) {
                    if let line = context.state.mainLine {
                        LineH2View(line: line, extraLines: context.state.hiddenLines + context.state.shownLines.count - 1)
                            .foregroundColor(.white)
                    }
                }
            } compactLeading: {
                Text(context.state.compactName)
                    .font(.system(size: 13, weight: .heavy))
                    .lineLimit(1)
                    .foregroundColor(.white)
            } compactTrailing: {
                if let line = context.state.mainLine, line.someoneTalking {
                    LineTalkerInitial(talker: line.talker)
                } else {
                    LineMicDot(open: context.state.mainLine?.micShownOpen ?? false)
                }
            } minimal: {
                LineMicDot(open: context.state.mainLine?.micShownOpen ?? false)
            }
            .widgetURL(lineOpenURL)
        }
    }
}

// MARK: - Lock screen

private struct LineLockScreenView: View {
    let state: IntercomLineActivityAttributes.ContentState

    var body: some View {
        // Lock-screen Live Activities are capped at ~160 pt tall; heights below keep H2 and M2 under it.
        VStack(alignment: .leading, spacing: 0) {
            if state.shownLines.count >= 2 {
                LineM2Row(line: state.shownLines[0], extraLines: state.hiddenLines)
                Rectangle()
                    .fill(lineBorderColor)
                    .frame(height: 1)
                    .padding(.vertical, 4)
                LineM2Row(line: state.shownLines[1], extraLines: 0)
            } else if let line = state.shownLines.first {
                LineH2View(line: line, extraLines: state.hiddenLines)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .foregroundColor(.white)
    }
}

/// One line: title row, who-is-talking row, Som | Microfone side by side.
private struct LineH2View: View {
    let line: IntercomLineActivityAttributes.Line
    let extraLines: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text(line.headerTitle(short: false))
                    .font(.system(size: 14, weight: .heavy))
                    .lineLimit(1)
                Spacer(minLength: 4)
                if extraLines > 0 {
                    LineMoreBadge(count: extraLines)
                }
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(lineSubtleColor)
            }
            LineWhoRow(line: line)
            HStack(spacing: 10) {
                LineControlButton(line: line, isMic: false, label: "Som", height: 58, stacked: true)
                LineControlButton(line: line, isMic: true, label: "Microfone", height: 58, stacked: true)
            }
        }
    }
}

private struct LineWhoRow: View {
    let line: IntercomLineActivityAttributes.Line

    var body: some View {
        HStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(line.someoneTalking ? lineGreenColor : lineGreyColor)
                Image(systemName: line.whoIcon)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(line.someoneTalking ? lineAvatarInkColor : Color.white)
            }
            .frame(width: 22, height: 22)
            Text(line.whoText)
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(line.someoneTalking ? Color.white : lineSubtleColor)
                .lineLimit(1)
            Spacer(minLength: 4)
            if line.someoneTalking {
                Image(systemName: "waveform")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(lineSubtleColor)
                Text("falando")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(lineSubtleColor)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(RoundedRectangle(cornerRadius: 12).fill(lineWhoBackgroundColor))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(lineBorderColor, lineWidth: 1))
    }
}

/// Two-line layout row: title + talker at the right, then Som | Mic ~46 pt.
private struct LineM2Row: View {
    let line: IntercomLineActivityAttributes.Line
    let extraLines: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 5) {
                Text(line.headerTitle(short: true))
                    .font(.system(size: 13, weight: .heavy))
                    .lineLimit(1)
                    .layoutPriority(1)
                Spacer(minLength: 4)
                if line.someoneTalking {
                    Image(systemName: "person.fill")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(lineGreenColor)
                }
                Text(line.whoText)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(line.someoneTalking ? lineTalkerInkColor : lineSubtleColor)
                    .lineLimit(1)
                if extraLines > 0 {
                    LineMoreBadge(count: extraLines)
                }
            }
            HStack(spacing: 8) {
                LineControlButton(line: line, isMic: false, label: "Som", height: 40, stacked: false)
                LineControlButton(line: line, isMic: true, label: "Mic", height: 40, stacked: false)
            }
        }
    }
}

// MARK: - Buttons

/// Som / Mic button. iOS 17+: toggles through a LiveActivityIntent; iOS 16 or disabled: plain label.
private struct LineControlButton: View {
    let line: IntercomLineActivityAttributes.Line
    let isMic: Bool
    let label: String
    let height: CGFloat
    let stacked: Bool

    private var isOn: Bool {
        isMic ? line.micShownOpen : !line.outputMuted
    }

    private var enabled: Bool {
        line.isOk && (!isMic || line.canTalk)
    }

    private var systemImage: String {
        if isMic {
            return isOn ? "mic.fill" : "mic.slash.fill"
        }
        return isOn ? "speaker.wave.2.fill" : "speaker.slash.fill"
    }

    private var accessibilityText: String {
        if isMic {
            return isOn ? "Microfone aberto" : "Microfone fechado"
        }
        return isOn ? "Som ligado" : "Som desligado"
    }

    @ViewBuilder
    var body: some View {
        if !enabled {
            face
        } else if #available(iOS 17.0, *) {
            if isMic {
                Button(intent: ToggleLineMicIntent(callId: line.callId)) {
                    face
                }
                .buttonStyle(.plain)
            } else {
                Button(intent: ToggleLineSoundIntent(callId: line.callId)) {
                    face
                }
                .buttonStyle(.plain)
            }
        } else {
            face
        }
    }

    private var face: some View {
        content
            .frame(maxWidth: .infinity, minHeight: height, maxHeight: height)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isMic && isOn ? lineMicOnBackgroundColor : lineButtonColor)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(isMic && isOn ? lineGreenColor : lineButtonBorderColor, lineWidth: 2)
            )
            .opacity(enabled ? 1 : 0.45)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(accessibilityText))
    }

    @ViewBuilder
    private var content: some View {
        if stacked {
            VStack(spacing: 3) {
                icon
                Text(label)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(lineButtonLabelColor)
            }
        } else {
            HStack(spacing: 6) {
                icon
                Text(label)
                    .font(.system(size: 15, weight: .heavy))
                    .foregroundColor(.white)
            }
        }
    }

    private var icon: some View {
        Image(systemName: systemImage)
            .font(.system(size: stacked ? 20 : 16, weight: .bold))
            .foregroundColor(isOn ? lineGreenColor : lineRedColor)
    }
}

// MARK: - Small pieces

private struct LineMoreBadge: View {
    let count: Int

    private var text: String {
        count == 1 ? "+1 linha" : "+\(count) linhas"
    }

    var body: some View {
        Text(text)
            .font(.system(size: 11, weight: .bold))
            .foregroundColor(lineAccentColor)
            .lineLimit(1)
            .fixedSize()
    }
}

private struct LineMicDot: View {
    let open: Bool

    var body: some View {
        Circle()
            .fill(open ? lineGreenColor : lineRedColor)
            .frame(width: 10, height: 10)
    }
}

private struct LineTalkerInitial: View {
    let talker: String

    var body: some View {
        ZStack {
            Circle()
                .fill(lineGreenColor)
            Text(String(talker.prefix(1)).uppercased())
                .font(.system(size: 11, weight: .heavy))
                .foregroundColor(lineAvatarInkColor)
        }
        .frame(width: 18, height: 18)
    }
}

// MARK: - State helpers

private extension IntercomLineActivityAttributes.ContentState {
    var shownLines: [IntercomLineActivityAttributes.Line] {
        Array(lines.prefix(2))
    }

    /// Lines behind "+N linhas" (also covers a state that carried more than 2 lines).
    var hiddenLines: Int {
        max(0, extraLines) + max(0, lines.count - 2)
    }

    /// The headset line (Dynamic Island content).
    var mainLine: IntercomLineActivityAttributes.Line? {
        lines.first(where: { $0.isHeadsetLine }) ?? lines.first
    }

    var compactName: String {
        guard let line = mainLine else { return "🎧" }
        return (line.isHeadsetLine ? "🎧 " : "") + String(line.shortName.prefix(10))
    }
}

private extension IntercomLineActivityAttributes.Line {
    var isOk: Bool {
        status == "ok"
    }

    var someoneTalking: Bool {
        isOk && !talker.isEmpty && talker != "Ninguém falando"
    }

    /// Never shows the mic open while the PC cannot hear it.
    var micShownOpen: Bool {
        micEnabled && canTalk && isOk
    }

    var statusText: String? {
        switch status {
        case "ok":
            return nil
        case "pausa":
            return "Em pausa"
        default:
            return "Reconectando…"
        }
    }

    var whoText: String {
        if let statusText = statusText {
            return statusText
        }
        if talker.isEmpty {
            return (canTalk && !isProgramLine) ? "" : "Só ouvir"
        }
        return talker
    }

    var whoIcon: String {
        switch status {
        case "ok":
            return "person.fill"
        case "pausa":
            return "pause.fill"
        default:
            return "arrow.triangle.2.circlepath"
        }
    }

    /// "LINHA" part of "PRODUÇÃO / LINHA".
    var shortName: String {
        title.components(separatedBy: " / ").last ?? title
    }

    func headerTitle(short: Bool) -> String {
        let name = short ? shortName : title
        return isHeadsetLine ? "🎧 " + name : name
    }
}

// MARK: - Style

private let lineOpenURL = URL(string: "intercom-control://open")!

private func lineColor(_ hex: UInt32) -> Color {
    Color(
        red: Double((hex >> 16) & 0xFF) / 255,
        green: Double((hex >> 8) & 0xFF) / 255,
        blue: Double(hex & 0xFF) / 255
    )
}

private let lineCardColor = lineColor(0x2B2D31)
private let lineBorderColor = lineColor(0x3D3F44)
private let lineButtonColor = lineColor(0x383B40)
private let lineButtonBorderColor = lineColor(0x6B6F76)
private let lineButtonLabelColor = lineColor(0xB6BAC0)
private let lineMicOnBackgroundColor = lineColor(0x24392C)
private let lineWhoBackgroundColor = lineColor(0x202225)
private let lineGreenColor = lineColor(0x5FD38A)
private let lineRedColor = lineColor(0xE5534B)
private let lineAccentColor = lineColor(0xFF5C4D)
private let lineSubtleColor = lineColor(0x9AA0A6)
private let lineGreyColor = lineColor(0x6B6F76)
private let lineTalkerInkColor = lineColor(0xCFD2D6)
private let lineAvatarInkColor = lineColor(0x112233)
