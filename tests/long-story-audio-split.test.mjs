import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFile,
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { STORIES } from "../src/stories/story-catalog.ts";

const splitterUrl = new URL(
  "../scripts/split-long-story-audio.mjs",
  import.meta.url,
);
const fixtureAudioUrl = new URL(
  "../public/assets/audio/narrator-copy-dolly.mp3",
  import.meta.url,
);
const fixtureSha256 =
  "9714aa8d59d65579e0c334e7495735912df240a446371f2b369fed74e69b85ef";
const fixtureFilename = "story-fixture-page-001-narration.mp3";
const expectedFixtureOutputs = [
  "story-fixture-page-001-narration.mp3",
  "story-fixture-page-002-narration.mp3",
];
const fixtureManifest = [
  {
    duration: 1.36,
    filename: fixtureFilename,
    outputs: [
      { end: 0.68, filename: expectedFixtureOutputs[0], start: 0 },
      { end: 1.36, filename: expectedFixtureOutputs[1], start: 0.68 },
    ],
    sha256: fixtureSha256,
  },
];
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "parrot-long-story-audio-"));
  const audioDir = join(root, "audio");
  const workDir = join(root, "work");
  temporaryDirectories.push(root);
  await mkdir(audioDir);
  await copyFile(fixtureAudioUrl, join(audioDir, fixtureFilename));
  return { audioDir, workDir };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function probeAudio(filename) {
  return JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_name,sample_rate,channels",
        "-of",
        "json",
        filename,
      ],
      { encoding: "utf8" },
    ),
  );
}

async function loadSplitter() {
  return import(splitterUrl).catch(() => ({}));
}

describe("long-story narration splitter", () => {
  it("defaults to a side-effect-free dry run", async () => {
    const { audioDir, workDir } = await createFixture();
    const sourceBefore = await readFile(join(audioDir, fixtureFilename));
    const { splitLongStoryAudio } = await loadSplitter();

    assert.equal(typeof splitLongStoryAudio, "function");
    const result = await splitLongStoryAudio({
      audioDir,
      manifest: fixtureManifest,
      workDir,
    });

    assert.deepEqual(result, {
      mode: "dry-run",
      outputCount: 2,
      sourceCount: 1,
    });
    assert.deepEqual(await readdir(audioDir), [fixtureFilename]);
    assert.equal(
      sha256(await readFile(join(audioDir, fixtureFilename))),
      sha256(sourceBefore),
    );
    await assert.rejects(readFile(join(workDir, "stage", fixtureFilename)));
  });

  it("stages, validates, and applies every output before replacing a source", async () => {
    const { audioDir, workDir } = await createFixture();
    const { splitLongStoryAudio } = await loadSplitter();

    assert.equal(typeof splitLongStoryAudio, "function");
    const result = await splitLongStoryAudio({
      apply: true,
      audioDir,
      manifest: fixtureManifest,
      workDir,
    });

    assert.deepEqual(result, {
      mode: "applied",
      outputCount: 2,
      sourceCount: 1,
    });
    assert.deepEqual((await readdir(audioDir)).sort(), expectedFixtureOutputs);
    assert.equal(
      sha256(await readFile(join(workDir, "sources", fixtureFilename))),
      fixtureSha256,
    );
    for (const filename of expectedFixtureOutputs) {
      const probe = probeAudio(join(audioDir, filename));
      assert.equal(probe.streams[0].codec_name, "mp3");
      assert.equal(probe.streams[0].sample_rate, "44100");
      assert.equal(probe.streams[0].channels, 1);
      assert.ok(Number(probe.format.duration) >= 0.6, filename);
      assert.ok(Number(probe.format.duration) <= 0.8, filename);
    }
  });

  it("rebuilds deterministically from the preserved source set", async () => {
    const { audioDir, workDir } = await createFixture();
    const { splitLongStoryAudio } = await loadSplitter();

    assert.equal(typeof splitLongStoryAudio, "function");
    await splitLongStoryAudio({
      apply: true,
      audioDir,
      manifest: fixtureManifest,
      workDir,
    });
    const firstHashes = await Promise.all(
      expectedFixtureOutputs.map(async (filename) =>
        sha256(await readFile(join(audioDir, filename))),
      ),
    );

    await splitLongStoryAudio({
      apply: true,
      audioDir,
      manifest: fixtureManifest,
      workDir,
    });
    const secondHashes = await Promise.all(
      expectedFixtureOutputs.map(async (filename) =>
        sha256(await readFile(join(audioDir, filename))),
      ),
    );

    assert.deepEqual(secondHashes, firstHashes);
  });

  it("validates an already-applied output set without recreating local state", async () => {
    const { audioDir, workDir } = await createFixture();
    const { splitLongStoryAudio } = await loadSplitter();
    assert.equal(typeof splitLongStoryAudio, "function");
    await splitLongStoryAudio({
      apply: true,
      audioDir,
      manifest: fixtureManifest,
      workDir,
    });
    await rm(workDir, { force: true, recursive: true });
    const hashesBefore = await Promise.all(
      expectedFixtureOutputs.map(async (filename) =>
        sha256(await readFile(join(audioDir, filename))),
      ),
    );

    const result = await splitLongStoryAudio({
      audioDir,
      manifest: fixtureManifest,
      workDir,
    });

    assert.deepEqual(result, {
      mode: "already-applied",
      outputCount: 2,
      sourceCount: 1,
    });
    assert.deepEqual((await readdir(audioDir)).sort(), expectedFixtureOutputs);
    assert.deepEqual(
      await Promise.all(
        expectedFixtureOutputs.map(async (filename) =>
          sha256(await readFile(join(audioDir, filename))),
        ),
      ),
      hashesBefore,
    );
    await assert.rejects(readFile(join(workDir, "sources", fixtureFilename)));
  });

  it("requires preserved originals before reapplying an already-migrated set", async () => {
    const { audioDir, workDir } = await createFixture();
    const { splitLongStoryAudio } = await loadSplitter();
    assert.equal(typeof splitLongStoryAudio, "function");
    await splitLongStoryAudio({
      apply: true,
      audioDir,
      manifest: fixtureManifest,
      workDir,
    });
    await rm(workDir, { force: true, recursive: true });
    const hashesBefore = await Promise.all(
      expectedFixtureOutputs.map(async (filename) =>
        sha256(await readFile(join(audioDir, filename))),
      ),
    );

    await assert.rejects(
      splitLongStoryAudio({
        apply: true,
        audioDir,
        manifest: fixtureManifest,
        workDir,
      }),
      /Preserved original sources are required for --apply/,
    );

    assert.deepEqual(
      await Promise.all(
        expectedFixtureOutputs.map(async (filename) =>
          sha256(await readFile(join(audioDir, filename))),
        ),
      ),
      hashesBefore,
    );
    await assert.rejects(readFile(join(workDir, "sources", fixtureFilename)));
  });

  it("rejects an unexpected source hash without writing outputs", async () => {
    const { audioDir, workDir } = await createFixture();
    const { splitLongStoryAudio } = await loadSplitter();
    assert.equal(typeof splitLongStoryAudio, "function");
    await appendFile(join(audioDir, fixtureFilename), "unexpected");
    const sourceBefore = await readFile(join(audioDir, fixtureFilename));

    await assert.rejects(
      splitLongStoryAudio({
        apply: true,
        audioDir,
        manifest: fixtureManifest,
        workDir,
      }),
      /SHA-256 mismatch/,
    );

    assert.deepEqual(await readdir(audioDir), [fixtureFilename]);
    assert.equal(
      sha256(await readFile(join(audioDir, fixtureFilename))),
      sha256(sourceBefore),
    );
    await assert.rejects(readFile(join(workDir, "stage", fixtureFilename)));
  });

  it("keeps the generated assets aligned with all 36 long-story pages", async () => {
    const { LONG_STORY_AUDIO_MANIFEST } = await loadSplitter();
    assert.equal(Array.isArray(LONG_STORY_AUDIO_MANIFEST), true);
    const expectedFilenames = STORIES.filter(
      ({ level }) => level === "long-stories",
    ).flatMap(({ pages }) =>
      pages.map(({ narrationAudioId }) => `${narrationAudioId}.mp3`),
    );
    const manifestFilenames = LONG_STORY_AUDIO_MANIFEST.flatMap(({ outputs }) =>
      outputs.map(({ filename }) => filename),
    );
    const manifestDurations = new Map(
      LONG_STORY_AUDIO_MANIFEST.flatMap(({ outputs }) =>
        outputs.map(({ end, filename, start }) => [filename, end - start]),
      ),
    );

    assert.equal(expectedFilenames.length, 36);
    assert.deepEqual(manifestFilenames, expectedFilenames);
    for (const filename of expectedFilenames) {
      const asset = new URL(`../public/assets/audio/${filename}`, import.meta.url);
      const probe = probeAudio(asset.pathname);
      assert.equal(probe.streams[0].codec_name, "mp3", filename);
      assert.equal(probe.streams[0].sample_rate, "44100", filename);
      assert.equal(probe.streams[0].channels, 1, filename);
      assert.ok(
        Math.abs(
          Number(probe.format.duration) - manifestDurations.get(filename),
        ) <= 0.12,
        `${filename} duration`,
      );
    }
  });
});
