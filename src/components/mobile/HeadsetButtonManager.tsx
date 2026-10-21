import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { useGlobalState } from "../../global-state/context-provider";
import {
  HeadsetButton,
  TAP_KEYS,
  type HeadsetButtonEvent,
} from "../../mobile-overlay/headset-button";
import { logHeadsetEvent } from "../../mobile-overlay/headset-diagnostics";
import { resolveHeadsetCallId } from "../../mobile-overlay/headset-target";
import {
  canTalkOnCall,
  getSortedCallIds,
} from "../../mobile-overlay/overlay-call-state";
import { getCallHandlers } from "../../mobile-overlay/action-handlers";
import { requestOverlaySync } from "../../mobile-overlay/production-line-bridge";

const DEBOUNCE_MS = 400;

export const HeadsetButtonManager = () => {
  const [state] = useGlobalState();
  const callsRef = useRef(state.calls);
  callsRef.current = state.calls;
  const lastTapRef = useRef(-Infinity);

  useEffect(() => {
    if (!Capacitor.isPluginAvailable("HeadsetButton")) return;
    const handle = (ev: HeadsetButtonEvent) => {
      const done = (result: string) =>
        logHeadsetEvent({
          at: Date.now(),
          key: ev.key,
          action: ev.action,
          source: ev.source,
          result,
        });
      if (ev.action !== "down") return done("ignorado: up");
      if (!TAP_KEYS.has(ev.key)) return done("ignorado: tecla sem função");
      const now = Date.now();
      if (now - lastTapRef.current < DEBOUNCE_MS)
        return done("ignorado: repetido");
      lastTapRef.current = now;
      const calls = callsRef.current;
      const id = resolveHeadsetCallId(getSortedCallIds(calls), (c) =>
        canTalkOnCall(calls[c])
      );
      if (!id) return done("ignorado: sem linha");
      const toggle = getCallHandlers(id)?.toggle_input_mute;
      if (!toggle) return done(`ignorado: sem controle: ${id}`);
      toggle();
      requestOverlaySync();
      done(`alternou microfone: ${id}`);
    };
    let removed = false;
    let remove: (() => void) | undefined;
    HeadsetButton.addListener("headsetButton", handle)
      .then((h) => {
        if (removed) h.remove();
        else remove = () => h.remove();
      })
      .catch((err) => console.warn("HeadsetButton: erro ao registrar", err));
    return () => {
      removed = true;
      remove?.();
    };
  }, []);

  return null;
};
