import { ArrowLeft, Play } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";
import lessonCovers from "../../content/catalogs/lesson-covers.json";
import { getLessonScenePath } from "../app/app-routes";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import {
  LESSONS,
  VISUAL_CATALOG,
  type LessonCatalogEntry,
} from "./lesson-catalog";
import {
  InteractiveCardLink,
} from "../shared/ui";

type LessonCard = {
  id: string;
  title: string;
  sceneCount: number;
  artworkSrc: string;
  artworkAlt: string;
  practiceText: string;
};

type LessonArtwork = {
  alt: string;
  src: string;
};

const LESSON_SHELF_IMAGE_SIZES =
  "(max-width: 359px) 104px, (max-width: 639px) calc((100vw - 36px) / 2), (max-width: 1023px) calc((100vw - 64px) / 3), (max-width: 1279px) calc((100vw - 176px) / 4), 276px";

function responsiveShelfSrcSet(src: string) {
  return ([384, 768] as const)
    .map((width) => `${src.replace(/\.webp$/, `-${width}.webp`)} ${width}w`)
    .join(", ");
}

const readyMadeArtwork = new Map<string, LessonArtwork>(
  lessonCovers.map(({ alt, id, src }) => [id, { alt, src }]),
);

const READY_MADE_PRACTICE_TEXT = new Map([
  ["01-peppas-high-ball", "Say: Can you help me?"],
  ["02-garden-colors", "Say: It is red."],
  ["03-snack-time", "Say: May I have an apple?"],
  ["04-playground-words", "Say: Can I have a turn?"],
  ["05-market-day", "Say: Two apples, please."],
  ["06-picnic-time", "Say: Yes, please."],
  ["07-bedtime-story", "Say: Good night."],
]);

function createAvailableLessonCard(
  entry: LessonCatalogEntry,
  preferredArtwork: LessonArtwork | undefined,
  practiceText: string,
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
    sceneCount: entry.lesson.scenes.length,
    artworkSrc: artwork.src,
    artworkAlt: artwork.alt,
    practiceText,
  };
}

function LessonCardView({
  index,
  lesson,
  source,
}: {
  index: number;
  lesson: LessonCard;
  source: "my" | "parrot";
}) {
  const lessonPath = getLessonScenePath(source, lesson.id, 0);
  const CardHeading = source === "parrot" ? "h2" : "h3";

  return (
    <article className="grid min-w-0">
      <InteractiveCardLink
        aria-label={`Start lesson: ${lesson.title}`}
        className="group grid h-full min-h-32 grid-cols-[6.5rem_minmax(0,1fr)] overflow-hidden p-0 text-left min-[360px]:grid-cols-1"
        to={lessonPath}
        tone="solid"
      >
        <div className="relative min-h-32 overflow-hidden bg-sky-100 min-[360px]:aspect-[4/3] min-[360px]:min-h-0">
          <img
            alt={lesson.artworkAlt}
            className="h-full w-full object-cover"
            decoding="async"
            fetchPriority={source === "parrot" && index === 0 ? "high" : undefined}
            loading={source === "parrot" && index < 2 ? "eager" : "lazy"}
            sizes={source === "parrot" ? LESSON_SHELF_IMAGE_SIZES : undefined}
            src={lesson.artworkSrc}
            srcSet={source === "parrot" ? responsiveShelfSrcSet(lesson.artworkSrc) : undefined}
          />
        </div>

        <div className="grid min-w-0 grid-rows-[auto_1fr_auto] gap-1.5 p-3 min-[360px]:gap-2 min-[360px]:p-3.5 sm:p-4">
          <CardHeading className="m-0 line-clamp-2 text-lg leading-tight text-brand-navy sm:text-xl">
            {lesson.title}
          </CardHeading>
          <p className="m-0 text-sm font-extrabold leading-snug text-slate-700 sm:text-base">
            {lesson.practiceText}
          </p>
          <div className="flex min-w-0 items-center justify-end">
            <span
              aria-hidden="true"
              className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full bg-brand-pink px-3 text-sm font-black text-brand-action-ink shadow-control-pink"
            >
              <Play aria-hidden="true" className="size-4 fill-current" />
              <span className="hidden sm:inline">Play</span>
            </span>
          </div>
        </div>
      </InteractiveCardLink>
    </article>
  );
}

export function LessonListView() {
  const cards = LESSONS.map((entry) =>
    createAvailableLessonCard(
      entry,
      readyMadeArtwork.get(entry.id),
      READY_MADE_PRACTICE_TEXT.get(entry.id) ?? "Listen and speak.",
    ),
  );
  return (
    <main className="relative h-dvh w-screen overflow-x-hidden overflow-y-auto bg-lesson-list px-3 pb-10 pt-21 short:pt-18 sm:px-4 md:px-8 md:pb-16 md:pt-28 lg:px-16">
      <RouteHeader>
        <HeaderLink
          aria-label="Back to home"
          icon={<ArrowLeft />}
          to="/"
        >
          Back to home
        </HeaderLink>
      </RouteHeader>

      <header className="mx-auto mb-5 w-full max-w-6xl text-center md:mb-8">
        <h1
          className="mx-auto my-0 w-fit max-w-full text-4xl leading-none tracking-tight text-brand-navy outline-none sm:text-6xl lg:text-7xl forced-colors:focus:outline-2 forced-colors:focus:outline-solid forced-colors:focus:outline-offset-2"
          tabIndex={-1}
        >
          Pick a lesson
        </h1>
      </header>

      <section
        aria-label="Lessons"
        className="mx-auto w-full max-w-6xl"
      >
        <div className="grid gap-3 min-[360px]:grid-cols-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
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

    </main>
  );
}

export function LessonList() {
  return <LessonListView />;
}
