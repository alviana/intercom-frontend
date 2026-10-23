import { describe, expect, it } from "vitest";
import { describeRouteState } from "./audio-route";

describe("describeRouteState", () => {
  it("keeps the short line when the platform sends no diagnostics", () => {
    expect(describeRouteState({ routes: [], active: "speaker" })).toBe(
      "rota de áudio mudou"
    );
  });

  it("shows what was asked, what iOS offers and the last error", () => {
    expect(
      describeRouteState({
        routes: [],
        input: "Microfone do iPhone",
        hfp: true,
        preferred: "bluetooth",
        preferredInput: "",
        inputs: "Microfone do iPhone (MicrophoneBuiltIn)",
        output: "JBL (BluetoothA2DPOutput)",
        lastError: "bluetooth: Route not available: bluetooth",
        mode: "AVAudioSessionModeVoiceChat",
        options: 4,
        sampleRate: 48000,
      })
    ).toBe(
      "mic: Microfone do iPhone · pedido: bluetooth→nenhum · saída: JBL (BluetoothA2DPOutput) · entradas: Microfone do iPhone (MicrophoneBuiltIn) · VoiceChat opções 0x4 48000 Hz · bluetooth-mic: sim · erro: bluetooth: Route not available: bluetooth"
    );
  });
});
