import { registerPlugin } from "@capacitor/core";

export interface CallServicePlugin {
  start(): Promise<{ running: boolean }>;
  stop(): Promise<{ running: boolean }>;
  isRunning(): Promise<{ running: boolean }>;
  hasNotificationPermission(): Promise<{ granted: boolean }>;
  hasRecordAudioPermission(): Promise<{ granted: boolean }>;
  requestNotificationPermission(): Promise<void>;
  /** Native heartbeats for these sessions keep presence alive while the WebView is throttled (screen off / background). */
  setSessions(options: {
    baseUrl: string;
    apiKey: string;
    sessionIds: string[];
  }): Promise<void>;
}

export const CallService = registerPlugin<CallServicePlugin>("CallService");
