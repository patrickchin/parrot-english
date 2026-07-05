import { Mic, Plus, Volume2, X } from "lucide-react";
import type { FormEvent } from "react";
import { playAudioLine, playAudioSequence } from "./audio-playback";
import {
  transcribeOnboardingAudio,
  type OnboardingAudio,
  type OnboardingQuestion,
} from "./onboarding-api";
import { recordSpeechClip } from "./speech-recorder";

type QuestionStatus = "idle" | "recording" | "saving" | "transcribing";

type OnboardingQuestionViewProps = {
  fieldError: string;
  mode: "onboarding" | "profile";
  onAddPending: () => void;
  onPendingChange: (value: string) => void;
  onRemoveValue: (value: string) => void;
  onReplay: () => void;
  onSkip: () => void;
  onSubmit: () => void;
  onToggleOption: (value: string) => void;
  onTranscribe: () => void;
  onValueChange?: (value: string | number) => void;
  pendingValue: string;
  progress: { answered: number; current: number; total: number };
  question: OnboardingQuestion;
  status: QuestionStatus;
  value: unknown;
};

function scalarValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? value : "";
}

function arrayValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

export function OnboardingQuestionView({
  fieldError,
  mode,
  onAddPending,
  onPendingChange,
  onRemoveValue,
  onReplay,
  onSkip,
  onSubmit,
  onToggleOption,
  onTranscribe,
  onValueChange = () => {},
  pendingValue,
  progress,
  question,
  status,
  value,
}: OnboardingQuestionViewProps) {
  const disabled = status !== "idle";
  const values = arrayValue(value);
  const isArray = question.cardinality === "array";
  const inputId = `onboarding-answer-${question.answerKey}`;
  const maxLength = question.validation.maxLength;
  const min = question.validation.min;
  const max = question.validation.max;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <section className="onboarding-question-card" aria-labelledby="onboarding-question-title">
      <header className="onboarding-question-heading">
        <p className="onboarding-progress">
          Question {progress.current} of {progress.total}
        </p>
        <button
          aria-label="Replay question"
          className="onboarding-icon-button"
          disabled={disabled || !question.audio}
          onClick={onReplay}
          type="button"
        >
          <Volume2 aria-hidden="true" />
        </button>
      </header>

      <div className="onboarding-character-row">
        <img
          alt="Peppa, your English host"
          className="onboarding-peppa"
          src="/assets/characters/peppa/peppa-happy.webp"
        />
        <div>
          <h1 className="onboarding-question-title" id="onboarding-question-title">
            {question.promptEn}
          </h1>
          {question.promptZh ? (
            <p className="onboarding-question-translation">{question.promptZh}</p>
          ) : null}
        </div>
      </div>

      <form className="onboarding-answer-form" onSubmit={submit}>
        <fieldset disabled={disabled}>
          {isArray ? (
            <div className="onboarding-array-answer">
              {values.length > 0 ? (
                <div aria-label="Confirmed answers" className="onboarding-chips">
                  {values.map((entry) => (
                    <span className="onboarding-chip" key={entry}>
                      {entry}
                      <button
                        aria-label={`Remove ${entry}`}
                        onClick={() => onRemoveValue(entry)}
                        type="button"
                      >
                        <X aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <label className="onboarding-answer-field" htmlFor={inputId}>
                <span>Add one answer</span>
                <span className="onboarding-input-row">
                  <input
                    id={inputId}
                    maxLength={maxLength}
                    onChange={(event) => onPendingChange(event.target.value)}
                    type="text"
                    value={pendingValue}
                  />
                  <button
                    aria-label="Add answer"
                    className="onboarding-input-action"
                    onClick={onAddPending}
                    type="button"
                  >
                    <Plus aria-hidden="true" />
                  </button>
                  <button
                    aria-label="Speak your answer"
                    className="onboarding-input-action onboarding-mic-button"
                    onClick={onTranscribe}
                    type="button"
                  >
                    <Mic aria-hidden="true" />
                  </button>
                </span>
              </label>
            </div>
          ) : (
            <label className="onboarding-answer-field" htmlFor={inputId}>
              <span>Your answer</span>
              <span className="onboarding-input-row">
                <input
                  id={inputId}
                  max={question.answerType === "number" ? max : undefined}
                  maxLength={question.answerType === "number" ? undefined : maxLength}
                  min={question.answerType === "number" ? min : undefined}
                  onChange={(event) =>
                    onValueChange(
                      question.answerType === "number" && event.target.value !== ""
                        ? Number(event.target.value)
                        : event.target.value,
                    )
                  }
                  type={question.answerType === "number" ? "number" : "text"}
                  value={scalarValue(value)}
                />
                <button
                  aria-label="Speak your answer"
                  className="onboarding-input-action onboarding-mic-button"
                  onClick={onTranscribe}
                  type="button"
                >
                  <Mic aria-hidden="true" />
                </button>
              </span>
            </label>
          )}

          {question.options?.length ? (
            <div aria-label="Answer suggestions" className="onboarding-suggestions">
              {question.options.map((option) => {
                const selected = isArray
                  ? values.some(
                      (entry) => entry.toLocaleLowerCase("en") === option.toLocaleLowerCase("en"),
                    )
                  : scalarValue(value).toString().toLocaleLowerCase("en") ===
                    option.toLocaleLowerCase("en");
                return (
                  <button
                    aria-pressed={selected}
                    className={selected ? "is-selected" : ""}
                    key={option}
                    onClick={() =>
                      isArray ? onToggleOption(option) : onValueChange(option)
                    }
                    type="button"
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          ) : null}

          {status === "recording" ? (
            <p className="onboarding-input-status" role="status">Listening…</p>
          ) : status === "transcribing" ? (
            <p className="onboarding-input-status" role="status">
              Writing what I heard…
            </p>
          ) : null}
          {fieldError ? (
            <p className="onboarding-field-error" role="alert">
              {fieldError}
            </p>
          ) : null}

          <div className="onboarding-form-actions">
            {mode === "onboarding" ? (
              <button className="onboarding-skip-button" onClick={onSkip} type="button">
                Skip for now
              </button>
            ) : null}
            <button className="onboarding-next-button" type="submit">
              {status === "saving" ? "Saving…" : mode === "profile" ? "Save" : "Next"}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}

type PlaySequence = typeof playAudioSequence;
type PlayLine = typeof playAudioLine;

function playbackLine(audio: OnboardingAudio) {
  return { audioId: audio.id, audioSrc: audio.src, text: audio.text };
}

export async function playOnboardingStart({
  introduction,
  playSequence = playAudioSequence,
  questionAudio,
}: {
  introduction: OnboardingAudio;
  playSequence?: PlaySequence;
  questionAudio: OnboardingAudio;
}) {
  await playSequence({
    lines: [
      { ...playbackLine(introduction), pauseAfterMs: 250 },
      playbackLine(questionAudio),
    ],
  });
}

export async function replayOnboardingQuestion(
  audio: OnboardingAudio,
  { playLine = playAudioLine }: { playLine?: PlayLine } = {},
) {
  await playLine(playbackLine(audio));
}

export async function captureOnboardingAnswer({
  record = recordSpeechClip,
  transcribe = transcribeOnboardingAudio,
}: {
  record?: () => Promise<Blob>;
  transcribe?: (audio: Blob) => Promise<{ transcript: string }>;
  save?: () => void;
}) {
  const audio = await record();
  const result = await transcribe(audio);
  return result.transcript;
}
