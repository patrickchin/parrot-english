import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { describe, it } from "node:test";
import { GENERATED_DUB_DEFINITIONS } from "../src/dubbing/generated-rhyme-catalog.ts";

const execFileAsync = promisify(execFile);
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

function shellChain(script) {
  return typeof script === "string" ? script.split(/\s*&&\s*/u) : [];
}

describe("static audio generator", () => {
  it("keeps separate explicit write and check commands for the rhyme catalog", () => {
    assert.equal(
      packageJson.scripts["generate:rhyme-catalog"],
      "node scripts/generate-rhyme-catalog.mjs",
    );
    assert.equal(
      packageJson.scripts["check:rhyme-catalog"],
      "node scripts/generate-rhyme-catalog.mjs --check",
    );
  });

  it("runs only catalog check mode before every content-sensitive lifecycle command", () => {
    const expectedHooks = {
      prebuild: [
        "npm run check:rhyme-catalog",
        "node scripts/prepare-workers-ci-metadata.mjs",
      ],
      pretest: ["npm run check:rhyme-catalog"],
      "pretest:browser": ["npm run check:rhyme-catalog"],
      "predev:vite": ["npm run check:rhyme-catalog"],
      prestart: ["npm run check:rhyme-catalog"],
      "pregenerate:audio:elevenlabs": ["npm run check:rhyme-catalog"],
      "predeploy:worker": ["npm run check:rhyme-catalog"],
    };

    for (const [hook, expectedCommands] of Object.entries(expectedHooks)) {
      assert.deepEqual(shellChain(packageJson.scripts[hook]), expectedCommands, hook);
      assert.equal(
        shellChain(packageJson.scripts[hook]).includes("npm run generate:rhyme-catalog"),
        false,
        hook,
      );
    }
  });

  it("recognizes an existing nested package guide without generating audio", async () => {
    const guide = GENERATED_DUB_DEFINITIONS[0].guides[0];
    assert.match(guide.src, /^\/assets\/nursery-rhymes\/[^/]+\/guides\/.+\.mp3$/);

    const { stdout } = await execFileAsync(
      process.execPath,
      ["scripts/generate-static-audio.mjs", `--only=${guide.id}`],
      {
        env: { ...process.env, ELEVENLABS_API_KEY: "unused-test-key" },
      },
    );

    assert.equal(stdout.trim(), `skipped: ${guide.id} (elevenlabs)`);
  });

  it("chooses ElevenLabs voices and language from line metadata", () => {
    const generator = readFileSync(
      new URL("../scripts/generate-static-audio.mjs", import.meta.url),
      "utf8"
    );

    assert.match(generator, /ELEVENLABS_SPEAKER_VOICE_IDS/);
    assert.match(generator, /ELEVENLABS_PEPPA_VOICE_ID/);
    assert.match(generator, /ELEVENLABS_DOLLY_VOICE_ID/);
    assert.match(generator, /ELEVENLABS_NARRATOR_VOICE_ID/);
    assert.match(generator, /line\.speaker/);
    assert.match(generator, /5N1BjZ10t6GcJUhZCP40/);
    assert.match(generator, /pFZP5JQG7iQjIQuC4Bku/);
    assert.doesNotMatch(generator, /4NQthjVhIGGVfL3Si000/);
    assert.match(
      generator,
      /language_code:\s*line\.lang\.split\(["']-["']\)\[0\]/,
    );
    assert.match(generator, /line\.speaker === "narrator"/);
    assert.match(generator, /speed:\s*0\.96/);
    assert.match(generator, /style:\s*0\.35/);
    assert.doesNotMatch(generator, /line\.lang\s*===\s*["']zh-CN["']/);
  });

  it("rejects local macOS text-to-speech providers", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "parrot-audio-"));

    try {
      await assert.rejects(
        execFileAsync("node", [
          "scripts/generate-static-audio.mjs",
          "--provider=macos-say",
          "--only=turn-hello",
          `--output-dir=${outputDir}`,
          "--force",
        ]),
        /Unsupported TTS provider: macos-say/
      );
    } finally {
      await rm(outputDir, { force: true, recursive: true });
    }
  });
});
