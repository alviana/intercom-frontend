import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockAudioElement = {
  preload: string;
  currentTime: number;
  load: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
};

const installAudioMock = () => {
  const createdAudio: MockAudioElement[] = [];

  class MockAudio {
    preload = "";

    currentTime = 0;

    load = vi.fn();

    play = vi.fn().mockResolvedValue(undefined);

    constructor() {
      createdAudio.push(this);
    }
  }

  vi.stubGlobal("Audio", MockAudio);
  return createdAudio;
};

describe("useAudioCue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("debounces overlapping enter cues", async () => {
    const createdAudio = installAudioMock();
    const { ENTER_CUE_DEBOUNCE_MS, useAudioCue } =
      await import("./use-audio-cue.ts");
    const { result } = renderHook(() => useAudioCue());

    act(() => {
      result.current.playEnterSound();
      result.current.playEnterSound();
    });

    expect(createdAudio).toHaveLength(1);
    expect(createdAudio[0].play).toHaveBeenCalledTimes(1);

    vi.setSystemTime(1_000 + ENTER_CUE_DEBOUNCE_MS);

    act(() => {
      result.current.playEnterSound();
    });

    expect(createdAudio).toHaveLength(1);
    expect(createdAudio[0].play).toHaveBeenCalledTimes(2);
  });

  it("shares one exit cue element across hook instances", async () => {
    const createdAudio = installAudioMock();
    const { useAudioCue } = await import("./use-audio-cue.ts");
    const first = renderHook(() => useAudioCue());
    const second = renderHook(() => useAudioCue());

    act(() => {
      first.result.current.playExitSound();
      second.result.current.playExitSound();
    });

    expect(createdAudio).toHaveLength(1);
    expect(createdAudio[0].play).toHaveBeenCalledTimes(2);
  });

  it("iOS cues are silent", async () => {
    vi.doMock("../../platform", () => ({ isIOSApp: () => true }));
    const createdAudio = installAudioMock();
    const { useAudioCue } = await import("./use-audio-cue.ts");
    const { result } = renderHook(() => useAudioCue());

    act(() => {
      result.current.playEnterSound();
      result.current.playExitSound();
    });

    expect(createdAudio).toHaveLength(0);
    vi.doUnmock("../../platform");
  });
});
