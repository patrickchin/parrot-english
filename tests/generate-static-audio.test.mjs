import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { promisify } from "node:util";
import { describe, it } from "node:test";
import { STATIC_AUDIO_LINES } from "../lib/static-audio.js";
import { getGenerationLines } from "../scripts/generate-static-audio.mjs";

const execFileAsync = promisify(execFile);

describe("static audio generator", () => {
  it("selects static lines by default without running generation", async () => {
    const lines = await getGenerationLines({ includePrivateStories: false });

    assert.equal(lines, STATIC_AUDIO_LINES);
    assert.equal(lines["private-fixture-page-001-narration"], undefined);
  });

  it("adds synthetic private narration with output inside the preview directory", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-audio-lines-"));
    const previewDirectory = join(projectRoot, "content/private-story-preview");
    await mkdir(previewDirectory, { recursive: true });
    await writeFile(
      join(previewDirectory, "manifest.json"),
      JSON.stringify({
        version: 1,
        stories: [
          {
            id: "private-fixture",
            textFile: "story-1.txt",
            title: "Fixture Story",
          },
        ],
      }),
    );
    await writeFile(
      join(previewDirectory, "story-1.txt"),
      "# Fixture Story\n\nSynthetic page text.\n",
    );

    try {
      const lines = await getGenerationLines({
        includePrivateStories: true,
        previewDirectory,
        projectRoot,
      });
      const privateLine = lines["private-fixture-page-001-narration"];
      const outputRelativePath = relative(
        previewDirectory,
        privateLine.outputFilePath,
      );

      assert.equal(privateLine.text, "Synthetic page text.");
      assert.equal(privateLine.speaker, "narrator");
      assert.equal(isAbsolute(privateLine.outputFilePath), true);
      assert.equal(outputRelativePath.startsWith(".."), false);
      assert.equal(isAbsolute(outputRelativePath), false);
      assert.equal(lines["turn-hello"], STATIC_AUDIO_LINES["turn-hello"]);
    } finally {
      await rm(projectRoot, { force: true, recursive: true });
    }
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
