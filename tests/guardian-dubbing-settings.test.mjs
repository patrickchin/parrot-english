import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
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

function learnerRoster() {
  return {
    activeProfileId: "learner-mia",
    profiles: [
      {
        age: 8,
        createdAt: "2026-08-01T08:00:00.000Z",
        id: "learner-mia",
        name: "Mia",
        profileStatus: "completed",
      },
      {
        age: 10,
        createdAt: "2026-08-02T08:00:00.000Z",
        id: "learner-noah",
        name: "Noah",
        profileStatus: "completed",
      },
    ],
  };
}

function readyTarget(learnerProfileId = "learner-mia", learnerName = "Mia") {
  const roster = learnerRoster();
  return {
    activeProfileId: roster.activeProfileId,
    error: "",
    learnerName,
    learnerProfileId,
    phase: "ready",
    profiles: roster.profiles,
    retry() {},
    select() {},
  };
}

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
        savedCount: 0,
        target: readyTarget(),
        ...overrides,
      }),
    ),
  );
}

function textFromMarkup(markup) {
  return markup
    .replace(/<[^>]+>/g, "")
    .replaceAll("&#x27;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

test("guardian settings owns voice consent and deletion", () => {
  const disabled = renderView({ consentState: "not_granted" });
  const disabledText = textFromMarkup(disabled);
  assert.match(disabledText, /Editing settings for Mia/);
  assert.match(disabledText, /Noah/);
  assert.match(disabled, /Allow voice dubbing/);
  assert.match(disabledText, /I am Mia's guardian/);
  assert.match(disabledText, /Mia's private voice clips/);
  assert.match(disabled, /type="checkbox"/);
  assert.match(disabled, /<button[^>]*disabled=""[^>]*>Allow voice dubbing/);

  const enabled = renderView({ consentState: "granted", savedCount: 4 });
  const enabledText = textFromMarkup(enabled);
  assert.match(enabled, /4 of 24 lines saved/);
  assert.match(enabledText, /Manage learners/);
  assert.doesNotMatch(enabledText, /Switch to Mia and start dubbing/);
  assert.match(
    enabledText,
    /Turn off Mia's voice dubbing and delete saved clips/,
  );
  assert.doesNotMatch(enabled, /type="checkbox"/);

  const revoking = renderView({ consentState: "revoking" });
  assert.match(revoking, /Finish removing voice clips/);
  assert.doesNotMatch(revoking, /Allow voice dubbing/);
  assert.doesNotMatch(
    textFromMarkup(revoking),
    /Switch to Mia and start dubbing/,
  );
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

function installDubbingFetch(handler) {
  globalThis.fetch = async (path, init = {}) => {
    if (path === "/api/learner-profiles") {
      return Response.json(learnerRoster());
    }
    if (
      typeof path === "string" &&
      path.startsWith("/api/dubs/five-little-ducks-v2") &&
      path.endsWith("?learnerProfileId=learner-mia")
    ) {
      return handler(path, init);
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
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
  installDubbingFetch(async (_input, init = {}) => {
    if (init.method === "PUT") {
      grantCalls += 1;
      consentState = "granted";
      await pendingGrant.promise;
      return new Response(null, { status: 204 });
    }
    return Response.json(dubStatus(consentState));
  });

  const container = await mountStrict(
    createElement(
      MemoryRouter,
      { initialEntries: ["/guardian/dubbing"] },
      createElement(
        GuardianProvider,
        {
          lockGuardianAccess: async () => ({ mode: "learner" }),
        },
        createElement(GuardianDubbingSettings, { learnerName: "Mia" }),
      ),
    ),
  );

  await waitFor(() =>
    assert.match(container.textContent, /Allow voice dubbing/),
  );
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
  await waitFor(() =>
    assert.equal(document.activeElement?.textContent, "Voice dubbing is on"),
  );
});

test("a committed grant with a lost response reloads authoritative granted status", async () => {
  let loadFails = true;
  let consentState = "not_granted";
  let getCalls = 0;
  installDubbingFetch(async (_input, init = {}) => {
    if (init.method === "PUT") {
      consentState = "granted";
      throw new Error("Response lost.");
    }
    getCalls += 1;
    return loadFails
      ? new Response(null, { status: 500 })
      : Response.json(dubStatus(consentState));
  });

  const container = await mountStrict(
    createElement(
      MemoryRouter,
      { initialEntries: ["/guardian/dubbing"] },
      createElement(
        GuardianProvider,
        {
          lockGuardianAccess: async () => ({ mode: "learner" }),
        },
        createElement(GuardianDubbingSettings, { learnerName: "Mia" }),
      ),
    ),
  );

  await waitFor(() => assert.ok(button(container, "Try again")));
  assert.equal(container.querySelector('input[type="checkbox"]'), null);
  loadFails = false;
  await click(button(container, "Try again"));
  await waitFor(() =>
    assert.match(container.textContent, /Allow voice dubbing/),
  );

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
  installDubbingFetch(async (_input, init = {}) => {
    if (init.method === "DELETE") {
      deleteCalls += 1;
      consentState = "revoking";
      return new Response(null, { status: 500 });
    }
    return Response.json(dubStatus(consentState, 4));
  });

  const container = await mountStrict(
    createElement(
      MemoryRouter,
      { initialEntries: ["/guardian/dubbing"] },
      createElement(
        GuardianProvider,
        {
          lockGuardianAccess: async () => ({ mode: "learner" }),
        },
        createElement(GuardianDubbingSettings, { learnerName: "Mia" }),
      ),
    ),
  );
  await waitFor(() =>
    assert.ok(
      button(container, "Turn off Mia's voice dubbing and delete saved clips"),
    ),
  );
  await click(
    button(container, "Turn off Mia's voice dubbing and delete saved clips"),
  );

  await waitFor(() =>
    assert.ok(button(container, "Finish removing voice clips")),
  );
  assert.equal(deleteCalls, 1);
  assert.match(
    container.querySelector('[role="alert"]')?.textContent ?? "",
    /Your saved dub was not deleted/,
  );
  assert.doesNotMatch(container.textContent, /Allow voice dubbing/);
  await waitFor(() =>
    assert.equal(
      document.activeElement?.textContent,
      "Voice clip removal needs to finish",
    ),
  );
});

test("an interrupted legacy reset exposes guardian cleanup and reconciles afterward", async () => {
  let cleanupRequired = true;
  let deleteCalls = 0;
  installDubbingFetch(async (_input, init = {}) => {
    if (init.method === "DELETE") {
      deleteCalls += 1;
      if (deleteCalls === 1) return new Response(null, { status: 503 });
      cleanupRequired = false;
      return new Response(null, { status: 204 });
    }
    return cleanupRequired
      ? Response.json({ error: "dub_reset_in_progress" }, { status: 409 })
      : Response.json(dubStatus("not_granted"));
  });

  const container = await mountStrict(
    createElement(
      MemoryRouter,
      { initialEntries: ["/guardian/dubbing"] },
      createElement(
        GuardianProvider,
        {
          lockGuardianAccess: async () => ({ mode: "learner" }),
        },
        createElement(GuardianDubbingSettings, { learnerName: "Mia" }),
      ),
    ),
  );

  await waitFor(() =>
    assert.ok(button(container, "Finish removing voice clips")),
  );
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
  await waitFor(() =>
    assert.match(container.textContent, /Allow voice dubbing/),
  );
  await waitFor(() =>
    assert.equal(
      document.activeElement?.textContent,
      "Turn on private voice dubbing",
    ),
  );
  assert.equal(deleteCalls, 2);
  assert.doesNotMatch(container.textContent, /Finish removing voice clips/);
});

test("unmount aborts an unfinished authoritative status load", async () => {
  const signals = [];
  installDubbingFetch(async (_input, init = {}) => {
    signals.push(init.signal);
    return new Promise(() => {});
  });

  await mountStrict(
    createElement(
      MemoryRouter,
      { initialEntries: ["/guardian/dubbing"] },
      createElement(
        GuardianProvider,
        {
          lockGuardianAccess: async () => ({ mode: "learner" }),
        },
        createElement(GuardianDubbingSettings, { learnerName: "Mia" }),
      ),
    ),
  );
  await waitFor(() => assert.ok(signals.length > 0));
  await cleanupMountedRoots();
  assert.ok(signals.every((signal) => signal.aborted));
});

test("loads and grants Noah's dubbing through explicit target requests only", async () => {
  const requests = [];
  let miaConsent = "not_granted";
  let noahConsent = "not_granted";
  globalThis.fetch = async (path, init = {}) => {
    const method = init.method ?? "GET";
    requests.push({ method, path });
    if (path === "/api/learner-profiles") {
      return Response.json({
        activeProfileId: "learner-mia",
        profiles: [
          {
            age: 8,
            createdAt: "2026-08-01T08:00:00.000Z",
            id: "learner-mia",
            name: "Mia",
            profileStatus: "completed",
          },
          {
            age: 10,
            createdAt: "2026-08-02T08:00:00.000Z",
            id: "learner-noah",
            name: "Noah",
            profileStatus: "completed",
          },
        ],
      });
    }
    const targeted =
      path ===
      "/api/dubs/five-little-ducks-v2/consent?learnerProfileId=learner-noah";
    if (
      (targeted || path === "/api/dubs/five-little-ducks-v2/consent") &&
      method === "PUT"
    ) {
      if (targeted) noahConsent = "granted";
      else miaConsent = "granted";
      return new Response(null, { status: 204 });
    }
    if (
      path === "/api/dubs/five-little-ducks-v2?learnerProfileId=learner-noah"
    ) {
      return Response.json(dubStatus(noahConsent));
    }
    if (path === "/api/dubs/five-little-ducks-v2") {
      return Response.json(dubStatus(miaConsent));
    }
    throw new Error(`Unexpected request: ${method} ${path}`);
  };

  const container = await mountStrict(
    createElement(
      MemoryRouter,
      {
        initialEntries: ["/guardian/dubbing?learnerProfileId=learner-noah"],
      },
      createElement(
        GuardianProvider,
        { lockGuardianAccess: async () => ({ mode: "learner" }) },
        createElement(GuardianDubbingSettings, { learnerName: "Mia" }),
      ),
    ),
  );

  await waitFor(() =>
    assert.match(container.textContent, /Editing settings for Noah/),
  );
  await click(container.querySelector('input[type="checkbox"]'));
  await click(button(container, "Allow voice dubbing"));
  await waitFor(() =>
    assert.match(container.textContent, /Voice dubbing is on/),
  );
  assert.match(container.textContent, /Manage learners/);
  assert.doesNotMatch(container.textContent, /Switch to .*start dubbing/);

  const dubRequests = requests.filter(({ path }) =>
    path.startsWith("/api/dubs/five-little-ducks-v2"),
  );
  assert.ok(dubRequests.length > 0);
  assert.ok(
    dubRequests.every(({ path }) =>
      path.endsWith("?learnerProfileId=learner-noah"),
    ),
  );
  assert.equal(miaConsent, "not_granted");
  assert.equal(noahConsent, "granted");
});
