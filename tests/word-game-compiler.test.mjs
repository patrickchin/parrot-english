import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
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
import sharp from "sharp";
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

function setQuizOrder(quiz, targetIds) {
  quiz.questions = targetIds.map((targetId, index) => ({
    id: `find-${targetId}-${quiz.id}`,
    targetId,
    choiceIds: [0, 1, 2, 3].map((offset) => targetIds[(index + offset) % targetIds.length]),
  }));
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
    item.labelAudio.id = item.labelAudio.id.replace("word-game-animals-", `word-game-${id}-`);
    item.promptAudio.id = item.promptAudio.id.replace("word-game-animals-", `word-game-${id}-`);
  }
  return result;
}

function pathsFor(rootDir) {
  return {
    rootDir,
    categoryRoot: path.join(rootDir, "content", "word-games", "categories"),
    assetManifestPath: path.join(rootDir, "content", "word-games", "illustrated-assets.json"),
    playerManifestPath: path.join(rootDir, "content", "word-games", "player.json"),
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
  const assetManifest = manifest ?? await readJson(path.join(fixtureRoot, "illustrated-assets.json"));
  const authoredCategories = categories ?? [{ filename: "animals.json", value: category }];

  await Promise.all([
    mkdir(paths.categoryRoot, { recursive: true }),
    mkdir(paths.audioRoot, { recursive: true }),
    mkdir(path.join(paths.publicRoot, "assets", "word-games", "illustrated"), { recursive: true }),
    mkdir(path.join(rootDir, "src", "games"), { recursive: true }),
  ]);
  for (const { filename, value } of authoredCategories) {
    await writeJson(path.join(paths.categoryRoot, filename), value);
  }
  await writeJson(paths.assetManifestPath, assetManifest);
  await copyFile(
    path.join(fixtureRoot, "player.json"),
    paths.playerManifestPath,
  );
  await copyFile(
    path.join(fixtureRoot, "cat.webp"),
    path.join(paths.publicRoot, "assets", "word-games", "illustrated", "animals-cat.webp"),
  );
  const audioIds = new Set(
    [
      ...authoredCategories.flatMap(({ value }) => value.items.flatMap(
        ({ labelAudio, promptAudio }) => [labelAudio.id, promptAudio.id],
      )),
      "word-game-correct",
      "word-game-retry",
      "word-game-complete",
    ],
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
  const webp = await readFile(path.join(fixtureRoot, "cat.webp"));
  const filename = `${id}.webp`;
  fixture.assetManifest.assets.push({
    id,
    publicPath: `/assets/word-games/illustrated/${filename}`,
    sha256: createHash("sha256").update(webp).digest("hex"),
    source: "generated",
  });
  await writeJson(fixture.paths.assetManifestPath, fixture.assetManifest);
  await writeFile(
    path.join(fixture.paths.publicRoot, "assets", "word-games", "illustrated", filename),
    webp,
  );
}

describe("word-game package compilation", () => {
  it("compiles illustrated WebP answer-card assets", async (t) => {
    const fixture = await repositoryFixture(t);
    const illustration = await readFile(path.join(fixtureRoot, "cat.webp"));
    const illustrationRoot = path.join(
      fixture.paths.publicRoot,
      "assets",
      "word-games",
      "illustrated",
    );
    fixture.paths.assetManifestPath = path.join(
      fixture.rootDir,
      "content",
      "word-games",
      "illustrated-assets.json",
    );
    for (const item of fixture.category.items) {
      item.visual = { assetId: "animals-cat", kind: "illustration" };
    }
    await Promise.all([
      writeJson(
        path.join(fixture.paths.categoryRoot, "animals.json"),
        fixture.category,
      ),
      writeJson(fixture.paths.assetManifestPath, {
        schemaVersion: 1,
        assets: [
          {
            id: "animals-cat",
            publicPath: "/assets/word-games/illustrated/animals-cat.webp",
            sha256: createHash("sha256").update(illustration).digest("hex"),
            source: "original-v8",
          },
        ],
      }),
      mkdir(illustrationRoot, { recursive: true }),
    ]);
    await copyFile(
      path.join(fixtureRoot, "cat.webp"),
      path.join(illustrationRoot, "animals-cat.webp"),
    );

    const compiled = await compileWordGamePackages(fixture.paths);

    assert.deepEqual(compiled.categories[0].items[0].visual, {
      kind: "image",
      src: "/assets/word-games/illustrated/animals-cat.webp",
    });
  });

  it("compiles validated categories into deterministic JSON-compatible literals", async (t) => {
    const fixture = await repositoryFixture(t);

    const compiled = await compileWordGamePackages(fixture.paths);

    assert.deepEqual(compiled.categories.map(({ id }) => id), ["animals"]);
    assert.equal(compiled.categories[0].tiers[0].quizzes[0].questions.length, 6);
    assert.equal(
      compiled.categories[0].items[0].visual.src,
      "/assets/word-games/illustrated/animals-cat.webp",
    );
    assert.equal(
      compiled.categories[0].items[0].labelAudio.source,
      "/assets/audio/word-game-animals-cat-label.mp3",
    );
    assert.equal(
      compiled.categories[0].items[0].promptAudio.source,
      "/assets/audio/word-game-animals-cat-prompt.mp3",
    );
    assert.deepEqual(compiled.player, {
      schemaVersion: 1,
      successAudio: {
        id: "word-game-correct",
        source: "/assets/audio/word-game-correct.mp3",
        text: "Correct!",
      },
      retryAudio: {
        id: "word-game-retry",
        source: "/assets/audio/word-game-retry.mp3",
        text: "Listen and try again.",
      },
      completeAudio: {
        id: "word-game-complete",
        source: "/assets/audio/word-game-complete.mp3",
        text: "Great listening! You finished the game.",
      },
    });
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
        mutate: (value) => {
          value.items[1].id = value.items[0].id;
          value.items[1].labelAudio.id = value.items[0].labelAudio.id;
          value.items[1].promptAudio.id = value.items[0].promptAudio.id;
        },
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

  it("rejects repeated authored quiz orders and repeated first targets within a tier", async (t) => {
    const base = await readJson(path.join(fixtureRoot, "animals.json"));
    for (const { name, mutate, pattern } of [
      {
        name: "repeated authored order",
        mutate: (category) => {
          const [first, second] = category.tiers[0].quizzes;
          setQuizOrder(second, first.questions.map(({ targetId }) => targetId));
        },
        pattern: /quiz orders.*different|different.*quiz orders/i,
      },
      {
        name: "repeated first target",
        mutate: (category) => {
          const [first, second] = category.tiers[0].quizzes;
          const targetIds = second.questions.map(({ targetId }) => targetId);
          const firstTarget = first.questions[0].targetId;
          const firstTargetIndex = targetIds.indexOf(firstTarget);
          [targetIds[0], targetIds[firstTargetIndex]] = [targetIds[firstTargetIndex], targetIds[0]];
          setQuizOrder(second, targetIds);
        },
        pattern: /first targets.*different|different.*first targets/i,
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

  it("defers malformed tier entries to parser field diagnostics", async (t) => {
    const base = await readJson(path.join(fixtureRoot, "animals.json"));
    const tierWithoutId = clone(base.tiers[0]);
    delete tierWithoutId.id;
    for (const { name, tiers, fieldPath } of [
      {
        name: "null entries",
        tiers: [null, null],
        fieldPath: "tiers[0]",
      },
      {
        name: "objects without string IDs",
        tiers: [tierWithoutId, clone(tierWithoutId)],
        fieldPath: "tiers[0].id",
      },
    ]) {
      await t.test(name, async (t) => {
        const category = { ...clone(base), tiers };
        const fixture = await repositoryFixture(t, {
          categories: [{ filename: "animals.json", value: category }],
        });
        const categoryPath = path.join(fixture.paths.categoryRoot, "animals.json");

        await assert.rejects(
          compileWordGamePackages(fixture.paths),
          (error) => {
            assert.ok(error.message.startsWith(`${categoryPath}:${fieldPath}:`));
            assert.doesNotMatch(error.message, /TypeError|duplicate tier id undefined/i);
            return true;
          },
        );
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
        },
        pattern: /target membership|target cat.*once|once.*target cat/i,
      },
      {
        name: "unused item",
        mutate: (value) => {
          value.items.push({
            ...clone(value.items[0]),
            id: "mouse",
            label: "mouse",
            alt: "A friendly mouse.",
            labelAudio: {
              id: "word-game-animals-mouse-label",
              text: "This is a mouse.",
            },
            promptAudio: {
              id: "word-game-animals-mouse-prompt",
              text: "Which is the mouse?",
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

  it("rejects missing and unused illustration records", async (t) => {
    const missing = await repositoryFixture(t);
    missing.category.items[0].visual.assetId = "animals-mouse";
    await writeJson(path.join(missing.paths.categoryRoot, "animals.json"), missing.category);
    await assert.rejects(
      compileWordGamePackages(missing.paths),
      /illustration asset animals-mouse.*not listed/i,
    );

    const unused = await repositoryFixture(t);
    await addAsset(unused, "animals-mouse");
    await assert.rejects(
      compileWordGamePackages(unused.paths),
      /unused illustration asset animals-mouse/i,
    );
  });

  it("rejects unsafe illustration paths and roots outside the repository", async (t) => {
    const unsafeAsset = await repositoryFixture(t);
    unsafeAsset.assetManifest.assets[0].publicPath = "/assets/word-games/../private.webp";
    await writeJson(unsafeAsset.paths.assetManifestPath, unsafeAsset.assetManifest);
    await assert.rejects(
      compileWordGamePackages(unsafeAsset.paths),
      /publicPath.*approved illustration root/i,
    );

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

    const directoryWebp = await repositoryFixture(t);
    const webpPath = path.join(
      directoryWebp.paths.publicRoot,
      "assets",
      "word-games",
      "illustrated",
      "animals-cat.webp",
    );
    await unlink(webpPath);
    await mkdir(webpPath);
    await assert.rejects(
      compileWordGamePackages(directoryWebp.paths),
      /WebP.*regular file/i,
    );
  });

  it("rejects WebP hash drift, malformed images, and unexpected illustration files", async (t) => {
    const hashDrift = await repositoryFixture(t);
    hashDrift.assetManifest.assets[0].sha256 = "0".repeat(64);
    await writeJson(hashDrift.paths.assetManifestPath, hashDrift.assetManifest);
    await assert.rejects(compileWordGamePackages(hashDrift.paths), /SHA-256.*mismatch/i);

    const unexpected = await repositoryFixture(t);
    await writeFile(
      path.join(unexpected.paths.publicRoot, "assets", "word-games", "illustrated", "surprise.webp"),
      "surprise",
    );
    await assert.rejects(
      compileWordGamePackages(unexpected.paths),
      /unexpected illustration file surprise\.webp/i,
    );

    const nonWebp = await repositoryFixture(t);
    await writeFile(
      path.join(nonWebp.paths.publicRoot, "assets", "word-games", "illustrated", "animals-cat.webp"),
      "not a WebP",
    );
    await assert.rejects(compileWordGamePackages(nonWebp.paths), /WebP is invalid/i);

    const wrongSize = await repositoryFixture(t);
    const assetPath = path.join(
      wrongSize.paths.publicRoot,
      "assets",
      "word-games",
      "illustrated",
      "animals-cat.webp",
    );
    const resizedPath = path.join(wrongSize.rootDir, "wrong-size.webp");
    await sharp(assetPath).resize(256, 256).toFile(resizedPath);
    await rename(resizedPath, assetPath);
    await assert.rejects(compileWordGamePackages(wrongSize.paths), /must be 512×512/i);
  });

  it("reuses a global audio ID only when its text and saved source match", async (t) => {
    const fixture = await repositoryFixture(t);
    const sharedId = "word-game-shared-animal-label";
    fixture.category.items[0].labelAudio.id = sharedId;
    fixture.category.items[1].labelAudio.id = sharedId;
    await writeJson(path.join(fixture.paths.categoryRoot, "animals.json"), fixture.category);

    await assert.rejects(
      compileWordGamePackages(fixture.paths),
      /audio id word-game-shared-animal-label is reused with different text/i,
    );

    fixture.category.items[1].labelAudio.text = fixture.category.items[0].labelAudio.text;
    await writeJson(path.join(fixture.paths.categoryRoot, "animals.json"), fixture.category);
    await copyFile(
      path.join(fixtureRoot, "tiny.mp3"),
      path.join(fixture.paths.audioRoot, `${sharedId}.mp3`),
    );

    const plan = await planWordGameAudio({ rootDir: fixture.rootDir });
    assert.equal(plan.lines.filter(({ id }) => id === sharedId).length, 1);
  });

  it("plans sorted missing audio while retaining every non-audio validation", async (t) => {
    const fixture = await repositoryFixture(t);
    await Promise.all([
      unlink(path.join(fixture.paths.audioRoot, "word-game-animals-frog-prompt.mp3")),
      unlink(path.join(fixture.paths.audioRoot, "word-game-animals-cat-prompt.mp3")),
    ]);

    const plan = await planWordGameAudio({ rootDir: fixture.rootDir });

    assert.deepEqual(plan.missingFiles, [
      "public/assets/audio/word-game-animals-cat-prompt.mp3",
      "public/assets/audio/word-game-animals-frog-prompt.mp3",
    ]);
    assert.ok(plan.missingFiles.every((filePath) => !filePath.includes("\\")));
    assert.deepEqual(plan.lines.map(({ id }) => id), [
      "word-game-animals-bird-label",
      "word-game-animals-bird-prompt",
      "word-game-animals-cat-label",
      "word-game-animals-cat-prompt",
      "word-game-animals-dog-label",
      "word-game-animals-dog-prompt",
      "word-game-animals-duck-label",
      "word-game-animals-duck-prompt",
      "word-game-animals-fish-label",
      "word-game-animals-fish-prompt",
      "word-game-animals-frog-label",
      "word-game-animals-frog-prompt",
      "word-game-complete",
      "word-game-correct",
      "word-game-retry",
    ]);
    assert.deepEqual(plan.lines[2], {
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

  it("does not classify non-ENOENT audio errors as missing", async (t) => {
    const fixture = await repositoryFixture(t);
    const promptPath = path.join(fixture.paths.audioRoot, "word-game-animals-cat-prompt.mp3");
    await unlink(promptPath);
    await mkdir(promptPath);

    await assert.rejects(
      planWordGameAudio({ rootDir: fixture.rootDir }),
      /cat-prompt\.mp3.*regular file/i,
    );
  });

  it("opens validated JSON and WebP paths without following a symlink swap", async (t) => {
    for (const { name, targetPath } of [
      {
        name: "category JSON",
        targetPath: (fixture) => path.join(fixture.paths.categoryRoot, "animals.json"),
      },
      {
        name: "asset manifest JSON",
        targetPath: (fixture) => fixture.paths.assetManifestPath,
      },
      {
        name: "WebP hashing",
        targetPath: (fixture) => path.join(
          fixture.paths.publicRoot,
          "assets",
          "word-games",
          "illustrated",
          "animals-cat.webp",
        ),
      },
    ]) {
      await t.test(name, async (t) => {
        const fixture = await repositoryFixture(t);
        const guardedPath = targetPath(fixture);
        const externalPath = path.join(fixture.rootDir, `external-${path.basename(guardedPath)}`);
        await copyFile(guardedPath, externalPath);
        let swapped = false;
        const openFile = async (filePath, flags) => {
          if (!swapped && filePath === guardedPath) {
            swapped = true;
            await rename(guardedPath, `${guardedPath}.original`);
            await symlink(externalPath, guardedPath);
          }
          return open(filePath, flags);
        };

        await assert.rejects(
          compileWordGamePackages({ ...fixture.paths, openFile }),
          /changed before it could be opened safely|symbolic link/i,
        );
        assert.equal(swapped, true);
      });
    }
  });

  it("uses code-unit ordering instead of the host locale", async (t) => {
    const fixture = await repositoryFixture(t);
    const descriptor = Object.getOwnPropertyDescriptor(String.prototype, "localeCompare");
    Object.defineProperty(String.prototype, "localeCompare", {
      configurable: true,
      value: () => 0,
      writable: true,
    });
    t.after(() => Object.defineProperty(String.prototype, "localeCompare", descriptor));
    await Promise.all(
      fixture.category.items.flatMap(({ labelAudio, promptAudio }) => [labelAudio, promptAudio]).map((audio) =>
        unlink(path.join(fixture.paths.audioRoot, `${audio.id}.mp3`))),
    );

    const plan = await planWordGameAudio({ rootDir: fixture.rootDir });

    assert.deepEqual(plan.lines.map(({ id }) => id), [
      "word-game-animals-bird-label",
      "word-game-animals-bird-prompt",
      "word-game-animals-cat-label",
      "word-game-animals-cat-prompt",
      "word-game-animals-dog-label",
      "word-game-animals-dog-prompt",
      "word-game-animals-duck-label",
      "word-game-animals-duck-prompt",
      "word-game-animals-fish-label",
      "word-game-animals-fish-prompt",
      "word-game-animals-frog-label",
      "word-game-animals-frog-prompt",
      "word-game-complete",
      "word-game-correct",
      "word-game-retry",
    ]);
    assert.deepEqual(
      plan.missingFiles,
      plan.missingFiles.toSorted((left, right) => left < right ? -1 : left > right ? 1 : 0),
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
        + `export const GENERATED_WORD_GAME_CATALOG = ${JSON.stringify(firstCompiled, null, 2)} as const;\n`,
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

  it("rejects an output-directory symlink without writing outside the repository", async (t) => {
    const fixture = await repositoryFixture(t);
    const outputDirectory = path.join(fixture.rootDir, "src", "games");
    const externalDirectory = await mkdtemp(path.join(tmpdir(), "parrot-word-game-output-"));
    t.after(() => rm(externalDirectory, { force: true, recursive: true }));
    await rm(outputDirectory, { recursive: true });
    await symlink(externalDirectory, outputDirectory);

    await assert.rejects(
      runWordGameCatalogGenerator({ check: false, rootDir: fixture.rootDir }),
      /output directory.*symbolic link/i,
    );
    await assert.rejects(
      lstat(path.join(externalDirectory, "generated-word-game-catalog.ts")),
      { code: "ENOENT" },
    );
  });

  it("rejects a non-directory output parent", async (t) => {
    const fixture = await repositoryFixture(t);
    const outputDirectory = path.join(fixture.rootDir, "src", "games");
    await rm(outputDirectory, { recursive: true });
    await writeFile(outputDirectory, "not a directory");

    await assert.rejects(
      runWordGameCatalogGenerator({ check: false, rootDir: fixture.rootDir }),
      /output directory.*must be a directory/i,
    );
  });

  it("rejects a generated-file symlink without replacing or changing its target", async (t) => {
    const fixture = await repositoryFixture(t);
    const outputPath = path.join(fixture.rootDir, "src", "games", "generated-word-game-catalog.ts");
    const externalPath = path.join(fixture.rootDir, "external-generated.ts");
    await writeFile(externalPath, "external sentinel\n");
    await symlink(externalPath, outputPath);

    await assert.rejects(
      runWordGameCatalogGenerator({ check: false, rootDir: fixture.rootDir }),
      /generated catalog.*symbolic link/i,
    );
    assert.equal(await readFile(externalPath, "utf8"), "external sentinel\n");
    assert.equal((await lstat(outputPath)).isSymbolicLink(), true);
  });

  it("rejects a non-regular generated output", async (t) => {
    const fixture = await repositoryFixture(t);
    const outputPath = path.join(fixture.rootDir, "src", "games", "generated-word-game-catalog.ts");
    await mkdir(outputPath);

    await assert.rejects(
      runWordGameCatalogGenerator({ check: false, rootDir: fixture.rootDir }),
      /generated catalog.*must be a regular file/i,
    );
  });

  it("reports a missing output as stale in check mode without creating it", async (t) => {
    const fixture = await repositoryFixture(t);
    const outputPath = path.join(fixture.rootDir, "src", "games", "generated-word-game-catalog.ts");

    await assert.rejects(
      runWordGameCatalogGenerator({ check: true, rootDir: fixture.rootDir }),
      /Word-game catalog is stale.*current=<missing>/i,
    );
    await assert.rejects(lstat(outputPath), { code: "ENOENT" });
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
