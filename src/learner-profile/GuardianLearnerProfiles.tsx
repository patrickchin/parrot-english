import { ArrowLeft } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type Ref,
} from "react";
import { useNavigate } from "react-router";
import { BidiLearnerName, HeaderLink, RouteHeader } from "../app/AppHeader";
import {
  getGuardianLearnersPath,
  getGuardianPath,
  getProfilePath,
} from "../app/app-routes";
import { ActionButton, Card, fieldClassName } from "../shared/ui";
import { useLearnerSelection } from "./LearnerProfileContext";
import {
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

function requireActiveRosterProfile(
  roster: LearnerProfileRoster,
  expectedProfileId?: string,
) {
  const activeProfileId = roster.activeProfileId;
  if (
    typeof activeProfileId !== "string" ||
    !activeProfileId.trim() ||
    (expectedProfileId !== undefined && activeProfileId !== expectedProfileId)
  ) {
    throw new Error("The selected learner could not be loaded.");
  }
  const profile = roster.profiles.find(
    ({ id, name }) => id === activeProfileId && Boolean(name.trim()),
  );
  if (!profile) {
    throw new Error("The selected learner could not be loaded.");
  }
  return profile;
}

export function GuardianLearnerProfilesView({
  activeHeadingRef,
  activeProfileId,
  error,
  isLoading,
  onAdd,
  onManage,
  onRetry,
  onSelect,
  pendingProfileId,
  profiles,
  statusMessage,
}: {
  activeHeadingRef?: Ref<HTMLHeadingElement>;
  activeProfileId: string | null;
  error: string;
  isLoading: boolean;
  onAdd: (name: string) => void;
  onManage: (profile: GuardianLearnerProfileSummary) => void;
  onRetry: () => void;
  onSelect: (profile: GuardianLearnerProfileSummary) => void;
  pendingProfileId: string | null;
  profiles: GuardianLearnerProfileSummary[];
  statusMessage: string;
}) {
  const [preferredName, setPreferredName] = useState("");
  const activeProfile =
    profiles.find(({ id }) => id === activeProfileId) ?? null;
  const busy = isLoading || pendingProfileId !== null;
  const activeProfileMissing = activeProfileId !== null && !activeProfile;
  const rosterUnavailable = Boolean(error && profiles.length === 0);
  const controlsUnavailable = busy || rosterUnavailable || activeProfileMissing;

  function addLearner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = preferredName.normalize("NFKC").trim();
    if (!name || controlsUnavailable) return;
    onAdd(name);
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

      <section className="mx-auto grid w-full min-w-0 max-w-5xl gap-6">
        <header className="grid min-w-0 gap-2 text-center">
          <h1 className="m-0 text-4xl leading-none tracking-tight text-brand-ink sm:text-6xl">
            Learner profiles
          </h1>
          <h2
            className="m-0 min-w-0 text-base font-black text-brand-blue [overflow-wrap:anywhere] sm:text-lg"
            dir="ltr"
            ref={activeHeadingRef}
            tabIndex={-1}
          >
            {activeProfile ? (
              <>
                Managing <BidiLearnerName learnerName={activeProfile.name} />
              </>
            ) : (
              "Choose a learner"
            )}
          </h2>
          <p className="m-0 font-bold leading-relaxed text-slate-600">
            Choose who is using Parrot English, or add another learner.
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
            {(!profiles.length || activeProfileMissing) && !busy ? (
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
              const isActive = profile.id === activeProfileId;
              const isPending = profile.id === pendingProfileId;
              return (
                <li className="min-w-0" key={profile.id}>
                  <Card className="grid h-full min-w-0 content-start gap-4 p-5 sm:p-6">
                    <div className="grid gap-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 className="m-0 min-w-0 text-2xl leading-tight text-brand-navy [overflow-wrap:anywhere]">
                          <BidiLearnerName learnerName={profile.name} />
                        </h3>
                        {isActive ? (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-900">
                            Current learner
                          </span>
                        ) : null}
                      </div>
                      <p className="m-0 text-sm font-bold text-slate-600">
                        {profile.age === null ? null : `Age ${profile.age} · `}
                        {setupStatusLabel(profile.profileStatus)}
                      </p>
                    </div>

                    <div className="mt-auto grid gap-3 min-[420px]:grid-cols-2">
                      {!isActive ? (
                        <ActionButton
                          aria-disabled={controlsUnavailable ? true : undefined}
                          aria-label={`Use ${profile.name}`}
                          onClick={(event) => {
                            if (controlsUnavailable) return;
                            event.currentTarget.focus();
                            onSelect(profile);
                          }}
                          size="compact"
                          type="button"
                          variant="success"
                        >
                          {isPending ? "Selecting…" : "Use this learner"}
                        </ActionButton>
                      ) : (
                        <span aria-hidden="true" />
                      )}
                      <ActionButton
                        aria-disabled={controlsUnavailable ? true : undefined}
                        aria-label={`Manage ${profile.name}'s details`}
                        onClick={(event) => {
                          if (controlsUnavailable) return;
                          event.currentTarget.focus();
                          onManage(profile);
                        }}
                        size="compact"
                        type="button"
                        variant="surface"
                      >
                        Manage details
                      </ActionButton>
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
              aria-disabled={controlsUnavailable ? true : undefined}
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
    </main>
  );
}

export function GuardianLearnerProfiles() {
  const navigate = useNavigate();
  const {
    activeProfileId: contextActiveProfileId,
    createAndSelectLearner,
    selectLearner,
  } = useLearnerSelection();
  const [activeProfileId, setActiveProfileId] = useState<string | null>(
    contextActiveProfileId,
  );
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<GuardianLearnerProfileSummary[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const activeHeadingRef = useRef<HTMLHeadingElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const operationRef = useRef(0);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const contextRosterReloadRef = useRef("");

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
    setProfiles(nextRoster.profiles);
    setActiveProfileId(nextRoster.activeProfileId);
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
      if (!operation.isCurrent()) return;
      applyRoster(result);
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

  useEffect(() => {
    if (contextActiveProfileId) {
      setActiveProfileId(contextActiveProfileId);
    }
  }, [contextActiveProfileId]);

  useEffect(() => {
    if (
      !contextActiveProfileId ||
      pendingProfileId !== null ||
      isLoading ||
      profiles.length === 0 ||
      profiles.some(({ id }) => id === contextActiveProfileId)
    ) {
      if (
        contextActiveProfileId &&
        profiles.some(({ id }) => id === contextActiveProfileId)
      ) {
        contextRosterReloadRef.current = "";
      }
      return;
    }
    if (contextRosterReloadRef.current === contextActiveProfileId) return;
    contextRosterReloadRef.current = contextActiveProfileId;
    void loadRoster();
  }, [
    contextActiveProfileId,
    isLoading,
    loadRoster,
    pendingProfileId,
    profiles,
  ]);

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

  async function selectProfile(
    profile: GuardianLearnerProfileSummary,
    navigateToDetails: boolean,
  ) {
    if (profile.id === activeProfileId) {
      if (navigateToDetails) {
        navigate(getProfilePath(getGuardianLearnersPath()));
      }
      return;
    }

    const operation = beginOperation();
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setError("");
    setStatusMessage("");
    setPendingProfileId(profile.id);
    try {
      const result = await selectLearner(profile.id);
      if (!operation.isCurrent()) return;
      const selectedProfile = requireActiveRosterProfile(result, profile.id);
      applyRoster(result);
      setStatusMessage(`Now managing ${selectedProfile.name}`);
      if (navigateToDetails) {
        navigate(getProfilePath(getGuardianLearnersPath()));
      } else {
        requestAnimationFrame(() => activeHeadingRef.current?.focus());
      }
    } catch (caughtError) {
      if (!operation.isCurrent() || isAbortError(caughtError)) return;
      const message = errorMessage(
        caughtError,
        `Could not select ${profile.name}.`,
      );
      await reconcileRosterAfterMutation(operation);
      if (!operation.isCurrent()) return;
      setError(message);
      requestAnimationFrame(() => {
        if (restoreFocusRef.current?.isConnected) {
          restoreFocusRef.current.focus();
        }
      });
    } finally {
      if (operation.isCurrent()) setPendingProfileId(null);
      if (controllerRef.current === operation.controller) {
        controllerRef.current = null;
      }
    }
  }

  async function addProfile(name: string) {
    const operation = beginOperation();
    setError("");
    setStatusMessage("");
    setPendingProfileId(ADD_PENDING_PROFILE_ID);
    try {
      const result = await createAndSelectLearner(
        name,
        profiles.map(({ id }) => id),
      );
      if (!operation.isCurrent()) return;
      requireActiveRosterProfile(result);
      applyRoster(result);
      navigate(getProfilePath(getGuardianLearnersPath()));
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
      activeHeadingRef={activeHeadingRef}
      activeProfileId={activeProfileId}
      error={error}
      isLoading={isLoading}
      onAdd={(name) => void addProfile(name)}
      onManage={(profile) => void selectProfile(profile, true)}
      onRetry={() => void loadRoster()}
      onSelect={(profile) => void selectProfile(profile, false)}
      pendingProfileId={pendingProfileId}
      profiles={profiles}
      statusMessage={statusMessage}
    />
  );
}
