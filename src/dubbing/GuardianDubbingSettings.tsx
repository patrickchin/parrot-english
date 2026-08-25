import { ArrowLeft } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useNavigate } from "react-router";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import { getDuckDubPath, getGuardianPath } from "../app/app-routes";
import { useGuardianAccess } from "../auth/GuardianAccess";
import { ActionButton, Card } from "../shared/ui";
import {
  deleteDub,
  grantDubConsent,
  loadDubStatus,
  type DubStatus,
} from "./dub-api";
import { DUB_LINES } from "./dub-script";

type Mutation = "delete" | "grant" | "switch";

export function GuardianDubbingSettingsView({
  consentState,
  error,
  hasAccepted,
  isLoading,
  mutation,
  onAcceptedChange,
  onDelete,
  onGrant,
  onRetry,
  onSwitchToLearner,
  savedCount,
}: {
  consentState: DubStatus["consentState"] | null;
  error: string;
  hasAccepted: boolean;
  isLoading: boolean;
  mutation: Mutation | null;
  onAcceptedChange: (accepted: boolean) => void;
  onDelete: () => void;
  onGrant: () => void;
  onRetry: () => void;
  onSwitchToLearner: () => void;
  savedCount: number;
}) {
  const busy = isLoading || mutation !== null;

  function submitGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onGrant();
  }

  return (
    <main className="min-h-dvh w-full overflow-x-hidden bg-placeholder px-4 pb-12 pt-28 sm:px-6 md:px-10 md:pt-32">
      <RouteHeader>
        <HeaderLink
          aria-label="Back to guardian dashboard"
          icon={<ArrowLeft />}
          to={getGuardianPath()}
        >
          Back to guardian dashboard
        </HeaderLink>
      </RouteHeader>

      <section className="mx-auto grid w-full max-w-3xl gap-6">
        <header className="grid gap-2 text-center">
          <h1 className="m-0 text-4xl leading-none tracking-tight text-brand-ink sm:text-6xl">
            Voice dubbing
          </h1>
          <p className="m-0 font-bold leading-relaxed text-slate-600">
            Manage private voice clips for Five Little Ducks.
          </p>
        </header>

        {isLoading ? (
          <p
            aria-live="polite"
            className="m-0 text-center font-extrabold text-brand-blue"
            role="status"
          >
            Loading voice dubbing settings…
          </p>
        ) : null}

        {error ? (
          <div className="grid justify-items-center gap-3 rounded-2xl bg-rose-100 px-4 py-3 text-center">
            <p className="m-0 font-extrabold text-red-900" role="alert">
              {error}
            </p>
            {!busy ? (
              <ActionButton
                onClick={onRetry}
                size="compact"
                type="button"
                variant="surface"
              >
                Try again
              </ActionButton>
            ) : null}
          </div>
        ) : null}

        {consentState === "not_granted" ? (
          <Card className="grid gap-5 p-5 sm:p-7">
            <div className="grid gap-3">
              <h2 className="m-0 text-2xl leading-tight text-brand-navy">
                Turn on private voice dubbing
              </h2>
              <p className="m-0 font-bold leading-relaxed text-slate-600">
                Five Little Ducks saves the learner&apos;s voice clips privately
                in this account. They are used only for the learner&apos;s private
                playback and are deleted with the account.
              </p>
            </div>

            <form className="grid gap-5" onSubmit={submitGrant}>
              <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl bg-sky-50 p-4 font-extrabold leading-relaxed text-brand-navy">
                <input
                  checked={hasAccepted}
                  className="mt-1 size-5 shrink-0 accent-brand-blue"
                  disabled={busy}
                  onChange={(event) => onAcceptedChange(event.currentTarget.checked)}
                  type="checkbox"
                />
                <span>
                  I am the learner&apos;s guardian and I consent to saving these
                  private voice clips.
                </span>
              </label>
              <ActionButton
                disabled={busy || !hasAccepted}
                fullWidth
                type="submit"
              >
                {mutation === "grant"
                  ? "Turning on voice dubbing…"
                  : "Allow voice dubbing"}
              </ActionButton>
            </form>
          </Card>
        ) : null}

        {consentState === "granted" ? (
          <Card className="grid gap-5 p-5 sm:p-7">
            <div className="grid gap-2 text-center">
              <h2 className="m-0 text-2xl leading-tight text-brand-navy">
                Voice dubbing is on
              </h2>
              <p className="m-0 font-extrabold text-brand-blue">
                {savedCount} of {DUB_LINES.length} lines saved
              </p>
              <p className="m-0 font-bold leading-relaxed text-slate-600">
                The learner can record and replace lines in Five Little Ducks.
              </p>
            </div>
            <div className="grid gap-3">
              <ActionButton
                disabled={busy}
                fullWidth
                onClick={onSwitchToLearner}
                type="button"
              >
                {mutation === "switch"
                  ? "Switching to learner…"
                  : "Switch to learner and start dubbing"}
              </ActionButton>
              <ActionButton
                disabled={busy}
                fullWidth
                onClick={onDelete}
                type="button"
                variant="dangerSurface"
              >
                {mutation === "delete"
                  ? "Removing voice clips…"
                  : "Turn off voice dubbing and delete saved clips"}
              </ActionButton>
            </div>
          </Card>
        ) : null}

        {consentState === "revoking" ? (
          <Card className="grid gap-5 p-5 text-center sm:p-7">
            <div className="grid gap-2">
              <h2 className="m-0 text-2xl leading-tight text-brand-navy">
                Voice clip removal needs to finish
              </h2>
              <p className="m-0 font-bold leading-relaxed text-slate-600">
                Voice dubbing stays unavailable until every saved clip has been
                removed.
              </p>
            </div>
            <ActionButton
              disabled={busy}
              fullWidth
              onClick={onDelete}
              type="button"
              variant="dangerSurface"
            >
              {mutation === "delete"
                ? "Removing voice clips…"
                : "Finish removing voice clips"}
            </ActionButton>
          </Card>
        ) : null}
      </section>
    </main>
  );
}

function messageFor(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function GuardianDubbingSettings({
  onBeforeNavigate,
}: {
  onBeforeNavigate?: () => void;
}) {
  const { error: guardianError, lock } = useGuardianAccess();
  const navigate = useNavigate();
  const [status, setStatus] = useState<DubStatus | null>(null);
  const [hasAccepted, setHasAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [mutation, setMutation] = useState<Mutation | null>(null);
  const [operationError, setOperationError] = useState("");
  const loadControllerRef = useRef<AbortController | null>(null);
  const loadGenerationRef = useRef(0);
  const mountedRef = useRef(false);
  const mutationControllerRef = useRef<AbortController | null>(null);
  const mutationRef = useRef<Mutation | null>(null);

  const refresh = useCallback(
    async ({
      invalidateOnFailure = false,
      preserveError = false,
    }: {
      invalidateOnFailure?: boolean;
      preserveError?: boolean;
    } = {}) => {
      loadControllerRef.current?.abort();
      const controller = new AbortController();
      const generation = loadGenerationRef.current + 1;
      loadControllerRef.current = controller;
      loadGenerationRef.current = generation;
      setIsLoading(true);
      if (!preserveError) setOperationError("");

      try {
        const nextStatus = await loadDubStatus({ signal: controller.signal });
        if (
          !mountedRef.current ||
          controller.signal.aborted ||
          generation !== loadGenerationRef.current
        ) {
          return false;
        }
        setStatus(nextStatus);
        return true;
      } catch (error) {
        if (
          !mountedRef.current ||
          controller.signal.aborted ||
          generation !== loadGenerationRef.current
        ) {
          return false;
        }
        if (invalidateOnFailure) setStatus(null);
        setOperationError(
          messageFor(error, "Voice dubbing settings could not be loaded."),
        );
        return false;
      } finally {
        if (
          mountedRef.current &&
          generation === loadGenerationRef.current
        ) {
          setIsLoading(false);
        }
        if (loadControllerRef.current === controller) {
          loadControllerRef.current = null;
        }
      }
    },
    [],
  );

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      mountedRef.current = false;
      loadGenerationRef.current += 1;
      loadControllerRef.current?.abort();
      mutationControllerRef.current?.abort();
    };
  }, [refresh]);

  async function mutate(
    kind: Exclude<Mutation, "switch">,
    operation: (options: { signal: AbortSignal }) => Promise<void>,
    reloadAfterFailure: boolean,
  ) {
    if (mutationRef.current !== null || isLoading) return;
    mutationRef.current = kind;
    setMutation(kind);
    setOperationError("");
    const controller = new AbortController();
    mutationControllerRef.current = controller;
    let failure = "";
    let succeeded = false;

    try {
      await operation({ signal: controller.signal });
      succeeded = true;
    } catch (error) {
      if (!controller.signal.aborted) {
        failure = messageFor(error, "Voice dubbing settings could not be changed.");
      }
    }

    if (mountedRef.current && !controller.signal.aborted) {
      if (succeeded || reloadAfterFailure) {
        const reloaded = await refresh({
          invalidateOnFailure: true,
          preserveError: Boolean(failure),
        });
        if (failure && reloaded) setOperationError(failure);
      } else if (failure) {
        setOperationError(failure);
      }
      if (kind === "grant" && succeeded) setHasAccepted(false);
    }

    if (mutationControllerRef.current === controller) {
      mutationControllerRef.current = null;
    }
    if (mutationRef.current === kind) {
      mutationRef.current = null;
      if (mountedRef.current) setMutation(null);
    }
  }

  function grant() {
    if (!hasAccepted || status?.consentState !== "not_granted") return;
    void mutate("grant", grantDubConsent, false);
  }

  function remove() {
    if (
      status?.consentState !== "granted" &&
      status?.consentState !== "revoking"
    ) {
      return;
    }
    void mutate("delete", deleteDub, true);
  }

  async function switchToLearner() {
    if (
      mutationRef.current !== null ||
      isLoading ||
      status?.consentState !== "granted"
    ) {
      return;
    }
    mutationRef.current = "switch";
    setMutation("switch");
    setOperationError("");
    try {
      const lockError = await lock();
      if (lockError) {
        if (mountedRef.current) setOperationError(lockError);
        return;
      }
      onBeforeNavigate?.();
      navigate(getDuckDubPath());
    } finally {
      if (mutationRef.current === "switch") mutationRef.current = null;
      if (mountedRef.current) setMutation(null);
    }
  }

  return (
    <GuardianDubbingSettingsView
      consentState={status?.consentState ?? null}
      error={operationError || guardianError}
      hasAccepted={hasAccepted}
      isLoading={isLoading}
      mutation={mutation}
      onAcceptedChange={setHasAccepted}
      onDelete={remove}
      onGrant={grant}
      onRetry={() => void refresh()}
      onSwitchToLearner={() => void switchToLearner()}
      savedCount={status?.lines.filter(({ saved }) => saved).length ?? 0}
    />
  );
}
