import { Dispatch, useCallback, useEffect, useState } from "react";
import { noop } from "../../helpers";
import { isIOSApp, isMobileApp } from "../../platform";
import {
  readStoredAudioRoute,
  setAndroidAudioRoute,
} from "../../utils/android-audio-route";
import { TJoinProductionOptions } from "./types.ts";
import { TGlobalStateAction } from "../../global-state/global-state-actions.ts";

type TGetMediaDevicesOptions = {
  audioInputId: TJoinProductionOptions["audioinput"] | null;
  dispatch: Dispatch<TGlobalStateAction>;
};

export type TUseAudioInputValues = MediaStream | "no-device" | null;

type TUseAudioInput = (
  options: TGetMediaDevicesOptions
) => [TUseAudioInputValues, boolean, () => void];

// A hook for fetching the user selected audio input as a MediaStream
export const useAudioInput: TUseAudioInput = ({ audioInputId, dispatch }) => {
  const [audioInput, setAudioInput] = useState<TUseAudioInputValues>(null);
  const [audioInputError, setAudioInputError] = useState<boolean>(false);

  useEffect(() => {
    let aborted = false;
    let permissionStream: MediaStream | null = null;
    let selectedStream: MediaStream | null = null;

    if (!audioInputId) return noop;

    if (audioInputId === "no-device") return setAudioInput("no-device");

    // First request a generic audio stream to "reset" permissions
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      permissionStream = stream;
      permissionStream.getTracks().forEach((track) => track.stop());
      permissionStream = null;

      if (aborted) return;

      // Then request the specific audio input the user has selected
      navigator.mediaDevices
        .getUserMedia({
          // iOS: no deviceId (a saved one forced that mic, often the iPhone's); the route
          // picked in "Saída de áudio" is re-applied below once the mic is open.
          audio: isIOSApp()
            ? { noiseSuppression: true }
            : {
                deviceId: isMobileApp()
                  ? { ideal: audioInputId }
                  : { exact: audioInputId },
                noiseSuppression: true,
              },
        })
        .then((mediaStream) => {
          selectedStream = mediaStream;
          if (aborted) {
            selectedStream.getTracks().forEach((track) => track.stop());
            selectedStream = null;
            return;
          }

          // Default to muted input
          mediaStream.getTracks().forEach((t) => {
            // eslint-disable-next-line no-param-reassign
            t.enabled = false;
          });

          setAudioInput(mediaStream);

          // iOS: WebKit opens the iPhone mic; re-applying the chosen route moves the
          // capture to it (what re-picking it in "Saída de áudio" did by hand).
          const route = isIOSApp() ? readStoredAudioRoute() : null;
          if (route) setAndroidAudioRoute(route).catch(() => {});
        })
        .catch(() => {
          if (aborted) return;
          setAudioInputError(true);
          dispatch({
            type: "ERROR",
            payload: {
              error: new Error(
                "Os dispositivos selecionados não estão disponíveis"
              ),
            },
          });
        });
    });

    return () => {
      aborted = true;
      permissionStream?.getTracks().forEach((track) => track.stop());
      selectedStream?.getTracks().forEach((track) => track.stop());
    };
  }, [audioInputId, dispatch]);

  // Reset function to set audioInput to null
  const reset = useCallback(() => {
    if (audioInput && audioInput !== "no-device") {
      audioInput.getTracks().forEach((t) => t.stop());
    }
    setAudioInput(null);
  }, [audioInput]);

  return [audioInput, audioInputError, reset];
};
