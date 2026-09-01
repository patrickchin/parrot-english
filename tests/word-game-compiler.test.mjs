import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { describe, it } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  compileWordGamePackages,
  planWordGameAudio,
  serializeGeneratedWordGameCatalog,
} from "../scripts/word-game/compiler.mjs";
import { runWordGameCatalogGenerator } from "../scripts/generate-word-game-catalog.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const fixtureRoot = path.join(repositoryRoot, "tests", "fixtures", "word-games");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function secondCategory(category, { id = "pets", order = 2 } = {}) {
  const result = clone(category);
  result.id = id;
  result.order = order;
  result.title = "Pets";
  for (const item of result.items) {
    item.audio.id = item.audio.id.replace("word-game-animals-", `word-game-${id}-`);
  }
  return result;
}

function pathsFor(rootDir) {
  return {
    rootDir,
    categoryRoot: path.join(rootDir, "content", "word-games", "categories"),
    assetManifestPath: path.join(rootDir, "content", "word-games", "noto-assets.json"),
    publicRoot: path.join(rootDir, "public"),
    audioRoot: path.join(rootDir, "public", "assets", "audio"),
  };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function repositoryFixture(t, { categories, manifest } = {}) {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parrot-word-game-"));
  t.after(() => rm(rootDir, { force: true, recursive: true }));
  const paths = pathsFor(rootDir);
  const category = await readJson(path.join(fixtureRoot, "animals.json"));
  const assetManifest = manifest ?? await readJson(path.join(fixtureRoot, "noto-assets.json"));
  const authoredCategories = categories ?? [{ filename: "animals.json", value: category }];

  await Promise.all([
    mkdir(paths.categoryRoot, { recursive: true }),
    mkdir(paths.audioRoot, { recursive: true }),
    mkdir(path.join(paths.publicRoot, "assets", "word-games", "noto"), { recursive: true }),
    mkdir(path.join(rootDir, "third_party"), { recursive: true }),
    mkdir(path.join(rootDir, "src", "games"), { recursive: true }),
  ]);
  for (const { filename, value } of authoredCategories) {
    await writeJson(path.join(paths.categoryRoot, filename), value);
  }
  await writeJson(paths.assetManifestPath, assetManifest);
  await copyFile(
    path.join(fixtureRoot, "emoji_u1f431.svg"),
    path.join(paths.publicRoot, "assets", "word-games", "noto", "emoji_u1f431.svg"),
  );
  await copyFile(
    path.join(fixtureRoot, "noto-emoji-svg-LICENSE"),
    path.join(rootDir, "third_party", "noto-emoji-svg-LICENSE"),
  );
  const audioIds = new Set(
    authoredCategories.flatMap(({ value }) => value.items.map(({ audio }) => audio.id)),
  );
  for (const audioId of audioIds) {
    await copyFile(
      path.join(fixtureRoot, "tiny.mp3"),
      path.join(paths.audioRoot, `${audioId}.mp3`),
    );
  }
  return { assetManifest, category, paths, rootDir };
}

async function addAsset(fixture, id) {
  const svg = await readFile(path.join(fixtureRoot, "emoji_u1f431.svg"));
  const filename = `emoji_u${id}.svg`;
  fixture.assetManifest.assets.push({
    id,
    publicPath: `/assets/word-games/noto/${filename}`,
    sha256: createHash("sha256").update(svg).digest("hex"),
    upstreamPath: `svg/${filename}`,
  });
  await writeJson(fixture.paths.assetManifestPath, fixture.assetManifest);
  await writeFile(path.join(fixture.paths.publicRoot, "assets", "word-games", "noto", filename), svg);
}

describe("word-game package compilation", () => {
  it("compiles validated categories into deterministic JSON-compatible literals", async (t) => {
    const fixture = await repositoryFixture(t);

    const compiled = await compileWordGamePackages(fixture.paths);

    assert.deepEqual(compiled.categories.map(({ id }) => id), ["animals"]);
    assert.equal(compiled.categories[0].tiers[0].quizzes[0].questions.length, 6);
    assert.equal(
      compiled.categories[0].items[0].visual.src,
      "/assets/word-games/noto/emoji_u1f431.svg",
    );
    assert.equal(
      compiled.categories[0].items[0].audio.source,
      "/assets/audio/word-game-animals-cat-label.mp3",
    );
    assert.deepEqual(JSON.parse(JSON.stringify(compiled)), compiled);
  });

  it("sorts categories by order then ID without changing nested authored order", async (t) => {
    const category = await readJson(path.join(fixtureRoot, "animals.json"));
    const pets = secondCategory(category, { id: "pets", order: 1 });
    const animals = clone(category);
    animals.order = 2;
    const fixture = await repositoryFixture(t, {
      categories: [
        { filename: "animals.json", value: animals },
        { filename: "pets.json", value: pets },
      ],
    });

    const compiled = await compileWordGamePackages(fixture.paths);

    assert.deepEqual(compiled.categories.map(({ id }) => id), ["pets", "animals"]);
    assert.deepEqual(
      compiled.categories[0].tiers[0].quizzes[0].questions.map(({ targetId }) => targetId),
      ["cat", "dog", "bird", "fish", "duck", "frog"],
    );
  });

  it("rejects category filename mismatches and duplicate global identities", async (t) => {
    const base = await readJson(path.join(fixtureRoot, "animals.json"));
    for (const { name, categories, pattern } of [
      {
        name: "filename mismatch",
        categories: [{ filename: "pets.json", value: base }],
        pattern: /filename.*category id|category id.*filename/i,
      },
      {
        name: "category id",
        categories: [
          { filename: "animals.json", value: base },
          { filename: "pets.json", value: clone(base) },
        ],
        pattern: /duplicate category id animals/i,
      },
      {
        name: "category order",
        categories: [
          { filename: "animals.json", value: base },
          { filename: "pets.json", value: secondCategory(base, { order: 1 }) },
        ],
        pattern: /duplicate category order 1/i,
      },
    ]) {
      await t.test(name, async (t) => {
        const fixture = await repositoryFixture(t, { categories });
        await assert.rejects(compileWordGamePackages(fixture.paths), pattern);
      });
    }
  });

  it("rejects duplicate nested IDs in their documented scopes", async (t) => {
    const base = await readJson(path.join(fixtureRoot, "animals.json"));
    for (const { name, mutate, pattern } of [
      {
        name: "item",
        mutate: (value) => { value.items[1].id = value.items[0].id; },
        pattern: /duplicate item id cat/i,
      },
      {
        name: "tier",
        mutate: (value) => { value.tiers[1].id = value.tiers[0].id; },
        pattern: /duplicate tier id simple/i,
      },
      {
        name: "quiz",
        mutate: (value) => { value.tiers[1].quizzes[0].id = value.tiers[0].quizzes[0].id; },
        pattern: /duplicate quiz id simple-1/i,
      },
      {
        name: "question",
        mutate: (value) => {
          value.tiers[0].quizzes[0].questions[1].id =
            value.tiers[0].quizzes[0].questions[0].id;
        },
        pattern: /duplicate question id find-cat/i,
      },
    ]) {
      await t.test(name, async (t) => {
        const category = clone(base);
        mutate(category);
        const fixture = await repositoryFixture(t, {
          categories: [{ filename: "animals.json", value: category }],
        });
        await assert.rejects(compileWordGamePackages(fixture.paths), pattern);
      });
    }
  });

  it("rejects missing references, repeated quiz targets, and items never targeted", async (t) => {
    const base = await readJson(path.join(fixtureRoot, "animals.json"));
    for (const { name, mutate, pattern } of [
      {
        name: "missing cover item",
        mutate: (value) => { value.coverItemId = "missing"; },
        pattern: /coverItemId.*missing/i,
      },
      {
        name: "missing choice item",
        mutate: (value) => { value.tiers[0].quizzes[0].questions[0].choiceIds[3] = "missing"; },
        pattern: /choice.*missing/i,
      },
      {
        name: "repeated target",
        mutate: (value) => {
          const question = value.tiers[0].quizzes[0].questions[5];
          question.targetId = "cat";
          question.choiceIds = ["cat", "dog", "bird", "fish"];
          question.prompt = "Cat. Which picture is the cat?";
          question.success = "Great job! This is a cat.";
        },
        pattern: /target cat.*once|once.*target cat/i,
      },
      {
        name: "unused item",
        mutate: (value) => {
          value.items.push({
            ...clone(value.items[0]),
            id: "mouse",
            label: "mouse",
            alt: "A friendly mouse.",
            audio: {
              id: "word-game-animals-mouse-label",
              text: "This is a mouse.",
            },
          });
        },
        pattern: /item mouse.*never targeted|unused item mouse/i,
      },
    ]) {
      await t.test(name, async (t) => {
        const category = clone(base);
        mutate(category);
        const fixture = await repositoryFixture(t, {
          categories: [{ filename: "animals.json", value: category }],
        });
        await assert.rejects(compileWordGamePackages(fixture.paths), pattern);
      });
    }
  });

  it("rejects missing and unused Noto records", async (t) => {
    const missing = await repositoryFixture(t);
    missing.category.items[0].visual.assetId = "1f436";
    await writeJson(path.join(missing.paths.categoryRoot, "animals.json"), missing.category);
    await assert.rejects(
      compileWordGamePackages(missing.paths),
      /Noto asset 1f436.*not listed|missing Noto asset 1f436/i,
    );

    const unused = await repositoryFixture(t);
    await addAsset(unused, "1f436");
    await assert.rejects(compileWordGamePackages(unused.paths), /unused Noto asset 1f436/i);
  });

  it("rejects unsafe Noto paths and roots outside the repository", async (t) => {
    const unsafeAsset = await repositoryFixture(t);
    unsafeAsset.assetManifest.assets[0].publicPath = "/assets/word-games/../private.svg";
    await writeJson(unsafeAsset.paths.assetManifestPath, unsafeAsset.assetManifest);
    await assert.rejects(compileWordGamePackages(unsafeAsset.paths), /publicPath.*approved Noto root/i);

    const unsafeAudio = await repositoryFixture(t);
    const externalAudio = await mkdtemp(path.join(tmpdir(), "parrot-external-audio-"));
    t.after(() => rm(externalAudio, { force: true, recursive: true }));
    await assert.rejects(
      compileWordGamePackages({ ...unsafeAudio.paths, audioRoot: externalAudio }),
      /audio root.*outside/i,
    );
  });

  it("rejects symlinks and missing or non-regular files", async (t) => {
    const categoryLink = await repositoryFixture(t);
    const categoryPath = path.join(categoryLink.paths.categoryRoot, "animals.json");
    const categoryTarget = path.join(categoryLink.rootDir, "animals-target.json");
    await copyFile(categoryPath, categoryTarget);
    await unlink(categoryPath);
    await symlink(categoryTarget, categoryPath);
    await assert.rejects(compileWordGamePackages(categoryLink.paths), /category.*symbolic link/i);

    const missingAudio = await repositoryFixture(t);
    await unlink(path.join(missingAudio.paths.audioRoot, "word-game-animals-cat-label.mp3"));
    await assert.rejects(compileWordGamePackages(missingAudio.paths), /cat-label\.mp3.*missing/i);

    const directorySvg = await repositoryFixture(t);
    const svgPath = path.join(
      directorySvg.paths.publicRoot,
      "assets",
      "word-games",
      "noto",
      "emoji_u1f431.svg",
    );
    await unlink(svgPath);
    await mkdir(svgPath);
    await assert.rejects(compileWordGamePackages(directorySvg.paths), /SVG.*regular file/i);

    const licenseLink = await repositoryFixture(t);
    const licensePath = path.join(licenseLink.rootDir, "third_party", "noto-emoji-svg-LICENSE");
    const licenseTarget = path.join(licenseLink.rootDir, "license-target");
    await copyFile(licensePath, licenseTarget);
    await unlink(licensePath);
    await symlink(licenseTarget, licensePath);
    await assert.rejects(compileWordGamePackages(licenseLink.paths), /license.*symbolic link/i);
  });

  it("rejects SVG hash drift, conflicting audio text, and unexpected Noto files", async (t) => {
    const hashDrift = await repositoryFixture(t);
    hashDrift.assetManifest.assets[0].sha256 = "0".repeat(64);
    await writeJson(hashDrift.paths.assetManifestPath, hashDrift.assetManifest);
    await assert.rejects(compileWordGamePackages(hashDrift.paths), /SHA-256.*mismatch/i);

    const conflictingAudio = await repositoryFixture(t);
    conflictingAudio.category.items[1].audio.id = conflictingAudio.category.items[0].audio.id;
    await writeJson(
      path.join(conflictingAudio.paths.categoryRoot, "animals.json"),
      conflictingAudio.category,
    );
    await assert.rejects(compileWordGamePackages(conflictingAudio.paths), /audio id.*different.*text/i);

    const unexpected = await repositoryFixture(t);
    await writeFile(
      path.join(unexpected.paths.publicRoot, "assets", "word-games", "noto", "surprise.svg"),
      "surprise",
    );
    await assert.rejects(compileWordGamePackages(unexpected.paths), /unexpected Noto file surprise\.svg/i);
  });

  it("rejects duplicate global audio IDs even when their text matches", async (t) => {
    const fixture = await repositoryFixture(t);
    fixture.category.items[1].audio.id = fixture.category.items[0].audio.id;
    fixture.category.items[1].audio.text = fixture.category.items[0].audio.text;
    for (const tier of fixture.category.tiers) {
      tier.quizzes[0].questions[1].success = "Great job! This is a cat.";
    }
    await writeJson(path.join(fixture.paths.categoryRoot, "animals.json"), fixture.category);

    await assert.rejects(
      compileWordGamePackages(fixture.paths),
      /duplicate global audio id word-game-animals-cat-label/i,
    );
  });

  it("plans sorted missing audio while retaining every non-audio validation", async (t) => {
    const fixture = await repositoryFixture(t);
    await Promise.all([
      unlink(path.join(fixture.paths.audioRoot, "word-game-animals-frog-label.mp3")),
      unlink(path.join(fixture.paths.audioRoot, "word-game-animals-cat-label.mp3")),
    ]);

    const plan = await planWordGameAudio({ rootDir: fixture.rootDir });

    assert.deepEqual(plan.missingFiles, [
      "public/assets/audio/word-game-animals-cat-label.mp3",
      "public/assets/audio/word-game-animals-frog-label.mp3",
    ]);
    assert.deepEqual(plan.lines.map(({ id }) => id), [
      "word-game-animals-bird-label",
      "word-game-animals-cat-label",
      "word-game-animals-dog-label",
      "word-game-animals-duck-label",
      "word-game-animals-fish-label",
      "word-game-animals-frog-label",
    ]);
    assert.deepEqual(plan.lines[1], {
      id: "word-game-animals-cat-label",
      lang: "en-US",
      speaker: "narrator",
      src: "/assets/audio/word-game-animals-cat-label.mp3",
      text: "This is a cat.",
      ttsText: "[bright, playful teaching delivery for a young child] This is a cat.",
      voiceStyle: "energetic-character",
    });

    fixture.assetManifest.assets[0].sha256 = "0".repeat(64);
    await writeJson(fixture.paths.assetManifestPath, fixture.assetManifest);
    await assert.rejects(
      planWordGameAudio({ rootDir: fixture.rootDir }),
      /SHA-256.*mismatch/i,
    );
  });
});

describe("word-game catalog serialization and generation", () => {
  it("serializes identical bytes regardless of category creation order", async (t) => {
    const base = await readJson(path.join(fixtureRoot, "animals.json"));
    const categories = [
      { filename: "animals.json", value: base },
      { filename: "pets.json", value: secondCategory(base) },
    ];
    const first = await repositoryFixture(t, { categories });
    const second = await repositoryFixture(t, { categories: [...categories].reverse() });
    const firstCompiled = await compileWordGamePackages(first.paths);
    const secondCompiled = await compileWordGamePackages(second.paths);

    const serialized = serializeGeneratedWordGameCatalog(firstCompiled);

    assert.equal(serialized, serializeGeneratedWordGameCatalog(secondCompiled));
    assert.equal(
      serialized,
      "// Generated by scripts/generate-word-game-catalog.mjs. Do not edit.\n"
        + `export const GENERATED_WORD_GAME_CATALOG = ${JSON.stringify(firstCompiled.categories, null, 2)} as const;\n`,
    );
  });

  it("writes atomically, accepts a clean check, and leaves no temporary file", async (t) => {
    const fixture = await repositoryFixture(t);
    const outputPath = path.join(fixture.rootDir, "src", "games", "generated-word-game-catalog.ts");

    await runWordGameCatalogGenerator({ check: false, rootDir: fixture.rootDir });
    const generated = await readFile(outputPath, "utf8");
    await runWordGameCatalogGenerator({ check: true, rootDir: fixture.rootDir });

    assert.match(generated, /^\/\/ Generated by scripts\/generate-word-game-catalog\.mjs/);
    assert.deepEqual(
      (await readdir(path.dirname(outputPath))).filter((name) => name.includes(".tmp-")),
      [],
    );
    assert.ok((await lstat(outputPath)).isFile());
  });

  it("reports stale output in check mode without writing", async (t) => {
    const fixture = await repositoryFixture(t);
    const outputPath = path.join(fixture.rootDir, "src", "games", "generated-word-game-catalog.ts");
    await writeFile(outputPath, "stale\n");

    await assert.rejects(
      runWordGameCatalogGenerator({ check: true, rootDir: fixture.rootDir }),
      /Word-game catalog is stale.*generated-word-game-catalog\.ts.*First generated difference/i,
    );
    assert.equal(await readFile(outputPath, "utf8"), "stale\n");
  });

  it("rejects invalid CLI arguments before compiling content", async () => {
    await assert.rejects(
      execFileAsync(process.execPath, [
        path.join(repositoryRoot, "scripts", "generate-word-game-catalog.mjs"),
        "--wat",
      ]),
      (error) => {
        assert.match(error.stderr, /Unknown word-game catalog argument: --wat/);
        return true;
      },
    );
  });
});
