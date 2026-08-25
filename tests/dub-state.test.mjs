import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as dubScript from "../src/dubbing/dub-script.ts";
import {
  DUB_ID,
  DUB_RECORDING_MS,
  DUB_ROUTE,
  DUB_DURATION_MS,
  DUB_LINES,
  getDubLineAtElapsed,
} from "../src/dubbing/dub-script.ts";
import {
  createInitialDubEditorState,
  firstMissingDubLineIndex,
  getDubSceneStatus,
  reduceDubEditorState,
} from "../src/dubbing/dub-state.ts";

describe("five little ducks dub domain", () => {
  it("authors the complete traditional rhyme as 24 four-second cues", () => {
    assert.equal(DUB_ID, "five-little-ducks-v2");
    assert.equal(DUB_ROUTE, "/dubs/five-little-ducks");
    assert.equal(DUB_RECORDING_MS, 6_000);
    assert.equal(DUB_LINES.length, 24);
    assert.deepEqual(DUB_LINES.map(({ text }) => text), [
      "Five little ducks went out one day.",
      "Over the hill and far away.",
      "Mother duck said, \u201cQuack, quack, quack, quack.\u201d",
      "But only four little ducks came back.",
      "Four little ducks went out one day.",
      "Over the hill and far away.",
      "Mother duck said, \u201cQuack, quack, quack, quack.\u201d",
      "But only three little ducks came back.",
      "Three little ducks went out one day.",
      "Over the hill and far away.",
      "Mother duck said, \u201cQuack, quack, quack, quack.\u201d",
      "But only two little ducks came back.",
      "Two little ducks went out one day.",
      "Over the hill and far away.",
      "Mother duck said, \u201cQuack, quack, quack, quack.\u201d",
      "But only one little duck came back.",
      "One little duck went out one day.",
      "Over the hill and far away.",
      "Mother duck said, \u201cQuack, quack, quack, quack.\u201d",
      "But none of the five little ducks came back.",
      "Sad mother duck went out one day.",
      "Over the hill and far away.",
      "Sad mother duck said, \u201cQuack, quack, quack, quack.\u201d",
      "And all of the five little ducks came back.",
    ]);
    assert.deepEqual(DUB_LINES.map(({ cueMs }) => cueMs),
      [800, 4800, 8800, 12800, 16800, 20800, 24800, 28800, 32800, 36800, 40800, 44800, 48800, 52800, 56800, 60800, 64800, 68800, 72800, 76800, 80800, 84800, 88800, 92800]);
    assert.equal(DUB_DURATION_MS, 98_000);
    assert.deepEqual(DUB_LINES.map(({ duckCount }) => duckCount),
      [5, 5, 0, 4, 4, 4, 0, 3, 3, 3, 0, 2, 2, 2, 0, 1, 1, 1, 0, 0, 0, 0, 0, 5]);
    assert.ok(DUB_LINES.every(({ duckCount }) => Number.isInteger(duckCount) && duckCount >= 0 && duckCount <= 5));
    assert.equal(DUB_LINES[23].duckCount, 5);
    assert.deepEqual(DUB_LINES.map(({ visualBeat }) => visualBeat),
      ["depart", "hill", "mother-calls", "return", "depart", "hill", "mother-calls", "return", "depart", "hill", "mother-calls", "return", "depart", "hill", "mother-calls", "return", "depart", "hill", "mother-calls", "none-return", "sad-mother-depart", "sad-mother-hill", "sad-mother-calls", "five-return"]);
    assert.equal(getDubLineAtElapsed(92_900)?.id, "line-24");
  });

  it("keeps the authored script immutable", () => {
    const originalText = DUB_LINES[0].text;
    const originalCue = DUB_LINES[0].cueMs;
    assert.throws(() => { DUB_LINES[0].text = "changed"; }, TypeError);
    assert.throws(() => { DUB_LINES[0].cueMs = 0; }, TypeError);
    assert.throws(() => { DUB_LINES.push(DUB_LINES[0]); }, TypeError);
    assert.equal(DUB_LINES[0].text, originalText);
    assert.equal(DUB_LINES[0].cueMs, originalCue);
    assert.equal(DUB_LINES.length, 24);
  });

  it("groups the rhyme into six natural four-line verses", () => {
    assert.equal(dubScript.DUB_LINES_PER_VERSE, 4);
    assert.deepEqual(
      dubScript.DUB_VERSES.map((verse) => verse.map(({ id }) => id)),
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

  it("holds the fourth verse line through a long recorded tail", () => {
    assert.equal(dubScript.getDubVerseLineAtElapsed(1, 0).id, "line-5");
    assert.equal(dubScript.getDubVerseLineAtElapsed(1, 11_999).id, "line-7");
    assert.equal(dubScript.getDubVerseLineAtElapsed(1, 12_000).id, "line-8");
    assert.equal(dubScript.getDubVerseLineAtElapsed(1, 17_999).id, "line-8");
  });

  it("resumes at the first missing line and opens exact scene selections", () => {
    assert.equal(firstMissingDubLineIndex(new Set(["line-1", "line-2"])), 2);
    let state = reduceDubEditorState(createInitialDubEditorState(), {
      type: "LOADED",
      savedLineIds: DUB_LINES.slice(0, 5).map(({ id }) => id),
    });
    state = reduceDubEditorState(state, { type: "CONFIRMED" });
    assert.equal(state.view, "project");
    state = reduceDubEditorState(state, { type: "CONTINUE" });
    assert.deepEqual(
      [state.view, state.selectedSceneIndex, state.selectedLineIndex],
      ["scene", 1, 5],
    );
    state = reduceDubEditorState(state, { type: "OPEN_SCENE", sceneIndex: 4 });
    assert.deepEqual([state.selectedSceneIndex, state.selectedLineIndex], [4, 16]);
    state = reduceDubEditorState(state, { type: "SELECT_LINE", lineId: "line-20" });
    assert.equal(state.selectedLineIndex, 19);
  });

  it("reports every scene status from saved and retake state", () => {
    assert.deepEqual(
      getDubSceneStatus({ needsRetake: {}, saved: {} }, 0),
      { kind: "not-started", recorded: 0 },
    );
    assert.deepEqual(
      getDubSceneStatus(
        {
          needsRetake: {},
          saved: { "line-1": "2026-08-25T10:00:00.000Z" },
        },
        0,
      ),
      { kind: "in-progress", recorded: 1 },
    );
    assert.deepEqual(
      getDubSceneStatus(
        {
          needsRetake: {},
          saved: Object.fromEntries(
            DUB_LINES.slice(0, 4).map(({ id }) => [id, "2026-08-25T10:00:00.000Z"]),
          ),
        },
        0,
      ),
      { kind: "done", recorded: 4 },
    );
    assert.deepEqual(
      getDubSceneStatus(
        {
          needsRetake: { "line-4": true },
          saved: {
            "line-1": "2026-08-25T10:00:00.000Z",
            "line-2": "2026-08-25T10:00:00.000Z",
            "line-3": "2026-08-25T10:00:00.000Z",
            "line-4": "2026-08-25T10:00:00.000Z",
          },
        },
        0,
      ),
      { kind: "needs-retake", recorded: 4 },
    );
  });

  it("keeps the same line selected after save and clears needs-retake replacements", () => {
    let state = reduceDubEditorState(createInitialDubEditorState(), {
      type: "LOADED",
      savedLineIds: DUB_LINES.slice(0, 20).map(({ id }) => id),
    });
    state = reduceDubEditorState(state, { type: "CONFIRMED" });
    state = reduceDubEditorState(state, { type: "OPEN_SCENE", sceneIndex: 4 });
    state = reduceDubEditorState(state, { type: "SELECT_LINE", lineId: "line-20" });
    state = reduceDubEditorState(state, { type: "MARK_NEEDS_RETAKE", lineId: "line-20" });
    state = reduceDubEditorState(state, {
      type: "OPERATION_STARTED",
      operation: "saving",
    });
    state = reduceDubEditorState(state, {
      type: "SAVE_SUCCEEDED",
      lineId: "line-20",
      recordedAt: "2026-08-25T10:00:00.000Z",
    });
    assert.deepEqual(
      [state.view, state.selectedSceneIndex, state.selectedLineIndex],
      ["scene", 4, 19],
    );
    assert.equal(state.saved["line-20"], "2026-08-25T10:00:00.000Z");
    assert.equal(state.needsRetake["line-20"], undefined);
    assert.equal(state.operation, "idle");
    assert.equal(state.saveRecovery, null);
  });

  it("allows safe back navigation and blocks scene changes during save or retry recovery", () => {
    let state = reduceDubEditorState(createInitialDubEditorState(), {
      type: "LOADED",
      savedLineIds: DUB_LINES.slice(0, 8).map(({ id }) => id),
    });
    state = reduceDubEditorState(state, { type: "CONFIRMED" });
    state = reduceDubEditorState(state, { type: "CONTINUE" });
    state = reduceDubEditorState(state, { type: "BACK_TO_PROJECT" });
    assert.equal(state.view, "project");

    state = reduceDubEditorState(state, { type: "OPEN_SCENE", sceneIndex: 2 });
    state = reduceDubEditorState(state, {
      type: "OPERATION_STARTED",
      operation: "saving",
    });
    const savingState = state;
    assert.equal(
      reduceDubEditorState(state, { type: "SELECT_LINE", lineId: "line-12" }),
      savingState,
    );
    assert.equal(
      reduceDubEditorState(state, { type: "OPEN_SCENE", sceneIndex: 4 }),
      savingState,
    );
    assert.equal(
      reduceDubEditorState(state, { type: "BACK_TO_PROJECT" }),
      savingState,
    );

    state = reduceDubEditorState(state, {
      type: "SAVE_FAILED",
      message: "Try again.",
      recovery: "save",
    });
    const retryState = state;
    assert.equal(state.error, "Try again.");
    assert.equal(state.saveRecovery, "save");
    assert.equal(state.operation, "idle");
    assert.equal(
      reduceDubEditorState(state, { type: "SELECT_LINE", lineId: "line-12" }),
      retryState,
    );
    assert.equal(
      reduceDubEditorState(state, { type: "OPEN_SCENE", sceneIndex: 4 }),
      retryState,
    );
    assert.equal(
      reduceDubEditorState(state, { type: "BACK_TO_PROJECT" }),
      retryState,
    );

    state = reduceDubEditorState(state, {
      type: "CLEAR_NEEDS_RETAKE",
      lineId: "line-12",
    });
    state = reduceDubEditorState(state, { type: "OPERATION_FINISHED" });
    state = reduceDubEditorState(state, { type: "SET_ERROR", message: "Cleared." });
    assert.equal(state.operation, "idle");
    assert.equal(state.error, "Cleared.");
  });

  it("blocks scene navigation while deletion is active", () => {
    let state = reduceDubEditorState(createInitialDubEditorState(), {
      type: "LOADED",
      savedLineIds: DUB_LINES.slice(0, 8).map(({ id }) => id),
    });
    state = reduceDubEditorState(state, { type: "CONFIRMED" });
    state = reduceDubEditorState(state, { type: "OPEN_SCENE", sceneIndex: 2 });
    state = reduceDubEditorState(state, { type: "SELECT_LINE", lineId: "line-12" });
    state = reduceDubEditorState(state, {
      type: "OPERATION_STARTED",
      operation: "deleting",
    });
    const deletingState = state;
    assert.equal(
      reduceDubEditorState(state, { type: "OPEN_SCENE", sceneIndex: 4 }),
      deletingState,
    );
    assert.equal(
      reduceDubEditorState(state, { type: "SELECT_LINE", lineId: "line-9" }),
      deletingState,
    );
    assert.equal(
      reduceDubEditorState(state, { type: "BACK_TO_PROJECT" }),
      deletingState,
    );
  });

  it("ignores open-scene requests before confirmation", () => {
    const loading = createInitialDubEditorState();
    assert.equal(
      reduceDubEditorState(loading, { type: "OPEN_SCENE", sceneIndex: 1 }),
      loading,
    );

    const intro = reduceDubEditorState(createInitialDubEditorState(), {
      type: "LOADED",
      savedLineIds: DUB_LINES.slice(0, 4).map(({ id }) => id),
    });
    assert.equal(intro.view, "intro");
    assert.equal(
      reduceDubEditorState(intro, { type: "OPEN_SCENE", sceneIndex: 1 }),
      intro,
    );
  });

  it("resets the editor back to intro", () => {
    let state = reduceDubEditorState(createInitialDubEditorState(), {
      type: "LOADED",
      savedLineIds: DUB_LINES.map(({ id }) => id),
    });
    state = reduceDubEditorState(state, { type: "CONFIRMED" });
    state = reduceDubEditorState(state, { type: "CONTINUE" });
    state = reduceDubEditorState(state, {
      type: "OPERATION_STARTED",
      operation: "playback",
      playbackScope: "scene",
    });
    state = reduceDubEditorState(state, { type: "MARK_NEEDS_RETAKE", lineId: "line-1" });
    state = reduceDubEditorState(state, { type: "SET_ERROR", message: "Something happened." });
    state = reduceDubEditorState(state, { type: "RESET_SUCCEEDED" });
    assert.deepEqual(state, {
      error: "",
      needsRetake: {},
      operation: "idle",
      playbackScope: null,
      saveRecovery: null,
      saved: {},
      selectedLineIndex: 0,
      selectedSceneIndex: 0,
      view: "intro",
    });
  });
});
