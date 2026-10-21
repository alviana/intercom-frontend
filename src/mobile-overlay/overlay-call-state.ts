import { getCallState, getCallOverlayLabel } from "./action-handlers";
import { HEADSET_LABEL_PREFIX, resolveHeadsetCallId } from "./headset-target";

/** Stable row order for overlay indices (Object.keys order is not guaranteed). */
export const getSortedCallIds = (
  calls: Record<string, unknown> | null | undefined
): string[] => Object.keys(calls || {}).sort();

export const resolveCallIdAtIndex = (
  calls: Record<string, unknown> | null | undefined,
  index: number | undefined
): string | undefined => {
  const ids = getSortedCallIds(calls);
  if (typeof index !== "number" || index < 0 || index >= ids.length) {
    return undefined;
  }
  return ids[index];
};

/** Program-output lines are listen-only for non-program users. */
export const canTalkOnCall = (
  call:
    | {
        joinProductionOptions?: {
          lineUsedForProgramOutput?: boolean;
          isProgramUser?: boolean;
        } | null;
      }
    | undefined
): boolean => {
  const jp = call?.joinProductionOptions;
  return !(jp?.lineUsedForProgramOutput && !jp?.isProgramUser);
};

export type OverlayRowState = {
  ids: string[];
  latch: boolean[];
  listen: boolean[];
  micAllowed: boolean[];
  listenAllowed: boolean[];
  labels: string[];
  labelSources: string[];
  activity: boolean[];
};

const shortCallId = (id: string): string =>
  id.length > 12 ? `${id.slice(0, 6)}...${id.slice(-4)}` : id;

export const buildOverlayRowState = (
  calls: Record<string, any>
): OverlayRowState => {
  const ids = getSortedCallIds(calls);
  const latch = ids.map((id) => {
    const s = getCallState(id);
    if (s) return !s.isInputMuted;
    const ms: MediaStream | null = calls[id]?.mediaStreamInput || null;
    return !!(ms && ms.getAudioTracks().some((t) => t.enabled));
  });
  const listen = ids.map((id) => {
    const s = getCallState(id);
    if (s) return !s.isOutputMuted;
    const els: HTMLAudioElement[] | null = calls[id]?.audioElements || null;
    if (!els || els.length === 0) return true;
    return els.some((el) => !el.muted);
  });
  const micAllowed = ids.map((id) => canTalkOnCall(calls[id]));
  const listenAllowed = ids.map(() => true);
  const labelRows = ids.map((id, index) => {
    const named = getCallOverlayLabel(id)?.trim();
    if (named) return { label: named, source: "registered" };
    const jp = calls[id]?.joinProductionOptions || {};
    if (jp.lineName)
      return { label: jp.lineName, source: "joinProductionOptions.lineName" };
    if (jp.lineId)
      return {
        label: `Linha ${jp.lineId}`,
        source: "joinProductionOptions.lineId",
      };
    if (id) return { label: `Linha ${shortCallId(id)}`, source: "callId" };
    return { label: `Linha ${index + 1}`, source: "fallback" };
  });
  const target = resolveHeadsetCallId(ids, (id) => canTalkOnCall(calls[id]));
  const labels = labelRows.map((row, i) =>
    ids[i] === target ? HEADSET_LABEL_PREFIX + row.label : row.label
  );
  const labelSources = labelRows.map((row) => row.source);
  const activity = ids.map((id) => !!calls[id]?.audioLevelAboveThreshold);
  return {
    ids,
    latch,
    listen,
    micAllowed,
    listenAllowed,
    labels,
    labelSources,
    activity,
  };
};
