import { useCallback, useEffect, useState } from "react";
import { logHeadsetEvent } from "../../mobile-overlay/headset-diagnostics";
import { useGlobalState } from "../../global-state/context-provider";
import { TUseAudioInputValues } from "./use-audio-input";

export const useMuteInput = ({
  isProgramOutputLine,
  isProgramUser,
  inputAudioStream,
  id,
}: {
  isProgramOutputLine: boolean | null | undefined;
  isProgramUser: boolean | null | undefined;
  inputAudioStream: TUseAudioInputValues;
  id: string;
}) => {
  const [isInputMuted, setIsInputMuted] = useState(true);
  const [, dispatch] = useGlobalState();

  const muteInput = useCallback(
    (mute: boolean, source = "tela") => {
      logHeadsetEvent({
        at: Date.now(),
        key: "MUTE",
        action: mute ? "desligar" : "ligar",
        source,
        result: `pedido por: ${source}`,
      });
      setIsInputMuted(mute);
      if (inputAudioStream && inputAudioStream !== "no-device") {
        inputAudioStream.getTracks().forEach((t) => {
          if (isProgramOutputLine && !isProgramUser) {
            // eslint-disable-next-line no-param-reassign
            t.enabled = false;
          } else {
            // eslint-disable-next-line no-param-reassign
            t.enabled = !mute;
          }
        });
      }
      if (mute) {
        dispatch({
          type: "UPDATE_CALL",
          payload: {
            id,
            updates: {
              isRemotelyMuted: false,
            },
          },
        });
      }
    },
    [dispatch, id, inputAudioStream, isProgramOutputLine, isProgramUser]
  );
  // Diagnostics: the system muting/ending the capture (e.g. iOS audio interruptions) and new captures.
  useEffect(() => {
    if (!inputAudioStream || inputAudioStream === "no-device") return undefined;
    const tracks = inputAudioStream.getTracks();
    const log = (type: string) =>
      logHeadsetEvent({
        at: Date.now(),
        key: "TRACK",
        action: type,
        source: "sistema",
        result: id,
      });
    const onEvent = (e: Event) => log(e.type);
    const names = ["mute", "unmute", "ended"];
    log(`novo: ${tracks[0]?.label || "?"}`);
    tracks.forEach((t) => names.forEach((n) => t.addEventListener(n, onEvent)));
    return () =>
      tracks.forEach((t) =>
        names.forEach((n) => t.removeEventListener(n, onEvent))
      );
  }, [inputAudioStream, id]);

  return { muteInput, isInputMuted };
};
