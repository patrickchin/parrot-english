import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { after, afterEach, before, describe, it } from "node:test";
import { createServer } from "vite";
import { deferred, installDom } from "./helpers/react-lifecycle.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const restoreDom = installDom();
const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: projectRoot,
  server: { middlewareMode: true },
});

let createGuardianAccessProvider;
let notifyGuardianAccessRequired;
let useGuardianAccess;
let mountedRoot;
let container;

before(async () => {
  const module = await vite
    .ssrLoadModule("/src/auth/GuardianAccess.tsx")
    .catch(() => ({}));
  ({
    createGuardianAccessProvider,
    notifyGuardianAccessRequired,
    useGuardianAccess,
  } = module);
});

afterEach(async () => {
  if (mountedRoot) await act(async () => mountedRoot.unmount());
  mountedRoot = null;
  container?.remove();
  container = null;
  Reflect.deleteProperty(document, "visibilityState");
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
    assert.equal(api.loadCalls, 1);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    await act(async () => {
      document.dispatchEvent(new window.Event("visibilitychange"));
    });
    assert.equal(api.loadCalls, 2);
    assert.equal(states.at(-1).mode, "learner");
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
    assert.equal(states.at(-1).mode, "learner");
    assert.equal(states.at(-1).error, "Please check the connection.");

    await act(async () => states.at(-1).retry());
    assert.equal(states.at(-1).mode, "guardian");
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
    const Provider = createGuardianAccessProvider({ api });
    const onState = (state) => states.push(state);

    await mountProvider(Provider, "id:user-1", onState);
    assert.equal(api.loadCalls, 1);
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
    assert.equal(api.loadCalls, 2);
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
    assert.equal(result, "Password did not match.");
    assert.equal(states.at(-1).mode, "learner");
    assert.equal(states.at(-1).error, "Password did not match.");
    assert.deepEqual(api.unlockCalls, ["secret", "wrong"]);
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

    let result;
    await act(async () => {
      result = await states.at(-1).lock();
    });
    assert.equal(
      result,
      "Could not lock guardian mode. Try again before handing over the device.",
    );
    assert.equal(states.at(-1).mode, "guardian");
    assert.equal(states.at(-1).error, result);

    await act(async () => {
      result = await states.at(-1).lock();
    });
    assert.equal(result, null);
    assert.equal(states.at(-1).mode, "learner");
  });

  it("ignores stale async results and synchronizes guardian-required notifications", async () => {
    const unlock = deferred();
    const states = [];
    const api = createApi({
      unlockGuardianAccess() {
        return unlock.promise;
      },
    });
    const Provider = createGuardianAccessProvider({ api });
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
});
