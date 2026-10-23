import { useEffect } from "react";
import {
  AudioRoute,
  describeRouteState,
} from "../../mobile-overlay/audio-route";
import { isIOSApp, isMobileApp } from "../../platform";
import { logHeadsetEvent } from "../../mobile-overlay/headset-diagnostics";
import {
  applyStoredAudioRoute,
  isAudioRouteAvailable,
  readStoredAudioRoute,
  writeStoredAudioRoute,
} from "../../utils/android-audio-route";

/** Keeps WebRTC playback on the user-selected Android communication device. */
export const AudioRouteManager = () => {
  useEffect(() => {
    if (!isMobileApp() || !isAudioRouteAvailable()) return undefined;

    applyStoredAudioRoute();

    // iOS sends bursts of identical route events: log a line only when it changes.
    let lastLine = "";
    const listenerPromise = AudioRoute.addListener(
      "audioRouteChanged",
      (state) => {
        const { active } = state;
        const action = String(active ?? "nenhuma");
        const result = describeRouteState(state);
        const line = `${action} ${result}`;
        if (line !== lastLine) {
          lastLine = line;
          logHeadsetEvent({
            at: Date.now(),
            key: "ROTA",
            action,
            source: "sistema",
            result,
          });
        }
        // iOS: changes made by the system/WebKit (e.g. falling back to the speaker) must
        // not overwrite the route the user picked; the picker stores it itself.
        if (active && !isIOSApp()) writeStoredAudioRoute(active);
        // iOS: the stored headset appeared (or native dropped it): re-apply; it stops once
        // native's `preferred` matches.
        if (isIOSApp()) {
          const stored = readStoredAudioRoute();
          if (
            stored &&
            stored !== state.preferred &&
            (stored === "bluetooth" ||
              stored === "headset" ||
              stored.startsWith("device:")) &&
            state.routes?.some((r) => r.id === stored && r.available)
          ) {
            applyStoredAudioRoute();
          }
        }
      }
    );

    return () => {
      listenerPromise.then((handle) => handle.remove()).catch(() => {});
    };
  }, []);

  return null;
};
