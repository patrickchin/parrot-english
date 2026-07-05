import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

function readProjectFile(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("architecture cleanup contracts", () => {
  it("uses the discovered lesson catalog and current scene data", () => {
    const app = readProjectFile("src/App.tsx");

    assert.match(app, /LESSONS/);
    assert.match(app, /VISUAL_CATALOG/);
    assert.match(app, /currentLesson\.scenes\.length/);
    assert.doesNotMatch(app, /LESSON_STEPS|PROGRESS_DOT_COUNT/);
  });

  it("renders generic story characters with scene controls", () => {
    const app = readProjectFile("src/App.tsx");

    assert.match(app, /<LessonList/);
    assert.match(app, /Back to lessons/);
    assert.doesNotMatch(app, /<select|Lesson picker/);
    assert.match(app, /scene\.characters\.map/);
    assert.match(app, /narrator-caption/);
    assert.match(app, /ChevronLeft|ChevronRight/);
    assert.match(app, /SCENE_NEXT|SCENE_PREVIOUS/);
    assert.match(app, /learner-target-pill/);
    assert.doesNotMatch(app, /scene-control-dock/);
  });

  it("keeps the active lesson experience English-only", () => {
    const runtimeFiles = [
      "src/App.tsx",
      "lib/lesson-audio.js",
      "lib/lesson-progress.js",
      "lib/lesson-scene.js",
      "lib/lesson-state.js",
      "lib/speech-scoring.js",
      "lib/static-audio.js",
    ];

    for (const path of runtimeFiles) {
      assert.doesNotMatch(readProjectFile(path), /[\u3400-\u9fff]/u, path);
    }
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
    assert.doesNotMatch(generator, /4NQthjVhIGGVfL3Si000/);
    assert.match(generator, /5N1BjZ10t6GcJUhZCP40/);
    assert.match(generator, /pFZP5JQG7iQjIQuC4Bku/);
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
