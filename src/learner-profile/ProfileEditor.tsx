import { ArrowLeft } from "lucide-react";
import type { FormEvent } from "react";
import {
  BidiLearnerName,
  GuardianLearnerContextLabel,
  HeaderButton,
  RouteHeader,
} from "../app/AppHeader";
import { AdultBoundaryHelper } from "../i18n/AdultBoundaryHelper";
import { useGuardianLanguage } from "../i18n/guardian-language";
import { englishGuardianMessages } from "../i18n/messages/en";
import {
  LearnerProfileCard,
  LearnerProfilePeppaArt,
  LearnerProfileScreen,
} from "./LearnerProfileLayout";
import { ActionButton, fieldClassName, TextButton } from "../shared/ui";
import type {
  LearnerProfileFieldErrorCode,
  LearnerProfileQuestion,
} from "./learner-profile-api";

export type ProfileEditorAudience = "guardian" | "learner";
export type LearnerDetailsErrorCode =
  | "load-failed"
  | "save-failed"
  | "recording-choice-failed";

type ProfileEditorViewProps = {
  audience: ProfileEditorAudience;
  drafts: Record<string, string>;
  fieldErrors: Record<string, LearnerProfileFieldErrorCode>;
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
  pageError: LearnerDetailsErrorCode | null;
  questions?: LearnerProfileQuestion[];
  showRedoLearnerProfile?: boolean;
};

export function ProfileEditorView({
  audience,
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
  const { messages: selectedMessages } = useGuardianLanguage();
  const messages =
    audience === "guardian" ? selectedMessages : englishGuardianMessages;
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
      !window.confirm(messages.learners.profile.deleteRecordingsConfirm)
    ) {
      return;
    }
    onLessonRecordingConsentChange(false);
  }

  return (
    <LearnerProfileScreen profile>
      <RouteHeader ariaLabel={messages.common.pageNavigation}>
        <HeaderButton
          aria-label={messages.learners.profile.back}
          disabled={isSaving}
          icon={<ArrowLeft />}
          onClick={onClose}
          type="button"
        >
          {messages.learners.profile.back}
        </HeaderButton>
      </RouteHeader>

      <LearnerProfileCard
        aria-labelledby="profile-title"
        className="p-5 sm:p-8"
        width="narrow"
      >
        <header>
          <GuardianLearnerContextLabel
            audience={audience}
            learnerName={learnerName}
          />
          <h1
            className="mb-0 mt-2 text-3xl leading-none text-brand-ink sm:text-5xl"
            id="profile-title"
          >
            {messages.learners.profile.title}
          </h1>
          <p className="mb-0 mt-3 font-bold leading-relaxed text-slate-600">
            {messages.learners.profile.description}
          </p>
          {audience === "learner" ? (
            <p className="mb-0 mt-2 grid gap-1 text-sm font-bold leading-relaxed text-slate-600">
              <span>{messages.learners.profile.savedAnswersHelper}</span>
              <AdultBoundaryHelper message="savedAnswersHelper" />
            </p>
          ) : null}
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
              <span>{messages.learners.profile.name}</span>
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
                {messages.learners.profile.fieldErrors[fieldErrors.name]}
              </p>
            ) : null}

            <label
              className="grid gap-2 font-black text-brand-ink"
              htmlFor="profile-age"
            >
              <span>{messages.learners.profile.age}</span>
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
                {messages.learners.profile.fieldErrors[fieldErrors.age]}
              </p>
            ) : null}

            <label
              className="grid min-w-0 gap-2 font-black text-brand-ink"
              htmlFor="profile-description"
            >
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {messages.learners.profile.aboutBefore}
                <BidiLearnerName
                  fallback={messages.learners.profile.aboutFallback}
                  learnerName={drafts.name ?? ""}
                />
                {messages.learners.profile.aboutAfter}
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
                placeholder={messages.learners.profile.descriptionPlaceholder}
                rows={4}
                value={drafts.description ?? ""}
              />
            </label>
            {fieldErrors.description ? (
              <p
                className="m-0 rounded-2xl bg-rose-100 px-3 py-2.5 font-extrabold text-rose-900"
                role="alert"
              >
                {
                  messages.learners.profile.fieldErrors[
                    fieldErrors.description
                  ]
                }
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
                    <span lang="en">{question.promptEn}</span>
                    {question.promptZh ? (
                      <span className="text-sm text-brand-blue" lang="zh-Hans">
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
                      {
                        messages.learners.profile.fieldErrors[
                          fieldErrors[question.answerKey]
                        ]
                      }
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
                {messages.learners.profile.recordingTitle}
              </h2>
              <p className="m-0 text-sm font-bold leading-relaxed text-slate-600">
                {messages.learners.profile.recordingDescription}
              </p>
              <p
                aria-live="polite"
                className="m-0 min-h-15 text-sm font-black text-brand-ink min-[360px]:min-h-10 sm:min-h-5"
                role="status"
              >
                {lessonRecordingCleanupPending
                  ? messages.learners.profile.recordingCleanupPending
                  : messages.learners.profile.recordingAvailable}
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
                ? messages.learners.profile.finishDeletingRecordings
                : messages.learners.profile.deleteRecordings}
            </ActionButton>
          </section>

          {showRedoLearnerProfile ? (
            <section
              aria-labelledby="redo-learner-setup-title"
              className="mt-5 grid gap-4 rounded-3xl bg-sky-50 p-4 sm:grid-cols-[auto_1fr] sm:items-center"
            >
              <LearnerProfilePeppaArt
                alt={messages.learners.profile.peppaAlt}
                className="mx-auto size-20 shrink-0 object-contain"
                sizes="5rem"
              />
              <div className="grid gap-2">
                <h2
                  className="m-0 text-xl text-brand-ink"
                  id="redo-learner-setup-title"
                >
                  {messages.learners.profile.redoTitle}
                </h2>
                <p className="m-0 text-sm font-bold leading-relaxed text-slate-600">
                  {messages.learners.profile.redoDescription}
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
                  {messages.learners.profile.redoAction}
                </ActionButton>
              </div>
            </section>
          ) : null}

          {pageError ? (
            <p
              className="mt-4 rounded-2xl bg-rose-100 px-3 py-2.5 font-extrabold text-rose-900"
              role="alert"
            >
              {messages.learners.profile.pageErrors[pageError]}
            </p>
          ) : null}

          <footer className="mt-6 flex items-center justify-between gap-4 border-t-3 border-sky-100 bg-white/95 pb-1 pt-4 max-sm:flex-col max-sm:items-stretch">
            <ActionButton disabled={isSaving} type="submit">
              {isSaving
                ? messages.learners.profile.saving
                : messages.learners.profile.saveChanges}
            </ActionButton>
            <TextButton disabled={isSaving} onClick={onCancel} type="button">
              {messages.learners.profile.cancel}
            </TextButton>
          </footer>
        </form>
      </LearnerProfileCard>
    </LearnerProfileScreen>
  );
}
