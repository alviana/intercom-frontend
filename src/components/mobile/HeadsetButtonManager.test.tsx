import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { HeadsetButtonManager } from "./HeadsetButtonManager";
import { useGlobalState } from "../../global-state/context-provider";
import {
  setCallActionHandler,
  setCallStateGetter,
} from "../../mobile-overlay/action-handlers";
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

const cue = vi.hoisted(() => ({ enter: vi.fn(), exit: vi.fn() }));
vi.mock("../production-line/use-audio-cue", () => ({
  useAudioCue: () => ({ playEnterSound: cue.enter, playExitSound: cue.exit }),
}));

const setMuted = (id: string, isInputMuted: boolean) =>
  setCallStateGetter(id, () => ({ isInputMuted, isOutputMuted: false }));
const toggleA = vi.fn();
const toggleB = vi.fn();
const withCalls = (calls: Record<string, unknown>) =>
  vi.mocked(useGlobalState).mockReturnValue([{ calls }, vi.fn()] as never);
const fire = (key: string, action = "down") =>
  h.cb!({ key, action, source: "media_session" });
let view: ReturnType<typeof render>;
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
    view = render(<HeadsetButtonManager />);
    await vi.advanceTimersByTimeAsync(0);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

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
    view.rerender(<HeadsetButtonManager />);
    fire("HEADSETHOOK");
    expect(toggleA).not.toHaveBeenCalled();
    expect(toggleB).toHaveBeenCalledTimes(1);
  });

  it("ignores taps with no calls", () => {
    withCalls({});
    view.rerender(<HeadsetButtonManager />);
    fire("HEADSETHOOK");
    expect(toggleA).not.toHaveBeenCalled();
    expect(lastResult()).toBe("ignorado: sem linha");
  });

  it("logs listen-only when every line is listen-only", () => {
    withCalls({
      a: { joinProductionOptions: { lineUsedForProgramOutput: true } },
    });
    view.rerender(<HeadsetButtonManager />);
    fire("HEADSETHOOK");
    expect(lastResult()).toBe("ignorado: linha só ouvinte");
    expect(cue.enter).not.toHaveBeenCalled();
    expect(cue.exit).not.toHaveBeenCalled();
  });

  it("plays the enter cue when the tap opens a muted mic", () => {
    setMuted("a", true);
    view.rerender(<HeadsetButtonManager />);
    fire("HEADSETHOOK");
    expect(cue.enter).toHaveBeenCalledTimes(1);
    expect(cue.exit).not.toHaveBeenCalled();
  });

  it("plays the exit cue when the tap mutes an open mic", () => {
    setMuted("a", false);
    view.rerender(<HeadsetButtonManager />);
    fire("HEADSETHOOK");
    expect(cue.exit).toHaveBeenCalledTimes(1);
    expect(cue.enter).not.toHaveBeenCalled();
  });

  it("plays no cue when the tap is ignored", () => {
    withCalls({});
    view.rerender(<HeadsetButtonManager />);
    fire("HEADSETHOOK");
    expect(cue.enter).not.toHaveBeenCalled();
    expect(cue.exit).not.toHaveBeenCalled();
  });
});
