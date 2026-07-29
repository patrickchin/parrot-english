import { ArrowLeft, BookOpen, Pencil, Play, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import lessonCovers from "../../content/catalogs/lesson-covers.json";
import { getLessonScenePath, getMyLessonEditPath } from "../app/app-routes";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import {
  LESSONS,
  VISUAL_CATALOG,
  type LessonCatalogEntry,
} from "./lesson-catalog";
import { ActionButton, ActionLink } from "../shared/ui";
import {
  loadMyLessons,
  type MyLessonDescriptor,
} from "./my-lessons-api";

type LessonCard = {
  id: string;
  title: string;
  summary: string;
  sceneCount: number;
  artworkSrc: string;
  artworkAlt: string;
};

type LessonArtwork = {
  alt: string;
  src: string;
};

const readyMadeArtwork = new Map<string, LessonArtwork>(
  lessonCovers.map(({ alt, id, src }) => [id, { alt, src }]),
);

function createAvailableLessonCard(
  entry: LessonCatalogEntry,
  preferredArtwork?: LessonArtwork,
): LessonCard {
  const firstScene = entry.lesson.scenes[0];
  const artwork =
    preferredArtwork ??
    (firstScene
      ? VISUAL_CATALOG.backgrounds.get(firstScene.background)
      : undefined);

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
  onRetryMyLessons: () => void;
};

function LessonCardView({
  index,
  lesson,
  source,
}: {
  index: number;
  lesson: LessonCard;
  source: "my" | "parrot";
}) {
  return (
    <article className="flex min-w-0 items-center gap-2 overflow-hidden rounded-2xl border-4 border-white/95 bg-white/95 p-2 shadow-card sm:gap-3 sm:rounded-3xl sm:p-3">
      <div className="relative size-14 shrink-0 overflow-hidden rounded-xl min-[360px]:size-16 sm:size-18 lg:size-20">
        <img
          alt={lesson.artworkAlt}
          className="h-full w-full object-cover"
          src={lesson.artworkSrc}
        />
        <span className="absolute bottom-1 left-1 grid size-5 place-items-center rounded-full border-2 border-white bg-brand-pink text-[0.625rem] font-black text-white shadow-control-pink sm:size-6 sm:text-xs">
          {index + 1}
        </span>
      </div>

      <div className="grid min-w-0 flex-1 content-center gap-0.5">
        <h3 className="m-0 line-clamp-2 text-base leading-tight text-brand-navy sm:text-lg">
          {lesson.title}
        </h3>
        <p className="m-0 hidden text-xs font-bold leading-snug text-slate-700 min-[360px]:block min-[360px]:truncate sm:text-sm">
          {lesson.summary}
        </p>
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex min-w-0 items-center gap-1 text-xs font-black text-sky-900 sm:text-sm">
            <BookOpen aria-hidden="true" className="size-4" />{" "}
            {lesson.sceneCount} scenes
          </span>
          {source === "my" ? (
            <ActionLink
              aria-label={`Edit lesson: ${lesson.title}`}
              className="min-h-8 min-w-0 gap-1 rounded-lg px-1 text-xs text-brand-blue underline underline-offset-2 shadow-none sm:text-sm"
              size="bare"
              to={getMyLessonEditPath(lesson.id)}
            >
              <Pencil aria-hidden="true" className="size-3.5 shrink-0" />
              Edit
            </ActionLink>
          ) : null}
        </div>
      </div>

      <ActionLink
        aria-label={`Start lesson: ${lesson.title}`}
        className="size-12 shrink-0 gap-1 rounded-full border-3 border-white p-0 min-[360px]:w-24 min-[360px]:px-3 sm:w-28"
        size="bare"
        to={getLessonScenePath(source, lesson.id, 0)}
      >
        <Play aria-hidden="true" className="size-5 shrink-0" />
        <span className="hidden min-[360px]:inline">Start</span>
      </ActionLink>
    </article>
  );
}

export function LessonListView({
  isLoadingMyLessons,
  myLessons,
  myLessonsError,
  onRetryMyLessons,
}: LessonListViewProps) {
  const cards = LESSONS.map((entry) =>
    createAvailableLessonCard(entry, readyMadeArtwork.get(entry.id)),
  );
  const myCards = myLessons.map((entry) => createAvailableLessonCard(entry));

  return (
    <main className="relative h-dvh w-screen overflow-x-hidden overflow-y-auto bg-lesson-list px-3 pb-12 pt-24 short:pt-20 sm:px-4 md:px-8 md:pb-16 md:pt-32 lg:px-16">
      <RouteHeader>
        <HeaderLink
          aria-label="Back to home"
          icon={<ArrowLeft />}
          to="/"
        >
          Back to home
        </HeaderLink>
      </RouteHeader>

      <header className="mx-auto mb-6 w-full max-w-6xl text-center md:mb-10">
        <h1 className="m-0 text-4xl leading-none tracking-tight text-brand-navy sm:text-6xl lg:text-8xl">
          Lessons
        </h1>
        <p className="mx-auto mb-0 mt-2 max-w-xl text-sm font-extrabold leading-relaxed text-brand-blue sm:mt-3 sm:text-lg">
          Choose a story and start speaking.
        </p>
      </header>

      <section
        aria-labelledby="parrot-lessons-title"
        className="mx-auto mb-12 w-full max-w-6xl md:mb-16"
      >
        <h2
          className="mb-4 mt-0 text-2xl leading-none text-brand-navy sm:text-3xl md:mb-5 md:text-4xl"
          id="parrot-lessons-title"
        >
          Ready-made lessons
        </h2>
        <div className="grid gap-2 sm:gap-3">
          {cards.map((lesson, index) => (
            <LessonCardView
              index={index}
              key={lesson.id}
              lesson={lesson}
              source="parrot"
            />
          ))}
        </div>
      </section>

      <section
        aria-labelledby="my-lessons-title"
        className="mx-auto w-full max-w-6xl"
      >
        <h2
          className="mb-4 mt-0 text-2xl leading-none text-brand-navy sm:text-3xl md:mb-5 md:text-4xl"
          id="my-lessons-title"
        >
          My lessons
        </h2>
        {myCards.length > 0 ? (
          <div className="grid gap-2 sm:gap-3">
            {myCards.map((lesson, index) => (
              <LessonCardView
                index={index}
                key={lesson.id}
                lesson={lesson}
                source="my"
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-36 flex-col items-stretch justify-between gap-5 rounded-3xl border-4 border-dashed border-brand-navy/50 bg-white/65 p-6 md:flex-row md:items-center md:p-9">
            <div className="grid gap-2">
              <p
                className="m-0 text-lg font-extrabold text-brand-blue md:text-xl"
                role={isLoadingMyLessons ? "status" : myLessonsError ? "alert" : undefined}
              >
                {isLoadingMyLessons
                  ? "Loading your custom lessons…"
                  : myLessonsError || "No custom lessons yet."}
              </p>
              {!isLoadingMyLessons && !myLessonsError ? (
                <p className="m-0 max-w-xl font-bold leading-relaxed text-slate-700">
                  A grown-up can make a lesson about something you want to
                  practice.
                </p>
              ) : null}
              {myLessonsError ? (
                <ActionButton
                  className="mt-1 w-fit"
                  onClick={onRetryMyLessons}
                  size="compact"
                  type="button"
                  variant="navy"
                >
                  Try again
                </ActionButton>
              ) : null}
            </div>
            <ActionLink
              className="w-full shrink-0 gap-2 rounded-full border-4 border-white md:w-auto"
              to="/lessons/my/create"
            >
              <Plus aria-hidden="true" /> Create custom lesson
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
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoadingMyLessons(true);
    setMyLessonsError("");
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
  }, [reloadKey]);

  return (
    <LessonListView
      isLoadingMyLessons={isLoadingMyLessons}
      myLessons={myLessons}
      myLessonsError={myLessonsError}
      onRetryMyLessons={() => setReloadKey((current) => current + 1)}
    />
  );
}
