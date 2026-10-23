import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAudioInput } from "./use-audio-input";

const { platform, iosMic } = vi.hoisted(() => ({
  platform: { ios: false },
  iosMic: { id: null as string | null },
}));

vi.mock("../../platform", () => ({
  isIOSApp: () => platform.ios,
  isMobileApp: () => true,
}));
vi.mock("../../utils/android-audio-route", () => ({
  resolveIOSMicDeviceId: () => Promise.resolve(iosMic.id),
}));

const stream = () => ({ getTracks: () => [{ enabled: true, stop: vi.fn() }] });

describe("useAudioInput on the app", () => {
  let getUserMedia: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    platform.ios = false;
    iosMic.id = null;
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

  it("iOS: opens exactly the mic of the headset chosen in 'Saída de áudio'", async () => {
    platform.ios = true;
    iosMic.id = "jbl";
    await open();
    expect(getUserMedia).toHaveBeenLastCalledWith({
      audio: { deviceId: { exact: "jbl" }, noiseSuppression: true },
    });
  });

  it("iOS: falls back to the 'Microfone' choice when that mic can't be opened", async () => {
    platform.ios = true;
    iosMic.id = "jbl";
    getUserMedia
      .mockResolvedValueOnce(stream()) // permission stream
      .mockRejectedValueOnce(new Error("OverconstrainedError"));
    await open();
    expect(getUserMedia.mock.calls.map((c) => c[0].audio)).toEqual([
      true,
      { deviceId: { exact: "jbl" }, noiseSuppression: true },
      { deviceId: { ideal: "picked-mic" }, noiseSuppression: true },
    ]);
  });
});
