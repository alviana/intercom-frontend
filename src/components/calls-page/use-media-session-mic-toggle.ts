import { useEffect, useRef } from "react";
import { CallState } from "../../global-state/types";
import { resolveHeadsetCallId } from "../../mobile-overlay/headset-target";
import {
  canTalkOnCall,
  getSortedCallIds,
} from "../../mobile-overlay/overlay-call-state";

// Headset play/pause and the mic key of the media controls, when the browser forwards them.
const ACTIONS = ["play", "pause", "togglemicrophone"] as const;
const DEBOUNCE_MS = 400;

/**
 * Phone browser (PWA) only: the headset button toggles the mic of the line the user talks on.
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
  onToggled: (wasMuted: boolean) => void;
}) => {
  const callsRef = useRef(calls);
  callsRef.current = calls;
  const onToggledRef = useRef(onToggled);
  onToggledRef.current = onToggled;

  useEffect(() => {
    if (!enabled || !("mediaSession" in navigator)) return undefined;
    const session = navigator.mediaSession;
    let last = -Infinity;
    const toggle = () => {
      const now = Date.now();
      if (now - last < DEBOUNCE_MS) return;
      last = now;
      const all = callsRef.current;
      const id = resolveHeadsetCallId(getSortedCallIds(all), (c) =>
        canTalkOnCall(all[c])
      );
      const handler = id && callActionHandlers.current[id]?.toggle_input_mute;
      if (!id || !handler) return;
      // The web mic mute is the track's enabled flag.
      const track = all[id]?.mediaStreamInput?.getAudioTracks()[0];
      const wasMuted = !track?.enabled;
      handler();
      onToggledRef.current(wasMuted);
      // Keeps the system controls on "playing", so the next press arrives too.
      session.playbackState = "playing";
    };
    session.metadata = new MediaMetadata({ title: "Intercom ac24horas" });
    session.playbackState = "playing";
    ACTIONS.forEach((a) => {
      try {
        session.setActionHandler(a as MediaSessionAction, toggle);
      } catch {
        // Action not supported by this browser.
      }
    });
    return () => {
      ACTIONS.forEach((a) => {
        try {
          session.setActionHandler(a as MediaSessionAction, null);
        } catch {
          // ignore
        }
      });
    };
  }, [enabled, callActionHandlers]);
};
