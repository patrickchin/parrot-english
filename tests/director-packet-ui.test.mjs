import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("director packet UI integration", () => {
  it("imports the director packet modules", () => {
    assert.match(appSource, /ai-lesson-data/);
    assert.match(appSource, /mock-lesson-director/);
    assert.match(appSource, /director-packet-state/);
    assert.match(appSource, /director-packet-scene/);
  });

  it("uses childPrompt.targetText for director speech evaluation", () => {
    assert.match(appSource, /activePrompt\?\.targetText/);
  });
});
