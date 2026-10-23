import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyCallKitMode, readStoredCallKitMode } from "./ios-callkit-mode";

const h = vi.hoisted(() => ({
  ios: true,
  setCallKitMode: vi.fn(() => Promise.resolve()),
}));

vi.mock("../platform", () => ({ isIOSApp: () => h.ios }));
vi.mock("../mobile-overlay/native-voice", () => ({
  NativeVoice: { setCallKitMode: h.setCallKitMode },
}));

beforeEach(() => {
  window.localStorage.clear();
  h.ios = true;
  h.setCallKitMode.mockClear();
});

describe("iOS CallKit mode switch", () => {
  it("is off until the user turns it on", () => {
    expect(readStoredCallKitMode()).toBe(false);
  });

  it("stores the switch and sends it to native", () => {
    applyCallKitMode(true);
    expect(readStoredCallKitMode()).toBe(true);
    expect(h.setCallKitMode).toHaveBeenCalledWith({ enabled: true });
    applyCallKitMode(false);
    expect(readStoredCallKitMode()).toBe(false);
    expect(h.setCallKitMode).toHaveBeenLastCalledWith({ enabled: false });
  });

  it("does nothing outside iOS", () => {
    h.ios = false;
    applyCallKitMode(true);
    expect(readStoredCallKitMode()).toBe(false);
    expect(h.setCallKitMode).not.toHaveBeenCalled();
  });
});
