import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { useGuardianLanguage } from "../i18n/guardian-language";
import { isAbortError } from "../media/audio-playback";
import { Card, SegmentedButton, SegmentedControl } from "../shared/ui";
import { PersonalizedStoryArtPanel } from "./PersonalizedStoryArtPanel";
import {
  LEARNER_STORY_LEVEL_IDS,
  type LearnerStoryLevelId,
} from "./story-catalog";
import { usePersonalizedStoryArt } from "./usePersonalizedStoryArt";

type PersonalizedStoryArtState = ReturnType<typeof usePersonalizedStoryArt>;
export type GuardianStoryErrorCode =
  | "load-failed"
  | "save-level-failed"
  | null;

type GuardianStorySettingsViewProps = {
  art?: PersonalizedStoryArtState;
  error: GuardianStoryErrorCode;
  isLoading?: boolean;
  isSaving: boolean;
  onSelectLevel: (level: LearnerStoryLevelId) => void;
  savedLevel: LearnerStoryLevelId | null;
  selectedLevel?: LearnerStoryLevelId;
  target: GuardianLearnerTargetState;
};

function GuardianStorySettingsContent({
  art,
  error,
  isLoading = false,
  isSaving,
  onSelectLevel,
  savedLevel,
  selectedLevel,
  target,
}: GuardianStorySettingsViewProps) {
  const { messages } = useGuardianLanguage();
  const copy = messages.storySettings;
  const managedLearnerName = target.learnerName?.trim() || "Learner";
  const targetReady =
    target.phase === "ready" &&
    target.learnerProfileId !== null &&
    target.learnerName !== null;
  const levelUnavailable =
    isLoading || isSaving || selectedLevel === undefined;
  const showArt =
    art &&
    (art.featureEnabled || art.metadata.hasStoredArt || art.status);
  const selectedLevelCopy = selectedLevel
    ? copy.levels[selectedLevel]
    : null;

  return (
    <>
      {error ? (
        <p
          className="m-0 rounded-2xl bg-rose-100 px-4 py-3 text-center font-extrabold text-red-900"
          role="alert"
        >
          {copy.errors[error]}
        </p>
      ) : null}

      {targetReady ? (
        <Card className="grid gap-4 p-5 sm:p-6">
          <div className="grid gap-1 text-center">
            <h2 className="m-0 text-2xl leading-tight text-brand-navy">
              {copy.chooseLevel}
            </h2>
            <p
              className="m-0 min-w-0 text-sm font-bold text-slate-600 [overflow-wrap:anywhere]"
            >
              {copy.shelfBefore}
              <BidiLearnerName learnerName={managedLearnerName} />
              {copy.shelfAfter}
            </p>
          </div>

          <SegmentedControl
            aria-label={copy.chooseLevel}
            className="grid grid-cols-2 lg:grid-cols-4"
            role="tablist"
          >
            {LEARNER_STORY_LEVEL_IDS.map((levelId) => (
              <SegmentedButton
                aria-controls="guardian-story-level-status"
                aria-disabled={levelUnavailable ? true : undefined}
                className="min-h-14 justify-center px-2 text-center text-xs leading-tight min-[360px]:px-3 min-[360px]:text-sm"
                key={levelId}
                onClick={
                  levelUnavailable ? undefined : () => onSelectLevel(levelId)
                }
                role="tab"
                selected={levelId === selectedLevel}
                type="button"
              >
                <span>{copy.levels[levelId].label}</span>
              </SegmentedButton>
            ))}
          </SegmentedControl>

          {selectedLevelCopy ? (
            <div
              aria-label={copy.levelSummary}
              className="grid gap-1 rounded-2xl bg-sky-50 px-4 py-3 text-center"
              role="group"
            >
              <p className="m-0 text-xs font-black text-brand-blue">
                {copy.cefrLabel}: {selectedLevelCopy.cefrReference}
              </p>
              <p className="m-0 text-sm font-bold text-slate-700">
                {selectedLevelCopy.description}
              </p>
            </div>
          ) : null}

          <p
            aria-atomic="true"
            aria-live="polite"
            className="m-0 min-h-6 text-center text-sm font-extrabold text-brand-blue"
            id="guardian-story-level-status"
            role="status"
          >
            {isLoading
              ? copy.loading
              : isSaving
                ? copy.saving
                : savedLevel
                  ? copy.saved(copy.levels[savedLevel].label)
                  : ""}
          </p>
        </Card>
      ) : null}

      {targetReady && showArt && art ? (
        <PersonalizedStoryArtPanel
          consentChecked={art.consentChecked}
          disabled={isLoading}
          error={art.error}
          featureEnabled={art.featureEnabled}
          fileName={art.selectedFileName}
          generateDisabled={isLoading || art.generateDisabled}
          hasSelectedPhoto={art.hasSelectedPhoto}
          hasStoredArt={Boolean(art.metadata.hasStoredArt)}
          isGenerating={art.isGenerating}
          learnerName={managedLearnerName}
          onConsentChange={art.setConsentChecked}
          onFileChange={art.setSelectedFile}
          onGenerate={() => void art.generate()}
          onRemove={() => void art.remove()}
          personalizedArtwork={art.personalizedArtwork}
          status={art.status}
          storyTitle={art.storyTitle}
        />
      ) : null}
    </>
  );
}

function GuardianStorySettingsShell({
  children,
  target,
}: {
  children: ReactNode;
  target: GuardianLearnerTargetState;
}) {
  const { messages } = useGuardianLanguage();
  const copy = messages.storySettings;
  return (
    <main className="h-dvh w-full overflow-x-hidden overflow-y-auto bg-placeholder px-4 pb-12 pt-28 sm:px-6 md:px-10 md:pt-32">
      <RouteHeader ariaLabel={messages.common.pageNavigation}>
        <HeaderLink
          aria-label={copy.backToDashboard}
          icon={<ArrowLeft />}
          to="/guardian"
        >
          {copy.backToDashboard}
        </HeaderLink>
      </RouteHeader>

      <section className="mx-auto grid w-full max-w-5xl gap-6">
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

export function GuardianStorySettingsView(props: GuardianStorySettingsViewProps) {
  return (
    <GuardianStorySettingsShell target={props.target}>
      <GuardianStorySettingsContent {...props} />
    </GuardianStorySettingsShell>
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
  const [error, setError] = useState<GuardianStoryErrorCode>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [profileState, setProfileState] = useState<ProfileState | null>(null);
  const [savedLevel, setSavedLevel] = useState<LearnerStoryLevelId | null>(
    null,
  );
  const loadControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const saveControllerRef = useRef<AbortController | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    loadControllerRef.current = controller;
    setIsLoading(true);
    setError(null);
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
        setError("load-failed");
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
    setError(null);
    setSavedLevel(null);
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
      setSavedLevel(level);
    } catch (caughtError) {
      if (
        controller.signal.aborted ||
        !mountedRef.current ||
        isAbortError(caughtError)
      ) {
        return;
      }
      setError("save-level-failed");
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
    <GuardianStorySettingsContent
      art={art}
      error={error}
      isLoading={isLoading}
      isSaving={isSaving}
      onSelectLevel={(level) => void selectLevel(level)}
      savedLevel={savedLevel}
      selectedLevel={profileState?.profile.storyLevel}
      target={target}
    />
  );
}

export function GuardianStorySettings() {
  const target = useGuardianLearnerTarget();
  const learnerProfileId =
    target.phase === "ready" &&
    target.learnerName !== null
      ? target.learnerProfileId
      : null;

  return (
    <GuardianStorySettingsShell target={target}>
      {learnerProfileId !== null ? (
        <TargetedGuardianStorySettings
          key={learnerProfileId}
          learnerProfileId={learnerProfileId}
          target={target}
        />
      ) : null}
    </GuardianStorySettingsShell>
  );
}
