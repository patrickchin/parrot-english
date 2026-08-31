import {
  forwardRef,
  useId,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { ActionButton, Card } from "../shared/ui";
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
  HTMLButtonElement,
  GuardianUnlockFormProps
>(function GuardianUnlockForm(
  { autoFocus = false, onCancel, onUnlocked },
  switchButtonRef,
) {
  const { unlock } = useGuardianAccess();
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const pendingRef = useRef(false);
  const titleId = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;

    pendingRef.current = true;
    setIsPending(true);
    setError("");
    try {
      const nextError = await unlock("");
      if (nextError) {
        setError(nextError);
        return;
      }
      onUnlocked?.();
    } catch {
      setError(UNLOCK_FALLBACK_ERROR);
    } finally {
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
    >
      <header className="grid gap-2">
        <h1
          className="m-0 text-2xl font-black leading-tight text-brand-navy sm:text-3xl"
          id={titleId}
        >
          Switch to guardian mode
        </h1>
      </header>
      <p className="m-0 font-bold leading-relaxed text-slate-700">
        Guardian tools and learner activities stay in separate modes.
      </p>
      <fieldset
        className="m-0 grid min-w-0 gap-5 border-0 p-0 disabled:opacity-75"
        disabled={isPending}
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
          <ActionButton onClick={onCancel} type="button" variant="surface">
            Cancel
          </ActionButton>
          <ActionButton autoFocus={autoFocus} ref={switchButtonRef} type="submit">
            {isPending ? "Switching modes…" : "Switch to guardian mode"}
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
  const switchButtonRef = useRef<HTMLButtonElement>(null);
  const canClose = () =>
    dialogRef.current?.querySelector("form")?.getAttribute("aria-busy") !==
    "true";

  useDialogFocus({
    canClose,
    dialogRef,
    initialFocusRef: switchButtonRef,
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
        aria-label="Switch to guardian mode"
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
          ref={switchButtonRef}
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
