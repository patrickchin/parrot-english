/// <reference types="vite/client" />

import backgrounds from "../../content/catalogs/backgrounds.json";
import characters from "../../content/catalogs/characters.json";
import emotes from "../../content/catalogs/emotes.json";
import {
  createLessonCatalog,
  validateLesson,
} from "../../lib/lesson-data";

const lessonModules = import.meta.glob("../../content/lessons/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

export const VISUAL_CATALOG = createLessonCatalog({
  emotes,
  characters,
  backgrounds,
});

export type Lesson = ReturnType<typeof validateLesson>;
export type LessonCatalogEntry = {
  id: string;
  lesson: Lesson;
};

export const LESSONS: LessonCatalogEntry[] = Object.entries(lessonModules)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([path, value]) => ({
    id: path.split("/").at(-1)!.replace(/\.json$/, ""),
    lesson: validateLesson(value, VISUAL_CATALOG, path),
  }));

if (LESSONS.length === 0) {
  throw new Error("No lesson JSON files were discovered.");
}
