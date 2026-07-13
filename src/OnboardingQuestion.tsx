import { Mic, Volume2 } from "lucide-react";
import type { FormEvent } from "react";
import { playAudioLine } from "./audio-playback";
import {
  transcribeOnboardingAudio,
  type OnboardingAudio,
  type OnboardingQuestion,
} from "./onboarding-api";
import { recordSpeechClip } from "./speech-recorder";
import { OnboardingCard } from "./OnboardingLayout";
import {
  ActionButton,
  fieldClassName,
  IconButton,
  TextButton,
} from "./ui";

export type QuestionStatus = "idle" | "recording" | "saving" | "transcribing";

type OnboardingQuestionViewProps = {
  fieldError: string;
  mode: "onboarding" | "profile";
  onReplay: () => void;
  onSkip: () => void;
  onSkipQuestion: () => void;
  onSubmit: () => void;
  onTranscribe: () => void;
  onValueChange: (value: string) => void;
  progress: { answered: number; current: number; total: number };
  question: OnboardingQuestion;
  status: QuestionStatus;
  value: string;
};

export function OnboardingQuestionView({
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
}: OnboardingQuestionViewProps) {
  const disabled = status !== "idle";
  const inputId = `onboarding-answer-${question.answerKey}`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <OnboardingCard
      className="p-6 sm:p-10"
      aria-labelledby="onboarding-question-title"
    >
      <header className="flex items-center justify-between gap-4">
        <p className="m-0 text-xs font-black uppercase tracking-widest text-brand-rose">
          Question {progress.current} of {progress.total}
        </p>
        <IconButton
          aria-label="Replay question"
          disabled={disabled || !question.audio}
          onClick={onReplay}
          type="button"
        >
          <Volume2 aria-hidden="true" className="size-6" />
        </IconButton>
      </header>

      <div className="my-5 grid items-center gap-4 text-center sm:grid-cols-4 sm:gap-8 sm:text-left">
        <img
          alt="Peppa, your English host"
          className="mx-auto max-h-40 w-24 animate-float object-contain motion-reduce:animate-none sm:col-span-1 sm:w-full"
          src="/assets/characters/peppa/peppa-happy.webp"
        />
        <div className="sm:col-span-3">
          <h1
            className="m-0 text-3xl leading-tight text-brand-ink sm:text-4xl"
            id="onboarding-question-title"
          >
            {question.promptEn}
          </h1>
          {question.promptZh ? (
            <p className="mb-0 mt-2.5 font-bold text-slate-500">
              {question.promptZh}
            </p>
          ) : null}
        </div>
      </div>

      <form onSubmit={submit}>
        <fieldset
          className="m-0 grid min-w-0 gap-4 border-0 p-0 disabled:opacity-75"
          disabled={disabled}
        >
          <label
            className="grid gap-2 font-black text-brand-ink"
            htmlFor={inputId}
          >
            <span>Your answer</span>
            <span className="flex items-stretch gap-2">
              <textarea
                className={fieldClassName(
                  "min-h-28 min-w-0 flex-1 resize-y px-4 py-3 font-extrabold leading-relaxed text-brand-ink",
                )}
                id={inputId}
                maxLength={question.maxLength}
                onChange={(event) => onValueChange(event.target.value)}
                rows={4}
                value={value}
              />
              <button
                aria-label="Speak your answer"
                className="grid w-13 shrink-0 cursor-pointer place-items-center rounded-2xl border-0 bg-brand-pink text-white focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand-ink"
                onClick={onTranscribe}
                type="button"
              >
                <Mic aria-hidden="true" className="size-6" />
              </button>
            </span>
          </label>

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

          <div className="mt-2 flex flex-wrap items-center justify-end gap-4 max-sm:justify-between">
            {mode === "onboarding" && !question.required ? (
              <TextButton
                onClick={onSkipQuestion}
                type="button"
              >
                Skip question
              </TextButton>
            ) : null}
            {mode === "onboarding" ? (
              <TextButton onClick={onSkip} type="button">
                Skip for now
              </TextButton>
            ) : null}
            <ActionButton type="submit">
              {status === "saving"
                ? "Peppa is thinking…"
                : mode === "profile"
                  ? "Save"
                  : "Next"}
            </ActionButton>
          </div>
        </fieldset>
      </form>
    </OnboardingCard>
  );
}

type PlayLine = typeof playAudioLine;

function playbackLine(audio: OnboardingAudio) {
  return { audioId: audio.id, audioSrc: audio.src, text: audio.text };
}

export async function playOnboardingStart({
  playLine = playAudioLine,
  questionAudio,
}: {
  playLine?: PlayLine;
  questionAudio: OnboardingAudio;
}) {
  await playLine(playbackLine(questionAudio));
}

export async function replayOnboardingQuestion(
  audio: OnboardingAudio,
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

export async function captureOnboardingAnswer({
  record = recordSpeechClip,
  signal,
  transcribe = transcribeOnboardingAudio,
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
