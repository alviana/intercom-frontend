import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { CallServiceManager } from "./CallServiceManager";
import { CallService } from "../../mobile-overlay/call-service";
import { useGlobalState } from "../../global-state/context-provider";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isPluginAvailable: () => true },
}));

vi.mock("../../platform", () => ({ isAndroidApp: () => true }));

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
  beforeEach(() => vi.clearAllMocks());

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
