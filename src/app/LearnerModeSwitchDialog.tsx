import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { useNavigate } from "react-router";
import { useGuardianAccess } from "../auth/GuardianAccess";
import { useLearnerSelection } from "../learner-profile/LearnerProfileContext";
import {
  loadLearnerProfiles,
  type LearnerProfileRoster,
} from "../learner-profile/learner-profile-api";
import { ActionButton } from "../shared/ui";
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
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState("");
  const [isSwitching, setIsSwitching] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const isSwitchingRef = useRef(false);

  useDialogFocus({
    canClose: () => !isSwitchingRef.current,
    dialogRef,
    initialFocusRef: cancelRef,
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProfileId || isSwitchingRef.current) return;

    isSwitchingRef.current = true;
    setIsSwitching(true);
    setError("");
    try {
      await selectLearner(selectedProfileId);
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
    }
  }

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
            Choose learner
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
          <form className="grid gap-5" onSubmit={handleSubmit}>
            <fieldset
              className="m-0 grid min-w-0 gap-3 border-0 p-0 disabled:opacity-75"
              disabled={isSwitching}
            >
              <legend className="sr-only">Learner profiles</legend>
              {rosterState.roster.profiles.length === 0 ? (
                <p className="m-0 font-bold leading-relaxed text-slate-700">
                  Add a learner before switching to learner mode.
                </p>
              ) : (
                rosterState.roster.profiles.map((profile) => (
                  <label
                    className="flex min-h-13 cursor-pointer items-center gap-3 rounded-2xl border-3 border-sky-200 bg-white px-4 py-3 font-black text-brand-ink"
                    htmlFor={`learner-mode-${profile.id}`}
                    key={profile.id}
                  >
                    <input
                      checked={selectedProfileId === profile.id}
                      id={`learner-mode-${profile.id}`}
                      name="learner-profile"
                      onChange={() => {
                        setSelectedProfileId(profile.id);
                        setError("");
                      }}
                      type="radio"
                      value={profile.id}
                    />
                    <span className="min-w-0 [overflow-wrap:anywhere]" dir="auto">
                      {profile.name}
                    </span>
                  </label>
                ))
              )}

              {error ? (
                <p
                  className="m-0 rounded-xl bg-rose-100 px-3 py-2.5 font-extrabold leading-snug text-red-900"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <ActionButton
                  onClick={onClose}
                  ref={cancelRef}
                  type="button"
                  variant="surface"
                >
                  Cancel
                </ActionButton>
                <ActionButton disabled={!selectedProfileId} type="submit">
                  {isSwitching
                    ? "Switching to learner mode…"
                    : "Switch to learner mode"}
                </ActionButton>
              </div>
            </fieldset>
          </form>
        ) : null}
      </section>
    </div>
  );
}
