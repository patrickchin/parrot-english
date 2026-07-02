import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("speaking flow orchestration", () => {
  it("keeps recording cleanup from aborting speech evaluation", () => {
    const recordingEffectStart = app.indexOf(
      "if (state.phase !== LessonPhase.Listening) return;"
    );
    const evaluationEffectStart = app.indexOf(
      "if (state.phase !== LessonPhase.Evaluating"
    );

    assert.notEqual(recordingEffectStart, -1);
    assert.notEqual(
      evaluationEffectStart,
      -1,
      "Expected speech evaluation to run in a separate Evaluating-phase effect"
    );
    assert.ok(evaluationEffectStart > recordingEffectStart);

    const recordingEffect = app.slice(recordingEffectStart, evaluationEffectStart);
    assert.doesNotMatch(recordingEffect, /evaluateSpeech\(/);
  });

  it("keeps the recorded audio blob in lesson state instead of component state", () => {
    assert.doesNotMatch(app, /useState<Blob \| null>/);
    assert.match(app, /dispatch\(\{\s*type:\s*"RECORDING_DONE",\s*audioBlob\s*\}\)/);
    assert.match(app, /state\.pendingAudioBlob/);
  });

  it("routes recording, evaluation, and audio failures through system error state", () => {
    assert.match(app, /type:\s*"SYSTEM_ERROR"/);
    assert.doesNotMatch(app, /type:\s*"EVALUATION_FAILED"/);
  });
});
