import { describe, it, expect, vi, beforeEach } from "vitest";
import { NativeVoice } from "./native-voice";
import {
  createNativeMicStream,
  createNativeOutput,
  createNativeDataChannel,
} from "./native-voice-stubs";

vi.mock("./native-voice", () => ({
  NativeVoice: {
    setMicEnabled: vi.fn(() => Promise.resolve()),
    setOutputMuted: vi.fn(() => Promise.resolve()),
    setVolume: vi.fn(() => Promise.resolve()),
    sendData: vi.fn(() => Promise.resolve()),
  },
}));

beforeEach(() => vi.clearAllMocks());

describe("native voice stand-ins", () => {
  it("mic track enabled setter forwards once and getter reflects it", () => {
    const t = createNativeMicStream("c1").getAudioTracks()[0];
    t.enabled = true;
    expect(NativeVoice.setMicEnabled).toHaveBeenCalledWith({
      callId: "c1",
      enabled: true,
    });
    expect(t.enabled).toBe(true);
    t.enabled = true;
    expect(NativeVoice.setMicEnabled).toHaveBeenCalledTimes(1);
  });

  it("stream exposes the same single audio track", () => {
    const s = createNativeMicStream("c1");
    expect(s.getTracks()[0]).toBe(s.getAudioTracks()[0]);
    expect(s.getTracks()).toHaveLength(1);
    expect(s.getTracks()[0].kind).toBe("audio");
    expect(s.getTracks()[0].enabled).toBe(false);
  });

  it("output muted/volume forward to native", () => {
    const el = createNativeOutput("c1");
    el.muted = true;
    expect(NativeVoice.setOutputMuted).toHaveBeenCalledWith({
      callId: "c1",
      muted: true,
    });
    el.volume = 0.2;
    expect(NativeVoice.setVolume).toHaveBeenCalledWith({
      callId: "c1",
      volume: 0.2,
    });
    expect(el.muted).toBe(true);
    expect(el.volume).toBe(0.2);
    expect(() => el.pause()).not.toThrow();
  });

  it("data channel sends through native only when open", () => {
    let open = false;
    const dc = createNativeDataChannel("c1", () => open);
    expect(dc.readyState).toBe("closed");
    open = true;
    expect(dc.readyState).toBe("open");
    dc.send("x");
    expect(NativeVoice.sendData).toHaveBeenCalledWith({
      callId: "c1",
      message: "x",
    });
  });
});
