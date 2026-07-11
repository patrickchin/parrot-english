import { useEffect } from "react";
import type { OnboardingAcknowledgment as Acknowledgment } from "./onboarding-api";

type AudioLike = {
  addEventListener: (event: "ended" | "error", listener: () => void) => void;
  removeEventListener: (event: "ended" | "error", listener: () => void) => void;
  pause: () => void;
  play: () => Promise<void>;
};

type Timer = ReturnType<typeof setTimeout>;

export function beginAcknowledgmentPlayback({
  acknowledgment,
  clearTimer = clearTimeout,
  createAudio = (source) => new Audio(source),
  createObjectURL = (blob) => URL.createObjectURL(blob),
  noAudioDelayMs = 1_800,
  onAdvance,
  revokeObjectURL = (url) => URL.revokeObjectURL(url),
  setTimer = setTimeout,
}: {
  acknowledgment: Acknowledgment;
  clearTimer?: (timer: Timer) => void;
  createAudio?: (source: string) => AudioLike;
  createObjectURL?: (blob: Blob) => string;
  noAudioDelayMs?: number;
  onAdvance: () => void;
  revokeObjectURL?: (url: string) => void;
  setTimer?: (callback: () => void, delay: number) => Timer;
}) {
  let active = true;
  let advanced = false;
  let audio: AudioLike | null = null;
  let objectUrl = "";
  let timer: Timer | null = null;

  const advance = () => {
    if (!active || advanced) return;
    advanced = true;
    onAdvance();
  };

  const audioData = acknowledgment.audio;
  if (audioData) {
    try {
      const binary = globalThis.atob(audioData.base64);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      objectUrl = createObjectURL(
        new Blob([bytes], { type: audioData.contentType }),
      );
      audio = createAudio(objectUrl);
      audio.addEventListener("ended", advance);
      audio.addEventListener("error", advance);
      void audio.play().catch(advance);
    } catch {
      timer = setTimer(advance, noAudioDelayMs);
    }
  } else {
    timer = setTimer(advance, noAudioDelayMs);
  }

  return () => {
    active = false;
    if (timer !== null) clearTimer(timer);
    if (audio) {
      audio.removeEventListener("ended", advance);
      audio.removeEventListener("error", advance);
      audio.pause();
    }
    if (objectUrl) revokeObjectURL(objectUrl);
  };
}

export function OnboardingAcknowledgment({
  acknowledgment,
  onNext,
  operationId,
}: {
  acknowledgment: Acknowledgment;
  onNext: () => void;
  operationId: number;
}) {
  useEffect(
    () =>
      beginAcknowledgmentPlayback({
        acknowledgment,
        onAdvance: onNext,
      }),
    [acknowledgment, onNext, operationId],
  );

  return (
    <section className="onboarding-acknowledgment-card" aria-live="polite">
      <img
        alt="Peppa smiling"
        className="onboarding-acknowledgment-peppa"
        src="/assets/characters/peppa/peppa-happy.webp"
      />
      <h1>{acknowledgment.text}</h1>
      <button className="onboarding-next-button" onClick={onNext} type="button">
        Next
      </button>
    </section>
  );
}
