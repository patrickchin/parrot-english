import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import snapshot from "./fixtures/nursery-rhyme-runtime-snapshot.json" with { type: "json" };
import { compileMusicXml } from "../scripts/nursery-rhyme/musicxml.mjs";
import { runLegacyRhymeMigration } from "../scripts/migrate-legacy-rhyme-packages.mjs";

const WORD_PATTERN = /[\p{L}\p{N}]+(?:[’‘ʼ'‐‑-][\p{L}\p{N}]+)*/gu;
const slugs = snapshot.catalog.map(({ route }) => path.basename(route));

async function temporaryRoot(t) {
  const root = await mkdtemp(path.join(tmpdir(), "parrot-legacy-rhyme-migration-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  return root;
}

async function generatedPackage(rootDir, slug) {
  const packageDir = path.join(rootDir, "public", "assets", "nursery-rhymes", slug);
  const manifestBytes = await readFile(path.join(packageDir, "rhyme.json"));
  const scoreBytes = await readFile(path.join(packageDir, "score.musicxml"));
  return {
    manifest: JSON.parse(manifestBytes),
    manifestBytes,
    packageDir,
    scoreBytes,
  };
}

function compileGenerated({ manifest, packageDir, scoreBytes }) {
  return compileMusicXml({
    manifest,
    sourcePath: path.join(packageDir, "score.musicxml"),
    xml: scoreBytes.toString("utf8"),
  });
}

describe("legacy nursery-rhyme package migration", () => {
  it("emits human-reviewable MusicXML with deterministic structural formatting", async (t) => {
    const rootDir = await temporaryRoot(t);
    await runLegacyRhymeMigration({ onlySlug: "row-row-row-your-boat", rootDir });
    const score = (
      await generatedPackage(rootDir, "row-row-row-your-boat")
    ).scoreBytes.toString("utf8");

    assert.match(score, /\n  <part-list>\n    <score-part id="P1">\n/);
    assert.match(score, /\n  <part id="P1">\n    <measure number="1">\n/);
    assert.match(score, /\n      <note>\n        <rest\/>\n        <duration>800<\/duration>\n      <\/note>\n/);
    assert.doesNotMatch(score, /<\/(?:note|measure|part)><(?:note|measure|part)\b/);
  });

  it("writes deterministic manifest and MusicXML bytes without network or TTS", async (t) => {
    const rootDir = await temporaryRoot(t);
    const writes = [];
    const copies = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => {
      throw new Error("migration must not call the network");
    };
    try {
      await runLegacyRhymeMigration({
        rootDir,
        copyFile: async (...args) => {
          copies.push(args.map(String));
          return copyFile(...args);
        },
        writeFile: async (...args) => {
          writes.push(String(args[0]));
          return writeFile(...args);
        },
      });
      const first = new Map();
      for (const slug of slugs) {
        const generated = await generatedPackage(rootDir, slug);
        first.set(slug, [generated.manifestBytes, generated.scoreBytes]);
      }

      await runLegacyRhymeMigration({ rootDir });

      for (const slug of slugs) {
        const generated = await generatedPackage(rootDir, slug);
        assert.deepEqual(generated.manifestBytes, first.get(slug)[0], `${slug} manifest`);
        assert.deepEqual(generated.scoreBytes, first.get(slug)[1], `${slug} score`);
      }
      assert.equal(writes.length, slugs.length * 2);
      assert.equal(copies.length, snapshot.guides.length);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("limits --only migration writes and copies to one package", async (t) => {
    const rootDir = await temporaryRoot(t);
    const writes = [];
    const copies = [];
    await runLegacyRhymeMigration({
      onlySlug: "twinkle-twinkle",
      rootDir,
      copyFile: async (...args) => {
        copies.push(args.map(String));
        return copyFile(...args);
      },
      writeFile: async (...args) => {
        writes.push(String(args[0]));
        return writeFile(...args);
      },
    });

    assert.deepEqual(
      await readdir(path.join(rootDir, "public", "assets", "nursery-rhymes")),
      ["twinkle-twinkle"],
    );
    assert.equal(writes.length, 2);
    assert.ok(writes.every((filePath) => filePath.includes("/twinkle-twinkle/")));
    assert.ok(copies.every(([, filePath]) => filePath.includes("/twinkle-twinkle/")));
  });

  it("copies all 59 protected guide recordings byte for byte", async (t) => {
    const rootDir = await temporaryRoot(t);
    await runLegacyRhymeMigration({ rootDir });

    for (const guide of snapshot.guides) {
      const definition = snapshot.catalog.find(({ id }) =>
        guide.id.startsWith(`${id}-guide-line-`));
      assert.ok(definition, guide.id);
      const guidePath = path.join(
        rootDir,
        "public",
        "assets",
        "nursery-rhymes",
        path.basename(definition.route),
        "guides",
        `${guide.id}.mp3`,
      );
      assert.equal(
        createHash("sha256").update(await readFile(guidePath)).digest("hex"),
        guide.sha256,
        guide.id,
      );
    }
  });

  it("keeps compound hyphen words as one timed cue", async (t) => {
    const rootDir = await temporaryRoot(t);
    await runLegacyRhymeMigration({ onlySlug: "old-macdonald", rootDir });
    const generated = await generatedPackage(rootDir, "old-macdonald");
    const compiled = compileGenerated(generated);
    const lines = generated.manifest.scenes.flatMap((scene) => scene.lines);

    for (const compound of ["E-I-E-I-O", "moo-moo"]) {
      const lineIndex = lines.findIndex(({ text }) => text.includes(compound));
      const tokens = [...lines[lineIndex].text.matchAll(WORD_PATTERN)];
      const tokenIndex = tokens.findIndex(([word]) => word === compound);
      assert.ok(tokenIndex >= 0, compound);
      assert.equal(compiled.lines[lineIndex].words.length, tokens.length);
      assert.deepEqual(
        [
          compiled.lines[lineIndex].words[tokenIndex].startOffset,
          compiled.lines[lineIndex].words[tokenIndex].endOffset,
        ],
        [tokens[tokenIndex].index, tokens[tokenIndex].index + compound.length],
      );
    }
  });

  it("subdivides one legacy note for successive words by rounded absolute boundaries", async (t) => {
    const rootDir = await temporaryRoot(t);
    await runLegacyRhymeMigration({ onlySlug: "mary-had-a-little-lamb", rootDir });
    const compiled = compileGenerated(
      await generatedPackage(rootDir, "mary-had-a-little-lamb"),
    );
    const line = compiled.lines[3];

    assert.deepEqual(line.notes.at(-1), { atMs: 2_000, durationMs: 2_000, midi: 67 });
    assert.deepEqual(
      line.words.slice(-2).map(({ atMs, durationMs }) => ({ atMs, durationMs })),
      [
        { atMs: 2_000, durationMs: 1_000 },
        { atMs: 3_000, durationMs: 1_000 },
      ],
    );
  });

  it("extends one word across its proportional contiguous legacy-note group", async (t) => {
    const rootDir = await temporaryRoot(t);
    await runLegacyRhymeMigration({ onlySlug: "old-macdonald", rootDir });
    const compiled = compileGenerated(await generatedPackage(rootDir, "old-macdonald"));
    const line = compiled.lines[0];

    assert.deepEqual(
      line.words.map(({ atMs, durationMs }) => ({ atMs, durationMs })),
      [
        { atMs: 0, durationMs: 1_000 },
        { atMs: 1_000, durationMs: 1_000 },
        { atMs: 2_000, durationMs: 1_000 },
        { atMs: 3_000, durationMs: 1_500 },
        { atMs: 4_500, durationMs: 1_000 },
        { atMs: 5_500, durationMs: 2_000 },
      ],
    );
  });
});
