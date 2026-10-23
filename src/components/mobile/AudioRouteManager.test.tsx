import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { AudioRouteManager } from "./AudioRouteManager";
import {
  applyStoredAudioRoute,
  readStoredAudioRoute,
} from "../../utils/android-audio-route";
import {
  clearHeadsetLog,
  getHeadsetLog,
} from "../../mobile-overlay/headset-diagnostics";

const h = vi.hoisted(() => ({
  cb: null as null | ((state: unknown) => void),
}));

vi.mock("../../platform", () => ({
  isIOSApp: () => true,
  isMobileApp: () => true,
}));
vi.mock("../../utils/android-audio-route", () => ({
  applyStoredAudioRoute: vi.fn(),
  isAudioRouteAvailable: () => true,
  readStoredAudioRoute: vi.fn(),
  writeStoredAudioRoute: vi.fn(),
}));
vi.mock("../../mobile-overlay/audio-route", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  AudioRoute: {
    addListener: (_e: string, cb: (state: unknown) => void) => {
      h.cb = cb;
      return Promise.resolve({ remove: vi.fn() });
    },
  },
}));

beforeEach(() => {
  vi.mocked(applyStoredAudioRoute).mockClear();
  vi.mocked(readStoredAudioRoute).mockReturnValue(null);
  cleanup();
  clearHeadsetLog();
});

describe("AudioRouteManager", () => {
  it("logs a ROTA line only when it differs from the previous one", () => {
    render(<AudioRouteManager />);
    const builtIn = { routes: [], active: "bluetooth", input: "iPhone" };
    h.cb!(builtIn);
    h.cb!({ ...builtIn });
    h.cb!({ ...builtIn, input: "JBL" });
    h.cb!(builtIn);

    const results = getHeadsetLog().map((e) => e.result);
    expect(results).toHaveLength(3);
    expect(results[0]).toContain("mic: iPhone");
    expect(results[1]).toContain("mic: JBL");
    expect(results[2]).toContain("mic: iPhone");
  });

  it("re-applies the stored bluetooth route when it shows up but native asks for another", () => {
    vi.mocked(readStoredAudioRoute).mockReturnValue("bluetooth");
    render(<AudioRouteManager />);
    const bt = {
      id: "bluetooth",
      label: "JBL",
      available: true,
      type: "bluetooth",
    };
    h.cb!({ routes: [], preferred: "speaker" });
    expect(applyStoredAudioRoute).toHaveBeenCalledTimes(1); // launch only
    h.cb!({ routes: [bt], preferred: "speaker" });
    expect(applyStoredAudioRoute).toHaveBeenCalledTimes(2);
    h.cb!({ routes: [bt], preferred: "bluetooth" });
    expect(applyStoredAudioRoute).toHaveBeenCalledTimes(2);
  });
});
