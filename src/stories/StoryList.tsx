import {
  ArrowLeft,
  BookOpen,
  Bot,
  CloudRain,
  Clock3,
  Flame,
  Headphones,
  Play,
  Sparkles,
} from "lucide-react";
import { getStoryPagePath } from "../app/app-routes";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import { ActionLink } from "../shared/ui";
import { STORIES, UPCOMING_STORIES } from "./story-catalog";

function UpcomingStoryIcon({ title }: { title: string }) {
  const className = "size-8";

  if (title.includes("Cloud")) {
    return <CloudRain aria-hidden="true" className={className} />;
  }
  if (title.includes("Dragon")) {
    return <Flame aria-hidden="true" className={className} />;
  }
  return <Bot aria-hidden="true" className={className} />;
}

export function StoryList() {
  const featuredStory = STORIES[0];

  return (
    <main className="relative h-dvh w-screen overflow-x-hidden overflow-y-auto bg-story-shelf px-3 pb-12 pt-24 short:pt-20 sm:px-4 md:px-8 md:pb-16 md:pt-32 lg:px-16">
      <RouteHeader>
        <HeaderLink aria-label="Back to home" icon={<ArrowLeft />} to="/">
          Back to home
        </HeaderLink>
      </RouteHeader>

      <header className="mx-auto mb-6 w-full max-w-6xl text-center md:mb-9">
        <span className="mb-2 inline-flex items-center gap-2 rounded-full border-3 border-white bg-brand-navy px-3 py-1 text-xs font-black uppercase tracking-wider text-white shadow-control-navy sm:text-sm">
          <Headphones aria-hidden="true" className="size-4" /> Storytime
        </span>
        <h1 className="m-0 text-4xl leading-none tracking-tight text-brand-ink sm:text-6xl lg:text-8xl">
          Storytelling
        </h1>
        <p className="mx-auto mb-0 mt-3 max-w-2xl text-base font-extrabold leading-relaxed text-brand-blue sm:text-xl">
          Choose a story, listen, and join in.
        </p>
      </header>

      <section
        aria-labelledby="read-aloud-stories-title"
        className="mx-auto w-full max-w-6xl"
      >
        <h2
          className="mb-3 mt-0 text-2xl leading-none text-brand-navy sm:text-3xl md:mb-5"
          id="read-aloud-stories-title"
        >
          Read-aloud stories
        </h2>

        <article className="grid overflow-hidden rounded-[2rem] border-4 border-white bg-white/95 shadow-card lg:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)]">
          <div className="relative min-h-52 overflow-hidden sm:min-h-72 lg:min-h-96">
            <img
              alt={featuredStory.coverAlt}
              className="absolute inset-0 h-full w-full object-cover"
              fetchPriority="high"
              height="1024"
              src={featuredStory.coverSrc}
              width="1536"
            />
            <span className="absolute left-3 top-3 rounded-full border-3 border-white bg-brand-yellow px-3 py-1 text-xs font-black uppercase tracking-wider text-brand-ink shadow-control-surface sm:left-5 sm:top-5">
              First story
            </span>
          </div>

          <div className="grid content-center gap-4 p-5 sm:p-7 lg:p-9">
            <div className="flex flex-wrap items-center gap-2 text-sm font-black text-brand-blue">
              <span className="rounded-full bg-sky-100 px-3 py-1">
                {featuredStory.category}
              </span>
              <span className="inline-flex items-center gap-1">
                <BookOpen aria-hidden="true" className="size-4" />
                {featuredStory.pages.length} pages
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock3 aria-hidden="true" className="size-4" />
                {featuredStory.durationMinutes} min
              </span>
            </div>
            <div>
              <h3 className="m-0 text-3xl leading-none text-brand-ink sm:text-4xl">
                {featuredStory.title}
              </h3>
              <p className="mb-0 mt-3 font-bold leading-relaxed text-slate-700">
                {featuredStory.summary}
              </p>
            </div>
            <p className="m-0 flex items-start gap-2 rounded-2xl bg-amber-100 p-3 text-sm font-extrabold leading-relaxed text-amber-950">
              <Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              Listen for the sounds, then say the special line together.
            </p>
            <ActionLink
              aria-label={`Read story: ${featuredStory.title}`}
              className="w-full gap-2 rounded-full border-4 border-white sm:w-fit"
              size="large"
              to={getStoryPagePath(featuredStory.id, 0)}
            >
              <Play aria-hidden="true" className="size-6 fill-current" />
              Open the story
            </ActionLink>
          </div>
        </article>
      </section>

      <section
        aria-labelledby="coming-next-title"
        className="mx-auto mt-9 w-full max-w-6xl md:mt-12"
      >
        <div className="mb-3 flex items-end justify-between gap-4 md:mb-5">
          <h2
            className="m-0 text-2xl leading-none text-brand-navy sm:text-3xl"
            id="coming-next-title"
          >
            More stories on the shelf
          </h2>
          <span className="hidden rounded-full bg-white/75 px-3 py-1 text-xs font-black uppercase tracking-wider text-brand-blue sm:inline">
            Coming next
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-3 md:gap-5">
          {UPCOMING_STORIES.map((story, index) => (
            <article
              className="grid min-h-48 content-between gap-5 rounded-3xl border-4 border-white bg-white/85 p-5 shadow-card"
              key={story.title}
            >
              <div
                aria-hidden="true"
                className={`grid size-14 place-items-center rounded-2xl border-3 border-white text-white shadow-control-navy ${
                  index === 0
                    ? "bg-sky-600"
                    : index === 1
                      ? "bg-brand-rose"
                      : "bg-brand-green"
                }`}
              >
                <UpcomingStoryIcon title={story.title} />
              </div>
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wide text-brand-blue">
                  <span>{story.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>{story.durationMinutes} min</span>
                </div>
                <h3 className="m-0 text-xl leading-tight text-brand-ink sm:text-2xl">
                  {story.title}
                </h3>
                <p className="mb-0 mt-2 text-sm font-bold leading-relaxed text-slate-700">
                  {story.summary}
                </p>
              </div>
              <span className="w-fit rounded-full bg-brand-navy px-3 py-1 text-xs font-black uppercase tracking-wider text-white">
                Coming next
              </span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
