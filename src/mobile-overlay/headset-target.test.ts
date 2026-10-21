import { beforeEach, describe, expect, it } from "vitest";
import {
  markLastTalkedCall,
  resetHeadsetTarget,
  resolveHeadsetCallId,
} from "./headset-target";

describe("resolveHeadsetCallId", () => {
  beforeEach(resetHeadsetTarget);

  it("falls back to the first talkable line when nothing is marked", () => {
    expect(resolveHeadsetCallId(["a", "b", "c"], () => true)).toBe("a");
  });

  it("prefers the last line where the mic was opened", () => {
    markLastTalkedCall("b");
    expect(resolveHeadsetCallId(["a", "b", "c"], () => true)).toBe("b");
  });

  it("falls back when the marked line is gone", () => {
    markLastTalkedCall("x");
    expect(resolveHeadsetCallId(["a", "b"], () => true)).toBe("a");
  });

  it("falls back when the marked line cannot be talked on", () => {
    markLastTalkedCall("a");
    expect(resolveHeadsetCallId(["a", "b"], (id) => id !== "a")).toBe("b");
  });

  it("skips lines that cannot be talked on", () => {
    expect(resolveHeadsetCallId(["a", "b"], (id) => id !== "a")).toBe("b");
  });

  it("returns null when no line is available", () => {
    expect(resolveHeadsetCallId(["a", "b"], () => false)).toBeNull();
    expect(resolveHeadsetCallId([], () => true)).toBeNull();
  });
});
