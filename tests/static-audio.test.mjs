import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import * as staticAudio from "../lib/static-audio.js";

const getStaticAudioLineForSpeech =
  staticAudio.getStaticAudioLineForSpeech ?? (() => undefined);
const lessonDirectory = new URL("../content/lessons/", import.meta.url);
const lessons = readdirSync(lessonDirectory)
  .filter((filename) => filename.endsWith(".json"))
  .sort((left, right) => left.localeCompare(right))
  .map((filename) =>
    JSON.parse(readFileSync(new URL(filename, lessonDirectory), "utf8"))
  );
const feedbackLines = [
  "Great job!",
  "Almost! Try again, Bella.",
  "Almost! Let's keep going.",
  "I couldn't hear that. Try again, Bella.",
  "I couldn't hear that. Let's keep going.",
];
const normalizedCharacterSources = {
  "peppa-cant-reach": "/assets/audio/peppa-cant-reach.mp3",
  "peppa-can-help": "/assets/audio/peppa-can-help.mp3",
  "dolly-can-help": "/assets/audio/dolly-can-help.mp3",
  "dolly-here-you-are": "/assets/audio/dolly-here-you-are.mp3",
  "peppa-thank-you": "/assets/audio/peppa-thank-you.mp3",
  "dolly-thank-you": "/assets/audio/dolly-thank-you.mp3",
};
const onboardingAudio = {
  "onboarding-v2-name": "Hi! I'm Peppa. What's your name?",
  "onboarding-v2-age": "How old are you?",
  "onboarding-v2-cartoons": "What cartoons do you like?",
  "onboarding-v2-animals": "What animals do you like?",
  "onboarding-v2-fun": "What do you like doing for fun?",
  "onboarding-v2-stories": "What kind of stories do you like?",
};

describe("static audio cache metadata", () => {
  it("resolves speech by speaker and exact text", () => {
    assert.equal(typeof staticAudio.getStaticAudioLineForSpeech, "function");
    assert.equal(
      getStaticAudioLineForSpeech("dolly", "Here you are!").src,
      "/assets/audio/dolly-here-you-are.mp3"
    );
    assert.equal(
      getStaticAudioLineForSpeech("narrator", "Let's copy Dolly!").src,
      "/assets/audio/narrator-copy-dolly.mp3"
    );
  });

  it("covers every scripted non-user line and runner feedback line", () => {
    const scriptedLines = lessons.flatMap((lesson) =>
      lesson.scenes.flatMap((scene) =>
        scene.steps
          .filter((step) => step.speaker !== "user")
          .map((step) => [step.speaker, step.dialogue])
      )
    );

    for (const [speaker, text] of scriptedLines) {
      const line = getStaticAudioLineForSpeech(speaker, text);
      assert.ok(line, `${speaker}: ${text}`);
      assert.equal(line.text, text);
    }
    for (const text of feedbackLines) {
      const line = getStaticAudioLineForSpeech("narrator", text);
      assert.ok(line, `narrator: ${text}`);
      assert.equal(line.text, text);
    }
  });

  it("contains only English speaker metadata", () => {
    const allowedSpeakers = new Set(["peppa", "dolly", "narrator"]);
    for (const [id, line] of Object.entries(staticAudio.STATIC_AUDIO_LINES)) {
      assert.ok(allowedSpeakers.has(line.speaker), `${id} speaker`);
      assert.equal(line.lang, "en-US", `${id} language`);
      assert.doesNotMatch(line.text, /[\u3400-\u9fff]/u, `${id} text`);
      assert.match(line.src, /^\/assets\/audio\/.+\.mp3$/, `${id} source`);
    }
  });

  it("has one existing saved file per unique speaker and text pair", () => {
    const speechKeys = new Set();

    for (const [id, line] of Object.entries(staticAudio.STATIC_AUDIO_LINES)) {
      const speechKey = `${line.speaker}\0${line.text}`;
      assert.equal(speechKeys.has(speechKey), false, `${id} duplicate speech key`);
      speechKeys.add(speechKey);
      assert.equal(
        existsSync(new URL(`../public${line.src}`, import.meta.url)),
        true,
        `${id} saved file`
      );
      assert.ok(
        statSync(new URL(`../public${line.src}`, import.meta.url)).size > 0,
        `${id} non-empty saved file`,
      );
    }
  });

  it("uses speaker-specific cache files instead of deleted legacy assets", () => {
    for (const [id, expectedSource] of Object.entries(normalizedCharacterSources)) {
      assert.equal(staticAudio.STATIC_AUDIO_LINES[id].src, expectedSource, id);
    }
  });

  it("throws a clear error for uncached speech", () => {
    assert.throws(
      () => getStaticAudioLineForSpeech("narrator", "A brand new line."),
      /Missing saved audio for narrator: A brand new line\./
    );
  });

  it("registers exact Peppa onboarding prompts with character-directed audio", () => {
    for (const [id, text] of Object.entries(onboardingAudio)) {
      const line = staticAudio.STATIC_AUDIO_LINES[id];
      assert.ok(line, id);
      assert.equal(line.speaker, "peppa", id);
      assert.equal(line.text, text, id);
      assert.equal(line.voiceStyle, "energetic-character", id);
      assert.match(line.ttsText, /\[[^\]]+\]/, id);
    }
    const generator = readFileSync(
      new URL("../scripts/generate-static-audio.mjs", import.meta.url),
      "utf8",
    );
    assert.match(generator, /Oqy85UMasXzUjUxF0ta5/);
    assert.match(generator, /ELEVENLABS_DEFAULT_MODEL = "eleven_v3"/);
    for (const legacyId of [
      "onboarding-introduction",
      "onboarding-age",
      "onboarding-favourite-cartoons",
      "onboarding-favourite-animals",
      "onboarding-favourite-activities",
      "onboarding-favourite-story-topics",
    ]) {
      assert.equal(staticAudio.STATIC_AUDIO_LINES[legacyId], undefined, legacyId);
    }
  });
});
