import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { isAndroidApp, isIOSApp, isMobileApp } from "../../platform";
import { useGlobalState } from "../../global-state/context-provider";
import { CallService } from "../../mobile-overlay/call-service";
import { getApiBaseUrl, getApiKey } from "../../config";

export const CallServiceManager = () => {
  const [state] = useGlobalState();

  useEffect(() => {
    if (!isAndroidApp() || !Capacitor.isPluginAvailable("CallService")) return;
    let mounted = true;
    (async () => {
      try {
        await CallService.requestNotificationPermission();
        if (mounted) await CallService.start();
      } catch (_) {}
    })();
    return () => {
      mounted = false;
      (async () => {
        try {
          await CallService.stop();
        } catch (_) {}
      })();
    };
  }, []);

  // Restart on join so the native service adds the microphone foreground type
  // (only allowed once RECORD_AUDIO is granted) and audio survives screen-off.
  const inCall = Object.keys(state.calls).length > 0;
  useEffect(() => {
    if (
      !inCall ||
      !isAndroidApp() ||
      !Capacitor.isPluginAvailable("CallService")
    )
      return;
    CallService.start().catch(() => {});
  }, [inCall]);

  // iOS: no CallKit call. During a call a Bluetooth headset press means "hang up" (HFP);
  // refusing it dropped the headset link after the first press. The audio background
  // mode alone keeps audio and mic alive when locked (device test 2026-10-23), and presses
  // arrive as play/pause instead. Still sends stop, so a call left by an older build ends.
  useEffect(() => {
    if (!isIOSApp() || !Capacitor.isPluginAvailable("CallService")) return;
    CallService.stop().catch(() => {});
  }, [inCall]);

  useEffect(() => {
    if (!isIOSApp() || !Capacitor.isPluginAvailable("CallService")) return;
    return () => {
      CallService.stop().catch(() => {});
    };
  }, []);

  // With the screen off the WebView's timers are throttled and the JS heartbeat
  // stops reaching the server (user drops out of the participant list while
  // audio continues), so the native service sends heartbeats for these sessions too.
  const sessionIdsKey = Object.values(state.calls)
    .map((call) => call.sessionId)
    .filter((id): id is string => !!id)
    .sort()
    .join(",");
  // Android heartbeats them natively; iOS leaves them when the app is swiped away.
  useEffect(() => {
    if (!isMobileApp() || !Capacitor.isPluginAvailable("CallService")) return;
    CallService.setSessions({
      baseUrl: getApiBaseUrl(),
      apiKey: getApiKey() ?? "",
      sessionIds: sessionIdsKey ? sessionIdsKey.split(",") : [],
    }).catch(() => {});
  }, [sessionIdsKey]);

  return null;
};
