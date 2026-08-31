import { ArrowLeft } from "lucide-react";
import type { FormEvent } from "react";
import {
  BidiLearnerName,
  GuardianLearnerContextLabel,
  HeaderButton,
  RouteHeader,
} from "../app/AppHeader";
import {
  LearnerProfileCard,
  LearnerProfilePeppaArt,
  LearnerProfileScreen,
} from "./LearnerProfileLayout";
import { ActionButton, fieldClassName, TextButton } from "../shared/ui";
import type { LearnerProfileQuestion } from "./learner-profile-api";

type ProfileEditorViewProps = {
  drafts: Record<string, string>;
  fieldErrors: Record<string, string>;
  isSaving: boolean;
  learnerName: string;
  lessonRecordingCleanupPending: boolean;
  lessonRecordingConsent: boolean;
  onCancel: () => void;
  onClose: () => void;
  onLessonRecordingConsentChange: (enabled: boolean) => void;
  onRedoLearnerProfile: () => void;
  onSave: () => void;
  onValueChange: (answerKey: string, value: string) => void;
  pageError: string;
  questions?: LearnerProfileQuestion[];
  showRedoLearnerProfile?: boolean;
};

export function ProfileEditorView({
  drafts,
  fieldErrors,
  isSaving,
  learnerName,
  lessonRecordingCleanupPending,
  onCancel,
  onClose,
  onLessonRecordingConsentChange,
  onRedoLearnerProfile,
  onSave,
  onValueChange,
  pageError,
  questions = [],
  showRedoLearnerProfile = true,
}: ProfileEditorViewProps) {
  const interestQuestions = questions.filter(
    ({ answerKey }) => !["name", "age", "description"].includes(answerKey),
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave();
  }

  function deleteLessonRecordings() {
    if (
      !lessonRecordingCleanupPending &&
      !window.confirm(
        "Delete all saved lesson voice recordings? This cannot be undone.",
      )
    ) {
      return;
    }
    onLessonRecordingConsentChange(false);
  }

  return (
    <LearnerProfileScreen profile>
      <RouteHeader>
        <HeaderButton
          aria-label="Back"
          disabled={isSaving}
          icon={<ArrowLeft />}
          onClick={onClose}
          type="button"
        >
          Back
        </HeaderButton>
      </RouteHeader>

      <LearnerProfileCard
        aria-labelledby="profile-title"
        className="p-5 sm:p-8"
        width="narrow"
      >
        <header>
          <GuardianLearnerContextLabel learnerName={learnerName} />
          <h1
            className="mb-0 mt-2 text-3xl leading-none text-brand-ink sm:text-5xl"
            id="profile-title"
          >
            Learner details
          </h1>
          <p className="mb-0 mt-3 font-bold leading-relaxed text-slate-600">
            These details personalize chats and lessons.
          </p>
        </header>

        <form className="mt-6" onSubmit={submit}>
          <fieldset
            className="m-0 grid min-w-0 gap-4 border-0 p-0 disabled:opacity-75"
            disabled={isSaving}
          >
            <label
              className="grid gap-2 font-black text-brand-ink"
              htmlFor="profile-name"
            >
              <span>Name</span>
              <input
                autoComplete="name"
                className={fieldClassName()}
                id="profile-name"
                maxLength={120}
                onChange={(event) =>
                  onValueChange("name", event.currentTarget.value)
                }
                type="text"
                value={drafts.name ?? ""}
              />
            </label>
            {fieldErrors.name ? (
              <p
                className="m-0 rounded-2xl bg-rose-100 px-3 py-2.5 font-extrabold text-rose-900"
                role="alert"
              >
                {fieldErrors.name}
              </p>
            ) : null}

            <label
              className="grid gap-2 font-black text-brand-ink"
              htmlFor="profile-age"
            >
              <span>Age</span>
              <input
                id="profile-age"
                className={fieldClassName()}
                onChange={(event) =>
                  onValueChange("age", event.currentTarget.value)
                }
                type="text"
                value={drafts.age ?? ""}
              />
            </label>
            {fieldErrors.age ? (
              <p
                className="m-0 rounded-2xl bg-rose-100 px-3 py-2.5 font-extrabold text-rose-900"
                role="alert"
              >
                {fieldErrors.age}
              </p>
            ) : null}

            <label
              className="grid min-w-0 gap-2 font-black text-brand-ink"
              htmlFor="profile-description"
            >
              <span className="min-w-0 [overflow-wrap:anywhere]" dir="ltr">
                About{" "}
                <BidiLearnerName
                  fallback="this learner"
                  learnerName={drafts.name ?? ""}
                />
              </span>
              <textarea
                className={fieldClassName({
                  className: "min-h-28 resize-y leading-relaxed",
                })}
                id="profile-description"
                maxLength={2_000}
                onChange={(event) =>
                  onValueChange("description", event.currentTarget.value)
                }
                placeholder="Add a short description"
                rows={4}
                value={drafts.description ?? ""}
              />
            </label>
            {fieldErrors.description ? (
              <p
                className="m-0 rounded-2xl bg-rose-100 px-3 py-2.5 font-extrabold text-rose-900"
                role="alert"
              >
                {fieldErrors.description}
              </p>
            ) : null}

            {interestQuestions.map((question) => {
              const fieldId = `profile-${question.answerKey}`;
              return (
                <div className="grid gap-2" key={question.answerKey}>
                  <label
                    className="grid gap-1 font-black text-brand-ink"
                    htmlFor={fieldId}
                  >
                    <span>{question.promptEn}</span>
                    {question.promptZh ? (
                      <span className="text-sm text-brand-blue" lang="zh-CN">
                        {question.promptZh}
                      </span>
                    ) : null}
                  </label>
                  <textarea
                    className={fieldClassName({
                      className: "min-h-24 resize-y leading-relaxed",
                    })}
                    id={fieldId}
                    maxLength={question.maxLength}
                    onChange={(event) =>
                      onValueChange(
                        question.answerKey,
                        event.currentTarget.value,
                      )
                    }
                    rows={3}
                    value={drafts[question.answerKey] ?? ""}
                  />
                  {fieldErrors[question.answerKey] ? (
                    <p
                      className="m-0 rounded-2xl bg-rose-100 px-3 py-2.5 font-extrabold text-rose-900"
                      role="alert"
                    >
                      {fieldErrors[question.answerKey]}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </fieldset>

          <section
            aria-labelledby="lesson-recording-consent-title"
            className="mt-5 grid gap-3 rounded-3xl bg-sky-50 p-4"
          >
            <div className="grid gap-2">
              <h2
                className="m-0 text-xl text-brand-ink"
                id="lesson-recording-consent-title"
              >
                Lesson voice recordings
              </h2>
              <p className="m-0 text-sm font-bold leading-relaxed text-slate-600">
                Recording is available automatically during each join-in
                moment. Clips apply only to this learner profile, and one latest
                clip is saved per join-in moment. You can delete every saved clip
                here at any time.
              </p>
              <p
                aria-live="polite"
                className="m-0 min-h-15 text-sm font-black text-brand-ink min-[360px]:min-h-10 sm:min-h-5"
                role="status"
              >
                {lessonRecordingCleanupPending
                  ? "Saved lesson recordings are still being deleted."
                  : "Lesson recording is available automatically."}
              </p>
            </div>
            <ActionButton
              disabled={isSaving}
              fullWidth
              onClick={deleteLessonRecordings}
              size="compact"
              type="button"
              variant="dangerSurface"
            >
              {lessonRecordingCleanupPending
                ? "Finish deleting lesson recordings"
                : "Delete saved lesson recordings"}
            </ActionButton>
          </section>

          {showRedoLearnerProfile ? (
            <section
              aria-labelledby="redo-learner-setup-title"
              className="mt-5 grid gap-4 rounded-3xl bg-sky-50 p-4 sm:grid-cols-[auto_1fr] sm:items-center"
            >
              <LearnerProfilePeppaArt
                alt="Peppa smiling"
                className="mx-auto size-20 shrink-0 object-contain"
                sizes="5rem"
              />
              <div className="grid gap-2">
                <h2
                  className="m-0 text-xl text-brand-ink"
                  id="redo-learner-setup-title"
                >
                  Redo learner setup
                </h2>
                <p className="m-0 text-sm font-bold leading-relaxed text-slate-600">
                  Answer Peppa’s setup questions again. For a normal chat, go
                  Home and choose Talk to Peppa.
                </p>
                <ActionButton
                  className="mt-1 min-w-0"
                  disabled={isSaving}
                  fullWidth
                  onClick={onRedoLearnerProfile}
                  size="compact"
                  type="button"
                  variant="navy"
                >
                  Redo setup questions
                </ActionButton>
              </div>
            </section>
          ) : null}

          {pageError ? (
            <p
              className="mt-4 rounded-2xl bg-rose-100 px-3 py-2.5 font-extrabold text-rose-900"
              role="alert"
            >
              {pageError}
            </p>
          ) : null}

          <footer className="mt-6 flex items-center justify-between gap-4 border-t-3 border-sky-100 bg-white/95 pb-1 pt-4 max-sm:flex-col max-sm:items-stretch">
            <ActionButton disabled={isSaving} type="submit">
              {isSaving ? "Saving…" : "Save changes"}
            </ActionButton>
            <TextButton disabled={isSaving} onClick={onCancel} type="button">
              Cancel
            </TextButton>
          </footer>
        </form>
      </LearnerProfileCard>
    </LearnerProfileScreen>
  );
}
