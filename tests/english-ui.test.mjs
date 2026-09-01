import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const han = /\p{Script=Han}/u;
const textExtensions = new Set([
  ".html",
  ".js",
  ".json",
  ".mjs",
  ".svg",
  ".ts",
  ".tsx",
  ".webmanifest",
]);
const hanCatalogFiles = new Set([
  "src/i18n/messages/en.ts",
  "src/i18n/messages/zh-Hans.ts",
]);
const questionnaireExceptions = new Set([
  "content/learner-profile/questionnaire-v1.json",
  "content/learner-profile/questionnaire-v2.json",
]);

function collectTextFiles(path) {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((entry) => {
    const child = resolve(path, entry);
    if (statSync(child).isDirectory()) return collectTextFiles(child);
    return textExtensions.has(extname(child)) ? [child] : [];
  });
}

function projectPath(file) {
  return relative(root, file).replaceAll("\\", "/");
}

function assertNoHan(file) {
  assert.doesNotMatch(readFileSync(file, "utf8"), han, projectPath(file));
}

function visitLeaves(value, path = [], leaves = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitLeaves(item, [...path, index], leaves));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) =>
      visitLeaves(item, [...path, key], leaves));
  } else {
    leaves.push({ path: path.join("."), value });
  }
  return leaves;
}

describe("English-only shipped UI", () => {
  it("confines Han copy to guardian catalogs and questionnaire promptZh leaves", () => {
    const shippedRoots = [
      "src",
      "lib",
      "worker",
      "content",
      "index.html",
      "vite.config.ts",
      "public/manifest.webmanifest",
      "public/assets/nursery-rhymes",
    ];

    for (const file of shippedRoots.flatMap((path) =>
      collectTextFiles(resolve(root, path)))) {
      const path = projectPath(file);
      const source = readFileSync(file, "utf8");
      if (hanCatalogFiles.has(path)) {
        if (path.endsWith("/zh-Hans.ts")) assert.match(source, han, path);
        else assert.doesNotMatch(source.replaceAll("中文", ""), han, path);
      } else if (!questionnaireExceptions.has(path)) {
        assert.doesNotMatch(source, han, path);
      }
    }

    for (const path of questionnaireExceptions) {
      const questionnaire = JSON.parse(readFileSync(resolve(root, path), "utf8"));
      const hanLeaves = visitLeaves(questionnaire).filter(
        ({ value }) => typeof value === "string" && han.test(value),
      );
      assert.ok(hanLeaves.length > 0, `${path} should retain promptZh content`);
      for (const leaf of hanLeaves) {
        assert.match(leaf.path, /\.promptZh$/, `${path}:${leaf.path}`);
      }
    }
  });

  it("keeps curriculum, rhyme, media, and static-audio contracts Han-free", () => {
    const protectedPaths = [
      "src/lessons",
      "src/stories/story-catalog.ts",
      "src/stories/story-script-candidates.ts",
      "src/stories/long-stories.ts",
      "src/games",
      "src/dubbing/generated-rhyme-catalog.ts",
      "src/dubbing/rhyme-catalog.ts",
      "lib/lesson-data.js",
      "lib/static-audio.js",
      "content/lessons",
      "content/catalogs",
      "content/media",
      "public/assets/nursery-rhymes",
    ];

    for (const path of protectedPaths) {
      const files = collectTextFiles(resolve(root, path));
      assert.ok(files.length > 0, `${path} must remain in the boundary audit`);
      files.forEach(assertNoHan);
    }
  });

  it("declares the static learner manifest as English", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(root, "public/manifest.webmanifest"), "utf8"),
    );
    assert.equal(manifest.lang, "en");
  });

});
