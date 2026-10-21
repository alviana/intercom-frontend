import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLinePolling } from "./use-line-polling";
import { API } from "../../api/api";

vi.mock("../../api/api", () => ({
  API: { fetchProductionLine: vi.fn() },
}));

vi.mock("../../utils/logger.ts", () => ({
  default: { red: vi.fn(), cyan: vi.fn(), log: vi.fn() },
}));

const mockDispatch = vi.fn();
vi.mock("../../global-state/context-provider.tsx", () => ({
  useGlobalState: vi.fn(() => [{}, mockDispatch]),
}));

const fetchLine = API.fetchProductionLine as unknown as ReturnType<
  typeof vi.fn
>;

const options = {
  productionId: "9",
  lineId: "5",
  username: "user",
  lineUsedForProgramOutput: false,
  isProgramUser: false,
};

const statusError = (status: number) =>
  Object.assign(new Error(`status ${status}`), { status });

// Advance N polling ticks (1s each), settling each fetch promise in between.
const tick = async (count = 1) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000 * count);
  });
};

describe("useLinePolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps polling through a long network drop and warns only once", async () => {
    fetchLine.mockRejectedValue(new Error("network"));
    renderHook(() =>
      useLinePolling({ callId: "c1", joinProductionOptions: options })
    );

    await tick(15);

    expect(fetchLine).toHaveBeenCalledTimes(15);
    expect(mockDispatch).toHaveBeenCalledTimes(1);

    fetchLine.mockResolvedValue({ name: "mesa", participants: [] });
    await tick();
    expect(fetchLine).toHaveBeenCalledTimes(16);
  });

  it("stops polling when the line no longer exists (404)", async () => {
    fetchLine.mockRejectedValue(statusError(404));
    renderHook(() =>
      useLinePolling({ callId: "c1", joinProductionOptions: options })
    );

    await tick();
    await tick();
    await tick();

    expect(fetchLine).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });
});
