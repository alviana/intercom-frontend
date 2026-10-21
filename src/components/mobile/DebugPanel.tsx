import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { OverlayBubble } from "../../mobile-overlay/bubble";
import { CallService } from "../../mobile-overlay/call-service";

type Status = {
  platform: string;
  overlayPlugin: boolean;
  callServicePlugin: boolean;
  overlayGranted?: boolean | null;
  overlayRunning?: boolean | null;
  overlayDebug?: {
    supported: boolean;
    liveActivitiesEnabled: boolean;
    runningRequested: boolean;
    rowCount: number;
    liveActivityCount: number;
    ids?: string[];
    labels?: string[];
    displayLabels?: string[];
    labelSources?: string[];
    lastError?: string | null;
    lastRequestAt?: string | null;
    lastUpdateAt?: string | null;
    lastDebugSnapshotAt?: string | null;
    lastAction?: { action?: string; index?: number } | null;
    lastActionAt?: string | null;
    jsDebug?: {
      reason?: string;
      platform?: string;
      callCount?: number;
      hasCalls?: boolean;
      documentHidden?: boolean;
      documentHasFocus?: boolean;
      running?: boolean;
      ids?: string[];
      labels?: string[];
      labelSources?: string[];
      timestamp?: string;
    } | null;
  } | null;
  callServiceRunning?: boolean | null;
  error?: string | null;
};

export const DebugPanel = () => {
  const [status, setStatus] = useState<Status>({
    platform: "web",
    overlayPlugin: false,
    callServicePlugin: false,
  });
  const [busy, setBusy] = useState(false);
  // AudioRoute temporarily disabled

  const refresh = useCallback(async () => {
    setBusy(true);
    const next: Status = {
      platform: Capacitor.getPlatform?.() || "web",
      overlayPlugin: Capacitor.isPluginAvailable("OverlayBubble"),
      callServicePlugin: Capacitor.isPluginAvailable("CallService"),
      error: null,
    } as Status;
    // AudioRoute disabled: do not touch saved route
    try {
      if (next.overlayPlugin) {
        const p = await OverlayBubble.canDrawOverlays();
        next.overlayGranted = !!p?.granted;
        const r = await OverlayBubble.isRunning();
        next.overlayRunning = !!r?.running;
        next.overlayDebug = OverlayBubble.getDebugState
          ? await OverlayBubble.getDebugState()
          : null;
      } else {
        next.overlayGranted = null;
        next.overlayRunning = null;
        next.overlayDebug = null;
      }
    } catch (e: any) {
      next.error = String(e?.message || e);
    }
    try {
      if (next.callServicePlugin) {
        const r = await CallService.isRunning();
        next.callServiceRunning = !!r?.running;
      } else {
        next.callServiceRunning = null;
      }
    } catch (e: any) {
      next.error = String(e?.message || e);
    }
    // AudioRoute disabled: skip route probing
    setStatus(next);
    setBusy(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // AudioRoute disabled: no listeners
  const overlayRows = status.overlayDebug
    ? Array.from({ length: status.overlayDebug.rowCount }, (_, index) => ({
        id: status.overlayDebug?.ids?.[index] ?? "",
        label:
          status.overlayDebug?.displayLabels?.[index] ??
          status.overlayDebug?.labels?.[index] ??
          "",
        source: status.overlayDebug?.labelSources?.[index] ?? "",
      }))
    : [];

  return (
    <div
      style={{
        border: "1px solid #444",
        borderRadius: 8,
        padding: 12,
        background: "#2a2f34",
        fontSize: "1.4rem",
        display: "grid",
        gap: 8,
      }}
    >
      <div>
        <strong>Plataforma:</strong> {status.platform}
      </div>
      <div>
        <strong>Plugins:</strong> OverlayBubble={String(status.overlayPlugin)} •
        CallService={String(status.callServicePlugin)}
      </div>
      <div>
        <strong>Overlay:</strong> permission=
        {status.overlayGranted === null
          ? "unknown"
          : String(status.overlayGranted)}{" "}
        • service=
        {status.overlayRunning === null
          ? "unknown"
          : String(status.overlayRunning)}
      </div>
      {status.overlayDebug && (
        <div>
          <strong>Live Activity:</strong> supported=
          {String(status.overlayDebug.supported)} • enabled=
          {String(status.overlayDebug.liveActivitiesEnabled)} • rows=
          {status.overlayDebug.rowCount} • active=
          {status.overlayDebug.liveActivityCount}
          {status.overlayDebug.lastError
            ? ` • error=${status.overlayDebug.lastError}`
            : ""}
          {status.overlayDebug.lastDebugSnapshotAt
            ? ` • snapshot=${status.overlayDebug.lastDebugSnapshotAt}`
            : ""}
          {status.overlayDebug.lastAction
            ? ` • action=${status.overlayDebug.lastAction.action ?? "unknown"}:${status.overlayDebug.lastAction.index ?? "all"}`
            : ""}
          {status.overlayDebug.jsDebug
            ? ` • js=${status.overlayDebug.jsDebug.reason ?? "unknown"} calls=${status.overlayDebug.jsDebug.callCount ?? "?"}`
            : ""}
          {overlayRows.length > 0 && (
            <div style={{ marginTop: 4 }}>
              {overlayRows.map((row, index) => (
                <div key={`${row.id || row.label || "row"}-${index}`}>
                  {index + 1}: {row.label || "(empty)"}{" "}
                  {row.id ? `id=${row.id}` : ""}
                  {row.source ? ` source=${row.source}` : ""}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div>
        <strong>CallService:</strong> running=
        {status.callServiceRunning === null
          ? "unknown"
          : String(status.callServiceRunning)}
      </div>
      {/* AudioRoute disabled */}
      {status.error && (
        <div style={{ color: "#f88" }}>
          <strong>Erro:</strong> {status.error}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" disabled={busy} onClick={refresh}>
          Atualizar
        </button>
        <button
          type="button"
          disabled={busy || !status.overlayPlugin}
          onClick={async () => {
            try {
              await OverlayBubble.openOverlayPermission();
            } catch (e) {}
          }}
        >
          Abrir configurações de sobreposição
        </button>
        <button
          type="button"
          disabled={busy || !status.overlayPlugin}
          onClick={async () => {
            try {
              await OverlayBubble.show();
            } catch (e) {}
          }}
        >
          Mostrar bolha
        </button>
        <button
          type="button"
          disabled={
            busy || !status.overlayPlugin || !OverlayBubble.showTestActivity
          }
          onClick={async () => {
            try {
              await OverlayBubble.showTestActivity?.();
              await refresh();
            } catch (e) {}
          }}
        >
          Testar atividade de depuração
        </button>
        <button
          type="button"
          disabled={busy || !status.overlayPlugin}
          onClick={async () => {
            try {
              await OverlayBubble.hide();
            } catch (e) {}
          }}
        >
          Ocultar bolha
        </button>
        <button
          type="button"
          disabled={busy || !status.callServicePlugin}
          onClick={async () => {
            try {
              await CallService.requestNotificationPermission();
            } catch (e) {}
          }}
        >
          Permitir notificações
        </button>
        <button
          type="button"
          disabled={busy || !status.callServicePlugin}
          onClick={async () => {
            try {
              await CallService.start();
            } catch (e) {}
          }}
        >
          Iniciar serviço de chamada
        </button>
        <button
          type="button"
          disabled={busy || !status.callServicePlugin}
          onClick={async () => {
            try {
              await CallService.stop();
            } catch (e) {}
          }}
        >
          Parar serviço de chamada
        </button>
        {/* AudioRoute disabled: no Apply Saved Route */}
      </div>

      {/* AudioRoute disabled: controls removed */}

      {/* Test tone moved to Settings page (below device selection) */}
    </div>
  );
};
