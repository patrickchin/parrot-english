import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, extname } from "node:path";
import { describe, it } from "node:test";
import {
  createLessonCatalog,
  validateLesson,
} from "../lib/lesson-data.js";

const projectUrl = new URL("../", import.meta.url);

function readJson(path) {
  return JSON.parse(readFileSync(new URL(path, projectUrl), "utf8"));
}

describe("lesson catalog", () => {
  it("discovers lesson JSON modules eagerly with Vite", () => {
    const sourceUrl = new URL("src/lesson-catalog.ts", projectUrl);
    assert.equal(existsSync(sourceUrl), true, "src/lesson-catalog.ts must exist");

    const source = readFileSync(sourceUrl, "utf8");
    assert.match(
      source,
      /import\.meta\.glob\("\.\.\/content\/lessons\/\*\.json",\s*\{\s*eager:\s*true,\s*import:\s*"default",?\s*\}\)/s
    );
    assert.match(source, /localeCompare/);
    assert.match(source, /validateLesson/);
  });

  it("validates all lesson files in deterministic filename order", () => {
    const catalog = createLessonCatalog({
      emotes: readJson("content/catalogs/emotes.json"),
      characters: readJson("content/catalogs/characters.json"),
      backgrounds: readJson("content/catalogs/backgrounds.json"),
    });
    const lessonDir = new URL("content/lessons/", projectUrl);
    const filenames = readdirSync(lessonDir)
      .filter((name) => extname(name) === ".json")
      .sort((left, right) => left.localeCompare(right));
    const entries = filenames.map((filename) => ({
      id: basename(filename, ".json"),
      lesson: validateLesson(
        readJson(`content/lessons/${filename}`),
        catalog,
        filename
      ),
    }));

    assert.ok(entries.length > 0);
    assert.deepEqual(
      entries.map((entry) => entry.id),
      ["peppas-high-ball"]
    );
    assert.equal(entries[0].lesson.title, "Peppa's High Ball");
  });
});
