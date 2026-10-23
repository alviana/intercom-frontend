import { useEffect } from "react";
import { isIOSApp } from "../../platform";
import { NativeVoice } from "../../mobile-overlay/native-voice";
import { logHeadsetEvent } from "../../mobile-overlay/headset-diagnostics";
import {
  applyCallKitMode,
  readStoredCallKitMode,
} from "../../utils/ios-callkit-mode";

/** iOS: shows the native layer's diagnostics in the headset log. */
export const NativeVoiceDiagnostics = () => {
  useEffect(() => {
    if (!isIOSApp()) return undefined;
    // App start: the native layer forgets the experimental CallKit switch on every launch.
    applyCallKitMode(readStoredCallKitMode());
    let removed = false;
    let remove: (() => void) | undefined;
    NativeVoice.addListener("diag", ({ key, action, result }) =>
      logHeadsetEvent({ at: Date.now(), key, action, source: "nativo", result })
    )
      .then((h) => {
        if (removed) h.remove();
        else remove = () => h.remove();
      })
      .catch((err) => console.warn("NativeVoice: erro ao registrar diag", err));
    return () => {
      removed = true;
      remove?.();
    };
  }, []);

  return null;
};
