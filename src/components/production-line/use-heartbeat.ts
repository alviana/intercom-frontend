import { useEffect } from "react";
import { API } from "../../api/api.ts";
import { noop } from "../../helpers.ts";
import logger from "../../utils/logger.ts";
import { useGlobalState } from "../../global-state/context-provider.tsx";
import { isMobileApp } from "../../platform";

type TProps = { sessionId: string | null };

export const useHeartbeat = ({ sessionId }: TProps) => {
  const [, dispatch] = useGlobalState();

  useEffect(() => {
    if (!sessionId) return noop;

    let failure401Count = 0;
    const interval = window.setInterval(() => {
      API.heartbeat({ sessionId })
        .then(() => {
          failure401Count = 0; // resets after success
        })
        .catch((err) => {
          // 410: the server no longer has this session (e.g. ended after a failed join).
          if (err.status === 410) {
            window.clearInterval(interval);
            return;
          }
          if (err.status === 401) {
            failure401Count += 1;
          }
          // Might want to add another dispatch here for other error codes.
          logger.red(`Error sending heartbeat for session ${sessionId}.`);
          if (failure401Count >= 3) {
            dispatch({
              type: "HEARTBEAT_ERROR",
              payload: {
                sessionId,
                error: new Error(
                  "Conexão com o servidor interrompida após 3 tentativas sem resposta."
                ),
              },
            });
            window.clearInterval(interval);
          }
        });
    }, 10_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [sessionId, dispatch]);

  // Web only: end the session when the page is reloaded or closed, otherwise it
  // lingers in the participant list as a duplicate until it times out (~100 s).
  // Skipped in the mobile app, where the page may only be going to the background.
  useEffect(() => {
    if (!sessionId || isMobileApp()) return noop;

    const onPageHide = (e: PageTransitionEvent) => {
      if (e.persisted) return; // kept in the back/forward cache: the call may come back
      API.deleteAudioSession({ sessionId, keepalive: true }).catch(noop);
    };
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [sessionId]);
};
