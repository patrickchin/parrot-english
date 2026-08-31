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

describe("static audio generator", () => {
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

  it("chooses ElevenLabs voices from speaker metadata", () => {
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
