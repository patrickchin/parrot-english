import { ArrowLeft } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type Ref,
} from "react";
import { BidiLearnerName, HeaderLink, RouteHeader } from "../app/AppHeader";
import { getGuardianPath } from "../app/app-routes";
import {
  GuardianLearnerTarget,
  useGuardianLearnerTarget,
  type GuardianLearnerTargetState,
} from "../learner-profile/GuardianLearnerTarget";
import { ActionButton, Card } from "../shared/ui";
import {
  deleteDub,
  DubResetInProgressError,
  grantDubConsent,
  loadDubStatus,
  type DubStatus,
} from "./dub-api";
import { DUB_DEFINITIONS } from "./rhyme-catalog";

type Mutation = "delete" | "grant";
type GuardianDubbingStatus = {
  consentState: DubStatus["consentState"];
  savedCount: number;
};

const DUB_LINE_COUNT = DUB_DEFINITIONS.reduce(
  (total, definition) => total + definition.lines.length,
  0,
);

export function GuardianDubbingSettingsView({
  cleanupRequired,
  consentState,
  canRetryStatus,
  error,
  hasAccepted,
  isLoading,
  mutation,
  onAcceptedChange,
  onDelete,
  onGrant,
  onRetry,
  savedCount,
  stateHeadingRef,
  target,
}: {
  cleanupRequired: boolean;
  consentState: DubStatus["consentState"] | null;
  canRetryStatus: boolean;
  error: string;
  hasAccepted: boolean;
  isLoading: boolean;
  mutation: Mutation | null;
  onAcceptedChange: (accepted: boolean) => void;
  onDelete: () => void;
  onGrant: () => void;
  onRetry: () => void;
  savedCount: number;
  stateHeadingRef?: Ref<HTMLHeadingElement>;
  target: GuardianLearnerTargetState;
}) {
  const managedLearnerName = target.learnerName?.trim() || "Learner";
  const busy = isLoading || mutation !== null;

  function submitGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onGrant();
  }

  return (
    <main className="h-dvh w-full overflow-x-hidden overflow-y-auto bg-placeholder px-4 pb-12 pt-28 sm:px-6 md:px-10 md:pt-32">
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
        <header className="grid gap-4 text-center">
          <h1 className="m-0 text-4xl leading-none tracking-tight text-brand-ink sm:text-6xl">
            Voice dubbing
          </h1>
          <GuardianLearnerTarget state={target} />
          {target.phase === "ready" && target.learnerName !== null ? (
            <p
              className="m-0 min-w-0 font-bold leading-relaxed text-slate-600 [overflow-wrap:anywhere]"
              dir="ltr"
            >
              Manage <BidiLearnerName learnerName={managedLearnerName} />
              &apos;s private voice clips for all voice-dubbing rhymes: Five
              Little Ducks and Old MacDonald.
            </p>
          ) : null}
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
            {canRetryStatus && !busy ? (
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
              <h2
                className="m-0 text-2xl leading-tight text-brand-navy"
                ref={stateHeadingRef}
                tabIndex={-1}
              >
                Turn on private voice dubbing
              </h2>
              <p
                className="m-0 min-w-0 font-bold leading-relaxed text-slate-600 [overflow-wrap:anywhere]"
                dir="ltr"
              >
                All voice-dubbing rhymes save{" "}
                <BidiLearnerName learnerName={managedLearnerName} />
                &apos;s private voice clips in this account: Five Little Ducks and
                Old MacDonald. They are used only for{" "}
                <BidiLearnerName learnerName={managedLearnerName} />
                &apos;s private playback and are deleted with the account.
              </p>
            </div>

            <form className="grid gap-5" onSubmit={submitGrant}>
              <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl bg-sky-50 p-4 font-extrabold leading-relaxed text-brand-navy">
                <input
                  checked={hasAccepted}
                  className="mt-1 size-5 shrink-0 accent-brand-blue"
                  disabled={busy}
                  onChange={(event) =>
                    onAcceptedChange(event.currentTarget.checked)
                  }
                  type="checkbox"
                />
                <span className="min-w-0 [overflow-wrap:anywhere]" dir="ltr">
                  I am <BidiLearnerName learnerName={managedLearnerName} />
                  &apos;s guardian and I consent to saving private voice clips for
                  all voice-dubbing rhymes.
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
              <h2
                className="m-0 text-2xl leading-tight text-brand-navy"
                ref={stateHeadingRef}
                tabIndex={-1}
              >
                Voice dubbing is on
              </h2>
              <p className="m-0 font-extrabold text-brand-blue">
                {savedCount} of {DUB_LINE_COUNT} clips saved across Five Little
                Ducks and Old MacDonald
              </p>
              <p
                className="m-0 min-w-0 font-bold leading-relaxed text-slate-600 [overflow-wrap:anywhere]"
                dir="ltr"
              >
                <BidiLearnerName learnerName={managedLearnerName} /> can record
                and replace lines in both Five Little Ducks and Old MacDonald.
              </p>
            </div>
            <div className="grid gap-3">
              <ActionButton
                disabled={busy}
                fullWidth
                onClick={onDelete}
                type="button"
                variant="dangerSurface"
              >
                <span
                  className="min-w-0 py-2 leading-tight [overflow-wrap:anywhere]"
                  dir="ltr"
                >
                  {mutation === "delete" ? (
                    "Removing voice clips…"
                  ) : (
                    <>
                      Turn off{" "}
                      <BidiLearnerName learnerName={managedLearnerName} />
                      &apos;s voice dubbing and delete clips from Five Little Ducks
                      and Old MacDonald
                    </>
                  )}
                </span>
              </ActionButton>
            </div>
          </Card>
        ) : null}

        {consentState === "revoking" || cleanupRequired ? (
          <Card className="grid gap-5 p-5 text-center sm:p-7">
            <div className="grid gap-2">
              <h2
                className="m-0 text-2xl leading-tight text-brand-navy"
                ref={stateHeadingRef}
                tabIndex={-1}
              >
                Voice clip removal needs to finish
              </h2>
              <p
                className="m-0 min-w-0 font-bold leading-relaxed text-slate-600 [overflow-wrap:anywhere]"
                dir="ltr"
              >
                <BidiLearnerName learnerName={managedLearnerName} />
                &apos;s voice dubbing stays unavailable in Five Little Ducks and
                Old MacDonald until every saved clip from both rhymes has been
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
                : "Finish removing clips from Five Little Ducks and Old MacDonald"}
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

function TargetedGuardianDubbingSettings({
  learnerProfileId,
  target,
}: {
  learnerProfileId: string;
  target: GuardianLearnerTargetState;
}) {
  const [cleanupRequired, setCleanupRequired] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [status, setStatus] = useState<GuardianDubbingStatus | null>(null);
  const [hasAccepted, setHasAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [mutation, setMutation] = useState<Mutation | null>(null);
  const [operationError, setOperationError] = useState("");
  const [statusError, setStatusError] = useState("");
  const loadControllerRef = useRef<AbortController | null>(null);
  const loadGenerationRef = useRef(0);
  const lastFocusedRequestRef = useRef(0);
  const mountedRef = useRef(false);
  const mutationControllerRef = useRef<AbortController | null>(null);
  const mutationRef = useRef<Mutation | null>(null);
  const stateHeadingRef = useRef<HTMLHeadingElement>(null);

  const refresh = useCallback(
    async ({
      invalidateOnFailure = false,
      preserveOperationError = false,
    }: {
      invalidateOnFailure?: boolean;
      preserveOperationError?: boolean;
    } = {}) => {
      loadControllerRef.current?.abort();
      const controller = new AbortController();
      const generation = loadGenerationRef.current + 1;
      loadControllerRef.current = controller;
      loadGenerationRef.current = generation;
      setIsLoading(true);
      setStatusError("");
      if (!preserveOperationError) setOperationError("");

      try {
        const statuses = await Promise.all(
          DUB_DEFINITIONS.map(({ id: dubId }) =>
            loadDubStatus({
              dubId,
              learnerProfileId,
              signal: controller.signal,
            }),
          ),
        );
        if (
          !mountedRef.current ||
          controller.signal.aborted ||
          generation !== loadGenerationRef.current
        ) {
          return false;
        }
        const consentState = statuses.some(
          (candidate) => candidate.consentState === "revoking",
        )
          ? "revoking"
          : statuses.every(
                (candidate) => candidate.consentState === "granted",
              )
            ? "granted"
            : "not_granted";
        setStatus({
          consentState,
          savedCount: statuses.reduce(
            (total, candidate) =>
              total + candidate.lines.filter(({ saved }) => saved).length,
            0,
          ),
        });
        setCleanupRequired(false);
        if (consentState !== "not_granted") setHasAccepted(false);
        return true;
      } catch (error) {
        if (
          !mountedRef.current ||
          controller.signal.aborted ||
          generation !== loadGenerationRef.current
        ) {
          return false;
        }
        if (error instanceof DubResetInProgressError) {
          setStatus(null);
          setCleanupRequired(true);
          return false;
        }
        if (invalidateOnFailure) {
          setStatus(null);
          setCleanupRequired(false);
        }
        setStatusError(
          messageFor(error, "Voice dubbing settings could not be loaded."),
        );
        return false;
      } finally {
        if (mountedRef.current && generation === loadGenerationRef.current) {
          setIsLoading(false);
        }
        if (loadControllerRef.current === controller) {
          loadControllerRef.current = null;
        }
      }
    },
    [learnerProfileId],
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

  useEffect(() => {
    if (focusRequest === lastFocusedRequestRef.current) return;
    lastFocusedRequestRef.current = focusRequest;
    stateHeadingRef.current?.focus();
  }, [cleanupRequired, focusRequest, status?.consentState]);

  async function mutate(
    kind: Mutation,
    operation: (options: { signal: AbortSignal }) => Promise<void>,
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
        failure = messageFor(
          error,
          "Voice dubbing settings could not be changed.",
        );
      }
    }

    if (mountedRef.current && !controller.signal.aborted) {
      if (failure) setOperationError(failure);
      await refresh({
        invalidateOnFailure: true,
        preserveOperationError: Boolean(failure),
      });
      if (kind === "grant" && succeeded) setHasAccepted(false);
      setFocusRequest((request) => request + 1);
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
    void mutate("grant", (options) =>
      grantDubConsent({ ...options, learnerProfileId }),
    );
  }

  function remove() {
    if (
      !cleanupRequired &&
      status?.consentState !== "granted" &&
      status?.consentState !== "revoking"
    ) {
      return;
    }
    void mutate("delete", (options) =>
      deleteDub({ ...options, learnerProfileId }),
    );
  }

  return (
    <GuardianDubbingSettingsView
      canRetryStatus={Boolean(statusError)}
      cleanupRequired={cleanupRequired}
      consentState={status?.consentState ?? null}
      error={statusError || operationError}
      hasAccepted={hasAccepted}
      isLoading={isLoading}
      mutation={mutation}
      onAcceptedChange={setHasAccepted}
      onDelete={remove}
      onGrant={grant}
      onRetry={() => void refresh({ preserveOperationError: true })}
      savedCount={status?.savedCount ?? 0}
      stateHeadingRef={stateHeadingRef}
      target={target}
    />
  );
}

export function GuardianDubbingSettings() {
  const target = useGuardianLearnerTarget();
  return target.phase === "ready" &&
    target.learnerProfileId !== null &&
    target.learnerName !== null ? (
    <TargetedGuardianDubbingSettings
      key={target.learnerProfileId}
      learnerProfileId={target.learnerProfileId}
      target={target}
    />
  ) : (
    <GuardianDubbingSettingsView
      canRetryStatus={false}
      cleanupRequired={false}
      consentState={null}
      error=""
      hasAccepted={false}
      isLoading={false}
      mutation={null}
      onAcceptedChange={() => {}}
      onDelete={() => {}}
      onGrant={() => {}}
      onRetry={() => {}}
      savedCount={0}
      target={target}
    />
  );
}
