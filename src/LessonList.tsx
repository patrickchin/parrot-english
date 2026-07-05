import { ArrowLeft, BookOpen, Play, Plus, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { getLessonScenePath } from "./app-routes";
import {
  LESSONS,
  VISUAL_CATALOG,
  type LessonCatalogEntry,
} from "./lesson-catalog";

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

export function LessonList() {
  const cards = LESSONS.map(createAvailableLessonCard);

  return (
    <main className="lesson-list-page">
      <Link className="main-menu-link lesson-main-menu-link" to="/">
        <ArrowLeft aria-hidden="true" /> Back to main menu
      </Link>

      <header className="lesson-list-header">
        <span className="lesson-list-eyebrow">
          <Sparkles aria-hidden="true" /> Parrot English
        </span>
        <h1>Choose a lesson</h1>
        <p>Pick a story and start speaking English.</p>
      </header>

      <section
        aria-labelledby="parrot-lessons-title"
        className="lesson-catalog-section"
      >
        <h2 id="parrot-lessons-title">Parrot Lessons</h2>
        <div className="lesson-card-grid">
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
                <Link
                  aria-label={`Start ${lesson.title}`}
                  className="lesson-card-action"
                  to={getLessonScenePath("parrot", lesson.id, 0)}
                >
                  <Play aria-hidden="true" /> Start lesson
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="my-lessons-title"
        className="lesson-catalog-section my-lessons-section"
      >
        <h2 id="my-lessons-title">My Lessons</h2>
        <div className="my-lessons-empty">
          <p>You haven't created any lessons yet.</p>
          <Link to="/lessons/my/create">
            <Plus aria-hidden="true" /> Create a lesson
          </Link>
        </div>
      </section>
    </main>
  );
}
