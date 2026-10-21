import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { waitForIceGathering } from "./ice-gathering.ts";

/**
 * Minimal mock RTCPeerConnection that extends EventTarget so
 * addEventListener/removeEventListener work natively.
 */
class MockRTCPeerConnection extends EventTarget {
  iceGatheringState: RTCIceGatheringState = "new";

  simulateGatheringComplete() {
    this.iceGatheringState = "complete";
    this.dispatchEvent(new Event("icegatheringstatechange"));
  }
}

describe("waitForIceGathering", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves immediately if gathering is already complete", async () => {
    const pc = new MockRTCPeerConnection();
    pc.iceGatheringState = "complete";

    await expect(
      waitForIceGathering(pc as unknown as RTCPeerConnection)
    ).resolves.toBeUndefined();
  });

  it("resolves when gathering state changes to complete", async () => {
    const pc = new MockRTCPeerConnection();
    pc.iceGatheringState = "gathering";

    const promise = waitForIceGathering(pc as unknown as RTCPeerConnection);

    pc.simulateGatheringComplete();

    await expect(promise).resolves.toBeUndefined();
  });

  it("continues (resolves) on timeout instead of failing the call", async () => {
    const pc = new MockRTCPeerConnection();
    pc.iceGatheringState = "gathering";

    const promise = waitForIceGathering(
      pc as unknown as RTCPeerConnection,
      3000
    );

    vi.advanceTimersByTime(3000);

    await expect(promise).resolves.toBeUndefined();
  });

  it("cleans up event listener after completion", async () => {
    const pc = new MockRTCPeerConnection();
    pc.iceGatheringState = "gathering";

    const removeSpy = vi.spyOn(pc, "removeEventListener");

    const promise = waitForIceGathering(pc as unknown as RTCPeerConnection);

    pc.simulateGatheringComplete();
    await promise;

    expect(removeSpy).toHaveBeenCalledWith(
      "icegatheringstatechange",
      expect.any(Function)
    );
  });

  it("uses default 5-second timeout", async () => {
    const pc = new MockRTCPeerConnection();
    pc.iceGatheringState = "gathering";

    let settled = false;
    const promise = waitForIceGathering(
      pc as unknown as RTCPeerConnection
    ).then(() => {
      settled = true;
    });

    // At 4.9s, still waiting
    vi.advanceTimersByTime(4900);
    await Promise.resolve();
    expect(settled).toBe(false);

    // At 5s, gives up waiting and continues
    vi.advanceTimersByTime(100);
    await promise;
    expect(settled).toBe(true);
  });
});
