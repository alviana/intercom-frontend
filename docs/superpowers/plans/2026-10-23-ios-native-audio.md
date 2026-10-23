# iOS Native Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On iOS, every line's call audio (session, peer connection, mic, playback, heartbeat, reconnect, headset button, cues) runs in a native plugin, so the headset mic, the headset button, background/locked use and auto-reconnect work reliably; the React UI and Android stay as they are.

**Architecture:** A new Capacitor plugin `NativeVoice` (Swift, Google WebRTC iOS SDK) owns each iOS call end to end and reports state through events. In JS, `ProductionLine` takes an iOS branch: instead of `useAudioInput` + `SymphonyRtcConnectionComponent` it mounts `NativeVoiceConnection` and hands the existing UI small stand-in objects (mic stream, audio element, data channel) whose setters forward to the plugin, so the rest of the UI code is unchanged. The app owns the AVAudioSession again (WebKit no longer captures).

**Tech Stack:** Capacitor 6.2.1 · React 18 + TypeScript + Vitest/happy-dom · Swift 5 / iOS 16.1 target / Xcode 27 · CocoaPods · Google WebRTC iOS SDK (`WebRTC-SDK` pod or equivalent) · AVFoundation, MediaPlayer.

**Spec:** `docs/superpowers/specs/2026-10-23-ios-native-audio-design.md`

## Global Constraints

- Android, desktop/Chrome and web: no behaviour change. Every new path is behind `isIOSApp()`; the non-iOS path must render `useAudioInput` + `SymphonyRtcConnectionComponent` exactly as today.
- No CallKit; lock-screen widget stays off; no PWA work.
- Server API (base `getApiBaseUrl()` = `…/api/v1/`, optional `Authorization: Bearer <getApiKey()>`): `POST session/` `{productionId, lineId, username}` → `{sdp, sessionId}` (server offers, client answers); `PATCH session/{id}` `{sdpAnswer}`; `DELETE session/{id}` (500 when already gone = harmless); `GET heartbeat/{id}` every 10 s, `410` = session gone.
- No trickle ICE: gather up to 5 s, then PATCH. ICE servers `stun:stun.l.google.com:19302`, `stun:stun1.l.google.com:19302`. Client creates data channel `"conference-data-channel"` (ordered) before answering.
- Data channel messages: in `{type:"DominantSpeaker", endpoint}`, in `{type:"EndpointMessage", to, from, payload:{muteParticipant:"mute"}}` (remote mute when `to !== from`); out `{type:"EndpointMessage", to:<endpointId>, payload:{muteParticipant:"mute"}}`.
- Activity threshold: inbound or local audio level `> 0.02`, sampled every 100 ms, reported only on change.
- Mic starts closed on join. Volume 0..1, default 0.75 (JS keeps owning the value and ducking).
- Audio session (app-owned): `.playAndRecord`, mode `.voiceChat`, options `[.allowBluetoothHFP]` (+ `.defaultToSpeaker` only for the speaker route), non-mixable. WebRTC's `RTCAudioSessionConfiguration.webRTC()` must be set to the same values so WebRTC never reconfigures differently.
- Reconnect: trigger on PC `failed`, on `disconnected` > 5 s, or heartbeat `410`; best-effort DELETE old session, then POST again; backoff 2 s, 4 s, 8 s, then every 15 s, until connected or the user leaves; stop and report `failed` on POST 4xx (line/production gone). Restore the mic state the user had; play the start cue when reconnected.
- Interruptions (cellular call, Siri, alarm, other app audio): stay in the line, heartbeats continue; on interruption end resume audio, **close the mic** (event source `"interrupção"`), play the start cue.
- WebView reload: native calls keep running; `join` is idempotent per `callId` (attaches, never creates a second session).
- Cues on iOS are native: `start-connection-451.wav` (connected, reconnected, interruption end, headset opens mic) and `stop-connection-451.wav` (leave, headset closes mic). JS cues are no-ops on iOS.
- Headset button on iOS is native: toggles the target line's mic (last line whose mic was opened, else the first line with `canTalk`), 400 ms debounce, plays the cue, emits `micChanged` with source `"fone"`. JS `HeadsetButtonManager` does nothing on iOS.
- Diagnostics: user-visible log lines go through the existing `logHeadsetEvent` (keys in CAPS, pt-BR actions/results).
- iOS copy in pt-BR. New iOS source/resource files must be added to `ios/App/App.xcodeproj/project.pbxproj` by hand (PBXFileReference, PBXBuildFile, group child, Sources/Resources phase) using unused IDs in the existing `A1A1A1A1A1A1A1A1000000xx` pattern.
- JS checks before every commit: `npx tsc --noEmit`, `npx vitest run`, `npx prettier --check --end-of-line auto <files>`, `npx eslint --rule 'prettier/prettier: off' <files>`. Commit subject lowercase conventional (`feat(ios): …`), trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push; the controller pushes after the final review.
- No Swift compiler on this machine: Swift tasks are verified by a compile-reading review; the owner builds only after the final review.

## Review Focus

1. A headset press toggling twice (native toggle + JS manager) → exactly one toggle on iOS. Test in Task 3 (`HeadsetButtonManager` inert on iOS) and Task 7 review item.
2. After a WebView reload, a line appearing twice or a second server session being created → restore adds each native call once and `join` attaches. Tests in Task 4; Task 6 review item.
3. Mic state drift between native and the UI (headset/interruption/remote changes not shown, or a UI change sent twice) → stand-in setter forwards once, native events update React state. Tests in Tasks 1 and 2.
4. Leaving a line while it is reconnecting must stop the retries and DELETE the session (no ghost). Task 6 review item + device test.
5. Android regressions → non-iOS `ProductionLine` path unchanged. Test in Task 2.

---

### Task 1: `NativeVoice` JS contract + stand-in objects

**Files:**
- Create: `src/mobile-overlay/native-voice.ts`
- Create: `src/mobile-overlay/native-voice-stubs.ts`
- Test: `src/mobile-overlay/native-voice-stubs.test.ts`

**Interfaces:**
- Produces (`native-voice.ts`, `registerPlugin<NativeVoicePlugin>("NativeVoice")`):
  - `type NativeCallState = "connecting" | "connected" | "reconnecting" | "failed" | "closed"`
  - `interface NativeJoinOptions { callId: string; baseUrl: string; apiKey: string; productionId: string; lineId: string; username: string; canTalk: boolean; meta: string }` (`meta` = JSON of the call's `joinProductionOptions`, stored and returned verbatim)
  - `interface NativeCallInfo { callId: string; meta: string; sessionId: string | null; state: NativeCallState; micEnabled: boolean }`
  - Methods: `join(o: NativeJoinOptions): Promise<NativeCallInfo>`, `leave(o: {callId}): Promise<void>`, `setMicEnabled(o: {callId; enabled: boolean}): Promise<void>`, `setOutputMuted(o: {callId; muted: boolean}): Promise<void>`, `setVolume(o: {callId; volume: number}): Promise<void>`, `sendData(o: {callId; message: string}): Promise<void>`, `listCalls(): Promise<{calls: NativeCallInfo[]}>`, `checkMicPermission(): Promise<{granted: boolean}>`, `requestMicPermission(): Promise<{granted: boolean}>`.
  - Events: `callState {callId, state: NativeCallState, sessionId: string | null}`, `micChanged {callId, enabled: boolean, source: "fone" | "interrupção" | "remoto"}`, `activity {callId, active: boolean}`, `dominantSpeaker {callId, endpoint: string}`, `diag {key: string, action: string, result: string}`.
- Produces (`native-voice-stubs.ts`): `createNativeMicStream(callId: string): MediaStream`, `createNativeOutput(callId: string): HTMLAudioElement`, `createNativeDataChannel(callId: string, isOpen: () => boolean): RTCDataChannel` — plain objects cast to those types, implementing only what the UI uses: stream `getTracks()`/`getAudioTracks()` (one track: `kind:"audio"`, `enabled` getter/setter, `stop`, `addEventListener`/`removeEventListener` no-ops); output `muted`/`volume` getters/setters, `pause()`, `srcObject = null`, `setSinkId()` resolving; channel `readyState` (`"open"` when `isOpen()` else `"closed"`) and `send(message)`.

- [ ] **Step 1: Write failing tests** (mock `./native-voice` with `vi.fn()` methods):
  - `mic track enabled setter forwards once and getter reflects it`: `t.enabled = true` → `setMicEnabled` called with `{callId:"c1", enabled:true}`; `t.enabled` is `true`; setting `true` again does not call it a second time.
  - `stream exposes the same single audio track`: `getTracks()[0] === getAudioTracks()[0]`, `kind === "audio"`, starts `enabled === false`.
  - `output muted/volume forward to native`: `el.muted = true` → `setOutputMuted({callId:"c1", muted:true})`; `el.volume = 0.2` → `setVolume({callId:"c1", volume:0.2})`; getters return the values; `pause()` does not throw.
  - `data channel sends through native only when open`: `readyState` follows `isOpen()`; `send("x")` → `sendData({callId:"c1", message:"x"})`.
- [ ] **Step 2: Run** `npx vitest run src/mobile-overlay/native-voice-stubs.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** both files (promise rejections from the plugin are caught and ignored in setters).
- [ ] **Step 4: Run** the test → PASS; run all JS checks.
- [ ] **Step 5: Commit** `feat(ios): contrato do plugin NativeVoice e objetos substitutos de mic/saída/canal`

### Task 2: `NativeVoiceConnection` + iOS branch in `ProductionLine`

**Files:**
- Create: `src/components/production-line/native-voice-connection.tsx`
- Modify: `src/components/production-line/production-line.tsx` (input stream selection ~L113, connection component ~L471, reconnecting note)
- Modify: `src/global-state/types.ts` (`CallState.reconnecting?: boolean`)
- Modify: `src/components/production-line/use-audio-cue.ts` (no-op on iOS)
- Test: `src/components/production-line/native-voice-connection.test.tsx`, `src/components/production-line/production-line-platform.test.tsx`

**Interfaces:**
- Consumes: Task 1 contract and stubs.
- Produces: `NativeVoiceConnection(props: { callId: string; joinProductionOptions: TJoinProductionOptions | null; canTalk: boolean; dispatch: React.Dispatch<TGlobalStateAction>; muteInput: (mute: boolean, source?: string) => void }): null`.
- Behaviour: on mount (when `joinProductionOptions` set) calls `NativeVoice.join({callId, baseUrl: getApiBaseUrl(), apiKey: getApiKey() ?? "", productionId, lineId, username, canTalk, meta: JSON.stringify(joinProductionOptions)})`; dispatches `UPDATE_CALL` with `audioElements: [createNativeOutput(callId)]`, `dataChannel: createNativeDataChannel(callId, () => state === "connected")` and `mediaStreamInput` (the line's native mic stream when `canTalk`, else `null`) — `productionId`/`lineId` are passed to `join` as strings; maps `callState` events for its `callId` to `connectionState` (`connected`→`"connected"`, `connecting`/`reconnecting`→`"connecting"`, `failed`→`"failed"`, `closed`→`"closed"`), `sessionId`, and `reconnecting` (true only for `"reconnecting"`); `activity` → `audioLevelAboveThreshold`; `dominantSpeaker` → `dominantSpeaker`; `micChanged` → `muteInput(!enabled, source)`; the `join` result's `micEnabled` → `muteInput(!micEnabled, "restaurado")` when `micEnabled` is true; `diag` is logged by Task 3's logger, not here. On unmount: `NativeVoice.leave({callId})` and listener removal.
- `ProductionLine` on iOS: `useAudioInput({audioInputId: null, …})`; `inputAudioStream = audioinput === "no-device" ? "no-device" : createNativeMicStream(id)` (memoised per `id`); `canTalk = inputAudioStream !== "no-device"`; renders `NativeVoiceConnection` instead of `SymphonyRtcConnectionComponent`; when `callState.reconnecting` shows `Reconectando…` for that line (visible while the loader is shown).
- `use-audio-cue`: `playEnterSound`/`playExitSound` do nothing on iOS.

- [ ] **Step 1: Write failing tests** (mock `NativeVoice`, `platform`, `config`):
  - `joins once with the call's parameters and meta` (assert `join` args incl. `canTalk:true`, `meta` JSON of the options).
  - `maps callState events to connectionState/sessionId/reconnecting` (`reconnecting` → `connectionState:"connecting"`, `reconnecting:true`; `connected` → `reconnecting:false`).
  - `micChanged from the headset updates the UI mic state` (`muteInput` called with `(false, "fone")` for `enabled:true`).
  - `ignores events of other calls`.
  - `leaves on unmount`.
  - `production-line-platform.test.tsx`: `iOS renders NativeVoiceConnection and never opens a WebView mic` (no `getUserMedia` call, no `SymphonyRtcConnectionComponent`); `Android renders SymphonyRtcConnectionComponent with useAudioInput` (unchanged path). Mock heavy children; assert on which connection component mounts.
  - `use-audio-cue`: `iOS cues are silent` (no `Audio#play`).
- [ ] **Step 2: Run** the three test files → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; all JS checks.
- [ ] **Step 5: Commit** `feat(ios): linha usa NativeVoice no iOS (mic, saída e canal pelo nativo)`

### Task 3: iOS permission, diagnostics and WebKit-mic removal

**Files:**
- Modify: `src/hooks/use-device-permission.ts` (iOS: `NativeVoice.checkMicPermission`, then `requestMicPermission`; no `getUserMedia`)
- Modify: `src/components/mobile/StartupPermissions.tsx` (iOS microphone step requests via `NativeVoice.requestMicPermission`)
- Modify: `src/components/mobile/HeadsetButtonManager.tsx` (no listener on iOS)
- Create: `src/components/mobile/NativeVoiceDiagnostics.tsx` (iOS: `diag` events → `logHeadsetEvent({at: Date.now(), key, action, source: "nativo", result})`), mounted in `src/components/mobile/mobile-extensions.tsx`
- Modify: `src/components/production-line/use-audio-input.ts` (drop the iOS `resolveIOSMicDeviceId` branch), `src/utils/android-audio-route.ts` (delete `resolveIOSMicDeviceId`, keep the iOS headset preference and "auto speaker not saved"), `src/components/mobile/MobileAudioRouteSelect.tsx` (drop the iOS mic rewrite)
- Test: update `use-audio-input.test.ts`, `android-audio-route.test.ts`; add tests to `HeadsetButtonManager.test.tsx`, `use-device-permission.test.ts` (create), `NativeVoiceDiagnostics.test.tsx`

**Interfaces:**
- Consumes: Task 1 contract.

- [ ] **Step 1: Write failing tests:** `iOS asks the native mic permission and never calls getUserMedia` (permission granted → `permission:true`; denied → `denied:true`); `HeadsetButtonManager registers no listener on iOS`; `native diag events land in the headset log`; remove the `resolveIOSMicDeviceId` tests and the iOS exact-mic tests (their behaviour moves to native).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; all JS checks (Android tests in these files unchanged and green).
- [ ] **Step 5: Commit** `feat(ios): permissão do mic e diagnóstico pelo nativo; WebKit não abre mais o mic`

### Task 4: Restore native calls after a WebView reload

**Files:**
- Modify: `src/hooks/use-initiate-production-call.tsx` (extract `createCallState(joinProductionOptions, audiooutput, globalMuteHotkey): CallState`, used by the existing `ADD_CALL`)
- Create: `src/components/mobile/NativeCallsRestore.tsx`, mounted in `src/components/mobile/mobile-extensions.tsx`
- Test: `src/components/mobile/NativeCallsRestore.test.tsx`

**Interfaces:**
- Consumes: `NativeVoice.listCalls()`; `NativeCallInfo.meta` (JSON `TJoinProductionOptions`).
- Behaviour: once on app start (iOS only) list native calls; for each `callId` not already in `state.calls`, `ADD_CALL` with `createCallState(JSON.parse(meta), undefined, "p")` under the **same `callId`**; if anything was added, `navigate("/calls")`. Calls with unparsable `meta` are skipped and logged with `logHeadsetEvent` (key `RESTAURAR`).

- [ ] **Step 1: Write failing tests:** `restores each native call once under its own callId and opens the calls page`; `skips calls already in state` (no duplicate `ADD_CALL`); `does nothing on Android`; `skips a call with broken meta`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; all JS checks.
- [ ] **Step 5: Commit** `feat(ios): tela reencontra linhas nativas depois de recarregar`

### Task 5: Native core — plugin, session and peer connection (Swift)

**Files:**
- Modify: `ios/App/Podfile` (`pod 'WebRTC-SDK', '<pinned version>'` in target `App`; choose a version supporting iOS 14+ and building with Xcode 27; state it in the report)
- Create: `ios/App/App/Plugins/NativeVoicePlugin.swift`, `ios/App/App/Plugins/NativeVoicePlugin.m`, `ios/App/App/Plugins/NativeVoiceCall.swift`, `ios/App/App/Sounds/start-connection-451.wav`, `ios/App/App/Sounds/stop-connection-451.wav` (copies of `src/assets/sounds/…`)
- Modify: `ios/App/App/BridgeViewController.swift` (`registerPluginInstance(NativeVoicePlugin())`), `ios/App/App.xcodeproj/project.pbxproj` (3 sources + 2 resources), `docs/ios-guia-mac.md` (`pod install` now required after `git pull`)

**Interfaces:**
- Produces: the Task 1 contract natively (`CAP_PLUGIN(NativeVoicePlugin, "NativeVoice", …)` with every method). `NativeVoiceCall` = one line: POST/PATCH/DELETE via `URLSession` (Bearer when key non-empty), `RTCPeerConnection` from one shared `RTCPeerConnectionFactory`, local audio track only when `canTalk` (created disabled), data channel before answer, remote offer → answer → wait ICE gathering ≤ 5 s → PATCH, events `callState`/`activity`/`dominantSpeaker`, stats every 100 ms, output mute/volume on the remote track (volume 0..1 → source volume scale), `setMicEnabled` idempotent, remote mute (`EndpointMessage` `muteParticipant:"mute"` with `to != from`) closes the mic and emits `micChanged` source `"remoto"`.
- Plugin: registry `callId → NativeVoiceCall`; `join` for a known `callId` returns its `NativeCallInfo` without a new POST; `leave` DELETEs, closes, plays the stop cue; `listCalls`; mic permission via `AVAudioSession.recordPermission`/`requestRecordPermission`; `RTCAudioSessionConfiguration.webRTC()` set to the Global Constraints session values; cue player (`AVAudioPlayer` on the bundled wavs); start cue on first `connected`; `diag` events for join/connected/left/HTTP errors.

- [ ] **Step 1: Implement** the files above (all state on one serial/main queue; every completion hops to it).
- [ ] **Step 2: Self-review as the compiler**: imports (`WebRTC`), optionals, access levels, `@objc` selectors matching the `.m`, pbxproj IDs unique and listed in group + build phase, resources in the Resources phase, `getArray`/`getString` usage like the existing plugins.
- [ ] **Step 3: Run** `npx tsc --noEmit` and `npx vitest run` (must stay green).
- [ ] **Step 4: Commit** `feat(ios): plugin NativeVoice com WebRTC nativo (sessão, conexão, mic e saída)`

### Task 6: Native resilience — heartbeat, reconnect, interruptions, reload attach (Swift)

**Files:**
- Modify: `ios/App/App/Plugins/NativeVoiceCall.swift`, `ios/App/App/Plugins/NativeVoicePlugin.swift`, `ios/App/App/AppDelegate.swift`

**Interfaces:**
- Consumes: Task 5 types.
- Behaviour (values from Global Constraints): heartbeat every 10 s per connected call; reconnect state machine with the exact triggers/backoff/stop rule; while reconnecting emit `callState "reconnecting"` and `diag` (`RECONEXÃO`, attempt n); on success restore the user's mic state, emit `connected`, play the start cue; `leave` during reconnect cancels timers and pending attempts, DELETEs the current session; interruption observer: began → `diag` only; ended → reactivate the session, close every mic (emit `micChanged` source `"interrupção"`), play the start cue; app terminate: add `NativeVoicePlugin.leaveAllOnTerminate()` (synchronous DELETE of every current native session, ≤ 2 s total, same pattern as `CallServicePlugin.leaveSessionsOnTerminate`) and call it from `AppDelegate.applicationWillTerminate` next to the existing call — native knows the session ids even after a reconnect while JS was asleep.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Self-review as the compiler** + walk: Wi-Fi off 20 s while locked → reconnect without duplicate session; leave during backoff → no further POST; interruption with mic open → mic closed after; reload → `join` attaches.
- [ ] **Step 3: Run** JS checks (green). **Step 4: Commit** `feat(ios): reconexão, presença e interrupções no áudio nativo`

### Task 7: Native headset button and route = whole headset (Swift)

**Files:**
- Modify: `ios/App/App/Plugins/CallServicePlugin.swift` (`HeadsetButtonPlugin`: presses also handled natively; keep the `MEDIA_*` notification), `ios/App/App/Plugins/NativeVoicePlugin.swift` (observe `.intercomHeadsetButton`), `ios/App/App/Plugins/AudioRoutePlugin.swift`

**Interfaces:**
- Behaviour: press → (400 ms debounce) target = last call whose mic was opened, else first call with `canTalk`; toggle its mic, emit `micChanged {source:"fone"}`, play start (opened) / stop (closed) cue, `diag` (`FONE`, `ligou`/`desligou`, line). `AudioRoutePlugin`: session config back to the Global Constraints values; `applyRoute` sets the preferred input with the output: `bluetooth` → BT HFP/LE input, `headset` → wired/USB input, `speaker` → built-in mic + speaker override (+ `.defaultToSpeaker`), `earpiece` → built-in mic, no override; route payload keeps `input` and `name`.

- [ ] **Step 1: Implement.** **Step 2: Self-review as the compiler** + walk: one press = one toggle (JS manager inert on iOS from Task 3); route Bluetooth → `ROTA bluetooth · mic: <JBL>`.
- [ ] **Step 3: Run** JS checks. **Step 4: Commit** `feat(ios): botão do fone e rota de fone inteiro no áudio nativo`

### Task 8: Owner build and device test (owner, after the final review)

- [ ] Controller pushes; owner on the Mac: `git pull`, `npm ci`, `VITE_BACKEND_URL=https://intercom.ac24horas.com/manager npm run ios:build`, `cd ios/App && pod install`, ▶.
- [ ] Run the spec's success criteria 1–9 with the diagnostics list open; send screenshots of failures.
- [ ] Android: tag `android-v0.2.14-ac24`, CI green, APK signature `41:32:83:38`, quick regression on one Android phone.
