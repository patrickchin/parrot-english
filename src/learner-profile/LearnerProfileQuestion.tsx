import { Mic, Volume2 } from "lucide-react";
import type { FormEvent } from "react";
import { playAudioLine } from "../media/audio-playback";
import {
  transcribeLearnerProfileAudio,
  type LearnerProfileAudio,
  type LearnerProfileQuestion,
} from "./learner-profile-api";
import { recordSpeechClip } from "../media/speech-recorder";
import {
  LearnerProfileCard,
  LearnerProfileStepHeading,
} from "./LearnerProfileLayout";
import {
  ActionButton,
  fieldClassName,
  IconButton,
  TextButton,
} from "../shared/ui";

export type QuestionStatus = "idle" | "recording" | "saving" | "transcribing";

type LearnerProfileQuestionViewProps = {
  fieldError: string;
  mode: "learner-profile" | "profile";
  onReplay: () => void;
  onSkip: () => void;
  onSkipQuestion: () => void;
  onSubmit: () => void;
  onTranscribe: () => void;
  onValueChange: (value: string) => void;
  progress: { answered: number; current: number; total: number };
  question: LearnerProfileQuestion;
  status: QuestionStatus;
  value: string;
};

export function LearnerProfileQuestionView({
  fieldError,
  mode,
  onReplay,
  onSkip,
  onSkipQuestion,
  onSubmit,
  onTranscribe,
  onValueChange,
  progress,
  question,
  status,
  value,
}: LearnerProfileQuestionViewProps) {
  const disabled = status !== "idle";
  const inputId = `learner-profile-answer-${question.answerKey}`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <LearnerProfileCard
      className="p-6 short:p-3 short-wide:grid short-wide:grid-cols-[7rem_minmax(0,1fr)] short-wide:grid-rows-[auto_auto_auto] short-wide:gap-x-4 sm:p-10"
      aria-labelledby="learner-profile-question-title"
    >
      <header className="flex items-center justify-between gap-4 max-sm:justify-start max-sm:gap-2 short-wide:col-start-2 short-wide:row-start-1 short-wide:justify-start short-wide:gap-2">
        <p className="m-0 text-xs font-black uppercase tracking-widest text-brand-rose max-sm:tracking-normal">
          Question {progress.current} of {progress.total}
        </p>
        <IconButton
          aria-label="Replay question"
          disabled={disabled || !question.audio}
          onClick={onReplay}
          className="short:size-11"
          type="button"
        >
          <Volume2 aria-hidden="true" className="size-6" />
        </IconButton>
      </header>

      <div className="my-5 grid items-center gap-4 text-center short:my-2 short:gap-2 short-wide:contents sm:grid-cols-4 sm:gap-8 sm:text-left">
        <img
          alt="Peppa, your English host"
          className="mx-auto aspect-square max-h-40 w-24 animate-float object-contain motion-reduce:animate-none short:w-20 short-wide:col-start-1 short-wide:row-span-3 short-wide:row-start-1 short-wide:w-full short-wide:max-w-28 sm:col-span-1 sm:w-full"
          height={1024}
          src="/assets/characters/peppa/peppa-happy.webp"
          width={1024}
        />
        <div className="short-wide:col-start-2 short-wide:row-start-2 sm:col-span-3">
          <LearnerProfileStepHeading
            className="m-0 text-3xl leading-tight text-brand-ink short:before:-left-2 short-wide:before:-left-3 short:text-3xl sm:text-4xl"
            id="learner-profile-question-title"
            stepKey={question.answerKey}
          >
            {question.promptEn}
          </LearnerProfileStepHeading>
          {question.promptZh ? (
            <p className="mb-0 mt-2.5 font-bold text-slate-500">
              {question.promptZh}
            </p>
          ) : null}
        </div>
      </div>

      <form
        className="short-wide:col-start-2 short-wide:row-start-3"
        onSubmit={submit}
      >
        <fieldset
          className="m-0 grid min-w-0 gap-4 border-0 p-0 disabled:opacity-75 short:gap-2"
          disabled={disabled}
        >
          <div className="grid gap-2 font-black text-brand-ink short:gap-1">
            <label htmlFor={inputId}>Your answer</label>
            <span className="flex items-stretch gap-2">
              <textarea
                className={fieldClassName({
                  className:
                    "min-h-28 min-w-0 flex-1 resize-y leading-relaxed short:h-20 short:min-h-20",
                })}
                id={inputId}
                maxLength={question.maxLength}
                onChange={(event) => onValueChange(event.target.value)}
                rows={4}
                value={value}
              />
              <IconButton
                aria-label="Speak your answer"
                className="shrink-0"
                frame="none"
                onClick={onTranscribe}
                shape="rounded"
                size="field"
                type="button"
                variant="brand"
              >
                <Mic aria-hidden="true" className="size-6" />
              </IconButton>
            </span>
          </div>

          {status === "recording" ? (
            <p className="m-0 rounded-2xl bg-sky-100 px-3 py-2.5 font-extrabold text-brand-navy" role="status">
              Listening…
            </p>
          ) : status === "transcribing" ? (
            <p className="m-0 rounded-2xl bg-sky-100 px-3 py-2.5 font-extrabold text-brand-navy" role="status">
              Writing what I heard…
            </p>
          ) : status === "saving" ? (
            <p className="m-0 rounded-2xl bg-sky-100 px-3 py-2.5 font-extrabold text-brand-navy" role="status">
              Peppa is thinking…
            </p>
          ) : null}
          {fieldError ? (
            <p className="m-0 rounded-2xl bg-rose-100 px-3 py-2.5 font-extrabold text-rose-900" role="alert">
              {fieldError}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center justify-end gap-4 short:mt-0 short:gap-2 max-sm:justify-between">
            {mode === "learner-profile" && !question.required ? (
              <TextButton
                onClick={onSkipQuestion}
                type="button"
              >
                Skip question
              </TextButton>
            ) : null}
            {mode === "learner-profile" ? (
              <TextButton onClick={onSkip} type="button">
                Skip for now
              </TextButton>
            ) : null}
            <ActionButton
              className="short:min-h-11 short:min-w-20 short:px-3"
              type="submit"
            >
              {status === "saving"
                ? "Peppa is thinking…"
                : mode === "profile"
                  ? "Save"
                  : "Next"}
            </ActionButton>
          </div>
        </fieldset>
      </form>
    </LearnerProfileCard>
  );
}

type PlayLine = typeof playAudioLine;

function playbackLine(audio: LearnerProfileAudio) {
  return { audioId: audio.id, audioSrc: audio.src, text: audio.text };
}

export async function playLearnerProfileStart({
  playLine = playAudioLine,
  questionAudio,
}: {
  playLine?: PlayLine;
  questionAudio: LearnerProfileAudio;
}) {
  await playLine(playbackLine(questionAudio));
}

export async function replayLearnerProfileQuestion(
  audio: LearnerProfileAudio,
  {
    playLine = playAudioLine,
    signal,
  }: { playLine?: PlayLine; signal?: AbortSignal } = {},
) {
  await playLine({
    ...playbackLine(audio),
    ...(signal ? { signal } : {}),
  });
}

export async function captureLearnerProfileAnswer({
  record = recordSpeechClip,
  signal,
  transcribe = transcribeLearnerProfileAudio,
}: {
  record?: (options?: { signal?: AbortSignal }) => Promise<Blob>;
  signal?: AbortSignal;
  transcribe?: (
    audio: Blob,
    options?: { signal?: AbortSignal },
  ) => Promise<{ transcript: string }>;
}) {
  const options = { signal };
  const audio = await record(options);
  const result = await transcribe(audio, options);
  return result.transcript;
}
