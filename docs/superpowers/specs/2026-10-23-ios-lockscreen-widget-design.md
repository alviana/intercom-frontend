# iOS lock-screen widget (Live Activity) — design

Status: for owner approval (2026-10-23), builder-checked.

## Intent and why

The crew uses the iPhone locked in a pocket as an intercom. When they glance at the lock
screen they must, in about two seconds and with big fingers, see who is talking and control
each line's sound and microphone, and get into the app. The old widget (OverlayBubble Live
Activity) was disabled in v1 because its mic state went stale (it was fed by the WebView). Call
audio is now native (`NativeVoice`), so a widget fed directly by the native state can be always
right. Owner's goal: "mais nativo, mais bonito, moderno e funcional", visually continuous with
the app's line card.

## Goals

1. Lock screen (Live Activity) + Dynamic Island, shown while the user is in ≥ 1 line; gone
   after leaving the last line.
2. Shows **all open lines** (usually one; sometimes work line + "Áudio programa").
3. Per line: line name (production / line, uppercase like the app card), **who is talking**
   (participant name + live activity indicator; "Ninguém falando" otherwise), **Som** toggle
   (line output on/off) and **Microfone** toggle (latched mic on/off), both big buttons side by
   side — layout "H2" chosen by the owner (same order as the app's line card: Som | Microfone).
4. Tapping the line title opens the app.
5. Always correct state: the widget reflects native truth (mic/som/talking), including changes
   made by the headset button, the in-app screen, remote mute, interruptions, reconnects.
6. Big touch targets (owner: "muitas pessoas têm dedo grande").

## Non-goals

- **No push-to-talk in the widget** (owner's decision): iOS widgets only accept taps, never
  press-and-hold; a real walkie-talkie PTT stays in the app and on the wired-headset button.
- No volume control in the widget (physical buttons are enough).
- No home-screen widget / Control Center control now.
- Android unchanged (it has its own floating bubble).

## Future features (recorded, not in this work)

- "Modo rádio": a full-screen in-app PTT screen (hold to talk), optimized for quick use.
- Apple's system Push-to-Talk framework (lock-screen walkie-talkie) — needs a paid Apple
  developer account; must first verify it supports hold-to-talk.

## Anti-goals

- Widget state that disagrees with what the PC hears (e.g. shows mic closed while it is open).
- Buttons too small or too close to hit with a thumb.
- Breaking the native audio: background audio, headset button, BT mic, swipe-away leave.
- Leaving a Live Activity on screen after the user left the lines or the app was killed.

## Constraints

- Existing target `IntercomLiveActivity` (WidgetKit extension, bundle
  `br.com.ac24horas.intercom.LiveActivityExtension`) — signed and shown on the owner's
  iPhone before, so the free Apple ID can sign it. Deployment target iOS 16.1; interactive
  buttons in Live Activities need iOS 17 (App Intents) — on 16.x show the widget read-only.
- Xcode 27 / iOS 26 SDK, Swift 5, no Swift compiler on the dev machine (compile-read reviews
  before every owner build). New files need hand-written `project.pbxproj` entries.
- Native source of truth: `NativeVoicePlugin` / `NativeVoiceCall` (per call: lineId, state,
  micEnabled, output muted, activity, dominant speaker endpoint). Widget buttons must act on the
  native call directly (App Intent → app process → NativeVoice), not via the WebView, and the
  JS UI must update via the existing native events (`micChanged` etc.).
- Participant names: today they come from JS line polling (every 1 s) which stops while the
  WebView is suspended (locked). The dominant speaker arrives natively as an endpoint id.
- Visual: the app's line card (dark card `#2b2d31`, border `#3d3f44`, rounded buttons with grey
  border `#6b6f76`, green `#5fd38a` speaker icon when on, red `#e5534b` slashed mic when off,
  uppercase bold line title, participant count with green people icon); brand crimson
  `#8b0000` / accent `#ff5c4d`. Reference mockup: `.superpowers/brainstorm/…/widget-h-app-style.html`
  option H2 (minus the PTT button).
- pt-BR copy.

## Decided (owner)

- Layout H2 (app-card order), two big buttons Som | Microfone per line, who-is-talking shown,
  title opens app, all lines shown, no PTT, no volume, lock screen first.
- **Multi-line layout "M2"** (iOS caps the lock-screen Live Activity at ~160 pt): with 2 lines,
  both rows are identical and compact — title row (🎧 marks the headset line; who is talking at
  the right of the title), then Som | Mic buttons ~46 pt tall with icon + word ("Som", "Mic").
  A listen-only line shows its Mic button dimmed/disabled. With 1 line, use the taller H2 card
  (who-is-talking row + bigger buttons).

## Decided (my calls — owner may veto)

- **Native owns the Live Activity**: `NativeVoicePlugin` starts/updates/ends it from native
  state (start on first line, end on last leave / app terminate / plugin reload with no
  calls). The old JS-driven `OverlayBubble` Live Activity path stays disabled on iOS.
- **Who is talking while locked**: native maps the dominant-speaker endpoint id to a name using
  a participant list it fetches itself (`GET production/{productionId}/line/{lineId}` every
  ~5 s while a line is open and the screen may be locked), seeded by the names JS already has.
  If the name is unknown, show "Alguém falando".
- **Update rate**: Live Activity updates are throttled (≥ 1 s apart, immediate for button-caused
  changes) to stay within iOS budgets; the talking indicator is on/off, not an animated meter.
- **Dynamic Island**: compact = 🎧 line + who's talking / mic state dot; minimal = mic state
  dot; expanded = same content as the lock-screen card for the headset (🎧) line.
- **More than two lines**: show 2 rows (headset line first); beyond that "+N linhas" in the
  title area (opens the app).
- **Som = native output mute, owned by native**: the widget mirrors native `outputMuted` only
  (not volume). Native becomes the owner of the output-muted state: add a native→JS event when
  it changes (widget or other native cause), include it in `listCalls`, and stop the JS effect
  that re-applies `muted=false` from volume (production-line.tsx ~257-270) from undoing a
  native/widget mute on iOS. A Som-off from the widget survives a WebView reload. The JS
  program-user special case (program line → output muted) must also go through native on iOS.
- **Who is talking**: the user's own speech shows as "Você"; remote speech shows the name
  (or "Alguém falando"); the Áudio programa / program-output line shows no talker (its feed is
  always active). Native must split inbound activity from local mic activity for this.
- **Line status**: while a line is connecting/reconnecting, or a phone call/interruption is in
  progress, the row shows "Reconectando…" / "Em pausa" and its buttons are dimmed; the Mic
  never shows "aberto" while the PC can't hear.
- **Attributes type**: use a new ActivityAttributes type for the native widget (the JS
  `OverlayBubble.hide()` on iOS ends every activity of the old `IntercomOverlayAttributes`
  type); remove or keep that JS call accordingly.

## Left to the builder

- Data model of the Live Activity content state, App Intent design, how intents reach the
  NativeVoice instance (shared static, Darwin notification, etc.), throttling mechanism,
  SwiftUI layout details within the visual constraints, iOS 16 read-only fallback, tests (JS)
  and the read-only native review.

## Success criteria (owner's device test)

1. Join a line: the widget appears on the lock screen within ~2 s with the line name.
2. Someone on the PC talks: their name shows as "falando" within ~2 s, while locked.
3. Tap Microfone on the widget: the PC hears/stops hearing; the app screen matches when opened.
4. Headset button press: the widget's Microfone button changes accordingly.
5. Tap Som: the line goes silent/back; the widget shows it.
6. Work line + Áudio programa: two rows, each with its own Som/Microfone (programa mic disabled
   for listen-only users).
7. Leave the last line (or swipe the app away): the widget disappears.
8. Tap the line title: the app opens.
