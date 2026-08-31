import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename } from "node:path";
import { describe, it } from "node:test";
import * as staticAudio from "../lib/static-audio.js";
import { DUB_LINES } from "../src/dubbing/dub-script.ts";
import {
  DUB_DEFINITIONS,
  OLD_MACDONALD_DUB,
} from "../src/dubbing/rhyme-catalog.ts";
import { STORIES } from "../src/stories/story-catalog.ts";

const WORD_GAME_EXPECTED_AUDIO = [
  ["word-game-animals-cat-prompt", "Cat. Which is the cat?"], ["word-game-animals-cat-label", "This is a cat."], ["word-game-animals-cat-correct", "Yes, this is a cat."],
  ["word-game-animals-dog-prompt", "Dog. Which is the dog?"], ["word-game-animals-dog-label", "This is a dog."], ["word-game-animals-dog-correct", "Yes, this is a dog."],
  ["word-game-animals-bird-prompt", "Bird. Which is the bird?"], ["word-game-animals-bird-label", "This is a bird."], ["word-game-animals-bird-correct", "Yes, this is a bird."],
  ["word-game-animals-fish-prompt", "Fish. Which is the fish?"], ["word-game-animals-fish-label", "This is a fish."], ["word-game-animals-fish-correct", "Yes, this is a fish."],
  ["word-game-animals-duck-prompt", "Duck. Which is the duck?"], ["word-game-animals-duck-label", "This is a duck."], ["word-game-animals-duck-correct", "Yes, this is a duck."],
  ["word-game-animals-frog-prompt", "Frog. Which is the frog?"], ["word-game-animals-frog-label", "This is a frog."], ["word-game-animals-frog-correct", "Yes, this is a frog."],
  ["word-game-colors-red-prompt", "Red. Where is red?"], ["word-game-colors-red-label", "This is red."], ["word-game-colors-red-correct", "Yes, this is red."],
  ["word-game-colors-blue-prompt", "Blue. Where is blue?"], ["word-game-colors-blue-label", "This is blue."], ["word-game-colors-blue-correct", "Yes, this is blue."],
  ["word-game-colors-yellow-prompt", "Yellow. Where is yellow?"], ["word-game-colors-yellow-label", "This is yellow."], ["word-game-colors-yellow-correct", "Yes, this is yellow."],
  ["word-game-colors-green-prompt", "Green. Where is green?"], ["word-game-colors-green-label", "This is green."], ["word-game-colors-green-correct", "Yes, this is green."],
  ["word-game-colors-orange-prompt", "Orange. Where is orange?"], ["word-game-colors-orange-label", "This is orange."], ["word-game-colors-orange-correct", "Yes, this is orange."],
  ["word-game-colors-purple-prompt", "Purple. Where is purple?"], ["word-game-colors-purple-label", "This is purple."], ["word-game-colors-purple-correct", "Yes, this is purple."],
  ["word-game-body-parts-eyes-prompt", "Eyes. Where are the eyes?"], ["word-game-body-parts-eyes-label", "These are the eyes."], ["word-game-body-parts-eyes-correct", "Yes, these are the eyes."],
  ["word-game-body-parts-ears-prompt", "Ears. Where are the ears?"], ["word-game-body-parts-ears-label", "These are the ears."], ["word-game-body-parts-ears-correct", "Yes, these are the ears."],
  ["word-game-body-parts-nose-prompt", "Nose. Which is the nose?"], ["word-game-body-parts-nose-label", "This is a nose."], ["word-game-body-parts-nose-correct", "Yes, this is a nose."],
  ["word-game-body-parts-mouth-prompt", "Mouth. Which is the mouth?"], ["word-game-body-parts-mouth-label", "This is a mouth."], ["word-game-body-parts-mouth-correct", "Yes, this is a mouth."],
  ["word-game-body-parts-hand-prompt", "Hand. Which is the hand?"], ["word-game-body-parts-hand-label", "This is a hand."], ["word-game-body-parts-hand-correct", "Yes, this is a hand."],
  ["word-game-body-parts-foot-prompt", "Foot. Which is the foot?"], ["word-game-body-parts-foot-label", "This is a foot."], ["word-game-body-parts-foot-correct", "Yes, this is a foot."],
  ["word-game-food-apple-prompt", "Apple. Which is the apple?"], ["word-game-food-apple-label", "This is an apple."], ["word-game-food-apple-correct", "Yes, this is an apple."],
  ["word-game-food-banana-prompt", "Banana. Which is the banana?"], ["word-game-food-banana-label", "This is a banana."], ["word-game-food-banana-correct", "Yes, this is a banana."],
  ["word-game-food-carrot-prompt", "Carrot. Which is the carrot?"], ["word-game-food-carrot-label", "This is a carrot."], ["word-game-food-carrot-correct", "Yes, this is a carrot."],
  ["word-game-food-orange-prompt", "Orange. Which is the orange?"], ["word-game-food-orange-label", "This is an orange."], ["word-game-food-orange-correct", "Yes, this is an orange."],
  ["word-game-food-bread-prompt", "Bread. Which is the bread?"], ["word-game-food-bread-label", "This is bread."], ["word-game-food-bread-correct", "Yes, this is bread."],
  ["word-game-food-cheese-prompt", "Cheese. Which is the cheese?"], ["word-game-food-cheese-label", "This is cheese."], ["word-game-food-cheese-correct", "Yes, this is cheese."],
  ["word-game-toys-ball-prompt", "Ball. Which is the ball?"], ["word-game-toys-ball-label", "This is a ball."], ["word-game-toys-ball-correct", "Yes, this is a ball."],
  ["word-game-toys-toy-car-prompt", "Toy car. Which is the toy car?"], ["word-game-toys-toy-car-label", "This is a toy car."], ["word-game-toys-toy-car-correct", "Yes, this is a toy car."],
  ["word-game-toys-doll-prompt", "Doll. Which is the doll?"], ["word-game-toys-doll-label", "This is a doll."], ["word-game-toys-doll-correct", "Yes, this is a doll."],
  ["word-game-toys-kite-prompt", "Kite. Which is the kite?"], ["word-game-toys-kite-label", "This is a kite."], ["word-game-toys-kite-correct", "Yes, this is a kite."],
  ["word-game-toys-blocks-prompt", "Blocks. Where are the blocks?"], ["word-game-toys-blocks-label", "These are blocks."], ["word-game-toys-blocks-correct", "Yes, these are blocks."],
  ["word-game-toys-teddy-bear-prompt", "Teddy bear. Which is the teddy bear?"], ["word-game-toys-teddy-bear-label", "This is a teddy bear."], ["word-game-toys-teddy-bear-correct", "Yes, this is a teddy bear."],
  ["word-game-feelings-happy-prompt", "Happy. Which face is happy?"], ["word-game-feelings-happy-label", "This face is happy."], ["word-game-feelings-happy-correct", "Yes, this face is happy."],
  ["word-game-feelings-sad-prompt", "Sad. Which face is sad?"], ["word-game-feelings-sad-label", "This face is sad."], ["word-game-feelings-sad-correct", "Yes, this face is sad."],
  ["word-game-feelings-angry-prompt", "Angry. Which face is angry?"], ["word-game-feelings-angry-label", "This face is angry."], ["word-game-feelings-angry-correct", "Yes, this face is angry."],
  ["word-game-feelings-sleepy-prompt", "Sleepy. Which face is sleepy?"], ["word-game-feelings-sleepy-label", "This face is sleepy."], ["word-game-feelings-sleepy-correct", "Yes, this face is sleepy."],
  ["word-game-feelings-surprised-prompt", "Surprised. Which face is surprised?"], ["word-game-feelings-surprised-label", "This face is surprised."], ["word-game-feelings-surprised-correct", "Yes, this face is surprised."],
  ["word-game-feelings-silly-prompt", "Silly. Which face is silly?"], ["word-game-feelings-silly-label", "This face is silly."], ["word-game-feelings-silly-correct", "Yes, this face is silly."],
  ["word-game-retry", "Listen and try again."], ["word-game-complete", "Great listening! You finished the game."],
];

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

  it("registers the complete word-game narrator inventory by stable ID", () => {
    const entries = Object.entries(staticAudio.STATIC_AUDIO_LINES).filter(([id]) => id.startsWith("word-game-"));
    assert.equal(entries.length, 110);
    assert.equal(new Set(entries.map(([id]) => id)).size, 110);
    assert.deepEqual(entries.map(([id, { src, text }]) => [id, src, text]), WORD_GAME_EXPECTED_AUDIO.map(([id, text]) => [id, `/assets/audio/${id}.mp3`, text]));
    for (const [id] of WORD_GAME_EXPECTED_AUDIO) {
      const line = staticAudio.getStaticAudioLineById(id);
      assert.equal(line.id, id);
      assert.equal(line.speaker, "narrator");
      assert.equal(line.lang, "en-US");
      assert.match(line.ttsText, /^\[[^\]]+\] /);
    }
    assert.ok(entries.every(([, line]) => line.voiceStyle === "energetic-character"));
    assert.match(staticAudio.getStaticAudioLineById("word-game-animals-cat-prompt").ttsText, /excited.*playful.*young child.*target word.*first.*curiosity/i);
    assert.match(staticAudio.getStaticAudioLineById("word-game-animals-cat-prompt").ttsText, /\] Kat\. Which is the cat\?$/);
    assert.match(staticAudio.getStaticAudioLineById("word-game-animals-cat-label").ttsText, /bright.*playful.*teaching.*young child/i);
    assert.match(staticAudio.getStaticAudioLineById("word-game-animals-cat-correct").ttsText, /joyful.*enthusiastic.*encouragement.*young child/i);
    assert.match(staticAudio.getStaticAudioLineById("word-game-retry").ttsText, /gentle.*upbeat.*encouragement.*young child/i);
    assert.match(staticAudio.getStaticAudioLineById("word-game-complete").ttsText, /happy.*excited.*not-loud.*celebration.*young child/i);
  });

  it("rejects duplicate IDs before static and word-game manifests merge", () => {
    assert.throws(
      () => staticAudio.mergeStaticAudioLineGroups(
        { "word-game-animals-cat-prompt": { text: "old" } },
        { "word-game-animals-cat-prompt": { text: "new" } },
      ),
      /Duplicate static audio ID: word-game-animals-cat-prompt/,
    );
  });

  it("keeps exactly the complete decodable word-game file inventory", () => {
    const audioDirectory = new URL("../public/assets/audio/", import.meta.url);
    const expectedFiles = WORD_GAME_EXPECTED_AUDIO.map(([id]) => `${id}.mp3`).sort();
    const files = readdirSync(audioDirectory).filter((filename) => filename.startsWith("word-game-") && filename.endsWith(".mp3")).sort();
    assert.deepEqual(files, expectedFiles);
    for (const filename of files) {
      const file = new URL(filename, audioDirectory);
      assert.ok(statSync(file).size > 0, `${filename} is empty`);
      const codec = execFileSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name", "-of", "default=noprint_wrappers=1:nokey=1", file.pathname], { encoding: "utf8" }).trim();
      assert.equal(codec, "mp3", `${filename} codec`);
      const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file.pathname], { encoding: "utf8" }).trim());
      assert.ok(Number.isFinite(duration) && duration >= 0.25 && duration <= 15, `${filename} has an implausible duration: ${duration}`);
      execFileSync("ffmpeg", ["-v", "error", "-xerror", "-i", file.pathname, "-f", "null", "-"], { encoding: "utf8" });
    }
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

  it("registers one stable ElevenLabs narrator guide for every catalog lyric", () => {
    const expectedUniqueCounts = new Map([
      ["five-little-ducks-v2", 15],
      ["old-macdonald-v1", 26],
      ["twinkle-twinkle-v1", 4],
      ["row-row-row-your-boat-v1", 4],
      ["mary-had-a-little-lamb-v1", 6],
      ["humpty-dumpty-v1", 4],
    ]);

    for (const definition of DUB_DEFINITIONS) {
      const guideAudioPrefix = `${definition.id}-guide-`;
      const guides = new Map();
      definition.lines.forEach(({ text }, index) => {
        const line = getStaticAudioLineForSpeech("narrator", text);
        assert.ok(line.id.startsWith(guideAudioPrefix));
        assert.equal(line.text, text);
        assert.match(line.ttsText, /^\[warm, rhythmic nursery-rhyme delivery\]/);
        if (!guides.has(text)) {
          assert.equal(line.id, `${guideAudioPrefix}line-${index + 1}`);
          guides.set(text, line.id);
        } else {
          assert.equal(line.id, guides.get(text));
        }
      });
      assert.equal(guides.size, expectedUniqueCounts.get(definition.id));
    }
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

  it("keeps every new saved guide inside its authored musical window", () => {
    for (const definition of DUB_DEFINITIONS.slice(2)) {
      const seen = new Set();
      definition.lines.forEach(({ cueMs, text }, index) => {
        if (seen.has(text)) return;
        seen.add(text);
        const line = getStaticAudioLineForSpeech("narrator", text);
        const durationMs = Number(execFileSync("ffprobe", [
          "-v", "error",
          "-show_entries", "format=duration",
          "-of", "default=noprint_wrappers=1:nokey=1",
          new URL(`../public${line.src}`, import.meta.url).pathname,
        ], { encoding: "utf8" }).trim()) * 1_000;
        const windowMs = definition.lines[index + 1]?.cueMs - cueMs
          || definition.finalCueTailMs;
        assert.ok(
          durationMs <= windowMs,
          `${line.id} is ${durationMs}ms for a ${windowMs}ms window`,
        );
      });
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

  it("throws a clear error for an unknown static-audio ID", () => {
    assert.throws(() => staticAudio.getStaticAudioLineById("word-game-missing"), /Missing saved audio ID: word-game-missing/);
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
