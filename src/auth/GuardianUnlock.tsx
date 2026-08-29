import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { ActionButton, Card, fieldClassName } from "../shared/ui";
import { useDialogFocus } from "../app/useDialogFocus";
import { useGuardianAccess } from "./GuardianAccess";

const UNLOCK_FALLBACK_ERROR =
  "Guardian access could not be checked. Please try again.";

export type GuardianUnlockFormProps = {
  autoFocus?: boolean;
  onCancel: () => void;
  onUnlocked?: () => void;
};

export const GuardianUnlockForm = forwardRef<
  HTMLInputElement,
  GuardianUnlockFormProps
>(function GuardianUnlockForm(
  { autoFocus = false, onCancel, onUnlocked },
  passwordRef,
) {
  const { unlock } = useGuardianAccess();
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [password, setPassword] = useState("");
  const pendingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const titleId = useId();
  const errorId = `${titleId}-password-error`;

  useEffect(() => {
    if (!error || isPending) return;
    formRef.current
      ?.querySelector<HTMLInputElement>('input[name="password"]')
      ?.focus();
  }, [error, isPending]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current || password === "") return;

    pendingRef.current = true;
    setIsPending(true);
    setError("");
    try {
      const nextError = await unlock(password);
      if (nextError) {
        setError(nextError);
        return;
      }
      onUnlocked?.();
    } catch {
      setError(UNLOCK_FALLBACK_ERROR);
    } finally {
      setPassword("");
      pendingRef.current = false;
      setIsPending(false);
    }
  }

  return (
    <form
      aria-busy={isPending || undefined}
      aria-labelledby={titleId}
      className="grid gap-5"
      onSubmit={handleSubmit}
      ref={formRef}
    >
      <header className="grid gap-2">
        <p className="m-0 text-xs font-black uppercase tracking-widest text-brand-blue">
          For grown-ups
        </p>
        <h1
          className="m-0 text-2xl font-black leading-tight text-brand-navy sm:text-3xl"
          id={titleId}
        >
          Unlock guardian mode
        </h1>
      </header>
      <p className="m-0 font-bold leading-relaxed text-slate-700">
        Enter the account password to protect grown-up settings.
      </p>
      <fieldset
        className="m-0 grid min-w-0 gap-5 border-0 p-0 disabled:opacity-75"
        disabled={isPending}
      >
        <label
          className="grid gap-2 font-black text-brand-ink"
          htmlFor={`${titleId}-password`}
        >
          <span>Password</span>
          <input
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? true : undefined}
            autoComplete="current-password"
            autoFocus={autoFocus}
            className={fieldClassName({ tone: "tinted" })}
            id={`${titleId}-password`}
            name="password"
            onChange={(event) => {
              setPassword(event.target.value);
              setError("");
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
            id={errorId}
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <ActionButton onClick={onCancel} type="button" variant="surface">
            Cancel
          </ActionButton>
          <ActionButton type="submit">
            {isPending ? "Unlocking guardian mode…" : "Unlock guardian mode"}
          </ActionButton>
        </div>
      </fieldset>
    </form>
  );
});

export function GuardianUnlockDialog({
  onClose,
  onUnlocked,
  returnFocusRef,
}: {
  onClose: () => void;
  onUnlocked?: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const canClose = () =>
    dialogRef.current?.querySelector("form")?.getAttribute("aria-busy") !==
    "true";

  useDialogFocus({
    canClose,
    dialogRef,
    initialFocusRef: passwordRef,
    onClose,
    returnFocusRef,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-brand-navy/65 p-4 font-ui sm:p-8"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && canClose()) onClose();
      }}
    >
      <section
        aria-label="Unlock guardian mode"
        aria-modal="true"
        className="grid max-h-[calc(100dvh-2rem)] w-full max-w-lg gap-5 overflow-y-auto rounded-3xl border-4 border-white bg-sky-50 p-5 text-left text-slate-900 shadow-control-navy sm:p-7"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <GuardianUnlockForm
          autoFocus
          onCancel={onClose}
          onUnlocked={onUnlocked}
          ref={passwordRef}
        />
      </section>
    </div>
  );
}

export function GuardianUnlockScreen({
  onCancel,
  onUnlocked,
}: {
  onCancel: () => void;
  onUnlocked?: () => void;
}) {
  return (
    <main className="grid h-dvh w-screen place-items-start overflow-y-auto bg-placeholder px-4 pb-10 pt-28 md:place-items-center md:px-6 md:pb-12 md:pt-32">
      <Card className="my-auto w-full max-w-lg p-5 sm:p-7">
        <GuardianUnlockForm
          autoFocus
          onCancel={onCancel}
          onUnlocked={onUnlocked}
        />
      </Card>
    </main>
  );
}
