import { PluginListenerHandle, registerPlugin } from "@capacitor/core";

export type AudioRouteId = string;

export interface AudioRouteItem {
  id: AudioRouteId;
  label: string;
  available: boolean;
  type?: string;
  /** iOS: port name of a headset route; WebKit labels that mic with the same name. */
  name?: string;
}

export interface GetRoutesResult {
  routes: AudioRouteItem[];
  active?: AudioRouteId | null;
  /** iOS diagnostics: name of the mic in use and whether Bluetooth mics are allowed. */
  input?: string;
  hfp?: boolean;
  /** iOS diagnostics: route asked by the app and the input iOS keeps as preferred. */
  preferred?: string;
  preferredInput?: string;
  /** "name (portType)" lists of the inputs on offer and the current outputs. */
  inputs?: string;
  output?: string;
  /** Last failure applying the route, "" after a success. */
  lastError?: string;
  mode?: string;
  options?: number;
  sampleRate?: number;
}

/** pt-BR diagnostics line for the ROTA log (iOS sends the fields; Android does not). */
export const describeRouteState = (state: GetRoutesResult): string => {
  if (state.input === undefined) return "rota de áudio mudou";
  const parts = [
    `mic: ${state.input || "?"}`,
    `pedido: ${state.preferred ?? "?"}→${state.preferredInput || "nenhum"}`,
    `saída: ${state.output || "?"}`,
    `entradas: ${state.inputs || "nenhuma"}`,
    `${(state.mode ?? "?").replace("AVAudioSessionMode", "")} opções 0x${(state.options ?? 0).toString(16)} ${state.sampleRate ?? "?"} Hz`,
    `bluetooth-mic: ${state.hfp ? "sim" : "não"}`,
  ];
  if (state.lastError) parts.push(`erro: ${state.lastError}`);
  return parts.join(" · ");
};

export interface SetRouteResult {
  active?: AudioRouteId | null;
}

export interface AudioRoutePlugin {
  getAvailableRoutes(): Promise<GetRoutesResult>;
  setRoute(options: { route: AudioRouteId }): Promise<SetRouteResult>;
  playTestTone?(options?: {
    durationMs?: number;
    frequencyHz?: number;
    route?: AudioRouteId;
  }): Promise<void>;
  stopTestTone?(): Promise<void>;
  requestBluetoothPermission?(): Promise<void>;
  hasBluetoothPermission?(): Promise<{ granted: boolean }>;
  addListener(
    eventName: "audioRouteChanged",
    listenerFunc: (state: GetRoutesResult) => void
  ): Promise<PluginListenerHandle> & PluginListenerHandle;
}

export const AudioRoute = registerPlugin<AudioRoutePlugin>("AudioRoute");
