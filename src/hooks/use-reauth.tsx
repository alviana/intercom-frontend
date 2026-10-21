import { useCallback, useRef } from "react";
import { useGlobalState } from "../global-state/context-provider";
import { API } from "../api/api";
import { hasConfiguredBackend } from "../config";
import { isMobileApp } from "../platform";

const REAUTH_MAX_ATTEMPTS = 3;
const REAUTH_RETRY_DELAY_MS = 3000;

/** OSC session refresh — not used for API-key mobile auth or missing backends. */
const isBenignReauthFailure = (error: Error): boolean => {
  const { status } = error as Error & { status?: number };
  if (status === 401 || status === 404 || status === 500) return true;
  return /\b(401|404|500)\b/.test(error.message);
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const attemptReauth = async (): Promise<Error | null> => {
  let lastError: Error | null = null;
  let attempt = 0;

  while (attempt < REAUTH_MAX_ATTEMPTS) {
    attempt += 1;
    try {
      // eslint-disable-next-line no-await-in-loop
      await API.reauth();
      return null;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const { status } = lastError as Error & { status?: number };
      const is405Error = status === 405 || lastError.message.includes("405");
      if (is405Error) {
        // 405 means this backend doesn't implement /reauth (not behind OSC) —
        // this is a definitive signal, not a transient failure, so don't burn
        // the remaining attempts or sleeps
        return lastError;
      }
      if (attempt < REAUTH_MAX_ATTEMPTS) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(REAUTH_RETRY_DELAY_MS);
      }
    }
  }

  return lastError;
};

// Set up automatic token refresh every hour
export const useSetupTokenRefresh = () => {
  const [, dispatch] = useGlobalState();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setupTokenRefresh = useCallback(() => {
    // Skip reauth in local development — no OSC token service available
    if (import.meta.env.DEV) {
      return () => {};
    }

    // Android uses Bearer API key auth; /reauth is an OSC cookie endpoint.
    if (isMobileApp() || !hasConfiguredBackend()) {
      return () => {};
    }

    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Function to call reauthenticate with retries
    const reauth = async () => {
      const lastError = await attemptReauth();

      if (lastError && !isBenignReauthFailure(lastError)) {
        const { status } = lastError as Error & { status?: number };
        const is405Error = status === 405 || lastError.message.includes("405");
        if (is405Error) {
          // This backend doesn't implement /reauth (not behind OSC) — stop
          // trying permanently, no error banner, no console noise
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return;
        }
        const codePart = status != null ? status.toString() : "";
        dispatch({
          type: "ERROR",
          payload: {
            error: new Error(
              `Falha ao renovar a autenticação após ${REAUTH_MAX_ATTEMPTS} tentativas - ${codePart}`
            ),
          },
        });
      }
    };

    // Call reauthenticate immediately when entering the app to renew the cookie if it's valid
    reauth();

    // Set up interval to call reauthenticate every hour
    intervalRef.current = setInterval(reauth, 60 * 60 * 1000);

    // Clean up interval when unmounting
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [dispatch]);

  return { setupTokenRefresh };
};
