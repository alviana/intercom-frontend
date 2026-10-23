import {
  AudioRoute,
  type AudioRouteId,
  type AudioRouteItem,
} from "../mobile-overlay/audio-route";
import { isIOSApp, isMobileApp } from "../platform";

const STORAGE_KEY = "audioRoute";

const ROUTE_TYPE_ORDER = ["headset", "earpiece", "bluetooth", "speaker"];

export const isAudioRouteAvailable = (): boolean => isMobileApp();

export const readStoredAudioRoute = (): AudioRouteId | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("id.audioRoute");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "string" && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
};

export const writeStoredAudioRoute = (route: AudioRouteId): void => {
  try {
    window.localStorage.setItem("id.audioRoute", JSON.stringify(route));
  } catch {
    // ignore
  }
};

export const pickDefaultAudioRoute = (
  routes: AudioRouteItem[]
): AudioRouteId | null => {
  return (
    ROUTE_TYPE_ORDER.map(
      (type) =>
        routes.find((route) => route.available && route.type === type)?.id
    ).find(Boolean) ??
    routes.find((route) => route.available)?.id ??
    null
  );
};

export const resolveAudioRouteToApply = (
  routes: AudioRouteItem[],
  active: AudioRouteId | null | undefined
): AudioRouteId | null => {
  const stored = readStoredAudioRoute();
  if (stored && routes.some((r) => r.id === stored && r.available)) {
    return stored;
  }
  // iOS, nothing chosen yet: a connected headset beats the speaker the session starts on.
  const headset = isIOSApp()
    ? routes.find(
        (r) => r.available && (r.id === "headset" || r.id === "bluetooth")
      )
    : undefined;
  if (headset) return headset.id;
  if (active && routes.some((r) => r.id === active && r.available)) {
    return active;
  }
  return pickDefaultAudioRoute(routes);
};

export const setAndroidAudioRoute = async (
  route: AudioRouteId
): Promise<AudioRouteId | null> => {
  if (!isAudioRouteAvailable()) return null;
  try {
    const result = await AudioRoute.setRoute({ route });
    // iOS: an automatically applied speaker/earpiece is not a user choice (the picker saves
    // its own pick); saving it kept the iPhone mic after a headset was connected.
    if (!isIOSApp() || (route !== "speaker" && route !== "earpiece")) {
      writeStoredAudioRoute(route);
    }
    return result.active ?? route;
  } catch {
    return null;
  }
};

let pendingStoredRouteApply: Promise<AudioRouteId | null> | null = null;

const applyStoredAudioRouteNow = async (): Promise<AudioRouteId | null> => {
  const { routes, active } = await AudioRoute.getAvailableRoutes();
  const route = resolveAudioRouteToApply(routes, active);
  if (!route) return null;

  // iOS still applies it: native keeps the chosen headset mic only for a route set through it.
  if (route === active && !isIOSApp()) {
    writeStoredAudioRoute(route);
    return active;
  }

  return setAndroidAudioRoute(route);
};

export const applyStoredAudioRoute = async (): Promise<AudioRouteId | null> => {
  if (!isAudioRouteAvailable()) return null;
  if (pendingStoredRouteApply) return pendingStoredRouteApply;

  pendingStoredRouteApply = applyStoredAudioRouteNow();

  try {
    return await pendingStoredRouteApply;
  } catch {
    return null;
  } finally {
    pendingStoredRouteApply = null;
  }
};

export { STORAGE_KEY as ANDROID_AUDIO_ROUTE_STORAGE_KEY };
