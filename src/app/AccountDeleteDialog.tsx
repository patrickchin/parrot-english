import { useRef, useState, type FormEvent, type RefObject } from "react";
import type { AccountDeleteErrorCode } from "../auth/account-actions";
import { GuardianLanguageControl } from "../i18n/GuardianLanguageControl";
import { useGuardianLanguage } from "../i18n/guardian-language";
import { ActionButton, fieldClassName } from "../shared/ui";
import { useDialogFocus } from "./useDialogFocus";

export function AccountDeleteDialog({
  onClose,
  onDelete,
  returnFocusRef,
}: {
  onClose: () => void;
  onDelete: (password: string) => Promise<AccountDeleteErrorCode>;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const { language, messages } = useGuardianLanguage();
  const copy = messages.accountPrivacy.deleteDialog;
  const [error, setError] = useState<AccountDeleteErrorCode>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const isDeletingRef = useRef(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useDialogFocus({
    canClose: () => !isDeletingRef.current,
    dialogRef,
    initialFocusRef: passwordRef,
    onClose,
    returnFocusRef,
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || isDeletingRef.current) return;

    isDeletingRef.current = true;
    setIsDeleting(true);
    setError(null);

    try {
      const nextError = await onDelete(password);
      setError(nextError);
    } catch {
      setError("account-delete-failed");
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
        aria-labelledby="delete-account-title"
        aria-modal="true"
        className="grid w-full max-w-lg gap-5 rounded-3xl border-4 border-white bg-sky-50 p-5 text-left text-slate-900 shadow-control-navy sm:p-7"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        lang={language}
      >
        <GuardianLanguageControl placement="dialog" />
        <header className="grid gap-2">
          <p className="m-0 text-xs font-black uppercase tracking-widest text-red-700">
            {copy.cannotUndo}
          </p>
          <h2
            className="m-0 text-2xl font-black leading-tight text-brand-navy sm:text-3xl"
            id="delete-account-title"
          >
            {copy.title}
          </h2>
        </header>

        <p className="m-0 font-bold leading-relaxed text-slate-700">
          {copy.description}
        </p>

        <form className="grid gap-5" onSubmit={handleSubmit}>
          <fieldset
            className="m-0 grid min-w-0 gap-5 border-0 p-0 disabled:opacity-75"
            disabled={isDeleting}
          >
            <label
              className="grid gap-2 font-black text-brand-ink"
              htmlFor="delete-account-password"
            >
              <span>{copy.password}</span>
              <input
                autoComplete="current-password"
                className={fieldClassName({ tone: "tinted" })}
                id="delete-account-password"
                name="password"
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError(null);
                }}
                ref={passwordRef}
                required
                type="password"
                value={password}
              />
            </label>

            {error ? (
              <p
                className="m-0 rounded-xl bg-rose-100 px-3 py-2.5 font-extrabold leading-snug text-red-900"
                role="alert"
              >
                {copy.errors[error]}
              </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <ActionButton onClick={onClose} type="button" variant="surface">
                {copy.cancel}
              </ActionButton>
              <ActionButton disabled={!password} type="submit" variant="rose">
                {isDeleting ? copy.deleting : copy.confirm}
              </ActionButton>
            </div>
          </fieldset>
        </form>
      </section>
    </div>
  );
}
