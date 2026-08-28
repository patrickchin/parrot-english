import { ArrowLeft } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useNavigate } from "react-router";
import { BidiLearnerName, HeaderLink, RouteHeader } from "../app/AppHeader";
import { getGuardianLearnerPath, getGuardianPath } from "../app/app-routes";
import { ActionButton, Card, fieldClassName } from "../shared/ui";
import { LearnerDeleteDialog } from "./LearnerDeleteDialog";
import {
  createLearnerProfile,
  loadLearnerProfiles,
  type GuardianLearnerProfileSummary,
  type LearnerProfileRoster,
} from "./learner-profile-api";

const ADD_PENDING_PROFILE_ID = "__new-learner__";

function setupStatusLabel(
  status: GuardianLearnerProfileSummary["profileStatus"],
) {
  switch (status) {
    case "completed":
      return "Setup complete";
    case "in_progress":
      return "Setup in progress";
    default:
      return "Setup not started";
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function requireCreatedRosterProfile(
  roster: LearnerProfileRoster,
  existingProfileIds: readonly string[],
  expectedName: string,
  expectedActiveProfileId: string | null,
) {
  if (roster.activeProfileId !== expectedActiveProfileId) {
    throw new Error("The newly added learner changed learner mode.");
  }
  const existing = new Set(existingProfileIds);
  const created = roster.profiles.filter(({ id }) => !existing.has(id));
  if (created.length !== 1 || created[0].name !== expectedName) {
    throw new Error("The newly added learner could not be loaded.");
  }
  return created[0];
}

export function GuardianLearnerProfilesView({
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
  error: string;
  isLoading: boolean;
  onAdd: (name: string) => void;
  onDelete: (profile: GuardianLearnerProfileSummary) => void | Promise<void>;
  onManage: (profile: GuardianLearnerProfileSummary) => void;
  onRetry: () => void;
  pendingProfileId: string | null;
  profiles: GuardianLearnerProfileSummary[];
  statusMessage: string;
}) {
  const [preferredName, setPreferredName] = useState("");
  const [profileToDelete, setProfileToDelete] =
    useState<GuardianLearnerProfileSummary | null>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const busy = isLoading || pendingProfileId !== null;
  const rosterUnavailable = Boolean(error && profiles.length === 0);
  const controlsUnavailable = busy || rosterUnavailable;
  const canDeleteAnotherLearner =
    profiles.filter(({ deletionPending }) => !deletionPending).length > 1;

  function addLearner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = preferredName.normalize("NFKC").trim();
    if (!name || controlsUnavailable) return;
    onAdd(name);
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

      <section className="mx-auto grid w-full min-w-0 max-w-5xl gap-6">
        <header className="grid min-w-0 gap-2 text-center">
          <h1 className="m-0 text-4xl leading-none tracking-tight text-brand-ink sm:text-6xl">
            Manage learners
          </h1>
          <p className="m-0 font-bold leading-relaxed text-slate-600">
            Add, update, or remove learner profiles.
          </p>
        </header>

        <p
          aria-atomic="true"
          aria-live="polite"
          className="m-0 min-h-6 min-w-0 text-center text-sm font-extrabold text-brand-blue [overflow-wrap:anywhere]"
          role="status"
        >
          {isLoading ? "Loading learner profiles…" : statusMessage}
        </p>

        {error ? (
          <div className="grid justify-items-center gap-3 rounded-2xl bg-rose-100 px-4 py-3 text-center">
            <p className="m-0 font-extrabold text-red-900" role="alert">
              {error}
            </p>
            {!profiles.length && !busy ? (
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

        {profiles.length ? (
          <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2">
            {profiles.map((profile) => {
              const isPending = profile.id === pendingProfileId;
              const finalLearner =
                !profile.deletionPending && !canDeleteAnotherLearner;
              return (
                <li className="min-w-0" key={profile.id}>
                  <Card className="grid h-full min-w-0 content-start gap-4 p-5 sm:p-6">
                    <div className="grid gap-1">
                      <h3 className="m-0 min-w-0 text-2xl leading-tight text-brand-navy [overflow-wrap:anywhere]">
                        <BidiLearnerName learnerName={profile.name} />
                      </h3>
                      <p className="m-0 text-sm font-bold text-slate-600">
                        {profile.age === null ? null : `Age ${profile.age} · `}
                        {setupStatusLabel(profile.profileStatus)}
                      </p>
                      {finalLearner ? (
                        <p className="m-0 min-w-0 whitespace-normal text-sm font-bold leading-relaxed text-slate-600 [overflow-wrap:anywhere]">
                          Add another learner before deleting{" "}
                          <BidiLearnerName learnerName={profile.name} />.
                        </p>
                      ) : null}
                    </div>

                    <div className="mt-auto grid gap-3 min-[420px]:grid-cols-2">
                      {profile.deletionPending ? (
                        <ActionButton
                          aria-label={`Finish deleting ${profile.name}`}
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
                            {isPending ? "Deleting " : "Finish deleting "}
                            <BidiLearnerName learnerName={profile.name} />
                            {isPending ? "…" : null}
                          </span>
                        </ActionButton>
                      ) : (
                        <>
                          <ActionButton
                            aria-label={`Edit ${profile.name}'s profile`}
                            disabled={controlsUnavailable}
                            onClick={() => onManage(profile)}
                            size="compact"
                            type="button"
                            variant="surface"
                          >
                            Edit profile
                          </ActionButton>
                          <ActionButton
                            aria-label={`Delete ${profile.name}`}
                            disabled={controlsUnavailable || finalLearner}
                            onClick={(event) => {
                              deleteTriggerRef.current = event.currentTarget;
                              setProfileToDelete(profile);
                            }}
                            size="compact"
                            type="button"
                            variant="rose"
                          >
                            Delete
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
            <h2 className="m-0 text-2xl leading-tight text-brand-navy">
              Add learner
            </h2>
            <p className="m-0 text-sm font-bold text-slate-600">
              Use the name they like to be called. You can add their other
              details next.
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
                Preferred name
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
                ? "Adding learner…"
                : "Add learner"}
            </ActionButton>
          </form>
        </Card>
      </section>

      {profileToDelete ? (
        <LearnerDeleteDialog
          onClose={() => setProfileToDelete(null)}
          onDelete={onDelete}
          profile={profileToDelete}
          returnFocusRef={deleteTriggerRef}
        />
      ) : null}
    </main>
  );
}

export function GuardianLearnerProfiles({
  onDelete = () => {},
}: {
  onDelete?: (profile: GuardianLearnerProfileSummary) => void | Promise<void>;
}) {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<GuardianLearnerProfileSummary[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const activeProfileIdRef = useRef<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const operationRef = useRef(0);

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

  const loadRoster = useCallback(async () => {
    const operation = beginOperation();
    setError("");
    setStatusMessage("");
    setIsLoading(true);
    setPendingProfileId(null);
    try {
      const result = await loadLearnerProfiles({
        signal: operation.controller.signal,
      });
      if (operation.isCurrent()) applyRoster(result);
    } catch (caughtError) {
      if (!operation.isCurrent() || isAbortError(caughtError)) return;
      setError(
        errorMessage(caughtError, "Learner profiles could not be loaded."),
      );
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

  async function reconcileRosterAfterMutation(
    operation: ReturnType<typeof beginOperation>,
  ) {
    try {
      const roster = await loadLearnerProfiles({
        signal: operation.controller.signal,
      });
      if (operation.isCurrent()) applyRoster(roster);
    } catch {
      if (operation.isCurrent()) setProfiles([]);
    }
  }

  async function addProfile(name: string) {
    const operation = beginOperation();
    const existingProfileIds = profiles.map(({ id }) => id);
    const previousActiveProfileId = activeProfileIdRef.current;
    setError("");
    setStatusMessage("");
    setPendingProfileId(ADD_PENDING_PROFILE_ID);
    try {
      const result = await createLearnerProfile(name, {
        activate: false,
        signal: operation.controller.signal,
      });
      if (!operation.isCurrent()) return;
      const created = requireCreatedRosterProfile(
        result,
        existingProfileIds,
        name,
        previousActiveProfileId,
      );
      applyRoster(result);
      navigate(getGuardianLearnerPath(created.id));
    } catch (caughtError) {
      if (!operation.isCurrent() || isAbortError(caughtError)) return;
      const message = errorMessage(
        caughtError,
        "The learner could not be added.",
      );
      await reconcileRosterAfterMutation(operation);
      if (!operation.isCurrent()) return;
      setError(message);
    } finally {
      if (operation.isCurrent()) setPendingProfileId(null);
      if (controllerRef.current === operation.controller) {
        controllerRef.current = null;
      }
    }
  }

  return (
    <GuardianLearnerProfilesView
      error={error}
      isLoading={isLoading}
      onAdd={(name) => void addProfile(name)}
      onDelete={onDelete}
      onManage={(profile) => navigate(getGuardianLearnerPath(profile.id))}
      onRetry={() => void loadRoster()}
      pendingProfileId={pendingProfileId}
      profiles={profiles}
      statusMessage={statusMessage}
    />
  );
}
