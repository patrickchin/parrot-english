import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DUB_DURATION_MS,
  DUB_ID,
  DUB_LINES,
  DUB_LINES_PER_VERSE,
  DUB_ROUTE,
} from "../src/dubbing/dub-script.ts";
import {
  createInitialDubState,
  firstMissingDubLineIndex,
  getFirstActionableDubSceneIndex,
  getDubSceneStatus,
  reduceDubState,
} from "../src/dubbing/dub-state.ts";
import { DUB_DEFINITIONS, OLD_MACDONALD_DUB } from "../src/dubbing/rhyme-catalog.ts";

describe("five little ducks dub domain", () => {
  it("authors the complete traditional rhyme as 24 four-second cues", () => {
    assert.equal(DUB_ID, "five-little-ducks-v2");
    assert.equal(DUB_ROUTE, "/dubs/five-little-ducks");
    assert.equal(DUB_DURATION_MS, 98_000);
    assert.equal(DUB_LINES.length, 24);
    assert.deepEqual(DUB_LINES.map(({ cueMs }) => cueMs), [
      800, 4800, 8800, 12800, 16800, 20800, 24800, 28800,
      32800, 36800, 40800, 44800, 48800, 52800, 56800, 60800,
      64800, 68800, 72800, 76800, 80800, 84800, 88800, 92800,
    ]);
  });

  it("keeps the authored script immutable", () => {
    const originalText = DUB_LINES[0].text;
    assert.throws(() => { DUB_LINES[0].text = "changed"; }, TypeError);
    assert.throws(() => { DUB_LINES.push(DUB_LINES[0]); }, TypeError);
    assert.equal(DUB_LINES[0].text, originalText);
    assert.equal(DUB_LINES.length, 24);
  });

  it("groups the rhyme into six natural four-line scenes", () => {
    assert.equal(DUB_LINES_PER_VERSE, 4);
    assert.deepEqual(
      Array.from(
        { length: DUB_LINES.length / DUB_LINES_PER_VERSE },
        (_, index) => DUB_LINES.slice(
          index * DUB_LINES_PER_VERSE,
          (index + 1) * DUB_LINES_PER_VERSE,
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
    assert.deepEqual(createInitialDubState(), {
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
    const state = reduceDubState(createInitialDubState(), {
      type: "LOADED",
      recordingEnabled: true,
      savedLineIds: ["line-1"],
    });
    assert.equal(state.view, "project");
    assert.equal(Object.hasOwn(state.saved, "line-1"), true);
  });

  it("keeps disabled status in the listen-only view", () => {
    const state = reduceDubState(createInitialDubState(), {
      type: "LOADED",
      recordingEnabled: false,
      savedLineIds: [],
    });
    assert.equal(state.view, "listen-only");
  });

  it("resumes at the first missing line and opens exact scene selections", () => {
    assert.equal(firstMissingDubLineIndex(new Set(["line-1", "line-2"])), 2);
    let state = reduceDubState(createInitialDubState(), {
      type: "LOADED",
      recordingEnabled: true,
      savedLineIds: DUB_LINES.slice(0, 5).map(({ id }) => id),
    });
    assert.equal(state.view, "project");
    state = reduceDubState(state, { type: "OPEN_SCENE", sceneIndex: 1 });
    assert.deepEqual(
      [state.view, state.selectedSceneIndex, state.selectedLineIndex],
      ["scene", 1, 5],
    );
    state = reduceDubState(state, { type: "OPEN_SCENE", sceneIndex: 4 });
    state = reduceDubState(state, { type: "SELECT_LINE", lineId: "line-20" });
    assert.deepEqual([state.selectedSceneIndex, state.selectedLineIndex], [4, 19]);
  });

  it("reports every scene status from saved and retake state", () => {
    assert.deepEqual(
      getDubSceneStatus({ needsRetake: {}, saved: {} }, 0),
      { kind: "not-started", recorded: 0 },
    );
    assert.deepEqual(
      getDubSceneStatus({ needsRetake: {}, saved: { "line-1": "saved" } }, 0),
      { kind: "in-progress", recorded: 1 },
    );
    assert.deepEqual(
      getDubSceneStatus({
        needsRetake: {},
        saved: Object.fromEntries(DUB_LINES.slice(0, 4).map(({ id }) => [id, "saved"])),
      }, 0),
      { kind: "done", recorded: 4 },
    );
    assert.deepEqual(
      getDubSceneStatus({
        needsRetake: { "line-4": true },
        saved: Object.fromEntries(DUB_LINES.slice(0, 4).map(({ id }) => [id, "saved"])),
      }, 0),
      { kind: "needs-retake", recorded: 4 },
    );
  });

  it("finds the first actionable scene and returns null only when all are ready", () => {
    assert.equal(getFirstActionableDubSceneIndex({ saved: {}, needsRetake: {} }), 0);
    assert.equal(getFirstActionableDubSceneIndex({
      saved: Object.fromEntries(DUB_LINES.slice(0, 4).map(({ id }) => [id, "saved"])),
      needsRetake: {},
    }), 1);
    assert.equal(getFirstActionableDubSceneIndex({
      saved: Object.fromEntries(DUB_LINES.map(({ id }) => [id, "saved"])),
      needsRetake: { "line-9": true },
    }), 2);
    assert.equal(getFirstActionableDubSceneIndex({
      saved: Object.fromEntries(DUB_LINES.map(({ id }) => [id, "saved"])),
      needsRetake: {},
    }), null);
  });

  it("opens a retake before an earlier unsaved line in the same scene", () => {
    let state = reduceDubState(createInitialDubState(), {
      type: "LOADED",
      recordingEnabled: true,
      savedLineIds: ["line-1"],
    });
    state = reduceDubState(state, { type: "MARK_NEEDS_RETAKE", lineId: "line-4" });
    state = reduceDubState(state, { type: "OPEN_SCENE", sceneIndex: 0 });
    assert.deepEqual([state.selectedSceneIndex, state.selectedLineIndex], [0, 3]);
  });

  it("uses Old MacDonald's seven-line scene boundaries", () => {
    const saved = Object.fromEntries(
      OLD_MACDONALD_DUB.lines.slice(0, 8).map(({ id }) => [id, "saved"]),
    );
    assert.equal(
      getFirstActionableDubSceneIndex({ saved, needsRetake: {} }, OLD_MACDONALD_DUB),
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
        recordingEnabled: true,
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
        recordingEnabled: true,
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
    let state = reduceDubState(createInitialDubState(), {
      type: "LOADED",
      recordingEnabled: true,
      savedLineIds: DUB_LINES.slice(0, 20).map(({ id }) => id),
    });
    state = reduceDubState(state, { type: "OPEN_SCENE", sceneIndex: 4 });
    state = reduceDubState(state, { type: "SELECT_LINE", lineId: "line-20" });
    state = reduceDubState(state, { type: "MARK_NEEDS_RETAKE", lineId: "line-20" });
    state = reduceDubState(state, { type: "OPERATION_STARTED", operation: "saving" });
    state = reduceDubState(state, {
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
    let state = reduceDubState(createInitialDubState(), {
      type: "LOADED",
      recordingEnabled: true,
      savedLineIds: [],
    });
    state = reduceDubState(state, { type: "OPEN_SCENE", sceneIndex: 0 });
    state = reduceDubState(state, {
      type: "SAVE_FAILED",
      message: "Try again.",
      recovery: "save",
    });
    const retryState = state;
    assert.equal(reduceDubState(state, { type: "SELECT_LINE", lineId: "line-2" }), retryState);
    assert.equal(reduceDubState(state, { type: "BACK_TO_PROJECT" }), retryState);

    state = reduceDubState(state, {
      type: "SAVE_FAILED",
      message: "Record again.",
      recovery: "record",
    });
    state = reduceDubState(state, { type: "SELECT_LINE", lineId: "line-2" });
    assert.equal(state.selectedLineIndex, 1);
  });

  it("preserves retryable save recovery while guide and take audio play", () => {
    let state = reduceDubState(createInitialDubState(), {
      type: "LOADED",
      recordingEnabled: true,
      savedLineIds: [],
    });
    state = reduceDubState(state, { type: "OPEN_SCENE", sceneIndex: 0 });
    state = reduceDubState(state, {
      type: "SAVE_FAILED",
      message: "Try again.",
      recovery: "save",
    });

    state = reduceDubState(state, {
      type: "OPERATION_STARTED",
      operation: "guide-playing",
    });
    assert.equal(state.saveRecovery, "save");
    assert.equal(state.error, "Try again.");
    assert.equal(reduceDubState(state, { type: "BACK_TO_PROJECT" }), state);
    state = reduceDubState(state, { type: "OPERATION_FINISHED" });
    state = reduceDubState(state, {
      type: "OPERATION_STARTED",
      operation: "take-playing",
    });
    assert.equal(state.saveRecovery, "save");
    assert.equal(state.error, "Try again.");
    assert.equal(reduceDubState(state, { type: "SELECT_LINE", lineId: "line-2" }), state);
  });

  it("atomically finishes cancellable playback only after accepted navigation", () => {
    let state = reduceDubState(createInitialDubState(), {
      type: "LOADED",
      recordingEnabled: true,
      savedLineIds: [],
    });
    state = reduceDubState(state, { type: "OPEN_SCENE", sceneIndex: 0 });
    state = reduceDubState(state, {
      type: "OPERATION_STARTED",
      operation: "playback",
      playbackScope: "scene",
    });

    state = reduceDubState(state, { type: "SELECT_LINE", lineId: "line-2" });
    assert.equal(state.selectedLineIndex, 1);
    assert.equal(state.operation, "idle");
    assert.equal(state.playbackScope, null);
  });

  it("blocks navigation during recording operations", () => {
    let state = reduceDubState(createInitialDubState(), {
      type: "LOADED",
      recordingEnabled: true,
      savedLineIds: [],
    });
    state = reduceDubState(state, { type: "OPEN_SCENE", sceneIndex: 0 });
    state = reduceDubState(state, { type: "OPERATION_STARTED", operation: "recording" });
    assert.equal(reduceDubState(state, { type: "SELECT_LINE", lineId: "line-2" }), state);
    assert.equal(reduceDubState(state, { type: "BACK_TO_PROJECT" }), state);
  });

  it("loads recording-disabled status into listen-only and clears private state", () => {
    let state = reduceDubState(createInitialDubState(), {
      type: "LOADED",
      recordingEnabled: true,
      savedLineIds: DUB_LINES.map(({ id }) => id),
    });
    state = reduceDubState(state, { type: "MARK_NEEDS_RETAKE", lineId: "line-1" });
    state = reduceDubState(state, {
      type: "LOADED",
      recordingEnabled: false,
      savedLineIds: [],
    });
    assert.deepEqual(state, { ...createInitialDubState(), view: "listen-only" });
  });
});
