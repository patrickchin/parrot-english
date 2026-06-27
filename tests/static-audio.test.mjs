import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";
import { LESSON_STEPS } from "../lib/lesson-data.js";
import { STATIC_AUDIO_LINES } from "../lib/static-audio.js";

describe("static audio assets", () => {
  it("covers every current lesson line", () => {
    for (const step of LESSON_STEPS) {
      assert.ok(
        STATIC_AUDIO_LINES[`example-${step.id}`],
        `missing example-${step.id}`
      );
      assert.ok(STATIC_AUDIO_LINES[`turn-${step.id}`], `missing turn-${step.id}`);
    }
  });

  it("points every manifest entry at a saved audio file", () => {
    for (const [id, line] of Object.entries(STATIC_AUDIO_LINES)) {
      const filePath = new globalThis.URL(`../public${line.src}`, import.meta.url);
      assert.ok(existsSync(filePath), `${id} missing at ${line.src}`);
    }
  });

  it("names pig example audio after the pig character", () => {
    for (const [id, line] of Object.entries(STATIC_AUDIO_LINES)) {
      assert.ok(!line.src.includes("/host-"), `${id} uses host-prefixed audio`);
      if (id.startsWith("example-")) {
        assert.match(line.src, /\/pig-[a-z-]+\.wav$/);
      }
    }
  });

  it("records the speaker for every static audio line", () => {
    for (const [id, line] of Object.entries(STATIC_AUDIO_LINES)) {
      const expectedSpeaker = id.startsWith("example-") ? "peppa" : "polly";
      assert.equal(line.speaker, expectedSpeaker, `${id} speaker`);
    }
  });

  it("keeps energetic parrot prompts separate from visible Chinese text", () => {
    for (const [id, line] of Object.entries(STATIC_AUDIO_LINES)) {
      assert.ok(!line.text.includes("["), `${id} leaks TTS tags into lesson text`);
      if (line.lang !== "zh-CN") continue;

      assert.equal(line.voiceStyle, "energetic-character", `${id} voice style`);
      assert.match(line.ttsText, /^\[[^\]]+\]/, `${id} missing TTS direction`);
      assert.ok(line.ttsText.includes(line.text), `${id} TTS text omits lesson text`);
    }
  });
});
