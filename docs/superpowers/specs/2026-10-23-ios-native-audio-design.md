# iOS native audio — design

Status: for owner approval (2026-10-23), builder-checked. Supersedes the WebKit-audio approach of
`2026-10-21-headset-ptt-and-ios.md` for iOS only.

## Intent and why

The team uses iPhones in the field as an intercom radio: join one line, put on a headset,
phone in the pocket, screen locked, talk and listen, and turn their own mic on/off with the
headset button. In the Capacitor app the iPhone's audio is owned by WebKit (the WKWebView's
GPU process runs its own AVAudioSession and re-applies its config on every capture start).
On device this made the iPhone mic win over the headset mic (WebKit bug 282939 class),
caused route-change bursts, and broke the headset button whenever the app's session was
aligned with WebKit's. Three fix rounds inside the WebView failed. Decision (owner,
2026-10-23): on iOS, move all call audio out of the WebView into native code. The React UI
stays.

## Goals (MVP, owner's words, in priority order)

1. Use the headset's mic: wired, EarPods, generic Bluetooth (tested with a JBL TUNE510BT).
2. Keep working in background and with the iPhone locked (hear and talk, 10+ minutes),
   staying "active" in the participant list.
3. Headset button toggles the mic, also while locked, with an audible confirmation.
4. Reconnect automatically when the connection drops (e.g. 4G flapping), also while locked.
5. Keep what already works: swiping the app away leaves no ghost user; lock-screen widget
   (Live Activity) stays off in v1.

UI parity on iPhone (owner uses all of these): mic on/off, mute the line's sound, volume
(system volume buttons; the slider is already hidden on iOS), push-to-talk (hold). Also keep:
"who is talking" indicators, remote mute (someone silences you / you silence someone),
enter/leave cues, program-line ducking and listen-only rules.

Usage: almost always one line per person; sometimes one work line + the "Áudio programa"
line (listen-only) at the same time. The director, who joins many lines, uses an Android
tablet/phone with Chrome — not iOS.

## Non-goals

- Android, desktop/Chrome and the web build: unchanged (no behaviour change, same code paths).
- PWA on iPhone (researched: WebKit mutes web-app capture when locked/backgrounded).
- CallKit (a call turns Bluetooth presses into "hang up"; refused hang-ups dropped the headset).
- Lock-screen widget / Live Activity.
- Companion/Stream Deck control specifics beyond what JS already does with the same state.

## Anti-goals (failure even if it "works")

- Any regression on Android.
- The headset button only working with the screen on, or toggling twice / ending in the
  wrong state, or no audible feedback.
- Silent mic: the UI shows the mic open while nothing is sent, or the headset is chosen while
  the iPhone mic is used.
- Ghost or duplicate users in the line (after swipe-away, reconnect, or reload).
- A build that the owner has to iterate on blindly: every native change must log enough in
  the in-app "Teste do botão do fone" diagnostics list to diagnose from one screenshot.

## Constraints

- Capacitor 6.2.1, iOS project `ios/App` with CocoaPods; built by the owner on a Mac with
  Xcode 27 (iOS 26 SDK), Swift 5, deployment target iOS 16.1, free Apple ID (Personal Team,
  7-day expiry, no push/VoIP push). No Swift compiler on the dev machine (Windows): native code
  is reviewed by reading before each owner build.
- New files in `ios/App/App` need `project.pbxproj` entries (hand-edited; no Xcode here). Prefer
  adding code to existing Swift/ObjC files, or add files with care and have the review check
  the pbxproj edits.
- `UIBackgroundModes` already contains `audio` (and `voip`).
- Server: Eyevinn intercom-manager v4.0.0 at `https://intercom.ac24horas.com/manager`, API base
  from `getApiBaseUrl()` (`…/api/v1/`), optional `Authorization: Bearer <key>` from `getApiKey()`
  (our server has no manager key). Routes (verified in the manager source):
  - `POST session/` body `{productionId, lineId, username}` → `{sdp, sessionId}`; the **server
    (SMB) creates the SDP offer**, the client answers.
  - `PATCH session/{id}` body `{sdpAnswer}`.
  - `DELETE session/{id}` (200; 500 if already gone — harmless).
  - `GET heartbeat/{id}` every 10 s; `410` = session gone. Server marks a user inactive after
    60 s without heartbeat and removes it after 100 s.
- Current JS behaviour to mirror (from the code inventory):
  - No trickle ICE: wait for ICE gathering (best effort, 5 s cap), then PATCH the answer.
  - ICE servers: `stun:stun.l.google.com:19302`, `stun:stun1.l.google.com:19302`; no TURN.
  - The client creates data channel `"conference-data-channel"` (ordered) before answering.
    Received messages: `{type:"DominantSpeaker", endpoint}` and
    `{type:"EndpointMessage", to, from, payload:{muteParticipant:"mute"}}` (remote mute when
    `to !== from`). Sent: `{type:"EndpointMessage", to:<endpointId>, payload:{muteParticipant:"mute"}}`.
  - Activity: "someone talking" = any inbound audio level > 0.02, or local (media-source)
    level > 0.02, sampled every 100 ms; UI debounces it.
  - Mic starts muted on join. Program-line rules: a non-program user on a program-output line is
    listen-only; a program user on a normal line cannot talk (see `canTalkOnCall`).
  - Volume default 0.75 per line; program line ducked to 0.2× while others speak.
  - Cues: `assets/sounds/start-connection-451.wav` on connected, `stop-connection-451.wav` on
    leave; the headset toggle reuses them (open = start, close = stop).
- Existing native pieces to keep and reuse: `HeadsetButtonPlugin` (MPRemoteCommandCenter +
  Now Playing; presses arrive as `MEDIA_*` — verified on device with session
  `.playAndRecord/.voiceChat/[.allowBluetoothHFP]`, non-mixable), `AudioRoutePlugin` (route list
  with port `name`), `CallServicePlugin.setSessions` + `leaveSessionsOnTerminate` (verified:
  swipe-away removes the user), the diagnostics log (`logHeadsetEvent`).

## Decided (by the owner)

- Native audio on iOS for all call audio; React UI unchanged in look and controls.
- Auto-reconnect, also while locked.
- Multiple simultaneous lines supported on iOS (work line + program line at least).
- Widget off; no CallKit; Android untouched.
- **Audio interruptions** (cellular call, Siri, alarm, another app's audio such as a WhatsApp
  voice note or YouTube): the user **stays in the line** during the interruption (heartbeats
  continue, "ativo" on the PC). When the interruption ends, call audio **resumes by itself** and
  the start cue plays, but the **mic comes back closed** (never leak a private call or nearby
  conversation); the user reopens it with the headset button or the screen.
- **WebView reload while in a line** (iOS kills the web process under memory pressure, the error
  screen's reload, a JS crash): the **native calls keep running** (the user keeps hearing and
  talking in the pocket). When JS starts again it asks native for its live calls, rebuilds
  `state.calls` from them and shows those lines again (navigating back to the calls screen). No
  duplicate session: JS must not create a new session for a line native already holds.

## Decided (my calls — owner may veto)

- **One native plugin owns each iOS call end to end**: session HTTP (POST/PATCH/DELETE,
  heartbeat), peer connection, mic capture, playback, mute/volume, data channel, audio levels,
  reconnect. Reason: with the WebView no longer capturing, WebKit may suspend JS while locked,
  so anything that must work locked (heartbeat, headset button, reconnect, cues) cannot depend
  on JS. JS sends commands and renders state from native events.
- **WebRTC library**: Google WebRTC iOS build via CocoaPods (e.g. the `WebRTC-SDK` pod). The
  exact pod/version is the builder's choice, constrained by iOS 16.1 and Xcode 27.
- **Audio session owned by the app** (WebKit no longer captures, so no fight): `.playAndRecord`,
  mode `.voiceChat`, options `[.allowBluetoothHFP]`, non-mixable (keeps Now Playing for the
  headset button — the exact config verified working for the button). If WebRTC's own
  `RTCAudioSession` manages the session, configure it to these values (manual audio / no
  automatic reconfiguration that would override them).
- **"Saída de áudio" chooses the whole headset on iOS** (mic + output): selecting a headset sets
  the preferred input to that port and the output follows; speaker selects built-in mic +
  speaker. The separate "Microfone" field does not apply on iOS (hide it or ignore it on iOS —
  builder's choice, as long as Android/web keep it).
- **Headset button handled natively**: a press toggles the mic of the target line directly
  (target = last line where the mic was opened, else the first line the user can talk on —
  same rule as today's `resolveHeadsetCallId`), plays the cue natively, and emits an event so JS
  updates the UI. JS must not toggle a second time on iOS. 400 ms debounce as today.
- **Reconnect policy**: on peer connection `failed`, on `disconnected` lasting > 5 s, or on a
  heartbeat `410`: tear down that line (best-effort DELETE of the old session), then re-join with
  the same parameters, retrying with backoff (2 s, 4 s, 8 s, then every 15 s) until it connects or
  the user leaves the line. Restore the mic state the user had (open stays open). Play the start
  cue when it reconnects. The UI shows a "reconectando…" state for that line instead of the
  current permanent failure warning.
- **Leave**: user leaves → DELETE + teardown; app swiped away → existing
  `leaveSessionsOnTerminate` covers native sessions too (one source of truth for session ids).
- **Diagnostics**: native emits entries into the existing "Teste do botão do fone" list for: join
  / connected / disconnected / reconnect attempt n / reconnected, mic on/off with source
  (button/screen/remote/ptt), route + active input port name, heartbeat failures.

- **Cues on iOS are played natively** (bundle the two wav files), so they work while locked and
  JS does not also play them on iOS.
- **Mic permission on iOS is requested natively** (AVAudioSession record permission) instead of
  the startup `getUserMedia` probe, so WebKit never opens the mic on iOS.
- **Reconnect order**: best-effort DELETE of the old session before the new POST; stop retrying
  (and surface the error) when the server says the line or production no longer exists
  (POST 404/400-class), instead of retrying forever.
- **Mic off = track disabled, capture keeps running** (no capture restart on every toggle, so no
  route churn and instant mic on).

## Left to the builder

- Plugin name, API shape (commands/events), how JS state (`state.calls[id]` fields such as
  `connectionState`, `sessionId`, `dominantSpeaker`, `audioLevelAboveThreshold`,
  `isRemotelyMuted`, and the UI's reads of `mediaStreamInput`/`audioElements`) is fed on iOS,
  and how the iOS branch is selected in the production-line components without touching the
  Android/web path.
- Threading, Swift file layout (respecting the pbxproj constraint), pod/version.
- Exact UI wording for the reconnecting state (pt-BR).
- Test strategy for JS (Vitest) and the read-only native review; the on-device test matrix the
  owner runs.

## Success criteria (owner's device test)

1. With the JBL connected and "Saída de áudio" = Bluetooth: joining a line uses the JBL mic on
   the first try (PC confirms), no manual toggling.
2. Wired EarPods: same, with the EarPods mic.
3. Locked 10 min: hears and is heard; stays "ativo" on the PC list.
4. Headset button while locked: each press toggles the mic once, cue heard, PC confirms.
5. Turn Wi-Fi off/on (or walk out of coverage) while locked: the line reconnects by itself,
   cue heard, no duplicate user on the PC list.
6. Work line + "Áudio programa": both heard; button toggles only the work line's mic.
7. Swipe the app away: user leaves the PC list within seconds. No widget appears.
8. While in a line with the mic open, receive a cellular call / play a WhatsApp voice note:
   user stays "ativo"; afterwards audio resumes with the cue and the mic is closed.
9. Android APK built from the same branch behaves exactly as v0.2.13.
