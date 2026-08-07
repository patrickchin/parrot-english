import {
  ArrowLeft,
  BookOpen,
  FileText,
  FlaskConical,
  Play,
  Sparkles,
} from "lucide-react";
import { getStoryPagePath } from "../app/app-routes";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import { ActionLink } from "../shared/ui";
import { StoryArtwork } from "./StoryArtwork";
import {
  countStoryWords,
  STORIES,
  STORY_LEVELS,
} from "./story-catalog";

export function StoryList() {
  return (
    <main className="relative h-dvh w-screen overflow-x-hidden overflow-y-auto bg-story-shelf px-3 pb-12 pt-24 short:pt-20 sm:px-4 md:px-8 md:pb-16 md:pt-32 lg:px-16">
      <RouteHeader>
        <HeaderLink aria-label="Back to home" icon={<ArrowLeft />} to="/">
          Back to home
        </HeaderLink>
      </RouteHeader>

      <header className="mx-auto mb-8 w-full max-w-6xl text-center md:mb-11">
        <span className="mb-2 inline-flex items-center gap-2 rounded-full border-3 border-white bg-brand-navy px-3 py-1 text-xs font-black uppercase tracking-wider text-white shadow-control-navy sm:text-sm">
          <FlaskConical aria-hidden="true" className="size-4" /> 20 script
          experiments
        </span>
        <h1 className="m-0 text-4xl leading-none tracking-tight text-brand-ink sm:text-6xl lg:text-8xl">
          Storytelling
        </h1>
        <p className="mx-auto mb-0 mt-3 max-w-3xl text-base font-extrabold leading-relaxed text-brand-blue sm:text-xl">
          Try stories from first words to early A1. The scripts are ready;
          artwork and audio stay as placeholders until we choose the best ones.
        </p>
      </header>

      <section
        aria-label="Read-aloud stories"
        className="mx-auto grid w-full max-w-7xl gap-10 md:gap-14"
      >
        {STORY_LEVELS.map((level) => {
          const stories = STORIES.filter((story) => story.level === level.id);

          return (
            <section
              aria-labelledby={`${level.id}-title`}
              className="grid gap-4"
              key={level.id}
            >
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(16rem,0.8fr)] sm:items-end">
                <div>
                  <p className="mb-1 mt-0 text-xs font-black uppercase tracking-wider text-brand-blue">
                    {level.cefrReference} · {stories.length} stories
                  </p>
                  <h2
                    className="m-0 text-3xl leading-none text-brand-navy sm:text-4xl"
                    id={`${level.id}-title`}
                  >
                    {level.label}
                  </h2>
                </div>
                <p className="m-0 text-sm font-bold leading-relaxed text-slate-700 sm:text-right sm:text-base">
                  {level.description}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {stories.map((story) => {
                  const narrativeWords = countStoryWords(
                    story.pages.map(({ text }) => text).join(" "),
                  );

                  return (
                    <article
                      className="grid min-h-full overflow-hidden rounded-[1.75rem] border-4 border-white bg-white/95 shadow-card"
                      key={story.id}
                    >
                      <div className="relative min-h-44 overflow-hidden border-b-4 border-white">
                        <StoryArtwork artwork={story.cover} />
                        <span className="absolute left-3 top-3 rounded-full border-3 border-white bg-brand-yellow px-3 py-1 text-xs font-black uppercase tracking-wider text-brand-ink shadow-control-surface">
                          Script only
                        </span>
                      </div>

                      <div className="grid content-between gap-5 p-5 sm:p-6">
                        <div className="grid gap-4">
                          <div className="flex flex-wrap items-center gap-2 text-xs font-black text-brand-blue">
                            <span className="rounded-full bg-sky-100 px-3 py-1">
                              {story.category}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <BookOpen aria-hidden="true" className="size-4" />
                              {story.pages.length} pages
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <FileText aria-hidden="true" className="size-4" />
                              {narrativeWords} narrator words
                            </span>
                          </div>

                          <div>
                            <h3 className="m-0 text-2xl leading-none text-brand-ink sm:text-3xl">
                              {story.title}
                            </h3>
                            <p className="mb-0 mt-2 text-sm font-bold leading-relaxed text-slate-700 sm:text-base">
                              {story.summary}
                            </p>
                          </div>

                          <div className="grid gap-2 rounded-2xl bg-amber-50 p-3 text-sm leading-relaxed">
                            <p className="m-0 flex items-start gap-2 font-extrabold text-amber-950">
                              <Sparkles
                                aria-hidden="true"
                                className="mt-0.5 size-4 shrink-0 text-amber-700"
                              />
                              <span>
                                <span className="font-black">Prompt test:</span>{" "}
                                {story.promptExperiment.focus}
                              </span>
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
                              {story.assumedKnownWords.length > 0
                                ? story.assumedKnownWords.join(" · ")
                                : "no extra content words"}
                            </p>
                          </div>
                        </div>

                        <ActionLink
                          aria-label={`Read story: ${story.title}`}
                          className="w-full gap-2 rounded-full border-4 border-white"
                          size="large"
                          to={getStoryPagePath(story.id, 0)}
                        >
                          <Play aria-hidden="true" className="size-5 fill-current" />
                          Open the script
                        </ActionLink>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </section>
    </main>
  );
}
