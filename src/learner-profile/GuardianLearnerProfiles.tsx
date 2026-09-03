import { ArrowLeft } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router";
import { BidiLearnerName, HeaderLink, RouteHeader } from "../app/AppHeader";
import { getGuardianLearnerPath, getGuardianPath } from "../app/app-routes";
import { useGuardianLanguage } from "../i18n/guardian-language";
import { ActionButton, Card, fieldClassName } from "../shared/ui";
import { LearnerDeleteDialog } from "./LearnerDeleteDialog";
import { useLearnerSelection } from "./LearnerProfileContext";
import {
  createLearnerProfile,
  loadLearnerProfiles,
  type GuardianLearnerProfileSummary,
  type LearnerProfileCreationResult,
  type LearnerProfileRoster,
} from "./learner-profile-api";

const ADD_PENDING_PROFILE_ID = "__new-learner__";

export type LearnerRosterErrorCode =
  | "load-failed"
  | "add-failed"
  | "last-learner"
  | "learner-busy"
  | "cleanup-pending"
  | "deletion-uncertain"
  | "delete-failed";

function GuardianLearnerProfilesShell({
  children,
  embedded,
}: {
  children: ReactNode;
  embedded: boolean;
}) {
  const { messages } = useGuardianLanguage();

  if (embedded) {
    return (
      <section
        aria-labelledby="manage-learners-heading"
        className="grid min-w-0 scroll-mt-24 gap-6"
        id="learner-profiles"
      >
        <header className="grid min-w-0 gap-2 text-center">
          <h2
            className="m-0 text-3xl leading-tight text-brand-navy sm:text-4xl"
            id="manage-learners-heading"
          >
            {messages.learners.roster.title}
          </h2>
        </header>
        {children}
      </section>
    );
  }

  return (
    <main className="h-dvh w-full overflow-x-hidden overflow-y-auto bg-placeholder px-4 pb-12 pt-28 sm:px-6 md:px-10 md:pt-32">
      <RouteHeader ariaLabel={messages.common.pageNavigation}>
        <HeaderLink
          aria-label={messages.learners.roster.backToDashboardAria}
          icon={<ArrowLeft />}
          to={getGuardianPath()}
        >
          {messages.learners.roster.backToDashboard}
        </HeaderLink>
      </RouteHeader>

      <section className="mx-auto grid w-full min-w-0 max-w-5xl gap-6">
        <header className="grid min-w-0 gap-2 text-center">
          <h1 className="m-0 text-4xl leading-none tracking-tight text-brand-ink sm:text-6xl">
            {messages.learners.roster.title}
          </h1>
        </header>
        {children}
      </section>
    </main>
  );
}

export type LearnerRosterStatus =
  | { kind: "deleted"; learnerName: string }
  | null;

function learnerDeletionErrorCode(error: unknown) {
  return error !== null &&
    typeof error === "object" &&
    typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : null;
}

function learnerDeletionError(error: unknown): LearnerRosterErrorCode {
  switch (learnerDeletionErrorCode(error)) {
    case "last_learner":
      return "last-learner";
    case "learner_busy":
      return "learner-busy";
    case "learner_deletion_pending":
      return "cleanup-pending";
    case "learner_deletion_uncertain":
      return "deletion-uncertain";
    default:
      return "delete-failed";
  }
}

function learnerDeletionRoster(error: unknown) {
  if (error === null || typeof error !== "object") return null;
  const roster = (error as { roster?: unknown }).roster;
  return roster !== null &&
    typeof roster === "object" &&
    Array.isArray((roster as Partial<LearnerProfileRoster>).profiles)
    ? (roster as LearnerProfileRoster)
    : null;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function requireCreatedRosterProfile(
  roster: LearnerProfileCreationResult,
  expectedName: string,
  expectedActiveProfileId: string | null,
) {
  if (roster.activeProfileId !== expectedActiveProfileId) {
    throw new Error("The newly added learner changed learner mode.");
  }
  const created = roster.profiles.find(
    ({ id }) => id === roster.createdProfileId,
  );
  if (!created || created.name !== expectedName) {
    throw new Error("The newly added learner could not be loaded.");
  }
  return created;
}

export function GuardianLearnerProfilesView({
  embedded = false,
  error,
  isLoading,
  onAdd,
  onDelete,
  onManage,
  onRetry,
  pendingProfileId,
  profiles,
  statusMessage,
}: {
  embedded?: boolean;
  error: LearnerRosterErrorCode | null;
  isLoading: boolean;
  onAdd: (name: string) => void;
  onDelete: (
    profile: GuardianLearnerProfileSummary,
  ) => Promise<LearnerRosterErrorCode | null>;
  onManage: (profile: GuardianLearnerProfileSummary) => void;
  onRetry: () => void;
  pendingProfileId: string | null;
  profiles: GuardianLearnerProfileSummary[];
  statusMessage: LearnerRosterStatus;
}) {
  const { messages } = useGuardianLanguage();
  const [preferredName, setPreferredName] = useState("");
  const [profileToDelete, setProfileToDelete] =
    useState<GuardianLearnerProfileSummary | null>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const busy = isLoading || pendingProfileId !== null;
  const rosterUnavailable = Boolean(error && profiles.length === 0);
  const controlsUnavailable = busy || rosterUnavailable;
  const canDeleteAnotherLearner =
    profiles.filter(({ deletionPending }) => !deletionPending).length > 1;
  const ContentHeading = embedded ? "h3" : "h2";

  function addLearner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = preferredName.normalize("NFKC").trim();
    if (!name || controlsUnavailable) return;
    onAdd(name);
  }

  return (
    <GuardianLearnerProfilesShell embedded={embedded}>
      <p
        aria-atomic="true"
        aria-live="polite"
        className="m-0 min-h-6 min-w-0 text-center text-sm font-extrabold text-brand-blue [overflow-wrap:anywhere]"
        role="status"
      >
        {isLoading
          ? messages.learners.roster.loading
          : statusMessage?.kind === "deleted"
            ? (
              <>
                {messages.learners.roster.deletedStatusBefore}
                <BidiLearnerName learnerName={statusMessage.learnerName} />
                {messages.learners.roster.deletedStatusAfter}
              </>
              )
            : ""}
      </p>

      {error ? (
        <div className="grid justify-items-center gap-3 rounded-2xl bg-rose-100 px-4 py-3 text-center">
          <p className="m-0 font-extrabold text-red-900" role="alert">
            {messages.learners.roster.errors[error]}
          </p>
          {!profiles.length && !busy ? (
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

      {profiles.length ? (
        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2">
          {profiles.map((profile) => {
            const isolatedName = `\u2068${profile.name}\u2069`;
            const isPending = profile.id === pendingProfileId;
            const finalLearner =
              !profile.deletionPending && !canDeleteAnotherLearner;
            return (
              <li className="min-w-0" key={profile.id}>
                <Card className="grid h-full min-w-0 content-start gap-4 p-5 sm:p-6">
                  <div className="grid gap-1">
                    <ContentHeading className="m-0 min-w-0 text-2xl leading-tight text-brand-navy [overflow-wrap:anywhere]">
                      <BidiLearnerName learnerName={profile.name} />
                    </ContentHeading>
                    <p className="m-0 text-sm font-bold text-slate-600">
                      {profile.age === null
                        ? messages.learners.roster.ageMissing
                        : messages.learners.roster.age(profile.age)}{" "}
                      ·{" "}
                      {
                        messages.learners.roster.setupStatuses[
                          profile.profileStatus
                        ]
                      }
                    </p>
                    {finalLearner ? (
                      <p className="m-0 min-w-0 whitespace-normal text-sm font-bold leading-relaxed text-slate-600 [overflow-wrap:anywhere]">
                        {messages.learners.roster.lastLearnerBefore}
                        <BidiLearnerName learnerName={profile.name} />
                        {messages.learners.roster.lastLearnerAfter}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-auto grid gap-3 min-[420px]:grid-cols-2">
                    {profile.deletionPending ? (
                      <ActionButton
                        aria-label={messages.learners.roster.finishDeletingAria(
                          isolatedName,
                        )}
                        disabled={controlsUnavailable}
                        onClick={(event) => {
                          deleteTriggerRef.current = event.currentTarget;
                          setProfileToDelete(profile);
                        }}
                        size="compact"
                        type="button"
                        variant="rose"
                      >
                        <span className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">
                          {isPending
                            ? messages.learners.roster.deleting
                            : messages.learners.roster.finishDeleting}
                          <BidiLearnerName learnerName={profile.name} />
                          {isPending ? "…" : null}
                        </span>
                      </ActionButton>
                    ) : (
                      <>
                        <ActionButton
                          aria-label={messages.learners.roster.editProfileAria(
                            isolatedName,
                          )}
                          disabled={controlsUnavailable}
                          onClick={() => onManage(profile)}
                          size="compact"
                          type="button"
                          variant="surface"
                        >
                          {messages.learners.roster.editProfile}
                        </ActionButton>
                        <ActionButton
                          aria-label={messages.learners.roster.deleteAria(
                            isolatedName,
                          )}
                          disabled={controlsUnavailable || finalLearner}
                          onClick={(event) => {
                            deleteTriggerRef.current = event.currentTarget;
                            setProfileToDelete(profile);
                          }}
                          size="compact"
                          type="button"
                          variant="rose"
                        >
                          {messages.learners.roster.delete}
                        </ActionButton>
                      </>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      ) : null}

      <Card className="grid gap-4 p-5 sm:p-6">
        <div className="grid gap-1">
          <ContentHeading className="m-0 text-2xl leading-tight text-brand-navy">
            {messages.learners.roster.addTitle}
          </ContentHeading>
          <p className="m-0 text-sm font-bold text-slate-600">
            {messages.learners.roster.addDescription}
          </p>
        </div>
        <form
          className="grid items-end gap-3 sm:grid-cols-[1fr_auto]"
          onSubmit={addLearner}
        >
          <div className="grid gap-2">
            <label
              className="font-ui text-sm font-black text-brand-navy"
              htmlFor="preferred-name"
            >
              {messages.learners.roster.preferredName}
            </label>
            <input
              autoComplete="off"
              className={fieldClassName()}
              disabled={controlsUnavailable}
              id="preferred-name"
              maxLength={120}
              onChange={(event) =>
                setPreferredName(event.currentTarget.value)
              }
              required
              type="text"
              value={preferredName}
            />
          </div>
          <ActionButton
            disabled={controlsUnavailable}
            fullWidth
            type="submit"
            variant="navy"
          >
            {pendingProfileId === ADD_PENDING_PROFILE_ID
              ? messages.learners.roster.adding
              : messages.learners.roster.add}
          </ActionButton>
        </form>
      </Card>
      {profileToDelete ? (
        <LearnerDeleteDialog
          onClose={() => setProfileToDelete(null)}
          onDelete={onDelete}
          profile={profileToDelete}
          returnFocusRef={deleteTriggerRef}
        />
      ) : null}
    </GuardianLearnerProfilesShell>
  );
}

export function GuardianLearnerProfiles({
  embedded = false,
  onRosterChanged,
}: {
  embedded?: boolean;
  onRosterChanged?: () => void;
}) {
  const navigate = useNavigate();
  const { deleteLearner, rosterRevision } = useLearnerSelection();
  const [error, setError] = useState<LearnerRosterErrorCode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<GuardianLearnerProfileSummary[]>([]);
  const [statusMessage, setStatusMessage] =
    useState<LearnerRosterStatus>(null);
  const activeProfileIdRef = useRef<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const operationRef = useRef(0);
  const rosterRevisionRef = useRef(rosterRevision);
  const deletedStatusRevisionRef = useRef<number | null>(null);

  const beginOperation = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    controllerRef.current = controller;
    return {
      controller,
      isCurrent: () =>
        mountedRef.current &&
        !controller.signal.aborted &&
        controllerRef.current === controller &&
        operationRef.current === operation,
    };
  }, []);

  const applyRoster = useCallback((nextRoster: LearnerProfileRoster) => {
    activeProfileIdRef.current = nextRoster.activeProfileId;
    setProfiles(nextRoster.profiles);
  }, []);

  const loadRoster = useCallback(async (preserveStatus = false) => {
    const operation = beginOperation();
    setError(null);
    if (!preserveStatus) {
      deletedStatusRevisionRef.current = null;
      setStatusMessage(null);
    }
    setIsLoading(true);
    setPendingProfileId(null);
    try {
      const result = await loadLearnerProfiles({
        signal: operation.controller.signal,
      });
      if (operation.isCurrent()) applyRoster(result);
    } catch (caughtError) {
      if (!operation.isCurrent() || isAbortError(caughtError)) return;
      setError("load-failed");
    } finally {
      if (operation.isCurrent()) setIsLoading(false);
      if (controllerRef.current === operation.controller) {
        controllerRef.current = null;
      }
    }
  }, [applyRoster, beginOperation]);

  useEffect(() => {
    mountedRef.current = true;
    void loadRoster();
    return () => {
      mountedRef.current = false;
      operationRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [loadRoster]);

  useEffect(() => {
    if (rosterRevisionRef.current === rosterRevision) return;
    rosterRevisionRef.current = rosterRevision;
    const preserveStatus = deletedStatusRevisionRef.current === rosterRevision;
    deletedStatusRevisionRef.current = null;
    void loadRoster(preserveStatus);
  }, [loadRoster, rosterRevision]);

  async function reconcileRosterAfterMutation(
    operation: ReturnType<typeof beginOperation>,
  ) {
    try {
      const roster = await loadLearnerProfiles({
        signal: operation.controller.signal,
      });
      if (!operation.isCurrent()) return false;
      applyRoster(roster);
      return true;
    } catch {
      // Keep the last authoritative roster available for a safe retry.
      return false;
    }
  }

  async function addProfile(name: string) {
    const operation = beginOperation();
    const previousActiveProfileId = activeProfileIdRef.current;
    let rosterChanged = false;
    setError(null);
    deletedStatusRevisionRef.current = null;
    setStatusMessage(null);
    setPendingProfileId(ADD_PENDING_PROFILE_ID);
    try {
      const result = await createLearnerProfile(name, {
        signal: operation.controller.signal,
      });
      if (!operation.isCurrent()) return;
      const created = requireCreatedRosterProfile(
        result,
        name,
        previousActiveProfileId,
      );
      applyRoster(result);
      rosterChanged = true;
      navigate(getGuardianLearnerPath(created.id));
    } catch (caughtError) {
      if (!operation.isCurrent() || isAbortError(caughtError)) return;
      rosterChanged = await reconcileRosterAfterMutation(operation);
      if (!operation.isCurrent()) return;
      setError("add-failed");
    } finally {
      if (operation.isCurrent()) setPendingProfileId(null);
      if (controllerRef.current === operation.controller) {
        controllerRef.current = null;
      }
      if (rosterChanged) onRosterChanged?.();
    }
  }

  async function deleteProfile(
    profile: GuardianLearnerProfileSummary,
  ): Promise<LearnerRosterErrorCode | null> {
    const operation = beginOperation();
    setError(null);
    deletedStatusRevisionRef.current = rosterRevisionRef.current + 1;
    setStatusMessage(null);
    setPendingProfileId(profile.id);
    try {
      const result = await deleteLearner(profile.id);
      if (!operation.isCurrent()) return "delete-failed";
      applyRoster(result);
      setStatusMessage({ kind: "deleted", learnerName: profile.name });
      return null;
    } catch (caughtError) {
      deletedStatusRevisionRef.current = null;
      if (operation.isCurrent()) {
        const reconciledRoster = learnerDeletionRoster(caughtError);
        if (reconciledRoster) applyRoster(reconciledRoster);
      }
      return learnerDeletionError(caughtError);
    } finally {
      if (operation.isCurrent()) setPendingProfileId(null);
      if (controllerRef.current === operation.controller) {
        controllerRef.current = null;
      }
    }
  }

  return (
    <GuardianLearnerProfilesView
      embedded={embedded}
      error={error}
      isLoading={isLoading}
      onAdd={(name) => void addProfile(name)}
      onDelete={deleteProfile}
      onManage={(profile) => navigate(getGuardianLearnerPath(profile.id))}
      onRetry={() => void loadRoster()}
      pendingProfileId={pendingProfileId}
      profiles={profiles}
      statusMessage={statusMessage}
    />
  );
}
