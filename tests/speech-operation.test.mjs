import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LessonPhase,
  createInitialLessonState,
  reduceLessonState,
} from "../lib/lesson-state.js";
import { finishSpeechOperation } from "../src/speech-operation.ts";

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

const successfulEvaluation = {
  feedbackText: "Great job!",
  passed: true,
  retryAllowed: false,
  similarity: 1,
  transcript: "new response",
};

async function runStaleOperationRace(
  settleStaleEvaluation,
  { settleRecordingLate = false } = {}
) {
  const recordingA = createDeferred();
  const recordingB = createDeferred();
  const evaluationA = createDeferred();
  const evaluationB = createDeferred();
  const controllerA = new AbortController();
  const controllerB = new AbortController();
  const recordingControllerRef = { current: controllerA };
  const evaluationControllerRef = { current: null };
  const events = [];
  const errors = [];
  let generation = 1;

  function runOperation({
    controller,
    label,
    operationGeneration,
    recording,
    targetText,
  }) {
    return finishSpeechOperation({
      evaluate: ({ targetText: evaluationTarget }) =>
        evaluationTarget === "old response"
          ? evaluationA.promise
          : evaluationB.promise,
      evaluationControllerRef,
      generation: operationGeneration,
      getCurrentGeneration: () => generation,
      onEvaluated: () => events.push(`${label}:evaluated`),
      onFailed: (error) => {
        errors.push(error);
        events.push(`${label}:failed`);
      },
      onReleased: () => events.push(`${label}:released`),
      recordingController: controller,
      recordingControllerRef,
      session: {
        cancel() {},
        stop: () => recording.promise,
      },
      targetText,
    });
  }

  const operationA = runOperation({
    controller: controllerA,
    label: "A",
    operationGeneration: generation,
    recording: recordingA,
    targetText: "old response",
  });
  if (!settleRecordingLate) {
    recordingA.resolve(new Blob(["old audio"], { type: "audio/webm" }));
    await flushMicrotasks();
  }

  generation += 1;
  recordingControllerRef.current?.abort();
  recordingControllerRef.current = null;
  evaluationControllerRef.current?.abort();
  evaluationControllerRef.current = null;

  generation += 1;
  recordingControllerRef.current = controllerB;
  const operationB = runOperation({
    controller: controllerB,
    label: "B",
    operationGeneration: generation,
    recording: recordingB,
    targetText: "new response",
  });
  recordingB.resolve(new Blob(["new audio"], { type: "audio/webm" }));
  await flushMicrotasks();
  const evaluationControllerB = evaluationControllerRef.current;
  assert.ok(evaluationControllerB);

  if (settleRecordingLate) {
    recordingA.resolve(new Blob(["old audio"], { type: "audio/webm" }));
    await flushMicrotasks();
  }
  settleStaleEvaluation(evaluationA);
  await operationA;

  assert.deepEqual(events, ["A:released", "B:released"]);
  assert.deepEqual(errors, []);
  assert.strictEqual(recordingControllerRef.current, controllerB);
  assert.strictEqual(evaluationControllerRef.current, evaluationControllerB);

  evaluationB.resolve(successfulEvaluation);
  await operationB;

  assert.deepEqual(events, ["A:released", "B:released", "B:evaluated"]);
  assert.equal(recordingControllerRef.current, null);
  assert.equal(evaluationControllerRef.current, null);
}

describe("speech operation isolation", () => {
  it("recovers an active evaluation AbortError through lesson failure feedback", async () => {
    const lesson = {
      childName: "Bella",
      scenes: [
        {
          title: "Practice",
          steps: [{ speaker: "user", dialogue: "Here you are!" }],
        },
      ],
    };
    const events = [];
    let state = {
      ...createInitialLessonState(),
      phase: LessonPhase.Recording,
    };
    const dispatch = (event) => {
      events.push(event);
      state = reduceLessonState(state, event, lesson);
    };
    const recordingController = new AbortController();
    const recordingControllerRef = { current: recordingController };
    const evaluationControllerRef = { current: null };
    const timeoutError = new Error("Speech evaluation timed out.");
    timeoutError.name = "AbortError";

    await finishSpeechOperation({
      evaluate: () => Promise.reject(timeoutError),
      evaluationControllerRef,
      generation: 1,
      getCurrentGeneration: () => 1,
      onEvaluated: (result) =>
        dispatch({
          type: "EVALUATED",
          passed: result.passed,
          transcript: result.transcript,
        }),
      onFailed: () => dispatch({ type: "EVALUATION_FAILED" }),
      onReleased: () => dispatch({ type: "MIC_RELEASED" }),
      recordingController,
      recordingControllerRef,
      session: {
        cancel() {},
        stop: () => Promise.resolve(new Blob(["child audio"])),
      },
      targetText: "Here you are!",
    });

    assert.deepEqual(events, [
      { type: "MIC_RELEASED" },
      { type: "EVALUATION_FAILED" },
    ]);
    assert.equal(state.phase, LessonPhase.Feedback);
    assert.equal(state.feedbackOutcome, "retry");
  });

  it("ignores a late recording settlement after a new operation starts", async () => {
    await runStaleOperationRace(
      (evaluation) =>
        evaluation.resolve({
          ...successfulEvaluation,
          transcript: "old response",
        }),
      { settleRecordingLate: true }
    );
  });

  const staleOutcomes = [
    {
      name: "successful evaluation",
      settle: (evaluation) =>
        evaluation.resolve({
          ...successfulEvaluation,
          transcript: "old response",
        }),
    },
    {
      name: "cancelled evaluation",
      settle: (evaluation) => {
        const error = new Error("Old evaluation was cancelled.");
        error.name = "AbortError";
        evaluation.reject(error);
      },
    },
    {
      name: "failed evaluation",
      settle: (evaluation) =>
        evaluation.reject(new Error("Old evaluation failed.")),
    },
  ];

  for (const { name, settle } of staleOutcomes) {
    it(`ignores a stale ${name} after a new operation starts`, async () => {
      await runStaleOperationRace(settle);
    });
  }
});
