# iOS App: Background Audio + Headset-Button Talk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Capacitor iOS app keeps hearing and talking with the iPhone locked or in the background, and a tap on AirPods / wired EarPods toggles the mic of the headset line without ending the call.

**Architecture:** Reuse the existing iOS project (`ios/App`, CocoaPods): `UIBackgroundModes` already has `audio` + `voip`, `AudioRoutePlugin` sets `playAndRecord/voiceChat`, and `CallServicePlugin` already owns a CallKit provider. JS starts the CallKit call while the user is in a line (today only Android starts its service). Headset presses during the CallKit call arrive as CallKit mute/end actions; they are forwarded to the shared `HeadsetButton` plugin/event built by the Android plan, so `HeadsetButtonManager` handles both platforms. An on-device spike decides whether a native heartbeat (iOS) or a native-WebRTC follow-up is needed.

**Tech Stack:** Capacitor 6 iOS · Swift (CallKit, AVFoundation, MediaPlayer) · Xcode with the iOS 26 SDK on the owner's Mac · free Apple ID ("Personal Team") · React/TypeScript + Vitest.

**Spec:** `docs/superpowers/specs/2026-10-21-headset-ptt-and-ios.md`

## Global Constraints

- **Depends on** `docs/superpowers/plans/2026-10-21-android-headset-ptt.md` Tasks 1–2 (JS `HeadsetButton` plugin, `HeadsetButtonManager`, event payload, `TAP_KEYS` incl. `CALLKIT_MUTE`, `CALLKIT_END`). Do those first.
- Swift cannot be compiled on the Windows dev machine. Every Swift task ends with the **owner building in Xcode on the Mac**; compile errors are pasted back and fixed before the next task.
- Bundle ids: `br.com.ac24horas.intercom` (App) and `br.com.ac24horas.intercom.LiveActivityExtension`. Display name `Intercom ac24horas`.
- Free Apple ID limits: max 3 devices, app expires after 7 days (re-run from Xcode), no Push/VoIP push.
- JS checks before every commit, iOS user-visible copy in pt-BR, commit trailer — as in the Android plan.

## Review Focus

1. **Hang-up from the iOS call UI / EarPods centre press** (`CXEndCallAction` not requested by the app) → toggles the mic, the CallKit call stays up; leaving is done with "Sair da linha" in the app.
2. **Leaving the last line** → the app-requested end is fulfilled and the CallKit call disappears (no stuck "call" in the status bar).
3. **AirPods "press to mute"** sends a `CXSetMutedCallAction` → exactly one mic toggle; the CallKit mute state must not silence our audio (fulfill without touching the session).
4. **Phone call arriving** while in a line → iOS gives the cellular call priority; after it ends, our audio resumes or the user sees the line disconnected — observe in Task 3 and record.
5. **Screen locked > 5 min** → user stays "ativo" in the participant list (heartbeat keeps arriving).

---

### Task 1: Start/stop the CallKit call on iOS while in a line (JS)

**Files:**
- Modify: `src/components/mobile/CallServiceManager.tsx`
- Modify: `src/components/mobile/CallServiceManager.test.tsx`

**Interfaces:**
- Consumes: existing `CallService.start()/stop()` (iOS implementation in `CallServicePlugin.swift`), `isIOSApp()` from `src/platform.ts`.

- [ ] **Step 1: Write failing tests** (mock `isIOSApp → true`, `isAndroidApp → false`): with one call → `CallService.start` called once; calls go from 1 to 0 → `CallService.stop` called; with 0 calls on mount → neither called; Android behaviour tests stay green.
- [ ] **Step 2: Run** `npx vitest run src/components/mobile/CallServiceManager.test.tsx` → FAIL.
- [ ] **Step 3: Implement:** on iOS, an effect on `inCall` calls `start()` when true and `stop()` when it becomes false (Android keeps start-on-mount + restart-on-join).
- [ ] **Step 4: Run** all JS checks → PASS. **Step 5: Commit** `feat(ios): keep a CallKit call while the user is in a line`.

### Task 2: iOS `HeadsetButton` plugin + CallKit mute/end mapping (Swift)

**Files:**
- Modify: `ios/App/App/Plugins/CallServicePlugin.swift` (add `class HeadsetButtonPlugin` in this file) and `ios/App/App/Plugins/CallServicePlugin.m` (add `CAP_PLUGIN(HeadsetButtonPlugin, "HeadsetButton", )` — no methods). Kept in existing files on purpose: new files would require hand-editing `project.pbxproj`, which cannot be validated without a Mac.
- Modify: `ios/App/App/BridgeViewController.swift` (`registerPluginInstance(HeadsetButtonPlugin())`)
- Modify: `ios/App/App/Info.plist` (pt-BR usage strings)

**Interfaces:**
- Produces: `extension Notification.Name { static let intercomHeadsetButton }` with `userInfo` `["key": String, "action": String, "source": String]`; `HeadsetButtonPlugin` observes it and calls `notifyListeners("headsetButton", data: userInfo)`.

- [ ] **Step 1: `HeadsetButtonPlugin`:** observe the notification in `load()`; also register `MPRemoteCommandCenter` `togglePlayPauseCommand`, `playCommand`, `pauseCommand` handlers posting key `MEDIA_PLAY_PAUSE` / `MEDIA_PLAY` / `MEDIA_PAUSE`, action `down`, source `remote_command`, returning `.success`.
- [ ] **Step 2: `CallServicePlugin` mute:** `provider(_:perform: CXSetMutedCallAction)` posts `CALLKIT_MUTE` / `down` / `callkit` and `action.fulfill()`.
- [ ] **Step 3: `CallServicePlugin` end:** add `private var endingByApp = false`, set it in `stopInternal()` before requesting `CXEndCallAction`. In `provider(_:perform: CXEndCallAction)`: if `endingByApp` → reset it, `action.fulfill()`; else post `CALLKIT_END` / `down` / `callkit` and `action.fail()` (call stays up). Comment the reason (EarPods centre press = hang-up).
- [ ] **Step 4: Copy:** `CXHandle` value and provider display name → `Intercom ac24horas`; Info.plist `NSMicrophoneUsageDescription` = `O Intercom ac24horas usa o microfone para você falar nas linhas.`, Bluetooth descriptions = `O Intercom ac24horas usa o Bluetooth para levar o áudio ao seu fone.`
- [ ] **Step 5: Commit** `feat(ios): headset button events via CallKit and remote commands`; push.
- [ ] **Step 6: Owner builds in Xcode** (Task 3 Steps 1–4). Paste any compile error back; fix in a new commit until **Build Succeeded**.

### Task 3: Build on the Mac + device spike (owner, guided)

- [ ] **Step 1: Prerequisites on the Mac:** Xcode with the iOS 26 SDK, Command Line Tools, Node 20+, CocoaPods (`sudo gem install cocoapods`), iPhone with **Developer Mode** on (Ajustes → Privacidade e Segurança).
- [ ] **Step 2: Build web + sync:** `git clone -b ac24/ptbr-branding https://github.com/alviana/intercom-frontend.git && cd intercom-frontend && npm ci && VITE_BACKEND_URL=https://intercom.ac24horas.com/manager npm run ios:build && (cd ios/App && pod install)`.
- [ ] **Step 3: Signing:** open `ios/App/App.xcworkspace`; for targets **App** and **IntercomLiveActivity** set Team = *(Personal Team)*. If the extension cannot be signed with a free account, remove it from App → Build Phases → *Embed Foundation Extensions* and note it (the lock-screen Live Activity is then unavailable).
- [ ] **Step 4: Run on the iPhone** (cable); on the phone: Ajustes → Geral → VPN e Gerenciamento de Dispositivos → confiar no desenvolvedor.
- [ ] **Step 5: Spike matrix** — record each result:

| Check | Result |
|---|---|
| Enter a line; hear + talk (foreground) | |
| Lock 10 min: hears PC? PC hears (mic latched open)? | |
| Another app in front 5 min: same two checks | |
| Locked 5 min: still "ativo" in the PC participant list? | |
| AirPods single press (locked): "Teste do botão do fone" shows `CALLKIT_MUTE`; mic toggles; call stays | |
| EarPods centre press (locked): shows `CALLKIT_END` or `MEDIA_*`; mic toggles; call stays | |
| Leave the last line: CallKit call ends (no green call pill) | |

- [ ] **Step 6: Decision gates:**
  - Mic or audio muted while locked → stop; write the findings in the spec; a native-WebRTC follow-up plan is required.
  - User drops to "inativo" while locked → do **Task 4**.
  - Headset press delivers nothing → record what the test screen shows per headset; stop for a follow-up.

### Task 4 (only if Task 3 shows "inativo" while locked): native heartbeat on iOS

**Files:**
- Modify: `ios/App/App/Plugins/CallServicePlugin.swift`, `ios/App/App/Plugins/CallServicePlugin.m` (`CAP_PLUGIN_METHOD(setSessions, CAPPluginReturnPromise)`)
- Modify: `src/components/mobile/CallServiceManager.tsx` + test (send `setSessions` on iOS too)

**Interfaces:**
- Consumes: the Android `setSessions({ baseUrl, apiKey, sessionIds })` contract and `heartbeat/<id>` path; stop a session on HTTP 410.

- [ ] **Step 1: Failing JS test:** on iOS, `CallService.setSessions` is called with the sorted session ids (same assertions as the Android test).
- [ ] **Step 2: Implement JS** (drop the Android-only guard for `setSessions`), run checks → PASS.
- [ ] **Step 3: Swift:** `setSessions` stores base URL/key/ids; a `DispatchSourceTimer` every 10 s while the CallKit call is active sends `GET <base>heartbeat/<id>` with `URLSession` (Bearer key if non-empty), removing ids answered 410.
- [ ] **Step 4: Commit**, owner rebuilds, re-run the "locked 5 min → ativo" check.
