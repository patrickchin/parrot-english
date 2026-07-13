import { ArrowLeft, BookOpen, Play, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { getLessonScenePath } from "../app/app-routes";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import {
  LESSONS,
  VISUAL_CATALOG,
  type LessonCatalogEntry,
} from "./lesson-catalog";
import { ActionLink } from "../shared/ui";
import {
  loadMyLessons,
  type MyLessonDescriptor,
} from "../my-lessons-api";

type LessonCard = {
  id: string;
  title: string;
  summary: string;
  sceneCount: number;
  artworkSrc: string;
  artworkAlt: string;
};

function createAvailableLessonCard(entry: LessonCatalogEntry): LessonCard {
  const firstScene = entry.lesson.scenes[0];
  const artwork = firstScene
    ? VISUAL_CATALOG.backgrounds.get(firstScene.background)
    : undefined;

  if (!artwork) {
    throw new Error(`Lesson ${entry.id} does not have catalog artwork.`);
  }

  return {
    id: entry.id,
    title: entry.lesson.title,
    summary: entry.lesson.summary,
    sceneCount: entry.lesson.scenes.length,
    artworkSrc: artwork.src,
    artworkAlt: artwork.alt,
  };
}

type LessonListViewProps = {
  isLoadingMyLessons: boolean;
  myLessons: MyLessonDescriptor[];
  myLessonsError: string;
};

export function LessonListView({
  isLoadingMyLessons,
  myLessons,
  myLessonsError,
}: LessonListViewProps) {
  const cards = LESSONS.map(createAvailableLessonCard);
  const myCards = myLessons.map(createAvailableLessonCard);

  return (
    <main className="relative h-dvh w-screen overflow-x-hidden overflow-y-auto bg-lesson-list px-4 pb-12 pt-40 md:px-8 md:pb-16 md:pt-32 lg:px-16">
      <RouteHeader>
        <HeaderLink
          aria-label="Back to main menu"
          icon={<ArrowLeft />}
          to="/"
        >
          Back to main menu
        </HeaderLink>
      </RouteHeader>

      <header className="mx-auto mb-6 w-full max-w-6xl text-center md:mb-10">
        <h1 className="m-0 text-5xl leading-none tracking-tight text-brand-navy sm:text-6xl lg:text-8xl">
          Choose a lesson
        </h1>
      </header>

      <section
        aria-labelledby="parrot-lessons-title"
        className="mx-auto mb-12 w-full max-w-6xl md:mb-16"
      >
        <h2
          className="mb-5 mt-0 text-3xl leading-none text-brand-navy md:text-4xl"
          id="parrot-lessons-title"
        >
          Parrot Lessons
        </h2>
        <div className="grid gap-4 md:gap-5">
          {cards.map((lesson, index) => (
            <article
              className="flex min-h-28 overflow-hidden rounded-2xl border-4 border-white/95 bg-white/95 shadow-card md:min-h-40 md:rounded-3xl md:border-6"
              key={lesson.id}
            >
              <div className="relative w-20 shrink-0 overflow-hidden sm:w-32 md:w-56">
                <img
                  alt={lesson.artworkAlt}
                  className="h-full w-full object-cover"
                  src={lesson.artworkSrc}
                />
                <span className="absolute left-2 top-2 grid size-10 place-items-center rounded-full border-3 border-white bg-brand-pink text-lg font-black text-white shadow-control-pink md:left-4 md:top-4 md:size-14 md:border-4 md:text-2xl">
                  {index + 1}
                </span>
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-2 p-3 md:gap-8 md:px-7 md:py-5">
                <div className="grid min-w-0 flex-1 gap-2">
                  <h3 className="m-0 text-lg leading-none text-brand-navy sm:text-2xl md:text-3xl">
                    {lesson.title}
                  </h3>
                  <p className="m-0 hidden font-bold leading-snug md:block">
                    {lesson.summary}
                  </p>
                  <span className="inline-flex items-center gap-1 text-xs font-black text-sky-900 sm:text-sm md:gap-2 md:text-base">
                    <BookOpen aria-hidden="true" className="size-5" />{" "}
                    {lesson.sceneCount} scenes
                  </span>
                </div>
                <ActionLink
                  aria-label={`Start lesson: ${lesson.title}`}
                  className="shrink-0 rounded-full border-3 border-white md:min-h-14 md:min-w-44 md:gap-2 md:border-4 md:px-4"
                  size="compact"
                  to={getLessonScenePath("parrot", lesson.id, 0)}
                >
                  <Play aria-hidden="true" className="size-5 shrink-0" />
                  Start lesson
                </ActionLink>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="my-lessons-title"
        className="mx-auto w-full max-w-6xl"
      >
        <h2
          className="mb-5 mt-0 text-3xl leading-none text-brand-navy md:text-4xl"
          id="my-lessons-title"
        >
          My Lessons
        </h2>
        {myCards.length > 0 ? (
          <div className="grid gap-4 md:gap-5">
            {myCards.map((lesson, index) => (
              <article
                className="flex min-h-28 overflow-hidden rounded-2xl border-4 border-white/95 bg-white/95 shadow-card md:min-h-40 md:rounded-3xl md:border-6"
                key={lesson.id}
              >
                <div className="relative w-20 shrink-0 overflow-hidden sm:w-32 md:w-56">
                  <img
                    alt={lesson.artworkAlt}
                    className="h-full w-full object-cover"
                    src={lesson.artworkSrc}
                  />
                  <span className="absolute left-2 top-2 grid size-10 place-items-center rounded-full border-3 border-white bg-brand-pink text-lg font-black text-white shadow-control-pink md:left-4 md:top-4 md:size-14 md:border-4 md:text-2xl">
                    {index + 1}
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-2 p-3 md:gap-8 md:px-7 md:py-5">
                  <div className="grid min-w-0 flex-1 gap-2">
                    <h3 className="m-0 text-lg leading-none text-brand-navy sm:text-2xl md:text-3xl">
                      {lesson.title}
                    </h3>
                    <p className="m-0 hidden font-bold leading-snug md:block">
                      {lesson.summary}
                    </p>
                    <span className="inline-flex items-center gap-1 text-xs font-black text-sky-900 sm:text-sm md:gap-2 md:text-base">
                      <BookOpen aria-hidden="true" className="size-5" />{" "}
                      {lesson.sceneCount} scenes
                    </span>
                  </div>
                  <ActionLink
                    aria-label={`Start lesson: ${lesson.title}`}
                    className="shrink-0 rounded-full border-3 border-white md:min-h-14 md:min-w-44 md:gap-2 md:border-4 md:px-4"
                    size="compact"
                    to={getLessonScenePath("my", lesson.id, 0)}
                  >
                    <Play aria-hidden="true" className="size-5 shrink-0" />
                    Start lesson
                  </ActionLink>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="flex min-h-36 flex-col items-stretch justify-between gap-5 rounded-3xl border-4 border-dashed border-brand-navy/50 bg-white/65 p-6 md:flex-row md:items-center md:p-9">
            <p className="m-0 text-lg font-extrabold text-brand-blue md:text-xl">
              {isLoadingMyLessons
                ? "Loading your lessons..."
                : myLessonsError || "You haven't created any lessons yet."}
            </p>
            <ActionLink
              className="w-full shrink-0 gap-2 rounded-full border-4 border-white md:w-auto"
              to="/lessons/my/create"
            >
              <Plus aria-hidden="true" /> Create a lesson
            </ActionLink>
          </div>
        )}
      </section>
    </main>
  );
}

export function LessonList() {
  const [myLessons, setMyLessons] = useState<MyLessonDescriptor[]>([]);
  const [myLessonsError, setMyLessonsError] = useState("");
  const [isLoadingMyLessons, setIsLoadingMyLessons] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void loadMyLessons({ signal: controller.signal })
      .then((lessons) => setMyLessons(lessons))
      .catch((caughtError: unknown) => {
        if (controller.signal.aborted) return;
        setMyLessonsError(
          caughtError instanceof Error
            ? caughtError.message
            : "Your lessons could not be loaded.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingMyLessons(false);
      });
    return () => controller.abort();
  }, []);

  return (
    <LessonListView
      isLoadingMyLessons={isLoadingMyLessons}
      myLessons={myLessons}
      myLessonsError={myLessonsError}
    />
  );
}
