import { BookOpen, LockKeyhole, Play, Sparkles } from "lucide-react";
import {
  LESSONS,
  VISUAL_CATALOG,
  type LessonCatalogEntry,
} from "./lesson-catalog";

type LessonListProps = {
  onOpenLesson: (lessonId: string) => void;
};

type LessonCard = {
  id: string;
  title: string;
  summary: string;
  sceneCount: number;
  artworkSrc: string;
  artworkAlt: string;
  available: boolean;
};

const UPCOMING_LESSONS: LessonCard[] = [
  {
    id: "market-day",
    title: "Market Day",
    summary: "Choose fruit and ask polite shopping questions.",
    sceneCount: 6,
    artworkSrc: "/assets/backgrounds/meadow-day.webp",
    artworkAlt: "A sunny meadow during the day",
    available: false,
  },
  {
    id: "picnic-time",
    title: "Picnic Time",
    summary: "Invite friends to share food and talk about favorites.",
    sceneCount: 5,
    artworkSrc: "/assets/backgrounds/meadow-evening.webp",
    artworkAlt: "A peaceful meadow in the evening",
    available: false,
  },
  {
    id: "bedtime-story",
    title: "Bedtime Story",
    summary: "Practice goodnight wishes and simple feelings in a calm story.",
    sceneCount: 5,
    artworkSrc: "/assets/backgrounds/reward-bg.webp",
    artworkAlt: "A cheerful celebration background",
    available: false,
  },
];

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
    available: true,
  };
}

export function LessonList({ onOpenLesson }: LessonListProps) {
  const cards = [
    ...LESSONS.map(createAvailableLessonCard),
    ...UPCOMING_LESSONS,
  ];

  return (
    <main className="lesson-list-page">
      <header className="lesson-list-header">
        <span className="lesson-list-eyebrow">
          <Sparkles aria-hidden="true" /> Parrot English
        </span>
        <h1>Choose a lesson</h1>
        <p>Pick a story and start speaking English.</p>
      </header>

      <section aria-label="English lessons" className="lesson-card-grid">
        {cards.map((lesson, index) => (
          <article
            className={`lesson-card ${
              lesson.available ? "is-available" : "is-disabled"
            }`}
            key={lesson.id}
          >
            <div className="lesson-card-artwork">
              <img src={lesson.artworkSrc} alt={lesson.artworkAlt} />
              <span className="lesson-card-number">{index + 1}</span>
              {!lesson.available ? (
                <span className="coming-soon-badge">
                  <LockKeyhole aria-hidden="true" /> Coming soon
                </span>
              ) : null}
            </div>

            <div className="lesson-card-content">
              <h2>{lesson.title}</h2>
              <p>{lesson.summary}</p>
              <span className="lesson-scene-count">
                <BookOpen aria-hidden="true" /> {lesson.sceneCount} scenes
              </span>
              <button
                aria-label={`${lesson.available ? "Start" : "Coming soon:"} ${lesson.title}`}
                className="lesson-card-action"
                disabled={!lesson.available}
                onClick={
                  lesson.available
                    ? () => onOpenLesson(lesson.id)
                    : undefined
                }
                type="button"
              >
                {lesson.available ? (
                  <>
                    <Play aria-hidden="true" /> Start lesson
                  </>
                ) : (
                  <>
                    <LockKeyhole aria-hidden="true" /> Coming soon
                  </>
                )}
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
