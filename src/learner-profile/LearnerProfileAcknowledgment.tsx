import { useEffect } from "react";
import type {
  LearnerProfileAcknowledgment as Acknowledgment,
  LearnerProfileAudio,
} from "./learner-profile-api";
import { playAudioLine } from "../media/audio-playback";
import {
  LearnerProfileCard,
  LearnerProfilePeppaArt,
  LearnerProfileStepHeading,
} from "./LearnerProfileLayout";
import { ActionButton, cx } from "../shared/ui";

type PlayLine = typeof playAudioLine;

function isSavedAcknowledgmentAudio(
  audio: Acknowledgment["audio"],
  expectedText: string,
): audio is LearnerProfileAudio {
  return (
    audio != null &&
    typeof audio === "object" &&
    typeof audio.id === "string" &&
    /^[a-z0-9-]+$/.test(audio.id) &&
    typeof audio.src === "string" &&
    audio.src === `/assets/audio/${audio.id}.mp3` &&
    audio.text === expectedText
  );
}

export function beginAcknowledgmentPlayback({
  acknowledgment,
  createAbortController = () => new AbortController(),
  playLine = playAudioLine,
}: {
  acknowledgment: Acknowledgment;
  createAbortController?: () => AbortController;
  playLine?: PlayLine;
}) {
  const audioData = acknowledgment.audio;
  if (!isSavedAcknowledgmentAudio(audioData, acknowledgment.text)) {
    return () => {};
  }

  const controller = createAbortController();
  try {
    void playLine({
      audioId: audioData.id,
      audioSrc: audioData.src,
      signal: controller.signal,
      text: audioData.text,
    }).catch(() => {
      // Audio is optional feedback. The visible Next action owns navigation.
    });
  } catch {
    // Audio is optional feedback. The visible Next action owns navigation.
  }

  return () => controller.abort();
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
  const hasLongAcknowledgment = acknowledgment.text.length > 120;

  useEffect(
    () =>
      beginAcknowledgmentPlayback({
        acknowledgment,
      }),
    [acknowledgment, operationId],
  );

  return (
    <LearnerProfileCard
      aria-live="polite"
      className="grid justify-items-center gap-5 p-8 text-center short:gap-2 short:p-4 short-wide:grid-cols-[minmax(8rem,0.75fr)_minmax(0,1.25fr)] short-wide:grid-rows-[auto_auto] short-wide:items-center short-wide:gap-x-6 short-wide:px-6 short-wide:py-4 short-wide:text-left sm:p-14"
    >
      <LearnerProfilePeppaArt
        alt="Peppa smiling"
        className="aspect-square max-h-60 w-40 animate-float object-contain drop-shadow-lg motion-reduce:animate-none short:w-20 short-wide:col-start-1 short-wide:row-span-2 short-wide:row-start-1 short-wide:w-full short-wide:max-w-40 sm:w-56"
        sizes="(min-width: 640px) 14rem, 10rem"
      />
      <LearnerProfileStepHeading
        className={cx(
          "m-0 max-w-xl break-words text-3xl leading-tight text-brand-ink short-wide:col-start-2 short-wide:row-start-1 short-wide:justify-self-start short:text-2xl",
          hasLongAcknowledgment ? "sm:text-4xl" : "sm:text-5xl",
        )}
        stepKey={operationId}
      >
        {acknowledgment.text}
      </LearnerProfileStepHeading>
      <ActionButton
        className="short-wide:col-start-2 short-wide:row-start-2 short-wide:justify-self-start"
        onClick={onNext}
        type="button"
      >
        Next
      </ActionButton>
    </LearnerProfileCard>
  );
}
