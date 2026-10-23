import { Dispatch, useCallback, useEffect, useState } from "react";
import { noop } from "../../helpers";
import { isIOSApp, isMobileApp } from "../../platform";
import { resolveIOSMicDeviceId } from "../../utils/android-audio-route";
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

      const selected = {
        deviceId: isMobileApp()
          ? { ideal: audioInputId }
          : { exact: audioInputId },
        noiseSuppression: true,
      };
      // iOS: the mic follows the headset chosen in "Saída de áudio". exact makes WebKit
      // itself switch to that mic; if it can't, fall back to the "Microfone" choice.
      const iosMic = isIOSApp()
        ? resolveIOSMicDeviceId().catch(() => null)
        : Promise.resolve(null);

      // Then request the specific audio input the user has selected
      iosMic
        .then((micId) =>
          micId
            ? navigator.mediaDevices
                .getUserMedia({
                  audio: { deviceId: { exact: micId }, noiseSuppression: true },
                })
                .catch(() =>
                  navigator.mediaDevices.getUserMedia({ audio: selected })
                )
            : navigator.mediaDevices.getUserMedia({ audio: selected })
        )
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
