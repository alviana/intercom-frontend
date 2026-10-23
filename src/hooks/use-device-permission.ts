import { useEffect, useState } from "react";
import { isIOSApp } from "../platform";
import { NativeVoice } from "../mobile-overlay/native-voice";

export const useDevicePermissions = ({
  continueToApp,
}: {
  continueToApp: boolean;
}) => {
  const [permission, setPermission] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!continueToApp) return undefined;

    let cancelled = false;
    let pending = false;
    let granted = false;

    const request = () => {
      if (cancelled || pending || granted) return;
      pending = true;
      // iOS: WebKit must never open the mic; ask the native layer instead.
      const ask = isIOSApp()
        ? NativeVoice.checkMicPermission()
            .then(
              ({ granted: ok }) =>
                ok || NativeVoice.requestMicPermission().then((r) => r.granted)
            )
            .then((ok) => {
              if (!ok) throw new Error("mic denied");
            })
        : navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      ask
        .then(() => {
          if (cancelled) return;
          granted = true;
          setDenied(false);
          setPermission(true);
        })
        .catch(() => {
          if (cancelled) return;
          setDenied(true);
          setPermission(false);
        })
        .finally(() => {
          pending = false;
        });
    };

    // On first launch the mobile app's own permission flow (or a system settings
    // screen) can interrupt this request; retry when the app is in front again.
    const retryWhenVisible = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", retryWhenVisible);
    window.addEventListener("focus", retryWhenVisible);

    request();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", retryWhenVisible);
      window.removeEventListener("focus", retryWhenVisible);
    };
  }, [continueToApp]);

  return { permission, denied };
};
