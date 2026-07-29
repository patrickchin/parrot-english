import backgrounds from "../content/catalogs/backgrounds.json" with { type: "json" };
import characters from "../content/catalogs/characters.json" with { type: "json" };
import emotes from "../content/catalogs/emotes.json" with { type: "json" };
import {
  createCustomLessonCatalog,
  createLessonCatalog,
} from "../lib/lesson-data.js";

export const LESSON_BACKGROUNDS = backgrounds.map(({ alt, id }) => ({
  description: alt,
  id,
}));

export const LESSON_VISUAL_CATALOG = createLessonCatalog({
  backgrounds,
  characters,
  emotes,
});

export const CUSTOM_LESSON_VISUAL_CATALOG = createCustomLessonCatalog({
  backgrounds,
  characters,
});
