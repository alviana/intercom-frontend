import { beforeEach, describe, expect, it } from "vitest";
import { buildOverlayRowState } from "./overlay-call-state";
import { markLastTalkedCall, resetHeadsetTarget } from "./headset-target";

const calls = {
  a: { joinProductionOptions: { lineName: "DIREÇÃO" } },
  b: { joinProductionOptions: { lineName: "MESA" } },
};

describe("buildOverlayRowState headset marker", () => {
  beforeEach(resetHeadsetTarget);

  it("marks the last talked line", () => {
    markLastTalkedCall("b");
    expect(buildOverlayRowState(calls).labels).toEqual(["DIREÇÃO", "🎧 MESA"]);
  });

  it("marks the first line when nothing is marked", () => {
    expect(buildOverlayRowState(calls).labels).toEqual(["🎧 DIREÇÃO", "MESA"]);
  });

  it("never marks a program-output line for a non-program user", () => {
    const pgm = {
      a: {
        joinProductionOptions: {
          lineName: "PGM",
          lineUsedForProgramOutput: true,
          isProgramUser: false,
        },
      },
      b: calls.b,
    };
    markLastTalkedCall("a");
    expect(buildOverlayRowState(pgm).labels).toEqual(["PGM", "🎧 MESA"]);
  });
});
