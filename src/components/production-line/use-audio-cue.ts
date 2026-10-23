import { useCallback } from "react";
import { isIOSApp } from "../../platform";
import connectionStart from "../../assets/sounds/start-connection-451.wav";
import connectionStop from "../../assets/sounds/stop-connection-451.wav";

export const ENTER_CUE_DEBOUNCE_MS = 1500;

let enterAudio: HTMLAudioElement | null = null;
let exitAudio: HTMLAudioElement | null = null;
let lastEnterCueAt = Number.NEGATIVE_INFINITY;

const getAudioElement = (
  src: string,
  existingAudio: HTMLAudioElement | null
): HTMLAudioElement => {
  if (existingAudio) return existingAudio;

  const audio = new Audio(src);
  audio.preload = "auto";
  audio.load();
  return audio;
};

const playAudioElement = (audio: HTMLAudioElement) => {
  const audioElement = audio;

  try {
    audioElement.currentTime = 0;
  } catch {
    // Some mobile engines can reject seeking before metadata is available.
  }

  audioElement.play().catch(() => {});
};

export const useAudioCue = () => {
  // force: a mic cue that must sound even right after another one (headset presses).
  const playEnterSound = useCallback((force = false) => {
    if (isIOSApp()) return; // native plays the cues
    const now = Date.now();
    if (!force && now - lastEnterCueAt < ENTER_CUE_DEBOUNCE_MS) {
      return;
    }

    lastEnterCueAt = now;
    enterAudio = getAudioElement(connectionStart, enterAudio);
    playAudioElement(enterAudio);
  }, []);

  const playExitSound = useCallback(() => {
    if (isIOSApp()) return;
    exitAudio = getAudioElement(connectionStop, exitAudio);
    playAudioElement(exitAudio);
  }, []);

  return {
    playEnterSound,
    playExitSound,
  };
};
