import assert from "node:assert/strict";
import { describe, it } from "node:test";

const lessonRouteActivity = await import("../lib/lesson-route-activity.js").catch(
  () => ({}),
);

describe("lesson route activity guard", () => {
  it("invalidates captures from the previous route generation", () => {
    assert.equal(
      typeof lessonRouteActivity.createLessonRouteActivityGuard,
      "function",
    );

    const guard = lessonRouteActivity.createLessonRouteActivityGuard();
    const oldGeneration = guard.capture();

    assert.equal(guard.isCurrent(oldGeneration), true);

    guard.invalidate();
    const currentGeneration = guard.capture();

    assert.equal(guard.isCurrent(oldGeneration), false);
    assert.equal(guard.isCurrent(currentGeneration), true);
  });

  it("blocks both success and failure from a deferred old-scene operation", async () => {
    const guard = lessonRouteActivity.createLessonRouteActivityGuard();
    const outcomes = [];
    let resolveOldOperation;
    let rejectOldOperation;
    const oldGeneration = guard.capture();
    const oldSuccess = new Promise((resolve) => {
      resolveOldOperation = resolve;
    }).then(() => {
      if (guard.isCurrent(oldGeneration)) outcomes.push("success");
    });
    const oldFailure = new Promise((_, reject) => {
      rejectOldOperation = reject;
    }).catch(() => {
      if (guard.isCurrent(oldGeneration)) outcomes.push("failure");
    });

    guard.invalidate();
    resolveOldOperation();
    rejectOldOperation(new Error("old scene failed"));
    await Promise.all([oldSuccess, oldFailure]);

    assert.deepEqual(outcomes, []);
  });
});
