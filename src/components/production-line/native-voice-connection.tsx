import { Dispatch, useEffect, useRef } from "react";
import { getApiBaseUrl, getApiKey } from "../../config";
import {
  NativeVoice,
  type NativeCallState,
} from "../../mobile-overlay/native-voice";
import {
  createNativeDataChannel,
  createNativeMicStream,
  createNativeOutput,
} from "../../mobile-overlay/native-voice-stubs";
import { TGlobalStateAction } from "../../global-state/global-state-actions.ts";
import { TJoinProductionOptions } from "./types.ts";

type TProps = {
  callId: string;
  joinProductionOptions: TJoinProductionOptions | null;
  canTalk: boolean;
  dispatch: Dispatch<TGlobalStateAction>;
  muteInput: (mute: boolean, source?: string) => void;
  /** The line's native mic stand-in, so UI and call state share one stream. */
  micStream?: MediaStream;
};

const toConnectionState = (state: NativeCallState): RTCPeerConnectionState =>
  state === "reconnecting" ? "connecting" : state;

// Drives a line through the native plugin (iOS); renders nothing.
export const NativeVoiceConnection = ({
  callId,
  joinProductionOptions,
  canTalk,
  dispatch,
  muteInput,
  micStream,
}: TProps): null => {
  const muteRef = useRef(muteInput);
  muteRef.current = muteInput;

  useEffect(() => {
    if (!joinProductionOptions) return undefined;

    let state: NativeCallState = "connecting";
    let gotEvent = false;
    const update = (updates: Record<string, unknown>) =>
      dispatch({ type: "UPDATE_CALL", payload: { id: callId, updates } });

    update({
      audioElements: [createNativeOutput(callId)],
      dataChannel: createNativeDataChannel(callId, () => state === "connected"),
      mediaStreamInput: canTalk
        ? (micStream ?? createNativeMicStream(callId))
        : null,
    });

    const handles = [
      NativeVoice.addListener("callState", (ev) => {
        if (ev.callId !== callId) return;
        gotEvent = true;
        state = ev.state;
        update({
          connectionState: toConnectionState(ev.state),
          sessionId: ev.sessionId,
          reconnecting: ev.state === "reconnecting",
        });
      }),
      NativeVoice.addListener("micChanged", (ev) => {
        if (ev.callId === callId) muteRef.current(!ev.enabled, ev.source);
      }),
      NativeVoice.addListener("activity", (ev) => {
        if (ev.callId === callId)
          update({ audioLevelAboveThreshold: ev.active });
      }),
      NativeVoice.addListener("dominantSpeaker", (ev) => {
        if (ev.callId === callId) update({ dominantSpeaker: ev.endpoint });
      }),
    ];

    NativeVoice.join({
      callId,
      baseUrl: getApiBaseUrl(),
      apiKey: getApiKey() ?? "",
      productionId: String(joinProductionOptions.productionId),
      lineId: String(joinProductionOptions.lineId),
      username: joinProductionOptions.username,
      canTalk,
      meta: JSON.stringify(joinProductionOptions),
    })
      .then((info) => {
        if (!gotEvent) {
          state = info.state;
          update({
            connectionState: toConnectionState(info.state),
            sessionId: info.sessionId,
            reconnecting: info.state === "reconnecting",
          });
        }
        if (info.micEnabled) muteRef.current(false, "restaurado");
      })
      .catch(() => update({ connectionState: "failed" }));

    return () => {
      handles.forEach((p) => p.then((h) => h.remove()).catch(() => {}));
      NativeVoice.leave({ callId }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, joinProductionOptions, canTalk, dispatch]);

  return null;
};
