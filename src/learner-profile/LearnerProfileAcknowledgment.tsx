import { useEffect, useRef } from "react";
import type { LearnerProfileAcknowledgment as Acknowledgment } from "./learner-profile-api";
import { LearnerProfileCard } from "./LearnerProfileLayout";
import { ActionButton } from "../shared/ui";

type AudioLike = {
  addEventListener: (event: "ended" | "error", listener: () => void) => void;
  removeEventListener: (event: "ended" | "error", listener: () => void) => void;
  pause: () => void;
  play: () => Promise<void>;
};

export function beginAcknowledgmentPlayback({
  acknowledgment,
  createAudio = (source) => new Audio(source),
  createObjectURL = (blob) => URL.createObjectURL(blob),
  revokeObjectURL = (url) => URL.revokeObjectURL(url),
}: {
  acknowledgment: Acknowledgment;
  createAudio?: (source: string) => AudioLike;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
}) {
  let audio: AudioLike | null = null;
  let cleanedUp = false;
  let objectUrl = "";

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (audio) {
      audio.removeEventListener("ended", cleanup);
      audio.removeEventListener("error", cleanup);
      audio.pause();
    }
    if (objectUrl) revokeObjectURL(objectUrl);
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
      audio.addEventListener("ended", cleanup);
      audio.addEventListener("error", cleanup);
      void audio.play().catch(cleanup);
    } catch {
      // Audio is optional feedback. The visible Next action owns navigation.
      cleanup();
    }
  }

  return cleanup;
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
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(
    () =>
      beginAcknowledgmentPlayback({
        acknowledgment,
      }),
    [acknowledgment, operationId],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      headingRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [operationId]);

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
      <h1
        className="m-0 max-w-xl text-3xl leading-tight text-brand-ink sm:text-5xl"
        ref={headingRef}
        tabIndex={-1}
      >
        {acknowledgment.text}
      </h1>
      <ActionButton onClick={onNext} type="button">
        Next
      </ActionButton>
    </LearnerProfileCard>
  );
}
