import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { installPreloadErrorRecovery } from "../src/app/preload-error-recovery.ts";

function createStorage(initialValue = null, failures = {}) {
  let value = initialValue;
  const reads = [];
  const writes = [];
  const removals = [];

  return {
    get value() {
      return value;
    },
    reads,
    writes,
    removals,
    getItem(key) {
      if (failures.read) throw new Error("storage read failed");
      reads.push(key);
      return value;
    },
    setItem(key, nextValue) {
      if (failures.write) throw new Error("storage write failed");
      writes.push([key, nextValue]);
      value = nextValue;
    },
    removeItem(key) {
      if (failures.remove) throw new Error("storage remove failed");
      removals.push(key);
      value = null;
    },
  };
}

function dispatchPreloadError(target) {
  const event = new globalThis.Event("vite:preloadError", { cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe("Vite preload error recovery", () => {
  it("marks the current build, prevents the first failure, and reloads only once per document", () => {
    const target = new globalThis.EventTarget();
    const storage = createStorage();
    let reloads = 0;
    installPreloadErrorRecovery({
      buildIdentity: "0.1.700:abcdef0",
      target,
      getStorage: () => storage,
      reload: () => {
        reloads += 1;
      },
    });

    const first = dispatchPreloadError(target);
    const repeated = dispatchPreloadError(target);

    assert.equal(first.defaultPrevented, true);
    assert.equal(repeated.defaultPrevented, false);
    assert.equal(reloads, 1);
    assert.equal(storage.writes.length, 1);
    assert.equal(storage.writes[0][1], "0.1.700:abcdef0");
  });

  it("clears a same-build reload marker and blocks another reload in the new document", () => {
    const target = new globalThis.EventTarget();
    const storage = createStorage("0.1.700:abcdef0");
    let reloads = 0;
    installPreloadErrorRecovery({
      buildIdentity: "0.1.700:abcdef0",
      target,
      getStorage: () => storage,
      reload: () => {
        reloads += 1;
      },
    });

    const event = dispatchPreloadError(target);

    assert.equal(storage.value, null);
    assert.equal(storage.removals.length, 1);
    assert.equal(storage.writes.length, 0);
    assert.equal(event.defaultPrevented, false);
    assert.equal(reloads, 0);
  });

  it("allows a different build to recover once even when an old marker remains", () => {
    const target = new globalThis.EventTarget();
    const storage = createStorage("0.1.699:1234567");
    let reloads = 0;
    installPreloadErrorRecovery({
      buildIdentity: "0.1.700:abcdef0",
      target,
      getStorage: () => storage,
      reload: () => {
        reloads += 1;
      },
    });

    assert.equal(storage.value, null);
    assert.equal(storage.removals.length, 1);
    assert.equal(storage.writes.length, 0);

    const event = dispatchPreloadError(target);

    assert.equal(event.defaultPrevented, true);
    assert.equal(storage.value, "0.1.700:abcdef0");
    assert.equal(storage.writes.length, 1);
    assert.equal(reloads, 1);
  });

  it("does not reload or suppress the error when session storage cannot be read", () => {
    const target = new globalThis.EventTarget();
    const storage = createStorage(null, { read: true });
    let reloads = 0;

    assert.doesNotThrow(() =>
      installPreloadErrorRecovery({
        buildIdentity: "0.1.700:abcdef0",
        target,
        getStorage: () => storage,
        reload: () => {
          reloads += 1;
        },
      }),
    );

    const event = dispatchPreloadError(target);
    assert.equal(event.defaultPrevented, false);
    assert.equal(reloads, 0);
  });

  it("does not reload or suppress the error when the recovery marker cannot be written", () => {
    const target = new globalThis.EventTarget();
    const storage = createStorage(null, { write: true });
    let reloads = 0;
    installPreloadErrorRecovery({
      buildIdentity: "0.1.700:abcdef0",
      target,
      getStorage: () => storage,
      reload: () => {
        reloads += 1;
      },
    });

    const event = dispatchPreloadError(target);

    assert.equal(event.defaultPrevented, false);
    assert.equal(reloads, 0);
  });

  it("does not install recovery when a same-build marker cannot be cleared", () => {
    const target = new globalThis.EventTarget();
    const storage = createStorage("0.1.700:abcdef0", { remove: true });
    let reloads = 0;

    assert.doesNotThrow(() =>
      installPreloadErrorRecovery({
        buildIdentity: "0.1.700:abcdef0",
        target,
        getStorage: () => storage,
        reload: () => {
          reloads += 1;
        },
      }),
    );

    const event = dispatchPreloadError(target);
    assert.equal(event.defaultPrevented, false);
    assert.equal(reloads, 0);
  });

  it("does not install recovery when session storage itself is unavailable", () => {
    const target = new globalThis.EventTarget();
    let reloads = 0;

    assert.doesNotThrow(() =>
      installPreloadErrorRecovery({
        buildIdentity: "0.1.700:abcdef0",
        target,
        getStorage: () => {
          throw new Error("sessionStorage unavailable");
        },
        reload: () => {
          reloads += 1;
        },
      }),
    );

    const event = dispatchPreloadError(target);
    assert.equal(event.defaultPrevented, false);
    assert.equal(reloads, 0);
  });
});
