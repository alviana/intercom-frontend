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
  writeStoredAudioRoute,
} from "../../utils/android-audio-route";

/** Keeps WebRTC playback on the user-selected Android communication device. */
export const AudioRouteManager = () => {
  useEffect(() => {
    if (!isMobileApp() || !isAudioRouteAvailable()) return undefined;

    applyStoredAudioRoute();

    const listenerPromise = AudioRoute.addListener(
      "audioRouteChanged",
      (state) => {
        const { active } = state;
        logHeadsetEvent({
          at: Date.now(),
          key: "ROTA",
          action: String(active ?? "nenhuma"),
          source: "sistema",
          result: describeRouteState(state),
        });
        // iOS: changes made by the system/WebKit (e.g. falling back to the speaker) must
        // not overwrite the route the user picked; the picker stores it itself.
        if (active && !isIOSApp()) writeStoredAudioRoute(active);
      }
    );

    return () => {
      listenerPromise.then((handle) => handle.remove()).catch(() => {});
    };
  }, []);

  return null;
};
