# iOS Lock-Screen Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A native Live Activity (lock screen + Dynamic Island) that shows every open line with who is talking and big Som / Microfone buttons, always reflecting the native audio state.

**Architecture:** The app process owns a `LineActivityController` (in the App target) that builds a content state from the `NativeVoice` calls and starts/updates/ends one Live Activity of a NEW attributes type shared with the widget extension. Widget buttons are App Intents (`LiveActivityIntent`, run in the app process) that call NativeVoice directly. Native becomes the owner of each line's output mute and reports it to JS; native also resolves "who is talking" from the dominant-speaker endpoint and a participant list it fetches itself.

**Tech Stack:** Swift 5 · ActivityKit · WidgetKit/SwiftUI · AppIntents (iOS 17+) · existing `NativeVoice` (WebRTC-lib 153.0.0) · React/TS + Vitest for the JS side.

**Spec:** `docs/superpowers/specs/2026-10-23-ios-lockscreen-widget-design.md`

## Global Constraints

- Deployment target iOS 16.1: on iOS 16.x the Live Activity is shown read-only (no intents); interactive buttons are `@available(iOS 17.0, *)`.
- Widget extension target `IntercomLiveActivity` (bundle `br.com.ac24horas.intercom.LiveActivityExtension`) is reused; the new attributes file is compiled into BOTH the App and the extension targets. Every new Swift file needs hand-written `project.pbxproj` entries (PBXFileReference, PBXBuildFile per target, group child, Sources phase per target) with unused `A1A1A1A1A1A1A1A1000000xx` IDs (grep to prove unused).
- No Swift compiler on this machine: Swift tasks are gated by a compile-reading review; the owner builds only after the final review.
- Layout (owner): 1 line → "H2" card: title row (`🎧` for the headset line, `PRODUÇÃO / LINHA` uppercase bold, opens the app), who-is-talking row, Som | Microfone big buttons side by side. 2 lines → "M2": each line = title row with talker at the right, then Som | Mic buttons ~46 pt tall with icon + word ("Som", "Mic"). > 2 lines → first 2 (headset line first) + "+N linhas" in the title area. Listen-only line → Mic button dimmed and not tappable.
- Visual: card `#2b2d31`, border `#3d3f44`, button bg `#383b40` with 2 pt border `#6b6f76`, radius 12; green `#5fd38a` speaker when sound on; red `#e5534b` slashed mic when closed, green mic when open; muted sound = red slashed speaker; accent `#ff5c4d`. Copy pt-BR.
- Talker text: own speech → "Você"; remote → participant name or "Alguém falando"; nobody → "Ninguém falando"; program-output line ("Áudio programa") shows no talker.
- Line status: connecting/reconnecting → "Reconectando…"; interruption in progress → "Em pausa"; in both the row's buttons are dimmed and disabled; Mic never displays "aberto" while the PC cannot hear.
- No PTT and no volume in the widget. Title tap opens the app (`intercom-control://open`).
- Updates: content changes caused by a widget tap or the headset are pushed immediately; others are coalesced to ≥ 1 s apart.
- The activity exists only while ≥ 1 line is open; ended on last leave, on app terminate, and on plugin load when no calls exist (stale activity from a killed process).
- JS checks before commit: `npx tsc --noEmit`, `npx vitest run`, prettier `--end-of-line auto`, `eslint --rule 'prettier/prettier: off'`. Commit subjects lowercase conventional + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push until the final review.

## Review Focus

1. Widget state drifting from reality (mic/som changed by headset, screen, remote mute, interruption, reconnect) → every native state change re-publishes the activity. Pinned in Task 4's walk + Task 2 tests.
2. A Som-off from the widget silently undone by the JS volume effect or a WebView reload → native owns output mute (Task 1) and JS follows it on iOS (Task 2 test).
3. A stale Live Activity left on the lock screen after the app was killed or the last line left → Task 4 end paths.
4. Double toggles (intent + optimistic update + event echo) → one tap = one native toggle; the activity re-renders from native state only. Task 4 walk.
5. Names missing while locked (JS asleep) → native participant fetch every ~5 s (Task 1); unknown → "Alguém falando".

---

### Task 1: Native line state — output ownership, talker resolution, snapshot (Swift)

**Files:**
- Modify: `ios/App/App/Plugins/NativeVoiceCall.swift`, `ios/App/App/Plugins/NativeVoicePlugin.swift`, `ios/App/App/Plugins/NativeVoicePlugin.m`
- Modify: `src/mobile-overlay/native-voice.ts` (contract only: new event + field)

**Interfaces:**
- Produces (Swift, NativeVoiceCall): `struct LineSnapshot { callId: String; lineName: String; productionName: String; isHeadsetLine: Bool; canTalk: Bool; micEnabled: Bool; outputMuted: Bool; status: String /* "ok" | "reconectando" | "pausa" */; talker: String /* "" | "Você" | name | "Alguém falando" */; isProgramLine: Bool }` and `func snapshot() -> LineSnapshot`.
- Produces (NativeVoicePlugin): `var onLinesChanged: (() -> Void)?` fired on any snapshot-relevant change; `func lineSnapshots() -> [LineSnapshot]` (headset line first, then join order); `func toggleMic(callId: String)` and `func toggleOutput(callId: String)` that behave like the existing headset toggle / setOutputMuted and emit `micChanged` (source `"widget"`) / `outputChanged`.
- JS contract additions: event `outputChanged {callId: string; muted: boolean}`; `NativeCallInfo.outputMuted: boolean`; `micChanged.source` adds `"widget"`.
- Names: `lineName`/`productionName` from the call's `meta` JSON (`TJoinProductionOptions.lineName/productionName`), falling back to the fetched line. Participants: `GET <base>production/{productionId}/line/{lineId}` every 5 s while the call is connected → map `endpointId → name`, and the own `sessionId` to "Você".
- Activity split: `hasActivity` becomes inbound-only for the talker; local mic activity marks "Você" only when the mic is open.

- [ ] **Step 1: Implement** the above (main-queue state; fetch with the existing request helper + Bearer key; stop the fetch timer in teardown).
- [ ] **Step 2: Self-review as the compiler**; walk: dominant speaker = own endpoint → "Você"; unknown endpoint → "Alguém falando"; program line → talker "".
- [ ] **Step 3: Run** `npx tsc --noEmit` and `npx vitest run` → green.
- [ ] **Step 4: Commit** `feat(ios): estado nativo por linha para o widget (som, quem fala, status)`

### Task 2: JS follows native output mute on iOS

**Files:**
- Modify: `src/components/production-line/native-voice-connection.tsx`, `src/components/production-line/production-line.tsx` (output effects ~L240-270, program-user mute ~L396-414), `src/mobile-overlay/native-voice-stubs.ts` if needed
- Test: `src/components/production-line/native-voice-connection.test.tsx`, `src/components/production-line/production-line-platform.test.tsx`

**Interfaces:**
- Consumes: Task 1 `outputChanged` event and `NativeCallInfo.outputMuted`.

- [ ] **Step 1: Failing tests:** `outputChanged from native sets isOutputMuted (iOS)`; `restore applies native outputMuted instead of unmuting` (join result `outputMuted:true` → UI muted, no `setOutputMuted(false)` sent); `iOS volume effect never unmutes a native-muted line`; `Android output behaviour unchanged`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (iOS: React `isOutputMuted` mirrors native; the volume→unmute effect skips iOS; program-user mute goes through the stand-in → native).
- [ ] **Step 4: Run** all JS checks → PASS. **Step 5: Commit** `feat(ios): som da linha controlado pelo nativo`

### Task 3: Widget extension — attributes, views, intents (Swift)

**Files:**
- Create: `ios/App/IntercomLiveActivity/IntercomLineActivityAttributes.swift` (member of App + extension targets), `ios/App/IntercomLiveActivity/IntercomLineActivityWidget.swift`, `ios/App/IntercomLiveActivity/IntercomLineIntents.swift` (member of App + extension targets)
- Modify: the extension's `@main` widget bundle (add the new widget; keep the old one compiled but unused), `ios/App/App.xcodeproj/project.pbxproj`

**Interfaces:**
- Produces: `struct IntercomLineActivityAttributes: ActivityAttributes { struct ContentState: Codable, Hashable { var lines: [Line]; var extraLines: Int; var updatedAt: Date }; struct Line: Codable, Hashable { callId, title, isHeadsetLine, canTalk, micEnabled, outputMuted, status, talker, isProgramLine } }` (fields mirror `LineSnapshot`, `title` = `"PRODUÇÃO / LINHA"` uppercased).
- Produces: `@available(iOS 17.0, *) struct ToggleLineMicIntent: LiveActivityIntent { @Parameter var callId: String }` and `ToggleLineSoundIntent` (same shape); `perform()` calls `LineIntentHandler.shared?.toggleMic(callId:)` / `toggleSound(callId:)` — `LineIntentHandler` is a protocol-typed static hook defined in the shared intents file and set by the App target (Task 4); in the extension process it is nil (intents run in the app process for LiveActivityIntent).
- Views: lock screen per Global Constraints (H2 for 1 line, M2 for 2, "+N linhas"); Dynamic Island compact leading = `🎧` + short line name, compact trailing = mic dot (green open / red closed) or talker initial when someone talks; minimal = mic dot; expanded = the headset line's H2 content. `widgetURL` = `intercom-control://open`. iOS 16: same views, buttons rendered as non-interactive labels.

- [ ] **Step 1: Implement**; **Step 2: Self-review as the compiler** (ActivityKit/AppIntents availability, SwiftUI types, `Button(intent:)` iOS 17 API, pbxproj membership in both targets).
- [ ] **Step 3: Run** JS checks (green). **Step 4: Commit** `feat(ios): widget da tela bloqueada com som e microfone por linha`

### Task 4: LineActivityController in the app — lifecycle, intents, throttling (Swift)

**Files:**
- Create: `ios/App/App/Plugins/LineActivityController.swift` (App target; pbxproj)
- Modify: `ios/App/App/Plugins/NativeVoicePlugin.swift` (wire `onLinesChanged`, terminate path), `ios/App/App/AppDelegate.swift` (open-URL `intercom-control://open` already routed — verify), `src/components/mobile/BubbleActionHandler.tsx` only if the iOS `OverlayBubble.hide()` call must change (it ends only the OLD attributes type — keep it)

**Interfaces:**
- Consumes: Task 1 `lineSnapshots()`, `onLinesChanged`, `toggleMic`, `toggleOutput`; Task 3 attributes + `LineIntentHandler`.
- Behaviour: first line → `Activity.request` (iOS 16.2+ `ActivityContent`, 16.1 fallback `contentState:`); changes → coalesced update (≥ 1 s; immediate when caused by an intent or the headset); last leave / terminate / plugin load with no calls → end all activities of the new type (`.immediate`); `LineIntentHandler.shared` set at plugin load → toggles call NativeVoice and trigger an immediate update; skip silently if `ActivityAuthorizationInfo().areActivitiesEnabled` is false (diag `WIDGET`).

- [ ] **Step 1: Implement**; **Step 2: Self-review as the compiler** + walks: widget Mic tap → one native toggle → `micChanged("widget")` → JS UI → activity re-rendered from native; headset press → activity updated; leave last line → activity gone; app swiped away → ended in terminate path; reconnect → row shows "Reconectando…" then back.
- [ ] **Step 3: Run** JS checks. **Step 4: Commit** `feat(ios): controlador da atividade ao vivo ligado ao áudio nativo`

### Task 5: Owner build and device test (after the final review)

- [ ] Controller pushes; owner: `git checkout ios/App/Podfile.lock && git pull`, `npm run ios:build` (with `VITE_BACKEND_URL`), `pod install`, ▶ (do not accept "Update to recommended settings").
- [ ] Run the spec's success criteria 1–8 and send screenshots of the lock screen, Dynamic Island and the diagnostics list.
