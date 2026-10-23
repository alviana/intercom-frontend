import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { PocketMode } from "./pocket-mode";
import { useMediaSessionMicToggle } from "./use-media-session-mic-toggle";

describe("PocketMode", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("covers the screen and only leaves after a long hold", () => {
    render(<PocketMode />);
    fireEvent.click(screen.getByText("Modo bolso"));
    const hold = screen.getByText("Segure para sair");
    fireEvent.pointerDown(hold);
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerUp(hold);
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText("Segure para sair")).toBeTruthy();
    fireEvent.pointerDown(hold);
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.queryByText("Segure para sair")).toBeNull();
    expect(screen.getByText("Modo bolso")).toBeTruthy();
  });
});

describe("useMediaSessionMicToggle", () => {
  const handlers: Record<string, ((d?: unknown) => void) | null> = {};

  beforeEach(() => {
    Object.keys(handlers).forEach((k) => delete handlers[k]);
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: {
        metadata: null,
        playbackState: "none",
        setActionHandler: (a: string, h: ((d?: unknown) => void) | null) => {
          handlers[a] = h;
        },
      },
    });
    vi.stubGlobal(
      "MediaMetadata",
      class {
        constructor(public init: unknown) {}
      }
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  // A line whose toggle flips its own track, like use-mute-input does.
  const line = (open: boolean, extra: object = {}) => {
    const track = { enabled: open };
    return {
      track,
      call: {
        joinProductionOptions: null,
        mediaStreamInput: { getAudioTracks: () => [track] },
        ...extra,
      },
      toggle: vi.fn(() => {
        track.enabled = !track.enabled;
      }),
    };
  };

  const setup = (a: ReturnType<typeof line>, b: ReturnType<typeof line>) => {
    const onToggled = vi.fn();
    const hook = renderHook(() =>
      useMediaSessionMicToggle({
        enabled: true,
        calls: { a: a.call, b: b.call } as never,
        callActionHandlers: {
          current: {
            a: { toggle_input_mute: a.toggle },
            b: { toggle_input_mute: b.toggle },
          },
        },
        onToggled,
      })
    );
    return { onToggled, ...hook };
  };

  it("pause never opens a closed mic (AirPod out, headset gone)", () => {
    const a = line(false);
    const b = line(false);
    setup(a, b);
    handlers.pause?.();
    expect(a.toggle).not.toHaveBeenCalled();
    expect(b.toggle).not.toHaveBeenCalled();
  });

  it("play opens the first talk line, skipping a listen-only line; pause closes it", () => {
    vi.useFakeTimers();
    const prog = line(false, {
      joinProductionOptions: { lineUsedForProgramOutput: true },
    });
    const talk = line(false);
    const { onToggled, unmount } = setup(prog, talk);
    handlers.play?.();
    expect(prog.toggle).not.toHaveBeenCalled();
    expect(talk.track.enabled).toBe(true);
    expect(onToggled).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(500);
    handlers.play?.();
    expect(talk.toggle).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500);
    handlers.pause?.();
    expect(talk.track.enabled).toBe(false);
    expect(onToggled).toHaveBeenLastCalledWith(false);
    unmount();
    expect(handlers.pause).toBeNull();
    vi.useRealTimers();
  });

  it("closes the line that is open, not the first one", () => {
    const a = line(false);
    const b = line(true);
    setup(a, b);
    handlers.pause?.();
    expect(a.toggle).not.toHaveBeenCalled();
    expect(b.track.enabled).toBe(false);
  });

  it("ignores presses right after a headset connects or disconnects", () => {
    const listeners: Record<string, () => void> = {};
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        addEventListener: (e: string, h: () => void) => {
          listeners[e] = h;
        },
        removeEventListener: vi.fn(),
      },
    });
    const a = line(false);
    const b = line(false);
    setup(a, b);
    listeners.devicechange?.();
    handlers.play?.();
    expect(a.toggle).not.toHaveBeenCalled();
  });

  it("does nothing when disabled", () => {
    renderHook(() =>
      useMediaSessionMicToggle({
        enabled: false,
        calls: {},
        callActionHandlers: { current: {} },
        onToggled: vi.fn(),
      })
    );
    expect(handlers.play).toBeUndefined();
  });
});
