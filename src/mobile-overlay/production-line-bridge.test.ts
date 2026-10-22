import { afterEach, describe, expect, it } from "vitest";
import { detachCall, syncCallState } from "./production-line-bridge";
import { clearHeadsetLog, getHeadsetLog } from "./headset-diagnostics";

describe("syncCallState mic log", () => {
  afterEach(() => {
    detachCall("c1");
    clearHeadsetLog();
  });

  it("logs only mic on/off transitions, not the first sync or repeats", () => {
    syncCallState("c1", true, false);
    syncCallState("c1", true, true);
    syncCallState("c1", false, true);
    syncCallState("c1", true, true);

    expect(
      getHeadsetLog().map((e) => `${e.key} ${e.action} ${e.result}`)
    ).toEqual(["MIC ligado c1", "MIC desligado c1"]);
  });

  it("forgets the call on detach", () => {
    syncCallState("c1", false, false);
    detachCall("c1");
    syncCallState("c1", true, false);

    expect(getHeadsetLog()).toEqual([]);
  });
});
