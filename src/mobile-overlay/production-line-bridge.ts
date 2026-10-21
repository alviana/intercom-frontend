import {
  clearCallHandlers,
  setCallActionHandler,
  setCallOverlayLabel as registerCallOverlayLabel,
  setCallStateGetter,
} from "./action-handlers";
import { markLastTalkedCall } from "./headset-target";

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
};

export const detachCall = (callId: string): void => {
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
