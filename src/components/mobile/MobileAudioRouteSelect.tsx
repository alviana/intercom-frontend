import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  AudioRoute,
  type AudioRouteId,
  type AudioRouteItem,
} from "../../mobile-overlay/audio-route";
import { FormSelect } from "../form-elements/form-elements";
import { FormItem } from "../user-settings-form/form-item";
import {
  isAudioRouteAvailable,
  resolveAudioRouteToApply,
  setAndroidAudioRoute,
  writeStoredAudioRoute,
} from "../../utils/android-audio-route";

const DEFAULT_MOBILE_ROUTES: AudioRouteItem[] = [
  {
    id: "speaker",
    label: "Alto-falante do celular",
    available: true,
    type: "speaker",
  },
  {
    id: "earpiece",
    label: "Auricular do celular",
    available: true,
    type: "earpiece",
  },
];

export const MobileAudioRouteSelect = ({
  label = "Saída de áudio",
  trailingAction,
}: {
  label?: string;
  trailingAction?: ReactNode;
}) => {
  const [routes, setRoutes] = useState<AudioRouteItem[]>(DEFAULT_MOBILE_ROUTES);
  const [selected, setSelected] = useState<AudioRouteId | "">("speaker");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAudioRouteAvailable()) {
      return;
    }
    try {
      const { routes: nativeRoutes, active } =
        await AudioRoute.getAvailableRoutes();
      const nextRoutes =
        nativeRoutes.length > 0 ? nativeRoutes : DEFAULT_MOBILE_ROUTES;
      setRoutes(nextRoutes);
      const resolved =
        resolveAudioRouteToApply(nextRoutes, active) ?? "speaker";
      if (resolved) {
        setSelected(resolved);
        if (resolved !== active) {
          await setAndroidAudioRoute(resolved);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    if (!isAudioRouteAvailable()) return undefined;

    const listenerPromise = AudioRoute.addListener(
      "audioRouteChanged",
      (payload) => {
        const nextRoutes =
          payload.routes.length > 0 ? payload.routes : DEFAULT_MOBILE_ROUTES;
        setRoutes(nextRoutes);
        const next = resolveAudioRouteToApply(nextRoutes, payload.active);
        if (next) setSelected(next);
      }
    );

    return () => {
      listenerPromise.then((handle) => handle.remove()).catch(() => {});
    };
  }, [refresh]);

  const selectable = routes.filter((r) => r.available);

  return (
    <FormItem label={label}>
      <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <FormSelect
            value={selected}
            onChange={async (e) => {
              const route = e.target.value as AudioRouteId;
              if (!route || route === selected) return;
              setBusy(true);
              setSelected(route);
              writeStoredAudioRoute(route);
              try {
                await setAndroidAudioRoute(route);
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
          >
            {(selectable.length > 0 ? selectable : DEFAULT_MOBILE_ROUTES).map(
              (r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              )
            )}
          </FormSelect>
        </div>
        {trailingAction}
      </div>
    </FormItem>
  );
};
