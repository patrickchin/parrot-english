import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";
import { LESSON_STEPS } from "../lib/lesson-data.js";
import { STATIC_AUDIO_LINES } from "../lib/static-audio.js";

describe("static audio assets", () => {
  it("covers every current lesson line", () => {
    for (const step of LESSON_STEPS) {
      assert.ok(STATIC_AUDIO_LINES[`host-${step.id}`], `missing host-${step.id}`);
      assert.ok(
        STATIC_AUDIO_LINES[`parrot-${step.id}`],
        `missing parrot-${step.id}`
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
});
