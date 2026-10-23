import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ProductionLine } from "./production-line";
import { CallState } from "../../global-state/types";

const h = vi.hoisted(() => ({
  ios: false,
  getUserMedia: vi.fn(),
  audioInputArgs: [] as { audioInputId: string | null }[],
}));

vi.mock("../../platform", () => ({
  isIOSApp: () => h.ios,
  isAndroidApp: () => !h.ios,
  isMobileApp: () => true,
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isPluginAvailable: () => true, getPlatform: () => "ios" },
  registerPlugin: () => ({}),
}));
vi.mock("react-router", () => ({
  useParams: () => ({}),
  useNavigate: () => vi.fn(),
}));
vi.mock("react-hotkeys-hook", () => ({ useHotkeys: vi.fn() }));
vi.mock("../../global-state/context-provider.tsx", () => ({
  useGlobalState: () => [{}, vi.fn()],
}));
vi.mock("./native-voice-connection", () => ({
  NativeVoiceConnection: () => <div data-testid="native" />,
}));
vi.mock("./symphony-rtc-connection-component.tsx", () => ({
  SymphonyRtcConnectionComponent: () => <div data-testid="symphony" />,
}));
vi.mock("./use-audio-input.ts", () => ({
  useAudioInput: (args: { audioInputId: string | null }) => {
    h.audioInputArgs.push(args);
    return [null, false, vi.fn()];
  },
}));
vi.mock("../../mobile-overlay/native-voice-stubs", () => ({
  createNativeMicStream: () => ({ getTracks: () => [] }),
  createNativeOutput: vi.fn(),
  createNativeDataChannel: vi.fn(),
}));

// Everything else the line pulls in is irrelevant to which connection mounts.
vi.mock("../../hooks/use-call-action-handlers.ts", () => ({
  useCallActionHandlers: vi.fn(),
}));
vi.mock("../../hooks/use-push-to-talk.ts", () => ({
  usePushToTalk: () => ({}),
}));
vi.mock("../landing-page/use-fetch-production.ts", () => ({
  useFetchProduction: () => ({ production: null, error: null }),
}));
vi.mock("./use-active-participant.tsx", () => ({
  useActiveParticipant: () => ({ isActiveParticipant: false }),
}));
vi.mock("./use-audio-cue.ts", () => ({
  useAudioCue: () => ({ playEnterSound: vi.fn(), playExitSound: vi.fn() }),
}));
vi.mock("./use-check-bad-line-data.ts", () => ({
  useCheckBadLineData: vi.fn(),
}));
vi.mock("./use-line-hotkeys.ts", () => ({
  useLineHotkeys: vi.fn(),
  useSpeakerHotkeys: vi.fn(),
}));
vi.mock("./use-line-polling.ts", () => ({ useLinePolling: () => null }));
vi.mock("./use-master-input-mute.ts", () => ({ useMasterInputMute: vi.fn() }));
vi.mock("./use-mute-input.tsx", () => ({
  useMuteInput: () => ({ muteInput: vi.fn(), isInputMuted: true }),
}));
vi.mock("./use-update-call-device.tsx", () => ({
  useUpdateCallDevice: vi.fn(),
}));
vi.mock("./use-volume-reducer.tsx", () => ({ useVolumeReducer: vi.fn() }));
vi.mock("../mobile/use-mobile-production-line-bridge.ts", () => ({
  useMobileProductionLineBridge: () => ({
    registerMobileActionHandler: vi.fn(),
  }),
}));

const callState = {
  joinProductionOptions: {
    productionId: "1",
    lineId: "2",
    username: "u",
    audioinput: "dev",
    lineUsedForProgramOutput: false,
    isProgramUser: false,
  },
  mediaStreamInput: null,
  dominantSpeaker: null,
  audioLevelAboveThreshold: false,
  connectionState: null,
  audioElements: null,
  sessionId: null,
  hotkeys: {},
  dataChannel: null,
  isRemotelyMuted: false,
} as unknown as CallState;

const renderLine = (cs: CallState = callState) =>
  render(
    <ProductionLine
      id="c1"
      callState={cs}
      isSingleCall
      customGlobalMute="x"
      masterInputMute={false}
      shouldReduceVolume={false}
      callActionHandlers={{ current: {} }}
      setFailedToConnect={vi.fn()}
      registerCallList={vi.fn()}
    />
  );

describe("ProductionLine platform", () => {
  beforeEach(() => {
    h.audioInputArgs.length = 0;
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia: h.getUserMedia },
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("iOS renders NativeVoiceConnection and never opens a WebView mic", () => {
    h.ios = true;
    const { queryByTestId } = renderLine();
    expect(queryByTestId("native")).not.toBeNull();
    expect(queryByTestId("symphony")).toBeNull();
    expect(h.audioInputArgs[0].audioInputId).toBeNull();
    expect(h.getUserMedia).not.toHaveBeenCalled();
  });

  it("iOS shows Reconectando… while reconnecting", () => {
    h.ios = true;
    const { queryByText } = renderLine({ ...callState, reconnecting: true });
    expect(queryByText("Reconectando…")).not.toBeNull();
  });

  it("Android renders SymphonyRtcConnectionComponent with useAudioInput", () => {
    h.ios = false;
    const { queryByTestId } = renderLine();
    expect(queryByTestId("symphony")).not.toBeNull();
    expect(queryByTestId("native")).toBeNull();
    expect(h.audioInputArgs[0].audioInputId).toBe("dev");
  });
});
