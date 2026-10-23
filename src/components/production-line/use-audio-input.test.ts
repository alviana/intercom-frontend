import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAudioInput } from "./use-audio-input";

vi.mock("../../platform", () => ({
  isIOSApp: () => false,
  isMobileApp: () => true,
}));

const stream = () => ({ getTracks: () => [{ enabled: true, stop: vi.fn() }] });

describe("useAudioInput on the app", () => {
  let getUserMedia: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    getUserMedia = vi.fn().mockResolvedValue(stream());
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  });
  afterEach(() => vi.unstubAllGlobals());

  const open = async () => {
    const dispatch = vi.fn(); // stable: a new one per render would restart the hook
    const { result } = renderHook(() =>
      useAudioInput({ audioInputId: "picked-mic", dispatch })
    );
    await waitFor(() => expect(result.current[0]).not.toBeNull());
  };

  it("Android: opens the mic picked in 'Microfone'", async () => {
    await open();
    expect(getUserMedia).toHaveBeenLastCalledWith({
      audio: { deviceId: { ideal: "picked-mic" }, noiseSuppression: true },
    });
  });
});
