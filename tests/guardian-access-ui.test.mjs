import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { after, afterEach, before, describe, it } from "node:test";
import { createServer } from "vite";
import { deferred, installDom, waitFor } from "./helpers/react-lifecycle.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const restoreDom = installDom();
const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: projectRoot,
  server: { middlewareMode: true },
});

let createGuardianAccessProvider;
let GuardianAccessApiError;
let notifyGuardianAccessRequired;
let useGuardianAccess;
let mountedRoot;
let container;
const originalBroadcastChannel = globalThis.BroadcastChannel;
let originalCrypto;

before(async () => {
  const module = await vite
    .ssrLoadModule("/src/auth/GuardianAccess.tsx")
    .catch(() => ({}));
  ({
    createGuardianAccessProvider,
    notifyGuardianAccessRequired,
    useGuardianAccess,
  } = module);
  ({ GuardianAccessApiError } = await vite.ssrLoadModule(
    "/src/auth/guardian-access-api.ts",
  ));
});

afterEach(async () => {
  if (mountedRoot) await act(async () => mountedRoot.unmount());
  mountedRoot = null;
  container?.remove();
  container = null;
  Reflect.deleteProperty(document, "visibilityState");
  window.localStorage.clear();
  if (originalBroadcastChannel === undefined) {
    Reflect.deleteProperty(globalThis, "BroadcastChannel");
  } else {
    Object.defineProperty(globalThis, "BroadcastChannel", {
      configurable: true,
      value: originalBroadcastChannel,
      writable: true,
    });
  }
  if (originalCrypto !== undefined) {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: originalCrypto,
      writable: true,
    });
  }
  originalCrypto = undefined;
});

after(async () => {
  await vite.close();
  restoreDom();
});

function createClock(start) {
  const clock = {
    now: Date.parse(start),
    jobs: [],
    schedule(callback, delay) {
      const job = { at: clock.now + delay, callback, cancelled: false };
      clock.jobs.push(job);
      return () => {
        job.cancelled = true;
      };
    },
    async runAt(timestamp) {
      clock.now = Date.parse(timestamp);
      const due = clock.jobs.filter((job) => !job.cancelled && job.at <= clock.now);
      await act(async () => {
        for (const job of due) {
          job.cancelled = true;
          job.callback();
        }
      });
    },
  };
  return clock;
}

function createApi(overrides = {}) {
  return {
    loadCalls: 0,
    lockCalls: 0,
    unlockCalls: [],
    async loadGuardianAccess() {
      this.loadCalls += 1;
      return { mode: "learner" };
    },
    async lockGuardianAccess() {
      this.lockCalls += 1;
      return { mode: "learner" };
    },
    async unlockGuardianAccess(password) {
      this.unlockCalls.push(password);
      return { mode: "learner" };
    },
    ...overrides,
  };
}

function createStatefulApi() {
  const unlockCommit = deferred();
  const server = {
    abortedUnlockAtCommit: false,
    commits: [],
    mode: "learner",
  };
  const expiresAt = "2099-08-25T08:15:00.000Z";
  const api = createApi({
    async loadGuardianAccess() {
      this.loadCalls += 1;
      return server.mode === "guardian"
        ? { mode: "guardian", expiresAt }
        : { mode: "learner" };
    },
    async lockGuardianAccess() {
      this.lockCalls += 1;
      server.commits.push("lock");
      server.mode = "learner";
      return { mode: "learner" };
    },
    async unlockGuardianAccess(password, options) {
      this.unlockCalls.push(password);
      await unlockCommit.promise;
      server.abortedUnlockAtCommit = options?.signal?.aborted === true;
      server.commits.push("unlock");
      server.mode = "guardian";
      return { mode: "guardian", expiresAt };
    },
  });
  return { api, server, unlockCommit };
}

function Probe({ onState }) {
  const state = useGuardianAccess();
  useEffect(() => {
    onState(state);
  }, [onState, state]);
  return createElement("output", null, state.mode);
}

async function mountProvider(Provider, sessionIdentity, onState) {
  assert.equal(typeof Provider, "function", "Expected createGuardianAccessProvider()");
  container = document.createElement("div");
  document.body.append(container);
  mountedRoot = createRoot(container);
  await renderProvider(Provider, sessionIdentity, onState);
}

async function renderProvider(Provider, sessionIdentity, onState) {
  await act(async () => {
    mountedRoot.render(
      createElement(
        Provider,
        { sessionIdentity },
        createElement(Probe, { onState }),
      ),
    );
  });
}

async function waitForGuardianLockStorageKey(sessionIdentity) {
  const storageKey = `${await guardianLockScopeName(sessionIdentity)}:state`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await act(
      async () => await new Promise((resolve) => window.setTimeout(resolve, 0)),
    );
  }
  return storageKey;
}

function dispatchGuardianLock(storageKey, token = "sibling-lock") {
  const event = new window.Event("storage");
  Object.defineProperties(event, {
    key: { value: storageKey },
    newValue: { value: token },
  });
  window.dispatchEvent(event);
}

function emitGuardianLock(storageKey, token = "sibling-lock") {
  window.localStorage.setItem(storageKey, token);
  dispatchGuardianLock(storageKey, token);
}

async function guardianLockScopeName(sessionIdentity) {
  const bytes = new globalThis.TextEncoder().encode(sessionIdentity);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const scope = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `parrot-guardian-access-lock-${scope}`;
}

describe("guardian access provider", { concurrency: false }, () => {
  it("fails closed, expires from the server timestamp, and rechecks on visibility", async () => {
    const states = [];
    const clock = createClock("2026-08-25T08:00:00.000Z");
    const api = createApi({
      async loadGuardianAccess() {
        this.loadCalls += 1;
        return this.loadCalls === 1
          ? { mode: "guardian", expiresAt: "2026-08-25T08:15:00.000Z" }
          : { mode: "learner" };
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      now: () => clock.now,
      schedule: clock.schedule,
    });

    await mountProvider(Provider, "id:user-1", (state) => states.push(state));
    await waitFor(() => assert.equal(states.at(-1).mode, "guardian"));
    assert.deepEqual(states.map(({ mode }) => mode), ["loading", "guardian"]);
    assert.equal(states.at(-1).expiresAt, "2026-08-25T08:15:00.000Z");

    await clock.runAt("2026-08-25T08:15:00.000Z");
    assert.equal(states.at(-1).mode, "learner");

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    await act(async () => {
      document.dispatchEvent(new window.Event("visibilitychange"));
    });
    assert.equal(api.loadCalls, 2);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    await act(async () => {
      document.dispatchEvent(new window.Event("visibilitychange"));
    });
    assert.equal(api.loadCalls, 3);
    assert.equal(states.at(-1).mode, "learner");
  });

  it("keeps settled Guardian mode visible while a visibility recheck is pending", async () => {
    const states = [];
    const recheck = deferred();
    const api = createApi({
      async loadGuardianAccess() {
        this.loadCalls += 1;
        return this.loadCalls === 1
          ? { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" }
          : recheck.promise;
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });

    await mountProvider(Provider, "id:user-1", (state) => states.push(state));
    await waitFor(() => assert.equal(states.at(-1).mode, "guardian"));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    await act(async () => {
      document.dispatchEvent(new window.Event("visibilitychange"));
    });

    await waitFor(() => assert.equal(api.loadCalls, 2));
    assert.equal(states.at(-1).mode, "guardian");

    recheck.resolve({
      mode: "guardian",
      expiresAt: "2099-08-25T08:30:00.000Z",
    });
    await act(async () => recheck.promise);
    assert.equal(states.at(-1).mode, "guardian");
    assert.equal(states.at(-1).expiresAt, "2099-08-25T08:30:00.000Z");
  });

  it("reports a failed check in learner mode and retries", async () => {
    const states = [];
    const clock = createClock("2026-08-25T08:00:00.000Z");
    const api = createApi({
      async loadGuardianAccess() {
        this.loadCalls += 1;
        if (this.loadCalls === 1) throw new Error("Please check the connection.");
        return { mode: "guardian", expiresAt: "2026-08-25T08:15:00.000Z" };
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      now: () => clock.now,
      schedule: clock.schedule,
    });

    await mountProvider(Provider, "id:user-1", (state) => states.push(state));
    await waitFor(() => {
      assert.equal(states.at(-1).mode, "learner");
      assert.equal(states.at(-1).error, "check-failed");
    });

    await act(async () => states.at(-1).retry());
    await waitFor(() => assert.equal(states.at(-1).mode, "guardian"));
  });

  it("resets for identity changes and never requests for a null session", async () => {
    const first = deferred();
    const second = deferred();
    const states = [];
    const api = createApi({
      loadGuardianAccess() {
        this.loadCalls += 1;
        return this.loadCalls === 1 ? first.promise : second.promise;
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });
    const onState = (state) => states.push(state);

    await mountProvider(Provider, "id:user-1", onState);
    await waitFor(() => assert.equal(api.loadCalls, 1));
    await renderProvider(Provider, null, onState);
    assert.equal(states.at(-1).mode, "learner");
    assert.equal(api.loadCalls, 1);

    first.resolve({
      mode: "guardian",
      expiresAt: "2026-08-25T08:15:00.000Z",
    });
    await act(async () => first.promise);
    assert.equal(states.at(-1).mode, "learner");

    await renderProvider(Provider, "id:user-2", onState);
    assert.equal(states.at(-1).mode, "loading");
    await waitFor(() => assert.equal(api.loadCalls, 2));
    second.resolve({ mode: "learner" });
    await act(async () => second.promise);
    assert.equal(states.at(-1).mode, "learner");
  });

  it("unlocks successfully and fails closed when unlock fails", async () => {
    const states = [];
    const clock = createClock("2026-08-25T08:00:00.000Z");
    const api = createApi({
      async unlockGuardianAccess(password) {
        this.unlockCalls.push(password);
        if (password === "wrong") throw new Error("Password did not match.");
        return { mode: "guardian", expiresAt: "2026-08-25T08:15:00.000Z" };
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      now: () => clock.now,
      schedule: clock.schedule,
    });
    await mountProvider(Provider, "id:user-1", (state) => states.push(state));

    let result;
    await act(async () => {
      result = await states.at(-1).unlock("secret");
    });
    assert.equal(result, null);
    assert.equal(states.at(-1).mode, "guardian");
    assert.equal(states.at(-1).expiresAt, "2026-08-25T08:15:00.000Z");

    await act(async () => {
      result = await states.at(-1).unlock("wrong");
    });
    assert.equal(result, "check-failed");
    assert.equal(states.at(-1).mode, "learner");
    assert.equal(states.at(-1).error, null);
    assert.deepEqual(api.unlockCalls, ["secret", "wrong"]);
  });

  it("compensates an unlock that commits before its response is lost", async () => {
    const states = [];
    const server = { commits: [], mode: "guardian" };
    const api = createApi({
      async loadGuardianAccess() {
        this.loadCalls += 1;
        return server.mode === "guardian"
          ? { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" }
          : { mode: "learner" };
      },
      async lockGuardianAccess() {
        this.lockCalls += 1;
        server.commits.push("lock");
        server.mode = "learner";
        return { mode: "learner" };
      },
      async unlockGuardianAccess(password) {
        this.unlockCalls.push(password);
        server.commits.push("unlock");
        server.mode = "guardian";
        throw new Error("Connection lost after unlocking.");
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });
    await mountProvider(Provider, "id:user-1", (state) => states.push(state));
    const storageKey = await waitForGuardianLockStorageKey("id:user-1");

    let result;
    await act(async () => {
      result = await states.at(-1).unlock("secret");
    });

    assert.equal(result, "check-failed");
    assert.equal(states.at(-1).mode, "learner");
    assert.equal(server.mode, "learner");
    assert.deepEqual(server.commits, ["unlock", "lock"]);
    assert.equal(api.lockCalls, 1);
    assert.ok(window.localStorage.getItem(storageKey));

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    await act(async () => {
      document.dispatchEvent(new window.Event("visibilitychange"));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    assert.equal(states.at(-1).mode, "learner");
    assert.equal(server.mode, "learner");
    assert.deepEqual(server.commits, ["unlock", "lock"]);
  });

  it("retains a fail-closed marker when an ambiguous unlock compensation fails", async () => {
    const states = [];
    const server = { commits: [], mode: "guardian" };
    let unlockAttempts = 0;
    const api = createApi({
      async loadGuardianAccess() {
        this.loadCalls += 1;
        return server.mode === "guardian"
          ? { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" }
          : { mode: "learner" };
      },
      async lockGuardianAccess() {
        this.lockCalls += 1;
        server.commits.push("failed-lock");
        throw new Error("Lock response was lost.");
      },
      async unlockGuardianAccess(password) {
        this.unlockCalls.push(password);
        unlockAttempts += 1;
        server.mode = "guardian";
        if (unlockAttempts === 1) {
          server.commits.push("lost-unlock");
          throw new Error("Unlock response was lost.");
        }
        server.commits.push("confirmed-unlock");
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });
    await mountProvider(Provider, "id:user-1", (state) => states.push(state));
    const storageKey = await waitForGuardianLockStorageKey("id:user-1");

    let result;
    await act(async () => {
      result = await states.at(-1).unlock("first");
    });
    const marker = window.localStorage.getItem(storageKey);
    assert.equal(result, "check-failed");
    assert.equal(states.at(-1).mode, "learner");
    assert.ok(marker);
    assert.equal(server.mode, "guardian");
    assert.deepEqual(server.commits, ["lost-unlock", "failed-lock"]);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    await act(async () => {
      document.dispatchEvent(new window.Event("visibilitychange"));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    assert.equal(states.at(-1).mode, "learner");
    assert.equal(window.localStorage.getItem(storageKey), marker);
    assert.equal(server.mode, "guardian");

    await act(async () => {
      result = await states.at(-1).unlock("retry");
    });
    assert.equal(result, null);
    assert.equal(states.at(-1).mode, "guardian");
    assert.equal(window.localStorage.getItem(storageKey), null);
  });

  it("does not compensate a definitive password rejection", async () => {
    const states = [];
    const api = createApi({
      async unlockGuardianAccess(password) {
        this.unlockCalls.push(password);
        throw new GuardianAccessApiError(
          401,
          "invalid_password",
          "Password did not match.",
        );
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });
    await mountProvider(Provider, "id:user-1", (state) => states.push(state));
    const storageKey = await waitForGuardianLockStorageKey("id:user-1");

    let result;
    await act(async () => {
      result = await states.at(-1).unlock("wrong");
    });

    assert.equal(result, "check-failed");
    assert.equal(states.at(-1).mode, "learner");
    assert.equal(api.lockCalls, 0);
    assert.equal(window.localStorage.getItem(storageKey), null);
  });

  it("compensates a stale ambiguous unlock before a newer explicit unlock", async () => {
    const firstUnlock = deferred();
    const states = [];
    const server = { commits: [], mode: "guardian" };
    let unlockAttempts = 0;
    const api = createApi({
      async loadGuardianAccess() {
        this.loadCalls += 1;
        return server.mode === "guardian"
          ? { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" }
          : { mode: "learner" };
      },
      async lockGuardianAccess() {
        this.lockCalls += 1;
        server.commits.push("lock");
        server.mode = "learner";
        return { mode: "learner" };
      },
      async unlockGuardianAccess(password) {
        this.unlockCalls.push(password);
        unlockAttempts += 1;
        if (unlockAttempts === 1) {
          await firstUnlock.promise;
          server.commits.push("first-unlock");
          server.mode = "guardian";
          throw new Error("First unlock response was lost.");
        }
        server.commits.push("second-unlock");
        server.mode = "guardian";
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });
    await mountProvider(Provider, "id:user-1", (state) => states.push(state));

    let firstResult;
    let secondResult;
    let firstPromise;
    let secondPromise;
    await act(async () => {
      firstPromise = states.at(-1).unlock("first").then((result) => {
        firstResult = result;
      });
      await Promise.resolve();
      secondPromise = states.at(-1).unlock("second").then((result) => {
        secondResult = result;
      });
      await Promise.resolve();
    });

    firstUnlock.resolve();
    await act(async () => Promise.all([firstPromise, secondPromise]));

    assert.equal(firstResult, "access-changed");
    assert.equal(secondResult, null);
    assert.equal(states.at(-1).mode, "guardian");
    assert.equal(server.mode, "guardian");
    assert.deepEqual(server.commits, [
      "first-unlock",
      "lock",
      "second-unlock",
    ]);
    assert.equal(api.lockCalls, 1);
  });

  it("rolls back a stale successful unlock before a newer password rejection", async () => {
    const firstResponse = deferred();
    const states = [];
    const server = { commits: [], mode: "learner" };
    const api = createApi({
      async loadGuardianAccess() {
        this.loadCalls += 1;
        return server.mode === "guardian"
          ? { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" }
          : { mode: "learner" };
      },
      async lockGuardianAccess() {
        this.lockCalls += 1;
        server.commits.push("lock");
        server.mode = "learner";
        return { mode: "learner" };
      },
      async unlockGuardianAccess(password) {
        this.unlockCalls.push(password);
        if (password === "correct") {
          server.commits.push("unlock");
          server.mode = "guardian";
          await firstResponse.promise;
          return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
        }
        throw new GuardianAccessApiError(
          401,
          "invalid_password",
          "Password did not match.",
        );
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });
    await mountProvider(Provider, "id:user-1", (state) => states.push(state));
    await waitFor(() => assert.equal(states.at(-1).mode, "learner"));
    const storageKey = await waitForGuardianLockStorageKey("id:user-1");

    let firstResult;
    let secondResult;
    let firstPromise;
    let secondPromise;
    await act(async () => {
      firstPromise = states.at(-1).unlock("correct").then((result) => {
        firstResult = result;
      });
      await Promise.resolve();
    });
    await waitFor(() => assert.deepEqual(api.unlockCalls, ["correct"]));
    await act(async () => {
      secondPromise = states.at(-1).unlock("wrong").then((result) => {
        secondResult = result;
      });
      await Promise.resolve();
    });
    firstResponse.resolve();
    await act(async () => Promise.all([firstPromise, secondPromise]));

    assert.equal(firstResult, "access-changed");
    assert.equal(secondResult, "check-failed");
    assert.equal(states.at(-1).mode, "learner");
    assert.equal(server.mode, "learner");
    assert.deepEqual(server.commits, ["unlock", "lock"]);
    assert.equal(api.lockCalls, 1);
    const marker = window.localStorage.getItem(storageKey);
    assert.ok(marker);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    await act(async () => {
      document.dispatchEvent(new window.Event("visibilitychange"));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    assert.equal(states.at(-1).mode, "learner");
    assert.equal(window.localStorage.getItem(storageKey), marker);
  });

  it("lets a newer correct unlock reopen after rolling back a stale successful unlock", async () => {
    const firstResponse = deferred();
    const states = [];
    const server = { commits: [], mode: "learner" };
    const api = createApi({
      async loadGuardianAccess() {
        this.loadCalls += 1;
        return server.mode === "guardian"
          ? { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" }
          : { mode: "learner" };
      },
      async lockGuardianAccess() {
        this.lockCalls += 1;
        server.commits.push("lock");
        server.mode = "learner";
        return { mode: "learner" };
      },
      async unlockGuardianAccess(password) {
        this.unlockCalls.push(password);
        if (password === "first") {
          server.commits.push("first-unlock");
          server.mode = "guardian";
          await firstResponse.promise;
          return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
        }
        server.commits.push("second-unlock");
        server.mode = "guardian";
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });
    await mountProvider(Provider, "id:user-1", (state) => states.push(state));
    await waitFor(() => assert.equal(states.at(-1).mode, "learner"));
    const storageKey = await waitForGuardianLockStorageKey("id:user-1");

    let firstResult;
    let secondResult;
    let firstPromise;
    let secondPromise;
    await act(async () => {
      firstPromise = states.at(-1).unlock("first").then((result) => {
        firstResult = result;
      });
      await Promise.resolve();
    });
    await waitFor(() => assert.deepEqual(api.unlockCalls, ["first"]));
    await act(async () => {
      secondPromise = states.at(-1).unlock("second").then((result) => {
        secondResult = result;
      });
      await Promise.resolve();
    });
    firstResponse.resolve();
    await act(async () => Promise.all([firstPromise, secondPromise]));

    assert.equal(firstResult, "access-changed");
    assert.equal(secondResult, null);
    assert.equal(states.at(-1).mode, "guardian");
    assert.equal(server.mode, "guardian");
    assert.deepEqual(server.commits, [
      "first-unlock",
      "lock",
      "second-unlock",
    ]);
    assert.equal(api.lockCalls, 1);
    assert.equal(window.localStorage.getItem(storageKey), null);
  });

  it("rejects learner and expired unlock responses as unsuccessful", async () => {
    const states = [];
    const clock = createClock("2026-08-25T08:00:00.000Z");
    const responses = [
      { mode: "learner" },
      { mode: "guardian", expiresAt: "2026-08-25T07:59:59.000Z" },
    ];
    const api = createApi({
      async unlockGuardianAccess(password) {
        this.unlockCalls.push(password);
        return responses.shift();
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      now: () => clock.now,
      schedule: clock.schedule,
    });
    await mountProvider(Provider, "id:user-1", (state) => states.push(state));

    for (const [password, expectedLockCalls] of [
      ["learner-response", 0],
      ["expired-response", 1],
    ]) {
      let result;
      await act(async () => {
        result = await states.at(-1).unlock(password);
      });
      assert.equal(
        result,
        "check-failed",
      );
      assert.equal(states.at(-1).mode, "learner");
      assert.equal(api.lockCalls, expectedLockCalls);
    }

    assert.deepEqual(api.unlockCalls, [
      "learner-response",
      "expired-response",
    ]);
  });

  it("compensates a resolved Guardian unlock response that is expired on this device", async () => {
    const identity = "id:user-1|session:session-1";
    const expiresAt = "2026-08-25T08:15:00.000Z";
    const server = { commits: [], mode: "guardian" };
    const fastStates = [];
    const normalStates = [];
    const api = createApi({
      async loadGuardianAccess() {
        this.loadCalls += 1;
        return server.mode === "guardian"
          ? { mode: "guardian", expiresAt }
          : { mode: "learner" };
      },
      async lockGuardianAccess() {
        this.lockCalls += 1;
        server.commits.push("lock");
        server.mode = "learner";
        return { mode: "learner" };
      },
      async unlockGuardianAccess(password) {
        this.unlockCalls.push(password);
        server.commits.push("unlock");
        server.mode = "guardian";
        return { mode: "guardian", expiresAt };
      },
    });
    const FastProvider = createGuardianAccessProvider({
      api,
      now: () => Date.parse("2026-08-25T08:16:00.000Z"),
      schedule: () => () => {},
    });
    const NormalProvider = createGuardianAccessProvider({
      api,
      now: () => Date.parse("2026-08-25T08:00:00.000Z"),
      schedule: () => () => {},
    });
    await mountProvider(FastProvider, identity, (state) => fastStates.push(state));
    await waitFor(() => assert.equal(fastStates.at(-1).mode, "learner"));
    const storageKey = await waitForGuardianLockStorageKey(identity);
    const siblingContainer = document.createElement("div");
    document.body.append(siblingContainer);
    const siblingRoot = createRoot(siblingContainer);
    try {
      await act(async () => {
        siblingRoot.render(
          createElement(
            NormalProvider,
            { sessionIdentity: identity },
            createElement(Probe, {
              onState: (state) => normalStates.push(state),
            }),
          ),
        );
      });
      await waitFor(() => assert.equal(normalStates.at(-1).mode, "guardian"));

      let result;
      await act(async () => {
        result = await fastStates.at(-1).unlock("secret");
      });

      assert.equal(
        result,
        "check-failed",
      );
      assert.equal(fastStates.at(-1).mode, "learner");
      assert.equal(server.mode, "learner");
      assert.deepEqual(server.commits, ["unlock", "lock"]);
      assert.equal(api.lockCalls, 1);
      const marker = window.localStorage.getItem(storageKey);
      assert.ok(marker);

      await act(async () => dispatchGuardianLock(storageKey, marker));
      assert.equal(normalStates.at(-1).mode, "learner");
    } finally {
      await act(async () => siblingRoot.unmount());
      siblingContainer.remove();
    }
  });

  it("keeps guardian mode on lock failure and becomes learner after a successful lock", async () => {
    const states = [];
    const clock = createClock("2026-08-25T08:00:00.000Z");
    const api = createApi({
      async loadGuardianAccess() {
        this.loadCalls += 1;
        return { mode: "guardian", expiresAt: "2026-08-25T08:15:00.000Z" };
      },
      async lockGuardianAccess() {
        this.lockCalls += 1;
        if (this.lockCalls === 1) throw new Error("Lock did not finish.");
        return { mode: "learner" };
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      now: () => clock.now,
      schedule: clock.schedule,
    });
    await mountProvider(Provider, "id:user-1", (state) => states.push(state));
    await waitFor(() => assert.equal(states.at(-1).mode, "guardian"));

    let result;
    await act(async () => {
      result = await states.at(-1).lock();
    });
    assert.equal(
      result,
      "lock-failed",
    );
    assert.equal(states.at(-1).mode, "guardian");
    assert.equal(states.at(-1).error, result);

    await act(async () => {
      result = await states.at(-1).lock();
    });
    assert.equal(result, null);
    assert.equal(states.at(-1).mode, "learner");
  });

  it("reports the lock error when a lock response still grants guardian mode", async () => {
    const states = [];
    const api = createApi({
      async loadGuardianAccess() {
        this.loadCalls += 1;
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
      async lockGuardianAccess() {
        this.lockCalls += 1;
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });
    await mountProvider(Provider, "id:user-1", (state) => states.push(state));
    await waitFor(() => assert.equal(states.at(-1).mode, "guardian"));

    let result;
    await act(async () => {
      result = await states.at(-1).lock();
    });

    assert.equal(
      result,
      "lock-failed",
    );
    assert.equal(states.at(-1).mode, "guardian");
    assert.equal(states.at(-1).error, result);
  });

  it("collapses guardian UI on a sibling tab lock without issuing another lock", async () => {
    const states = [];
    const api = createApi({
      async loadGuardianAccess() {
        this.loadCalls += 1;
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });

    await mountProvider(Provider, "id:user-1", (state) => states.push(state));
    const storageKey = await waitForGuardianLockStorageKey("id:user-1");
    await act(async () => emitGuardianLock(storageKey));

    assert.equal(states.at(-1).mode, "learner");
    assert.equal(api.lockCalls, 0);
  });

  it("requires an explicit re-unlock after a sibling tab lock", async () => {
    const states = [];
    const server = { mode: "guardian" };
    const api = createApi({
      async loadGuardianAccess() {
        this.loadCalls += 1;
        return server.mode === "guardian"
          ? { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" }
          : { mode: "learner" };
      },
      async unlockGuardianAccess(password) {
        this.unlockCalls.push(password);
        server.mode = "guardian";
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });

    await mountProvider(Provider, "id:user-1", (state) => states.push(state));
    const storageKey = await waitForGuardianLockStorageKey("id:user-1");
    await act(async () => emitGuardianLock(storageKey));
    assert.equal(states.at(-1).mode, "learner");

    server.mode = "learner";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    await act(async () => {
      document.dispatchEvent(new window.Event("visibilitychange"));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    assert.equal(states.at(-1).mode, "learner");

    server.mode = "guardian";
    await act(async () => {
      document.dispatchEvent(new window.Event("visibilitychange"));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    assert.equal(states.at(-1).mode, "learner");
    assert.ok(window.localStorage.getItem(storageKey));

    let result;
    await act(async () => {
      result = await states.at(-1).unlock("secret");
    });
    assert.equal(result, null);
    assert.equal(states.at(-1).mode, "guardian");
    assert.equal(window.localStorage.getItem(storageKey), null);
  });

  it("writes one opaque marker for an explicit lock", async () => {
    const states = [];
    const api = createApi({
      async loadGuardianAccess() {
        this.loadCalls += 1;
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });

    await mountProvider(Provider, "id:user-1", (state) => states.push(state));
    const storageKey = await waitForGuardianLockStorageKey("id:user-1");
    let result;
    await act(async () => {
      result = await states.at(-1).lock();
    });

    assert.equal(result, null);
    assert.equal(states.at(-1).mode, "learner");
    assert.ok(window.localStorage.getItem(storageKey));
    assert.equal(storageKey.includes("id:user-1"), false);
    assert.equal(api.lockCalls, 1);
  });

  it("scopes sibling locks to the exact opaque session channel", async () => {
    const states = [];
    const api = createApi({
      async loadGuardianAccess() {
        this.loadCalls += 1;
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });
    const currentSession = "id:user-1|session:session-1";
    await mountProvider(Provider, currentSession, (state) => states.push(state));
    const storageKey = await waitForGuardianLockStorageKey(currentSession);
    await waitFor(() => assert.equal(states.at(-1).mode, "guardian"));
    assert.equal(
      storageKey,
      `${await guardianLockScopeName(currentSession)}:state`,
    );
    assert.equal(storageKey.includes(currentSession), false);

    const otherStorageKey = await waitForGuardianLockStorageKey(
      "id:user-2|session:session-2",
    );
    await act(async () => emitGuardianLock(otherStorageKey));
    assert.equal(states.at(-1).mode, "guardian");

    await act(async () => emitGuardianLock(storageKey));
    assert.equal(states.at(-1).mode, "learner");
    assert.equal(api.lockCalls, 0);
  });

  it("delivers a lock that finishes before either sibling channel initializes", async () => {
    originalCrypto = globalThis.crypto;
    const digests = [];
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        subtle: {
          digest() {
            const next = deferred();
            digests.push(next);
            return next.promise;
          },
        },
      },
      writable: true,
    });
    const primaryStates = [];
    const siblingStates = [];
    const api = createApi({
      async loadGuardianAccess() {
        this.loadCalls += 1;
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });
    await mountProvider(Provider, "id:user-1|session:session-1", (state) =>
      primaryStates.push(state),
    );
    const siblingContainer = document.createElement("div");
    document.body.append(siblingContainer);
    const siblingRoot = createRoot(siblingContainer);
    await act(async () => {
      siblingRoot.render(
        createElement(
          Provider,
          { sessionIdentity: "id:user-1|session:session-1" },
          createElement(Probe, { onState: (state) => siblingStates.push(state) }),
        ),
      );
    });
    try {
      assert.equal(primaryStates.at(-1).mode, "loading");
      assert.equal(siblingStates.at(-1).mode, "loading");
      assert.equal(digests.length, 2);

      let result;
      let lockPromise;
      await act(async () => {
        lockPromise = primaryStates.at(-1).lock().then((value) => {
          result = value;
        });
        await Promise.resolve();
      });
      assert.equal(api.lockCalls, 0);
      assert.equal(siblingStates.at(-1).mode, "loading");

      digests[0].resolve(new Uint8Array(32).buffer);
      await act(async () => {
        await lockPromise;
      });
      assert.equal(result, null);

      digests[1].resolve(new Uint8Array(32).buffer);
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });
      assert.equal(siblingStates.at(-1).mode, "learner");
    } finally {
      await act(async () => siblingRoot.unmount());
      siblingContainer.remove();
    }
  });

  it("does not issue a lock after unmounting while its session scope is pending", async () => {
    originalCrypto = globalThis.crypto;
    const digest = deferred();
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        subtle: {
          digest() {
            return digest.promise;
          },
        },
      },
      writable: true,
    });
    const states = [];
    const api = createApi({
      async loadGuardianAccess() {
        this.loadCalls += 1;
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });
    await mountProvider(Provider, "id:user-1|session:session-1", (state) =>
      states.push(state),
    );

    let result;
    let lockPromise;
    await act(async () => {
      lockPromise = states.at(-1).lock().then((value) => {
        result = value;
      });
      await Promise.resolve();
    });
    assert.equal(api.lockCalls, 0);

    await act(async () => mountedRoot.unmount());
    mountedRoot = null;
    digest.resolve(new Uint8Array(32).buffer);
    await act(async () => lockPromise);

    assert.equal(api.lockCalls, 0);
    assert.equal(typeof result, "string");
  });

  it("holds a pre-existing lock marker closed until scope initialization and explicit unlock", async () => {
    originalCrypto = globalThis.crypto;
    const digests = [];
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        subtle: {
          digest() {
            const next = deferred();
            digests.push(next);
            return next.promise;
          },
        },
      },
      writable: true,
    });
    const identity = "id:user-1|session:session-1";
    const storageKey = `parrot-guardian-access-lock-${"00".repeat(32)}:state`;
    window.localStorage.setItem(storageKey, "old-lock");
    const states = [];
    const api = createApi({
      async loadGuardianAccess() {
        this.loadCalls += 1;
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
      async unlockGuardianAccess(password) {
        this.unlockCalls.push(password);
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });
    await mountProvider(Provider, identity, (state) => states.push(state));

    assert.equal(states.at(-1).mode, "loading");
    assert.equal(api.loadCalls, 0);

    digests[0].resolve(new Uint8Array(32).buffer);
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    assert.equal(states.at(-1).mode, "learner");
    assert.equal(window.localStorage.getItem(storageKey), "old-lock");

    let result;
    await act(async () => {
      result = await states.at(-1).unlock("secret");
    });
    assert.equal(result, null);
    assert.equal(window.localStorage.getItem(storageKey), null);
    assert.equal(states.at(-1).mode, "guardian");
  });

  it("synchronizes guardian-required reconciliation to an already-visible sibling", async () => {
    const identity = "id:user-1|session:session-1";
    const primaryStates = [];
    const siblingStates = [];
    let reconciled = false;
    const api = createApi({
      async loadGuardianAccess() {
        this.loadCalls += 1;
        if (reconciled) throw new Error("Recheck response was lost.");
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
      async lockGuardianAccess() {
        this.lockCalls += 1;
        reconciled = true;
        return { mode: "learner" };
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });
    await mountProvider(Provider, identity, (state) => primaryStates.push(state));
    const storageKey = await waitForGuardianLockStorageKey(identity);
    const siblingContainer = document.createElement("div");
    document.body.append(siblingContainer);
    const siblingRoot = createRoot(siblingContainer);
    const addEventListener = document.addEventListener;
    document.addEventListener = function (type, listener, options) {
      if (type === "guardian-access-required") return;
      return addEventListener.call(this, type, listener, options);
    };
    try {
      await act(async () => {
        siblingRoot.render(
          createElement(
            Provider,
            { sessionIdentity: identity },
            createElement(Probe, {
              onState: (state) => siblingStates.push(state),
            }),
          ),
        );
      });
    } finally {
      document.addEventListener = addEventListener;
    }
    try {
      await waitFor(() => {
        assert.equal(primaryStates.at(-1).mode, "guardian");
        assert.equal(siblingStates.at(-1).mode, "guardian");
      });

      await act(async () => {
        notifyGuardianAccessRequired();
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });
      const marker = window.localStorage.getItem(storageKey);
      assert.equal(primaryStates.at(-1).mode, "learner");
      assert.ok(marker);
      assert.equal(siblingStates.at(-1).mode, "guardian");

      await act(async () => dispatchGuardianLock(storageKey, marker));
      assert.equal(siblingStates.at(-1).mode, "learner");
      assert.equal(api.lockCalls, 1);
    } finally {
      await act(async () => siblingRoot.unmount());
      siblingContainer.remove();
    }
  });

  it("publishes a fail-closed marker when guardian-required reconciliation lock fails", async () => {
    const identity = "id:user-1|session:session-1";
    const primaryStates = [];
    const siblingStates = [];
    const api = createApi({
      async loadGuardianAccess() {
        this.loadCalls += 1;
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
      async lockGuardianAccess() {
        this.lockCalls += 1;
        throw new Error("Lock response was lost.");
      },
      async unlockGuardianAccess(password) {
        this.unlockCalls.push(password);
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });
    await mountProvider(Provider, identity, (state) => primaryStates.push(state));
    const storageKey = await waitForGuardianLockStorageKey(identity);
    const siblingContainer = document.createElement("div");
    document.body.append(siblingContainer);
    const siblingRoot = createRoot(siblingContainer);
    const addEventListener = document.addEventListener;
    document.addEventListener = function (type, listener, options) {
      if (type === "guardian-access-required") return;
      return addEventListener.call(this, type, listener, options);
    };
    try {
      await act(async () => {
        siblingRoot.render(
          createElement(
            Provider,
            { sessionIdentity: identity },
            createElement(Probe, {
              onState: (state) => siblingStates.push(state),
            }),
          ),
        );
      });
    } finally {
      document.addEventListener = addEventListener;
    }
    try {
      await waitFor(() => {
        assert.equal(primaryStates.at(-1).mode, "guardian");
        assert.equal(siblingStates.at(-1).mode, "guardian");
      });

      await act(async () => notifyGuardianAccessRequired());
      await waitFor(() => assert.equal(api.lockCalls, 1));
      const marker = window.localStorage.getItem(storageKey);
      assert.equal(primaryStates.at(-1).mode, "learner");
      assert.ok(marker);
      assert.equal(siblingStates.at(-1).mode, "guardian");

      await act(async () => dispatchGuardianLock(storageKey, marker));
      assert.equal(siblingStates.at(-1).mode, "learner");

      const loadCallsBeforeVisibility = api.loadCalls;
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      await act(async () => {
        document.dispatchEvent(new window.Event("visibilitychange"));
      });
      await waitFor(() =>
        assert.equal(api.loadCalls, loadCallsBeforeVisibility + 2),
      );
      assert.equal(primaryStates.at(-1).mode, "learner");
      assert.equal(siblingStates.at(-1).mode, "learner");
      assert.equal(window.localStorage.getItem(storageKey), marker);

      let result;
      await act(async () => {
        result = await primaryStates.at(-1).unlock("secret");
      });
      assert.equal(result, null);
      assert.equal(primaryStates.at(-1).mode, "guardian");
      assert.equal(window.localStorage.getItem(storageKey), null);
    } finally {
      await act(async () => siblingRoot.unmount());
      siblingContainer.remove();
    }
  });

  it("ignores a queued old storage lock after a successful re-unlock", async () => {
    const states = [];
    const api = createApi({
      async loadGuardianAccess() {
        this.loadCalls += 1;
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
      async unlockGuardianAccess(password) {
        this.unlockCalls.push(password);
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });
    await mountProvider(Provider, "id:user-1", (state) => states.push(state));
    const storageKey = await waitForGuardianLockStorageKey("id:user-1");
    await act(async () => emitGuardianLock(storageKey, "old-lock"));
    assert.equal(states.at(-1).mode, "learner");

    let result;
    await act(async () => {
      result = await states.at(-1).unlock("secret");
    });
    assert.equal(result, null);
    assert.equal(states.at(-1).mode, "guardian");
    assert.equal(window.localStorage.getItem(storageKey), null);

    await act(async () => dispatchGuardianLock(storageKey, "old-lock"));
    assert.equal(states.at(-1).mode, "guardian");
  });

  it("ignores an old-session storage handler after the provider identity changes", async () => {
    const listeners = [];
    const addEventListener = window.addEventListener.bind(window);
    window.addEventListener = (type, listener, options) => {
      if (type === "storage") listeners.push(listener);
      return addEventListener(type, listener, options);
    };
    const states = [];
    const api = createApi({
      async loadGuardianAccess() {
        this.loadCalls += 1;
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });
    const firstIdentity = "id:user-1|session:session-1";
    const secondIdentity = "id:user-2|session:session-2";
    try {
      await mountProvider(Provider, firstIdentity, (state) => states.push(state));
      const firstKey = await waitForGuardianLockStorageKey(firstIdentity);
      const firstListener = listeners.at(-1);
      assert.equal(typeof firstListener, "function");

      await renderProvider(Provider, secondIdentity, (state) => states.push(state));
      await waitFor(() => assert.equal(states.at(-1).mode, "guardian"));
      window.localStorage.setItem(firstKey, "old-lock");
      await act(async () => {
        firstListener(
          Object.assign(new window.Event("storage"), {
            key: firstKey,
            newValue: "old-lock",
          }),
        );
      });
      assert.equal(states.at(-1).mode, "guardian");
    } finally {
      window.addEventListener = addEventListener;
    }
  });

  it("uses storage synchronization when BroadcastChannel is unavailable", async () => {
    Reflect.deleteProperty(globalThis, "BroadcastChannel");
    const states = [];
    const api = createApi({
      async loadGuardianAccess() {
        this.loadCalls += 1;
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });
    await mountProvider(Provider, "id:user-1", (state) => states.push(state));
    const storageKey = await waitForGuardianLockStorageKey("id:user-1");
    await act(async () => emitGuardianLock(storageKey));
    assert.equal(states.at(-1).mode, "learner");
  });

  it("compensates an in-flight unlock after a sibling lock wins", async () => {
    const unlockCommit = deferred();
    const states = [];
    const server = { commits: [], mode: "guardian" };
    const api = createApi({
      async loadGuardianAccess() {
        this.loadCalls += 1;
        return server.mode === "guardian"
          ? { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" }
          : { mode: "learner" };
      },
      async lockGuardianAccess() {
        this.lockCalls += 1;
        server.commits.push("lock");
        server.mode = "learner";
        return { mode: "learner" };
      },
      async unlockGuardianAccess(password, options) {
        this.unlockCalls.push({ password, signal: options?.signal });
        await unlockCommit.promise;
        server.commits.push("unlock");
        server.mode = "guardian";
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });
    await mountProvider(Provider, "id:user-1", (state) => states.push(state));
    const storageKey = await waitForGuardianLockStorageKey("id:user-1");

    let unlockResult;
    let unlockPromise;
    await act(async () => {
      unlockPromise = states.at(-1).unlock("secret").then((result) => {
        unlockResult = result;
      });
      await Promise.resolve();
    });
    await act(async () => emitGuardianLock(storageKey));
    assert.equal(states.at(-1).mode, "learner");

    unlockCommit.resolve();
    await act(async () => unlockPromise);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    await act(async () => {
      document.dispatchEvent(new window.Event("visibilitychange"));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    assert.equal(typeof unlockResult, "string");
    assert.equal(states.at(-1).mode, "learner");
    assert.deepEqual(server.commits, ["unlock", "lock"]);
    assert.equal(api.lockCalls, 1);
    assert.equal(api.unlockCalls[0].signal?.aborted, true);
  });

  it("keeps a newer delayed sibling lock marker over an in-flight unlock", async () => {
    const unlockCommit = deferred();
    const states = [];
    const server = { commits: [], mode: "guardian" };
    const api = createApi({
      async loadGuardianAccess() {
        this.loadCalls += 1;
        return server.mode === "guardian"
          ? { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" }
          : { mode: "learner" };
      },
      async lockGuardianAccess() {
        this.lockCalls += 1;
        server.commits.push("compensating-lock");
        server.mode = "learner";
        return { mode: "learner" };
      },
      async unlockGuardianAccess(password) {
        this.unlockCalls.push(password);
        await unlockCommit.promise;
        server.commits.push("unlock");
        server.mode = "guardian";
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });
    await mountProvider(Provider, "id:user-1", (state) => states.push(state));
    const storageKey = await waitForGuardianLockStorageKey("id:user-1");
    window.localStorage.setItem(storageKey, "old-lock");

    let unlockResult;
    let unlockPromise;
    await act(async () => {
      unlockPromise = states.at(-1).unlock("secret").then((result) => {
        unlockResult = result;
      });
      await Promise.resolve();
    });
    assert.equal(api.unlockCalls.length, 1);

    server.commits.push("sibling-lock");
    server.mode = "learner";
    window.localStorage.setItem(storageKey, "new-lock");
    unlockCommit.resolve();
    await act(async () => unlockPromise);

    assert.equal(unlockResult, "access-changed");
    assert.equal(states.at(-1).mode, "learner");
    assert.equal(window.localStorage.getItem(storageKey), "new-lock");
    assert.equal(server.mode, "learner");
    assert.deepEqual(server.commits, [
      "sibling-lock",
      "unlock",
      "compensating-lock",
    ]);
    assert.equal(api.lockCalls, 1);

    await act(async () => dispatchGuardianLock(storageKey, "new-lock"));
    assert.equal(states.at(-1).mode, "learner");
    assert.equal(api.lockCalls, 1);
  });

  it("ignores stale async results and synchronizes guardian-required notifications", async () => {
    const unlock = deferred();
    const states = [];
    const api = createApi({
      unlockGuardianAccess() {
        return unlock.promise;
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });
    await mountProvider(Provider, "id:user-1", (state) => states.push(state));

    let unlockResult;
    let unlockPromise;
    await act(async () => {
      unlockPromise = states.at(-1).unlock("secret").then((result) => {
        unlockResult = result;
      });
      await Promise.resolve();
    });
    await act(async () => notifyGuardianAccessRequired());
    assert.equal(states.at(-1).mode, "learner");

    unlock.resolve({
      mode: "guardian",
      expiresAt: "2099-08-25T08:15:00.000Z",
    });
    await act(async () => unlockPromise);
    assert.equal(typeof unlockResult, "string");
    assert.ok(unlockResult.length > 0);
    assert.equal(states.at(-1).mode, "learner");
  });

  it("returns an error to a stale lock caller without mutating synchronized learner state", async () => {
    const pendingLock = deferred();
    const states = [];
    const clock = createClock("2026-08-25T08:00:00.000Z");
    const api = createApi({
      async loadGuardianAccess() {
        this.loadCalls += 1;
        return { mode: "guardian", expiresAt: "2026-08-25T08:15:00.000Z" };
      },
      lockGuardianAccess() {
        this.lockCalls += 1;
        return pendingLock.promise;
      },
    });
    const Provider = createGuardianAccessProvider({
      api,
      now: () => clock.now,
      schedule: clock.schedule,
    });
    await mountProvider(Provider, "id:user-1", (state) => states.push(state));

    let lockResult;
    let lockPromise;
    await act(async () => {
      lockPromise = states.at(-1).lock().then((result) => {
        lockResult = result;
      });
      await Promise.resolve();
    });
    await act(async () => notifyGuardianAccessRequired());
    assert.equal(states.at(-1).mode, "learner");

    pendingLock.resolve({ mode: "learner" });
    await act(async () => lockPromise);
    assert.equal(typeof lockResult, "string");
    assert.ok(lockResult.length > 0);
    assert.equal(states.at(-1).mode, "learner");
  });

  it("queues a visibility status check behind an in-flight unlock", async () => {
    const states = [];
    const { api, server, unlockCommit } = createStatefulApi();
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });
    await mountProvider(Provider, "id:user-1", (state) => states.push(state));
    await waitFor(() => assert.equal(api.loadCalls, 1));
    assert.equal(states.at(-1).mode, "learner");

    let unlockResult;
    let unlockPromise;
    await act(async () => {
      unlockPromise = states.at(-1).unlock("secret").then((result) => {
        unlockResult = result;
      });
      await Promise.resolve();
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    await act(async () => {
      document.dispatchEvent(new window.Event("visibilitychange"));
      await Promise.resolve();
    });

    unlockCommit.resolve();
    await act(async () => unlockPromise);
    await act(async () => Promise.resolve());

    assert.equal(unlockResult, null);
    assert.equal(states.at(-1).mode, "guardian");
    assert.equal(server.mode, "guardian");
    assert.deepEqual(server.commits, ["unlock"]);
    await waitFor(() => assert.equal(api.loadCalls, 2));
  });

  it("compensates a stale unlock after guardian-required selects learner mode", async () => {
    const states = [];
    const { api, server, unlockCommit } = createStatefulApi();
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });
    await mountProvider(Provider, "id:user-1", (state) => states.push(state));

    let unlockResult;
    let unlockPromise;
    await act(async () => {
      unlockPromise = states.at(-1).unlock("secret").then((result) => {
        unlockResult = result;
      });
      await Promise.resolve();
    });
    await act(async () => notifyGuardianAccessRequired());
    assert.equal(states.at(-1).mode, "learner");

    unlockCommit.resolve();
    await act(async () => unlockPromise);
    await act(async () => Promise.resolve());

    assert.equal(typeof unlockResult, "string");
    assert.equal(states.at(-1).mode, "learner");
    assert.equal(server.mode, "learner");
    assert.deepEqual(server.commits, ["unlock", "lock"]);
    assert.equal(api.lockCalls, 1);
  });

  it("serializes unlock then lock commits when learner is the latest intent", async () => {
    const states = [];
    const { api, server, unlockCommit } = createStatefulApi();
    const Provider = createGuardianAccessProvider({
      api,
      schedule: () => () => {},
    });
    await mountProvider(Provider, "id:user-1", (state) => states.push(state));

    let lockResult;
    let unlockResult;
    let lockPromise;
    let unlockPromise;
    await act(async () => {
      unlockPromise = states.at(-1).unlock("secret").then((result) => {
        unlockResult = result;
      });
      lockPromise = states.at(-1).lock().then((result) => {
        lockResult = result;
      });
      await Promise.resolve();
    });

    unlockCommit.resolve();
    await act(async () => Promise.all([unlockPromise, lockPromise]));
    await act(async () => Promise.resolve());

    assert.equal(typeof unlockResult, "string");
    assert.equal(lockResult, null);
    assert.equal(states.at(-1).mode, "learner");
    assert.equal(server.mode, "learner");
    assert.deepEqual(server.commits, ["unlock", "lock"]);
  });
});
