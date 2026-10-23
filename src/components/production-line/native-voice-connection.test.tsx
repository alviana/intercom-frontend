import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor, act } from "@testing-library/react";
import { NativeVoiceConnection } from "./native-voice-connection";
import { TJoinProductionOptions } from "./types";

type Ev = Record<string, unknown>;

const h = vi.hoisted(() => ({
  listeners: {} as Record<string, (ev: Ev) => void>,
  remove: vi.fn(),
  join: vi.fn(),
  leave: vi.fn(),
}));

vi.mock("../../mobile-overlay/native-voice", () => ({
  NativeVoice: {
    join: h.join,
    leave: h.leave,
    addListener: vi.fn(async (name: string, cb: (ev: Ev) => void) => {
      h.listeners[name] = cb;
      return { remove: h.remove };
    }),
    setMicEnabled: vi.fn(() => Promise.resolve()),
    setOutputMuted: vi.fn(() => Promise.resolve()),
    setVolume: vi.fn(() => Promise.resolve()),
    sendData: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("../../config", () => ({
  getApiBaseUrl: () => "https://api.test",
  getApiKey: () => "key123",
}));

const options: TJoinProductionOptions = {
  productionId: "7",
  lineId: "3",
  username: "ana",
  audioinput: "dev",
  lineUsedForProgramOutput: false,
  isProgramUser: false,
};

type Props = ComponentProps<typeof NativeVoiceConnection>;

const ui = (
  dispatch: Props["dispatch"],
  muteInput: Props["muteInput"],
  canTalk = true
) => (
  <NativeVoiceConnection
    callId="c1"
    joinProductionOptions={options}
    canTalk={canTalk}
    dispatch={dispatch}
    muteInput={muteInput}
  />
);

const setup = (canTalk = true) => {
  const dispatch = vi.fn();
  const muteInput = vi.fn();
  const utils = render(ui(dispatch, muteInput, canTalk));
  return { dispatch, muteInput, ...utils };
};

const updates = (dispatch: ReturnType<typeof vi.fn>) =>
  dispatch.mock.calls.map((c) => c[0].payload.updates);

describe("NativeVoiceConnection", () => {
  beforeEach(() => {
    h.join.mockResolvedValue({
      callId: "c1",
      meta: "",
      sessionId: null,
      state: "connecting",
      micEnabled: false,
    });
    h.leave.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    Object.keys(h.listeners).forEach((k) => delete h.listeners[k]);
  });

  it("joins once with the call's parameters and meta", async () => {
    const { dispatch, muteInput, rerender } = setup();
    rerender(ui(dispatch, muteInput));
    await waitFor(() => expect(h.join).toHaveBeenCalledTimes(1));
    expect(h.join).toHaveBeenCalledWith({
      callId: "c1",
      baseUrl: "https://api.test",
      apiKey: "key123",
      productionId: "7",
      lineId: "3",
      username: "ana",
      canTalk: true,
      meta: JSON.stringify(options),
    });
    const u = updates(dispatch);
    expect(u.some((x) => x.audioElements?.length === 1)).toBe(true);
    expect(u.some((x) => x.mediaStreamInput)).toBe(true);
  });

  it("maps callState events to connectionState/sessionId/reconnecting", async () => {
    const { dispatch } = setup();
    await waitFor(() => expect(h.listeners.callState).toBeDefined());
    act(() =>
      h.listeners.callState({
        callId: "c1",
        state: "reconnecting",
        sessionId: "s1",
      })
    );
    expect(updates(dispatch)).toContainEqual({
      connectionState: "connecting",
      sessionId: "s1",
      reconnecting: true,
    });
    act(() =>
      h.listeners.callState({
        callId: "c1",
        state: "connected",
        sessionId: "s1",
      })
    );
    expect(updates(dispatch)).toContainEqual({
      connectionState: "connected",
      sessionId: "s1",
      reconnecting: false,
    });
  });

  it("forwards activity and dominantSpeaker", async () => {
    const { dispatch } = setup();
    await waitFor(() => expect(h.listeners.dominantSpeaker).toBeDefined());
    act(() => h.listeners.activity({ callId: "c1", active: true }));
    act(() => h.listeners.dominantSpeaker({ callId: "c1", endpoint: "e1" }));
    const u = updates(dispatch);
    expect(u).toContainEqual({ audioLevelAboveThreshold: true });
    expect(u).toContainEqual({ dominantSpeaker: "e1" });
  });

  it("micChanged from the headset updates the UI mic state", async () => {
    const { muteInput } = setup();
    await waitFor(() => expect(h.listeners.micChanged).toBeDefined());
    act(() =>
      h.listeners.micChanged({ callId: "c1", enabled: true, source: "fone" })
    );
    expect(muteInput).toHaveBeenCalledWith(false, "fone");
  });

  it("restores the mic state returned by join", async () => {
    h.join.mockResolvedValue({
      callId: "c1",
      meta: "",
      sessionId: "s1",
      state: "connected",
      micEnabled: true,
    });
    const { muteInput } = setup();
    await waitFor(() =>
      expect(muteInput).toHaveBeenCalledWith(false, "restaurado")
    );
  });

  it("ignores events of other calls", async () => {
    const { dispatch, muteInput } = setup();
    await waitFor(() => expect(h.listeners.dominantSpeaker).toBeDefined());
    dispatch.mockClear();
    act(() => {
      h.listeners.callState({
        callId: "other",
        state: "failed",
        sessionId: null,
      });
      h.listeners.micChanged({
        callId: "other",
        enabled: true,
        source: "fone",
      });
      h.listeners.activity({ callId: "other", active: true });
      h.listeners.dominantSpeaker({ callId: "other", endpoint: "x" });
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(muteInput).not.toHaveBeenCalled();
  });

  it("leaves on unmount", async () => {
    const { unmount } = setup();
    await waitFor(() => expect(h.listeners.dominantSpeaker).toBeDefined());
    unmount();
    expect(h.leave).toHaveBeenCalledWith({ callId: "c1" });
    await waitFor(() => expect(h.remove).toHaveBeenCalled());
  });

  it("does nothing after unmount, even if join resolves or events arrive late", async () => {
    let resolveJoin: (v: unknown) => void = () => {};
    h.join.mockReturnValue(
      new Promise((r) => {
        resolveJoin = r;
      })
    );
    const { dispatch, muteInput, unmount } = setup();
    await waitFor(() => expect(h.listeners.activity).toBeDefined());
    unmount();
    dispatch.mockClear();
    await act(async () => {
      resolveJoin({
        callId: "c1",
        meta: "",
        sessionId: "s",
        state: "connected",
        micEnabled: true,
      });
    });
    act(() => {
      h.listeners.activity({ callId: "c1", active: true });
      h.listeners.callState({
        callId: "c1",
        state: "connected",
        sessionId: "s",
      });
      h.listeners.micChanged({ callId: "c1", enabled: true, source: "fone" });
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(muteInput).not.toHaveBeenCalled();
  });

  it("dispatches null mediaStreamInput when it cannot talk", async () => {
    const { dispatch } = setup(false);
    await waitFor(() => expect(h.join).toHaveBeenCalled());
    expect(h.join.mock.calls[0][0].canTalk).toBe(false);
    expect(updates(dispatch)).toContainEqual(
      expect.objectContaining({ mediaStreamInput: null })
    );
  });
});
