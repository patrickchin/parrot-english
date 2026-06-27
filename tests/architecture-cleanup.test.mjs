import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

function readProjectFile(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("architecture cleanup contracts", () => {
  it("derives progress dots from the current lesson data", () => {
    const app = readProjectFile("src/App.tsx");

    assert.doesNotMatch(app, /PROGRESS_DOT_COUNT/);
    assert.match(app, /Array\.from\(\{\s*length:\s*LESSON_STEPS\.length\s*\}/s);
  });

  it("keeps browser lesson playback asset-only", () => {
    const app = readProjectFile("src/App.tsx");
    const lessonAudio = readProjectFile("lib/lesson-audio.js");
    const playbackPath = new URL("../src/tts-playback.ts", import.meta.url);

    assert.match(app, /from "\.\/audio-playback"/);
    assert.doesNotMatch(app, /tts-playback|TTS|previousAudioUrl|revokeObjectURL/);
    assert.doesNotMatch(lessonAudio, /\bengine\b|\bslow\b|character[:,]/);
    assert.equal(existsSync(playbackPath), false);
  });

  it("does not preserve the disabled runtime TTS API surface", () => {
    const worker = readProjectFile("worker/index.ts");
    const apiSecurity = readProjectFile("worker/api-security.ts");
    const readme = readProjectFile("README.md");

    assert.doesNotMatch(worker, /\/api\/tts|createTtsBlockedResponse/);
    assert.doesNotMatch(apiSecurity, /createTtsBlockedResponse|tts_endpoint_disabled/);
    assert.doesNotMatch(readme, /\/api\/tts|Runtime TTS is disabled/);
  });

  it("uses ElevenLabs-only saved-audio generation defaults", () => {
    const generator = readProjectFile("scripts/generate-static-audio.mjs");
    const packageJson = readProjectFile("package.json");

    assert.doesNotMatch(
      generator,
      /GROQ_TTS|requestGroqSpeech|provider === "groq"|canopylabs\/orpheus/
    );
    assert.doesNotMatch(packageJson, /generate:audio:groq/);
    assert.match(generator, /ELEVENLABS_DEFAULT_MODEL = "eleven_v3"/);
    assert.match(generator, /Oqy85UMasXzUjUxF0ta5/);
    assert.match(generator, /4NQthjVhIGGVfL3Si000/);
    assert.match(generator, /line\.ttsText \?\? line\.text/);
  });

  it("keeps scene metadata to fields consumed by rendering", () => {
    const scene = readProjectFile("lib/lesson-scene.js");

    assert.doesNotMatch(scene, /futureSrc|sparkle/);
  });

  it("type-checks the shared lesson contract modules", () => {
    const contractModules = [
      "lib/lesson-audio.js",
      "lib/lesson-data.js",
      "lib/lesson-progress.js",
      "lib/lesson-scene.js",
      "lib/lesson-state.js",
      "lib/static-audio.js",
      "lib/speech-scoring.js",
    ];

    for (const path of contractModules) {
      assert.match(readProjectFile(path), /^\/\/ @ts-check\b/, path);
    }
  });
});
