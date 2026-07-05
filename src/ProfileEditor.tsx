import { Volume2 } from "lucide-react";
import type { FormEvent } from "react";
import { AnswerEditor, type QuestionStatus } from "./OnboardingQuestion";
import type { OnboardingQuestion } from "./onboarding-api";

type ProfileEditorViewProps = {
  drafts: Record<string, unknown>;
  fieldErrors: Record<string, string>;
  fieldStatuses: Record<string, QuestionStatus>;
  isSaving: boolean;
  onAddPending: (answerKey: string) => void;
  onCancel: () => void;
  onClose: () => void;
  onPendingChange: (answerKey: string, value: string) => void;
  onRemoveValue: (answerKey: string, value: string) => void;
  onReplay: (question: OnboardingQuestion) => void;
  onSave: () => void;
  onToggleOption: (answerKey: string, value: string) => void;
  onTranscribe: (question: OnboardingQuestion) => void;
  onValueChange: (answerKey: string, value: string | number) => void;
  pageError: string;
  pendingValues: Record<string, string>;
  questions: OnboardingQuestion[];
};

export function ProfileEditorView({
  drafts,
  fieldErrors,
  fieldStatuses,
  isSaving,
  onAddPending,
  onCancel,
  onClose,
  onPendingChange,
  onRemoveValue,
  onReplay,
  onSave,
  onToggleOption,
  onTranscribe,
  onValueChange,
  pageError,
  pendingValues,
  questions,
}: ProfileEditorViewProps) {
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
          <fieldset disabled={isSaving}>
            {questions.map((question) => {
              const status = fieldStatuses[question.answerKey] ?? "idle";
              const disabled = isSaving || status !== "idle";

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
                        disabled={disabled}
                        onClick={() => onReplay(question)}
                        type="button"
                      >
                        <Volume2 aria-hidden="true" />
                      </button>
                    ) : null}
                  </header>
                  <AnswerEditor
                    disabled={disabled}
                    fieldError={fieldErrors[question.answerKey] ?? ""}
                    inputId={`profile-answer-${question.answerKey}`}
                    onAddPending={() => onAddPending(question.answerKey)}
                    onPendingChange={(value) =>
                      onPendingChange(question.answerKey, value)
                    }
                    onRemoveValue={(value) =>
                      onRemoveValue(question.answerKey, value)
                    }
                    onToggleOption={(value) =>
                      onToggleOption(question.answerKey, value)
                    }
                    onTranscribe={() => onTranscribe(question)}
                    onValueChange={(value) =>
                      onValueChange(question.answerKey, value)
                    }
                    pendingValue={pendingValues[question.answerKey] ?? ""}
                    question={question}
                    status={status}
                    value={drafts[question.answerKey]}
                  />
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
              disabled={isSaving}
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
