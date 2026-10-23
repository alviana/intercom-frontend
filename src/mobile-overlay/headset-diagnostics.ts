export type HeadsetLogEntry = {
  at: number;
  key: string;
  action: string;
  source: string;
  result: string;
};

const MAX_ENTRIES = 30;
let log: HeadsetLogEntry[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((cb) => cb());

export const logHeadsetEvent = (entry: HeadsetLogEntry): void => {
  log = [...log, entry].slice(-MAX_ENTRIES);
  notify();
};

export const getHeadsetLog = (): HeadsetLogEntry[] => log;

export const subscribeHeadsetLog = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export const clearHeadsetLog = (): void => {
  log = [];
  notify();
};
