import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useDevicePermissions } from "./use-device-permission";

const getUserMedia = vi.fn();

beforeEach(() => {
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
