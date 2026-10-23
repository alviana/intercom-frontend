import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

@main
struct IntercomLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        IntercomLiveActivityWidget()
        IntercomLineActivityWidget()
    }
}

struct IntercomLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: IntercomOverlayAttributes.self) { context in
            IntercomLiveActivityView(state: context.state)
                .activityBackgroundTint(Color(red: 0.07, green: 0.09, blue: 0.14))
                .activitySystemActionForegroundColor(.cyan)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    IntercomIslandMetric(
                        title: "Talk",
                        value: context.state.talkEnabledCount,
                        systemImage: "mic.fill"
                    )
                }
                DynamicIslandExpandedRegion(.trailing) {
                    IntercomIslandMetric(
                        title: "Listen",
                        value: context.state.listenEnabledCount,
                        systemImage: "speaker.wave.2.fill"
                    )
                }
                DynamicIslandExpandedRegion(.bottom) {
                    IntercomControlColumns(state: context.state, limit: 2)
                }
            } compactLeading: {
                Image(systemName: "headphones")
                    .foregroundStyle(.cyan)
            } compactTrailing: {
                Text("\(context.state.count)")
                    .font(.caption2.monospacedDigit().bold())
                    .foregroundStyle(.cyan)
            } minimal: {
                Image(systemName: "headphones")
                    .foregroundStyle(.cyan)
            }
            .widgetURL(overlayActionURL(action: "open", index: nil))
        }
    }
}

private struct IntercomLiveActivityView: View {
    let state: IntercomOverlayAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: "headphones")
                    .foregroundStyle(.cyan)
                Text("Intercom")
                    .font(.headline)
                Spacer()
                Text("\(state.count)")
                    .font(.headline.monospacedDigit())
                    .foregroundStyle(.cyan)
            }
            IntercomControlColumns(state: state, limit: 3)
        }
        .padding(12)
        .foregroundStyle(.white)
    }
}

private struct IntercomControlColumns: View {
    let state: IntercomOverlayAttributes.ContentState
    let limit: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .top, spacing: 6) {
                ForEach(Array(state.rows.prefix(limit).enumerated()), id: \.offset) { _, row in
                    IntercomCallTile(row: row)
                        .frame(maxWidth: .infinity)
                }
            }
            if state.count > limit {
                Text("+\(state.count - limit) more")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

private struct IntercomCallTile: View {
    let row: IntercomRow

    var body: some View {
        VStack(spacing: 2) {
            HStack(spacing: 5) {
                Text(row.label)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(Color.black)
                IntercomActivityMeter(active: row.active)
            }
            .frame(maxWidth: .infinity, minHeight: 26)
            .padding(.horizontal, 6)
            .background(intercomHeaderColor(row.index))

            IntercomActionLink(
                action: "listen",
                index: row.index,
                systemImage: row.listening ? "speaker.wave.2.fill" : "speaker.slash.fill",
                enabled: row.canListen,
                active: row.listening,
                activeColor: intercomListenColor,
                height: 36,
                label: row.listening ? "Mute speaker" : "Unmute speaker"
            )

            IntercomActionLink(
                action: "talk_latch",
                index: row.index,
                systemImage: row.talking ? "mic.fill" : "mic.slash.fill",
                enabled: row.canTalk,
                active: row.talking,
                activeColor: intercomTalkColor,
                height: 44,
                label: row.talking ? "Mute microphone" : "Unmute microphone"
            )
        }
        .accessibilityElement(children: .contain)
    }
}

private struct IntercomActionLink: View {
    let action: String
    let index: Int
    let systemImage: String
    let enabled: Bool
    let active: Bool
    let activeColor: Color
    let height: CGFloat
    let label: String

    @ViewBuilder
    var body: some View {
        if !enabled {
            actionLabel
                .accessibilityLabel(Text(label))
        } else if #available(iOSApplicationExtension 17.0, *) {
            Toggle(isOn: active, intent: IntercomOverlayToggleIntent(action: action, index: index)) {
                EmptyView()
            }
            .toggleStyle(
                IntercomActionToggleStyle(
                    activeSystemImage: activeSystemImage,
                    inactiveSystemImage: inactiveSystemImage,
                    activeColor: activeColor,
                    height: height
                )
            )
            .accessibilityLabel(Text(label))
        } else {
            Link(destination: overlayActionURL(action: action, index: index)) {
                actionLabel
            }
            .accessibilityLabel(Text(label))
        }
    }

    private var activeSystemImage: String {
        switch action {
        case "listen":
            return "speaker.wave.2.fill"
        case "talk_latch":
            return "mic.fill"
        default:
            return systemImage
        }
    }

    private var inactiveSystemImage: String {
        switch action {
        case "listen":
            return "speaker.slash.fill"
        case "talk_latch":
            return "mic.slash.fill"
        default:
            return systemImage
        }
    }

    private var actionLabel: some View {
        Image(systemName: systemImage)
            .font(.system(size: 17, weight: .bold))
            .frame(maxWidth: .infinity, minHeight: height)
            .foregroundStyle(enabled ? (active ? activeColor : intercomOffColor) : intercomDisabledColor)
            .background(
                RoundedRectangle(cornerRadius: 4)
                    .fill(intercomRowColor)
            )
            .opacity(enabled ? 1 : 0.45)
    }
}

private struct IntercomActionToggleStyle: ToggleStyle {
    let activeSystemImage: String
    let inactiveSystemImage: String
    let activeColor: Color
    let height: CGFloat

    func makeBody(configuration: Configuration) -> some View {
        Image(systemName: configuration.isOn ? activeSystemImage : inactiveSystemImage)
            .font(.system(size: 17, weight: .bold))
            .frame(maxWidth: .infinity, minHeight: height)
            .foregroundStyle(configuration.isOn ? activeColor : intercomOffColor)
            .background(
                RoundedRectangle(cornerRadius: 4)
                    .fill(intercomRowColor)
            )
            .contentShape(Rectangle())
            .onTapGesture {
                configuration.isOn.toggle()
            }
            .animation(.easeOut(duration: 0.08), value: configuration.isOn)
    }
}

private struct IntercomActivityMeter: View {
    let active: Bool

    var body: some View {
        HStack(alignment: .bottom, spacing: 2) {
            ForEach(0..<3, id: \.self) { index in
                RoundedRectangle(cornerRadius: 1)
                    .fill(active ? intercomMeterActiveColor : intercomMeterInactiveColor)
                    .frame(width: 3, height: CGFloat(6 + (index * 4)))
                    .opacity(active ? 1 : 0.45)
            }
        }
        .frame(height: 18)
    }
}

private struct IntercomIslandMetric: View {
    let title: String
    let value: Int
    let systemImage: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Image(systemName: systemImage)
                .foregroundStyle(.cyan)
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text("\(value)")
                .font(.caption.monospacedDigit().bold())
        }
    }
}

private let intercomRowColor = Color(red: 0.16, green: 0.16, blue: 0.16)
private let intercomTalkColor = Color(red: 0.26, green: 0.63, blue: 0.28)
private let intercomListenColor = Color(red: 0.00, green: 0.74, blue: 0.83)
private let intercomOffColor = Color(red: 0.90, green: 0.22, blue: 0.21)
private let intercomDisabledColor = Color(red: 0.90, green: 0.22, blue: 0.21)
private let intercomMeterActiveColor = Color(red: 0.70, green: 1.00, blue: 0.35)
private let intercomMeterInactiveColor = Color.white.opacity(0.22)

private func intercomHeaderColor(_ index: Int) -> Color {
    let colors = [
        Color(red: 0.00, green: 0.54, blue: 0.48),
        Color(red: 0.49, green: 0.70, blue: 0.26),
        Color(red: 0.26, green: 0.65, blue: 0.96),
        Color(red: 0.94, green: 0.33, blue: 0.31),
        Color(red: 0.67, green: 0.28, blue: 0.74),
        Color(red: 1.00, green: 0.44, blue: 0.26),
    ]
    return colors[index % colors.count]
}

private struct IntercomRow: Hashable {
    let index: Int
    let label: String
    let talking: Bool
    let listening: Bool
    let canTalk: Bool
    let canListen: Bool
    let active: Bool
}

@available(iOS 16.1, *)
private extension IntercomOverlayAttributes.ContentState {
    var rows: [IntercomRow] {
        let total = max(0, count)
        return (0..<total).map { index in
            IntercomRow(
                index: index,
                label: value(labels, at: index) ?? "Call \(index + 1)",
                talking: value(latch, at: index) ?? false,
                listening: value(listen, at: index) ?? true,
                canTalk: value(micAllowed, at: index) ?? true,
                canListen: value(listenAllowed, at: index) ?? true,
                active: value(activity, at: index) ?? false
            )
        }
    }

    var talkEnabledCount: Int {
        rows.filter { $0.talking && $0.canTalk }.count
    }

    var listenEnabledCount: Int {
        rows.filter { $0.listening && $0.canListen }.count
    }

    func value<T>(_ values: [T], at index: Int) -> T? {
        guard index >= 0 && index < values.count else { return nil }
        return values[index]
    }
}

private func overlayActionURL(action: String, index: Int?) -> URL {
    var components = URLComponents()
    components.scheme = "intercom-control"
    components.host = "overlay-action"
    var items = [URLQueryItem(name: "action", value: action)]
    if let index {
        items.append(URLQueryItem(name: "index", value: String(index)))
    }
    components.queryItems = items
    return components.url ?? URL(string: "intercom-control://overlay-action")!
}
