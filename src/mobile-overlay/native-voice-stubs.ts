import { NativeVoice } from "./native-voice";

// Plain objects standing in for WebRTC/DOM objects so the UI can drive the
// native plugin; only the members the UI touches are implemented.

export const createNativeMicStream = (callId: string): MediaStream => {
  let enabled = false;
  const track = {
    kind: "audio",
    get enabled() {
      return enabled;
    },
    set enabled(v: boolean) {
      if (v === enabled) return;
      enabled = v;
      NativeVoice.setMicEnabled({ callId, enabled: v }).catch(() => {});
    },
    stop() {},
    addEventListener() {},
    removeEventListener() {},
  };
  return {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream;
};

export const createNativeOutput = (callId: string): HTMLAudioElement => {
  let muted = false;
  let volume = 1;
  return {
    get muted() {
      return muted;
    },
    set muted(v: boolean) {
      muted = v;
      NativeVoice.setOutputMuted({ callId, muted: v }).catch(() => {});
    },
    get volume() {
      return volume;
    },
    set volume(v: number) {
      volume = v;
      NativeVoice.setVolume({ callId, volume: v }).catch(() => {});
    },
    pause() {},
    srcObject: null,
    setSinkId: () => Promise.resolve(),
  } as unknown as HTMLAudioElement;
};

export const createNativeDataChannel = (
  callId: string,
  isOpen: () => boolean
): RTCDataChannel =>
  ({
    get readyState() {
      return isOpen() ? "open" : "closed";
    },
    send(message: string) {
      NativeVoice.sendData({ callId, message }).catch(() => {});
    },
  }) as unknown as RTCDataChannel;
