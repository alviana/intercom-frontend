import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { NativeCallsRestore } from "./NativeCallsRestore";
import { NativeVoice } from "../../mobile-overlay/native-voice";
import { useGlobalState } from "../../global-state/context-provider";
import {
  clearHeadsetLog,
  getHeadsetLog,
} from "../../mobile-overlay/headset-diagnostics";

const platform = vi.hoisted(() => ({ ios: true }));
vi.mock("../../platform", () => ({ isIOSApp: () => platform.ios }));

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router", () => ({ useNavigate: () => navigate }));

vi.mock("../../mobile-overlay/native-voice", () => ({
  NativeVoice: { listCalls: vi.fn() },
}));

vi.mock("../../global-state/context-provider", () => ({
  useGlobalState: vi.fn(),
}));

const opts = { productionId: "1", lineId: "2", username: "u" };
const info = (callId: string, meta: string) => ({
  callId,
  meta,
  sessionId: "s",
  state: "connected",
  micEnabled: true,
});

describe("NativeCallsRestore", () => {
  const dispatch = vi.fn();
  const setup = (
    calls: Record<string, unknown>,
    native: ReturnType<typeof info>[]
  ) => {
    vi.mocked(useGlobalState).mockReturnValue([{ calls }, dispatch] as never);
    vi.mocked(NativeVoice.listCalls).mockResolvedValue({
      calls: native,
    } as never);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearHeadsetLog();
    platform.ios = true;
  });

  it("restores each native call once under its own callId and opens the calls page", async () => {
    setup({}, [
      info("a", JSON.stringify(opts)),
      info("b", JSON.stringify(opts)),
    ]);
    const { rerender } = render(<NativeCallsRestore />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/calls"));
    rerender(<NativeCallsRestore />);
    expect(dispatch).toHaveBeenCalledTimes(2);
    const first = dispatch.mock.calls[0][0];
    expect(first.type).toBe("ADD_CALL");
    expect(first.payload.id).toBe("a");
    expect(first.payload.callState.joinProductionOptions).toEqual(opts);
    expect(first.payload.callState.hotkeys.globalMuteHotkey).toBe("p");
    expect(dispatch.mock.calls[1][0].payload.id).toBe("b");
    expect(NativeVoice.listCalls).toHaveBeenCalledTimes(1);
  });

  it("skips calls already in state", async () => {
    setup({ a: {} }, [info("a", JSON.stringify(opts))]);
    render(<NativeCallsRestore />);
    await waitFor(() => expect(NativeVoice.listCalls).toHaveBeenCalled());
    await Promise.resolve();
    expect(dispatch).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does nothing on Android", async () => {
    platform.ios = false;
    setup({}, [info("a", JSON.stringify(opts))]);
    render(<NativeCallsRestore />);
    await Promise.resolve();
    expect(NativeVoice.listCalls).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("skips a call with broken meta", async () => {
    setup({}, [info("a", "{nope")]);
    render(<NativeCallsRestore />);
    await waitFor(() => expect(getHeadsetLog()).toHaveLength(1));
    expect(getHeadsetLog()[0].key).toBe("RESTAURAR");
    expect(dispatch).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
