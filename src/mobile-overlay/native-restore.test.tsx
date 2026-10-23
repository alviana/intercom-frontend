import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const platform = vi.hoisted(() => ({ ios: true }));
vi.mock("../platform", () => ({ isIOSApp: () => platform.ios }));

describe("useNativeRestoreDone", () => {
  beforeEach(() => vi.resetModules());

  it("iOS: waits until the native restore has finished", async () => {
    platform.ios = true;
    const m = await import("./native-restore");
    const { result } = renderHook(() => m.useNativeRestoreDone());
    expect(result.current).toBe(false);
    await act(async () => m.markNativeRestoreDone());
    expect(result.current).toBe(true);
  });

  it("Android/web: never waits", async () => {
    platform.ios = false;
    const m = await import("./native-restore");
    const { result } = renderHook(() => m.useNativeRestoreDone());
    expect(result.current).toBe(true);
  });
});
