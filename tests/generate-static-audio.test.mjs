import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  link,
  mkdtemp,
  mkdir,
  rm,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { promisify } from "node:util";
import { describe, it } from "node:test";
import { STATIC_AUDIO_LINES } from "../lib/static-audio.js";
import {
  getGenerationLines,
  readSpeechAudioResponse,
  requestSpeechWithRateLimitRetry,
} from "../scripts/generate-static-audio.mjs";

const execFileAsync = promisify(execFile);

async function writeSyntheticPrivatePreview(previewDirectory) {
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
        {
          id: "private-second",
          textFile: "story-2.txt",
          title: "Second Fixture",
        },
      ],
    }),
  );
  await writeFile(
    join(previewDirectory, "story-1.txt"),
    "# Fixture Story\n\nSynthetic page text.\n",
  );
  await writeFile(
    join(previewDirectory, "story-2.txt"),
    "# Second Fixture\n\nSecond synthetic page text.\n",
  );
}

function syntheticWords(count) {
  return Array.from({ length: count }, (_, index) => `word${index + 1}`).join(" ");
}

describe("static audio generator", () => {
  it("selects static lines by default without running generation", async () => {
    const lines = await getGenerationLines();

    assert.equal(lines, STATIC_AUDIO_LINES);
    assert.equal(lines["private-fixture-page-001-narration"], undefined);
  });

  it("selects only synthetic private narration with output inside the preview directory", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-audio-lines-"));
    const previewDirectory = join(projectRoot, "content/private-story-preview");
    await writeSyntheticPrivatePreview(previewDirectory);

    try {
      const lines = await getGenerationLines({
        privateStoriesOnly: true,
        previewDirectory,
        projectRoot,
      });
      assert.deepEqual(Object.keys(lines).sort(), [
        "private-fixture-page-001-narration",
        "private-second-page-001-narration",
      ]);
      assert.deepEqual(
        Object.keys(lines).filter((id) => Object.hasOwn(STATIC_AUDIO_LINES, id)),
        [],
      );
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
    } finally {
      await rm(projectRoot, { force: true, recursive: true });
    }
  });

  it("rejects a symlinked private audio output ancestor", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-audio-symlink-"));
    const previewDirectory = join(projectRoot, "content/private-story-preview");
    const externalDirectory = join(projectRoot, "external-audio");
    await writeSyntheticPrivatePreview(previewDirectory);
    await mkdir(externalDirectory);
    await symlink(externalDirectory, join(previewDirectory, "audio"));

    try {
      await assert.rejects(
        () =>
          getGenerationLines({
            privateStoriesOnly: true,
            previewDirectory,
            projectRoot,
          }),
        /must stay inside the private preview directory/,
      );
    } finally {
      await rm(projectRoot, { force: true, recursive: true });
    }
  });

  it("rejects a symlinked content ancestor between the project and preview", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-audio-root-link-"));
    const externalContent = await mkdtemp(join(tmpdir(), "parrot-audio-content-"));
    const previewDirectory = join(projectRoot, "content/private-story-preview");
    const externalPreview = join(externalContent, "private-story-preview");
    await writeSyntheticPrivatePreview(externalPreview);
    await symlink(externalContent, join(projectRoot, "content"));

    try {
      await assert.rejects(
        () =>
          getGenerationLines({
            privateStoriesOnly: true,
            previewDirectory,
            projectRoot,
          }),
        /must stay inside the private preview directory/,
      );
    } finally {
      await Promise.all([
        rm(projectRoot, { force: true, recursive: true }),
        rm(externalContent, { force: true, recursive: true }),
      ]);
    }
  });

  it("enforces the aggregate narration cap in private generation mode", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-audio-aggregate-"));
    const previewDirectory = join(projectRoot, "content/private-story-preview");
    await writeSyntheticPrivatePreview(previewDirectory);
    await writeFile(
      join(previewDirectory, "story-1.txt"),
      `# Fixture Story\n\n${syntheticWords(70)}\n\nfinal\n`,
    );
    const firstDirectory = join(previewDirectory, "audio/private-fixture");
    const secondDirectory = join(previewDirectory, "audio/private-second");
    await Promise.all([
      mkdir(firstDirectory, { recursive: true }),
      mkdir(secondDirectory, { recursive: true }),
    ]);
    const firstAudio = join(firstDirectory, "page-001.mp3");
    await writeFile(firstAudio, "x");
    await truncate(firstAudio, 32 * 1024 * 1024 - 1);
    await link(firstAudio, join(firstDirectory, "page-002.mp3"));
    await writeFile(join(secondDirectory, "page-001.mp3"), "xyz");

    try {
      await assert.rejects(
        () => getGenerationLines({
          privateStoriesOnly: true,
          previewDirectory,
          projectRoot,
        }),
        { message: "Narration audio must total at most 67108864 bytes" },
      );
    } finally {
      await rm(projectRoot, { force: true, recursive: true });
    }
  });

  it("reports only the safe audio ID and numeric status for provider failures", async () => {
    const privatePageText = "Synthetic provider body that must remain private.";
    let cancelCalls = 0;
    let textCalls = 0;
    const response = {
      body: {
        async cancel() {
          cancelCalls += 1;
          throw new Error(privatePageText);
        },
      },
      ok: false,
      status: 503,
      get headers() {
        throw new Error("headers must not be read");
      },
      get statusText() {
        throw new Error("statusText must not be read");
      },
      async arrayBuffer() {
        throw new Error("audio bytes must not be read after a failure");
      },
      async json() {
        throw new Error("JSON must not be read");
      },
      async text() {
        textCalls += 1;
        return privatePageText;
      },
    };

    await assert.rejects(
      () => readSpeechAudioResponse("private-page-001-narration", response),
      (error) => {
        assert.equal(
          error.message,
          "private-page-001-narration failed with HTTP 503",
        );
        assert.doesNotMatch(error.message, new RegExp(privatePageText));
        return true;
      },
    );
    assert.equal(cancelCalls, 1);
    assert.equal(textCalls, 0);
  });

  it("cancels a rate-limited body before retrying without inspecting it", async () => {
    const privatePageText = "Synthetic rate-limit body that must remain private.";
    const expectedAudio = Buffer.from([0x49, 0x44, 0x33, 0x06, 0x07, 0x08]);
    let cancelCalls = 0;
    let jsonCalls = 0;
    let requestCalls = 0;
    let textCalls = 0;
    const events = [];
    const waits = [];
    const throttledResponse = {
      body: {
        async cancel() {
          cancelCalls += 1;
          events.push("cancel");
          throw new Error(privatePageText);
        },
      },
      ok: false,
      status: 429,
      get headers() {
        throw new Error("headers must not be read");
      },
      get statusText() {
        throw new Error("statusText must not be read");
      },
      async json() {
        jsonCalls += 1;
        return { detail: privatePageText };
      },
      async text() {
        textCalls += 1;
        return privatePageText;
      },
    };
    const successfulResponse = {
      body: null,
      ok: true,
      status: 200,
      async arrayBuffer() {
        return expectedAudio;
      },
    };
    const responses = [throttledResponse, successfulResponse];

    const response = await requestSpeechWithRateLimitRetry(
      "synthetic-api-key",
      { speaker: "narrator", text: "Synthetic narration." },
      {
        async requestSpeechImplementation() {
          events.push(`request-${requestCalls + 1}`);
          const responseForAttempt = responses[requestCalls];
          requestCalls += 1;
          return responseForAttempt;
        },
        async waitImplementation(duration) {
          events.push(`wait-${duration}`);
          waits.push(duration);
        },
      },
    );

    assert.equal(response, successfulResponse);
    assert.equal(cancelCalls, 1);
    assert.equal(jsonCalls, 0);
    assert.equal(requestCalls, 2);
    assert.equal(textCalls, 0);
    assert.deepEqual(events, ["request-1", "cancel", "wait-7000", "request-2"]);
    assert.deepEqual(waits, [7000]);
    assert.deepEqual(
      await readSpeechAudioResponse("private-page-001-narration", response),
      expectedAudio,
    );
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
