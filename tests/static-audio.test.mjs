import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";
import { LESSONS } from "../lib/lesson-data.js";
import { STATIC_AUDIO_LINES } from "../lib/static-audio.js";

describe("static audio assets", () => {
  it("covers every current lesson line", () => {
    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        assert.ok(
          STATIC_AUDIO_LINES[step.audio.example],
          `missing ${lesson.id}:${step.id} example audio ${step.audio.example}`
        );
        assert.ok(
          STATIC_AUDIO_LINES[step.audio.prompt],
          `missing ${lesson.id}:${step.id} prompt audio ${step.audio.prompt}`
        );
        assert.ok(
          STATIC_AUDIO_LINES[step.audio.model],
          `missing ${lesson.id}:${step.id} model audio ${step.audio.model}`
        );
      }
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
        assert.match(line.src, /\/pig-[a-z-]+\.mp3$/);
      }
      if (id.startsWith("model-")) {
        assert.match(line.src, /\/parrot-[a-z-]+\.mp3$/);
      }
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

  it("marks English parrot model lines for parrot voice generation", () => {
    for (const [id, line] of Object.entries(STATIC_AUDIO_LINES)) {
      if (!id.startsWith("model-")) continue;

      assert.equal(line.speaker, "parrot", `${id} speaker`);
    }
  });
});
