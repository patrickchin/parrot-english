import { ArrowLeft } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Ref,
  type ReactNode,
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
  loadDubStatus,
  type DubStatus,
} from "./dub-api";
import { DUB_DEFINITIONS } from "./rhyme-catalog";

type Mutation = "delete";
type GuardianDubbingStatus = {
  consentState: DubStatus["consentState"];
  savedCount: number;
};

const DUB_LINE_COUNT = DUB_DEFINITIONS.reduce(
  (total, definition) => total + definition.lines.length,
  0,
);

type GuardianDubbingSettingsViewProps = {
  cleanupRequired: boolean;
  consentState: DubStatus["consentState"] | null;
  canRetryStatus: boolean;
  error: string;
  isLoading: boolean;
  mutation: Mutation | null;
  onDelete: () => void;
  onRetry: () => void;
  savedCount: number;
  stateHeadingRef?: Ref<HTMLHeadingElement>;
  target: GuardianLearnerTargetState;
};

function GuardianDubbingSettingsShell({
  children,
  target,
}: {
  children: ReactNode;
  target: GuardianLearnerTargetState;
}) {
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
        </header>

        {children}
      </section>
    </main>
  );
}

function GuardianDubbingSettingsContent({
  cleanupRequired,
  consentState,
  canRetryStatus,
  error,
  isLoading,
  mutation,
  onDelete,
  onRetry,
  savedCount,
  stateHeadingRef,
  target,
}: GuardianDubbingSettingsViewProps) {
  const managedLearnerName = target.learnerName?.trim() || "Learner";
  const busy = isLoading || mutation !== null;

  return (
    <div
      aria-busy={isLoading || undefined}
      className="grid min-h-64 content-start gap-6"
    >
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

      {consentState === "granted" ? (
        <Card className="grid gap-5 p-5 sm:p-7">
          <div className="grid gap-2 text-center">
            <h2
              className="m-0 text-2xl leading-tight text-brand-navy"
              ref={stateHeadingRef}
              tabIndex={-1}
            >
              Voice dubbing is available
            </h2>
            <p
              className="m-0 min-w-0 font-bold leading-relaxed text-slate-600 [overflow-wrap:anywhere]"
              dir="ltr"
            >
              {savedCount} of {DUB_LINE_COUNT} clips saved;{" "}
              <BidiLearnerName learnerName={managedLearnerName} /> can record
              and replace lines across all six nursery rhymes.
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
                    Delete <BidiLearnerName learnerName={managedLearnerName} />
                    &apos;s saved nursery-rhyme voice clips
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
              &apos;s voice dubbing stays unavailable in every nursery rhyme until
              every saved clip has been removed.
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
              : "Finish removing nursery-rhyme clips"}
          </ActionButton>
        </Card>
      ) : null}
    </div>
  );
}

export function GuardianDubbingSettingsView(
  props: GuardianDubbingSettingsViewProps,
) {
  return (
    <GuardianDubbingSettingsShell target={props.target}>
      <GuardianDubbingSettingsContent {...props} />
    </GuardianDubbingSettingsShell>
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
    try {
      await operation({ signal: controller.signal });
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
    <GuardianDubbingSettingsContent
      canRetryStatus={Boolean(statusError)}
      cleanupRequired={cleanupRequired}
      consentState={status?.consentState ?? null}
      error={statusError || operationError}
      isLoading={isLoading}
      mutation={mutation}
      onDelete={remove}
      onRetry={() => void refresh({ preserveOperationError: true })}
      savedCount={status?.savedCount ?? 0}
      stateHeadingRef={stateHeadingRef}
      target={target}
    />
  );
}

export function GuardianDubbingSettings() {
  const target = useGuardianLearnerTarget();
  const learnerProfileId =
    target.phase === "ready" &&
    target.learnerProfileId !== null &&
    target.learnerName !== null
      ? target.learnerProfileId
      : null;

  return (
    <GuardianDubbingSettingsShell target={target}>
      {learnerProfileId !== null ? (
        <TargetedGuardianDubbingSettings
          key={learnerProfileId}
          learnerProfileId={learnerProfileId}
          target={target}
        />
      ) : null}
    </GuardianDubbingSettingsShell>
  );
}
