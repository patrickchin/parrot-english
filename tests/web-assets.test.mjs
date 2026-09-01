import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const publicAssetsDir = join(publicDir, "assets");
const indexFile = fileURLToPath(new URL("../index.html", import.meta.url));
const manifestFile = fileURLToPath(
  new URL("../public/manifest.webmanifest", import.meta.url),
);
const backgroundCatalogFile = fileURLToPath(
  new URL("../content/catalogs/backgrounds.json", import.meta.url),
);
const characterCatalogFile = fileURLToPath(
  new URL("../content/catalogs/characters.json", import.meta.url),
);
const lessonCoverCatalogFile = fileURLToPath(
  new URL("../content/catalogs/lesson-covers.json", import.meta.url),
);
const webAssetExtensions = new Set([".mp3", ".svg", ".webp"]);
const staticImageExtensions = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
]);
const runtimeMediaPattern =
  /^https:\/\/media\.parrotbook\.com\/assets\/v[1-9]\d*\/[a-z0-9/_-]+\.webp$/;
const safeSlug = "[a-z0-9]+(?:-[a-z0-9]+)*";
const rhymeManifestPattern = new RegExp(
  `^nursery-rhymes/${safeSlug}/rhyme\\.json$`,
);
const rhymeScorePattern = new RegExp(
  `^nursery-rhymes/${safeSlug}/score\\.musicxml$`,
);
const rhymeGuidePattern = new RegExp(
  `^nursery-rhymes/${safeSlug}/guides/${safeSlug}\\.mp3$`,
);
const wordGameFluentPattern =
  /^word-games\/fluent-3d\/[a-f0-9]+(?:_[a-f0-9]+)*\.png$/;

function isSupportedAsset(filePath) {
  if (filePath.startsWith("nursery-rhymes/")) {
    return rhymeManifestPattern.test(filePath)
      || rhymeScorePattern.test(filePath)
      || rhymeGuidePattern.test(filePath);
  }
  return wordGameFluentPattern.test(filePath) || webAssetExtensions.has(extname(filePath));
}

async function listAssetFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const filePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listAssetFiles(filePath)));
      continue;
    }

    files.push(filePath);
  }

  return files;
}

describe("web asset formats", () => {
  it("allows only validated nursery-rhyme package asset locations", () => {
    for (const filePath of [
      "nursery-rhymes/twinkle-twinkle/rhyme.json",
      "nursery-rhymes/twinkle-twinkle/score.musicxml",
      "nursery-rhymes/twinkle-twinkle/guides/twinkle-twinkle-v1-guide-line-1.mp3",
    ]) {
      assert.equal(isSupportedAsset(filePath), true, filePath);
    }
    for (const filePath of [
      "arbitrary.json",
      "nursery-rhymes/twinkle-twinkle/extra.json",
      "nursery-rhymes/twinkle-twinkle/guides/score.musicxml",
      "nursery-rhymes/twinkle-twinkle/nested/rhyme.json",
      "nursery-rhymes/Unsafe/rhyme.json",
      "nursery-rhymes/twinkle-twinkle/not-guides/line.mp3",
    ]) {
      assert.equal(isSupportedAsset(filePath), false, filePath);
    }
  });

  it("keeps public lesson assets in browser-friendly formats", async () => {
    const files = await listAssetFiles(publicAssetsDir);
    const unsupportedFiles = files
      .map((filePath) => relative(publicAssetsDir, filePath))
      .filter((filePath) => !isSupportedAsset(filePath));

    assert.deepEqual(unsupportedFiles, []);
  });

  it("delivers every lesson background from immutable R2 media URLs", async () => {
    const backgrounds = JSON.parse(await readFile(backgroundCatalogFile, "utf8"));

    for (const background of backgrounds) {
      assert.match(
        background.src,
        new RegExp(
          `^https://media\\.parrotbook\\.com/backgrounds/${background.id}/v[1-9]\\d*/landscape\\.webp$`,
        ),
      );
    }

    await assert.rejects(access(join(publicAssetsDir, "backgrounds")), {
      code: "ENOENT",
    });
  });

  it("keeps static runtime imagery in R2 instead of the deployment bundle", async () => {
    const files = await listAssetFiles(publicDir);
    const bundledImages = files
      .filter((filePath) => staticImageExtensions.has(extname(filePath)))
      .filter((filePath) => !wordGameFluentPattern.test(relative(publicAssetsDir, filePath)))
      .map((filePath) => relative(publicDir, filePath));

    assert.deepEqual(bundledImages, []);
  });

  it("uses versioned R2 URLs for app icons and social previews", async () => {
    const [indexHtml, manifest] = await Promise.all([
      readFile(indexFile, "utf8"),
      readFile(manifestFile, "utf8").then(JSON.parse),
    ]);
    const brandMediaPattern =
      /^https:\/\/media\.parrotbook\.com\/assets\/v3\/brand\/[a-z0-9-]+\.png$/;
    const indexMedia = [...indexHtml.matchAll(/(?:href|content)="(https:[^"]+\.png)"/g)]
      .map((match) => match[1]);

    assert.equal(indexMedia.length, 5);
    for (const src of [...indexMedia, ...manifest.icons.map((icon) => icon.src)]) {
      assert.match(src, brandMediaPattern);
    }
  });

  it("uses immutable R2 URLs for character and lesson-cover catalogs", async () => {
    const [characters, lessonCovers] = await Promise.all([
      readFile(characterCatalogFile, "utf8").then(JSON.parse),
      readFile(lessonCoverCatalogFile, "utf8").then(JSON.parse),
    ]);
    const characterImages = characters.flatMap((character) =>
      Object.values(character.assets).map((asset) => asset.src),
    );

    for (const src of [
      ...characterImages,
      ...lessonCovers.map((cover) => cover.src),
    ]) {
      assert.match(src, runtimeMediaPattern);
    }
  });
});
