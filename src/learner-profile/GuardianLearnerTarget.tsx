import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useGuardianLanguage } from "../i18n/guardian-language";
import { ActionButton, ActionLink, cx } from "../shared/ui";
import {
  loadLearnerProfiles,
  type GuardianLearnerProfileSummary,
  type LearnerProfileRoster,
} from "./learner-profile-api";

const TARGET_QUERY_KEY = "learnerProfileId";

type TargetPhase = "empty" | "error" | "invalid" | "loading" | "ready";
export type GuardianLearnerTargetFailure = "load-failed" | null;

export type GuardianLearnerTargetState = {
  activeProfileId: string | null;
  failure: GuardianLearnerTargetFailure;
  learnerName: string | null;
  learnerProfileId: string | null;
  phase: TargetPhase;
  profiles: GuardianLearnerProfileSummary[];
  retry: () => void;
  select: (profileId: string) => void;
};

type RosterState =
  | { phase: "loading" }
  | { failure: GuardianLearnerTargetFailure; phase: "error" }
  | { phase: "ready"; roster: LearnerProfileRoster };

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function useGuardianLearnerTarget(): GuardianLearnerTargetState {
  const location = useLocation();
  const navigate = useNavigate();
  const [reloadKey, setReloadKey] = useState(0);
  const [rosterState, setRosterState] = useState<RosterState>({
    phase: "loading",
  });

  useEffect(() => {
    const controller = new AbortController();
    setRosterState({ phase: "loading" });
    void loadLearnerProfiles({ signal: controller.signal }).then(
      (roster) => {
        if (!controller.signal.aborted) {
          setRosterState({ phase: "ready", roster });
        }
      },
      (error) => {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setRosterState({ failure: "load-failed", phase: "error" });
        }
      },
    );
    return () => controller.abort();
  }, [reloadKey]);

  const resolution = useMemo(() => {
    if (rosterState.phase !== "ready") return null;
    const { activeProfileId } = rosterState.roster;
    const profiles = rosterState.roster.profiles.filter(
      ({ deletionPending }) => !deletionPending,
    );
    if (profiles.length === 0) {
      return { activeProfileId, phase: "empty" as const, profiles };
    }

    const values = new URLSearchParams(location.search).getAll(
      TARGET_QUERY_KEY,
    );
    const defaultProfile =
      profiles.find(({ id }) => id === activeProfileId) ?? profiles[0];
    const selectedProfile =
      values.length === 0
        ? defaultProfile
        : values.length === 1 && values[0].trim()
          ? profiles.find(({ id }) => id === values[0])
          : undefined;
    if (!selectedProfile) {
      return { activeProfileId, phase: "invalid" as const, profiles };
    }
    return {
      activeProfileId,
      needsNormalization: values.length === 0,
      phase: "ready" as const,
      profiles,
      selectedProfile,
    };
  }, [location.search, rosterState]);

  useEffect(() => {
    if (resolution?.phase !== "ready" || !resolution.needsNormalization) {
      return;
    }
    const search = new URLSearchParams(location.search);
    search.set(TARGET_QUERY_KEY, resolution.selectedProfile.id);
    void navigate(
      { ...location, search: `?${search.toString()}` },
      { replace: true },
    );
  }, [location, navigate, resolution]);

  const select = useCallback(
    (profileId: string) => {
      if (
        rosterState.phase !== "ready" ||
        !rosterState.roster.profiles.some(
          ({ deletionPending, id }) => !deletionPending && id === profileId,
        )
      ) {
        return;
      }
      const search = new URLSearchParams(location.search);
      search.set(TARGET_QUERY_KEY, profileId);
      void navigate({ ...location, search: `?${search.toString()}` });
    },
    [location, navigate, rosterState],
  );

  if (rosterState.phase === "loading") {
    return {
      activeProfileId: null,
      failure: null,
      learnerName: null,
      learnerProfileId: null,
      phase: "loading",
      profiles: [],
      retry: () => setReloadKey((key) => key + 1),
      select,
    };
  }
  if (rosterState.phase === "error") {
    return {
      activeProfileId: null,
      failure: rosterState.failure,
      learnerName: null,
      learnerProfileId: null,
      phase: "error",
      profiles: [],
      retry: () => setReloadKey((key) => key + 1),
      select,
    };
  }

  const readyResolution = resolution!;
  return {
    activeProfileId: readyResolution.activeProfileId,
    failure: null,
    learnerName:
      readyResolution.phase === "ready"
        ? readyResolution.selectedProfile.name
        : null,
    learnerProfileId:
      readyResolution.phase === "ready"
        ? readyResolution.selectedProfile.id
        : null,
    phase: readyResolution.phase,
    profiles: readyResolution.profiles,
    retry: () => setReloadKey((key) => key + 1),
    select,
  };
}

export function GuardianLearnerTarget({
  state,
}: {
  state: GuardianLearnerTargetState;
}) {
  const { messages } = useGuardianLanguage();

  if (state.phase === "loading") {
    return (
      <p
        aria-live="polite"
        className="m-0 text-center font-extrabold text-brand-blue"
        role="status"
      >
        {messages.learnerTarget.loading}
      </p>
    );
  }

  if (state.phase === "error") {
    return (
      <section className="grid w-full justify-items-center gap-3 rounded-2xl bg-rose-100 px-4 py-3 text-center">
        <p className="m-0 font-extrabold text-red-900" role="alert">
          {messages.learnerTarget.loadFailed}
        </p>
        <ActionButton
          onClick={state.retry}
          size="compact"
          type="button"
          variant="surface"
        >
          {messages.common.retry}
        </ActionButton>
      </section>
    );
  }

  if (state.phase === "empty") {
    return (
      <section className="grid w-full justify-items-center gap-3 rounded-2xl bg-sky-50 px-4 py-3 text-center">
        <p className="m-0 font-extrabold text-brand-navy">
          {messages.learnerTarget.noLearners}
        </p>
        <ActionLink size="compact" to="/guardian/learners">
          {messages.learnerTarget.addLearner}
        </ActionLink>
      </section>
    );
  }

  if (state.phase === "invalid") {
    return (
      <section className="grid w-full justify-items-center gap-3 rounded-2xl bg-rose-100 px-4 py-3 text-center">
        <p className="m-0 font-extrabold text-red-900" role="alert">
          {messages.learnerTarget.invalidTarget}
        </p>
        <ActionLink size="compact" to="/guardian/learners" variant="surface">
          {messages.learnerTarget.manageLearners}
        </ActionLink>
      </section>
    );
  }

  return (
    <section className="grid w-full min-w-0 gap-3">
      <div
        aria-label={messages.learnerTarget.chooserLabel}
        className="flex w-full min-w-0 flex-wrap gap-2"
        role="group"
      >
        {state.profiles.map((profile) => {
          const active = profile.id === state.activeProfileId;
          const selected = profile.id === state.learnerProfileId;
          return (
            <div
              className="flex min-w-0 max-w-full grow basis-40 flex-wrap items-center gap-1.5 rounded-2xl bg-white/65 p-1.5"
              key={profile.id}
            >
              <ActionButton
                aria-label={profile.name}
                aria-pressed={selected}
                className={cx(
                  "min-h-12 min-w-0 max-w-full grow whitespace-normal px-3 py-2 leading-tight [overflow-wrap:anywhere]",
                  selected && "ring-4 ring-brand-blue",
                )}
                elevation="flat"
                frame="soft"
                onClick={() => state.select(profile.id)}
                size="none"
                type="button"
                variant={selected ? "navy" : "surface"}
              >
                {profile.name}
              </ActionButton>
              {active ? (
                <span className="shrink-0 rounded-full bg-brand-green px-2 py-1 text-xs font-black leading-tight text-white">
                  {messages.learnerTarget.learnerMode}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <p
        aria-atomic="true"
        aria-live="polite"
        className="m-0 min-w-0 text-center font-extrabold text-brand-blue [overflow-wrap:anywhere]"
        role="status"
      >
        {messages.learnerTarget.editingFor(state.learnerName ?? "")}
      </p>
    </section>
  );
}
