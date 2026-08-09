import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  FileText,
  FlaskConical,
  Play,
  Sparkles,
} from "lucide-react";
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
  countStoryWords,
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

      <header className="mx-auto mb-5 w-full max-w-5xl text-center md:mb-7">
        <span className="mb-2 inline-flex items-center gap-2 rounded-full border-3 border-white bg-brand-navy px-3 py-1 text-xs font-black uppercase tracking-wider text-white shadow-control-navy sm:text-sm">
          <FlaskConical aria-hidden="true" className="size-4" /> 21 stories · 5
          levels
        </span>
        <h1 className="m-0 text-4xl leading-none tracking-tight text-brand-ink sm:text-5xl md:text-6xl">
          Storytelling
        </h1>
        <p className="mx-auto mb-0 mt-2 max-w-3xl text-sm font-extrabold leading-relaxed text-brand-blue sm:text-lg">
          Choose a reading level, then pick a story. Open the teaching notes only
          when you need them.
        </p>
      </header>

      <section
        aria-label="Read-aloud stories"
        className="mx-auto grid w-full max-w-7xl gap-4"
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
            className="hidden sm:grid sm:grid-cols-3 lg:grid-cols-5"
            role="tablist"
          >
            {STORY_LEVELS.map((level) => {
              const storyCount = STORIES.filter(
                (story) => story.level === level.id,
              ).length;
              const selected = level.id === activeLevelId;

              return (
                <SegmentedButton
                  aria-controls="story-level-panel"
                  className="gap-1.5 px-2 text-xs sm:text-sm"
                  id={`story-level-tab-${level.id}`}
                  key={level.id}
                  onClick={() => selectLevel(level.id)}
                  role="tab"
                  selected={selected}
                  type="button"
                >
                  <span>{level.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[0.65rem] ${
                      selected
                        ? "bg-white/20 text-white"
                        : "bg-white text-brand-blue"
                    }`}
                  >
                    {storyCount}
                    <span className="sr-only">
                      {storyCount === 1 ? " story" : " stories"}
                    </span>
                  </span>
                </SegmentedButton>
              );
            })}
          </SegmentedControl>
        </div>

        <section
          aria-label={`${activeLevel.label} stories`}
          className="grid gap-3"
          id="story-level-panel"
          role="region"
        >
          <header className="grid gap-1 rounded-2xl bg-white/70 px-3 py-2.5 sm:grid-cols-[minmax(0,0.7fr)_minmax(16rem,1fr)] sm:items-center sm:px-4">
            <div>
              <p className="m-0 text-[0.68rem] font-black uppercase tracking-wider text-brand-blue sm:text-xs">
                {activeLevel.cefrReference}
              </p>
              <h2 className="m-0 text-2xl leading-none text-brand-navy sm:text-3xl">
                {activeLevel.label}
              </h2>
            </div>
            <p className="m-0 text-xs font-bold leading-relaxed text-slate-700 sm:text-right sm:text-sm">
              {activeLevel.description}
            </p>
          </header>

          <div
            className={`grid gap-3 ${
              stories.length === 1
                ? "w-full max-w-sm grid-cols-1"
                : "grid-cols-2 md:grid-cols-3 xl:grid-cols-5"
            }`}
          >
            {stories.map((story, storyIndex) => {
              const narrativeWords = countStoryWords(
                story.pages.map(({ text }) => text).join(" "),
              );
              const titleId = `story-title-${story.id}`;

              return (
                <article
                  aria-labelledby={titleId}
                  className="grid min-h-full grid-rows-[auto_1fr] overflow-hidden rounded-[1.35rem] border-3 border-white bg-white/95 shadow-card"
                  key={story.id}
                >
                  <div className="aspect-[3/2] min-h-0 overflow-hidden border-b-3 border-white">
                    <StoryArtwork
                      artwork={story.cover}
                      priority={storyIndex === 0}
                    />
                  </div>

                  <div className="grid content-between gap-3 p-3 sm:p-4">
                    <div className="grid gap-2.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.65rem] font-black text-brand-blue sm:text-xs">
                        <span className="rounded-full bg-sky-100 px-2 py-1">
                          {story.category}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <BookOpen aria-hidden="true" className="size-3.5" />
                          {story.pages.length}
                          <span className="sr-only"> pages</span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <FileText aria-hidden="true" className="size-3.5" />
                          {narrativeWords}
                          <span className="sr-only"> narrator words</span>
                        </span>
                      </div>

                      <div>
                        <h3
                          className="m-0 text-lg leading-tight text-brand-ink sm:text-xl"
                          id={titleId}
                        >
                          {story.title}
                        </h3>
                        <p className="mb-0 mt-1 line-clamp-3 text-xs font-bold leading-relaxed text-slate-700 sm:text-sm">
                          {story.summary}
                        </p>
                      </div>

                      <details className="group rounded-xl bg-amber-50 text-xs leading-relaxed">
                        <summary
                          aria-label={`Teaching notes for ${story.title}`}
                          className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-2.5 py-2 font-black text-amber-950 outline-none hover:bg-amber-100 focus-visible:ring-4 focus-visible:ring-amber-300 [&::-webkit-details-marker]:hidden"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <Sparkles
                              aria-hidden="true"
                              className="size-4 shrink-0 text-amber-700"
                            />
                            Teaching notes
                          </span>
                          <ChevronDown
                            aria-hidden="true"
                            className="size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                          />
                        </summary>
                        <div className="grid gap-2 border-t-2 border-amber-100 px-2.5 py-3">
                          <p className="m-0 font-bold text-slate-700">
                            <span className="font-black text-amber-950">
                              Prompt test:
                            </span>{" "}
                            {story.promptExperiment.focus}
                          </p>
                          <p className="m-0 font-bold text-slate-700">
                            <span className="font-black text-brand-blue">
                              Target words:
                            </span>{" "}
                            {story.targetWords.join(" · ")}
                          </p>
                          <p className="m-0 font-bold text-slate-700">
                            <span className="font-black text-brand-blue">
                              Assumes familiar:
                            </span>{" "}
                            {story.level === "original-baseline"
                              ? `${story.assumedKnownWords.length} extra word forms in the original`
                              : story.assumedKnownWords.length > 0
                                ? story.assumedKnownWords.join(" · ")
                                : "no extra content words"}
                          </p>
                        </div>
                      </details>
                    </div>

                    <ActionLink
                      aria-label={`Read story: ${story.title}`}
                      className="w-full gap-1.5 rounded-xl"
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
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}
