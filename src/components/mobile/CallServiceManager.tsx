import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { isAndroidApp } from "../../platform";
import { useGlobalState } from "../../global-state/context-provider";
import { CallService } from "../../mobile-overlay/call-service";

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

  return null;
};
