# Android Headset-Button Talk Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tap on a wired or Bluetooth headset button toggles the microphone of the "headset line" in the Android app, with the screen off, plus a settings screen that shows which headset events arrive.

**Architecture:** A new Capacitor plugin `HeadsetButton` emits `headsetButton` events. On Android they come from a platform `MediaSession` owned by the existing foreground `CallService` (active only while the app is in a call). A JS `HeadsetButtonManager` resolves the target line (last line whose mic was opened, else the first) and calls the line's existing `toggle_input_mute` handler — the same path the floating widget uses. Events are also kept in a small in-memory log shown on the settings screen.

**Tech Stack:** React 18 + TypeScript + Vitest (happy-dom) · Capacitor 6 · Android Java (platform `android.media.session.MediaSession`, no new dependency) · APKs built by GitHub Actions on tag push.

**Spec:** `docs/superpowers/specs/2026-10-21-headset-ptt-and-ios.md`

## Global Constraints

- Repo: `C:\Users\alvia\Desktop\projetos\open-comunication\intercom-app`, branch `ac24/ptbr-branding`; fork `alviana/intercom-frontend`.
- No Java/Android SDK on the dev machine: Java is verified only by the CI build. Push the branch, then tag `android-vX.Y.Z-ac24` (next free: **v0.2.9**) and use the **release** artifact (signed with the permanent key, SHA-256 `41:32:83:38:5E:59…`).
- JS checks before every commit: `npx tsc --noEmit -p tsconfig.json`, `npx vitest run`, `npx prettier --check --end-of-line auto <changed files>`, `npx eslint <changed files>` (ignore only `Delete ␍` CRLF noise).
- `minSdk 22`: Java must use APIs available on API 22 (no `ConcurrentHashMap.newKeySet()`, etc.).
- UI copy in pt-BR. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Plugin name `HeadsetButton`, event name `headsetButton`, payload `{ key: string; action: "down" | "up"; source: "media_session" | "callkit" | "remote_command" }`.
- Tap keys (toggle the mic, on `action === "down"` only): `HEADSETHOOK`, `MEDIA_PLAY_PAUSE`, `MEDIA_PLAY`, `MEDIA_PAUSE`, `CALLKIT_MUTE`, `CALLKIT_END`.

## Review Focus

1. **Double toggles:** some headsets send both DOWN and UP, or PLAY then PAUSE within ~300 ms → one tap must toggle once (ignore taps within 400 ms of the previous one).
2. **No line yet / last line left:** the remembered line is gone → fall back to the first line; with no calls, ignore the tap.
3. **Program-output line** where the user may not talk → never toggled, event logged as `ignorado: linha só ouvinte`.
4. **Other apps' media keys:** with no active call the session must be inactive, so Spotify/YouTube keep their play/pause.
5. **Screen off / app in background:** event delivery and the toggle must still work (verified on device in Task 4).

---

### Task 1: Headset target line + widget marker (JS, pure logic)

**Files:**
- Create: `src/mobile-overlay/headset-target.ts`
- Create: `src/mobile-overlay/headset-target.test.ts`
- Modify: `src/mobile-overlay/production-line-bridge.ts` (`syncCallState`)
- Modify: `src/mobile-overlay/overlay-call-state.ts` (`buildOverlayRowState` labels)
- Test: `src/mobile-overlay/overlay-call-state.test.ts` (create)

**Interfaces:**
- Produces:
  - `markLastTalkedCall(callId: string): void`
  - `resolveHeadsetCallId(sortedCallIds: string[], canTalk: (id: string) => boolean): string | null` — last marked id if present and `canTalk`, else first id with `canTalk`, else `null`.
  - `resetHeadsetTarget(): void` (tests only)
  - `HEADSET_LABEL_PREFIX = "🎧 "`
  - in `overlay-call-state.ts`: `canTalkOnCall(call: { joinProductionOptions?: { lineUsedForProgramOutput?: boolean; isProgramUser?: boolean } | null } | undefined): boolean` — the existing `micAllowed` rule (`!(lineUsedForProgramOutput && !isProgramUser)`), now shared.

- [ ] **Step 1: Write failing tests** in `headset-target.test.ts`:
  - `resolveHeadsetCallId(["a","b","c"], () => true)` → `"a"` with nothing marked.
  - after `markLastTalkedCall("b")` → `"b"`.
  - after `markLastTalkedCall("x")` with ids `["a","b"]` → `"a"` (left line falls back).
  - `canTalk = (id) => id !== "a"`, nothing marked, ids `["a","b"]` → `"b"`; all `false` → `null`; ids `[]` → `null`.
  - `beforeEach(resetHeadsetTarget)`.
- [ ] **Step 2: Run** `npx vitest run src/mobile-overlay/headset-target.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `headset-target.ts` (module-level `let lastTalked: string | null`).
- [ ] **Step 4: Hook the bridge:** in `production-line-bridge.ts` `syncCallState`, call `markLastTalkedCall(callId)` when `isInputMuted === false` (mic opened from app, widget or headset).
- [ ] **Step 5: Widget marker test** in `overlay-call-state.test.ts`: with calls `{a:{joinProductionOptions:{lineName:"DIREÇÃO"}}, b:{joinProductionOptions:{lineName:"MESA"}}}` and `markLastTalkedCall("b")`, `buildOverlayRowState(calls).labels` → `["DIREÇÃO", "🎧 MESA"]`; nothing marked → `["🎧 DIREÇÃO", "MESA"]`; a program-output line for a non-program user is never prefixed.
- [ ] **Step 6: Implement** `canTalkOnCall` and use it for `micAllowed` in `buildOverlayRowState`; compute `target = resolveHeadsetCallId(ids, (id) => canTalkOnCall(calls[id]))` and prefix that row's label with `HEADSET_LABEL_PREFIX`. `labelSources` unchanged.
- [ ] **Step 7: Run** all JS checks (Global Constraints) → PASS.
- [ ] **Step 8: Commit** `feat(mobile): track the headset target line and mark it in the widget`.

### Task 2: `HeadsetButton` plugin interface, event log and manager (JS)

**Files:**
- Create: `src/mobile-overlay/headset-button.ts` (plugin registration + types)
- Create: `src/mobile-overlay/headset-diagnostics.ts`
- Create: `src/components/mobile/HeadsetButtonManager.tsx`
- Create: `src/components/mobile/HeadsetButtonManager.test.tsx`
- Modify: `src/components/mobile/mobile-extensions.tsx` (mount next to `<CallServiceManager />`)

**Interfaces:**
- Consumes: Task 1 `resolveHeadsetCallId`, `canTalkOnCall`; existing `getCallHandlers(id)?.toggle_input_mute`, `getSortedCallIds(calls)`, `requestOverlaySync()`.
- Produces:
  - `type HeadsetButtonEvent = { key: string; action: "down" | "up"; source: "media_session" | "callkit" | "remote_command" }`
  - `HeadsetButton = registerPlugin<{ addListener(e: "headsetButton", cb: (ev: HeadsetButtonEvent) => void): Promise<PluginListenerHandle> }>("HeadsetButton")`
  - `TAP_KEYS: ReadonlySet<string>` (values in Global Constraints)
  - `type HeadsetLogEntry = { at: number; key: string; action: string; source: string; result: string }`
  - `logHeadsetEvent(entry: HeadsetLogEntry): void` (keeps the last 10), `getHeadsetLog(): HeadsetLogEntry[]`, `subscribeHeadsetLog(cb: () => void): () => void`, `clearHeadsetLog(): void`
  - `HeadsetButtonManager: FC` (renders `null`)

- [ ] **Step 1: Write failing tests** in `HeadsetButtonManager.test.tsx` (mock `@capacitor/core` `Capacitor.isPluginAvailable → true`, mock `../../mobile-overlay/headset-button` capturing the listener, mock `useGlobalState` with calls `{a:…, b:…}`, register `toggle_input_mute` spies via `setCallActionHandler`):
  - a `{key:"HEADSETHOOK", action:"down"}` event calls `toggle_input_mute` of `"a"` once and logs `result: "alternou microfone: a"`.
  - an `action:"up"` event does nothing to the mic (logged as `ignorado: up`).
  - two tap events 200 ms apart (`vi.useFakeTimers`, `vi.setSystemTime`) toggle once; 500 ms apart toggle twice.
  - `{key:"MEDIA_NEXT", action:"down"}` is logged as `ignorado: tecla sem função` and toggles nothing.
  - with no calls, a tap is logged as `ignorado: sem linha` and toggles nothing.
- [ ] **Step 2: Run** `npx vitest run src/components/mobile/HeadsetButtonManager.test.tsx` → FAIL.
- [ ] **Step 3: Implement** `headset-button.ts`, `headset-diagnostics.ts` and `HeadsetButtonManager` (subscribe once on mount when `Capacitor.isPluginAvailable("HeadsetButton")`; keep calls in a ref; target = `resolveHeadsetCallId(getSortedCallIds(calls), (id) => canTalkOnCall(calls[id]))`; after a toggle call `requestOverlaySync()` so the widget updates).
- [ ] **Step 4: Mount** `<HeadsetButtonManager />` in `mobile-extensions.tsx` (already gated by `isMobileApp()`; works for Android now and iOS later).
- [ ] **Step 5: Run** all JS checks → PASS.
- [ ] **Step 6: Commit** `feat(mobile): toggle the headset line's mic from headset button events`.

### Task 3: Android native — MediaSession → `HeadsetButton` events

**Files:**
- Create: `android/app/src/main/java/com/eyevinn/intercom/HeadsetButtonPlugin.java`
- Modify: `android/app/src/main/java/com/eyevinn/intercom/MainActivity.java` (`registerPlugin(HeadsetButtonPlugin.class)` with the others)
- Modify: `android/app/src/main/java/com/eyevinn/intercom/CallService.java`

**Interfaces:**
- Consumes: event shape and plugin name from Global Constraints; existing `CallService.setSessions(...)`.
- Produces:
  - `@CapacitorPlugin(name = "HeadsetButton") public class HeadsetButtonPlugin extends Plugin` with `static void emit(String key, String action, String source)` (uses a static instance set in `load()`, cleared in `handleOnDestroy()`; `notifyListeners("headsetButton", data)`; no-op when no instance).
  - `CallService`: a `MediaSession` named `"intercom-headset"`, created in `onCreate`, released in `onDestroy`; **active only while `sessionIds` is non-empty** (toggle `setActive` inside `setSessions`, posting to the main thread).

- [ ] **Step 1: Implement `HeadsetButtonPlugin`** (no methods besides the listener API Capacitor provides).
- [ ] **Step 2: Implement the session in `CallService`:** `setFlags(FLAG_HANDLES_MEDIA_BUTTONS | FLAG_HANDLES_TRANSPORT_CONTROLS)` (deprecated, needed for API < 26), `PlaybackState` `STATE_PLAYING` with actions `ACTION_PLAY_PAUSE | ACTION_PLAY | ACTION_PAUSE`, callback `onMediaButtonEvent(Intent)` reading `Intent.EXTRA_KEY_EVENT` and calling `HeadsetButtonPlugin.emit(name, down ? "down" : "up", "media_session")`, returning `true`. Key names: `KEYCODE_HEADSETHOOK→"HEADSETHOOK"`, `MEDIA_PLAY_PAUSE`, `MEDIA_PLAY`, `MEDIA_PAUSE`, `MEDIA_NEXT`, `MEDIA_PREVIOUS`, otherwise `"OTHER:" + keyCode`. Comment why hold is impossible (AOSP voice-key long press → assistant).
- [ ] **Step 3: Static review** of the Java diff for API ≥ 22 and that the session is never active with no sessions (Review Focus 4).
- [ ] **Step 4: Commit** `feat(android): deliver headset button presses via MediaSession`, push, tag `android-v0.2.9-ac24`.
- [ ] **Step 5: Verify CI:** `gh run watch <id> --repo alviana/intercom-frontend` → both jobs `success`; download the `open-intercom-apk-release-*` artifact; signature SHA-256 starts `41:32:83:38`. On failure, read `gh run view <id> --log-failed`, fix, re-tag `v0.2.9.1`.

### Task 4: "Teste do botão do fone" screen + device validation

**Files:**
- Create: `src/components/mobile/HeadsetButtonTest.tsx`
- Create: `src/components/mobile/HeadsetButtonTest.test.tsx`
- Modify: `src/components/mobile/MobileSettingsPage.tsx` (render `<HeadsetButtonTest />` after `{form}` in both the modal and the page return)

**Interfaces:**
- Consumes: Task 2 `getHeadsetLog`, `subscribeHeadsetLog`, `clearHeadsetLog`.

- [ ] **Step 1: Write failing test:** with two logged entries the component shows a heading `Teste do botão do fone`, the instruction `Entre numa linha e aperte o botão do fone. Cada aperto aparece aqui.`, one row per entry with time `HH:MM:SS`, `key`, `action` and `result`, newest first; a new `logHeadsetEvent` re-renders; button `Limpar` empties the list; with no entries it shows `Nenhum aperto recebido ainda.`
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** all JS checks → PASS.
- [ ] **Step 5: Commit**, push, tag `android-v0.2.10-ac24`, verify CI as in Task 3 Step 5.
- [ ] **Step 6: Device validation (owner, S25 Ultra + team phones)** — install over the current app and fill this matrix; each cell = what the test screen shows and whether the PC hears:

| Headset | How audio is used | Screen on | Screen off 2 min |
|---|---|---|---|
| Wired (USB-C) | listen + headset mic | | |
| Bluetooth | listen via BT, phone mic | | |
| Bluetooth | listen + **headset mic** (SCO) | | |

- [ ] **Step 7: Decision gate:** if the Bluetooth + headset-mic row loses audio on press or delivers nothing, write the observed events into the spec and stop; a follow-up plan (e.g. Telecom self-managed `ConnectionService`) is needed — do not improvise it here.
