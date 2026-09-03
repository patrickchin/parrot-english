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
import { useGuardianLanguage } from "../i18n/guardian-language";
import {
  GuardianLearnerTarget,
  useGuardianLearnerTarget,
  type GuardianLearnerTargetState,
} from "../learner-profile/GuardianLearnerTarget";
import { ActionButton, Card } from "../shared/ui";
import {
  deleteAllDubs,
  DubResetInProgressError,
  grantDubConsent,
  loadDubStatus,
  type DubStatus,
} from "./dub-api";
import { DUB_DEFINITIONS } from "./rhyme-catalog";

type Mutation = "delete" | "enable";
export type GuardianDubbingErrorCode =
  | "load-failed"
  | "change-failed"
  | null;
export type GuardianDubbingPhase =
  | "loading"
  | "available"
  | "cleanup-required";
type GuardianDubbingStatusCode = "enabled" | "removed" | null;
type GuardianDubbingStatus = {
  consentState: DubStatus["consentState"];
  savedCount: number;
};

const DUB_LINE_COUNT = DUB_DEFINITIONS.reduce(
  (total, definition) => total + definition.lines.length,
  0,
);

type GuardianDubbingSettingsViewProps = {
  consentState: DubStatus["consentState"] | null;
  canRetryStatus: boolean;
  error: GuardianDubbingErrorCode;
  headingLevel?: 2 | 3;
  mutation: Mutation | null;
  onDelete: () => void;
  onEnable: () => void;
  onRetry: () => void;
  phase: GuardianDubbingPhase;
  savedCount: number;
  stateHeadingRef?: Ref<HTMLHeadingElement>;
  status: GuardianDubbingStatusCode;
  target: GuardianLearnerTargetState;
};

function GuardianDubbingSettingsShell({
  children,
  embedded = false,
  target,
}: {
  children: ReactNode;
  embedded?: boolean;
  target: GuardianLearnerTargetState;
}) {
  const { messages } = useGuardianLanguage();
  const copy = messages.dubbingSettings;
  if (embedded) {
    return (
      <section
        aria-labelledby="voice-dubbing-heading"
        className="mx-auto grid w-full max-w-3xl scroll-mt-24 gap-6"
        id="voice-dubbing"
      >
        <header className="grid gap-4 text-center">
          <h2
            className="m-0 text-3xl leading-tight text-brand-navy sm:text-4xl"
            id="voice-dubbing-heading"
          >
            {copy.title}
          </h2>
          <GuardianLearnerTarget
            manageLearnersTo="#learner-profiles"
            state={target}
          />
        </header>

        {children}
      </section>
    );
  }
  return (
    <main className="h-dvh w-full overflow-x-hidden overflow-y-auto bg-placeholder px-4 pb-12 pt-28 sm:px-6 md:px-10 md:pt-32">
      <RouteHeader ariaLabel={messages.common.pageNavigation}>
        <HeaderLink
          aria-label={copy.backToDashboard}
          icon={<ArrowLeft />}
          to={getGuardianPath()}
        >
          {copy.backToDashboard}
        </HeaderLink>
      </RouteHeader>

      <section className="mx-auto grid w-full max-w-3xl gap-6">
        <header className="grid gap-4 text-center">
          <h1 className="m-0 text-4xl leading-none tracking-tight text-brand-ink sm:text-6xl">
            {copy.title}
          </h1>
          <GuardianLearnerTarget state={target} />
        </header>

        {children}
      </section>
    </main>
  );
}

function GuardianDubbingSettingsContent({
  consentState,
  canRetryStatus,
  error,
  headingLevel = 2,
  mutation,
  onDelete,
  onEnable,
  onRetry,
  phase,
  savedCount,
  stateHeadingRef,
  status,
  target,
}: GuardianDubbingSettingsViewProps) {
  const { messages } = useGuardianLanguage();
  const copy = messages.dubbingSettings;
  const managedLearnerName = target.learnerName?.trim()
    ? target.learnerName
    : messages.learners.profile.aboutFallback;
  const busy = phase === "loading" || mutation !== null;
  const StateHeading = headingLevel === 3 ? "h3" : "h2";

  return (
    <div
      aria-busy={phase === "loading" || undefined}
      className="grid min-h-64 content-start gap-6"
    >
      {phase === "loading" ? (
        <p
          aria-live="polite"
          className="m-0 text-center font-extrabold text-brand-blue"
          role="status"
        >
          {copy.loading}
        </p>
      ) : null}

      {error ? (
        <div className="grid justify-items-center gap-3 rounded-2xl bg-rose-100 px-4 py-3 text-center">
          <p className="m-0 font-extrabold text-red-900" role="alert">
            {copy.errors[error]}
          </p>
          {canRetryStatus && !busy ? (
            <ActionButton
              onClick={onRetry}
              size="compact"
              type="button"
              variant="surface"
            >
              {messages.common.retry}
            </ActionButton>
          ) : null}
        </div>
      ) : null}

      {consentState === "granted" ? (
        <Card className="grid gap-5 p-5 sm:p-7">
          <div className="grid gap-2 text-center">
            <StateHeading
              className="m-0 text-2xl leading-tight text-brand-navy"
              ref={stateHeadingRef}
              tabIndex={-1}
            >
              {copy.availableTitle}
            </StateHeading>
            <p
              className="m-0 min-w-0 font-bold leading-relaxed text-slate-600 [overflow-wrap:anywhere]"
            >
              {copy.savedCount(savedCount, DUB_LINE_COUNT)}
              <BidiLearnerName learnerName={managedLearnerName} />
              {copy.savedCountAfterName}
            </p>
            <p className="m-0 min-w-0 text-sm font-bold leading-relaxed text-slate-600 [overflow-wrap:anywhere]">
              {copy.privacyBeforeName}
              <BidiLearnerName learnerName={managedLearnerName} />
              {copy.privacyAfterName}
            </p>
            <p className="m-0 min-w-0 text-sm font-bold leading-relaxed text-slate-600 [overflow-wrap:anywhere]">
              {copy.deleteAllGuidance}
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
              >
                {mutation === "delete" ? (
                  copy.deleting
                ) : (
                  <>
                    {copy.deleteBeforeName}
                    <BidiLearnerName learnerName={managedLearnerName} />
                    {copy.deleteAfterName}
                  </>
                )}
              </span>
            </ActionButton>
          </div>
        </Card>
      ) : null}

      {phase === "available" && consentState === "not_granted" ? (
        <Card className="grid gap-5 p-5 text-center sm:p-7">
          <StateHeading
            className="m-0 text-2xl leading-tight text-brand-navy"
            ref={stateHeadingRef}
            tabIndex={-1}
          >
            {copy.emptyTitle}
          </StateHeading>
          <p className="m-0 font-bold leading-relaxed text-slate-600">
            {copy.emptyBeforeName}
            <BidiLearnerName learnerName={managedLearnerName} />
            {copy.emptyAfterName}
          </p>
          <ActionButton
            disabled={busy}
            fullWidth
            onClick={onEnable}
            type="button"
          >
            {mutation === "enable" ? (
              copy.enabling
            ) : (
              <>
                {copy.enableBeforeName}
                <BidiLearnerName learnerName={managedLearnerName} />
                {copy.enableAfterName}
              </>
            )}
          </ActionButton>
        </Card>
      ) : null}

      {consentState === "revoking" || phase === "cleanup-required" ? (
        <Card className="grid gap-5 p-5 text-center sm:p-7">
          <div className="grid gap-2">
            <StateHeading
              className="m-0 text-2xl leading-tight text-brand-navy"
              ref={stateHeadingRef}
              tabIndex={-1}
            >
              {copy.cleanupTitle}
            </StateHeading>
            <p
              className="m-0 min-w-0 font-bold leading-relaxed text-slate-600 [overflow-wrap:anywhere]"
            >
              {copy.cleanupBeforeName}
              <BidiLearnerName learnerName={managedLearnerName} />
              {copy.cleanupAfterName}
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
              ? copy.deleting
              : copy.finishCleanup}
          </ActionButton>
        </Card>
      ) : null}

      {status ? (
        <p
          aria-atomic="true"
          aria-live="polite"
          className="m-0 text-center text-sm font-extrabold text-emerald-900"
          role="status"
        >
          {status === "enabled"
            ? copy.enabledBeforeName
            : copy.removedBeforeName}
          <BidiLearnerName learnerName={managedLearnerName} />
          {status === "enabled" ? copy.enabledAfterName : copy.removedAfterName}
        </p>
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

function TargetedGuardianDubbingSettings({
  headingLevel = 2,
  learnerProfileId,
  target,
}: {
  headingLevel?: 2 | 3;
  learnerProfileId: string;
  target: GuardianLearnerTargetState;
}) {
  const [focusRequest, setFocusRequest] = useState(0);
  const [status, setStatus] = useState<GuardianDubbingStatus | null>(null);
  const [phase, setPhase] = useState<GuardianDubbingPhase>("loading");
  const [mutation, setMutation] = useState<Mutation | null>(null);
  const [announcement, setAnnouncement] =
    useState<GuardianDubbingStatusCode>(null);
  const [operationError, setOperationError] =
    useState<GuardianDubbingErrorCode>(null);
  const [statusError, setStatusError] =
    useState<GuardianDubbingErrorCode>(null);
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
      clearOperationErrorOnSuccess = false,
    }: {
      invalidateOnFailure?: boolean;
      preserveOperationError?: boolean;
      clearOperationErrorOnSuccess?: boolean;
    } = {}) => {
      loadControllerRef.current?.abort();
      const controller = new AbortController();
      const generation = loadGenerationRef.current + 1;
      loadControllerRef.current = controller;
      loadGenerationRef.current = generation;
      setPhase("loading");
      setStatusError(null);
      if (!preserveOperationError) setOperationError(null);

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
        const nextStatus: GuardianDubbingStatus = {
          consentState,
          savedCount: statuses.reduce(
            (total, candidate) =>
              total + candidate.lines.filter(({ saved }) => saved).length,
            0,
          ),
        };
        setStatus(nextStatus);
        setPhase(consentState === "revoking" ? "cleanup-required" : "available");
        if (clearOperationErrorOnSuccess) setOperationError(null);
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
          setPhase("cleanup-required");
          return false;
        }
        if (invalidateOnFailure) {
          setStatus(null);
        }
        setPhase("available");
        setStatusError("load-failed");
        return false;
      } finally {
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
  }, [focusRequest, phase, status?.consentState]);

  async function mutate(
    kind: Mutation,
    operation: (options: { signal: AbortSignal }) => Promise<void>,
  ) {
    if (mutationRef.current !== null || phase === "loading") return;
    mutationRef.current = kind;
    setMutation(kind);
    setOperationError(null);
    setAnnouncement(null);
    const controller = new AbortController();
    mutationControllerRef.current = controller;
    let failure: GuardianDubbingErrorCode = null;
    try {
      await operation({ signal: controller.signal });
    } catch {
      if (!controller.signal.aborted) {
        failure = "change-failed";
      }
    }

    if (mountedRef.current && !controller.signal.aborted) {
      if (failure !== null) setOperationError(failure);
      const refreshed = await refresh({
        invalidateOnFailure: true,
        preserveOperationError: failure !== null,
      });
      if (failure === null && refreshed) {
        setAnnouncement(kind === "enable" ? "enabled" : "removed");
      }
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
      phase !== "cleanup-required" &&
      status?.consentState !== "granted" &&
      status?.consentState !== "revoking"
    ) {
      return;
    }
    void mutate("delete", (options) =>
      deleteAllDubs({ ...options, learnerProfileId }),
    );
  }

  function enable() {
    if (phase !== "available" || status?.consentState !== "not_granted") {
      return;
    }
    void mutate("enable", (options) =>
      grantDubConsent({ ...options, learnerProfileId }),
    );
  }

  return (
    <GuardianDubbingSettingsContent
      canRetryStatus={statusError !== null}
      consentState={status?.consentState ?? null}
      error={operationError || statusError}
      headingLevel={headingLevel}
      mutation={mutation}
      onDelete={remove}
      onEnable={enable}
      onRetry={() =>
        void refresh({
          clearOperationErrorOnSuccess: true,
          preserveOperationError: true,
        })
      }
      phase={phase}
      savedCount={status?.savedCount ?? 0}
      stateHeadingRef={stateHeadingRef}
      status={announcement}
      target={target}
    />
  );
}

export function GuardianDubbingSettings({
  embedded = false,
  rosterRevision = 0,
}: {
  embedded?: boolean;
  rosterRevision?: number;
}) {
  const target = useGuardianLearnerTarget({
    normalizeMissingTarget: !embedded,
    rosterRevision,
  });
  const learnerProfileId =
    target.phase === "ready" &&
    target.learnerProfileId !== null &&
    target.learnerName !== null
      ? target.learnerProfileId
      : null;

  return (
    <GuardianDubbingSettingsShell embedded={embedded} target={target}>
      {learnerProfileId !== null ? (
        <TargetedGuardianDubbingSettings
          headingLevel={embedded ? 3 : 2}
          key={learnerProfileId}
          learnerProfileId={learnerProfileId}
          target={target}
        />
      ) : null}
    </GuardianDubbingSettingsShell>
  );
}
