import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createInitialDubState,
  firstMissingDubLineIndex,
  getFirstActionableDubSceneIndex,
  getDubSceneStatus,
  reduceDubState,
} from "../src/dubbing/dub-state.ts";
import {
  DUB_DEFINITIONS,
  FIVE_LITTLE_DUCKS_DUB,
  OLD_MACDONALD_DUB,
} from "../src/dubbing/rhyme-catalog.ts";

const DUCK_LINES = FIVE_LITTLE_DUCKS_DUB.lines;

function createDuckState() {
  return createInitialDubState(FIVE_LITTLE_DUCKS_DUB);
}

function reduceDuckState(state, event) {
  return reduceDubState(state, event, FIVE_LITTLE_DUCKS_DUB);
}

function firstMissingDuckLineIndex(savedLineIds) {
  return firstMissingDubLineIndex(savedLineIds, FIVE_LITTLE_DUCKS_DUB);
}

function getDuckSceneStatus(state, sceneIndex) {
  return getDubSceneStatus(state, sceneIndex, FIVE_LITTLE_DUCKS_DUB);
}

function getFirstActionableDuckSceneIndex(state) {
  return getFirstActionableDubSceneIndex(state, FIVE_LITTLE_DUCKS_DUB);
}

describe("five little ducks dub domain", () => {
  it("authors the complete traditional rhyme as 24 four-second cues", () => {
    assert.equal(FIVE_LITTLE_DUCKS_DUB.id, "five-little-ducks-v2");
    assert.equal(FIVE_LITTLE_DUCKS_DUB.route, "/dubs/five-little-ducks");
    assert.equal(FIVE_LITTLE_DUCKS_DUB.durationMs, 98_000);
    assert.equal(DUCK_LINES.length, 24);
    assert.deepEqual(DUCK_LINES.map(({ cueMs }) => cueMs), [
      800, 4800, 8800, 12800, 16800, 20800, 24800, 28800,
      32800, 36800, 40800, 44800, 48800, 52800, 56800, 60800,
      64800, 68800, 72800, 76800, 80800, 84800, 88800, 92800,
    ]);
  });

  it("keeps the authored script immutable", () => {
    const originalText = DUCK_LINES[0].text;
    assert.throws(() => { DUCK_LINES[0].text = "changed"; }, TypeError);
    assert.throws(() => { DUCK_LINES.push(DUCK_LINES[0]); }, TypeError);
    assert.equal(DUCK_LINES[0].text, originalText);
    assert.equal(DUCK_LINES.length, 24);
  });

  it("groups the rhyme into six natural four-line scenes", () => {
    assert.equal(FIVE_LITTLE_DUCKS_DUB.linesPerScene, 4);
    assert.deepEqual(
      Array.from(
        { length: DUCK_LINES.length / FIVE_LITTLE_DUCKS_DUB.linesPerScene },
        (_, index) => DUCK_LINES.slice(
          index * FIVE_LITTLE_DUCKS_DUB.linesPerScene,
          (index + 1) * FIVE_LITTLE_DUCKS_DUB.linesPerScene,
        ).map(({ id }) => id),
      ),
      [
        ["line-1", "line-2", "line-3", "line-4"],
        ["line-5", "line-6", "line-7", "line-8"],
        ["line-9", "line-10", "line-11", "line-12"],
        ["line-13", "line-14", "line-15", "line-16"],
        ["line-17", "line-18", "line-19", "line-20"],
        ["line-21", "line-22", "line-23", "line-24"],
      ],
    );
  });

  it("exposes the storyboard reducer as the single canonical dub state surface", () => {
    assert.deepEqual(createDuckState(), {
      consentState: null,
      error: "",
      needsRetake: {},
      operation: "idle",
      playbackScope: null,
      saveRecovery: null,
      saved: {},
      selectedLineIndex: 0,
      selectedSceneIndex: 0,
      view: "loading",
    });
  });

  it("loads enabled status directly into the project", () => {
    const state = reduceDuckState(createDuckState(), {
      type: "LOADED",
      consentState: "granted",
      savedLineIds: ["line-1"],
    });
    assert.equal(state.view, "project");
    assert.equal(Object.hasOwn(state.saved, "line-1"), true);
  });

  it("keeps disabled status in the listen-only view", () => {
    const state = reduceDuckState(createDuckState(), {
      type: "LOADED",
      consentState: "not_granted",
      savedLineIds: [],
    });
    assert.equal(state.view, "listen-only");
    assert.equal(state.consentState, "not_granted");
  });

  it("resumes at the first missing line and opens exact scene selections", () => {
    assert.equal(firstMissingDuckLineIndex(new Set(["line-1", "line-2"])), 2);
    let state = reduceDuckState(createDuckState(), {
      type: "LOADED",
      consentState: "granted",
      savedLineIds: DUCK_LINES.slice(0, 5).map(({ id }) => id),
    });
    assert.equal(state.view, "project");
    state = reduceDuckState(state, { type: "OPEN_SCENE", sceneIndex: 1 });
    assert.deepEqual(
      [state.view, state.selectedSceneIndex, state.selectedLineIndex],
      ["scene", 1, 5],
    );
    state = reduceDuckState(state, { type: "OPEN_SCENE", sceneIndex: 4 });
    state = reduceDuckState(state, { type: "SELECT_LINE", lineId: "line-20" });
    assert.deepEqual([state.selectedSceneIndex, state.selectedLineIndex], [4, 19]);
  });

  it("reports every scene status from saved and retake state", () => {
    assert.deepEqual(
      getDuckSceneStatus({ needsRetake: {}, saved: {} }, 0),
      { kind: "not-started", recorded: 0 },
    );
    assert.deepEqual(
      getDuckSceneStatus({ needsRetake: {}, saved: { "line-1": "saved" } }, 0),
      { kind: "in-progress", recorded: 1 },
    );
    assert.deepEqual(
      getDuckSceneStatus({
        needsRetake: {},
        saved: Object.fromEntries(DUCK_LINES.slice(0, 4).map(({ id }) => [id, "saved"])),
      }, 0),
      { kind: "done", recorded: 4 },
    );
    assert.deepEqual(
      getDuckSceneStatus({
        needsRetake: { "line-4": true },
        saved: Object.fromEntries(DUCK_LINES.slice(0, 4).map(({ id }) => [id, "saved"])),
      }, 0),
      { kind: "needs-retake", recorded: 4 },
    );
  });

  it("finds the first actionable scene and returns null only when all are ready", () => {
    assert.equal(getFirstActionableDuckSceneIndex({ saved: {}, needsRetake: {} }), 0);
    assert.equal(getFirstActionableDuckSceneIndex({
      saved: Object.fromEntries(DUCK_LINES.slice(0, 4).map(({ id }) => [id, "saved"])),
      needsRetake: {},
    }), 1);
    assert.equal(getFirstActionableDuckSceneIndex({
      saved: Object.fromEntries(DUCK_LINES.map(({ id }) => [id, "saved"])),
      needsRetake: { "line-9": true },
    }), 2);
    assert.equal(getFirstActionableDuckSceneIndex({
      saved: Object.fromEntries(DUCK_LINES.map(({ id }) => [id, "saved"])),
      needsRetake: {},
    }), null);
  });

  it("opens a retake before an earlier unsaved line in the same scene", () => {
    let state = reduceDuckState(createDuckState(), {
      type: "LOADED",
      consentState: "granted",
      savedLineIds: ["line-1"],
    });
    state = reduceDuckState(state, { type: "MARK_NEEDS_RETAKE", lineId: "line-4" });
    state = reduceDuckState(state, { type: "OPEN_SCENE", sceneIndex: 0 });
    assert.deepEqual([state.selectedSceneIndex, state.selectedLineIndex], [0, 3]);
  });

  it("uses Old MacDonald's seven-line scene boundaries", () => {
    const saved = Object.fromEntries(
      OLD_MACDONALD_DUB.lines.slice(0, 8).map(({ id }) => [id, "saved"]),
    );
    assert.equal(
      getFirstActionableDubSceneIndex(
        { saved, needsRetake: {} },
        OLD_MACDONALD_DUB,
      ),
      1,
    );
  });

  it("finds catalog progress and retakes in every authored scene shape", () => {
    for (const definition of DUB_DEFINITIONS) {
      const firstSceneSaved = Object.fromEntries(
        definition.lines
          .slice(0, definition.linesPerScene)
          .map(({ id }) => [id, "saved"]),
      );
      const expected = definition.lines.length === definition.linesPerScene ? null : 1;
      assert.equal(
        getFirstActionableDubSceneIndex(
          { saved: firstSceneSaved, needsRetake: {} },
          definition,
        ),
        expected,
        definition.id,
      );

      let state = reduceDubState(createInitialDubState(definition), {
        type: "LOADED",
        consentState: "granted",
        savedLineIds: [],
      }, definition);
      state = reduceDubState(state, {
        type: "MARK_NEEDS_RETAKE",
        lineId: definition.lines[1].id,
      }, definition);
      state = reduceDubState(state, { type: "OPEN_SCENE", sceneIndex: 0 }, definition);
      assert.equal(state.selectedLineIndex, 1, `${definition.id}: retake precedence`);
    }
  });

  it("uses the active rhyme's scene size and line count", () => {
    const state = reduceDubState(
      createInitialDubState(OLD_MACDONALD_DUB),
      {
        type: "LOADED",
        consentState: "granted",
        savedLineIds: OLD_MACDONALD_DUB.lines.slice(0, 6).map(({ id }) => id),
      },
      OLD_MACDONALD_DUB,
    );
    assert.equal(state.selectedSceneIndex, 0);
    assert.equal(state.selectedLineIndex, 6);
    assert.deepEqual(
      getDubSceneStatus(
        {
          saved: Object.fromEntries(
            OLD_MACDONALD_DUB.lines.slice(0, 6).map(({ id }) => [id, "saved"]),
          ),
          needsRetake: {},
        },
        0,
        OLD_MACDONALD_DUB,
      ),
      { kind: "in-progress", recorded: 6 },
    );
  });

  it("keeps the same selected line after save and clears its retake marker", () => {
    let state = reduceDuckState(createDuckState(), {
      type: "LOADED",
      consentState: "granted",
      savedLineIds: DUCK_LINES.slice(0, 20).map(({ id }) => id),
    });
    state = reduceDuckState(state, { type: "OPEN_SCENE", sceneIndex: 4 });
    state = reduceDuckState(state, { type: "SELECT_LINE", lineId: "line-20" });
    state = reduceDuckState(state, { type: "MARK_NEEDS_RETAKE", lineId: "line-20" });
    state = reduceDuckState(state, { type: "OPERATION_STARTED", operation: "saving" });
    state = reduceDuckState(state, {
      type: "SAVE_SUCCEEDED",
      lineId: "line-20",
      recordedAt: "2026-08-25T10:00:00.000Z",
    });
    assert.deepEqual(
      [state.view, state.selectedSceneIndex, state.selectedLineIndex],
      ["scene", 4, 19],
    );
    assert.equal(state.needsRetake["line-20"], undefined);
    assert.equal(state.operation, "idle");
    assert.equal(state.saveRecovery, null);
  });

  it("locks navigation only while a retryable Blob awaits save or replacement", () => {
    let state = reduceDuckState(createDuckState(), {
      type: "LOADED",
      consentState: "granted",
      savedLineIds: [],
    });
    state = reduceDuckState(state, { type: "OPEN_SCENE", sceneIndex: 0 });
    state = reduceDuckState(state, {
      type: "SAVE_FAILED",
      message: "Try again.",
      recovery: "save",
    });
    const retryState = state;
    assert.equal(reduceDuckState(state, { type: "SELECT_LINE", lineId: "line-2" }), retryState);
    assert.equal(reduceDuckState(state, { type: "BACK_TO_PROJECT" }), retryState);

    state = reduceDuckState(state, {
      type: "SAVE_FAILED",
      message: "Record again.",
      recovery: "record",
    });
    state = reduceDuckState(state, { type: "SELECT_LINE", lineId: "line-2" });
    assert.equal(state.selectedLineIndex, 1);
    assert.equal(state.saveRecovery, null);
    assert.equal(state.error, "");

    state = reduceDuckState(state, {
      type: "SAVE_FAILED",
      message: "Record again.",
      recovery: "record",
    });
    state = reduceDuckState(state, { type: "BACK_TO_PROJECT" });
    assert.equal(state.view, "project");
    assert.equal(state.saveRecovery, null);
    assert.equal(state.error, "");
  });

  it("preserves retryable save recovery while guide and take audio play", () => {
    let state = reduceDuckState(createDuckState(), {
      type: "LOADED",
      consentState: "granted",
      savedLineIds: [],
    });
    state = reduceDuckState(state, { type: "OPEN_SCENE", sceneIndex: 0 });
    state = reduceDuckState(state, {
      type: "SAVE_FAILED",
      message: "Try again.",
      recovery: "save",
    });

    state = reduceDuckState(state, {
      type: "OPERATION_STARTED",
      operation: "guide-playing",
    });
    assert.equal(state.saveRecovery, "save");
    assert.equal(state.error, "Try again.");
    assert.equal(reduceDuckState(state, { type: "BACK_TO_PROJECT" }), state);
    state = reduceDuckState(state, { type: "OPERATION_FINISHED" });
    state = reduceDuckState(state, {
      type: "OPERATION_STARTED",
      operation: "take-playing",
    });
    assert.equal(state.saveRecovery, "save");
    assert.equal(state.error, "Try again.");
    assert.equal(reduceDuckState(state, { type: "SELECT_LINE", lineId: "line-2" }), state);
  });

  it("clears recovery feedback when a new recording attempt starts", () => {
    let state = reduceDuckState(createDuckState(), {
      type: "LOADED",
      consentState: "granted",
      savedLineIds: ["line-1"],
    });
    state = reduceDuckState(state, { type: "OPEN_SCENE", sceneIndex: 0 });
    state = reduceDuckState(state, {
      type: "SAVE_FAILED",
      message: "Keep this take.",
      recovery: "record",
    });

    for (const operation of ["mic-opening", "counting-in"]) {
      state = reduceDuckState(state, { type: "OPERATION_STARTED", operation });
      assert.equal(state.saveRecovery, null);
      assert.equal(state.error, "");
      assert.equal(reduceDuckState(state, { type: "SELECT_LINE", lineId: "line-2" }), state);
      assert.equal(reduceDuckState(state, { type: "BACK_TO_PROJECT" }), state);
    }

    state = reduceDuckState(state, { type: "OPERATION_STARTED", operation: "recording" });
    assert.equal(state.saveRecovery, null);
    assert.equal(state.error, "");
  });

  it("atomically finishes cancellable playback only after accepted navigation", () => {
    let state = reduceDuckState(createDuckState(), {
      type: "LOADED",
      consentState: "granted",
      savedLineIds: [],
    });
    state = reduceDuckState(state, { type: "OPEN_SCENE", sceneIndex: 0 });
    state = reduceDuckState(state, {
      type: "OPERATION_STARTED",
      operation: "playback",
      playbackScope: "scene",
    });

    state = reduceDuckState(state, { type: "SELECT_LINE", lineId: "line-2" });
    assert.equal(state.selectedLineIndex, 1);
    assert.equal(state.operation, "idle");
    assert.equal(state.playbackScope, null);
  });

  it("blocks navigation during recording operations", () => {
    let state = reduceDuckState(createDuckState(), {
      type: "LOADED",
      consentState: "granted",
      savedLineIds: [],
    });
    state = reduceDuckState(state, { type: "OPEN_SCENE", sceneIndex: 0 });
    for (const operation of ["mic-opening", "counting-in", "recording", "saving"]) {
      state = reduceDuckState(state, { type: "OPERATION_STARTED", operation });
      assert.equal(reduceDuckState(state, { type: "SELECT_LINE", lineId: "line-2" }), state);
      assert.equal(reduceDuckState(state, { type: "BACK_TO_PROJECT" }), state);
    }
  });

  it("loads recording-disabled status into listen-only and clears private state", () => {
    let state = reduceDuckState(createDuckState(), {
      type: "LOADED",
      consentState: "granted",
      savedLineIds: DUCK_LINES.map(({ id }) => id),
    });
    state = reduceDuckState(state, { type: "MARK_NEEDS_RETAKE", lineId: "line-1" });
    state = reduceDuckState(state, {
      type: "LOADED",
      consentState: "not_granted",
      savedLineIds: [],
    });
    assert.deepEqual(state, {
      ...createDuckState(),
      consentState: "not_granted",
      view: "listen-only",
    });
  });
});
