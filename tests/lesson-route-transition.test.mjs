import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LessonPhase, createInitialLessonState } from "../lib/lesson-state.js";

const lessonRouteTransition = await import(
  "../lib/lesson-route-transition.js"
).catch(() => ({}));

const lesson = {
  childName: "Bella",
  scenes: [
    {
      title: "Practice",
      steps: [
        { speaker: "dolly", dialogue: "First line" },
        { speaker: "user", dialogue: "Second line" },
      ],
    },
    {
      title: "Finish",
      steps: [{ speaker: "narrator", dialogue: "Finished" }],
    },
  ],
};

function target(state, event) {
  assert.equal(
    typeof lessonRouteTransition.getLessonEventTargetSceneIndex,
    "function",
  );
  return lessonRouteTransition.getLessonEventTargetSceneIndex(
    state,
    event,
    lesson,
  );
}

describe("lesson route transitions", () => {
  it("returns the next scene for final successful feedback", () => {
    assert.equal(
      target(
        {
          ...createInitialLessonState(),
          phase: LessonPhase.Feedback,
          sceneIndex: 0,
          stepIndex: 1,
          feedbackOutcome: "success",
        },
        { type: "FEEDBACK_DONE" },
      ),
      1,
    );
  });

  it("returns the previous scene for a backward scene control", () => {
    assert.equal(
      target(
        { ...createInitialLessonState(), sceneIndex: 1 },
        { type: "SCENE_PREVIOUS" },
      ),
      0,
    );
  });

  it("returns null for a next control at the final scene", () => {
    assert.equal(
      target(
        { ...createInitialLessonState(), sceneIndex: 1 },
        { type: "SCENE_NEXT" },
      ),
      null,
    );
  });

  it("returns the first scene when replaying a finished final scene", () => {
    assert.equal(
      target(
        {
          ...createInitialLessonState(),
          phase: LessonPhase.Finished,
          sceneIndex: 1,
        },
        { type: "REPLAY_LESSON" },
      ),
      0,
    );
  });

  it("returns null for events that stay within the current scene", () => {
    assert.equal(
      target(createInitialLessonState(), { type: "PAUSE_SCENE" }),
      null,
    );
    assert.equal(
      target(createInitialLessonState(), { type: "PLAY_SCENE" }),
      null,
    );
    assert.equal(
      target(
        {
          ...createInitialLessonState(),
          phase: LessonPhase.Speaking,
          stepIndex: 0,
        },
        { type: "LINE_DONE" },
      ),
      null,
    );
  });

  it("preserves a pending event only when its route target is confirmed", () => {
    assert.equal(
      typeof lessonRouteTransition.getLessonRouteReconciliationEvent,
      "function",
    );
    const pending = { event: { type: "SCENE_NEXT" }, sceneIndex: 1 };

    assert.strictEqual(
      lessonRouteTransition.getLessonRouteReconciliationEvent(pending, 1),
      pending.event,
    );
    assert.deepEqual(
      lessonRouteTransition.getLessonRouteReconciliationEvent(pending, 0),
      { type: "SELECT_SCENE", sceneIndex: 0 },
    );
    assert.deepEqual(
      lessonRouteTransition.getLessonRouteReconciliationEvent(null, 1),
      { type: "SELECT_SCENE", sceneIndex: 1 },
    );
  });

  it("resets a rapid Next then Back POP even when the reducer already matches", () => {
    assert.equal(
      typeof lessonRouteTransition.getLessonRouteReconciliationEvent,
      "function",
    );

    assert.deepEqual(
      lessonRouteTransition.getLessonRouteReconciliationEvent(null, 0, {
        currentSceneIndex: 0,
        isHistoryPop: true,
      }),
      { type: "SELECT_SCENE", sceneIndex: 0 },
    );
    assert.equal(
      lessonRouteTransition.getLessonRouteReconciliationEvent(null, 0, {
        currentSceneIndex: 0,
        isHistoryPop: false,
      }),
      null,
    );
  });

  it("forces idle selection when a duplicate-history POP matches stale pending intent", () => {
    const pending = { event: { type: "SCENE_NEXT" }, sceneIndex: 0 };

    assert.deepEqual(
      lessonRouteTransition.getLessonRouteReconciliationEvent(pending, 0, {
        currentSceneIndex: 0,
        isHistoryPop: true,
      }),
      { type: "SELECT_SCENE", sceneIndex: 0 },
    );
  });

  it("creates destination-correlated POP tokens with a monotonic sequence", () => {
    assert.equal(
      typeof lessonRouteTransition.createLessonHistoryPopToken,
      "function",
    );

    const back = lessonRouteTransition.createLessonHistoryPopToken(
      0,
      { key: "back-entry" },
      { key: "ignored-history-entry" },
    );
    const forward = lessonRouteTransition.createLessonHistoryPopToken(
      back.sequence,
      null,
      { key: "forward-entry" },
    );

    assert.deepEqual(back, {
      destinationKey: "back-entry",
      sequence: 1,
    });
    assert.deepEqual(forward, {
      destinationKey: "forward-entry",
      sequence: 2,
    });
  });

  it("retains a POP token until its exact destination key commits", () => {
    assert.equal(
      typeof lessonRouteTransition.consumeLessonHistoryPopToken,
      "function",
    );
    const token = { destinationKey: "pop-destination", sequence: 4 };

    const intermediate =
      lessonRouteTransition.consumeLessonHistoryPopToken(
        token,
        "intermediate-entry",
      );
    const destination = lessonRouteTransition.consumeLessonHistoryPopToken(
      intermediate.pendingToken,
      "pop-destination",
    );

    assert.equal(intermediate.isHistoryPop, false);
    assert.strictEqual(intermediate.pendingToken, token);
    assert.deepEqual(destination, {
      isHistoryPop: true,
      pendingToken: null,
    });
  });

  it("applies ordinary Next after rapid Back then Forward returns to the committed key", () => {
    const back = lessonRouteTransition.createLessonHistoryPopToken(
      0,
      { key: "back-entry" },
      null,
    );
    const forward = lessonRouteTransition.createLessonHistoryPopToken(
      back.sequence,
      { key: "current-entry" },
      null,
    );
    const popReconciliation =
      lessonRouteTransition.consumeLessonHistoryPopToken(
        forward,
        "current-entry",
      );
    const pendingNext = {
      event: { type: "SCENE_NEXT" },
      sceneIndex: 1,
    };

    assert.equal(forward.sequence, 2);
    assert.deepEqual(
      lessonRouteTransition.getLessonRouteReconciliationEvent(null, 0, {
        currentSceneIndex: 0,
        isHistoryPop: popReconciliation.isHistoryPop,
      }),
      { type: "SELECT_SCENE", sceneIndex: 0 },
    );
    assert.strictEqual(
      lessonRouteTransition.getLessonRouteReconciliationEvent(
        pendingNext,
        1,
        {
          currentSceneIndex: 0,
          isHistoryPop: false,
        },
      ),
      pendingNext.event,
    );
  });
});
