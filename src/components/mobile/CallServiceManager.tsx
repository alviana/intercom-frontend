import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { isAndroidApp, isIOSApp } from "../../platform";
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

  // iOS: hold a CallKit call while in a line (keeps audio/mic when locked);
  // the cleanup ends it on leaving the last line and on unmount.
  useEffect(() => {
    if (!inCall || !isIOSApp() || !Capacitor.isPluginAvailable("CallService"))
      return;
    CallService.start().catch(() => {});
    return () => {
      CallService.stop().catch(() => {});
    };
  }, [inCall]);

  // With the screen off the WebView's timers are throttled and the JS heartbeat
  // stops reaching the server (user drops out of the participant list while
  // audio continues), so the native service sends heartbeats for these sessions too.
  const sessionIdsKey = Object.values(state.calls)
    .map((call) => call.sessionId)
    .filter((id): id is string => !!id)
    .sort()
    .join(",");
  useEffect(() => {
    if (!isAndroidApp() || !Capacitor.isPluginAvailable("CallService")) return;
    CallService.setSessions({
      baseUrl: getApiBaseUrl(),
      apiKey: getApiKey() ?? "",
      sessionIds: sessionIdsKey ? sessionIdsKey.split(",") : [],
    }).catch(() => {});
  }, [sessionIdsKey]);

  return null;
};
