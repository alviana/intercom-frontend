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

  const call = (enabled: boolean, extra: object = {}) => ({
    joinProductionOptions: null,
    mediaStreamInput: {
      getAudioTracks: () => [{ enabled }],
    },
    ...extra,
  });

  it("headset play/pause toggles the talk line's mic, skipping a listen-only line", () => {
    const toggleA = vi.fn();
    const toggleB = vi.fn();
    const onToggled = vi.fn();
    const calls = {
      a: call(true, {
        joinProductionOptions: { lineUsedForProgramOutput: true },
      }),
      b: call(false),
    } as never;
    const { unmount } = renderHook(() =>
      useMediaSessionMicToggle({
        enabled: true,
        calls,
        callActionHandlers: {
          current: {
            a: { toggle_input_mute: toggleA },
            b: { toggle_input_mute: toggleB },
          },
        },
        onToggled,
      })
    );
    handlers.pause?.();
    expect(toggleA).not.toHaveBeenCalled();
    expect(toggleB).toHaveBeenCalledTimes(1);
    expect(onToggled).toHaveBeenCalledWith(true);
    unmount();
    expect(handlers.pause).toBeNull();
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
