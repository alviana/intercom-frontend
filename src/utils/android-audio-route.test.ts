import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GetRoutesResult } from "../mobile-overlay/audio-route";
import {
  applyStoredAudioRoute,
  resolveAudioRouteToApply,
  setAndroidAudioRoute,
} from "./android-audio-route";

const mocks = vi.hoisted(() => ({
  getAvailableRoutes: vi.fn(),
  isIOSApp: vi.fn(),
  isMobileApp: vi.fn(),
  isPluginAvailable: vi.fn(),
  setRoute: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isPluginAvailable: mocks.isPluginAvailable,
  },
}));

vi.mock("../mobile-overlay/audio-route", () => ({
  AudioRoute: {
    getAvailableRoutes: mocks.getAvailableRoutes,
    setRoute: mocks.setRoute,
  },
}));

vi.mock("../platform", () => ({
  isIOSApp: mocks.isIOSApp,
  isMobileApp: mocks.isMobileApp,
}));

const routes: GetRoutesResult["routes"] = [
  {
    id: "speaker",
    label: "Phone speaker",
    available: true,
    type: "speaker",
  },
  {
    id: "earpiece",
    label: "Phone earpiece",
    available: true,
    type: "earpiece",
  },
];

const installLocalStorage = () => {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => store.delete(key),
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
};

describe("applyStoredAudioRoute", () => {
  beforeEach(() => {
    installLocalStorage();
    window.localStorage.clear();
    mocks.getAvailableRoutes.mockReset();
    mocks.isMobileApp.mockReturnValue(true);
    mocks.isPluginAvailable.mockReturnValue(true);
    mocks.setRoute.mockReset();
  });

  it("does not set the route again when the desired route is already active", async () => {
    window.localStorage.setItem("id.audioRoute", JSON.stringify("speaker"));
    mocks.getAvailableRoutes.mockResolvedValue({
      routes,
      active: "speaker",
    });

    await expect(applyStoredAudioRoute()).resolves.toBe("speaker");

    expect(mocks.setRoute).not.toHaveBeenCalled();
  });

  it("on iOS sets the route even when already active (native guards the headset mic for it)", async () => {
    mocks.isIOSApp.mockReturnValue(true);
    window.localStorage.setItem("id.audioRoute", JSON.stringify("speaker"));
    mocks.getAvailableRoutes.mockResolvedValue({ routes, active: "speaker" });
    mocks.setRoute.mockResolvedValue({ active: "speaker" });

    await applyStoredAudioRoute();

    expect(mocks.setRoute).toHaveBeenCalledWith({ route: "speaker" });
    mocks.isIOSApp.mockReturnValue(false);
  });

  it("coalesces concurrent route applies", async () => {
    window.localStorage.setItem("id.audioRoute", JSON.stringify("speaker"));
    let resolveRoutes: (result: GetRoutesResult) => void = () => {};
    const routesPromise = new Promise<GetRoutesResult>((resolve) => {
      resolveRoutes = resolve;
    });
    mocks.getAvailableRoutes.mockReturnValue(routesPromise);
    mocks.setRoute.mockResolvedValue({ active: "speaker" });

    const first = applyStoredAudioRoute();
    const second = applyStoredAudioRoute();

    expect(mocks.getAvailableRoutes).toHaveBeenCalledTimes(1);

    resolveRoutes({
      routes,
      active: "earpiece",
    });

    await expect(first).resolves.toBe("speaker");
    await expect(second).resolves.toBe("speaker");
    expect(mocks.setRoute).toHaveBeenCalledTimes(1);
    expect(mocks.setRoute).toHaveBeenCalledWith({ route: "speaker" });
  });
});

describe("iOS routing rules", () => {
  const iosRoutes: GetRoutesResult["routes"] = [
    { id: "speaker", label: "Phone speaker", available: true, type: "speaker" },
    {
      id: "bluetooth",
      label: "Bluetooth audio: JBL TUNE510BT",
      available: true,
      type: "bluetooth",
      name: "JBL TUNE510BT",
    },
    // native also lists the built-in mic as a device route (named like WebKit's label)
    {
      id: "device:builtin",
      label: "Phone earpiece: Microfone do iPhone",
      available: true,
      type: "earpiece",
      name: "Microfone do iPhone",
    },
  ];

  beforeEach(() => {
    installLocalStorage();
    window.localStorage.clear();
    mocks.isIOSApp.mockReturnValue(true);
    mocks.isMobileApp.mockReturnValue(true);
    mocks.getAvailableRoutes.mockResolvedValue({ routes: iosRoutes });
  });
  afterEach(() => {
    mocks.isIOSApp.mockReturnValue(false);
  });

  it("does not save an automatically applied speaker as the user's choice", async () => {
    mocks.setRoute.mockResolvedValue({ active: "speaker" });
    await setAndroidAudioRoute("speaker");
    expect(window.localStorage.getItem("id.audioRoute")).toBeNull();
    await setAndroidAudioRoute("bluetooth");
    expect(window.localStorage.getItem("id.audioRoute")).toBe('"bluetooth"');
  });

  it("prefers a connected headset when nothing was chosen yet", () => {
    expect(resolveAudioRouteToApply(iosRoutes, "speaker")).toBe("bluetooth");
  });
});
