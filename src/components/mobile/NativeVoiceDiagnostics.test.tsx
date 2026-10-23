import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { NativeVoiceDiagnostics } from "./NativeVoiceDiagnostics";
import {
  clearHeadsetLog,
  getHeadsetLog,
} from "../../mobile-overlay/headset-diagnostics";

const h = vi.hoisted(() => ({
  ios: true,
  cb: null as null | ((ev: unknown) => void),
  addListener: vi.fn(),
}));

vi.mock("../../platform", () => ({ isIOSApp: () => h.ios }));
vi.mock("../../mobile-overlay/native-voice", () => ({
  NativeVoice: { addListener: h.addListener },
}));

beforeEach(() => {
  cleanup();
  clearHeadsetLog();
  h.ios = true;
  h.addListener.mockReset();
  h.addListener.mockImplementation(async (_e: string, cb: never) => {
    h.cb = cb;
    return { remove: vi.fn() };
  });
});

describe("NativeVoiceDiagnostics", () => {
  it("native diag events land in the headset log", async () => {
    render(<NativeVoiceDiagnostics />);
    await Promise.resolve();
    h.cb!({ key: "HEADSETHOOK", action: "down", result: "alternou" });
    const [entry] = getHeadsetLog();
    expect(entry).toMatchObject({
      key: "HEADSETHOOK",
      action: "down",
      source: "nativo",
      result: "alternou",
    });
    expect(typeof entry.at).toBe("number");
  });

  it("does nothing outside iOS", () => {
    h.ios = false;
    render(<NativeVoiceDiagnostics />);
    expect(h.addListener).not.toHaveBeenCalled();
  });
});
