import { useCallback, useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { useGlobalState } from "../../global-state/context-provider";
import { OverlayBubble } from "../../mobile-overlay/bubble";
import {
  getCallHandlers,
  getCallState,
} from "../../mobile-overlay/action-handlers";
import {
  buildOverlayRowState,
  resolveCallIdAtIndex,
} from "../../mobile-overlay/overlay-call-state";
import { setOverlaySyncListener } from "../../mobile-overlay/production-line-bridge";
import { logHeadsetEvent } from "../../mobile-overlay/headset-diagnostics";
import { isAndroidApp, isIOSApp, isMobileApp } from "../../platform";

// Widget mic taps go to the "Teste do botão do fone" log, next to the MIC on/off changes.
const logWidgetMic = (value: boolean | undefined, result: string) =>
  logHeadsetEvent({
    at: Date.now(),
    key: "WIDGET",
    action: value === undefined ? "alternar" : value ? "ligar" : "desligar",
    source: "widget",
    result,
  });

const SYNC_DEBOUNCE_MS = 150;
const DUPLICATE_ACTION_WINDOW_MS = 100;
const OPTIMISTIC_STATE_TTL_MS = 3_000;

type OptimisticCallState = {
  listen?: { value: boolean; until: number };
  latch?: { value: boolean; until: number };
};

export const BubbleActionHandler = () => {
  const [state] = useGlobalState();
  const callsRef = useRef(state.calls);
  callsRef.current = state.calls;

  const pttHeldCountRef = useRef(0);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActionRef = useRef<{ key: string; at: number } | null>(null);
  const pttActiveIdsRef = useRef<Set<string>>(new Set());
  const optimisticStateRef = useRef<Record<string, OptimisticCallState>>({});

  const recordOverlayDebug = useCallback(
    async (
      reason: string,
      extras?: {
        running?: boolean;
        ids?: string[];
        labels?: string[];
        labelSources?: string[];
        action?: string;
        index?: number;
        targetId?: string;
        handlerActions?: string[];
        value?: boolean;
      }
    ) => {
      if (!isIOSApp()) return;
      const calls = callsRef.current || {};
      try {
        await OverlayBubble.recordDebugState({
          reason,
          platform: Capacitor.getPlatform?.() || "unknown",
          callCount: Object.keys(calls).length,
          hasCalls: Object.keys(calls).length > 0,
          documentHidden: document.hidden,
          documentHasFocus: document.hasFocus(),
          ...extras,
        });
      } catch (_) {
        // ignore diagnostics
      }
    },
    []
  );

  const pushOverlayState = useCallback(
    async (options?: {
      requireRunning?: boolean;
      allowDuringPtt?: boolean;
    }) => {
      try {
        if (!Capacitor.isPluginAvailable("OverlayBubble")) {
          return;
        }
        const running = await OverlayBubble.isRunning();
        const calls = callsRef.current || {};
        const {
          latch,
          listen,
          micAllowed,
          listenAllowed,
          ids,
          labels,
          labelSources,
          activity,
        } = buildOverlayRowState(calls as Record<string, any>);
        const now = Date.now();
        ids.forEach((id, index) => {
          const optimistic = optimisticStateRef.current[id];
          if (!optimistic) return;

          if (optimistic.listen) {
            if (optimistic.listen.until <= now) {
              delete optimistic.listen;
            } else {
              listen[index] = optimistic.listen.value;
            }
          }

          if (optimistic.latch) {
            if (optimistic.latch.until <= now) {
              delete optimistic.latch;
            } else {
              latch[index] = optimistic.latch.value;
            }
          }

          if (!optimistic.listen && !optimistic.latch) {
            delete optimisticStateRef.current[id];
          }
        });
        pttActiveIdsRef.current.forEach((id) => {
          if (!ids.includes(id)) pttActiveIdsRef.current.delete(id);
        });
        pttHeldCountRef.current = pttActiveIdsRef.current.size;
        if (pttHeldCountRef.current > 0 && !options?.allowDuringPtt) return;
        await recordOverlayDebug("pushOverlayState", {
          running: !!running?.running,
          ids,
          labels,
          labelSources,
        });
        if (!running?.running && options?.requireRunning !== false) return;
        await OverlayBubble.setCallRows({
          count: ids.length,
          ids,
          latch,
          listen,
          micAllowed,
          listenAllowed,
          labels,
          labelSources,
          activity,
        });
      } catch (_) {
        // ignore overlay sync errors
      }
    },
    [recordOverlayDebug]
  );

  const setOptimisticCallState = useCallback(
    (callId: string, action: string, value: boolean) => {
      const current = optimisticStateRef.current[callId] || {};
      const update = { value, until: Date.now() + OPTIMISTIC_STATE_TTL_MS };
      if (action === "listen") {
        current.listen = update;
      } else if (action === "talk_latch") {
        current.latch = update;
      }
      optimisticStateRef.current[callId] = current;
    },
    []
  );

  const scheduleOverlaySync = useCallback(() => {
    if (pttHeldCountRef.current > 0) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      void pushOverlayState(isIOSApp() ? { requireRunning: false } : undefined);
    }, SYNC_DEBOUNCE_MS);
  }, [pushOverlayState]);

  const syncOverlayVisibility = useCallback(async () => {
    try {
      if (!Capacitor.isPluginAvailable("OverlayBubble")) return;
      const hasCalls = Object.keys(callsRef.current || {}).length > 0;
      await recordOverlayDebug("syncOverlayVisibility", { running: false });
      if (!hasCalls) {
        await OverlayBubble.hide();
        return;
      }
      if (isIOSApp()) {
        // iOS v1 ships without the lock-screen widget (its mic state went stale); hide()
        // also ends a Live Activity left by an older build.
        await OverlayBubble.hide();
        return;
      }
      if (isAndroidApp() && (document.hidden || !document.hasFocus())) {
        const granted = await OverlayBubble.canDrawOverlays();
        if (!granted.granted) {
          await OverlayBubble.openOverlayPermission();
        } else {
          await OverlayBubble.show();
          await pushOverlayState();
        }
      } else {
        await OverlayBubble.hide();
      }
    } catch (_) {
      // ignore
    }
  }, [pushOverlayState, recordOverlayDebug]);

  useEffect(() => {
    if (!isMobileApp()) return undefined;
    void recordOverlayDebug("handler-mounted");
    setOverlaySyncListener(scheduleOverlaySync);
    return () => {
      setOverlaySyncListener(null);
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      if (isIOSApp()) return;
      void (async () => {
        try {
          if (!Capacitor.isPluginAvailable("OverlayBubble")) return;
          await OverlayBubble.hide();
        } catch (_) {
          // ignore overlay teardown errors
        }
      })();
    };
  }, [scheduleOverlaySync, recordOverlayDebug]);

  useEffect(() => {
    if (!isMobileApp()) return;
    if (!Capacitor.isPluginAvailable("OverlayBubble")) return;

    const handleAction = async (e: {
      action?: string;
      index?: number;
      value?: boolean;
    }) => {
      const action = e?.action;
      const index = e?.index;
      const value = e?.value;
      if (!action) return;

      const now = Date.now();
      const actionKey = `${action}:${typeof index === "number" ? index : "all"}:${
        typeof value === "boolean" ? String(value) : "toggle"
      }`;
      const lastAction = lastActionRef.current;
      if (
        lastAction?.key === actionKey &&
        now - lastAction.at < DUPLICATE_ACTION_WINDOW_MS
      ) {
        await recordOverlayDebug("bubbleAction-js-duplicate", {
          action,
          index,
        });
        if (action === "talk_latch") logWidgetMic(value, "ignorado: duplicado");
        return;
      }
      lastActionRef.current = { key: actionKey, at: now };

      const calls = callsRef.current || {};
      const targetId = resolveCallIdAtIndex(calls, index);
      const targetHandlers = targetId ? getCallHandlers(targetId) : undefined;
      await recordOverlayDebug("bubbleAction-js", {
        action,
        index,
        value,
        targetId,
        handlerActions: targetHandlers
          ? Object.keys(targetHandlers).sort()
          : [],
      });

      if (action === "listen") {
        if (targetId) {
          if (typeof value === "boolean") {
            setOptimisticCallState(targetId, action, value);
          }
          const callState = getCallState(targetId);
          const isListening = callState ? !callState.isOutputMuted : undefined;
          if (
            typeof value !== "boolean" ||
            isListening === undefined ||
            isListening !== value
          ) {
            targetHandlers?.toggle_output_mute?.();
          }
        } else if (typeof index === "number") {
          await recordOverlayDebug("bubbleAction-js-stale-index", {
            action,
            index,
            value,
          });
        } else {
          Object.keys(calls)
            .sort()
            .forEach((id) => {
              if (typeof value === "boolean") {
                setOptimisticCallState(id, action, value);
              }
              const callState = getCallState(id);
              const isListening = callState
                ? !callState.isOutputMuted
                : undefined;
              if (
                typeof value !== "boolean" ||
                isListening === undefined ||
                isListening !== value
              ) {
                getCallHandlers(id)?.toggle_output_mute?.();
              }
            });
        }
        scheduleOverlaySync();
        return;
      }

      if (action === "talk_latch") {
        if (targetId) {
          if (typeof value === "boolean") {
            setOptimisticCallState(targetId, action, value);
          }
          const callState = getCallState(targetId);
          const isTalking = callState ? !callState.isInputMuted : undefined;
          if (
            typeof value !== "boolean" ||
            isTalking === undefined ||
            isTalking !== value
          ) {
            targetHandlers?.toggle_input_mute?.();
            logWidgetMic(value, `alternou microfone: ${targetId}`);
          } else {
            logWidgetMic(value, "ignorado: já estava");
          }
        } else if (typeof index === "number") {
          await recordOverlayDebug("bubbleAction-js-stale-index", {
            action,
            index,
            value,
          });
        } else {
          Object.keys(calls)
            .sort()
            .forEach((id) => {
              if (typeof value === "boolean") {
                setOptimisticCallState(id, action, value);
              }
              const callState = getCallState(id);
              const isTalking = callState ? !callState.isInputMuted : undefined;
              if (
                typeof value !== "boolean" ||
                isTalking === undefined ||
                isTalking !== value
              ) {
                getCallHandlers(id)?.toggle_input_mute?.();
              }
            });
        }
        scheduleOverlaySync();
        return;
      }

      if (action === "ptt_down" || action === "ptt_up") {
        const press = action === "ptt_down";
        const invoke = (id: string) => {
          const h = getCallHandlers(id);
          if (!h) return;
          if (press) {
            pttActiveIdsRef.current.add(id);
            h.push_to_talk_start?.();
          } else {
            pttActiveIdsRef.current.delete(id);
            h.push_to_talk_stop?.();
          }
        };
        if (press) {
          pttHeldCountRef.current += 1;
        } else {
          pttHeldCountRef.current = Math.max(0, pttHeldCountRef.current - 1);
        }
        if (targetId) {
          invoke(targetId);
        } else {
          Object.keys(calls).sort().forEach(invoke);
        }
        void pushOverlayState({ requireRunning: false, allowDuringPtt: true });
      }
    };

    void recordOverlayDebug("listener-registering");
    const handleWindowAction = (event: Event) => {
      const nativeEvent = event as CustomEvent<{
        action?: string;
        index?: number;
        value?: boolean;
      }> &
        Event & {
          action?: string;
          index?: number;
          value?: boolean;
        };
      void handleAction(
        nativeEvent.detail || {
          action: nativeEvent.action,
          index: nativeEvent.index,
          value: nativeEvent.value,
        }
      );
    };
    window.addEventListener("intercomOverlayAction", handleWindowAction);
    const subPromise = OverlayBubble.addListener("bubbleAction", (event) =>
      handleAction(event)
    );
    let sub: { remove: () => void } | null = null;
    subPromise.then((h) => {
      sub = h;
      void recordOverlayDebug("listener-registered");
    });
    return () => {
      window.removeEventListener("intercomOverlayAction", handleWindowAction);
      if (sub && typeof sub.remove === "function") sub.remove();
    };
  }, [scheduleOverlaySync, recordOverlayDebug, setOptimisticCallState]);

  useEffect(() => {
    if (!isMobileApp()) return undefined;
    document.addEventListener("visibilitychange", syncOverlayVisibility);
    window.addEventListener("pagehide", syncOverlayVisibility);
    window.addEventListener("blur", syncOverlayVisibility);
    window.addEventListener("focus", syncOverlayVisibility);
    syncOverlayVisibility();
    return () => {
      document.removeEventListener("visibilitychange", syncOverlayVisibility);
      window.removeEventListener("pagehide", syncOverlayVisibility);
      window.removeEventListener("blur", syncOverlayVisibility);
      window.removeEventListener("focus", syncOverlayVisibility);
    };
  }, [state.calls, syncOverlayVisibility]);

  useEffect(() => {
    if (!isMobileApp()) return;
    if (isIOSApp()) {
      void syncOverlayVisibility();
      return;
    }
    if (document.hidden) {
      scheduleOverlaySync();
    }
  }, [state.calls, scheduleOverlaySync, syncOverlayVisibility]);

  return null;
};
