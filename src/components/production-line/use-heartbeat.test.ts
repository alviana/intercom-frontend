import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useHeartbeat } from "./use-heartbeat";
import { API } from "../../api/api";
import { isMobileApp } from "../../platform";

vi.mock("../../api/api", () => ({
  API: {
    heartbeat: vi.fn().mockResolvedValue("ok"),
    deleteAudioSession: vi.fn().mockResolvedValue("ok"),
  },
}));

vi.mock("../../platform", () => ({ isMobileApp: vi.fn(() => false) }));

vi.mock("../../utils/logger.ts", () => ({
  default: { red: vi.fn(), cyan: vi.fn(), log: vi.fn() },
}));

vi.mock("../../global-state/context-provider.tsx", () => ({
  useGlobalState: vi.fn(() => [{}, vi.fn()]),
}));

const pageHide = (persisted: boolean) => {
  const e = new Event("pagehide");
  Object.defineProperty(e, "persisted", { value: persisted });
  window.dispatchEvent(e);
};

describe("useHeartbeat page unload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isMobileApp).mockReturnValue(false);
  });

  it("ends the session when the page is reloaded or closed", () => {
    renderHook(() => useHeartbeat({ sessionId: "s1" }));
    pageHide(false);
    expect(API.deleteAudioSession).toHaveBeenCalledWith({
      sessionId: "s1",
      keepalive: true,
    });
  });

  it("keeps the session when the page goes into the back/forward cache", () => {
    renderHook(() => useHeartbeat({ sessionId: "s1" }));
    pageHide(true);
    expect(API.deleteAudioSession).not.toHaveBeenCalled();
  });

  it("never ends the session from pagehide in the mobile app", () => {
    vi.mocked(isMobileApp).mockReturnValue(true);
    renderHook(() => useHeartbeat({ sessionId: "s1" }));
    pageHide(false);
    expect(API.deleteAudioSession).not.toHaveBeenCalled();
  });

  it("stops listening after the call ends", () => {
    const { unmount } = renderHook(() => useHeartbeat({ sessionId: "s1" }));
    unmount();
    pageHide(false);
    expect(API.deleteAudioSession).not.toHaveBeenCalled();
  });
});
