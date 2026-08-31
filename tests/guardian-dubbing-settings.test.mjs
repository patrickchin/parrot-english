import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import test, { after } from "node:test";
import { createServer } from "vite";
import { DUB_DEFINITIONS } from "../src/dubbing/rhyme-catalog.ts";
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
        deletionPending: false,
        id: "learner-mia",
        name: "Mia",
        profileStatus: "completed",
      },
      {
        age: 10,
        createdAt: "2026-08-02T08:00:00.000Z",
        deletionPending: false,
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

test("guardian settings manages stored clips without a recording permission gate", () => {
  const disabled = renderView({ consentState: "not_granted" });
  const disabledText = textFromMarkup(disabled);
  assert.match(disabledText, /Editing settings for Mia/);
  assert.match(disabledText, /Noah/);
  assert.doesNotMatch(disabled, /Allow voice dubbing|type="checkbox"/);
  assert.doesNotMatch(disabledText, /consent|permission/i);

  const enabled = renderView({ consentState: "granted", savedCount: 4 });
  const enabledText = textFromMarkup(enabled);
  assert.match(
    enabledText,
    new RegExp(
      `4 of ${DUB_LINE_COUNT} clips saved; Mia can record and replace lines across all six nursery rhymes\\.`,
    ),
  );
  assert.match(enabledText, /Back to guardian dashboard/);
  assert.doesNotMatch(enabledText, /Manage learners/);
  assert.doesNotMatch(enabledText, /Switch to Mia and start dubbing/);
  assert.match(
    enabledText,
    /Delete Mia's saved nursery-rhyme voice clips/,
  );
  assert.doesNotMatch(enabled, /type="checkbox"/);

  const revoking = renderView({ consentState: "revoking" });
  assert.match(
    textFromMarkup(revoking),
    /stays unavailable in every nursery rhyme.*every saved clip/,
  );
  assert.match(
    revoking,
    /Finish removing nursery-rhyme clips/,
  );
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

  const deleting = renderView({ consentState: "granted", mutation: "delete" });
  assert.match(deleting, /Removing voice clips…/);
});

const DUB_LINE_COUNT = DUB_DEFINITIONS.reduce(
  (total, definition) => total + definition.lines.length,
  0,
);

function dubIdFromPath(path) {
  const dubId = path.match(/^\/api\/dubs\/([^/?]+)/)?.[1];
  if (!DUB_DEFINITIONS.some(({ id }) => id === dubId)) {
    throw new Error(`Unknown test dub path: ${path}`);
  }
  return dubId;
}

function isDubPath(path, learnerProfileId) {
  if (typeof path !== "string" || !path.startsWith("/api/dubs/")) return false;
  const suffix = learnerProfileId
    ? `?learnerProfileId=${learnerProfileId}`
    : "";
  return DUB_DEFINITIONS.some(({ id }) => path === `/api/dubs/${id}${suffix}`);
}

function isKnownDubRequest(path) {
  return typeof path === "string" && DUB_DEFINITIONS.some(
    ({ id }) => path.startsWith(`/api/dubs/${id}`),
  );
}

function dubStatus(
  consentState,
  savedCount = 0,
  dubId = "five-little-ducks-v2",
) {
  const definition = DUB_DEFINITIONS.find(({ id }) => id === dubId);
  assert.ok(definition, `Expected catalog definition ${dubId}`);
  const lineIds = definition.lines.map(({ id }) => id);
  return {
    complete: savedCount === lineIds.length,
    consentState,
    dubId,
    guardianConsentVersion: "guardian-voice-r2-v2",
    lines: lineIds.map((id, index) => ({
      id,
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
      isKnownDubRequest(path) &&
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

test("loads and totals saved clips from every voice-dubbing rhyme", async () => {
  const statusRequests = [];
  installDubbingFetch(async (input, init = {}) => {
    if ((init.method ?? "GET") !== "GET") {
      throw new Error(`Unexpected request: ${init.method} ${input}`);
    }
    statusRequests.push(input);
    const dubId = dubIdFromPath(input);
    const savedCount = dubId === "five-little-ducks-v2"
      ? 4
      : dubId === "old-macdonald-v1"
        ? 5
        : 0;
    return Response.json(
      dubStatus("granted", savedCount, dubId),
    );
  });

  const container = await mountStrict(
    createElement(
      MemoryRouter,
      { initialEntries: ["/guardian/dubbing"] },
      createElement(
        GuardianProvider,
        { lockGuardianAccess: async () => ({ mode: "learner" }) },
        createElement(GuardianDubbingSettings, { learnerName: "Mia" }),
      ),
    ),
  );

  await waitFor(() =>
    assert.match(
      container.textContent,
      new RegExp(
        `9 of ${DUB_LINE_COUNT} clips saved; Mia can record and replace lines across all six nursery rhymes\\.`,
      ),
    ),
  );
  assert.deepEqual(
    statusRequests.sort(),
    DUB_DEFINITIONS.flatMap(({ id }) => [
      `/api/dubs/${id}?learnerProfileId=learner-mia`,
      `/api/dubs/${id}?learnerProfileId=learner-mia`,
    ]).sort(),
  );
});

test("failed cleanup reloads revoking status and offers a retry", async () => {
  let consentState = "granted";
  let deleteCalls = 0;
  installDubbingFetch(async (input, init = {}) => {
    if (init.method === "DELETE") {
      deleteCalls += 1;
      consentState = "revoking";
      return new Response(null, { status: 500 });
    }
    return Response.json(
      dubStatus(consentState, 4, dubIdFromPath(input)),
    );
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
      button(
        container,
        "Delete Mia's saved nursery-rhyme voice clips",
      ),
    ),
  );
  await click(
    button(
      container,
      "Delete Mia's saved nursery-rhyme voice clips",
    ),
  );

  await waitFor(() =>
    assert.ok(
      button(
        container,
        "Finish removing nursery-rhyme clips",
      ),
    ),
  );
  assert.equal(deleteCalls, 1);
  assert.match(
    container.querySelector('[role="alert"]')?.textContent ?? "",
    /Your saved nursery-rhyme voice clips were not deleted/,
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
  installDubbingFetch(async (input, init = {}) => {
    if (init.method === "DELETE") {
      deleteCalls += 1;
      if (deleteCalls === 1) return new Response(null, { status: 503 });
      cleanupRequired = false;
      return new Response(null, { status: 204 });
    }
    return cleanupRequired
      ? Response.json({ error: "dub_reset_in_progress" }, { status: 409 })
      : Response.json(dubStatus("granted", 0, dubIdFromPath(input)));
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
      button(
        container,
        "Finish removing nursery-rhyme clips",
      ),
    ),
  );
  assert.match(container.textContent, /Voice clip removal needs to finish/);
  assert.doesNotMatch(container.textContent, /Allow voice dubbing|Try again/);

  await click(
    button(
      container,
      "Finish removing nursery-rhyme clips",
    ),
  );
  await waitFor(() =>
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /Your saved nursery-rhyme voice clips were not deleted/,
    ),
  );
  assert.ok(
    button(
      container,
      "Finish removing nursery-rhyme clips",
    ),
  );
  assert.doesNotMatch(container.textContent, /Allow voice dubbing/);

  await click(
    button(
      container,
      "Finish removing nursery-rhyme clips",
    ),
  );
  await waitFor(() =>
    assert.match(container.textContent, /Voice dubbing is available/),
  );
  await waitFor(() =>
    assert.equal(
      document.activeElement?.textContent,
      "Voice dubbing is available",
    ),
  );
  assert.equal(deleteCalls, 2);
  assert.doesNotMatch(
    container.textContent,
    /Finish removing nursery-rhyme clips/,
  );
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

test("loads Noah's dubbing through explicit target requests only", async () => {
  const requests = [];
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
            deletionPending: false,
            id: "learner-mia",
            name: "Mia",
            profileStatus: "completed",
          },
          {
            age: 10,
            createdAt: "2026-08-02T08:00:00.000Z",
            deletionPending: false,
            id: "learner-noah",
            name: "Noah",
            profileStatus: "completed",
          },
        ],
      });
    }
    if (isDubPath(path, "learner-noah")) {
      return Response.json(
        dubStatus("granted", 0, dubIdFromPath(path)),
      );
    }
    if (isDubPath(path)) {
      return Response.json(dubStatus("granted", 0, dubIdFromPath(path)));
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
  await waitFor(() =>
    assert.match(container.textContent, /Voice dubbing is available/),
  );
  assert.match(container.textContent, /Back to guardian dashboard/);
  assert.doesNotMatch(container.textContent, /Manage learners/);
  assert.doesNotMatch(container.textContent, /Switch to .*start dubbing/);

  const dubRequests = requests.filter(({ path }) =>
    path.startsWith("/api/dubs/"),
  );
  assert.ok(dubRequests.length > 0);
  assert.ok(
    dubRequests.every(({ method, path }) =>
      method === "GET" && path.endsWith("?learnerProfileId=learner-noah"),
    ),
  );
  assert.equal(dubRequests.some(({ path }) => path.includes("/consent")), false);
});

test("keeps the dubbing shell and learner selector mounted while a new target loads", async () => {
  const noahStatus = deferred();
  globalThis.fetch = async (path) => {
    if (path === "/api/learner-profiles") {
      return Response.json(learnerRoster());
    }
    if (isDubPath(path, "learner-mia")) {
      return Response.json(dubStatus("granted", 4, dubIdFromPath(path)));
    }
    if (path === "/api/dubs/five-little-ducks-v2?learnerProfileId=learner-noah") {
      return noahStatus.promise;
    }
    if (isDubPath(path, "learner-noah")) {
      return Response.json(dubStatus("not_granted", 0, dubIdFromPath(path)));
    }
    throw new Error(`Unexpected request: ${path}`);
  };

  const container = await mountStrict(
    createElement(
      MemoryRouter,
      { initialEntries: ["/guardian/dubbing?learnerProfileId=learner-mia"] },
      createElement(
        GuardianProvider,
        { lockGuardianAccess: async () => ({ mode: "learner" }) },
        createElement(GuardianDubbingSettings),
      ),
    ),
  );

  await waitFor(() =>
    assert.match(container.textContent, /Delete Mia's saved nursery-rhyme voice clips/),
  );
  const main = container.querySelector("main");
  const noahButton = button(container, "Noah");
  assert.ok(main);
  noahButton.focus();
  act(() => noahButton.click());

  try {
    assert.ok(
      container.querySelector("main") === main,
      "Expected the route main landmark to remain mounted.",
    );
    assert.equal(noahButton.isConnected, true);
    assert.ok(
      document.activeElement === noahButton,
      "Expected focus to remain on the selected learner.",
    );
    assert.match(
      [...container.querySelectorAll('[role="status"]')].find((status) =>
        /Loading voice dubbing settings…/.test(status.textContent ?? ""),
      )?.textContent ?? "",
      /Loading voice dubbing settings…/,
    );
    assert.equal(
      [...container.querySelectorAll('[role="status"]')]
        .find((status) =>
          /Loading voice dubbing settings…/.test(status.textContent ?? ""),
        )
        ?.closest('[aria-busy="true"]') !== null,
      true,
    );
    assert.match(container.textContent, /Editing settings for Noah/);
    assert.doesNotMatch(container.textContent, /Delete Mia's saved nursery-rhyme voice clips/);
  } finally {
    await act(async () => {
      noahStatus.resolve(Response.json(dubStatus("not_granted")));
      await Promise.resolve();
    });
  }
});
