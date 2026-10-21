import { useEffect, useState } from "react";

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
      navigator.mediaDevices
        .getUserMedia({ audio: true, video: false })
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
