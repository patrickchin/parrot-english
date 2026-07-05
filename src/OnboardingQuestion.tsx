import { Mic, Volume2 } from "lucide-react";
import type { FormEvent } from "react";
import { playAudioLine } from "./audio-playback";
import {
  transcribeOnboardingAudio,
  type OnboardingAudio,
  type OnboardingQuestion,
} from "./onboarding-api";
import { recordSpeechClip } from "./speech-recorder";

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
    <section
      className="onboarding-question-card"
      aria-labelledby="onboarding-question-title"
    >
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
          <label className="onboarding-answer-field" htmlFor={inputId}>
            <span>Your answer</span>
            <span className="onboarding-input-row">
              <textarea
                id={inputId}
                maxLength={question.maxLength}
                onChange={(event) => onValueChange(event.target.value)}
                rows={4}
                value={value}
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

          {status === "recording" ? (
            <p className="onboarding-input-status" role="status">
              Listening…
            </p>
          ) : status === "transcribing" ? (
            <p className="onboarding-input-status" role="status">
              Writing what I heard…
            </p>
          ) : status === "saving" ? (
            <p className="onboarding-input-status" role="status">
              Peppa is thinking…
            </p>
          ) : null}
          {fieldError ? (
            <p className="onboarding-field-error" role="alert">
              {fieldError}
            </p>
          ) : null}

          <div className="onboarding-form-actions">
            {mode === "onboarding" && !question.required ? (
              <button
                className="onboarding-skip-button"
                onClick={onSkipQuestion}
                type="button"
              >
                Skip question
              </button>
            ) : null}
            {mode === "onboarding" ? (
              <button
                className="onboarding-skip-button"
                onClick={onSkip}
                type="button"
              >
                Skip for now
              </button>
            ) : null}
            <button className="onboarding-next-button" type="submit">
              {status === "saving"
                ? "Peppa is thinking…"
                : mode === "profile"
                  ? "Save"
                  : "Next"}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
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
}) {
  const audio = await record();
  const result = await transcribe(audio);
  return result.transcript;
}
