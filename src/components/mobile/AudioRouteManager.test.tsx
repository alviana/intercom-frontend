import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { AudioRouteManager } from "./AudioRouteManager";
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
});
