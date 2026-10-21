# Headset-button talk control (Android + iOS) and iOS background app — spec

Date: 2026-10-21 · Product: "Intercom ac24horas" (fork of Eyevinn Open Intercom frontend, Capacitor 6)
Branch: `ac24/ptbr-branding` · Backend: `https://intercom.ac24horas.com/manager` (self-hosted, no WHIP)

## Goal
Let a team member open/close their microphone on an intercom line with the **button on their headset**
(wired and Bluetooth), on **Android and iPhone**, with the **screen off and the app in the background**.

## Decisions (from the product owner)
1. **Button behaviour:** a **tap** on the headset button toggles the microphone of the target line
   (closed → open/latched, open → closed). "Hold to talk" stays on the on-screen button and the widget.
   - Platform finding (AOSP `MediaSessionService`): the headset hook / play-pause key is a "voice key".
     Android holds the DOWN event until release and, on a **long press, launches the voice assistant
     instead of delivering the key**. iOS delivers headset buttons only as discrete commands.
     **Hold-to-talk on the headset button is therefore not possible on either platform.**
2. **Target line:** the **line where the user last opened the microphone** (from the app, the widget or
   the headset). If none yet, or that line was left: the **first line** in widget order
   (`getSortedCallIds`). The widget marks the target line with `🎧 ` before its name.
3. Lines where the user may not talk (program-output line for a non-program user) are never targeted
   for talk; a tap there is ignored and logged.
4. **iPhone:** 1–3 devices, **free Apple ID** + the owner's Mac (reinstall every 7 days, max 3 devices).
   Headsets in use: **AirPods / Bluetooth** and **wired EarPods**.
   iOS must work with **screen locked and app in background**, including the headset button.
5. Out of scope: login/Basic Auth, WHIP/external audio, App Store / TestFlight distribution.

## Platform constraints found
- Android media keys reach the app through an **active `MediaSession` in `PLAYING` state**; short presses
  arrive as DOWN+UP at release, after the ~300 ms multi-tap window.
- Android Bluetooth in **SCO** (headset mic in use): per AOSP `HeadsetStateMachine.processKeyPressed`,
  an HSP key press with SCO audio connected and no telephony call **disconnects SCO audio**. Behaviour
  varies by headset (HFP headsets may send AVRCP play/pause instead). **Must be measured on the team's
  real headsets** with a built-in test screen before promising Bluetooth-mic support.
- iOS: WebKit mutes WKWebView `getUserMedia` in the background unless `UIBackgroundModes` contains
  `audio` (already present, with `voip`). Reported working on iOS 17.5; one unclear report of muting on
  iOS 18.7 → **must be verified on the owner's iPhone first**.
- iOS: the app already starts a **CallKit** call (`CallServicePlugin.swift`). During a CallKit call,
  AirPods "press once to mute" arrives as `CXSetMutedCallAction`; a wired EarPods centre press may
  arrive as `CXEndCallAction` (hang up). Both must toggle the mic and **must not end the intercom call**.
- iOS code cannot be compiled on the Windows dev machine: Swift changes are verified by the owner
  building in Xcode on the Mac (Xcode with the iOS 26 SDK, because `AudioRoutePlugin.swift` uses
  `.allowBluetoothHFP`).

## Acceptance
- Android: with a wired headset and with a Bluetooth headset (listening via Bluetooth), screen off for
  2 min, a tap opens the mic on the target line (PC hears), another tap closes it.
- The settings screen "Teste do botão do fone" lists the last headset events received, so the team can
  check each headset model (including Bluetooth with the headset mic in use).
- iOS: screen locked 10 min → still hears and is heard; a tap on AirPods / EarPods toggles the mic and
  the CallKit call stays up; the user stays "ativo" in the participant list.
