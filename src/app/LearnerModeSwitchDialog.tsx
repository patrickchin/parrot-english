import {
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useNavigate } from "react-router";
import { useGuardianAccess } from "../auth/GuardianAccess";
import { useLearnerSelection } from "../learner-profile/LearnerProfileContext";
import {
  loadLearnerProfiles,
  type LearnerProfileRoster,
} from "../learner-profile/learner-profile-api";
import { ActionButton, ActionLink } from "../shared/ui";
import { getGuardianLearnersPath } from "./app-routes";
import { useDialogFocus } from "./useDialogFocus";

type RosterState =
  | { phase: "loading" }
  | { error: string; phase: "error" }
  | { phase: "ready"; roster: LearnerProfileRoster };

function errorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "Learner profiles could not be loaded.";
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function LearnerModeSwitchDialog({
  destination,
  onBeforeNavigate,
  onClose,
  returnFocusRef,
}: {
  destination: string;
  onBeforeNavigate?: () => void;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const { lock } = useGuardianAccess();
  const { selectLearner } = useLearnerSelection();
  const navigate = useNavigate();
  const [reloadKey, setReloadKey] = useState(0);
  const [rosterState, setRosterState] = useState<RosterState>({
    phase: "loading",
  });
  const [switchingProfileId, setSwitchingProfileId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState("");
  const [isSwitching, setIsSwitching] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const lastLearnerButtonRef = useRef<HTMLButtonElement>(null);
  const isSwitchingRef = useRef(false);

  useDialogFocus({
    canClose: () => !isSwitchingRef.current,
    dialogRef,
    initialFocusRef: dialogRef,
    onClose,
    returnFocusRef,
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
      (nextError) => {
        if (!controller.signal.aborted && !isAbortError(nextError)) {
          setRosterState({ error: errorMessage(nextError), phase: "error" });
        }
      },
    );
    return () => controller.abort();
  }, [reloadKey]);

  useEffect(() => {
    if (!isSwitching && error) lastLearnerButtonRef.current?.focus();
  }, [error, isSwitching]);

  async function switchToLearner(
    profileId: string,
    trigger: HTMLButtonElement,
  ) {
    if (isSwitchingRef.current) return;

    lastLearnerButtonRef.current = trigger;
    isSwitchingRef.current = true;
    setIsSwitching(true);
    setSwitchingProfileId(profileId);
    setError("");
    try {
      await selectLearner(profileId);
      const lockError = await lock();
      if (lockError) {
        setError(lockError);
        return;
      }
      onBeforeNavigate?.();
      navigate(destination);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      isSwitchingRef.current = false;
      setIsSwitching(false);
      setSwitchingProfileId(null);
    }
  }

  const selectableProfiles =
    rosterState.phase === "ready"
      ? rosterState.roster.profiles.filter(({ deletionPending }) =>
          !deletionPending
        )
      : [];
  const switchingProfile = selectableProfiles.find(
    ({ id }) => id === switchingProfileId,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-brand-navy/65 p-4 font-ui sm:p-8"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !isSwitchingRef.current) {
          onClose();
        }
      }}
    >
      <section
        aria-busy={isSwitching}
        aria-labelledby="learner-mode-switch-title"
        aria-modal="true"
        className="grid w-full max-w-lg gap-5 rounded-3xl border-4 border-white bg-sky-50 p-5 text-left text-slate-900 shadow-control-navy sm:p-7"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="grid gap-2">
          <h2
            className="m-0 text-2xl font-black leading-tight text-brand-navy sm:text-3xl"
            id="learner-mode-switch-title"
          >
            Who is learning now?
          </h2>
          <p className="m-0 font-bold leading-relaxed text-slate-700">
            Choose who will use learner mode.
          </p>
        </header>

        {rosterState.phase === "loading" ? (
          <p className="m-0 font-bold text-slate-700">Loading learners…</p>
        ) : null}

        {rosterState.phase === "error" ? (
          <div className="grid gap-3">
            <p
              className="m-0 rounded-xl bg-rose-100 px-3 py-2.5 font-extrabold leading-snug text-red-900"
              role="alert"
            >
              {rosterState.error}
            </p>
            <ActionButton
              onClick={() => setReloadKey((key) => key + 1)}
              type="button"
              variant="surface"
            >
              Try again
            </ActionButton>
          </div>
        ) : null}

        {rosterState.phase === "ready" ? (
          <div className="grid gap-5">
            <fieldset
              className="m-0 grid min-w-0 gap-3 border-0 p-0 disabled:opacity-75"
              disabled={isSwitching}
            >
              <legend className="sr-only">Learner profiles</legend>
              {selectableProfiles.length === 0 ? (
                <div className="grid justify-items-start gap-3">
                  <p className="m-0 font-bold leading-relaxed text-slate-700">
                    Add a learner before switching to learner mode.
                  </p>
                  <ActionLink
                    size="compact"
                    to={getGuardianLearnersPath()}
                    variant="surface"
                  >
                    Manage learners
                  </ActionLink>
                </div>
              ) : (
                <div className="grid gap-3">
                  {selectableProfiles.map((profile) => (
                    <ActionButton
                      align="start"
                      aria-label={`Start learner mode as ${profile.name}`}
                      fullWidth
                      key={profile.id}
                      onClick={(event) => {
                        void switchToLearner(profile.id, event.currentTarget);
                      }}
                      shape="rounded"
                      type="button"
                      variant="surface"
                    >
                      <span
                        className="min-w-0 [overflow-wrap:anywhere]"
                        dir="auto"
                      >
                        {switchingProfileId === profile.id
                          ? `Starting ${profile.name}…`
                          : profile.name}
                      </span>
                    </ActionButton>
                  ))}
                </div>
              )}

              {error ? (
                <p
                  className="m-0 rounded-xl bg-rose-100 px-3 py-2.5 font-extrabold leading-snug text-red-900"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}

              <p
                aria-atomic="true"
                aria-live="polite"
                className="sr-only"
                role="status"
              >
                {isSwitching && switchingProfile
                  ? `Starting learner mode as ${switchingProfile.name}…`
                  : ""}
              </p>

              <div className="grid gap-3">
                <ActionButton
                  onClick={onClose}
                  type="button"
                  variant="surface"
                >
                  Cancel
                </ActionButton>
              </div>
            </fieldset>
          </div>
        ) : null}
      </section>
    </div>
  );
}
