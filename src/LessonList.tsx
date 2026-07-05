import { BookOpen, Play, Sparkles } from "lucide-react";
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

export function LessonList({ onOpenLesson }: LessonListProps) {
  const cards = LESSONS.map(createAvailableLessonCard);

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
          <article className="lesson-card is-available" key={lesson.id}>
            <div className="lesson-card-artwork">
              <img src={lesson.artworkSrc} alt={lesson.artworkAlt} />
              <span className="lesson-card-number">{index + 1}</span>
            </div>

            <div className="lesson-card-content">
              <h2>{lesson.title}</h2>
              <p>{lesson.summary}</p>
              <span className="lesson-scene-count">
                <BookOpen aria-hidden="true" /> {lesson.sceneCount} scenes
              </span>
              <button
                aria-label={`Start ${lesson.title}`}
                className="lesson-card-action"
                onClick={() => onOpenLesson(lesson.id)}
                type="button"
              >
                <Play aria-hidden="true" /> Start lesson
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
