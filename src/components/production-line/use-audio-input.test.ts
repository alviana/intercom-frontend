import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAudioInput } from "./use-audio-input";
import { setAndroidAudioRoute } from "../../utils/android-audio-route";

const { platform } = vi.hoisted(() => ({ platform: { ios: true } }));

vi.mock("../../platform", () => ({
  isIOSApp: () => platform.ios,
  isMobileApp: () => true,
}));
vi.mock("../../utils/android-audio-route", () => ({
  readStoredAudioRoute: () => "bluetooth",
  setAndroidAudioRoute: vi.fn().mockResolvedValue("bluetooth"),
}));

const stream = () => ({ getTracks: () => [{ enabled: true, stop: vi.fn() }] });

describe("useAudioInput route on iOS", () => {
  beforeEach(() => {
    platform.ios = true;
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream()) },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("re-applies the chosen route once the mic is open (WebKit opens the iPhone mic)", async () => {
    const { result } = renderHook(() =>
      useAudioInput({ audioInputId: "mic-1", dispatch: vi.fn() })
    );
    await waitFor(() => expect(result.current[0]).not.toBeNull());
    expect(setAndroidAudioRoute).toHaveBeenCalledWith("bluetooth");
  });

  it("leaves the route alone on Android", async () => {
    platform.ios = false;
    const { result } = renderHook(() =>
      useAudioInput({ audioInputId: "mic-1", dispatch: vi.fn() })
    );
    await waitFor(() => expect(result.current[0]).not.toBeNull());
    expect(setAndroidAudioRoute).not.toHaveBeenCalled();
  });
});
