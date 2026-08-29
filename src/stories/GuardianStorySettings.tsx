import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BidiLearnerName, HeaderLink, RouteHeader } from "../app/AppHeader";
import {
  GuardianLearnerTarget,
  useGuardianLearnerTarget,
  type GuardianLearnerTargetState,
} from "../learner-profile/GuardianLearnerTarget";
import { useLearnerSelection } from "../learner-profile/LearnerProfileContext";
import {
  loadProfile,
  saveStoryLevel,
  type ProfileState,
} from "../learner-profile/learner-profile-api";
import { isAbortError } from "../media/audio-playback";
import { Card, SegmentedButton, SegmentedControl } from "../shared/ui";
import { PersonalizedStoryArtPanel } from "./PersonalizedStoryArtPanel";
import {
  getStoryLevel,
  LEARNER_STORY_LEVEL_IDS,
  type LearnerStoryLevelId,
} from "./story-catalog";
import { usePersonalizedStoryArt } from "./usePersonalizedStoryArt";

type PersonalizedStoryArtState = ReturnType<typeof usePersonalizedStoryArt>;
const LEARNER_STORY_LEVELS = LEARNER_STORY_LEVEL_IDS.map((levelId) => ({
  ...getStoryLevel(levelId),
  id: levelId,
}));

export function GuardianStorySettingsView({
  art,
  error,
  isLoading = false,
  isSaving,
  onSelectLevel,
  selectedLevel,
  statusMessage,
  target,
}: {
  art?: PersonalizedStoryArtState;
  error: string;
  isLoading?: boolean;
  isSaving: boolean;
  onSelectLevel: (level: LearnerStoryLevelId) => void;
  selectedLevel?: LearnerStoryLevelId;
  statusMessage: string;
  target: GuardianLearnerTargetState;
}) {
  const managedLearnerName = target.learnerName?.trim() || "Learner";
  const targetReady =
    target.phase === "ready" &&
    target.learnerProfileId !== null &&
    target.learnerName !== null &&
    selectedLevel !== undefined;
  const showArt =
    art &&
    (art.featureEnabled || art.metadata.hasStoredArt || art.statusMessage);

  return (
    <main className="h-dvh w-full overflow-x-hidden overflow-y-auto bg-placeholder px-4 pb-12 pt-28 sm:px-6 md:px-10 md:pt-32">
      <RouteHeader>
        <HeaderLink
          aria-label="Back to guardian dashboard"
          icon={<ArrowLeft />}
          to="/guardian"
        >
          Back to guardian dashboard
        </HeaderLink>
      </RouteHeader>

      <section className="mx-auto grid w-full max-w-5xl gap-6">
        <header className="grid gap-4 text-center">
          <h1 className="m-0 text-4xl leading-none tracking-tight text-brand-ink sm:text-6xl">
            Story settings
          </h1>
          <GuardianLearnerTarget state={target} />
          {target.phase === "ready" && target.learnerName !== null ? (
            <p
              className="m-0 min-w-0 font-bold leading-relaxed text-slate-600 [overflow-wrap:anywhere]"
              dir="ltr"
            >
              Choose stories and manage optional personalized art for{" "}
              <BidiLearnerName learnerName={managedLearnerName} />.
            </p>
          ) : null}
        </header>

        {target.phase === "ready" && isLoading ? (
          <p
            aria-live="polite"
            className="m-0 text-center font-extrabold text-brand-blue"
            role="status"
          >
            Loading story settings…
          </p>
        ) : null}

        {error ? (
          <p
            className="m-0 rounded-2xl bg-rose-100 px-4 py-3 text-center font-extrabold text-red-900"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {targetReady ? (
          <Card className="grid gap-4 p-5 sm:p-6">
            <div className="grid gap-1 text-center">
              <h2 className="m-0 text-2xl leading-tight text-brand-navy">
                Choose story level
              </h2>
              <p
                className="m-0 min-w-0 text-sm font-bold text-slate-600 [overflow-wrap:anywhere]"
                dir="ltr"
              >
                All stories stay visible. This level is highlighted for{" "}
                <BidiLearnerName learnerName={managedLearnerName} />.
              </p>
            </div>

            <SegmentedControl
              aria-label="Choose story level"
              className="grid grid-cols-2 lg:grid-cols-4"
              role="tablist"
            >
              {LEARNER_STORY_LEVELS.map((level, levelIndex) => (
                <SegmentedButton
                  aria-controls="guardian-story-level-status"
                  aria-disabled={isSaving ? true : undefined}
                  className="min-h-14 justify-start px-2 text-left text-xs leading-tight min-[360px]:px-3 min-[360px]:text-sm sm:justify-center"
                  key={level.id}
                  onClick={() => onSelectLevel(level.id)}
                  role="tab"
                  selected={level.id === selectedLevel}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-6 shrink-0 place-items-center rounded-full bg-white/85 text-xs text-brand-navy"
                  >
                    {levelIndex + 1}
                  </span>
                  <span>{level.label}</span>
                </SegmentedButton>
              ))}
            </SegmentedControl>

            <p
              aria-atomic="true"
              aria-live="polite"
              className="m-0 min-h-6 text-center text-sm font-extrabold text-brand-blue"
              id="guardian-story-level-status"
              role="status"
            >
              {isSaving ? "Saving story level…" : statusMessage}
            </p>
          </Card>
        ) : null}

        {targetReady && showArt && art ? (
          <div className="grid gap-2">
            <h2 className="m-0 text-center text-2xl leading-tight text-brand-navy">
              Personalized story art
            </h2>
            <PersonalizedStoryArtPanel
              consentChecked={art.consentChecked}
              error={art.error}
              featureEnabled={art.featureEnabled}
              fileName={art.selectedFileName}
              generateDisabled={art.generateDisabled}
              hasSelectedPhoto={art.hasSelectedPhoto}
              hasStoredArt={Boolean(art.metadata.hasStoredArt)}
              isGenerating={art.isGenerating}
              learnerName={managedLearnerName}
              onConsentChange={art.setConsentChecked}
              onFileChange={art.setSelectedFile}
              onGenerate={() => void art.generate()}
              onRemove={() => void art.remove()}
              personalizedArtwork={art.personalizedArtwork}
              statusMessage={art.statusMessage}
              storyTitle={art.storyTitle}
            />
          </div>
        ) : null}
      </section>
    </main>
  );
}

function TargetedGuardianStorySettings({
  learnerProfileId,
  target,
}: {
  learnerProfileId: string;
  target: GuardianLearnerTargetState;
}) {
  const art = usePersonalizedStoryArt({ learnerProfileId });
  const { activeProfileId, reloadSelectedLearner } = useLearnerSelection();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [profileState, setProfileState] = useState<ProfileState | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const loadControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const saveControllerRef = useRef<AbortController | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    loadControllerRef.current = controller;
    setIsLoading(true);
    setError("");
    setProfileState(null);
    void loadProfile({ learnerProfileId, signal: controller.signal })
      .then((loaded) => {
        if (controller.signal.aborted || !mountedRef.current) return;
        if (loaded.profile.id !== learnerProfileId) {
          throw new Error("The selected learner profile could not be loaded.");
        }
        setProfileState(loaded);
      })
      .catch((caughtError: unknown) => {
        if (
          controller.signal.aborted ||
          !mountedRef.current ||
          isAbortError(caughtError)
        ) {
          return;
        }
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Story settings could not be loaded.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted && mountedRef.current) {
          setIsLoading(false);
        }
        if (loadControllerRef.current === controller) {
          loadControllerRef.current = null;
        }
      });
    return () => {
      mountedRef.current = false;
      controller.abort();
      loadControllerRef.current = null;
      saveControllerRef.current?.abort();
      saveControllerRef.current = null;
      savingRef.current = false;
    };
  }, [learnerProfileId]);

  async function selectLevel(level: LearnerStoryLevelId) {
    if (
      savingRef.current ||
      !profileState ||
      level === profileState.profile.storyLevel
    ) {
      return;
    }
    const controller = new AbortController();
    saveControllerRef.current?.abort();
    saveControllerRef.current = controller;
    savingRef.current = true;
    setError("");
    setStatusMessage("");
    setIsSaving(true);
    try {
      const result = await saveStoryLevel(level, {
        learnerProfileId,
        signal: controller.signal,
      });
      if (controller.signal.aborted || !mountedRef.current) return;
      if (result.profile.id !== learnerProfileId) {
        throw new Error("The selected learner profile could not be saved.");
      }
      setProfileState(result);
      if (activeProfileId === learnerProfileId) {
        await reloadSelectedLearner(learnerProfileId);
        if (controller.signal.aborted || !mountedRef.current) return;
      }
      setStatusMessage(`Story level saved: ${getStoryLevel(level).label}.`);
    } catch (caughtError) {
      if (
        controller.signal.aborted ||
        !mountedRef.current ||
        isAbortError(caughtError)
      ) {
        return;
      }
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Story settings could not be saved.",
      );
    } finally {
      if (!controller.signal.aborted && mountedRef.current) {
        savingRef.current = false;
        setIsSaving(false);
      }
      if (saveControllerRef.current === controller) {
        saveControllerRef.current = null;
      }
    }
  }

  return (
    <GuardianStorySettingsView
      art={art}
      error={error}
      isLoading={isLoading}
      isSaving={isSaving}
      onSelectLevel={(level) => void selectLevel(level)}
      selectedLevel={profileState?.profile.storyLevel}
      statusMessage={statusMessage}
      target={target}
    />
  );
}

export function GuardianStorySettings() {
  const target = useGuardianLearnerTarget();
  return target.phase === "ready" &&
    target.learnerProfileId !== null &&
    target.learnerName !== null ? (
    <TargetedGuardianStorySettings
      key={target.learnerProfileId}
      learnerProfileId={target.learnerProfileId}
      target={target}
    />
  ) : (
    <GuardianStorySettingsView
      error=""
      isSaving={false}
      onSelectLevel={() => {}}
      statusMessage=""
      target={target}
    />
  );
}
