import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename } from "node:path";
import { describe, it } from "node:test";
import * as staticAudio from "../lib/static-audio.js";
import { DUB_LINES } from "../src/dubbing/dub-script.ts";
import { OLD_MACDONALD_DUB } from "../src/dubbing/rhyme-catalog.ts";
import { STORIES } from "../src/stories/story-catalog.ts";

const getStaticAudioLineForSpeech =
  staticAudio.getStaticAudioLineForSpeech ?? (() => undefined);
const lessonDirectory = new URL("../content/lessons/", import.meta.url);
const lessons = readdirSync(lessonDirectory)
  .filter((filename) => filename.endsWith(".json"))
  .sort((left, right) => left.localeCompare(right))
  .map((filename) =>
    JSON.parse(readFileSync(new URL(filename, lessonDirectory), "utf8"))
  );
const normalizedCharacterSources = {
  "peppa-cant-reach": "/assets/audio/peppa-cant-reach.mp3",
  "peppa-can-help": "/assets/audio/peppa-can-help.mp3",
  "dolly-can-help": "/assets/audio/dolly-can-help.mp3",
  "dolly-here-you-are": "/assets/audio/dolly-here-you-are.mp3",
  "peppa-thank-you": "/assets/audio/peppa-thank-you.mp3",
  "dolly-thank-you": "/assets/audio/dolly-thank-you.mp3",
};
const learnerProfileAudio = {
  "learner-profile-v2-name": "Hi! I'm Peppa. What's your name?",
  "learner-profile-v2-age": "How old are you?",
  "learner-profile-v2-cartoons": "What cartoons do you like?",
  "learner-profile-v2-animals": "What animals do you like?",
  "learner-profile-v2-fun": "What do you like doing for fun?",
  "learner-profile-v2-stories": "What kind of stories do you like?",
};
const OLD_MACDONALD_GUIDE_FILES = [
  "old-macdonald-v1-guide-line-1.mp3",
  "old-macdonald-v1-guide-line-2.mp3",
  "old-macdonald-v1-guide-line-3.mp3",
  "old-macdonald-v1-guide-line-4.mp3",
  "old-macdonald-v1-guide-line-5.mp3",
  "old-macdonald-v1-guide-line-6.mp3",
  "old-macdonald-v1-guide-line-9.mp3",
  "old-macdonald-v1-guide-line-10.mp3",
  "old-macdonald-v1-guide-line-11.mp3",
  "old-macdonald-v1-guide-line-12.mp3",
  "old-macdonald-v1-guide-line-13.mp3",
  "old-macdonald-v1-guide-line-16.mp3",
  "old-macdonald-v1-guide-line-17.mp3",
  "old-macdonald-v1-guide-line-18.mp3",
  "old-macdonald-v1-guide-line-19.mp3",
  "old-macdonald-v1-guide-line-20.mp3",
  "old-macdonald-v1-guide-line-23.mp3",
  "old-macdonald-v1-guide-line-24.mp3",
  "old-macdonald-v1-guide-line-25.mp3",
  "old-macdonald-v1-guide-line-26.mp3",
  "old-macdonald-v1-guide-line-27.mp3",
  "old-macdonald-v1-guide-line-30.mp3",
  "old-macdonald-v1-guide-line-31.mp3",
  "old-macdonald-v1-guide-line-32.mp3",
  "old-macdonald-v1-guide-line-33.mp3",
  "old-macdonald-v1-guide-line-34.mp3",
].sort();

describe("static audio cache metadata", () => {
  it("registers one exact-text group cue for every supported built-in target", () => {
    assert.equal(typeof staticAudio.LESSON_JOIN_IN_AUDIO_LINES, "object");
    assert.equal(Object.keys(staticAudio.LESSON_JOIN_IN_AUDIO_LINES).length, 17);
    assert.deepEqual(staticAudio.LESSON_JOIN_IN_AUDIO_LINES["It is up high!"], {
      id: "lesson-join-in-dolly-it-is-up-high",
      sourceAudioId: "dolly-it-is-up-high",
      text: "It is up high!",
    });
  });

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

  it("registers an ElevenLabs narrator guide for every unique duck lyric", () => {
    const guideLines = new Map();
    for (const { text } of DUB_LINES) {
      const line = getStaticAudioLineForSpeech("narrator", text);
      assert.match(line.id, /^five-little-ducks-v2-guide-/);
      assert.equal(line.text, text);
      assert.match(line.ttsText, /^\[warm, rhythmic nursery-rhyme delivery\]/);
      guideLines.set(text, line.id);
    }
    assert.equal(guideLines.size, 15);
  });

  it("pins the complete non-empty decodable Old MacDonald guide inventory", () => {
    const audioDirectory = new URL("../public/assets/audio/", import.meta.url);
    const guideLines = new Map();
    for (const { text } of OLD_MACDONALD_DUB.lines) {
      const line = getStaticAudioLineForSpeech("narrator", text);
      assert.match(line.id, /^old-macdonald-v1-guide-/);
      assert.equal(line.text, text);
      assert.match(line.ttsText, /^\[warm, rhythmic nursery-rhyme delivery\]/);
      guideLines.set(text, line.id);
    }
    assert.equal(OLD_MACDONALD_DUB.lines.length, 35);
    assert.equal(guideLines.size, 26);
    assert.deepEqual(
      [...guideLines.values()].map((id) => `${id}.mp3`).sort(),
      OLD_MACDONALD_GUIDE_FILES,
    );
    const files = readdirSync(audioDirectory)
      .filter((filename) => filename.startsWith("old-macdonald-v1-guide-") && filename.endsWith(".mp3"))
      .sort();
    assert.deepEqual(files, OLD_MACDONALD_GUIDE_FILES);
    for (const filename of files) {
      const file = new URL(filename, audioDirectory);
      assert.equal(existsSync(file), true);
      assert.ok(statSync(file).size > 0, `${filename} is empty`);
      assert.notEqual(
        execFileSync("ffprobe", [
          "-v", "error",
          "-show_entries", "format=duration",
          "-of", "default=noprint_wrappers=1:nokey=1",
          file.pathname,
        ], { encoding: "utf8" }).trim(),
        "",
        `${basename(file.pathname)} is not decodable`,
      );
    }
  });

  it("covers every scripted non-user line", () => {
    const scriptedLines = lessons.flatMap((lesson) =>
      lesson.scenes.flatMap((scene) =>
        scene.steps.flatMap((step) => {
          const lines =
            step.speaker === "user" ? [] : [[step.speaker, step.dialogue]];
          return lines;
        })
      )
    );

    for (const [speaker, text] of scriptedLines) {
      const line = getStaticAudioLineForSpeech(speaker, text);
      assert.ok(line, `${speaker}: ${text}`);
      assert.equal(line.text, text);
    }
  });

  it("resolves every story page to saved narration and optional join-in audio", () => {
    for (const story of STORIES) {
      for (const page of story.pages) {
        const narration = getStaticAudioLineForSpeech(
          "narrator",
          page.text,
        );
        assert.equal(narration.id, page.narrationAudioId);
        assert.equal(
          narration.src,
          `/assets/audio/${page.narrationAudioId}.mp3`,
        );
        if (!page.joinInAudioId) continue;
        const joinIn = getStaticAudioLineForSpeech("narrator", page.joinIn);
        assert.equal(joinIn.id, page.joinInAudioId);
        assert.equal(
          joinIn.src,
          `/assets/audio/${page.joinInAudioId}.mp3`,
        );
      }
    }
  });

  it("serves every long-story page from the standard saved-audio directory", () => {
    const longStories = STORIES.filter(
      ({ level }) => level === "long-stories",
    );
    const pages = longStories.flatMap(({ pages: storyPages }) => storyPages);

    assert.equal(longStories.length, 2);
    assert.deepEqual(
      longStories.map(({ pages: storyPages }) => storyPages.length),
      [23, 13],
    );
    assert.equal(pages.length, 36);
    for (const page of pages) {
      const narration = getStaticAudioLineForSpeech("narrator", page.text);
      assert.equal(narration.id, page.narrationAudioId);
      assert.equal(
        narration.src,
        `/assets/audio/${page.narrationAudioId}.mp3`,
      );
      assert.equal(page.joinInAudioId, null);
      assert.equal(
        existsSync(new URL(`../public${narration.src}`, import.meta.url)),
        true,
      );
    }
  });

  it("contains only English speaker metadata", () => {
    const allowedSpeakers = new Set(["peppa", "dolly", "narrator"]);
    for (const [id, line] of Object.entries(staticAudio.STATIC_AUDIO_LINES)) {
      assert.ok(allowedSpeakers.has(line.speaker), `${id} speaker`);
      assert.equal(line.lang, "en-US", `${id} language`);
      assert.doesNotMatch(line.text, /[\u3400-\u9fff]/u, `${id} text`);
      assert.doesNotMatch(line.text, /\bBella\b/i, `${id} fixed learner name`);
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
    for (const [id, text] of Object.entries(learnerProfileAudio)) {
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
      "learner-profile-introduction",
      "learner-profile-age",
      "learner-profile-favourite-cartoons",
      "learner-profile-favourite-animals",
      "learner-profile-favourite-activities",
      "learner-profile-favourite-story-topics",
    ]) {
      assert.equal(staticAudio.STATIC_AUDIO_LINES[legacyId], undefined, legacyId);
    }
  });

  it("pins the selected Peppa profile acknowledgment asset", () => {
    const line = staticAudio.STATIC_AUDIO_LINES["peppa-thank-you"];
    const asset = new URL(
      "../public/assets/audio/peppa-thank-you.mp3",
      import.meta.url,
    );
    const bytes = readFileSync(asset);

    assert.deepEqual(line, {
      speaker: "peppa",
      lang: "en-US",
      src: "/assets/audio/peppa-thank-you.mp3",
      text: "Thank you!",
      style: "character",
    });
    assert.deepEqual(getStaticAudioLineForSpeech("peppa", "Thank you!"), {
      id: "peppa-thank-you",
      ...line,
    });
    assert.equal(bytes.byteLength, 17_598);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      "4b90bc530f89e28e972d0c8ea92faad4728266523dca56a4719c94cf2f3abc8a",
    );
  });
});
