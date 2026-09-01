import { useRef, useState, type FormEvent, type RefObject } from "react";
import { BidiLearnerName } from "../app/AppHeader";
import { useDialogFocus } from "../app/useDialogFocus";
import { GuardianLanguageControl } from "../i18n/GuardianLanguageControl";
import { useGuardianLanguage } from "../i18n/guardian-language";
import { ActionButton } from "../shared/ui";
import type { LearnerRosterErrorCode } from "./GuardianLearnerProfiles";
import type { GuardianLearnerProfileSummary } from "./learner-profile-api";

export function LearnerDeleteDialog({
  onClose,
  onDelete,
  profile,
  returnFocusRef,
}: {
  onClose: () => void;
  onDelete: (
    profile: GuardianLearnerProfileSummary,
  ) => Promise<LearnerRosterErrorCode | null>;
  profile: GuardianLearnerProfileSummary;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const { language, messages } = useGuardianLanguage();
  const [error, setError] = useState<LearnerRosterErrorCode | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const isDeletingRef = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useDialogFocus({
    canClose: () => !isDeletingRef.current,
    dialogRef,
    initialFocusRef: cancelRef,
    onClose,
    returnFocusRef,
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isDeletingRef.current) return;

    isDeletingRef.current = true;
    setIsDeleting(true);
    setError(null);
    try {
      const nextError = await onDelete(profile);
      if (nextError === null) onClose();
      else setError(nextError);
    } catch {
      setError("delete-failed");
    } finally {
      isDeletingRef.current = false;
      setIsDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-brand-navy/65 p-4 font-ui sm:p-8"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !isDeletingRef.current) {
          onClose();
        }
      }}
    >
      <section
        aria-busy={isDeleting}
        aria-labelledby="delete-learner-title"
        aria-modal="true"
        className="grid w-full min-w-0 max-w-lg gap-5 rounded-3xl border-4 border-white bg-sky-50 p-5 text-left text-slate-900 shadow-control-navy sm:p-7"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        lang={language}
      >
        <GuardianLanguageControl placement="dialog" />
        <header className="grid min-w-0 gap-2">
          <p className="m-0 text-xs font-black uppercase tracking-widest text-red-700">
            {messages.learners.deleteDialog.cannotUndo}
          </p>
          <h2
            className="m-0 min-w-0 whitespace-normal text-2xl font-black leading-tight text-brand-navy [overflow-wrap:anywhere] sm:text-3xl"
            id="delete-learner-title"
          >
            {messages.learners.deleteDialog.titleBefore}
            <BidiLearnerName learnerName={profile.name} />
            {messages.learners.deleteDialog.titleAfter}
          </h2>
        </header>

        <p className="m-0 min-w-0 whitespace-normal font-bold leading-relaxed text-slate-700 [overflow-wrap:anywhere]">
          {messages.learners.deleteDialog.descriptionBefore}
          <BidiLearnerName learnerName={profile.name} />
          {messages.learners.deleteDialog.descriptionAfter}
        </p>

        <form className="grid gap-5" onSubmit={handleSubmit}>
          <fieldset
            className="m-0 grid min-w-0 gap-5 border-0 p-0 disabled:opacity-75"
            disabled={isDeleting}
          >
            {error ? (
              <p
                className="m-0 min-w-0 whitespace-normal rounded-xl bg-rose-100 px-3 py-2.5 font-extrabold leading-snug text-red-900 [overflow-wrap:anywhere]"
                role="alert"
              >
                {messages.learners.deleteDialog.alertBefore}
                <BidiLearnerName learnerName={profile.name} />. {" "}
                {messages.learners.roster.errors[error]}
              </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <ActionButton
                onClick={onClose}
                ref={cancelRef}
                type="button"
                variant="surface"
              >
                {messages.learners.deleteDialog.cancel}
              </ActionButton>
              <ActionButton
                aria-label={messages.learners.roster.deleteAria(
                  `\u2068${profile.name}\u2069`,
                )}
                className="min-w-0 whitespace-normal [overflow-wrap:anywhere]"
                type="submit"
                variant="rose"
              >
                <span className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">
                  {isDeleting
                    ? messages.learners.deleteDialog.deletingBefore
                    : messages.learners.deleteDialog.deleteBefore}
                  <BidiLearnerName learnerName={profile.name} />
                  {isDeleting ? "…" : null}
                </span>
              </ActionButton>
            </div>
          </fieldset>
        </form>
      </section>
    </div>
  );
}
