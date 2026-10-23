import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAudioInput } from "./use-audio-input";

vi.mock("../../platform", () => ({ isMobileApp: () => true }));

const stream = () => ({ getTracks: () => [{ enabled: true, stop: vi.fn() }] });

describe("useAudioInput on the app (iOS/Android)", () => {
  let getUserMedia: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    getUserMedia = vi.fn().mockResolvedValue(stream());
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("opens the mic picked in 'Microfone' (WebKit would open the iPhone mic otherwise)", async () => {
    const { result } = renderHook(() =>
      useAudioInput({ audioInputId: "bt-mic", dispatch: vi.fn() })
    );
    await waitFor(() => expect(result.current[0]).not.toBeNull());
    expect(getUserMedia).toHaveBeenLastCalledWith({
      audio: { deviceId: { ideal: "bt-mic" }, noiseSuppression: true },
    });
  });
});
