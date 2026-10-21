export const HEADSET_LABEL_PREFIX = "🎧 ";

let lastTalked: string | null = null;

export const markLastTalkedCall = (callId: string): void => {
  lastTalked = callId;
};

export const resetHeadsetTarget = (): void => {
  lastTalked = null;
};

/** Last line where the mic was opened, else the first line the user may talk on. */
export const resolveHeadsetCallId = (
  sortedCallIds: string[],
  canTalk: (id: string) => boolean
): string | null => {
  if (lastTalked && sortedCallIds.includes(lastTalked) && canTalk(lastTalked)) {
    return lastTalked;
  }
  return sortedCallIds.find(canTalk) ?? null;
};
