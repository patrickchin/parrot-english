import { Mic, Volume2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, type FormEvent } from "react";
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
  cx,
  fieldClassName,
  IconButton,
  TextButton,
} from "../shared/ui";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export type QuestionPendingAction =
  "microphone" | "skip" | "skip-question" | "submit" | null;

export type QuestionStatus =
  "idle" | "opening" | "ready" | "recording" | "saving" | "transcribing";

type LearnerProfileQuestionViewProps = {
  fieldError: string;
  mode: "learner-profile" | "profile";
  onReplay: () => void;
  onSkip: () => void;
  onSkipQuestion: () => void;
  onSubmit: () => void;
  onTranscribe: () => void;
  onValueChange: (value: string) => void;
  pendingAction: QuestionPendingAction;
  playbackPending: boolean;
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
  pendingAction,
  playbackPending,
  progress,
  question,
  status,
  value,
}: LearnerProfileQuestionViewProps) {
  const pending = status !== "idle" && status !== "ready";
  const pendingMessage =
    status === "opening"
      ? "Opening mic…"
      : status === "recording"
        ? "Listening…"
        : status === "transcribing"
          ? "Writing…"
          : status === "saving"
            ? "Thinking…"
            : status === "ready"
              ? "Ready."
              : "";
  const inputId = `learner-profile-answer-${question.answerKey}`;
  const formRef = useRef<HTMLFormElement>(null);
  const microphoneOwnsPending = pending && pendingAction === "microphone";
  const skipOwnsPending = pending && pendingAction === "skip";
  const skipQuestionOwnsPending = pending && pendingAction === "skip-question";
  const submitOwnsPending = pending && pendingAction === "submit";

  useIsomorphicLayoutEffect(() => {
    if (!fieldError) return;
    const active = document.activeElement;
    if (
      !(active instanceof HTMLElement) ||
      !formRef.current?.contains(active)
    ) {
      return;
    }
    active.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [fieldError]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    onSubmit();
  }

  return (
    <LearnerProfileCard
      className="p-6 max-[360px]:p-3 short:p-3 short-wide:grid short-wide:grid-cols-[7rem_minmax(0,1fr)] short-wide:grid-rows-[auto_auto_auto] short-wide:gap-x-4 sm:p-10"
      aria-labelledby="learner-profile-question-title"
    >
      <header className="flex items-center justify-between gap-4 max-sm:justify-start max-sm:gap-2 short-wide:col-start-2 short-wide:row-start-1 short-wide:justify-start short-wide:gap-2">
        <p className="m-0 text-xs font-black uppercase tracking-widest text-brand-rose max-sm:tracking-normal">
          Question {progress.current} of {progress.total}
        </p>
        <IconButton
          aria-label="Replay question"
          aria-disabled={playbackPending || undefined}
          disabled={pending || !question.audio}
          onClick={playbackPending ? undefined : onReplay}
          className={cx(
            "scroll-m-2 short:size-11",
            playbackPending && "aria-disabled:opacity-100",
          )}
          type="button"
        >
          <Volume2 aria-hidden="true" className="size-6" />
        </IconButton>
      </header>

      <div className="my-5 grid items-center gap-4 text-center max-[360px]:my-2 max-[360px]:gap-2 short:my-2 short:gap-2 short-wide:contents sm:grid-cols-4 sm:gap-8 sm:text-left">
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
        ref={formRef}
      >
        <fieldset className="m-0 grid min-w-0 gap-4 border-0 p-0 short:gap-2">
          <div className="grid gap-2 font-black text-brand-ink short:gap-1">
            <div className="flex min-h-6 items-center justify-between gap-2">
              <label className="shrink-0" htmlFor={inputId}>
                Your answer
              </label>
              <p
                aria-atomic="true"
                className={cx(
                  "m-0 min-h-6 whitespace-nowrap text-sm font-extrabold leading-6 text-brand-navy",
                  pendingMessage && "rounded-full bg-sky-100 px-2",
                )}
                role="status"
              >
                {pendingMessage}
              </p>
            </div>
            <span className="flex items-stretch gap-2">
              <textarea
                className={fieldClassName({
                  className:
                    "min-h-28 min-w-0 flex-1 scroll-m-2 resize-y leading-relaxed short:h-20 short:min-h-20",
                })}
                id={inputId}
                disabled={pending}
                maxLength={question.maxLength}
                onChange={(event) => onValueChange(event.target.value)}
                rows={4}
                value={value}
              />
              <IconButton
                aria-label="Speak your answer"
                aria-disabled={microphoneOwnsPending || undefined}
                className={cx(
                  "shrink-0 scroll-m-2",
                  microphoneOwnsPending && "aria-disabled:opacity-100",
                )}
                disabled={pending && !microphoneOwnsPending}
                frame="none"
                onClick={pending ? undefined : onTranscribe}
                shape="rounded"
                size="field"
                type="button"
                variant="brand"
              >
                <Mic aria-hidden="true" className="size-6" />
              </IconButton>
            </span>
          </div>

          {fieldError ? (
            <p
              className="m-0 rounded-2xl bg-rose-100 px-3 py-2.5 font-extrabold text-rose-900"
              role="alert"
            >
              {fieldError}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center justify-end gap-4 max-[360px]:mt-0 max-[360px]:gap-2 short:mt-0 short:gap-2 max-sm:justify-between">
            {mode === "learner-profile" && !question.required ? (
              <TextButton
                aria-disabled={skipQuestionOwnsPending || undefined}
                className={cx(
                  "scroll-m-2",
                  skipQuestionOwnsPending && "aria-disabled:opacity-100",
                )}
                disabled={pending && !skipQuestionOwnsPending}
                onClick={pending ? undefined : onSkipQuestion}
                type="button"
              >
                Skip question
              </TextButton>
            ) : null}
            {mode === "learner-profile" ? (
              <TextButton
                aria-disabled={skipOwnsPending || undefined}
                className={cx(
                  "scroll-m-2",
                  skipOwnsPending && "aria-disabled:opacity-100",
                )}
                disabled={pending && !skipOwnsPending}
                onClick={pending ? undefined : onSkip}
                type="button"
              >
                Skip for now
              </TextButton>
            ) : null}
            <ActionButton
              aria-disabled={submitOwnsPending || undefined}
              className={cx(
                "scroll-m-2 short:min-h-11 short:min-w-20 short:px-3",
                submitOwnsPending && "aria-disabled:opacity-100",
              )}
              disabled={pending && !submitOwnsPending}
              type="submit"
            >
              {mode === "profile" ? "Save" : "Next"}
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
  signal,
}: {
  playLine?: PlayLine;
  questionAudio: LearnerProfileAudio;
  signal?: AbortSignal;
}) {
  await playLine({
    ...playbackLine(questionAudio),
    ...(signal ? { signal } : {}),
  });
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
