import assert from "node:assert/strict";
import { it } from "node:test";

const activityModule = await import("../lib/lesson-page-activity.js").catch(
  (error) => {
    if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
    return {};
  }
);
const createLessonPageActivityGuard =
  activityModule.createLessonPageActivityGuard ??
  (() => ({
    capture: () => 0,
    invalidate: () => {},
    isCurrent: () => true,
  }));

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

async function acceptWhenCurrent(deferred, guard, value, accepted) {
  const generation = guard.capture();
  await deferred.promise;

  if (guard.isCurrent(generation)) accepted.push(value);
}

it("ignores stale deferred work while accepting current page completion", async () => {
  const guard = createLessonPageActivityGuard();
  const stale = createDeferred();
  const current = createDeferred();
  const accepted = [];
  const staleCompletion = acceptWhenCurrent(stale, guard, "stale", accepted);

  guard.invalidate();

  const currentCompletion = acceptWhenCurrent(
    current,
    guard,
    "current",
    accepted
  );
  stale.resolve();
  current.resolve();
  await Promise.all([staleCompletion, currentCompletion]);

  assert.deepEqual(accepted, ["current"]);
});
