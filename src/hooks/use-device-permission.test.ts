import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useDevicePermissions } from "./use-device-permission";

const getUserMedia = vi.fn();
const h = vi.hoisted(() => ({
  ios: false,
  check: vi.fn(),
  request: vi.fn(),
}));
vi.mock("../platform", () => ({ isIOSApp: () => h.ios }));
vi.mock("../mobile-overlay/native-voice", () => ({
  NativeVoice: {
    checkMicPermission: h.check,
    requestMicPermission: h.request,
  },
}));

beforeEach(() => {
  h.ios = false;
  h.check.mockReset();
  h.request.mockReset();
  getUserMedia.mockReset();
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia },
    configurable: true,
  });
});

describe("useDevicePermissions", () => {
  it("grants permission when the first request succeeds", async () => {
    getUserMedia.mockResolvedValue({});
    const { result } = renderHook(() =>
      useDevicePermissions({ continueToApp: true })
    );
    await waitFor(() => expect(result.current.permission).toBe(true));
    expect(result.current.denied).toBe(false);
  });

  it("retries after an interrupted first request when the app is focused again", async () => {
    getUserMedia.mockRejectedValueOnce(new Error("interrupted"));
    getUserMedia.mockResolvedValue({});
    const { result } = renderHook(() =>
      useDevicePermissions({ continueToApp: true })
    );
    await waitFor(() => expect(result.current.denied).toBe(true));

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => expect(result.current.permission).toBe(true));
    expect(result.current.denied).toBe(false);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it("does not request anything before the app may continue", () => {
    renderHook(() => useDevicePermissions({ continueToApp: false }));
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});

describe("useDevicePermissions on iOS", () => {
  beforeEach(() => {
    h.ios = true;
  });

  it("asks the native mic permission and never calls getUserMedia (granted)", async () => {
    h.check.mockResolvedValue({ granted: false });
    h.request.mockResolvedValue({ granted: true });
    const { result } = renderHook(() =>
      useDevicePermissions({ continueToApp: true })
    );
    await waitFor(() => expect(result.current.permission).toBe(true));
    expect(result.current.denied).toBe(false);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("skips the prompt when already granted", async () => {
    h.check.mockResolvedValue({ granted: true });
    const { result } = renderHook(() =>
      useDevicePermissions({ continueToApp: true })
    );
    await waitFor(() => expect(result.current.permission).toBe(true));
    expect(h.request).not.toHaveBeenCalled();
  });

  it("flags denied when the native request is refused", async () => {
    h.check.mockResolvedValue({ granted: false });
    h.request.mockResolvedValue({ granted: false });
    const { result } = renderHook(() =>
      useDevicePermissions({ continueToApp: true })
    );
    await waitFor(() => expect(result.current.denied).toBe(true));
    expect(result.current.permission).toBe(false);
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
