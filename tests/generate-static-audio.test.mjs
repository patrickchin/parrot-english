import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  link,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";
import { promisify } from "node:util";
import { describe, it } from "node:test";
import { STATIC_AUDIO_LINES } from "../lib/static-audio.js";
import * as audioGenerator from "../scripts/generate-static-audio.mjs";

const {
  getGenerationLines,
  readSpeechAudioResponse,
  requestSpeechWithRateLimitRetry,
} = audioGenerator;

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

function successfulSpeechResponse(audioBytes) {
  return {
    body: null,
    ok: true,
    status: 200,
    async arrayBuffer() {
      return audioBytes;
    },
  };
}

function generatePrivateAudio({
  audioBytes = Buffer.from("synthetic audio"),
  forceOverwrite = false,
  id = "private-fixture-page-001-narration",
  outputFilePath,
  previewDirectory,
  privateWriteOptions,
  projectRoot,
  requestSpeechImplementation = async () => successfulSpeechResponse(audioBytes),
}) {
  return audioGenerator.generateAudioFile(
    "synthetic-api-key",
    id,
    {
      outputFilePath,
      speaker: "narrator",
      text: "Synthetic narration.",
    },
    {
      forceOverwrite,
      previewDirectory,
      privateWriteOptions,
      projectRoot,
      requestSpeechImplementation,
    },
  );
}

describe("static audio generator", () => {
  it("publishes exact private narration bytes without real provider traffic", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-audio-write-"));
    const previewDirectory = join(projectRoot, "content/private-story-preview");
    const outputFilePath = join(
      previewDirectory,
      "audio/private-fixture/page-001.mp3",
    );
    const expectedAudio = Buffer.from([0x49, 0x44, 0x33, 0x10, 0x20, 0x30]);
    await mkdir(previewDirectory, { recursive: true });

    try {
      assert.equal(
        typeof audioGenerator.generateAudioFile,
        "function",
        "private generation must expose its filesystem boundary for hermetic tests",
      );
      const status = await generatePrivateAudio({
        audioBytes: expectedAudio,
        outputFilePath,
        previewDirectory,
        projectRoot,
      });

      assert.equal(status, "generated");
      assert.deepEqual(await readFile(outputFilePath), expectedAudio);
    } finally {
      await rm(projectRoot, { force: true, recursive: true });
    }
  });

  it("rejects an output ancestor replaced by a symlink while speech is pending", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-audio-race-"));
    const previewDirectory = join(projectRoot, "content/private-story-preview");
    const externalDirectory = join(projectRoot, "external-audio");
    const outputFilePath = join(
      previewDirectory,
      "audio/private-fixture/page-001.mp3",
    );
    const externalOutput = join(
      externalDirectory,
      "private-fixture/page-001.mp3",
    );
    let releaseRequest;
    let markRequestStarted;
    const requestStarted = new Promise((resolve) => {
      markRequestStarted = resolve;
    });
    const pendingResponse = new Promise((resolve) => {
      releaseRequest = resolve;
    });
    await Promise.all([
      mkdir(previewDirectory, { recursive: true }),
      mkdir(externalDirectory),
    ]);

    try {
      const generation = generatePrivateAudio({
        outputFilePath,
        previewDirectory,
        projectRoot,
        async requestSpeechImplementation() {
          markRequestStarted();
          return pendingResponse;
        },
      });
      await requestStarted;
      await symlink(externalDirectory, join(previewDirectory, "audio"));
      releaseRequest(successfulSpeechResponse(Buffer.from("synthetic audio")));

      await assert.rejects(
        generation,
        /must stay inside the private preview directory/,
      );
      await assert.rejects(() => readFile(externalOutput), { code: "ENOENT" });
    } finally {
      await rm(projectRoot, { force: true, recursive: true });
    }
  });

  it("force-publishes over a replaced final symlink without changing its target", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-audio-leaf-race-"));
    const previewDirectory = join(projectRoot, "content/private-story-preview");
    const outputFilePath = join(
      previewDirectory,
      "audio/private-fixture/page-001.mp3",
    );
    const externalOutput = join(projectRoot, "external-existing.mp3");
    const originalExternalAudio = Buffer.from("external audio must stay unchanged");
    const replacementAudio = Buffer.from([0x49, 0x44, 0x33, 0xaa, 0xbb]);
    let releaseRequest;
    let markRequestStarted;
    const requestStarted = new Promise((resolve) => {
      markRequestStarted = resolve;
    });
    const pendingResponse = new Promise((resolve) => {
      releaseRequest = resolve;
    });
    await mkdir(previewDirectory, { recursive: true });
    await writeFile(externalOutput, originalExternalAudio);

    try {
      const generation = generatePrivateAudio({
        forceOverwrite: true,
        outputFilePath,
        previewDirectory,
        projectRoot,
        async requestSpeechImplementation() {
          markRequestStarted();
          return pendingResponse;
        },
      });
      await requestStarted;
      await mkdir(join(previewDirectory, "audio/private-fixture"), {
        recursive: true,
      });
      await symlink(externalOutput, outputFilePath);
      releaseRequest(successfulSpeechResponse(replacementAudio));

      assert.equal(await generation, "generated");
      assert.equal((await lstat(outputFilePath)).isSymbolicLink(), false);
      assert.deepEqual(await readFile(outputFilePath), replacementAudio);
      assert.deepEqual(await readFile(externalOutput), originalExternalAudio);
    } finally {
      await rm(projectRoot, { force: true, recursive: true });
    }
  });

  it("refuses to skip invalid existing private outputs", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-audio-invalid-"));
    const previewDirectory = join(projectRoot, "content/private-story-preview");
    const audioDirectory = join(previewDirectory, "audio");
    const externalOutput = join(projectRoot, "external-existing.mp3");
    await mkdir(audioDirectory, { recursive: true });
    await writeFile(externalOutput, "external audio");
    const cases = [
      {
        id: "zero",
        async arrange(outputFilePath) {
          await writeFile(outputFilePath, Buffer.alloc(0));
        },
      },
      {
        id: "directory",
        async arrange(outputFilePath) {
          await mkdir(outputFilePath);
        },
      },
      {
        id: "symlink",
        async arrange(outputFilePath) {
          await symlink(externalOutput, outputFilePath);
        },
      },
    ];

    try {
      for (const fixture of cases) {
        const outputFilePath = join(audioDirectory, `${fixture.id}.mp3`);
        await fixture.arrange(outputFilePath);
        await assert.rejects(
          () =>
            generatePrivateAudio({
              id: `private-fixture-${fixture.id}-narration`,
              outputFilePath,
              previewDirectory,
              projectRoot,
              async requestSpeechImplementation() {
                throw new Error("provider must not run for an invalid output");
              },
            }),
          (error) => {
            assert.match(error.message, /private preview directory/i);
            assert.equal(error.message.includes(projectRoot), false);
            return true;
          },
          fixture.id,
        );
      }
    } finally {
      await rm(projectRoot, { force: true, recursive: true });
    }
  });

  it("skips only a stable non-empty regular private output", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-audio-skip-"));
    const previewDirectory = join(projectRoot, "content/private-story-preview");
    const outputFilePath = join(previewDirectory, "audio/page-001.mp3");
    const existingAudio = Buffer.from("existing synthetic audio");
    await mkdir(join(previewDirectory, "audio"), { recursive: true });
    await writeFile(outputFilePath, existingAudio);

    try {
      const status = await generatePrivateAudio({
        outputFilePath,
        previewDirectory,
        projectRoot,
        async requestSpeechImplementation() {
          throw new Error("provider must not run for a stable output");
        },
      });

      assert.equal(status, "skipped");
      assert.deepEqual(await readFile(outputFilePath), existingAudio);
    } finally {
      await rm(projectRoot, { force: true, recursive: true });
    }
  });

  it("leaves existing and absent finals unchanged after a partial temporary write", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-audio-partial-"));
    const previewDirectory = join(projectRoot, "content/private-story-preview");
    const replacementAudio = Buffer.from("complete replacement audio");
    const originalAudio = Buffer.from("original audio");
    await mkdir(previewDirectory, { recursive: true });
    const cases = [
      { id: "existing", original: originalAudio },
      { id: "absent", original: null },
    ];

    try {
      for (const fixture of cases) {
        const parentDirectory = join(previewDirectory, "audio", fixture.id);
        const outputFilePath = join(parentDirectory, "page-001.mp3");
        await mkdir(parentDirectory, { recursive: true });
        if (fixture.original) await writeFile(outputFilePath, fixture.original);

        await assert.rejects(
          () =>
            generatePrivateAudio({
              audioBytes: replacementAudio,
              forceOverwrite: true,
              id: `private-fixture-${fixture.id}-narration`,
              outputFilePath,
              previewDirectory,
              privateWriteOptions: {
                async writeBytes(fileHandle, bytes) {
                  await fileHandle.write(bytes.subarray(0, 2));
                  throw new Error("injected temporary write failure");
                },
              },
              projectRoot,
            }),
          (error) => {
            assert.match(error.message, /private preview directory/i);
            assert.equal(error.message.includes(projectRoot), false);
            assert.doesNotMatch(error.message, /injected/i);
            return true;
          },
        );

        if (fixture.original) {
          assert.deepEqual(await readFile(outputFilePath), fixture.original);
          assert.deepEqual(await readdir(parentDirectory), ["page-001.mp3"]);
        } else {
          await assert.rejects(() => readFile(outputFilePath), { code: "ENOENT" });
          assert.deepEqual(await readdir(parentDirectory), []);
        }
      }
    } finally {
      await rm(projectRoot, { force: true, recursive: true });
    }
  });

  it("refuses a short temporary write even when the injected writer resolves", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-audio-short-write-"));
    const previewDirectory = join(projectRoot, "content/private-story-preview");
    const outputFilePath = join(previewDirectory, "audio/page-001.mp3");
    await mkdir(previewDirectory, { recursive: true });

    try {
      await assert.rejects(
        () =>
          generatePrivateAudio({
            audioBytes: Buffer.from("complete synthetic audio"),
            forceOverwrite: true,
            outputFilePath,
            previewDirectory,
            privateWriteOptions: {
              async writeBytes(fileHandle, bytes) {
                await fileHandle.write(bytes.subarray(0, 1));
              },
            },
            projectRoot,
          }),
        /private preview directory/i,
      );
      await assert.rejects(() => readFile(outputFilePath), { code: "ENOENT" });
      assert.deepEqual(await readdir(dirname(outputFilePath)), []);
    } finally {
      await rm(projectRoot, { force: true, recursive: true });
    }
  });

  it("does not overwrite a final created concurrently in non-force mode", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-audio-publish-race-"));
    const previewDirectory = join(projectRoot, "content/private-story-preview");
    const outputFilePath = join(previewDirectory, "audio/page-001.mp3");
    const concurrentAudio = Buffer.from("concurrent synthetic audio");
    await mkdir(previewDirectory, { recursive: true });

    try {
      await assert.rejects(
        () =>
          generatePrivateAudio({
            audioBytes: Buffer.from("losing synthetic audio"),
            outputFilePath,
            previewDirectory,
            privateWriteOptions: {
              async beforePublish() {
                await writeFile(outputFilePath, concurrentAudio);
              },
            },
            projectRoot,
          }),
        /private preview directory/i,
      );
      assert.deepEqual(await readFile(outputFilePath), concurrentAudio);
      assert.deepEqual(await readdir(dirname(outputFilePath)), ["page-001.mp3"]);
    } finally {
      await rm(projectRoot, { force: true, recursive: true });
    }
  });

  it("atomically replaces an existing final in force mode", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-audio-force-"));
    const previewDirectory = join(projectRoot, "content/private-story-preview");
    const outputFilePath = join(previewDirectory, "audio/page-001.mp3");
    const replacementAudio = Buffer.from([0x49, 0x44, 0x33, 0xfe, 0xed]);
    await mkdir(dirname(outputFilePath), { recursive: true });
    await writeFile(outputFilePath, "old synthetic audio");

    try {
      const status = await generatePrivateAudio({
        audioBytes: replacementAudio,
        forceOverwrite: true,
        outputFilePath,
        previewDirectory,
        projectRoot,
      });

      assert.equal(status, "generated");
      assert.deepEqual(await readFile(outputFilePath), replacementAudio);
      assert.deepEqual(await readdir(dirname(outputFilePath)), ["page-001.mp3"]);
    } finally {
      await rm(projectRoot, { force: true, recursive: true });
    }
  });

  it("leaves an existing final unchanged when the provider request fails", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "parrot-audio-request-fail-"));
    const previewDirectory = join(projectRoot, "content/private-story-preview");
    const outputFilePath = join(previewDirectory, "audio/page-001.mp3");
    const originalAudio = Buffer.from("original synthetic audio");
    await mkdir(dirname(outputFilePath), { recursive: true });
    await writeFile(outputFilePath, originalAudio);

    try {
      await assert.rejects(
        () =>
          generatePrivateAudio({
            forceOverwrite: true,
            outputFilePath,
            previewDirectory,
            projectRoot,
            async requestSpeechImplementation() {
              return {
                body: null,
                ok: false,
                status: 503,
              };
            },
          }),
        { message: "private-fixture-page-001-narration failed with HTTP 503" },
      );
      assert.deepEqual(await readFile(outputFilePath), originalAudio);
      assert.deepEqual(await readdir(dirname(outputFilePath)), ["page-001.mp3"]);
    } finally {
      await rm(projectRoot, { force: true, recursive: true });
    }
  });

  it("preserves the public generator's direct write and skip behavior", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "parrot-public-audio-"));
    const outputFilePath = join(outputDirectory, "synthetic-public.mp3");
    const publicDirectory = new URL("../public/", import.meta.url).pathname;
    const expectedAudio = Buffer.from("synthetic public audio");
    const line = {
      speaker: "narrator",
      src: relative(publicDirectory, outputFilePath),
      text: "Synthetic narration.",
    };

    try {
      assert.equal(
        await audioGenerator.generateAudioFile(
          "synthetic-api-key",
          "synthetic-public-narration",
          line,
          {
            forceOverwrite: false,
            async requestSpeechImplementation() {
              return {
                body: null,
                ok: true,
                status: 200,
                async arrayBuffer() {
                  return expectedAudio;
                },
              };
            },
          },
        ),
        "generated",
      );
      assert.deepEqual(await readFile(outputFilePath), expectedAudio);
      assert.equal(
        await audioGenerator.generateAudioFile(
          "synthetic-api-key",
          "synthetic-public-narration",
          line,
          {
            forceOverwrite: false,
            async requestSpeechImplementation() {
              throw new Error("provider must not run for an existing public output");
            },
          },
        ),
        "skipped",
      );
      assert.deepEqual(await readFile(outputFilePath), expectedAudio);
    } finally {
      await rm(outputDirectory, { force: true, recursive: true });
    }
  });

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
