import { useEffect, useRef } from "react";
import { CallState } from "../../global-state/types";
import {
  canTalkOnCall,
  getSortedCallIds,
} from "../../mobile-overlay/overlay-call-state";

const DEBOUNCE_MS = 400;
// A headset (dis)connecting sends play/pause too: ignore them for a while.
const DEVICE_CHANGE_QUIET_MS = 2000;

/** The web mic mute is the track's enabled flag (see use-mute-input). */
const micOpen = (call: CallState | undefined): boolean =>
  !!call?.mediaStreamInput?.getAudioTracks()[0]?.enabled;

/**
 * Phone browser (PWA) only: the headset button opens and closes the mic. "pause" only closes and
 * "play" only opens, so a system pause (AirPod out of the ear, headset gone) never opens the mic.
 * Best effort — browsers only forward the button while the page plays audio.
 */
export const useMediaSessionMicToggle = ({
  enabled,
  calls,
  callActionHandlers,
  onToggled,
}: {
  enabled: boolean;
  calls: Record<string, CallState>;
  callActionHandlers: React.MutableRefObject<
    Record<string, Record<string, () => void>>
  >;
  onToggled: (open: boolean) => void;
}) => {
  const callsRef = useRef(calls);
  callsRef.current = calls;
  const onToggledRef = useRef(onToggled);
  onToggledRef.current = onToggled;

  useEffect(() => {
    if (
      !enabled ||
      !("mediaSession" in navigator) ||
      !("MediaMetadata" in window)
    )
      return undefined;
    const session = navigator.mediaSession;
    let last = -Infinity;
    let lastDeviceChange = -Infinity;

    const talkIds = () =>
      getSortedCallIds(callsRef.current).filter((id) =>
        canTalkOnCall(callsRef.current[id])
      );
    const anyOpen = () => talkIds().some((id) => micOpen(callsRef.current[id]));
    // The headset button sends "pause" while playing and "play" while paused.
    const showState = () => {
      session.playbackState = anyOpen() ? "playing" : "paused";
    };

    const act = (want: "open" | "close" | "toggle") => {
      const now = Date.now();
      if (now - last < DEBOUNCE_MS) return;
      if (now - lastDeviceChange < DEVICE_CHANGE_QUIET_MS) return;
      last = now;
      const open = anyOpen();
      const close = want === "close" || (want === "toggle" && open);
      const ids = talkIds();
      let toFlip: string[] = [];
      if (close) toFlip = ids.filter((id) => micOpen(callsRef.current[id]));
      else if (!open) toFlip = ids.slice(0, 1);
      toFlip.forEach((id) =>
        callActionHandlers.current[id]?.toggle_input_mute?.()
      );
      if (toFlip.length > 0) onToggledRef.current(anyOpen());
      showState();
    };

    const onDeviceChange = () => {
      lastDeviceChange = Date.now();
    };
    navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange);

    const handlers: [MediaSessionAction, () => void][] = [
      ["play", () => act("open")],
      ["pause", () => act("close")],
      ["togglemicrophone" as MediaSessionAction, () => act("toggle")],
    ];
    session.metadata = new MediaMetadata({ title: "Intercom ac24horas" });
    showState();
    // The mic also changes from the screen: keep the button's direction current.
    const sync = window.setInterval(showState, 1000);
    handlers.forEach(([a, h]) => {
      try {
        session.setActionHandler(a, h);
      } catch {
        // Action not supported by this browser.
      }
    });
    return () => {
      window.clearInterval(sync);
      navigator.mediaDevices?.removeEventListener?.(
        "devicechange",
        onDeviceChange
      );
      handlers.forEach(([a]) => {
        try {
          session.setActionHandler(a, null);
        } catch {
          // ignore
        }
      });
      session.metadata = null;
      session.playbackState = "none";
    };
  }, [enabled, callActionHandlers]);
};
