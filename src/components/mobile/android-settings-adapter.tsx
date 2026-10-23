import { useEffect, useRef, useState } from "react";
import { useGlobalState } from "../../global-state/context-provider";
import { useWebSocket } from "../../hooks/use-websocket";
import { useWebsocketActions } from "../../hooks/use-websocket-actions";
import { useWebsocketReconnect } from "../../hooks/use-websocket-reconnect";
import { AppControl } from "../../mobile-overlay/app-control";
import { formatMediaDeviceLabel } from "../../utils/device-labels";
import {
  playAndroidAudioRouteTestTone,
  stopAndroidAudioRouteTestTone,
} from "../../utils/android-audio-route-test-tone";
import { FormInput, PrimaryButton } from "../form-elements/form-elements";
import { FormItem } from "../user-settings-form/form-item";
import {
  sanitizeStoredUrl,
  type UserSettingsFormAdapter,
  type UserSettingsFormAdapterContext,
  type UserSettingsFormPayload,
} from "../user-settings-form/user-settings-form-adapter";
import { Spinner } from "../loader/loader";
import { MobileAudioRouteSelect } from "./MobileAudioRouteSelect";
import { DebugPanel } from "./DebugPanel";
import { companionFeatureEnabled } from "../../config";
import { isIOSApp } from "../../platform";

export const submitAndroidSettings = (
  payload: UserSettingsFormPayload,
  context: UserSettingsFormAdapterContext
) => {
  const settingsPayload = payload as {
    backendUrl?: string;
    backendApiKey?: string;
  };
  const rawBackendUrl = settingsPayload.backendUrl?.trim();
  const backendUrl = rawBackendUrl
    ? sanitizeStoredUrl(rawBackendUrl)
    : undefined;
  const backendApiKey = settingsPayload.backendApiKey?.trim() || undefined;

  if (payload.username) context.writeToStorage("username", payload.username);
  if (payload.audioinput) {
    context.writeToStorage("audioinput", payload.audioinput);
  }
  context.removeFromStorage("audiooutput");
  if (backendUrl) {
    context.writeToStorage("backendUrl", backendUrl);
  } else {
    context.removeFromStorage("backendUrl");
  }
  if (backendApiKey) {
    context.writeToStorage("backendApiKey", backendApiKey);
  } else {
    context.removeFromStorage("backendApiKey");
  }

  context.dispatch({
    type: "UPDATE_USER_SETTINGS",
    payload: {
      username: payload.username,
      audioinput: payload.audioinput,
      audiooutput: undefined,
      backendUrl,
      backendApiKey,
    },
  });
  context.dispatch({ type: "PRODUCTION_UPDATED" });
};

export const useAndroidSettingsFormAdapter = (): UserSettingsFormAdapter => {
  const [{ calls, userSettings }, dispatch] = useGlobalState();
  const callIndexMap = useRef<Record<number, string>>({});
  const callActionHandlers = useRef<Record<string, Record<string, () => void>>>(
    {}
  );
  const everConnectedRef = useRef(false);
  const [isWSReconnecting, setIsWSReconnecting] = useState(false);
  const [isConnectionConflict, setConnectionConflict] = useState(false);
  const [hostPort, setHostPort] = useState("");
  const [showDebug, setShowDebug] = useState(false);
  const [showFloatingControlsDebug, setShowFloatingControlsDebug] = useState(
    import.meta.env.DEV
  );
  const [tone, setTone] = useState<{
    ctx: AudioContext | null;
    stop: (() => void) | null;
  }>({ ctx: null, stop: null });

  useEffect(() => {
    callIndexMap.current = {};
    Object.keys(calls || {}).forEach((callId, i) => {
      callIndexMap.current[i + 1] = callId;
    });
  }, [calls]);

  const handleAction = useWebsocketActions({
    callIndexMap,
    callActionHandlers,
    handleToggleGlobalMute: () => {},
  });

  const { wsConnect, wsDisconnect, isWSConnected } = useWebSocket({
    onAction: handleAction,
    dispatch,
    onConnected: () => {
      everConnectedRef.current = true;
      setConnectionConflict(false);
    },
    resetLastSentCallsState: () => {},
    onConflict: () => {
      setConnectionConflict(true);
      setIsWSReconnecting(false);
    },
  });

  useWebsocketReconnect({
    calls,
    isMasterInputMuted: false,
    everConnected: everConnectedRef.current,
    isWSReconnecting,
    isWSConnected,
    isConnectionConflict,
    setIsWSReconnecting,
    wsConnect,
  });

  useEffect(() => {
    try {
      const savedHostPort = window.localStorage.getItem("companionWsHostPort");
      if (savedHostPort) setHostPort(savedHostPort);
      const savedUrl = window.localStorage.getItem("companionWsUrl");
      if (savedUrl && !isWSConnected && !isWSReconnecting) {
        setConnectionConflict(false);
        wsConnect(savedUrl);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void AppControl.getBuildInfo()
      .then((info) => setShowFloatingControlsDebug(!!info?.debuggable))
      .catch(() => setShowFloatingControlsDebug(false));
  }, []);

  const stopTone = async () => {
    await stopAndroidAudioRouteTestTone();
    tone.stop?.();
    setTone({ ctx: null, stop: null });
  };

  const playFallbackTone = async () => {
    const AudioContextCtor =
      window.AudioContext ??
      (
        window as Window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (!AudioContextCtor) return false;

    const ctx = new AudioContextCtor();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.frequency.value = 440;
    oscillator.type = "sine";
    gain.gain.value = 0.12;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    await ctx.resume();
    oscillator.start();
    const timeout = window.setTimeout(() => {
      oscillator.stop();
      void ctx.close();
      setTone({ ctx: null, stop: null });
    }, 5000);
    setTone({
      ctx,
      stop: () => {
        window.clearTimeout(timeout);
        oscillator.stop();
        void ctx.close();
      },
    });
    return true;
  };

  const testToneButton = (
    <PrimaryButton
      type="button"
      style={{ flexShrink: 0, whiteSpace: "nowrap" }}
      onClick={async () => {
        if (tone.ctx) {
          try {
            await stopTone();
          } catch {
            // ignore
          }
          return;
        }
        if (await playAndroidAudioRouteTestTone()) {
          const timeout = window.setTimeout(() => {
            setTone({ ctx: null, stop: null });
          }, 5000);
          setTone({
            ctx: { close: () => {} } as unknown as AudioContext,
            stop: () => {
              window.clearTimeout(timeout);
              void stopAndroidAudioRouteTestTone();
            },
          });
        } else {
          await playFallbackTone();
        }
      }}
    >
      {tone.ctx ? "Parar" : "Testar som"}
    </PrimaryButton>
  );

  const protocol = "ws://";
  const connectCompanion = () => {
    const url = `${protocol}${hostPort}`;
    try {
      window.localStorage.setItem("companionWsHostPort", hostPort);
      window.localStorage.setItem("companionWsUrl", url);
    } catch {
      // ignore
    }
    setConnectionConflict(false);
    wsConnect(url);
  };

  return {
    inputLabel: "Microfone",
    // iOS: the mic follows "Saída de áudio" natively; the WebKit list no longer applies.
    hideInput: isIOSApp(),
    formatDeviceLabel: formatMediaDeviceLabel,
    renderDeviceOutputOverride: () => (
      <MobileAudioRouteSelect
        label="Saída de áudio"
        trailingAction={testToneButton}
      />
    ),
    renderExtraFields: ({ errors, register }) => (
      <>
        <FormItem
          label="Endereço do servidor"
          fieldName="backendUrl"
          errors={errors}
        >
          <FormInput
            // eslint-disable-next-line
            {...register(`backendUrl` as any, {
              validate: (v) => {
                if (!v) return true;
                try {
                  const parsed = new URL(sanitizeStoredUrl(String(v)));
                  void parsed.href;
                  return true;
                } catch {
                  return "Informe um endereço válido (ex.: https://intercom.ac24horas.com/manager)";
                }
              },
            })}
            placeholder="https://intercom.ac24horas.com/manager"
          />
        </FormItem>
        <FormItem
          label="Chave de API do servidor"
          fieldName="backendApiKey"
          errors={errors}
        >
          <FormInput
            // eslint-disable-next-line
            {...register(`backendApiKey` as any)}
            type="password"
            placeholder="Chave de acesso (opcional)"
          />
        </FormItem>
        {companionFeatureEnabled && (
          <FormItem label="Companion (Stream Deck)">
            <div style={{ display: "grid", gap: "0.6rem" }}>
              <div style={{ position: "relative" }}>
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: "0.6rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#9aa3ab",
                    fontSize: "1.4rem",
                    pointerEvents: "none",
                  }}
                >
                  {protocol}
                </span>
                <FormInput
                  style={{ paddingLeft: "5.6rem", marginBottom: 0 }}
                  aria-label="Endereço e porta do Companion"
                  type="text"
                  placeholder="endereço:porta"
                  value={hostPort}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    let withoutProtocol = v;
                    if (v.startsWith("ws://")) withoutProtocol = v.slice(5);
                    if (v.startsWith("wss://")) withoutProtocol = v.slice(6);
                    setHostPort(withoutProtocol);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      connectCompanion();
                    }
                  }}
                />
              </div>
              <div
                style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}
              >
                {!isWSConnected ? (
                  <PrimaryButton
                    type="button"
                    onClick={connectCompanion}
                    disabled={!hostPort}
                    className={isWSReconnecting ? "with-loader" : ""}
                  >
                    {isWSReconnecting ? (
                      <Spinner className="companion-loader" />
                    ) : (
                      "Conectar"
                    )}
                  </PrimaryButton>
                ) : (
                  <PrimaryButton type="button" onClick={wsDisconnect}>
                    Desconectar
                  </PrimaryButton>
                )}
                <div style={{ opacity: 0.85 }}>
                  Status:{" "}
                  {isWSConnected
                    ? "conectado"
                    : isWSReconnecting
                      ? "reconectando"
                      : "desconectado"}
                  {isConnectionConflict ? " • conflito" : ""}
                </div>
              </div>
            </div>
          </FormItem>
        )}
      </>
    ),
    renderSettingsStatusFields: () =>
      showFloatingControlsDebug ? (
        <FormItem label="Controles flutuantes">
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            <PrimaryButton
              type="button"
              onClick={() => setShowDebug((value) => !value)}
            >
              {showDebug
                ? "Ocultar informações de depuração"
                : "Mostrar informações de depuração"}
            </PrimaryButton>
            {showDebug && (
              <div style={{ width: "100%", marginTop: 8 }}>
                <DebugPanel />
              </div>
            )}
          </div>
        </FormItem>
      ) : null,
    onImmediateDeviceSettingChange: (key, value, context) => {
      context.writeToStorage(key, value);
      context.dispatch({
        type: "UPDATE_USER_SETTINGS",
        payload: {
          ...userSettings,
          [key]: value,
        },
      });
    },
    onSubmitSettings: submitAndroidSettings,
  };
};
