import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type HeadsetButtonEvent = {
  key: string;
  action: "down" | "up";
  source: "media_session" | "callkit" | "remote_command";
};

export interface HeadsetButtonPlugin {
  addListener(
    eventName: "headsetButton",
    listener: (ev: HeadsetButtonEvent) => void
  ): Promise<PluginListenerHandle>;
}

export const HeadsetButton =
  registerPlugin<HeadsetButtonPlugin>("HeadsetButton");

/** Keys that toggle the mic of the headset line. */
export const TAP_KEYS: ReadonlySet<string> = new Set([
  "HEADSETHOOK",
  "MEDIA_PLAY_PAUSE",
  "MEDIA_PLAY",
  "MEDIA_PAUSE",
  "CALLKIT_MUTE",
  "CALLKIT_END",
]);
