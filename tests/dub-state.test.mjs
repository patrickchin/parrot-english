import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DUB_ID,
  DUB_RECORDING_MS,
  DUB_ROUTE,
  DUB_DURATION_MS,
  DUB_LINES,
  getDubLineAtElapsed,
} from "../src/dubbing/dub-script.ts";
import {
  createInitialDubState,
  firstMissingDubLineIndex,
  reduceDubState,
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

  it("resumes at the first missing line and unlocks the final replay", () => {
    assert.equal(firstMissingDubLineIndex(new Set(["line-1", "line-2"])), 2);
    let state = reduceDubState(createInitialDubState(), {
      type: "LOADED",
      savedLineIds: DUB_LINES.map(({ id }) => id),
    });
    assert.equal(state.currentLineIndex, 0);
    state = reduceDubState(state, { type: "CONFIRMED" });
    assert.equal(state.phase, "final-ready");
  });

  it("selects only canonical saved lines without leaving final-ready", () => {
    const saved = Object.fromEntries(
      DUB_LINES.map(({ id }) => [id, "2026-08-25T10:00:00.000Z"]),
    );
    const state = {
      ...createInitialDubState(),
      error: "Old playback error",
      phase: "final-ready",
      saved,
    };

    const selected = reduceDubState(state, {
      type: "SELECT_LINE",
      lineId: "line-5",
    });
    assert.equal(selected.currentLineIndex, 4);
    assert.equal(selected.error, "");
    assert.equal(selected.phase, "final-ready");
    assert.equal(selected.saved, saved);

    assert.equal(
      reduceDubState(state, { type: "SELECT_LINE", lineId: "line-99" }),
      state,
    );
    const unsaved = { ...state, saved: { "line-1": saved["line-1"] } };
    assert.equal(
      reduceDubState(unsaved, { type: "SELECT_LINE", lineId: "line-5" }),
      unsaved,
    );

    const inherited = {
      ...state,
      saved: Object.create({ "line-5": saved["line-5"] }),
    };
    assert.equal(
      reduceDubState(inherited, { type: "SELECT_LINE", lineId: "line-5" }),
      inherited,
    );
  });

  it("keeps a failed upload reviewable and advances after a saved take", () => {
    let state = reduceDubState(createInitialDubState(), {
      type: "LOADED",
      savedLineIds: [],
    });
    state = reduceDubState(state, { type: "CONFIRMED" });
    state = reduceDubState(state, { type: "MIC_OPENING" });
    state = reduceDubState(state, { type: "MIC_STARTED" });
    state = reduceDubState(state, { type: "SAVE_STARTED" });
    state = reduceDubState(state, {
      type: "SAVE_FAILED",
      message: "Try again.",
      recovery: "save",
    });
    assert.equal(state.phase, "save-error");
    assert.equal(state.saveRecovery, "save");
    state = reduceDubState(state, {
      type: "SAVE_FAILED",
      message: "Record again.",
      recovery: "record",
    });
    assert.equal(state.saveRecovery, "record");
    state = reduceDubState(state, {
      type: "SAVE_SUCCEEDED",
      lineId: "line-1",
      recordedAt: "2026-08-25T10:00:00.000Z",
    });
    assert.equal(state.phase, "line-review");
    state = reduceDubState(state, { type: "NEXT_LINE" });
    assert.equal(state.currentLineIndex, 1);
  });
});
