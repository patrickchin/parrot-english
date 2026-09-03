import { Mic, Volume2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, type FormEvent } from "react";
import { playAudioLine } from "../media/audio-playback";
import { useGuardianLanguage } from "../i18n/guardian-language";
import { englishGuardianMessages } from "../i18n/messages/en";
import {
  transcribeLearnerProfileAudio,
  type LearnerProfileAudio,
  type LearnerProfileFieldErrorCode,
  type LearnerProfileQuestion,
} from "./learner-profile-api";
import { recordSpeechClip } from "../media/speech-recorder";
import {
  LearnerProfileCard,
  LearnerProfilePeppaArt,
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
type LearnerProfileAudience = "guardian" | "learner";

export type QuestionPendingAction =
  "microphone" | "skip" | "skip-question" | "submit" | null;

export type QuestionStatus =
  "idle" | "opening" | "ready" | "recording" | "saving" | "transcribing";

export type LearnerProfileQuestionOperationErrorCode =
  | "sound-start-failed"
  | "sound-replay-failed"
  | "voice-failed"
  | "try-again"
  | "skip-failed"
  | "question-skip-failed";

export type LearnerProfileQuestionErrorCode =
  | LearnerProfileFieldErrorCode
  | LearnerProfileQuestionOperationErrorCode;

const QUESTION_OPERATION_ERROR_CODES = new Set<string>([
  "sound-start-failed",
  "sound-replay-failed",
  "voice-failed",
  "try-again",
  "skip-failed",
  "question-skip-failed",
]);

type LearnerProfileQuestionViewProps = {
  audience: LearnerProfileAudience;
  fieldError: LearnerProfileQuestionErrorCode | "";
  fieldErrorIsAnswer?: boolean;
  mode: "learner-profile" | "profile";
  onBack?: () => void;
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
  audience,
  fieldError,
  fieldErrorIsAnswer = false,
  mode,
  onBack,
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
  const { messages: selectedMessages } = useGuardianLanguage();
  const messages =
    audience === "guardian" ? selectedMessages : englishGuardianMessages;
  const pending = status !== "idle" && status !== "ready";
  const pendingMessage =
    status === "idle" ? "" : messages.learners.question.statuses[status];
  const fieldErrorMessage = fieldError
    ? fieldErrorIsAnswer
      ? messages.learners.profile.fieldErrors[
          fieldError as LearnerProfileFieldErrorCode
        ]
      : QUESTION_OPERATION_ERROR_CODES.has(fieldError)
        ? messages.learners.question.operationErrors[
            fieldError as LearnerProfileQuestionOperationErrorCode
          ]
        : messages.learners.question.operationFailed
    : "";
  const inputId = `learner-profile-answer-${question.answerKey}`;
  const fieldErrorId = `${inputId}-error`;
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const microphoneOwnsPending = pending && pendingAction === "microphone";
  const skipOwnsPending = pending && pendingAction === "skip";
  const skipQuestionOwnsPending = pending && pendingAction === "skip-question";
  const submitOwnsPending = pending && pendingAction === "submit";

  useIsomorphicLayoutEffect(() => {
    if (!fieldError) return;
    if (fieldErrorIsAnswer) {
      inputRef.current?.focus();
      inputRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }
    const active = document.activeElement;
    if (
      !(active instanceof HTMLElement) ||
      !formRef.current?.contains(active)
    ) {
      return;
    }
    active.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [fieldError, fieldErrorIsAnswer]);

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
          {messages.learners.question.progress(
            progress.current,
            progress.total,
          )}
        </p>
        <IconButton
          aria-label={messages.learners.question.replay}
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
        <LearnerProfilePeppaArt
          alt={messages.learners.question.peppaAlt}
          className="mx-auto aspect-square max-h-40 w-24 animate-float object-contain motion-reduce:animate-none short:w-20 short-wide:col-start-1 short-wide:row-span-3 short-wide:row-start-1 short-wide:w-full short-wide:max-w-28 sm:col-span-1 sm:w-full"
          sizes="(min-width: 640px) 10rem, 7rem"
        />
        <div className="short-wide:col-start-2 short-wide:row-start-2 sm:col-span-3">
          <LearnerProfileStepHeading
            className="m-0 text-3xl leading-tight text-brand-ink short:text-3xl sm:text-4xl"
            id="learner-profile-question-title"
            lang="en"
            stepKey={question.answerKey}
          >
            {question.promptEn}
          </LearnerProfileStepHeading>
          {question.promptZh ? (
            <p className="mb-0 mt-2.5 font-bold text-slate-500" lang="zh-Hans">
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
                {messages.learners.question.answer}
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
                aria-describedby={fieldErrorIsAnswer ? fieldErrorId : undefined}
                aria-invalid={fieldErrorIsAnswer || undefined}
                className={fieldClassName({
                  className:
                    "min-h-28 min-w-0 flex-1 scroll-m-2 resize-y leading-relaxed short:h-20 short:min-h-20",
                })}
                id={inputId}
                lang="en"
                disabled={pending}
                maxLength={question.maxLength}
                onChange={(event) => onValueChange(event.target.value)}
                rows={4}
                ref={inputRef}
                value={value}
              />
              <IconButton
                aria-label={messages.learners.question.speak}
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
                variant="rose"
              >
                <Mic aria-hidden="true" className="size-6" />
              </IconButton>
            </span>
          </div>

          {fieldError ? (
            <p
              className="m-0 rounded-2xl bg-rose-100 px-3 py-2.5 font-extrabold text-rose-900"
              id={fieldErrorIsAnswer ? fieldErrorId : undefined}
              role="alert"
            >
              {fieldErrorMessage}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center justify-end gap-4 max-[360px]:mt-0 max-[360px]:gap-2 short:mt-0 short:gap-2 max-sm:justify-between">
            {mode === "profile" && onBack ? (
              <TextButton onClick={onBack} type="button">
                {messages.learners.question.back}
              </TextButton>
            ) : null}
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
                {messages.learners.question.skipQuestion}
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
                {messages.learners.question.skip}
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
              {mode === "profile"
                ? messages.learners.question.save
                : messages.learners.question.next}
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
