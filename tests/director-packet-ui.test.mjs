import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

function extractFunctionSource(name) {
  const start = appSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Expected to find function ${name}`);

  let depth = 0;
  let sawBody = false;
  for (let index = start; index < appSource.length; index += 1) {
    const char = appSource[index];
    if (char === "{") {
      depth += 1;
      sawBody = true;
    }
    if (char === "}") {
      depth -= 1;
      if (sawBody && depth === 0) {
        return appSource.slice(start, index + 1);
      }
    }
  }

  assert.fail(`Could not parse function ${name}`);
}

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

  it("keeps the feature flag as a wrapper around deterministic default flow", () => {
    assert.match(
      appSource,
      /return USE_DIRECTOR_PACKET_FLOW \?\s*\(\s*<DirectorLessonPlayer \/>\s*\)\s*:\s*\(\s*<DeterministicLessonPlayer \/>\s*\)/s
    );
  });

  it("does not evaluate speech inside the director recording step", () => {
    const recordingSource = extractFunctionSource("recordDirectorPrompt");
    const evaluationSource = extractFunctionSource("evaluateDirectorPrompt");

    assert.match(appSource, /state\.phase !== DirectorPacketPhase\.Listening[\s\S]+void recordDirectorPrompt\(\);/);
    assert.match(appSource, /state\.phase !== DirectorPacketPhase\.Evaluating[\s\S]+void evaluateDirectorPrompt\(\);/);
    assert.match(recordingSource, /recordSpeechClip/);
    assert.match(recordingSource, /dispatch\(\{ type: "RECORDING_DONE" \}\)/);
    assert.doesNotMatch(recordingSource, /evaluateSpeech/);
    assert.match(evaluationSource, /evaluateSpeech/);
    assert.match(evaluationSource, /dispatch\(\{ type: "EVALUATED", result \}\)/);
  });

  it("only resets the director lesson on finished start", () => {
    const reducerSource = extractFunctionSource("reduceDirectorLessonPlayerState");

    assert.match(reducerSource, /currentState\.phase === DirectorPacketPhase\.Finished/);
    assert.doesNotMatch(reducerSource, /currentState\.phase === DirectorPacketPhase\.Error/);
  });
});
