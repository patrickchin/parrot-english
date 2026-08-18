import { ArrowLeft, BookOpen, Play } from "lucide-react";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  getStoryPagePath,
  getStoryShelfPath,
  resolveStoryShelfLevel,
} from "../app/app-routes";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import {
  ActionLink,
  fieldClassName,
  SegmentedButton,
  SegmentedControl,
} from "../shared/ui";
import { PersonalizedStoryArtPanel } from "./PersonalizedStoryArtPanel";
import { StoryArtwork } from "./StoryArtwork";
import {
  getStoryLevel,
  STORIES,
  STORY_LEVELS,
  type StoryLevelId,
} from "./story-catalog";
import { usePersonalizedStoryArt } from "./usePersonalizedStoryArt";

export function StoryList() {
  const location = useLocation();
  const navigate = useNavigate();
  const personalizedStoryArt = usePersonalizedStoryArt();
  const requestedLevelId = new URLSearchParams(location.search).get("level");
  const activeLevelId = resolveStoryShelfLevel(location.search);
  const activeLevel = getStoryLevel(activeLevelId);
  const stories = STORIES.filter((story) => story.level === activeLevelId);

  useEffect(() => {
    if (requestedLevelId && requestedLevelId !== activeLevelId) {
      navigate(getStoryShelfPath(activeLevelId), { replace: true });
    }
  }, [activeLevelId, navigate, requestedLevelId]);

  function selectLevel(levelId: StoryLevelId) {
    navigate(getStoryShelfPath(levelId), { replace: true });
  }

  return (
    <main className="relative h-dvh w-screen overflow-x-hidden overflow-y-auto bg-story-shelf px-3 pb-10 pt-24 short:pt-20 sm:px-4 md:px-8 md:pb-14 md:pt-28 lg:px-16">
      <RouteHeader>
        <HeaderLink aria-label="Back to home" icon={<ArrowLeft />} to="/">
          Back to home
        </HeaderLink>
      </RouteHeader>

      <header className="mx-auto mb-6 grid w-full max-w-3xl gap-2 text-center md:mb-8">
        <p className="m-0 text-sm font-black uppercase tracking-[0.16em] text-brand-blue">
          Listen and join in
        </p>
        <h1 className="m-0 text-4xl leading-none tracking-tight text-brand-ink sm:text-5xl md:text-6xl">
          Choose a story
        </h1>
        <p className="mx-auto m-0 max-w-2xl text-sm font-extrabold leading-relaxed text-brand-blue sm:text-lg">
          Start with a comfortable level. You can change it any time.
        </p>
      </header>

      <section
        aria-label="Read-aloud stories"
        className="mx-auto grid w-full max-w-6xl gap-5"
      >
        <PersonalizedStoryArtPanel
          consentChecked={personalizedStoryArt.consentChecked}
          error={personalizedStoryArt.error}
          featureEnabled={personalizedStoryArt.featureEnabled}
          fileName={personalizedStoryArt.selectedFileName}
          hasSelectedPhoto={personalizedStoryArt.hasSelectedPhoto}
          hasStoredArt={Boolean(personalizedStoryArt.metadata.hasStoredArt)}
          generateDisabled={personalizedStoryArt.generateDisabled}
          isGenerating={personalizedStoryArt.isGenerating}
          onConsentChange={personalizedStoryArt.setConsentChecked}
          onFileChange={personalizedStoryArt.setSelectedFile}
          onGenerate={() => void personalizedStoryArt.generate()}
          onRemove={() => void personalizedStoryArt.remove()}
          personalizedArtwork={personalizedStoryArt.personalizedArtwork}
          statusMessage={personalizedStoryArt.statusMessage}
          storyTitle={personalizedStoryArt.storyTitle}
        />

        <div className="rounded-[1.5rem] border-4 border-white bg-white/90 p-2.5 shadow-card sm:p-3">
          <div className="mb-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 px-1">
            <h2 className="m-0 text-lg leading-none text-brand-navy sm:text-xl">
              Choose a reading level
            </h2>
            <p className="m-0 text-xs font-bold text-slate-600 sm:text-sm">
              Showing {stories.length} of {STORIES.length} stories
            </p>
          </div>

          <div className="sm:hidden">
            <label
              className="sr-only"
              htmlFor="story-reading-level"
            >
              Reading level
            </label>
            <select
              className={fieldClassName({
                className: "min-h-12 rounded-xl bg-sky-50 py-2 text-sm",
                tone: "tinted",
              })}
              id="story-reading-level"
              onChange={(event) =>
                selectLevel(event.currentTarget.value as StoryLevelId)
              }
              value={activeLevelId}
            >
              {STORY_LEVELS.map((level) => {
                const storyCount = STORIES.filter(
                  (story) => story.level === level.id,
                ).length;

                return (
                  <option key={level.id} value={level.id}>
                    {level.label} ({storyCount})
                  </option>
                );
              })}
            </select>
          </div>

          <SegmentedControl
            aria-label="Choose a reading level"
            className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4"
            role="tablist"
          >
            {STORY_LEVELS.map((level) => (
              <SegmentedButton
                aria-controls="story-level-panel"
                className="px-3 text-sm"
                id={`story-level-tab-${level.id}`}
                key={level.id}
                onClick={() => selectLevel(level.id)}
                role="tab"
                selected={level.id === activeLevelId}
                type="button"
              >
                {level.label}
              </SegmentedButton>
            ))}
          </SegmentedControl>
        </div>

        <section
          aria-label={`${activeLevel.label} stories`}
          className="grid gap-4"
          id="story-level-panel"
          role="region"
        >
          <header className="rounded-2xl bg-white/70 px-4 py-3 text-center">
            <h2 className="m-0 text-2xl leading-none text-brand-navy sm:text-3xl">
              {activeLevel.label}
            </h2>
            <p className="mx-auto mb-0 mt-1 max-w-2xl text-sm font-bold leading-relaxed text-slate-700">
              {activeLevel.description}
            </p>
          </header>

          <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {stories.map((story, storyIndex) => (
              <article
                aria-labelledby={`story-card-${story.id}`}
                className="grid min-h-full grid-rows-[auto_1fr] overflow-hidden rounded-3xl border-4 border-white bg-white/95 shadow-card"
                key={story.id}
              >
                <div className="aspect-[3/2] min-h-0 overflow-hidden border-b-4 border-white">
                  <StoryArtwork
                    artwork={story.cover}
                    priority={storyIndex === 0}
                  />
                </div>

                <div className="grid content-between gap-4 p-4">
                  <div className="grid gap-2">
                    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-black text-brand-blue">
                      <BookOpen aria-hidden="true" className="size-3.5" />
                      {story.pages.length} pages
                    </span>
                    <h3
                      className="m-0 text-xl leading-tight text-brand-ink"
                      id={`story-card-${story.id}`}
                    >
                      {story.title}
                    </h3>
                    <p className="m-0 text-sm font-bold leading-relaxed text-slate-700">
                      {story.summary}
                    </p>
                  </div>

                  <ActionLink
                    aria-label={`Read story: ${story.title}`}
                    className="w-full gap-2 rounded-xl"
                    frame="none"
                    shape="rounded"
                    size="compact"
                    to={getStoryPagePath(story.id, 0)}
                  >
                    <Play aria-hidden="true" className="size-4 fill-current" />
                    Read story
                  </ActionLink>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
