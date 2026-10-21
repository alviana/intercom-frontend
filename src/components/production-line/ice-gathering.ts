/**
 * Best-effort wait for ICE gathering to finish.
 * The SDP answer is sent without our candidates (the SMB learns our address
 * from incoming connectivity checks), so a slow gatherer — common on mobile
 * networks — must not fail the call: on timeout we simply continue.
 */

const DEFAULT_ICE_TIMEOUT_MS = 5000;

export const waitForIceGathering = (
  rtcPeerConnection: RTCPeerConnection,
  timeoutMs: number = DEFAULT_ICE_TIMEOUT_MS
): Promise<void> =>
  new Promise((resolve) => {
    if (rtcPeerConnection.iceGatheringState === "complete") {
      resolve();
      return;
    }

    let timeout: number | null = null;

    const cb = () => {
      if (rtcPeerConnection.iceGatheringState === "complete") {
        rtcPeerConnection.removeEventListener("icegatheringstatechange", cb);

        if (timeout !== null) {
          window.clearTimeout(timeout);
        }

        resolve();
      }
    };

    timeout = window.setTimeout(() => {
      rtcPeerConnection.removeEventListener("icegatheringstatechange", cb);
      resolve();
    }, timeoutMs);

    rtcPeerConnection.addEventListener("icegatheringstatechange", cb);
  });
