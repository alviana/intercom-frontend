import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMuteInput } from "./use-mute-input";

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
}));

vi.mock("../../global-state/context-provider", () => ({
  useGlobalState: () => [{}, mocks.dispatch],
}));

describe("useMuteInput", () => {
  beforeEach(() => {
    mocks.dispatch.mockClear();
  });

  it("updates mute state even when the input stream is not ready", () => {
    const { result } = renderHook(() =>
      useMuteInput({
        inputAudioStream: null,
        isProgramOutputLine: false,
        isProgramUser: false,
        id: "call-1",
      })
    );

    act(() => {
      result.current.muteInput(false);
    });

    expect(result.current.isInputMuted).toBe(false);

    act(() => {
      result.current.muteInput(true);
    });

    expect(result.current.isInputMuted).toBe(true);
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: "UPDATE_CALL",
      payload: {
        id: "call-1",
        updates: {
          isRemotelyMuted: false,
        },
      },
    });
  });

  it("toggles available audio tracks", () => {
    const track = {
      enabled: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const stream = {
      getTracks: () => [track],
    } as unknown as MediaStream;
    const { result } = renderHook(() =>
      useMuteInput({
        inputAudioStream: stream,
        isProgramOutputLine: false,
        isProgramUser: false,
        id: "call-1",
      })
    );

    act(() => {
      result.current.muteInput(false);
    });

    expect(result.current.isInputMuted).toBe(false);
    expect(track.enabled).toBe(true);

    act(() => {
      result.current.muteInput(true);
    });

    expect(result.current.isInputMuted).toBe(true);
    expect(track.enabled).toBe(false);
  });
});
