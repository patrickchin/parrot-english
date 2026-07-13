import { useEffect } from "react";
import type { LearnerProfileAcknowledgment as Acknowledgment } from "./learner-profile-api";
import { LearnerProfileCard } from "./LearnerProfileLayout";
import { ActionButton } from "../shared/ui";

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

export function LearnerProfileAcknowledgment({
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
    <LearnerProfileCard
      aria-live="polite"
      className="grid justify-items-center gap-5 p-8 text-center sm:p-14"
    >
      <img
        alt="Peppa smiling"
        className="max-h-60 w-40 animate-float object-contain drop-shadow-lg motion-reduce:animate-none sm:w-56"
        src="/assets/characters/peppa/peppa-happy.webp"
      />
      <h1 className="m-0 max-w-xl text-3xl leading-tight text-brand-ink sm:text-5xl">
        {acknowledgment.text}
      </h1>
      <ActionButton onClick={onNext} type="button">
        Next
      </ActionButton>
    </LearnerProfileCard>
  );
}
