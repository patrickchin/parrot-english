import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setImmediate } from "node:timers";
import { createLessonRecordingQueue } from "../src/lessons/lesson-recording-queue.ts";

const PARROT_SLOT = {
  lessonId: "lesson-1",
  sceneIndex: 0,
  source: "parrot",
  stepIndex: 1,
};
const MY_SLOT = { ...PARROT_SLOT, source: "my" };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("lesson recording save queue", () => {
  it("does not retry an older failure behind a newer in-flight capture", async () => {
    const older = new Blob(["older"], { type: "audio/webm" });
    const newer = new Blob(["newer"], { type: "audio/webm" });
    const firstSave = deferred();
    const newerSave = deferred();
    const saved = [];
    let attempts = 0;
    const save = async (blob) => {
      saved.push(blob);
      if (attempts++ === 0) {
        await firstSave.promise;
        throw new Error("offline");
      }
      if (attempts === 2) {
        await newerSave.promise;
        throw new Error("still offline");
      }
      return { saved: true, recordedAt: "now" };
    };
    const queue = createLessonRecordingQueue({ save });

    queue.enqueue(PARROT_SLOT, older);
    await flush();
    firstSave.resolve();
    await queue.settle();

    queue.enqueue(PARROT_SLOT, newer);
    await flush();
    const retry = queue.retryFailed();
    newerSave.resolve();
    await retry;

    assert.deepEqual(saved, [older, newer]);
    assert.equal(queue.snapshot().failed, 1);
  });

  it("serializes saves for one slot in enqueue order", async () => {
    const gates = [deferred(), deferred()];
    const saved = [];
    let active = 0;
    let maxActive = 0;
    const save = async (blob, slot) => {
      saved.push([blob, slot]);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await gates[saved.length - 1].promise;
      active -= 1;
      return { saved: true, recordedAt: "now" };
    };
    const queue = createLessonRecordingQueue({ save });
    const firstBlob = new Blob(["first"], { type: "audio/webm" });
    const secondBlob = new Blob(["second"], { type: "audio/webm" });

    queue.enqueue(PARROT_SLOT, firstBlob);
    queue.enqueue(PARROT_SLOT, secondBlob);
    await flush();
    assert.equal(maxActive, 1);
    assert.equal(saved.length, 1);

    gates[0].resolve();
    await flush();
    assert.equal(saved.length, 2);
    assert.equal(maxActive, 1);

    gates[1].resolve();
    await queue.settle();
    assert.deepEqual(saved, [
      [firstBlob, PARROT_SLOT],
      [secondBlob, PARROT_SLOT],
    ]);
    assert.deepEqual(queue.snapshot(), { pending: 0, failed: 0 });
  });

  it("allows different slots to save concurrently and passes no abort signal", async () => {
    const gates = [deferred(), deferred()];
    const calls = [];
    let active = 0;
    let maxActive = 0;
    const save = async (...args) => {
      calls.push(args);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await gates[calls.length - 1].promise;
      active -= 1;
      return { saved: true, recordedAt: "now" };
    };
    const queue = createLessonRecordingQueue({ save });
    const firstBlob = new Blob(["parrot"], { type: "audio/webm" });
    const secondBlob = new Blob(["my"], { type: "audio/webm" });

    queue.enqueue(PARROT_SLOT, firstBlob);
    queue.enqueue(MY_SLOT, secondBlob);
    await flush();
    assert.equal(maxActive, 2);
    assert.deepEqual(calls, [
      [firstBlob, PARROT_SLOT],
      [secondBlob, MY_SLOT],
    ]);

    gates[0].resolve();
    gates[1].resolve();
    await queue.settle();
    assert.deepEqual(queue.snapshot(), { pending: 0, failed: 0 });
  });

  it("does not construct abort controllers", async () => {
    const OriginalAbortController = globalThis.AbortController;
    let constructed = 0;
    globalThis.AbortController = function (...args) {
      constructed += 1;
      return new OriginalAbortController(...args);
    };
    try {
      const queue = createLessonRecordingQueue({
        save: async () => ({ saved: true, recordedAt: "now" }),
      });
      queue.enqueue(PARROT_SLOT, new Blob(["audio"], { type: "audio/webm" }));
      await queue.settle();
      assert.equal(constructed, 0);
    } finally {
      globalThis.AbortController = OriginalAbortController;
    }
  });

  it("retains only the newest thrown failure per slot and retries it", async () => {
    const firstBlob = new Blob(["first"], { type: "audio/webm" });
    const newestBlob = new Blob(["newest"], { type: "audio/webm" });
    const saved = [];
    let attempts = 0;
    const save = async (blob) => {
      saved.push(blob);
      attempts += 1;
      if (attempts < 3) throw new Error("offline");
      return { saved: true, recordedAt: "now" };
    };
    const queue = createLessonRecordingQueue({ save });

    queue.enqueue(PARROT_SLOT, firstBlob);
    queue.enqueue(PARROT_SLOT, newestBlob);
    await queue.settle();
    assert.equal(queue.snapshot().failed, 1);

    await queue.retryFailed();
    assert.deepEqual(saved, [firstBlob, newestBlob, newestBlob]);
    assert.deepEqual(queue.snapshot(), { pending: 0, failed: 0 });
  });

  it("treats a resolved recording-disabled result as settled", async () => {
    const save = async () => ({ saved: false, reason: "recording_disabled" });
    const queue = createLessonRecordingQueue({ save });
    queue.enqueue(PARROT_SLOT, new Blob(["audio"], { type: "audio/webm" }));

    await queue.settle();
    assert.deepEqual(queue.snapshot(), { pending: 0, failed: 0 });
  });

  it("notifies subscribers only when counts change and keeps snapshots stable", async () => {
    const snapshots = [];
    const queue = createLessonRecordingQueue({
      save: async () => ({ saved: true, recordedAt: "now" }),
    });
    const initial = queue.snapshot();
    const unsubscribe = queue.subscribe(() => snapshots.push(queue.snapshot()));

    queue.enqueue(PARROT_SLOT, new Blob(["audio"], { type: "audio/webm" }));
    const pending = queue.snapshot();
    assert.notStrictEqual(pending, initial);
    await queue.settle();
    assert.notStrictEqual(queue.snapshot(), pending);
    assert.deepEqual(snapshots, [pending, queue.snapshot()]);
    assert.strictEqual(queue.snapshot(), queue.snapshot());

    unsubscribe();
    queue.enqueue(MY_SLOT, new Blob(["audio"], { type: "audio/webm" }));
    await queue.settle();
    assert.equal(snapshots.length, 2);
  });
});
