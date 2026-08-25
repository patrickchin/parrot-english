import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, useLocation } from "react-router";
import test, { after } from "node:test";
import { createServer } from "vite";
import {
  cleanupMountedRoots,
  click,
  deferred,
  installDom,
  mountStrict,
  waitFor,
} from "./helpers/react-lifecycle.mjs";

const restoreDom = installDom();
const originalFetch = globalThis.fetch;
const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true },
});
const { GuardianDubbingSettings, GuardianDubbingSettingsView } = await vite
  .ssrLoadModule("/src/dubbing/GuardianDubbingSettings.tsx")
  .catch(() => ({}));
const { createGuardianAccessProvider } = await vite.ssrLoadModule(
  "/src/auth/GuardianAccess.tsx",
);

test.afterEach(async () => {
  await cleanupMountedRoots();
  document.body.replaceChildren();
  globalThis.fetch = originalFetch;
  window.history.replaceState(null, "", "/");
});

after(async () => {
  await vite.close();
  restoreDom();
});

function renderView(overrides = {}) {
  assert.equal(
    typeof GuardianDubbingSettingsView,
    "function",
    "Expected a rendered guardian voice-dubbing settings view",
  );
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/guardian/dubbing"] },
      createElement(GuardianDubbingSettingsView, {
        canRetryStatus: false,
        cleanupRequired: false,
        consentState: "not_granted",
        error: "",
        hasAccepted: false,
        isLoading: false,
        mutation: null,
        onAcceptedChange() {},
        onDelete() {},
        onGrant() {},
        onRetry() {},
        onSwitchToLearner() {},
        savedCount: 0,
        ...overrides,
      }),
    ),
  );
}

test("guardian settings owns voice consent and deletion", () => {
  const disabled = renderView({ consentState: "not_granted" });
  assert.match(disabled, /Allow voice dubbing/);
  assert.match(disabled, /I am the learner(?:&#x27;|')s guardian/);
  assert.match(disabled, /type="checkbox"/);
  assert.match(disabled, /<button[^>]*disabled=""[^>]*>Allow voice dubbing/);

  const enabled = renderView({ consentState: "granted", savedCount: 4 });
  assert.match(enabled, /4 of 24 lines saved/);
  assert.match(enabled, /Switch to learner and start dubbing/);
  assert.match(enabled, /Turn off voice dubbing and delete saved clips/);
  assert.doesNotMatch(enabled, /type="checkbox"/);

  const revoking = renderView({ consentState: "revoking" });
  assert.match(revoking, /Finish removing voice clips/);
  assert.doesNotMatch(revoking, /Allow voice dubbing/);
  assert.doesNotMatch(revoking, /Switch to learner and start dubbing/);
});

test("guardian settings exposes progress and recovery states accessibly", () => {
  const loading = renderView({ isLoading: true });
  assert.match(loading, /role="status"/);
  assert.match(loading, /Loading voice dubbing settings…/);

  const failed = renderView({
    canRetryStatus: true,
    error: "Voice dubbing could not be loaded.",
  });
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Voice dubbing could not be loaded/);
  assert.match(failed, /Try again/);

  const granting = renderView({ hasAccepted: true, mutation: "grant" });
  assert.match(granting, /Turning on voice dubbing…/);

  const deleting = renderView({ consentState: "granted", mutation: "delete" });
  assert.match(deleting, /Removing voice clips…/);

  const switching = renderView({ consentState: "granted", mutation: "switch" });
  assert.match(switching, /Switching to learner…/);
});

function dubStatus(consentState, savedCount = 0) {
  return {
    complete: savedCount === 24,
    consentState,
    dubId: "five-little-ducks-v2",
    guardianConsentVersion: "guardian-voice-r2-v2",
    lines: Array.from({ length: 24 }, (_, index) => ({
      id: `line-${index + 1}`,
      recordedAt: index < savedCount ? "2026-08-25T08:00:00.000Z" : null,
      saved: index < savedCount,
    })),
    recordingEnabled: consentState === "granted",
  };
}

function GuardianProvider({ children, lockGuardianAccess }) {
  const Provider = createGuardianAccessProvider({
    api: {
      async loadGuardianAccess() {
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
      lockGuardianAccess,
      async unlockGuardianAccess() {
        return { mode: "guardian", expiresAt: "2099-08-25T08:15:00.000Z" };
      },
    },
    schedule: () => () => {},
  });
  return createElement(Provider, { sessionIdentity: "user-1" }, children);
}

function LocationProbe() {
  const location = useLocation();
  return createElement("output", { "aria-label": "Current route" }, location.pathname);
}

function button(container, label) {
  const match = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  );
  assert.ok(match, `Expected button named "${label}".`);
  return match;
}

test("grant requires attestation, coalesces clicks, and reloads granted status", async () => {
  const pendingGrant = deferred();
  let consentState = "not_granted";
  let grantCalls = 0;
  globalThis.fetch = async (_input, init = {}) => {
    if (init.method === "PUT") {
      grantCalls += 1;
      consentState = "granted";
      await pendingGrant.promise;
      return new Response(null, { status: 204 });
    }
    return Response.json(dubStatus(consentState));
  };

  const container = await mountStrict(
    createElement(
      MemoryRouter,
      { initialEntries: ["/guardian/dubbing"] },
      createElement(
        GuardianProvider,
        {
          lockGuardianAccess: async () => ({ mode: "learner" }),
        },
        createElement(GuardianDubbingSettings),
      ),
    ),
  );

  await waitFor(() => assert.match(container.textContent, /Allow voice dubbing/));
  assert.equal(document.activeElement, document.body);
  const grantButton = button(container, "Allow voice dubbing");
  assert.equal(grantButton.disabled, true);
  await click(container.querySelector('input[type="checkbox"]'));
  assert.equal(button(container, "Allow voice dubbing").disabled, false);

  await act(async () => {
    button(container, "Allow voice dubbing").click();
    button(container, "Allow voice dubbing").click();
    await Promise.resolve();
  });
  assert.equal(grantCalls, 1);

  pendingGrant.resolve();
  await waitFor(() =>
    assert.match(container.textContent, /Voice dubbing is on/),
  );
  await waitFor(() => assert.equal(
    document.activeElement?.textContent,
    "Voice dubbing is on",
  ));
});

test("a committed grant with a lost response reloads authoritative granted status", async () => {
  let loadFails = true;
  let consentState = "not_granted";
  let getCalls = 0;
  globalThis.fetch = async (_input, init = {}) => {
    if (init.method === "PUT") {
      consentState = "granted";
      throw new Error("Response lost.");
    }
    getCalls += 1;
    return loadFails
      ? new Response(null, { status: 500 })
      : Response.json(dubStatus(consentState));
  };

  const container = await mountStrict(
    createElement(
      MemoryRouter,
      { initialEntries: ["/guardian/dubbing"] },
      createElement(
        GuardianProvider,
        {
          lockGuardianAccess: async () => ({ mode: "learner" }),
        },
        createElement(GuardianDubbingSettings),
      ),
    ),
  );

  await waitFor(() => assert.ok(button(container, "Try again")));
  assert.equal(container.querySelector('input[type="checkbox"]'), null);
  loadFails = false;
  await click(button(container, "Try again"));
  await waitFor(() => assert.match(container.textContent, /Allow voice dubbing/));

  const getCallsBeforeGrant = getCalls;
  await click(container.querySelector('input[type="checkbox"]'));
  await click(button(container, "Allow voice dubbing"));
  await waitFor(() =>
    assert.match(container.textContent, /Voice dubbing is on/),
  );
  assert.equal(getCalls, getCallsBeforeGrant + 1);
  assert.match(
    container.querySelector('[role="alert"]')?.textContent ?? "",
    /Voice dubbing could not be turned on/,
  );
  assert.doesNotMatch(container.textContent, /Allow voice dubbing/);
});

test("failed cleanup reloads revoking status and offers a retry", async () => {
  let consentState = "granted";
  let deleteCalls = 0;
  globalThis.fetch = async (_input, init = {}) => {
    if (init.method === "DELETE") {
      deleteCalls += 1;
      consentState = "revoking";
      return new Response(null, { status: 500 });
    }
    return Response.json(dubStatus(consentState, 4));
  };

  const container = await mountStrict(
    createElement(
      MemoryRouter,
      { initialEntries: ["/guardian/dubbing"] },
      createElement(
        GuardianProvider,
        {
          lockGuardianAccess: async () => ({ mode: "learner" }),
        },
        createElement(GuardianDubbingSettings),
      ),
    ),
  );
  await waitFor(() =>
    assert.ok(button(container, "Turn off voice dubbing and delete saved clips")),
  );
  await click(button(container, "Turn off voice dubbing and delete saved clips"));

  await waitFor(() =>
    assert.ok(button(container, "Finish removing voice clips")),
  );
  assert.equal(deleteCalls, 1);
  assert.match(
    container.querySelector('[role="alert"]')?.textContent ?? "",
    /Your saved dub was not deleted/,
  );
  assert.doesNotMatch(container.textContent, /Allow voice dubbing/);
  await waitFor(() => assert.equal(
    document.activeElement?.textContent,
    "Voice clip removal needs to finish",
  ));
});

test("an interrupted legacy reset exposes guardian cleanup and reconciles afterward", async () => {
  let cleanupRequired = true;
  let deleteCalls = 0;
  globalThis.fetch = async (_input, init = {}) => {
    if (init.method === "DELETE") {
      deleteCalls += 1;
      if (deleteCalls === 1) return new Response(null, { status: 503 });
      cleanupRequired = false;
      return new Response(null, { status: 204 });
    }
    return cleanupRequired
      ? Response.json({ error: "dub_reset_in_progress" }, { status: 409 })
      : Response.json(dubStatus("not_granted"));
  };

  const container = await mountStrict(
    createElement(
      MemoryRouter,
      { initialEntries: ["/guardian/dubbing"] },
      createElement(
        GuardianProvider,
        {
          lockGuardianAccess: async () => ({ mode: "learner" }),
        },
        createElement(GuardianDubbingSettings),
      ),
    ),
  );

  await waitFor(() => assert.ok(button(container, "Finish removing voice clips")));
  assert.match(container.textContent, /Voice clip removal needs to finish/);
  assert.doesNotMatch(container.textContent, /Allow voice dubbing|Try again/);

  await click(button(container, "Finish removing voice clips"));
  await waitFor(() =>
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /Your saved dub was not deleted/,
    ),
  );
  assert.ok(button(container, "Finish removing voice clips"));
  assert.doesNotMatch(container.textContent, /Allow voice dubbing/);

  await click(button(container, "Finish removing voice clips"));
  await waitFor(() => assert.match(container.textContent, /Allow voice dubbing/));
  await waitFor(() => assert.equal(
    document.activeElement?.textContent,
    "Turn on private voice dubbing",
  ));
  assert.equal(deleteCalls, 2);
  assert.doesNotMatch(container.textContent, /Finish removing voice clips/);
});

test("switch coalesces overlapping activations and stays recoverable after lock failure", async () => {
  const pendingLock = deferred();
  let lockCalls = 0;
  globalThis.fetch = async () => Response.json(dubStatus("granted", 4));

  const container = await mountStrict(
    createElement(
      MemoryRouter,
      { initialEntries: ["/guardian/dubbing"] },
      createElement(
        GuardianProvider,
        {
          async lockGuardianAccess() {
            lockCalls += 1;
            if (lockCalls === 1) {
              await pendingLock.promise;
              throw new Error("Lock failed.");
            }
            return { mode: "learner" };
          },
        },
        createElement(GuardianDubbingSettings),
        createElement(LocationProbe),
      ),
    ),
  );
  await waitFor(() =>
    assert.ok(button(container, "Switch to learner and start dubbing")),
  );

  const switchButton = button(container, "Switch to learner and start dubbing");
  await act(() => {
    switchButton.click();
    switchButton.disabled = false;
    switchButton.click();
    pendingLock.resolve();
  });
  assert.equal(lockCalls, 1);
  await waitFor(() =>
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /Could not lock guardian mode/,
    ),
  );
  assert.equal(
    container.querySelector('output[aria-label="Current route"]')?.textContent,
    "/guardian/dubbing",
  );
  assert.equal(
    Boolean(
      [...container.querySelectorAll("button")].find(
        (candidate) => candidate.textContent === "Try again",
      ),
    ),
    false,
  );

  await click(button(container, "Switch to learner and start dubbing"));
  await waitFor(() =>
    assert.equal(
      container.querySelector('output[aria-label="Current route"]')?.textContent,
      "/dubs/five-little-ducks",
    ),
  );
});

test("unmount aborts an unfinished authoritative status load", async () => {
  const signals = [];
  globalThis.fetch = async (_input, init = {}) => {
    signals.push(init.signal);
    return new Promise(() => {});
  };

  await mountStrict(
    createElement(
      MemoryRouter,
      { initialEntries: ["/guardian/dubbing"] },
      createElement(
        GuardianProvider,
        {
          lockGuardianAccess: async () => ({ mode: "learner" }),
        },
        createElement(GuardianDubbingSettings),
      ),
    ),
  );
  await waitFor(() => assert.ok(signals.length > 0));
  await cleanupMountedRoots();
  assert.ok(signals.every((signal) => signal.aborted));
});
