import { ArrowLeft } from "lucide-react";
import { useRef, useState } from "react";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import { useLearnerProfile } from "../learner-profile/LearnerProfileContext";
import { saveStoryLevel } from "../learner-profile/learner-profile-api";
import {
  Card,
  SegmentedButton,
  SegmentedControl,
} from "../shared/ui";
import { PersonalizedStoryArtPanel } from "./PersonalizedStoryArtPanel";
import {
  getStoryLevel,
  LEARNER_STORY_LEVEL_IDS,
  type LearnerStoryLevelId,
} from "./story-catalog";
import { usePersonalizedStoryArt } from "./usePersonalizedStoryArt";

type PersonalizedStoryArtState = ReturnType<typeof usePersonalizedStoryArt>;

export function GuardianStorySettingsView({
  art,
  error,
  isSaving,
  onSelectLevel,
  selectedLevel,
  statusMessage,
}: {
  art: PersonalizedStoryArtState;
  error: string;
  isSaving: boolean;
  onSelectLevel: (level: LearnerStoryLevelId) => void;
  selectedLevel: LearnerStoryLevelId;
  statusMessage: string;
}) {
  const showArt =
    art.featureEnabled || art.metadata.hasStoredArt || art.statusMessage;

  return (
    <main className="min-h-dvh w-full overflow-x-hidden bg-placeholder px-4 pb-12 pt-28 sm:px-6 md:px-10 md:pt-32">
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
        <header className="grid gap-2 text-center">
          <h1 className="m-0 text-4xl leading-none tracking-tight text-brand-ink sm:text-6xl">
            Story settings
          </h1>
          <p className="m-0 font-bold leading-relaxed text-slate-600">
            Choose stories and manage optional personalized art for the learner.
          </p>
        </header>

        <Card className="grid gap-4 p-5 sm:p-6">
          <div className="grid gap-1 text-center">
            <h2 className="m-0 text-2xl leading-tight text-brand-navy">
              Choose story level
            </h2>
            <p className="m-0 text-sm font-bold text-slate-600">
              The learner story shelf always opens at this level.
            </p>
          </div>

          <SegmentedControl
            aria-label="Choose story level"
            className="grid grid-cols-2 lg:grid-cols-4"
            role="tablist"
          >
            {LEARNER_STORY_LEVEL_IDS.map((levelId, levelIndex) => {
              const level = getStoryLevel(levelId);
              return (
                <SegmentedButton
                  aria-controls="guardian-story-level-status"
                  aria-disabled={isSaving ? true : undefined}
                  className="min-h-14 justify-start px-2 text-left text-xs leading-tight min-[360px]:px-3 min-[360px]:text-sm sm:justify-center"
                  key={levelId}
                  onClick={() => onSelectLevel(levelId)}
                  role="tab"
                  selected={levelId === selectedLevel}
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
              );
            })}
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
          {error ? (
            <p
              className="m-0 rounded-2xl bg-rose-100 px-4 py-3 text-center font-extrabold text-red-900"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </Card>

        {showArt ? (
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

export function GuardianStorySettings() {
  const { profile, replaceProfile } = useLearnerProfile();
  const art = usePersonalizedStoryArt();
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const savingRef = useRef(false);

  async function selectLevel(level: LearnerStoryLevelId) {
    if (savingRef.current || level === profile.storyLevel) return;
    savingRef.current = true;
    setError("");
    setStatusMessage("");
    setIsSaving(true);
    try {
      const result = await saveStoryLevel(level);
      replaceProfile(result.profile);
      setStatusMessage(`Story level saved: ${getStoryLevel(level).label}.`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Story settings could not be saved.",
      );
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <GuardianStorySettingsView
      art={art}
      error={error}
      isSaving={isSaving}
      onSelectLevel={(level) => void selectLevel(level)}
      selectedLevel={profile.storyLevel}
      statusMessage={statusMessage}
    />
  );
}
