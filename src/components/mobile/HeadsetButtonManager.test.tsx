import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { HeadsetButtonManager } from "./HeadsetButtonManager";
import { useGlobalState } from "../../global-state/context-provider";
import { setCallActionHandler } from "../../mobile-overlay/action-handlers";
import {
  clearHeadsetLog,
  getHeadsetLog,
} from "../../mobile-overlay/headset-diagnostics";
import { resetHeadsetTarget } from "../../mobile-overlay/headset-target";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isPluginAvailable: () => true },
  registerPlugin: () => ({}),
}));

const h = vi.hoisted(() => ({ cb: null as null | ((ev: unknown) => void) }));

vi.mock("../../mobile-overlay/headset-button", async () => {
  const actual = await vi.importActual<
    typeof import("../../mobile-overlay/headset-button")
  >("../../mobile-overlay/headset-button");
  return {
    ...actual,
    HeadsetButton: {
      addListener: vi.fn(async (_e: string, cb: (ev: unknown) => void) => {
        h.cb = cb;
        return { remove: vi.fn() };
      }),
    },
  };
});

vi.mock("../../mobile-overlay/production-line-bridge", () => ({
  requestOverlaySync: vi.fn(),
}));

vi.mock("../../global-state/context-provider", () => ({
  useGlobalState: vi.fn(),
}));

const toggleA = vi.fn();
const toggleB = vi.fn();
const withCalls = (calls: Record<string, unknown>) =>
  vi.mocked(useGlobalState).mockReturnValue([{ calls }, vi.fn()] as never);
const fire = (key: string, action = "down") =>
  h.cb!({ key, action, source: "media_session" });
const lastResult = () => getHeadsetLog()[getHeadsetLog().length - 1]?.result;

describe("HeadsetButtonManager", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    vi.clearAllMocks();
    clearHeadsetLog();
    resetHeadsetTarget();
    setCallActionHandler("a", "toggle_input_mute", toggleA);
    setCallActionHandler("b", "toggle_input_mute", toggleB);
    withCalls({ a: {}, b: {} });
    render(<HeadsetButtonManager />);
    await vi.advanceTimersByTimeAsync(0);
  });
  afterEach(() => vi.useRealTimers());

  it("toggles the headset line's mic on a tap", () => {
    fire("HEADSETHOOK");
    expect(toggleA).toHaveBeenCalledTimes(1);
    expect(toggleB).not.toHaveBeenCalled();
    expect(lastResult()).toBe("alternou microfone: a");
  });

  it("ignores key release", () => {
    fire("HEADSETHOOK", "up");
    expect(toggleA).not.toHaveBeenCalled();
    expect(lastResult()).toBe("ignorado: up");
  });

  it("toggles once for taps 200 ms apart, twice for 500 ms", () => {
    fire("MEDIA_PLAY_PAUSE");
    vi.setSystemTime(10_200);
    fire("MEDIA_PLAY_PAUSE");
    expect(toggleA).toHaveBeenCalledTimes(1);
    vi.setSystemTime(10_700);
    fire("MEDIA_PLAY_PAUSE");
    expect(toggleA).toHaveBeenCalledTimes(2);
  });

  it("logs keys without a function", () => {
    fire("MEDIA_NEXT");
    expect(toggleA).not.toHaveBeenCalled();
    expect(lastResult()).toBe("ignorado: tecla sem função");
  });

  it("never toggles a listen-only program line", () => {
    withCalls({
      a: { joinProductionOptions: { lineUsedForProgramOutput: true } },
      b: {},
    });
    render(<HeadsetButtonManager />);
    fire("HEADSETHOOK");
    expect(toggleA).not.toHaveBeenCalled();
  });

  it("ignores taps with no calls", async () => {
    withCalls({});
    render(<HeadsetButtonManager />);
    await vi.advanceTimersByTimeAsync(0);
    fire("HEADSETHOOK");
    expect(toggleA).not.toHaveBeenCalled();
    expect(lastResult()).toBe("ignorado: sem linha");
  });
});
