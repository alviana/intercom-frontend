import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { ProductionLine } from "./production-line";
import { CallState } from "../../global-state/types";

const h = vi.hoisted(() => ({
  ios: false,
  getUserMedia: vi.fn(),
  nativeProps: [] as {
    canTalk: boolean;
    onOutputMuted?: (m: boolean) => void;
  }[],
  line: null as unknown,
  registerCallList: vi.fn(),
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
  NativeVoiceConnection: (p: { canTalk: boolean }) => {
    h.nativeProps.push(p);
    return <div data-testid="native" />;
  },
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
vi.mock("./use-line-polling.ts", () => ({ useLinePolling: () => h.line }));
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
      registerCallList={h.registerCallList}
    />
  );

describe("ProductionLine platform", () => {
  beforeEach(() => {
    h.audioInputArgs.length = 0;
    h.nativeProps.length = 0;
    h.line = null;
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

  it("iOS can talk even when WebKit enumerated no audio input", () => {
    h.ios = true;
    renderLine({
      ...callState,
      joinProductionOptions: {
        ...callState.joinProductionOptions!,
        audioinput: "no-device",
      },
    });
    expect(h.nativeProps.at(-1)?.canTalk).toBe(true);
  });

  it("iOS never opens a program-output line for a non-program user", () => {
    h.ios = true;
    renderLine({
      ...callState,
      joinProductionOptions: {
        ...callState.joinProductionOptions!,
        lineUsedForProgramOutput: true,
        isProgramUser: false,
      },
    });
    expect(h.nativeProps.at(-1)?.canTalk).toBe(false);
  });

  const withOutput = (muted: boolean) => {
    const el = { muted, volume: 1 };
    return {
      el,
      cs: { ...callState, audioElements: [el] } as unknown as CallState,
    };
  };
  const lastOutputMuted = () =>
    h.registerCallList.mock.calls.at(-1)?.[1].isOutputMuted;

  it("iOS volume effect never unmutes a native-muted line", () => {
    h.ios = true;
    const { el, cs } = withOutput(true);
    renderLine(cs);
    expect(el.muted).toBe(true);
    expect(el.volume).toBe(0.75);
  });

  it("iOS follows native output mute through onOutputMuted", () => {
    h.ios = true;
    renderLine();
    act(() => h.nativeProps.at(-1)?.onOutputMuted?.(true));
    expect(lastOutputMuted()).toBe(true);
    act(() => h.nativeProps.at(-1)?.onOutputMuted?.(false));
    expect(lastOutputMuted()).toBe(false);
  });

  it("iOS program user on program line mutes via the stand-in", () => {
    h.ios = true;
    h.line = { programOutputLine: true, participants: [] };
    const { el, cs } = withOutput(false);
    renderLine({
      ...cs,
      joinProductionOptions: {
        ...callState.joinProductionOptions!,
        isProgramUser: true,
      },
    });
    expect(el.muted).toBe(true);
    expect(lastOutputMuted()).toBe(true);
  });

  it("Android output behaviour unchanged", () => {
    h.ios = false;
    const { el, cs } = withOutput(true);
    renderLine(cs);
    expect(el.muted).toBe(false);
    expect(h.nativeProps).toHaveLength(0);
  });

  it("Android renders SymphonyRtcConnectionComponent with useAudioInput", () => {
    h.ios = false;
    const { queryByTestId } = renderLine();
    expect(queryByTestId("symphony")).not.toBeNull();
    expect(queryByTestId("native")).toBeNull();
    expect(h.audioInputArgs[0].audioInputId).toBe("dev");
  });
});
