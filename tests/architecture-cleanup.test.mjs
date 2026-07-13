import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

function readProjectFile(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("architecture cleanup contracts", () => {
  it("groups browser source by responsibility", () => {
    const expectedModules = [
      "src/app/App.tsx",
      "src/auth/AuthGate.tsx",
      "src/conversation/ConversationSurface.tsx",
      "src/db/schema.ts",
      "src/learner-profile/LearnerProfileGate.tsx",
      "src/lessons/LessonPlayerUi.tsx",
      "src/media/audio-playback.ts",
      "src/shared/ui.tsx",
      "src/testing/e2e-browser-mocks.ts",
    ];

    for (const path of expectedModules) {
      assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true, path);
    }

    const rootSourceFiles = readdirSync(
      new URL("../src", import.meta.url),
      { withFileTypes: true },
    )
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();

    assert.deepEqual(rootSourceFiles, [
      "lesson.css",
      "main.tsx",
      "styles.css",
      "vite-env.d.ts",
    ]);
  });

  it("uses the discovered lesson catalog and current scene data", () => {
    const app = readProjectFile("src/app/App.tsx");
    const lessonList = readProjectFile("src/lessons/LessonList.tsx");

    assert.match(lessonList, /LESSONS/);
    assert.match(app, /VISUAL_CATALOG/);
    assert.match(app, /currentLesson\.scenes\.length/);
    assert.doesNotMatch(app, /LESSON_STEPS|PROGRESS_DOT_COUNT/);
  });

  it("renders generic story characters with scene controls", () => {
    const app = readProjectFile("src/app/App.tsx");
    const playerUi = readProjectFile("src/lessons/LessonPlayerUi.tsx");

    assert.match(app, /<LessonList/);
    assert.match(app, /Back to lessons/);
    assert.doesNotMatch(app, /<select|Lesson picker/);
    assert.match(app, /<LessonCharacters/);
    assert.match(playerUi, /characters\.map/);
    assert.match(app, /ChevronLeft|ChevronRight/);
    assert.match(app, /SCENE_NEXT|SCENE_PREVIOUS/);
  });

  it("keeps the active lesson experience English-only", () => {
    const runtimeFiles = [
      "src/app/App.tsx",
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
    const app = readProjectFile("src/app/App.tsx");
    const lessonAudio = readProjectFile("lib/lesson-audio.js");
    const playbackPath = new URL("../src/tts-playback.ts", import.meta.url);

    assert.match(app, /from "\.\.\/media\/audio-playback"/);
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

  it("documents durable transcripts without raw-audio retention", () => {
    const readme = readProjectFile("README.md");
    const agent = readProjectFile("agent/index.ts");
    const worker = readProjectFile("worker/conversations.ts");

    assert.match(readme, /finalized conversation transcript/i);
    assert.match(readme, /raw audio is\s+not stored/i);
    assert.match(agent, /record:\s*AGENT_SESSION_START_OPTIONS\.record/);
    assert.doesNotMatch(worker, /audio(?:Blob|Base64|Bytes)|rawAudio/i);
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
