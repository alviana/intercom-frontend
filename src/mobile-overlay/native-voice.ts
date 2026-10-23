import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type NativeCallState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed"
  | "closed";

export interface NativeJoinOptions {
  callId: string;
  baseUrl: string;
  apiKey: string;
  productionId: string;
  lineId: string;
  username: string;
  canTalk: boolean;
  /** JSON of the call's joinProductionOptions, stored and returned verbatim. */
  meta: string;
}

export interface NativeCallInfo {
  callId: string;
  meta: string;
  sessionId: string | null;
  state: NativeCallState;
  micEnabled: boolean;
}

export interface NativeVoicePlugin {
  join(o: NativeJoinOptions): Promise<NativeCallInfo>;
  leave(o: { callId: string }): Promise<void>;
  setMicEnabled(o: { callId: string; enabled: boolean }): Promise<void>;
  setOutputMuted(o: { callId: string; muted: boolean }): Promise<void>;
  setVolume(o: { callId: string; volume: number }): Promise<void>;
  sendData(o: { callId: string; message: string }): Promise<void>;
  listCalls(): Promise<{ calls: NativeCallInfo[] }>;
  checkMicPermission(): Promise<{ granted: boolean }>;
  requestMicPermission(): Promise<{ granted: boolean }>;
  addListener(
    eventName: "callState",
    listener: (ev: {
      callId: string;
      state: NativeCallState;
      sessionId: string | null;
    }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "micChanged",
    listener: (ev: {
      callId: string;
      enabled: boolean;
      source: "fone" | "interrupção" | "remoto";
    }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "activity",
    listener: (ev: { callId: string; active: boolean }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "dominantSpeaker",
    listener: (ev: { callId: string; endpoint: string }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "diag",
    listener: (ev: { key: string; action: string; result: string }) => void
  ): Promise<PluginListenerHandle>;
}

export const NativeVoice = registerPlugin<NativeVoicePlugin>("NativeVoice");
