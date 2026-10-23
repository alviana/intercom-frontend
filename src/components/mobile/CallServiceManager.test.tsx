import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { CallServiceManager } from "./CallServiceManager";
import { CallService } from "../../mobile-overlay/call-service";
import { useGlobalState } from "../../global-state/context-provider";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isPluginAvailable: () => true },
}));

const platform = vi.hoisted(() => ({ ios: false }));
vi.mock("../../platform", () => ({
  isAndroidApp: () => !platform.ios,
  isIOSApp: () => platform.ios,
  isMobileApp: () => true,
}));

vi.mock("../../config", () => ({
  getApiBaseUrl: () => "https://intercom.example/manager/api/v1/",
  getApiKey: () => undefined,
}));

vi.mock("../../mobile-overlay/call-service", () => ({
  CallService: {
    start: vi.fn().mockResolvedValue({ running: true }),
    stop: vi.fn().mockResolvedValue({ running: false }),
    requestNotificationPermission: vi.fn().mockResolvedValue(undefined),
    setSessions: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../global-state/context-provider", () => ({
  useGlobalState: vi.fn(),
}));

const withCalls = (calls: Record<string, { sessionId: string | null }>) =>
  vi.mocked(useGlobalState).mockReturnValue([{ calls }, vi.fn()] as never);

describe("CallServiceManager native heartbeats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platform.ios = false;
  });

  it("hands the open sessions to the native service", () => {
    withCalls({ a: { sessionId: "s2" }, b: { sessionId: "s1" } });
    render(<CallServiceManager />);
    expect(CallService.setSessions).toHaveBeenLastCalledWith({
      baseUrl: "https://intercom.example/manager/api/v1/",
      apiKey: "",
      sessionIds: ["s1", "s2"],
    });
  });

  it("updates the list when a call is left, skipping calls still joining", () => {
    withCalls({ a: { sessionId: "s1" }, b: { sessionId: "s2" } });
    const { rerender } = render(<CallServiceManager />);

    withCalls({ a: { sessionId: "s1" }, c: { sessionId: null } });
    rerender(<CallServiceManager />);

    expect(CallService.setSessions).toHaveBeenLastCalledWith(
      expect.objectContaining({ sessionIds: ["s1"] })
    );
  });

  it("clears the list when there are no calls", () => {
    withCalls({});
    render(<CallServiceManager />);
    expect(CallService.setSessions).toHaveBeenLastCalledWith(
      expect.objectContaining({ sessionIds: [] })
    );
  });
});

describe("CallServiceManager iOS (no CallKit call)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platform.ios = true;
  });

  it("never starts a CallKit call, hands sessions to native, skips Android-only setup", () => {
    withCalls({ a: { sessionId: "s1" } });
    const { rerender } = render(<CallServiceManager />);
    withCalls({ a: { sessionId: "s1" }, b: { sessionId: "s2" } });
    rerender(<CallServiceManager />);
    expect(CallService.start).not.toHaveBeenCalled();
    expect(CallService.requestNotificationPermission).not.toHaveBeenCalled();
    // so native can leave them when the app is swiped away (no ghost user)
    expect(CallService.setSessions).toHaveBeenLastCalledWith(
      expect.objectContaining({ sessionIds: ["s1", "s2"] })
    );
  });

  it("ends a call left by an older build when mounted", () => {
    withCalls({});
    render(<CallServiceManager />);
    expect(CallService.stop).toHaveBeenCalled();
  });
});
