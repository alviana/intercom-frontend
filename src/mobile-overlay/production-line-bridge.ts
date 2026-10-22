import {
  clearCallHandlers,
  setCallActionHandler,
  setCallOverlayLabel as registerCallOverlayLabel,
  setCallStateGetter,
} from "./action-handlers";
import { markLastTalkedCall } from "./headset-target";
import { logHeadsetEvent } from "./headset-diagnostics";

// Last mic state per call, so the diagnostics log shows every on/off change and who preceded it.
const lastInputMuted = new Map<string, boolean>();

export const registerHandler = (
  callId: string,
  action: string,
  handler: () => void
): void => {
  setCallActionHandler(callId, action, handler);
};

export const syncCallState = (
  callId: string,
  isInputMuted: boolean,
  isOutputMuted: boolean
): void => {
  setCallStateGetter(callId, () => ({ isInputMuted, isOutputMuted }));
  if (!isInputMuted) markLastTalkedCall(callId);
  const prev = lastInputMuted.get(callId);
  if (prev !== undefined && prev !== isInputMuted) {
    logHeadsetEvent({
      at: Date.now(),
      key: "MIC",
      action: isInputMuted ? "desligado" : "ligado",
      source: "estado",
      result: callId,
    });
  }
  lastInputMuted.set(callId, isInputMuted);
};

export const detachCall = (callId: string): void => {
  lastInputMuted.delete(callId);
  clearCallHandlers(callId);
};

export const setCallOverlayLabel = (callId: string, label: string): void => {
  registerCallOverlayLabel(callId, label);
};

let overlaySyncListener: (() => void) | null = null;

export const setOverlaySyncListener = (listener: (() => void) | null): void => {
  overlaySyncListener = listener;
};

export const requestOverlaySync = (): void => {
  overlaySyncListener?.();
};
