import { useEffect, useState } from "react";
import { noop } from "../../helpers.ts";
import { API } from "../../api/api.ts";
import { TJoinProductionOptions, TLine } from "./types.ts";
import { useGlobalState } from "../../global-state/context-provider.tsx";
import logger from "../../utils/logger.ts";

type TProps = {
  callId: string;
  joinProductionOptions: TJoinProductionOptions | null;
};

export const useLinePolling = ({ callId, joinProductionOptions }: TProps) => {
  const [line, setLine] = useState<TLine | null>(null);
  const [, dispatch] = useGlobalState();

  useEffect(() => {
    if (!joinProductionOptions) return noop;

    let consecutiveFailureCount = 0;
    const productionId = parseInt(joinProductionOptions.productionId, 10);
    const lineId = parseInt(joinProductionOptions.lineId, 10);

    const interval = window.setInterval(() => {
      API.fetchProductionLine(productionId, lineId)
        .then((l) => {
          consecutiveFailureCount = 0;
          setLine(l);
        })
        .catch((err) => {
          consecutiveFailureCount += 1;
          logger.red(
            `Error fetching production line ${productionId}/${lineId}. For call-id: ${callId}`
          );
          // The line was deleted: stop for good.
          if (err?.status === 404) {
            dispatch({
              type: "ERROR",
              payload: {
                callId,
                error: new Error("Esta linha não existe mais."),
              },
            });
            window.clearInterval(interval);
            return;
          }
          // Network drops (e.g. switching 4G/Wi-Fi) are transient: warn once and keep polling.
          if (consecutiveFailureCount === 5) {
            dispatch({
              type: "ERROR",
              payload: {
                callId,
                error: new Error(
                  "Sem conexão com o servidor. Tentando reconectar…"
                ),
              },
            });
          }
        });
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [callId, dispatch, joinProductionOptions]);

  return line;
};
