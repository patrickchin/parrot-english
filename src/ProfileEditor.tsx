import { Mic, Volume2 } from "lucide-react";
import type { FormEvent } from "react";
import type { QuestionStatus } from "./OnboardingQuestion";
import type { OnboardingQuestion } from "./onboarding-api";

type ProfileEditorViewProps = {
  drafts: Record<string, string>;
  fieldErrors: Record<string, string>;
  fieldStatuses: Record<string, QuestionStatus>;
  isSaving: boolean;
  onCancel: () => void;
  onClose: () => void;
  onReplay: (question: OnboardingQuestion) => void;
  onSave: () => void;
  onTranscribe: (question: OnboardingQuestion) => void;
  onValueChange: (answerKey: string, value: string) => void;
  pageError: string;
  questions: OnboardingQuestion[];
};

export function ProfileEditorView({
  drafts,
  fieldErrors,
  fieldStatuses,
  isSaving,
  onCancel,
  onClose,
  onReplay,
  onSave,
  onTranscribe,
  onValueChange,
  pageError,
  questions,
}: ProfileEditorViewProps) {
  const isCapturing = Object.values(fieldStatuses).some(
    (status) => status === "recording" || status === "transcribing",
  );
  const formDisabled = isSaving || isCapturing;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave();
  }

  return (
    <main className="onboarding-screen onboarding-profile-screen">
      <section
        aria-labelledby="profile-title"
        className="onboarding-profile-shell"
      >
        <header className="onboarding-profile-heading">
          <div>
            <p>Your answers</p>
            <h1 id="profile-title">Edit profile</h1>
          </div>
          <button
            aria-label="Close profile editor"
            className="onboarding-icon-button"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <p className="profile-editor-intro">
          Review and edit all your answers in one place.
        </p>

        <form className="profile-editor-form" onSubmit={submit}>
          <fieldset disabled={formDisabled}>
            {questions.map((question) => {
              const status = fieldStatuses[question.answerKey] ?? "idle";
              const inputId = `profile-answer-${question.answerKey}`;

              return (
                <section
                  aria-labelledby={`profile-question-${question.answerKey}`}
                  className="profile-question-section"
                  key={question.answerKey}
                >
                  <header className="profile-question-heading">
                    <div>
                      <h2 id={`profile-question-${question.answerKey}`}>
                        {question.promptEn}
                      </h2>
                      {question.promptZh ? <p>{question.promptZh}</p> : null}
                    </div>
                    {question.audio ? (
                      <button
                        aria-label={`Replay ${question.promptEn}`}
                        className="onboarding-icon-button"
                        onClick={() => onReplay(question)}
                        type="button"
                      >
                        <Volume2 aria-hidden="true" />
                      </button>
                    ) : null}
                  </header>
                  <label className="onboarding-answer-field" htmlFor={inputId}>
                    <span>Your answer</span>
                    <span className="onboarding-input-row">
                      <textarea
                        id={inputId}
                        maxLength={question.maxLength}
                        onChange={(event) =>
                          onValueChange(question.answerKey, event.target.value)
                        }
                        rows={3}
                        value={drafts[question.answerKey] ?? ""}
                      />
                      <button
                        aria-label={`Speak answer for ${question.promptEn}`}
                        className="onboarding-input-action onboarding-mic-button"
                        onClick={() => onTranscribe(question)}
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
                  ) : null}
                  {fieldErrors[question.answerKey] ? (
                    <p className="onboarding-field-error" role="alert">
                      {fieldErrors[question.answerKey]}
                    </p>
                  ) : null}
                </section>
              );
            })}
          </fieldset>

          {pageError ? (
            <p className="onboarding-field-error" role="alert">
              {pageError}
            </p>
          ) : null}

          <footer className="profile-editor-actions">
            <button
              className="onboarding-skip-button"
              disabled={isSaving}
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
            <button
              className="onboarding-next-button"
              disabled={formDisabled}
              type="submit"
            >
              {isSaving ? "Saving…" : "Save changes"}
            </button>
          </footer>
        </form>
      </section>
    </main>
  );
}
