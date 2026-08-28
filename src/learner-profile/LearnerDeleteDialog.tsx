import { useRef, useState, type FormEvent, type RefObject } from "react";
import { useDialogFocus } from "../app/useDialogFocus";
import { ActionButton } from "../shared/ui";
import type { GuardianLearnerProfileSummary } from "./learner-profile-api";

export function LearnerDeleteDialog({
  onClose,
  onDelete,
  profile,
  returnFocusRef,
}: {
  onClose: () => void;
  onDelete: (profile: GuardianLearnerProfileSummary) => void | Promise<void>;
  profile: GuardianLearnerProfileSummary;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [error, setError] = useState("");
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
    setError("");
    try {
      await onDelete(profile);
      onClose();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error && caughtError.message
          ? caughtError.message
          : `Could not delete ${profile.name}. Please try again.`,
      );
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
        className="grid w-full max-w-lg gap-5 rounded-3xl border-4 border-white bg-sky-50 p-5 text-left text-slate-900 shadow-control-navy sm:p-7"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="grid gap-2">
          <p className="m-0 text-xs font-black uppercase tracking-widest text-red-700">
            Cannot be undone
          </p>
          <h2
            className="m-0 text-2xl font-black leading-tight text-brand-navy sm:text-3xl"
            id="delete-learner-title"
          >
            Delete {profile.name}?
          </h2>
        </header>

        <p className="m-0 font-bold leading-relaxed text-slate-700">
          This removes {profile.name}'s learner profile and private learner
          data. Your Guardian account and other learners remain.
        </p>

        <form className="grid gap-5" onSubmit={handleSubmit}>
          <fieldset
            className="m-0 grid min-w-0 gap-5 border-0 p-0 disabled:opacity-75"
            disabled={isDeleting}
          >
            {error ? (
              <p
                className="m-0 rounded-xl bg-rose-100 px-3 py-2.5 font-extrabold leading-snug text-red-900"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <ActionButton
                onClick={onClose}
                ref={cancelRef}
                type="button"
                variant="surface"
              >
                Cancel
              </ActionButton>
              <ActionButton type="submit" variant="rose">
                {isDeleting ? `Deleting ${profile.name}…` : `Delete ${profile.name}`}
              </ActionButton>
            </div>
          </fieldset>
        </form>
      </section>
    </div>
  );
}
