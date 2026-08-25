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
  it("authors nine six-second slots inside a 56 second replay", () => {
    assert.equal(DUB_ID, "five-little-ducks-v1");
    assert.equal(DUB_ROUTE, "/dubs/five-little-ducks");
    assert.equal(DUB_RECORDING_MS, 6_000);
    assert.equal(DUB_LINES.length, 9);
    assert.deepEqual(DUB_LINES.map(({ cueMs }) => cueMs),
      [800, 6800, 12800, 18800, 24800, 30800, 36800, 42800, 48800]);
    assert.equal(DUB_DURATION_MS, 56_000);
    assert.deepEqual(DUB_LINES.map(({ duckCount }) => duckCount), [5, 5, 4, 4, 3, 2, 1, 1, 5]);
    assert.deepEqual(DUB_LINES.map(({ visualBeat }) => visualBeat),
      ["five-enter", "hill", "frog", "four-splash", "reeds", "lily-circle", "one-calls", "mama-calls", "five-return"]);
    assert.equal(getDubLineAtElapsed(12_900)?.id, "line-3");
  });

  it("keeps the authored script immutable", () => {
    const originalText = DUB_LINES[0].text;
    const originalCue = DUB_LINES[0].cueMs;
    assert.throws(() => { DUB_LINES[0].text = "changed"; }, TypeError);
    assert.throws(() => { DUB_LINES[0].cueMs = 0; }, TypeError);
    assert.throws(() => { DUB_LINES.push(DUB_LINES[0]); }, TypeError);
    assert.equal(DUB_LINES[0].text, originalText);
    assert.equal(DUB_LINES[0].cueMs, originalCue);
    assert.equal(DUB_LINES.length, 9);
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
