import { useCallback, useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { isAndroidApp, isMobileApp } from "../../platform";
import { OverlayBubble } from "../../mobile-overlay/bubble";
import { CallService } from "../../mobile-overlay/call-service";
// AudioRoute disabled for now

type Step =
  | "idle"
  | "overlay"
  | "microphone"
  | "notifications"
  | "bluetooth"
  | "done";

const Bar = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: "0.8rem",
      padding: "0.6rem 1rem",
      background: "#2a2f34",
      color: "#fff",
      fontSize: "1.4rem",
      borderBottom: "1px solid #3a3f45",
      flexWrap: "wrap",
      justifyContent: "center",
      zIndex: 10,
    }}
  >
    {children}
  </div>
);

const Button = ({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void | Promise<void>;
  children: React.ReactNode;
  disabled?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    style={{
      background: "#3d84ff",
      color: "#fff",
      border: 0,
      borderRadius: 6,
      padding: "0.4rem 0.8rem",
      fontSize: "1.3rem",
      cursor: disabled ? "not-allowed" : "pointer",
    }}
  >
    {children}
  </button>
);

const hasCallServiceChecks = (): boolean =>
  Capacitor.isPluginAvailable("CallService") &&
  typeof (CallService as { hasRecordAudioPermission?: unknown })
    .hasRecordAudioPermission === "function";

const isMicrophoneGranted = async (): Promise<boolean> => {
  if (hasCallServiceChecks()) {
    try {
      const { granted } = await CallService.hasRecordAudioPermission();
      return !!granted;
    } catch {
      // fall through to Permissions API
    }
  }

  try {
    const micPerm = await (
      navigator as Navigator & {
        permissions?: {
          query: (desc: { name: string }) => Promise<{ state: string }>;
        };
      }
    ).permissions?.query({ name: "microphone" });
    return micPerm?.state === "granted";
  } catch {
    return false;
  }
};

const isNotificationGranted = async (): Promise<boolean> => {
  if (hasCallServiceChecks()) {
    try {
      const { granted } = await CallService.hasNotificationPermission();
      return !!granted;
    } catch {
      return false;
    }
  }
  return true;
};

export const StartupPermissions = () => {
  const [step, setStep] = useState<Step>("idle");
  const [busy, setBusy] = useState(false);

  const isAndroid = useMemo(() => isAndroidApp(), []);

  const evaluate = useCallback(async () => {
    if (!isMobileApp()) {
      setStep("done");
      return;
    }
    if (isAndroid) {
      try {
        const overlay = await OverlayBubble.canDrawOverlays();
        if (!overlay?.granted) {
          setStep("overlay");
          return;
        }
      } catch {
        // If probe fails, still attempt to request notifications next
      }
    }

    if (!(await isMicrophoneGranted())) {
      setStep("microphone");
      return;
    }

    if (isAndroid && !(await isNotificationGranted())) {
      setStep("notifications");
      return;
    }

    setStep("done");
  }, [isAndroid]);

  useEffect(() => {
    if (!isMobileApp()) return;
    evaluate();
  }, [evaluate]);

  // Re-check after user returns from system permission screens
  useEffect(() => {
    if (!isMobileApp()) return;
    const onVis = () => {
      if (document.hidden) return;
      if (step === "idle" || step === "done") return;
      evaluate();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [step, evaluate]);

  if (!isMobileApp() || step === "idle" || step === "done") return null;

  if (step === "overlay") {
    return (
      <Bar>
        <span>
          Para ativar os controles flutuantes, permita &quot;Sobrepor a outros
          apps&quot;.
        </span>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await OverlayBubble.openOverlayPermission();
            } catch {}
            setBusy(false);
          }}
        >
          Abrir configurações
        </Button>
      </Bar>
    );
  }

  if (step === "microphone") {
    return (
      <Bar>
        <span>Permita o acesso ao microfone para falar e ouvir.</span>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
              });
              try {
                stream.getTracks().forEach((t) => t.stop());
              } catch {}
            } catch {}
            setBusy(false);
            await evaluate();
          }}
        >
          Permitir microfone
        </Button>
      </Bar>
    );
  }

  // Notifications: Android 13+ shows a prompt; prior versions are no-op
  if (step === "notifications" && isAndroid) {
    return (
      <Bar>
        <span>Permita notificações para os serviços em segundo plano.</span>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await Promise.allSettled([
                CallService.requestNotificationPermission(),
                OverlayBubble.requestNotificationPermission?.(),
              ]);
            } catch {}
            setBusy(false);
            await evaluate();
          }}
        >
          Permitir notificações
        </Button>
      </Bar>
    );
  }

  // Bluetooth step disabled

  return null;
};
