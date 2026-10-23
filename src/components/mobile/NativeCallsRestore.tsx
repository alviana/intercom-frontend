import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { isIOSApp } from "../../platform";
import { useGlobalState } from "../../global-state/context-provider";
import { NativeVoice } from "../../mobile-overlay/native-voice";
import { logHeadsetEvent } from "../../mobile-overlay/headset-diagnostics";
import { markNativeRestoreDone } from "../../mobile-overlay/native-restore";
import { createCallState } from "../../hooks/use-initiate-production-call";

// After a WebView reload the native plugin keeps the lines running; re-create
// them in global state under the same callId so ProductionLine re-attaches.
export const NativeCallsRestore = () => {
  const [state, dispatch] = useGlobalState();
  const navigate = useNavigate();
  const ran = useRef(false);
  const calls = useRef(state.calls);
  calls.current = state.calls;

  useEffect(() => {
    if (!isIOSApp() || ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const { calls: native } = await NativeVoice.listCalls();
        let added = false;
        for (const { callId, meta } of native.filter(
          (c) => !calls.current[c.callId]
        )) {
          try {
            dispatch({
              type: "ADD_CALL",
              payload: {
                id: callId,
                callState: createCallState(JSON.parse(meta), undefined, "p"),
              },
            });
            added = true;
          } catch (e) {
            logHeadsetEvent({
              at: Date.now(),
              key: "RESTAURAR",
              action: "restaurar linha nativa",
              source: callId,
              result: `ignorada: dados da linha inválidos (${e})`,
            });
          }
        }
        if (added) navigate("/calls");
      } catch (e) {
        logHeadsetEvent({
          at: Date.now(),
          key: "RESTAURAR",
          action: "listar linhas nativas",
          source: "NativeVoice",
          result: `falhou: ${e}`,
        });
      } finally {
        markNativeRestoreDone();
      }
    })();
  }, [dispatch, navigate]);

  return null;
};
