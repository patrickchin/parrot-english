import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import * as staticAudio from "../lib/static-audio.js";
import { runWordGameCatalogGenerator } from "../scripts/generate-word-game-catalog.mjs";
import * as wordGameCatalog from "../src/games/word-game-catalog.ts";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const fixtureRoot = join(repositoryRoot, "tests", "fixtures", "word-games");

async function createPackageRoot(context) {
  const rootDir = await mkdtemp(join(tmpdir(), "parrot-word-game-package-flow-"));
  context.after(() => rm(rootDir, { force: true, recursive: true }));

  const categoryRoot = join(rootDir, "content", "word-games", "categories");
  const audioRoot = join(rootDir, "public", "assets", "audio");
  const fluentRoot = join(rootDir, "public", "assets", "word-games", "fluent-3d");
  await Promise.all([
    mkdir(categoryRoot, { recursive: true }),
    mkdir(audioRoot, { recursive: true }),
    mkdir(fluentRoot, { recursive: true }),
    mkdir(join(rootDir, "src", "games"), { recursive: true }),
    mkdir(join(rootDir, "third_party"), { recursive: true }),
  ]);

  const animals = JSON.parse(await readFile(join(fixtureRoot, "animals.json"), "utf8"));
  const fixtureCategory = JSON.parse(JSON.stringify(animals));
  fixtureCategory.id = "fixtures";
  fixtureCategory.order = 2;
  fixtureCategory.title = "Fixtures";
  for (const item of fixtureCategory.items) {
    item.audio.id = item.audio.id.replace("word-game-animals-", "word-game-fixtures-");
  }

  await Promise.all([
    writeFile(join(categoryRoot, "animals.json"), `${JSON.stringify(animals, null, 2)}\n`),
    writeFile(
      join(categoryRoot, "fixtures.json"),
      `${JSON.stringify(fixtureCategory, null, 2)}\n`,
    ),
    cp(join(fixtureRoot, "fluent-3d-assets.json"), join(rootDir, "content", "word-games", "fluent-3d-assets.json")),
    cp(join(fixtureRoot, "cat_3d.png"), join(fluentRoot, "1f431.png")),
    cp(
      join(fixtureRoot, "fluentui-emoji-LICENSE"),
      join(rootDir, "third_party", "fluentui-emoji-LICENSE"),
    ),
    ...[...animals.items, ...fixtureCategory.items].map(({ audio }) =>
      cp(join(fixtureRoot, "tiny.mp3"), join(audioRoot, `${audio.id}.mp3`))),
  ]);

  return { fixtureCategory, rootDir };
}

test("package lifecycle gates both generated content catalogs", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.equal(
    packageJson.scripts["generate:word-game-catalog"],
    "node scripts/generate-word-game-catalog.mjs",
  );
  assert.equal(
    packageJson.scripts["check:word-game-catalog"],
    "node scripts/generate-word-game-catalog.mjs --check",
  );
  assert.equal(
    packageJson.scripts["check:content-catalogs"],
    "npm run check:rhyme-catalog && npm run check:word-game-catalog",
  );
  assert.equal(packageJson.scripts["publish:word-game-media"], undefined);

  for (const hook of [
    "predev:vite",
    "predeploy:worker",
    "pregenerate:audio:elevenlabs",
    "prestart",
    "pretest:browser",
    "pretest",
  ]) {
    assert.equal(packageJson.scripts[hook], "npm run check:content-catalogs", hook);
  }
  assert.equal(
    packageJson.scripts.prebuild,
    "npm run check:content-catalogs && node scripts/prepare-workers-ci-metadata.mjs",
  );
});

test("an appended JSON category flows through generation, resolution, shelf data, and audio", async (context) => {
  assert.equal(
    typeof wordGameCatalog.createWordGameCatalog,
    "function",
    "Expected a generated-data runtime seam.",
  );
  assert.equal(
    typeof staticAudio.createWordGameAudioLines,
    "function",
    "Expected a generated-data static-audio seam.",
  );

  const { fixtureCategory, rootDir } = await createPackageRoot(context);
  await runWordGameCatalogGenerator({ check: false, rootDir });
  const generatedPath = join(rootDir, "src", "games", "generated-word-game-catalog.ts");
  const generated = await import(`${pathToFileURL(generatedPath).href}?test=${Date.now()}`);
  const runtime = wordGameCatalog.createWordGameCatalog(
    generated.GENERATED_WORD_GAME_CATALOG,
  );
  const audioLines = staticAudio.createWordGameAudioLines(runtime.categories);

  assert.deepEqual(
    generated.GENERATED_WORD_GAME_CATALOG.map(({ id }) => id),
    ["animals", "fixtures"],
  );
  assert.equal(runtime.resolveCategory("fixtures")?.title, "Fixtures");
  assert.equal(runtime.resolveQuiz("fixtures", "simple-1")?.category.id, "fixtures");
  assert.deepEqual(runtime.categories.map(({ id }) => id), ["animals", "fixtures"]);
  assert.equal(
    audioLines[fixtureCategory.items[0].audio.id].text,
    fixtureCategory.items[0].audio.text,
  );
});
