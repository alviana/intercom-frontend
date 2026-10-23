import { NativeVoice } from "../mobile-overlay/native-voice";
import { isIOSApp } from "../platform";

// Same "id." prefix and JSON value as the other stored settings (see android-audio-route).
const STORAGE_KEY = "id.callKitMode";

/** iOS switch "Botão do fone Bluetooth"; on unless the user turned it off. */
export const readStoredCallKitMode = (): boolean => {
  try {
    return (
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "true") === true
    );
  } catch {
    return true;
  }
};

/** iOS only: stores the switch and hands it to the native layer (also run at app start). */
export const applyCallKitMode = (enabled: boolean): void => {
  if (!isIOSApp()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled));
  } catch {
    // ignore
  }
  NativeVoice.setCallKitMode({ enabled }).catch(() => {});
};
