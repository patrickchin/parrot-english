import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename } from "node:path";
import { describe, it } from "node:test";
import snapshot from "./fixtures/nursery-rhyme-runtime-snapshot.json" with { type: "json" };
import * as staticAudio from "../lib/static-audio.js";
import { DUB_LINES } from "../src/dubbing/dub-script.ts";
import {
  DUB_DEFINITIONS,
  OLD_MACDONALD_DUB,
} from "../src/dubbing/rhyme-catalog.ts";
import { STORIES } from "../src/stories/story-catalog.ts";
import { GENERATED_WORD_GAME_CATALOG } from "../src/games/generated-word-game-catalog.ts";


const WORD_GAME_ITEM_AUDIO = new Map(
  GENERATED_WORD_GAME_CATALOG.flatMap(({ items }) =>
    items.map(({ audio }) => [audio.id, [audio.id, audio.text]])),
);
const WORD_GAME_EXPECTED_AUDIO = [
  ...WORD_GAME_ITEM_AUDIO.values(),
  ["word-game-correct", "Correct."],
  ["word-game-retry", "Listen and try again."],
  ["word-game-complete", "Great listening! You finished the game."],
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
  it("publishes the catalog's explicit unique guide records from their package URLs", () => {
    const catalogGuides = DUB_DEFINITIONS.flatMap(({ guides }) => guides ?? []);
    assert.equal(catalogGuides.length, 59);
    for (const guide of catalogGuides) {
      const published = staticAudio.getStaticAudioLineById(guide.id);
      assert.equal(published.src, guide.src, guide.id);
      assert.equal(published.text, guide.text, guide.id);
      assert.match(published.src, /^\/assets\/nursery-rhymes\/[^/]+\/guides\/.+\.mp3$/);
    }
  });

  it("preserves every deployed nursery-rhyme guide recording", () => {
    const guides = Object.entries(staticAudio.STATIC_AUDIO_LINES)
      .filter(([id]) => /-guide-line-\d+$/.test(id))
      .map(([id, { src, text }]) => ({
        id,
        text,
        sha256: createHash("sha256")
          .update(readFileSync(new URL(`../public${src}`, import.meta.url)))
          .digest("hex"),
      }));
    assert.deepEqual(guides, snapshot.guides);
  });

  it("keeps all 59 protected guide IDs out of the legacy audio root", () => {
    const guideIds = snapshot.guides.map(({ id }) => id);
    assert.equal(guideIds.length, 59);
    assert.equal(new Set(guideIds).size, 59);
    for (const id of guideIds) {
      assert.equal(
        existsSync(new URL(`../public/assets/audio/${id}.mp3`, import.meta.url)),
        false,
        id,
      );
    }
  });

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
    assert.equal(WORD_GAME_ITEM_AUDIO.size, 106);
    assert.equal(entries.length, 109);
    assert.equal(new Set(entries.map(([id]) => id)).size, 109);
    assert.deepEqual(entries.map(([id, { src, text }]) => [id, src, text]), WORD_GAME_EXPECTED_AUDIO.map(([id, text]) => [id, `/assets/audio/${id}.mp3`, text]));
    for (const [id] of WORD_GAME_EXPECTED_AUDIO) {
      const line = staticAudio.getStaticAudioLineById(id);
      assert.equal(line.id, id);
      assert.equal(line.speaker, "narrator");
      assert.equal(line.lang, "en-US");
      assert.match(line.ttsText, /^\[[^\]]+\] /);
    }
    assert.ok(entries.every(([, line]) => line.voiceStyle === "energetic-character"));
    assert.match(staticAudio.getStaticAudioLineById("word-game-animals-cat-label").ttsText, /bright.*playful.*teaching.*young child/i);
    assert.match(staticAudio.getStaticAudioLineById("word-game-correct").ttsText, /nonverbal.*ding/i);
    assert.match(staticAudio.getStaticAudioLineById("word-game-retry").ttsText, /gentle.*upbeat.*encouragement.*young child/i);
    assert.match(staticAudio.getStaticAudioLineById("word-game-complete").ttsText, /happy.*excited.*not-loud.*celebration.*young child/i);
    assert.equal(
      staticAudio.getStaticAudioLineById("narrator-feedback-success").text,
      "Great job!",
    );
  });

  it("rejects duplicate IDs before static and word-game manifests merge", () => {
    assert.throws(
      () => staticAudio.mergeStaticAudioLineGroups(
        { "word-game-animals-cat-label": { text: "old" } },
        { "word-game-animals-cat-label": { text: "new" } },
      ),
      /Duplicate static audio ID: word-game-animals-cat-label/,
    );
  });

  it("keeps exactly the complete decodable word-game file inventory", () => {
    const audioDirectory = new URL("../public/assets/audio/", import.meta.url);
    const files = readdirSync(audioDirectory).filter((filename) => filename.startsWith("word-game-") && filename.endsWith(".mp3")).sort();
    const expectedFiles = WORD_GAME_EXPECTED_AUDIO
      .map(([id]) => `${id}.mp3`)
      .sort();
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
    const files = OLD_MACDONALD_DUB.guides
      .map(({ src }) => basename(src))
      .sort();
    assert.deepEqual(files, OLD_MACDONALD_GUIDE_FILES);
    for (const { id, src } of OLD_MACDONALD_DUB.guides) {
      assert.match(src, /^\/assets\/nursery-rhymes\/old-macdonald\/guides\/.+\.mp3$/);
      const file = new URL(`../public${src}`, import.meta.url);
      assert.equal(existsSync(file), true);
      assert.ok(statSync(file).size > 0, `${id}.mp3 is empty`);
      assert.notEqual(
        execFileSync("ffprobe", [
          "-v", "error",
          "-show_entries", "format=duration",
          "-of", "default=noprint_wrappers=1:nokey=1",
          file.pathname,
        ], { encoding: "utf8" }).trim(),
        "",
        `${id}.mp3 is not decodable`,
      );
    }
  });

  it("keeps every packaged nursery-rhyme guide non-empty and decodable", () => {
    const guides = DUB_DEFINITIONS.flatMap(({ guides }) => guides);
    assert.equal(guides.length, 59);
    for (const { id, src } of guides) {
      const file = new URL(`../public${src}`, import.meta.url);
      assert.ok(statSync(file).size > 0, `${id}.mp3 is empty`);
      const durationSeconds = Number(execFileSync("ffprobe", [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        file.pathname,
      ], { encoding: "utf8" }).trim());
      assert.ok(Number.isFinite(durationSeconds) && durationSeconds > 0, `${id}.mp3 is not decodable`);
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
      assert.match(
        line.src,
        /^\/assets\/(?:audio|nursery-rhymes\/[^/]+\/guides)\/[^/]+\.mp3$/,
        `${id} source`,
      );
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
