import {
  ArrowLeft,
  BookOpen,
  LockKeyhole,
  Pencil,
  Play,
  Plus,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import lessonCovers from "../../content/catalogs/lesson-covers.json";
import {
  getLessonScenePath,
  getMyLessonEditPath,
} from "../app/app-routes";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import {
  LESSONS,
  VISUAL_CATALOG,
  type LessonCatalogEntry,
} from "./lesson-catalog";
import {
  ActionButton,
  ActionLink,
  cardClassName,
  cx,
  InteractiveCardLink,
  TextLink,
} from "../shared/ui";
import {
  loadMyLessons,
  type MyLessonDescriptor,
} from "./my-lessons-api";

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
  preferredArtwork?: LessonArtwork,
  practiceText = "A lesson made for you.",
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

type LessonListViewProps = {
  grownUpToolsHeadingRef?: RefObject<HTMLHeadingElement | null>;
  myLessons: MyLessonDescriptor[];
  myLessonsLoadPhase: MyLessonsLoadPhase;
  onRetryMyLessons: () => void;
};

type MyLessonsLoadPhase = "error" | "loading" | "ready" | "retrying";

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

  return (
    <article className="grid min-w-0 gap-1.5">
      <InteractiveCardLink
        aria-label={`Start lesson: ${lesson.title}`}
        className="group grid h-full min-h-32 grid-cols-[6.5rem_minmax(0,1fr)] overflow-hidden p-0 text-left min-[360px]:grid-cols-1"
        to={lessonPath}
        tone="solid"
      >
        <div className="relative min-h-32 overflow-hidden bg-sky-100 min-[360px]:aspect-[4/3] min-[360px]:min-h-0">
          <img
            alt={lesson.artworkAlt}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transition-none"
            decoding="async"
            fetchPriority={source === "parrot" && index === 0 ? "high" : undefined}
            loading={source === "parrot" && index < 2 ? "eager" : "lazy"}
            sizes={source === "parrot" ? LESSON_SHELF_IMAGE_SIZES : undefined}
            src={lesson.artworkSrc}
            srcSet={source === "parrot" ? responsiveShelfSrcSet(lesson.artworkSrc) : undefined}
          />
        </div>

        <div className="grid min-w-0 grid-rows-[auto_1fr_auto] gap-1.5 p-3 min-[360px]:gap-2 min-[360px]:p-3.5 sm:p-4">
          <h3 className="m-0 line-clamp-2 text-lg leading-tight text-brand-navy sm:text-xl">
            {lesson.title}
          </h3>
          <p className="m-0 text-sm font-extrabold leading-snug text-slate-700 sm:text-base">
            {lesson.practiceText}
          </p>
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-1 text-xs font-black text-sky-900 sm:text-sm">
              <BookOpen aria-hidden="true" className="size-4 shrink-0" />
              {lesson.sceneCount} parts
            </span>
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
      {source === "my" ? (
        <TextLink
          aria-label={`Edit lesson: ${lesson.title}`}
          className="mx-2 gap-1 text-xs sm:text-sm"
          to={getMyLessonEditPath(lesson.id)}
        >
          <Pencil aria-hidden="true" className="size-3.5 shrink-0" />
          Grown-up: edit
        </TextLink>
      ) : null}
    </article>
  );
}

export function LessonListView({
  grownUpToolsHeadingRef,
  myLessons,
  myLessonsLoadPhase,
  onRetryMyLessons,
}: LessonListViewProps) {
  const cards = LESSONS.map((entry) =>
    createAvailableLessonCard(
      entry,
      readyMadeArtwork.get(entry.id),
      READY_MADE_PRACTICE_TEXT.get(entry.id) ?? "Listen and speak.",
    ),
  );
  const myCards = myLessons.map((entry) => createAvailableLessonCard(entry));

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
          className="relative mx-auto my-0 w-fit max-w-full text-4xl leading-none tracking-tight text-brand-navy outline-none before:absolute before:top-[20%] before:-left-4 before:h-[60%] before:max-h-24 before:w-1 before:rounded-full before:transition-none before:content-[''] focus:before:bg-brand-blue sm:text-6xl lg:text-7xl forced-colors:before:hidden forced-colors:focus:outline-2 forced-colors:focus:outline-solid forced-colors:focus:outline-offset-2"
          tabIndex={-1}
        >
          Pick a lesson
        </h1>
        <p className="mx-auto mb-0 mt-2 max-w-xl text-base font-extrabold leading-snug text-brand-blue sm:mt-3 sm:text-lg">
          Listen. Then speak.
        </p>
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

      {myCards.length > 0 ? (
        <section
          aria-labelledby="my-lessons-title"
          className="mx-auto mt-10 w-full max-w-6xl md:mt-14"
        >
          <h2
            className="mb-4 mt-0 text-2xl leading-none text-brand-navy sm:text-3xl md:mb-5 md:text-4xl"
            id="my-lessons-title"
          >
            Made for you
          </h2>
          <div className="grid gap-3 min-[360px]:grid-cols-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {myCards.map((lesson, index) => (
              <LessonCardView
                index={index}
                key={lesson.id}
                lesson={lesson}
                source="my"
              />
            ))}
          </div>
        </section>
      ) : null}

      <aside
        aria-labelledby="grown-up-tools-title"
        className={cardClassName({
          className:
            "mx-auto mt-10 flex w-full max-w-6xl flex-col items-stretch justify-between gap-4 border-dashed border-brand-navy/45 p-5 sm:flex-row sm:items-center md:mt-14 md:p-7",
          elevation: "soft",
          tone: "muted",
        })}
      >
        <div className="grid min-w-0 gap-1.5 sm:min-w-50">
          <h2
            className="m-0 flex items-center gap-2 rounded-lg text-xl leading-none text-brand-navy focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand-ink sm:text-2xl"
            id="grown-up-tools-title"
            ref={grownUpToolsHeadingRef}
            tabIndex={-1}
          >
            <LockKeyhole aria-hidden="true" className="size-5 shrink-0" />
            Grown-up tools
          </h2>
          <p className="m-0 font-bold leading-snug text-slate-700">
            Make a new lesson.
          </p>
          <p
            aria-atomic="true"
            aria-live="polite"
            className="m-0 text-sm font-extrabold leading-snug text-brand-blue"
            id="my-lessons-status"
            role="status"
          >
            {myLessonsLoadPhase === "loading" ||
            myLessonsLoadPhase === "retrying"
              ? "Loading My Lessons…"
              : myLessonsLoadPhase === "error"
                ? "We couldn't load My Lessons."
                : myCards.length > 0
                  ? `${myCards.length} made-for-you ${myCards.length === 1 ? "lesson" : "lessons"}.`
                  : "No made-for-you lessons yet."}
          </p>
          {myLessonsLoadPhase === "error" ||
          myLessonsLoadPhase === "retrying" ? (
            <ActionButton
              aria-disabled={
                myLessonsLoadPhase === "retrying" ? true : undefined
              }
              aria-describedby="my-lessons-status"
              className={cx(
                "mt-1 w-fit",
                myLessonsLoadPhase === "retrying" &&
                  "pointer-events-none opacity-60",
              )}
              onClick={
                myLessonsLoadPhase === "error"
                  ? onRetryMyLessons
                  : undefined
              }
              size="compact"
              type="button"
              variant="navy"
            >
              Try again
            </ActionButton>
          ) : null}
        </div>
        <ActionLink
          aria-label="Create custom lesson"
          className="w-full shrink-0 gap-2 sm:w-auto"
          to="/lessons/my/create"
        >
          <Plus aria-hidden="true" /> Make a lesson
        </ActionLink>
      </aside>
    </main>
  );
}

export function LessonList() {
  const [myLessons, setMyLessons] = useState<MyLessonDescriptor[]>([]);
  const [myLessonsLoadPhase, setMyLessonsLoadPhase] =
    useState<MyLessonsLoadPhase>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const focusAfterRetryRef = useRef(false);
  const grownUpToolsHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setMyLessonsLoadPhase((current) =>
      current === "retrying" ? current : "loading",
    );
    void loadMyLessons({ signal: controller.signal })
      .then((lessons) => {
        if (controller.signal.aborted) return;
        setMyLessons(lessons);
        setMyLessonsLoadPhase("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setMyLessons([]);
        setMyLessonsLoadPhase("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  useEffect(() => {
    if (myLessonsLoadPhase !== "ready" || !focusAfterRetryRef.current) return;
    focusAfterRetryRef.current = false;
    grownUpToolsHeadingRef.current?.focus();
  }, [myLessonsLoadPhase]);

  function retryMyLessons() {
    if (myLessonsLoadPhase !== "error") return;
    focusAfterRetryRef.current = true;
    setMyLessonsLoadPhase("retrying");
    setReloadKey((current) => current + 1);
  }

  return (
    <LessonListView
      grownUpToolsHeadingRef={grownUpToolsHeadingRef}
      myLessons={myLessons}
      myLessonsLoadPhase={myLessonsLoadPhase}
      onRetryMyLessons={retryMyLessons}
    />
  );
}
