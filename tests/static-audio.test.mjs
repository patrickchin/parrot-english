import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import * as staticAudio from "../lib/static-audio.js";

const getStaticAudioLineForSpeech =
  staticAudio.getStaticAudioLineForSpeech ?? (() => undefined);
const lesson = JSON.parse(
  readFileSync(
    new URL("../content/lessons/peppas-high-ball.json", import.meta.url),
    "utf8"
  )
);
const feedbackLines = [
  "Great job!",
  "Almost! Try again, Bella.",
  "Almost! Let's keep going.",
  "I couldn't hear that. Try again, Bella.",
  "I couldn't hear that. Let's keep going.",
];
const normalizedCharacterSources = {
  "peppa-cant-reach": "/assets/audio/peppa-cant-reach.wav",
  "peppa-can-help": "/assets/audio/peppa-can-help.wav",
  "dolly-can-help": "/assets/audio/dolly-can-help.wav",
  "dolly-here-you-are": "/assets/audio/dolly-here-you-are.wav",
  "peppa-thank-you": "/assets/audio/peppa-thank-you.wav",
  "dolly-thank-you": "/assets/audio/dolly-thank-you.wav",
};

describe("static audio cache metadata", () => {
  it("resolves speech by speaker and exact text", () => {
    assert.equal(typeof staticAudio.getStaticAudioLineForSpeech, "function");
    assert.equal(
      getStaticAudioLineForSpeech("dolly", "Here you are!").src,
      "/assets/audio/dolly-here-you-are.wav"
    );
    assert.equal(
      getStaticAudioLineForSpeech("narrator", "Let's copy Dolly!").src,
      "/assets/audio/narrator-copy-dolly.wav"
    );
  });

  it("covers every scripted non-user line and runner feedback line", () => {
    const scriptedLines = lesson.scenes.flatMap((scene) =>
      scene.steps
        .filter((step) => step.speaker !== "user")
        .map((step) => [step.speaker, step.dialogue])
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
      assert.match(line.src, /^\/assets\/audio\/.+\.wav$/, `${id} source`);
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
});
