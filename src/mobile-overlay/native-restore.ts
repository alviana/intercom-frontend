import { useEffect, useState } from "react";
import { isIOSApp } from "../platform";

let markDone: () => void = () => {};
const done = new Promise<void>((resolve) => {
  markDone = resolve;
});

// Called by NativeCallsRestore once it has dispatched (or failed / found nothing).
export const markNativeRestoreDone = (): void => markDone();

// true when auto-join may run: always off iOS, after the native restore on iOS.
export const useNativeRestoreDone = (): boolean => {
  const [ready, setReady] = useState(!isIOSApp());
  useEffect(() => {
    if (ready) return;
    let live = true;
    done.then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [ready]);
  return ready;
};
