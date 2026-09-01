import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import test from "node:test";
import { createServer } from "vite";
import {
  cleanupMountedRoots,
  click,
  input,
  installDom,
  mountStrict,
  waitFor,
} from "./helpers/react-lifecycle.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const restoreDom = installDom();
const originalFetch = globalThis.fetch;
const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: projectRoot,
  server: { middlewareMode: true },
});

const managerModule = await vite
  .ssrLoadModule("/src/learner-profile/GuardianLearnerProfiles.tsx")
  .catch(() => ({}));
const { GuardianLearnerProfiles, GuardianLearnerProfilesView } = managerModule;
const { LearnerDeleteDialog } = await vite.ssrLoadModule(
  "/src/learner-profile/LearnerDeleteDialog.tsx",
);
const { GuardianLanguageProvider } = await vite.ssrLoadModule(
  "/src/i18n/guardian-language.tsx",
);
const { GuardianLanguageControl } = await vite.ssrLoadModule(
  "/src/i18n/GuardianLanguageControl.tsx",
);
const { AccountActionProvider } = await vite.ssrLoadModule(
  "/src/auth/account-actions.tsx",
);
const { LearnerProfileGate } = await vite.ssrLoadModule(
  "/src/learner-profile/LearnerProfileGate.tsx",
);
const detailsModule = await vite
  .ssrLoadModule("/src/learner-profile/GuardianLearnerDetails.tsx")
  .catch(() => ({}));
const { GuardianLearnerDetails } = detailsModule;
const { LearnerSelectionProvider, useLearnerSelection } =
  await vite.ssrLoadModule(
    "/src/learner-profile/LearnerProfileContext.tsx",
  );
const mia = {
  age: 6,
  createdAt: "2026-08-25T08:00:00.000Z",
  deletionPending: false,
  id: "learner-mia",
  name: "Mia",
  profileStatus: "completed",
};
const noah = {
  age: null,
  createdAt: "2026-08-26T08:00:00.000Z",
  deletionPending: false,
  id: "learner-noah",
  name: "Noah",
  profileStatus: "not_started",
};

test.afterEach(async () => {
  await cleanupMountedRoots();
  document.body.replaceChildren();
  globalThis.fetch = originalFetch;
});

test.after(async () => {
  await vite.close();
  restoreDom();
});

function roster(activeProfileId = mia.id, profiles = [mia, noah]) {
  return { activeProfileId, profiles };
}

function fullProfile(profile) {
  return {
    age: profile.age,
    answers: {
      legacyAnswers: null,
      questionnaireVersion: 2,
      responses: {},
      schemaVersion: 2,
    },
    completedAt:
      profile.profileStatus === "completed" ? "2026-08-25T08:00:00.000Z" : null,
    currentQuestionKey:
      profile.profileStatus === "completed" ? null : "preferred_name",
    description: null,
    id: profile.id,
    name: profile.name,
    profileStatus: profile.profileStatus,
    questionnaireVersion: 2,
    storyLevel: "first-words",
  };
}

function profileEditorState(profile) {
  return {
    profile: {
      ...fullProfile(profile),
      description: `${profile.name} likes space and dinosaurs.`,
      lessonRecordingCleanupPending: false,
      lessonRecordingConsent: false,
      answers: {
        ...fullProfile(profile).answers,
        responses: {
          favoriteAnimals: {
            acknowledgment: "Thank you!",
            answeredAt: "2026-08-26T08:00:00.000Z",
            enrichmentStatus: "generated",
            question: "What animals do you like?",
            rawAnswer: "Dinosaurs",
            summary: "Likes dinosaurs.",
          },
          favoriteCartoons: {
            acknowledgment: "Thank you!",
            answeredAt: "2026-08-26T08:00:00.000Z",
            enrichmentStatus: "generated",
            question: "What cartoons do you like?",
            rawAnswer: "Bluey",
            summary: "Likes Bluey.",
          },
        },
      },
    },
    questions: [
      {
        answerKey: "name",
        audio: null,
        maxLength: 120,
        position: 1,
        promptEn: "What name do you use?",
        promptZh: null,
        required: true,
      },
      {
        answerKey: "age",
        audio: null,
        maxLength: 120,
        position: 2,
        promptEn: "How old are you?",
        promptZh: null,
        required: true,
      },
      {
        answerKey: "favoriteAnimals",
        audio: null,
        maxLength: 300,
        position: 3,
        promptEn: "What animals do you like?",
        promptZh: "你喜欢什么动物？",
        required: false,
      },
      {
        answerKey: "favoriteCartoons",
        audio: null,
        maxLength: 300,
        position: 4,
        promptEn: "What cartoons do you like?",
        promptZh: "你喜欢什么动画片？",
        required: false,
      },
    ],
  };
}

function renderView(overrides = {}) {
  assert.equal(
    typeof GuardianLearnerProfilesView,
    "function",
    "Expected a rendered Guardian learner manager view",
  );
  const { language = "en", ...viewOverrides } = overrides;
  return renderToStaticMarkup(
    createElement(
      GuardianLanguageProvider,
      { initialLanguage: language, storage: null },
      createElement(
        MemoryRouter,
        { initialEntries: ["/guardian/learners"] },
        createElement(GuardianLearnerProfilesView, {
          error: null,
          isLoading: false,
          onAdd() {},
          onDelete: async () => null,
          onManage() {},
          onRetry() {},
          pendingProfileId: null,
          profiles: [mia, noah],
          statusMessage: null,
          ...viewOverrides,
        }),
      ),
    ),
  );
}

function button(container, accessibleName) {
  const normalize = (value) => value.replace(/[⁨⁩]/g, "");
  const match = [...container.querySelectorAll("button")].find(
    (candidate) =>
      normalize(candidate.getAttribute("aria-label") ?? "") ===
        normalize(accessibleName) ||
      normalize(candidate.textContent.trim()) === normalize(accessibleName),
  );
  assert.ok(match, `Expected button named "${accessibleName}".`);
  return match;
}

function LocationProbe() {
  const location = useLocation();
  return createElement(
    "output",
    { "aria-label": "Current route" },
    `${location.pathname}${location.search}`,
  );
}

function currentRoute(container) {
  return container.querySelector('output[aria-label="Current route"]')
    ?.textContent;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function managerHarness({
  deleteLearner = async () => roster(),
} = {}) {
  assert.equal(
    typeof GuardianLearnerProfiles,
    "function",
    "Expected an interactive Guardian learner manager",
  );
  return createElement(
    LearnerSelectionProvider,
    {
      activeProfileId: mia.id,
      async createAndSelectLearner() {
        throw new Error("Learner management must not select a learner.");
      },
      deleteLearner,
      async reloadSelectedLearner() {
        return fullProfile(mia);
      },
      async selectLearner() {
        throw new Error("Learner management must not select a learner.");
      },
    },
    createElement(
      MemoryRouter,
      { initialEntries: ["/guardian/learners"] },
      createElement(GuardianLearnerProfiles),
      createElement(LocationProbe),
    ),
  );
}

function learnerGateHarness({
  children = createElement("p", null, "SAFE CONTENT"),
  guardianAccessMode,
  guardianRoute,
  isProfileRoute = false,
  learnerManagerRoute = true,
}) {
  return createElement(
    AccountActionProvider,
    {
      profileAction: null,
      sessionIdentity: null,
      setProfileAction() {},
    },
    createElement(
      LearnerProfileGate,
      {
        completedLearnerProfileFallback: createElement("p", null, "HOME"),
        guardianAccessMode,
        guardianRoute,
        isConversationRoute: false,
        isLearnerProfileRoute: false,
        isProfileRoute,
        learnerManagerRoute,
        learnerSelectionDestination: "/",
        learnerProfileFallback: createElement("p", null, "SETUP"),
        onCloseProfileRoute() {},
        onConversationCompleted() {},
        onOpenLessons() {},
        onOpenProfileRoute() {},
        onRedoCompleted() {},
        onRedoLearnerProfileRoute() {},
        redoLearnerProfile: false,
      },
      children,
    ),
  );
}

function RealGateLearnerManager() {
  const { selectLearner } = useLearnerSelection();
  return createElement(
    "div",
    null,
    createElement(GuardianLearnerProfiles),
    createElement(
      "button",
      {
        onClick: () => void selectLearner(mia.id),
        type: "button",
      },
      "Select current learner again",
    ),
  );
}

function completedGateState() {
  return {
    canBypass: true,
    mode: "full",
    profile: fullProfile(mia),
    progress: { answered: 2, current: 2, total: 2 },
    question: null,
    questionnaire: { version: 2 },
  };
}

function detailsHarness({
  activeProfileId = mia.id,
  language = "en",
  learnerId = noah.id,
  reloadSelectedLearner = async () => fullProfile(mia),
} = {}) {
  assert.equal(
    typeof GuardianLearnerDetails,
    "function",
    "Expected an explicit Guardian learner details container",
  );
  return createElement(
    GuardianLanguageProvider,
    { initialLanguage: language, storage: null },
    createElement(
      LearnerSelectionProvider,
      {
        activeProfileId,
        async createAndSelectLearner() {
          throw new Error("Explicit learner details must not create a learner.");
        },
        reloadSelectedLearner,
        async selectLearner() {
          throw new Error("Explicit learner details must not select a learner.");
        },
      },
      createElement(
        MemoryRouter,
        { initialEntries: [`/guardian/learners/${learnerId}`] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            element: createElement(GuardianLearnerDetails),
            path: "/guardian/learners/:learnerId",
          }),
          createElement(Route, {
            element: createElement("p", null, "MANAGE LEARNERS"),
            path: "/guardian/learners",
          }),
        ),
        createElement(LocationProbe),
      ),
    ),
  );
}

test("learner manager exposes administrative profile controls only", () => {
  const html = renderView();

  assert.match(html, /<h1[^>]*>Manage learners<\/h1>/);
  assert.match(html, /<ul/);
  assert.equal((html.match(/<li/g) ?? []).length, 2);
  assert.match(html, /<h2[^>]*><bdi[^>]*>Mia<\/bdi><\/h2>/);
  assert.match(html, /<h2[^>]*><bdi[^>]*>Noah<\/bdi><\/h2>/);
  assert.doesNotMatch(html, /Learner mode|Use .* in learner mode|Managing /);
  assert.match(html, /Age 6/);
  assert.match(html, /Setup complete/);
  assert.match(html, /Setup not started/);
  assert.match(html, /aria-label="Edit ⁨Mia⁩&#x27;s profile"/);
  assert.match(html, /aria-label="Delete ⁨Mia⁩"/);
  assert.match(html, /aria-label="Edit ⁨Noah⁩&#x27;s profile"/);
  assert.match(html, /aria-label="Delete ⁨Noah⁩"/);
  assert.match(
    html,
    /<label[^>]*for="preferred-name"[^>]*>Preferred name<\/label>/,
  );
  assert.match(html, /<input[^>]*id="preferred-name"/);
  assert.equal((html.match(/role="status"/g) ?? []).length, 1);
});

test("localizes the complete Guardian roster from semantic state", () => {
  const bob = {
    ...mia,
    age: 7,
    id: "learner-bob",
    name: "Bob",
    profileStatus: "completed",
  };
  const mary = {
    ...noah,
    id: "learner-mary",
    name: "Mary",
    profileStatus: "in_progress",
  };
  const rose = {
    ...noah,
    id: "learner-rose",
    name: "Rose",
  };
  const html = renderView({
    language: "zh-Hans",
    profiles: [bob, mary, rose],
  });

  assert.match(html, /aria-label="页面导航"/);
  assert.match(html, /<h1[^>]*>管理孩子<\/h1>/);
  assert.match(html, /7 岁/);
  assert.match(html, /年龄未填写/);
  assert.match(html, /设置已完成/);
  assert.match(html, /设置进行中/);
  assert.match(html, /尚未开始设置/);
  assert.match(html, /aria-label="编辑 ⁨Bob⁩ 的资料"/);
  assert.match(html, /aria-label="删除 ⁨Bob⁩"/);
  assert.match(html, /添加孩子/);
  assert.match(html, /<label[^>]*for="preferred-name"[^>]*>常用名<\/label>/);

  const loading = renderView({ isLoading: true, language: "zh-Hans" });
  assert.match(loading, /正在加载孩子资料…/);
  const failed = renderView({
    error: "load-failed",
    language: "zh-Hans",
    profiles: [],
  });
  assert.match(failed, /无法加载孩子资料/);
  assert.match(failed, />重试<\/button>/);
  const adding = renderView({
    language: "zh-Hans",
    pendingProfileId: "__new-learner__",
  });
  assert.match(adding, /正在添加孩子…/);
});

test("localizes every roster deletion state without exposing supplied server text", () => {
  const errors = [
    ["last-learner", /请先添加另一位孩子/],
    ["learner-busy", /请先结束这位孩子当前的对话/],
    ["cleanup-pending", /清理仍在进行中/],
    ["deletion-uncertain", /无法确认.*是否已删除/],
    ["delete-failed", /未能删除/],
    ["add-failed", /无法添加孩子/],
  ];
  for (const [error, expected] of errors) {
    const html = renderView({ error, language: "zh-Hans" });
    assert.match(html, expected);
    assert.doesNotMatch(html, /SERVER/);
  }
  const deleted = renderView({
    language: "zh-Hans",
    statusMessage: { kind: "deleted", learnerName: "Bob" },
  });
  assert.match(deleted, /<bdi[^>]*dir="auto"[^>]*>Bob<\/bdi> 已删除/);
});

test("retranslates a failed delete dialog without changing its learner or focus", async () => {
  let deletionCalls = 0;
  const container = await mountStrict(
    createElement(
      GuardianLanguageProvider,
      { initialLanguage: "en", storage: null },
      createElement(LearnerDeleteDialog, {
        onClose() {},
        async onDelete() {
          deletionCalls += 1;
          return "learner-busy";
        },
        profile: { ...mia, id: "learner-bob", name: "Bob" },
      }),
    ),
  );

  const dialog = container.querySelector('[role="dialog"]');
  assert.equal(dialog?.getAttribute("lang"), "en");
  assert.match(dialog?.textContent ?? "", /Cannot be undone/);
  await click(button(dialog, "Delete Bob"));
  await waitFor(() =>
    assert.match(
      dialog.querySelector('[role="alert"]')?.textContent ?? "",
      /current conversation/,
    ),
  );
  assert.equal(
    dialog.querySelector('[role="alert"]')?.textContent,
    "Could not delete Bob. Finish this learner's current conversation, then try again.",
  );

  const chinese = button(dialog, "中文");
  chinese.focus();
  await click(chinese);
  assert.equal(container.querySelector('[role="dialog"]'), dialog);
  assert.equal(dialog.getAttribute("lang"), "zh-Hans");
  assert.equal(document.activeElement, chinese);
  assert.equal(dialog.querySelector("bdi")?.textContent, "Bob");
  assert.equal(deletionCalls, 1);
  assert.equal(
    dialog.querySelector('[role="alert"]')?.textContent,
    "无法删除 Bob。请先结束这位孩子当前的对话，然后重试。",
  );
  assert.equal(chinese.closest("fieldset"), null);
});

test("turns a malformed roster success into a retryable manager error", async () => {
  let validResponse = false;
  globalThis.fetch = async (input, init = {}) => {
    assert.equal(String(input), "/api/learner-profiles");
    assert.equal(init.method, "GET");
    return Response.json(
      validResponse ? roster() : { activeProfileId: mia.id, profiles: null },
    );
  };

  const container = await mountStrict(
    managerHarness({
      async reloadSelectedLearner() {
        return fullProfile(mia);
      },
    }),
  );

  await waitFor(() => {
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /learner profiles could not be loaded/i,
    );
    button(container, "Try again");
  });
  validResponse = true;
  await click(button(container, "Try again"));
  await waitFor(() => button(container, "Delete Noah"));
});

test("cancelling learner deletion preserves data and restores focus", async () => {
  const deletions = [];
  const container = await mountStrict(
    createElement(
      MemoryRouter,
      { initialEntries: ["/guardian/learners"] },
      createElement(GuardianLearnerProfilesView, {
        error: "",
        isLoading: false,
        onAdd() {},
        onDelete(profile) {
          deletions.push(profile.id);
        },
        onManage() {},
        onRetry() {},
        pendingProfileId: null,
        profiles: [mia, noah],
        statusMessage: "",
      }),
    ),
  );

  const deleteNoah = button(container, "Delete Noah");
  deleteNoah.focus();
  await click(deleteNoah);
  await waitFor(() => {
    const dialog = container.querySelector('[role="dialog"]');
    assert.equal(dialog?.getAttribute("aria-modal"), "true");
    assert.match(dialog?.textContent ?? "", /Delete Noah\?/);
  });
  await click(button(container, "Cancel"));

  await waitFor(() => {
    assert.equal(deletions.length, 0);
    assert.equal(container.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, deleteNoah);
  });
});

test("deletes through learner context and applies the authoritative roster", async () => {
  const deletedIds = [];
  globalThis.fetch = async (input, init = {}) => {
    assert.equal(String(input), "/api/learner-profiles");
    assert.equal(init.method, "GET");
    return Response.json(roster());
  };
  const remaining = roster(mia.id, [mia]);
  const container = await mountStrict(
    managerHarness({
      async deleteLearner(profileId) {
        deletedIds.push(profileId);
        return remaining;
      },
    }),
  );

  await waitFor(() => button(container, "Delete Noah"));
  await click(button(container, "Delete Noah"));
  await click(button(container.querySelector('[role="dialog"]'), "Delete Noah"));

  await waitFor(() => {
    assert.deepEqual(deletedIds, [noah.id]);
    assert.equal(container.querySelector('[role="dialog"]'), null);
    assert.equal(
      [...container.querySelectorAll("h2")].some(
        (heading) => heading.textContent === noah.name,
      ),
      false,
    );
  });
});

test("keeps a deleted status through real Gate mutation revisions only", async () => {
  const remaining = roster(mia.id, [mia]);
  const heldRefresh = deferred();
  let deleteRequests = 0;
  let learnerReads = 0;
  let postDeleteRosterReads = 0;
  let selectionRequests = 0;
  let deletionSettled = false;
  globalThis.fetch = async (input, init = {}) => {
    const path = String(input);
    if (path === "/api/learner-profile" && init.method === "GET") {
      learnerReads += 1;
      return Response.json(completedGateState());
    }
    if (path === "/api/learner-profiles" && init.method === "GET") {
      if (!deletionSettled) return Response.json(roster());
      postDeleteRosterReads += 1;
      return postDeleteRosterReads === 1
        ? heldRefresh.promise
        : Response.json(remaining);
    }
    if (
      path === "/api/learner-profiles/learner-noah" &&
      init.method === "DELETE"
    ) {
      deleteRequests += 1;
      deletionSettled = true;
      return Response.json(remaining);
    }
    if (
      path === "/api/learner-profiles/learner-mia/active" &&
      init.method === "PUT"
    ) {
      selectionRequests += 1;
      return Response.json(remaining);
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(
    createElement(
      GuardianLanguageProvider,
      { initialLanguage: "en", storage: null },
      createElement(
        "div",
        null,
        createElement(GuardianLanguageControl),
        createElement(
          MemoryRouter,
          { initialEntries: ["/guardian/learners"] },
          learnerGateHarness({
            children: createElement(RealGateLearnerManager),
            guardianAccessMode: "guardian",
            guardianRoute: true,
          }),
        ),
      ),
    ),
  );

  await waitFor(() =>
    assert.equal(button(container, "Delete Noah").closest("[inert]"), null),
  );
  await click(button(container, "Delete Noah"));
  await click(button(container.querySelector('[role="dialog"]'), "Delete Noah"));
  await waitFor(() => {
    assert.equal(deleteRequests, 1);
    assert.equal(postDeleteRosterReads, 1);
  });
  await act(async () => heldRefresh.resolve(Response.json(remaining)));
  await waitFor(() => {
    assert.equal(container.querySelector('[role="dialog"]'), null);
    assert.equal(
      container.querySelector('main [role="status"]')?.textContent.trim(),
      "Noah was deleted.",
    );
  });

  await click(button(container, "中文"));
  assert.equal(
    container.querySelector('main [role="status"]')?.textContent.trim(),
    "Noah 已删除。",
  );

  await click(button(container, "Select current learner again"));
  await waitFor(() => {
    assert.equal(deleteRequests, 1);
    assert.equal(selectionRequests, 1);
    assert.equal(postDeleteRosterReads, 2);
    assert.ok(learnerReads >= 2);
    assert.equal(
      container.querySelector('main [role="status"]')?.textContent.trim(),
      "",
    );
  });
});

test("retranslates stable Guardian learner identity checking and recovery", async () => {
  const heldRoster = deferred();
  let learnerReads = 0;
  let rosterReads = 0;
  globalThis.fetch = async (input, init = {}) => {
    const path = String(input);
    if (path === "/api/learner-profile" && init.method === "GET") {
      learnerReads += 1;
      return Response.json(completedGateState());
    }
    if (path === "/api/learner-profiles" && init.method === "GET") {
      rosterReads += 1;
      return rosterReads === 1
        ? heldRoster.promise
        : Response.json(roster(mia.id, [mia]));
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(
    createElement(
      GuardianLanguageProvider,
      { initialLanguage: "en", storage: null },
      createElement(
        "div",
        null,
        createElement(GuardianLanguageControl),
        learnerGateHarness({
          guardianAccessMode: "guardian",
          guardianRoute: true,
        }),
      ),
    ),
  );
  await waitFor(() => assert.match(container.textContent, /SAFE CONTENT/));
  await click(button(container, "中文"));

  await act(async () => window.dispatchEvent(new window.Event("focus")));
  await waitFor(() => {
    assert.equal(rosterReads, 1);
    assert.match(container.textContent, /正在检查当前孩子/);
    assert.doesNotMatch(container.textContent, /Checking the current learner/);
  });

  await act(async () =>
    heldRoster.resolve(
      Response.json({ message: "SERVER IDENTITY SENTENCE" }, { status: 503 }),
    ),
  );
  await waitFor(() => {
    assert.match(container.textContent, /无法确认当前孩子/);
    assert.match(container.textContent, /请重试.*正确的孩子/);
    button(container, "重试");
    assert.doesNotMatch(container.textContent, /SERVER IDENTITY SENTENCE/);
  });

  await click(button(container, "English"));
  assert.match(container.textContent, /couldn't verify the current learner/i);
  assert.doesNotMatch(container.textContent, /无法确认当前孩子/);
  assert.equal(rosterReads, 1);

  await click(button(container, "Try again"));
  await waitFor(() => {
    assert.equal(rosterReads, 2);
    assert.ok(learnerReads >= 2);
    assert.match(container.textContent, /SAFE CONTENT/);
    assert.doesNotMatch(container.textContent, /verify the current learner/i);
  });
});

test("keeps learner-route identity recovery English under a Chinese preference", async () => {
  const heldLearner = deferred();
  let holdNextLearnerRead = false;
  globalThis.fetch = async (input, init = {}) => {
    const path = String(input);
    if (path === "/api/learner-profile" && init.method === "GET") {
      if (holdNextLearnerRead) return heldLearner.promise;
      return Response.json(completedGateState());
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(
    createElement(
      GuardianLanguageProvider,
      { initialLanguage: "zh-Hans", storage: null },
      createElement(
        "div",
        null,
        createElement(GuardianLanguageControl),
        learnerGateHarness({
          guardianAccessMode: "learner",
          guardianRoute: false,
        }),
      ),
    ),
  );
  await waitFor(() => assert.match(container.textContent, /SAFE CONTENT/));
  holdNextLearnerRead = true;

  await act(async () => window.dispatchEvent(new window.Event("focus")));
  await waitFor(() => {
    assert.match(container.textContent, /Checking the current learner/);
    assert.doesNotMatch(container.textContent, /正在检查当前孩子/);
  });

  await act(async () =>
    heldLearner.resolve(
      Response.json({ message: "SERVER LEARNER SENTENCE" }, { status: 503 }),
    ),
  );
  await waitFor(() => {
    assert.match(container.textContent, /couldn't verify the current learner/i);
    button(container, "Try again");
    assert.doesNotMatch(
      container.textContent,
      /无法确认当前孩子|SERVER LEARNER SENTENCE/,
    );
  });
});

test("keeps the same delete dialog and pending learner after cleanup needs a retry", async () => {
  const attempts = [];
  globalThis.fetch = async (input, init = {}) => {
    assert.equal(String(input), "/api/learner-profiles");
    assert.equal(init.method, "GET");
    return Response.json(roster());
  };
  const pendingRoster = roster(mia.id, [
    mia,
    { ...noah, deletionPending: true },
  ]);
  const container = await mountStrict(
    managerHarness({
      async deleteLearner(profileId) {
        attempts.push(profileId);
        throw Object.assign(
          new Error("Learner cleanup is still in progress. Try again."),
          {
            code: "learner_deletion_pending",
            roster: pendingRoster,
          },
        );
      },
    }),
  );

  await waitFor(() => button(container, "Delete Noah"));
  await click(button(container, "Delete Noah"));
  const dialog = container.querySelector('[role="dialog"]');
  await click(button(dialog, "Delete Noah"));

  await waitFor(() => {
    assert.equal(container.querySelector('[role="dialog"]'), dialog);
    assert.match(
      dialog.querySelector('[role="alert"]')?.textContent ?? "",
      /cleanup is still in progress.*try again/i,
    );
    button(container, "Finish deleting Noah");
  });
  await click(button(dialog, "Delete Noah"));
  await waitFor(() => assert.deepEqual(attempts, [noah.id, noah.id]));
});

test("maps deletion conflicts and preserves the roster when deletion is uncertain", async () => {
  const failures = [
    {
      code: "last_learner",
      expected: /add another learner before deleting/i,
    },
    {
      code: "learner_busy",
      expected: /finish.*conversation.*try again/i,
    },
    {
      code: "learner_deletion_uncertain",
      expected: /couldn't confirm whether.*deleted/i,
    },
  ];

  for (const { code, expected } of failures) {
    globalThis.fetch = async () => Response.json(roster());
    const container = await mountStrict(
      managerHarness({
        async deleteLearner() {
          throw Object.assign(new Error("Transport details are private."), {
            code,
            status: code.startsWith("learner_") ? 409 : undefined,
          });
        },
      }),
    );

    await waitFor(() => button(container, "Delete Noah"));
    await click(button(container, "Delete Noah"));
    const dialog = container.querySelector('[role="dialog"]');
    await click(button(dialog, "Delete Noah"));
    await waitFor(() => {
      assert.equal(container.querySelector('[role="dialog"]'), dialog);
      assert.match(
        dialog.querySelector('[role="alert"]')?.textContent ?? "",
        expected,
      );
      assert.equal(
        [...container.querySelectorAll("h2")].some(
          (heading) => heading.textContent === noah.name,
        ),
        true,
      );
    });
    await cleanupMountedRoots();
    document.body.replaceChildren();
  }
});

test("suppresses duplicate deletion and disables background learner controls", async () => {
  const heldDelete = deferred();
  let deleteCalls = 0;
  globalThis.fetch = async () => Response.json(roster());
  const container = await mountStrict(
    managerHarness({
      deleteLearner() {
        deleteCalls += 1;
        return heldDelete.promise;
      },
    }),
  );

  await waitFor(() => button(container, "Delete Noah"));
  await click(button(container, "Delete Noah"));
  const dialog = container.querySelector('[role="dialog"]');
  const confirm = button(dialog, "Delete Noah");
  act(() => {
    confirm.click();
    confirm.click();
  });

  await waitFor(() => {
    assert.equal(deleteCalls, 1);
    assert.equal(button(container, "Edit Mia's profile").disabled, true);
    assert.equal(container.querySelector("#preferred-name")?.disabled, true);
  });

  await act(async () => heldDelete.resolve(roster(mia.id, [mia])));
  await waitFor(() => assert.equal(container.querySelector('[role="dialog"]'), null));
});

test("final learner deletion is disabled and a pending learner can only finish deletion", () => {
  const html = renderView({
    profiles: [
      { ...mia, deletionPending: true },
      { ...noah, deletionPending: false },
    ],
  });
  assert.match(html, /Finish deleting <bdi[^>]*dir="auto"[^>]*>Mia<\/bdi>/);
  assert.doesNotMatch(html, /aria-label="Edit ⁨Mia⁩&#x27;s profile"/);

  const finalLearnerHtml = renderView({ profiles: [{ ...mia, deletionPending: false }] });
  assert.match(
    finalLearnerHtml,
    /aria-label="Delete ⁨Mia⁩"[^>]*disabled=""/,
  );
  assert.match(
    finalLearnerHtml,
    /Add another learner before deleting <bdi[^>]*dir="auto"[^>]*>Mia<\/bdi>\./,
  );
});

test("isolates learner names in visible deletion copy", () => {
  const name = "م".repeat(120);
  const finalLearnerHtml = renderView({
    profiles: [{ ...mia, deletionPending: false, name }],
  });
  const pendingLearnerHtml = renderView({
    profiles: [
      { ...mia, deletionPending: true, name },
      { ...noah, deletionPending: false },
    ],
  });
  const dialogHtml = renderToStaticMarkup(
    createElement(LearnerDeleteDialog, {
      onClose() {},
      onDelete() {},
      profile: { ...mia, name },
    }),
  );

  assert.match(
    finalLearnerHtml,
    /Add another learner before deleting <bdi[^>]*dir="auto"[^>]*>م{120}<\/bdi>\./,
  );
  assert.match(
    pendingLearnerHtml,
    /Finish deleting <bdi[^>]*dir="auto"[^>]*>م{120}<\/bdi>/,
  );
  assert.match(
    dialogHtml,
    /Delete <bdi[^>]*dir="auto"[^>]*>م{120}<\/bdi>\?/,
  );
  assert.match(
    dialogHtml,
    /This removes <bdi[^>]*dir="auto"[^>]*>م{120}<\/bdi>(?:'|&#x27;)s learner profile/,
  );
  assert.match(
    dialogHtml,
    /Delete <bdi[^>]*dir="auto"[^>]*>م{120}<\/bdi><\/span>/,
  );
});

test("isolates the learner name in deletion error copy", async () => {
  const name = "م".repeat(120);
  const container = await mountStrict(
    createElement(LearnerDeleteDialog, {
      onClose() {},
      async onDelete() {
        return "delete-failed";
      },
      profile: { ...mia, name },
    }),
  );

  await click(button(container, `Delete ${name}`));
  await waitFor(() => {
    const alert = container.querySelector('[role="alert"]');
    assert.match(alert?.textContent ?? "", /Could not delete/);
    assert.equal(
      alert?.querySelector('bdi[dir="auto"]')?.textContent,
      name,
    );
  });
});

test("editing an inactive learner navigates by ID", async () => {
  globalThis.fetch = async (input, init = {}) => {
    const path = String(input);
    if (path === "/api/learner-profiles" && init.method === "GET") {
      return Response.json(roster());
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(managerHarness());
  await waitFor(() => button(container, "Edit Noah's profile"));
  await click(button(container, "Edit Noah's profile"));

  await waitFor(() => {
    assert.equal(
      currentRoute(container),
      "/guardian/learners/learner-noah",
    );
  });
});

test("adding a managed learner preserves learner mode and opens the new ID route", async () => {
  const ava = {
    age: null,
    createdAt: "2026-08-27T08:00:00.000Z",
    deletionPending: false,
    id: "learner-ava",
    name: "Ava",
    profileStatus: "not_started",
  };
  globalThis.fetch = async (request, init = {}) => {
    const path = String(request);
    if (path === "/api/learner-profiles" && init.method === "GET") {
      return Response.json(roster());
    }
    if (path === "/api/learner-profiles" && init.method === "POST") {
      assert.deepEqual(JSON.parse(init.body), {
        activate: false,
        name: "Ava",
      });
      return Response.json({
        ...roster(mia.id, [mia, noah, ava]),
        createdProfileId: ava.id,
      });
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(managerHarness());
  await waitFor(() => button(container, "Add learner"));
  await input(container.querySelector("#preferred-name"), "  Ava  ");
  await click(button(container, "Add learner"));

  await waitFor(() => {
    assert.equal(
      currentRoute(container),
      "/guardian/learners/learner-ava",
    );
  });
});

async function assertConcurrentManagedAdds(names) {
  const sam = {
    ...mia,
    id: "learner-sam",
    name: "Sam",
  };
  const created = names.map((name, index) => ({
    ...noah,
    createdAt: `2026-08-27T08:00:0${index}.000Z`,
    id: `learner-created-${index + 1}`,
    name,
  }));
  const initialRoster = roster(sam.id, [sam]);
  const finalRoster = roster(sam.id, [sam, ...created]);
  const posts = [];
  const bothPostsStarted = deferred();
  globalThis.fetch = async (request, init = {}) => {
    const path = String(request);
    if (path === "/api/learner-profiles" && init.method === "GET") {
      return Response.json(posts.length ? finalRoster : initialRoster);
    }
    if (path === "/api/learner-profiles" && init.method === "POST") {
      const body = JSON.parse(init.body);
      const index = posts.length;
      posts.push(body);
      if (posts.length === 2) bothPostsStarted.resolve();
      await bothPostsStarted.promise;
      return Response.json({
        ...finalRoster,
        createdProfileId: created[index].id,
      });
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const first = await mountStrict(managerHarness());
  const second = await mountStrict(managerHarness());
  await waitFor(() => {
    button(first, "Add learner");
    button(second, "Add learner");
  });
  await input(first.querySelector("#preferred-name"), names[0]);
  await input(second.querySelector("#preferred-name"), names[1]);
  await click(button(first, "Add learner"));
  await click(button(second, "Add learner"));

  await waitFor(() => {
    assert.equal(currentRoute(first), `/guardian/learners/${created[0].id}`);
    assert.equal(currentRoute(second), `/guardian/learners/${created[1].id}`);
  });
  assert.deepEqual(posts, [
    { activate: false, name: names[0] },
    { activate: false, name: names[1] },
  ]);
}

test("concurrent managers open their own distinct-name learner details", async () => {
  await assertConcurrentManagedAdds(["Bob", "Mary"]);
});

test("concurrent managers open their own same-name learner details", async () => {
  await assertConcurrentManagedAdds(["Bob", "Bob"]);
});

test("loads and saves inactive learner details by ID without changing learner mode", async () => {
  const requests = [];
  let reloadCalls = 0;
  globalThis.fetch = async (request, init = {}) => {
    const path = String(request);
    requests.push({ body: init.body, method: init.method, path });
    if (
      path === "/api/profile?learnerProfileId=learner-noah" &&
      init.method === "GET"
    ) {
      return Response.json(profileEditorState(noah));
    }
    if (
      path === "/api/profile?learnerProfileId=learner-noah" &&
      init.method === "PUT"
    ) {
      return Response.json(profileEditorState(noah));
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(
    detailsHarness({
      async reloadSelectedLearner() {
        reloadCalls += 1;
        return fullProfile(noah);
      },
    }),
  );

  await waitFor(() => {
    assert.equal(container.querySelector("#profile-name")?.value, "Noah");
    assert.equal(container.querySelector("#profile-age")?.value, "");
    assert.equal(
      container.querySelector("#profile-favoriteAnimals")?.value,
      "Dinosaurs",
    );
    assert.equal(
      container.querySelector("#profile-favoriteCartoons")?.value,
      "Bluey",
    );
  });
  assert.match(container.textContent, /What animals do you like\?/);
  assert.match(container.textContent, /你喜欢什么动物？/);
  assert.doesNotMatch(container.textContent, /Redo learner setup/);

  await input(
    container.querySelector("#profile-favoriteAnimals"),
    "Dinosaurs and parrots",
  );
  await click(button(container, "Save changes"));

  await waitFor(() =>
    assert.equal(currentRoute(container), "/guardian/learners"),
  );
  assert.equal(reloadCalls, 0);
  const saveRequest = requests.find(({ method }) => method === "PUT");
  assert.ok(saveRequest);
  assert.deepEqual(JSON.parse(saveRequest.body), {
    answers: {
      age: "",
      description: "Noah likes space and dinosaurs.",
      favoriteAnimals: "Dinosaurs and parrots",
      favoriteCartoons: "Bluey",
      name: "Noah",
    },
  });
  assert.equal(
    requests.some(({ path }) => path.includes("/active")),
    false,
  );
});

test("pending learner detail loads keep the localized manager destination", async () => {
  globalThis.fetch = async () => new Promise(() => {});

  const english = await mountStrict(detailsHarness());
  const chinese = await mountStrict(detailsHarness({ language: "zh-Hans" }));

  await waitFor(() => {
    assert.match(english.textContent, /Loading learner details/);
    const englishBack = [...english.querySelectorAll("a")].find(
      (link) => link.textContent === "Back to Manage learners",
    );
    assert.equal(englishBack?.getAttribute("href"), "/guardian/learners");
    assert.doesNotMatch(english.textContent, /Back to home/);

    assert.match(chinese.textContent, /正在加载孩子资料/);
    const chineseBack = [...chinese.querySelectorAll("a")].find(
      (link) => link.textContent === "返回管理孩子",
    );
    assert.equal(chineseBack?.getAttribute("href"), "/guardian/learners");
    assert.doesNotMatch(chinese.textContent, /Back to home/);
  });
});

test("Chinese explicit learner details localize a null learner fallback", async () => {
  const unnamed = { ...noah, name: null };
  globalThis.fetch = async (request, init = {}) => {
    const path = String(request);
    if (
      path === "/api/profile?learnerProfileId=learner-noah" &&
      init.method === "GET"
    ) {
      return Response.json(profileEditorState(unnamed));
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(detailsHarness({ language: "zh-Hans" }));
  await waitFor(() =>
    assert.equal(container.querySelector("#profile-name")?.value, ""),
  );

  assert.match(container.textContent, /正在管理 这位孩子/);
  assert.match(container.textContent, /关于 这位孩子/);
  assert.doesNotMatch(container.textContent, /正在管理 Learner/);
});

test("Chinese Guardian profile editing localizes a blank learner fallback", async () => {
  const unnamed = { ...mia, name: "   " };
  globalThis.fetch = async (input, init = {}) => {
    const path = String(input);
    if (path === "/api/learner-profile" && init.method === "GET") {
      return Response.json({
        ...completedGateState(),
        profile: fullProfile(unnamed),
      });
    }
    if (path === "/api/profile" && init.method === "GET") {
      return Response.json(profileEditorState(unnamed));
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(
    createElement(
      GuardianLanguageProvider,
      { initialLanguage: "zh-Hans", storage: null },
      learnerGateHarness({
        guardianAccessMode: "guardian",
        guardianRoute: true,
        isProfileRoute: true,
        learnerManagerRoute: false,
      }),
    ),
  );
  await waitFor(() =>
    assert.equal(container.querySelector("#profile-name")?.value, "   "),
  );

  assert.match(container.textContent, /正在管理 这位孩子/);
  assert.match(container.textContent, /关于 这位孩子/);
  assert.doesNotMatch(container.textContent, /正在管理 Learner/);
});

test("localizes learner detail loading recovery from stable errors", async () => {
  globalThis.fetch = async () => {
    throw new Error("SERVER SENTENCE MUST STAY PRIVATE");
  };
  const container = await mountStrict(
    detailsHarness({ language: "zh-Hans", learnerId: "learner-bob" }),
  );

  await waitFor(() => {
    assert.match(container.textContent, /孩子资料暂时无法使用/);
    assert.match(container.textContent, /无法加载孩子资料/);
    button(container, "重试");
    assert.match(container.textContent, /返回管理孩子/);
    assert.doesNotMatch(container.textContent, /SERVER SENTENCE/);
  });
});

test("targets recording deletion at an explicit learner without selecting them", async () => {
  let reloadCalls = 0;
  const consentBodies = [];
  window.confirm = () => true;
  globalThis.fetch = async (request, init = {}) => {
    const path = String(request);
    if (
      path === "/api/profile?learnerProfileId=learner-noah" &&
      init.method === "GET"
    ) {
      return Response.json(profileEditorState(noah));
    }
    if (
      path ===
        "/api/profile/lesson-recording-consent?learnerProfileId=learner-noah" &&
      init.method === "PUT"
    ) {
      consentBodies.push(JSON.parse(init.body));
      return Response.json({ cleanupPending: false, enabled: false });
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(
    detailsHarness({
      async reloadSelectedLearner() {
        reloadCalls += 1;
        return fullProfile(noah);
      },
    }),
  );
  await waitFor(() => button(container, "Delete saved lesson recordings"));
  await click(button(container, "Delete saved lesson recordings"));
  await waitFor(() =>
    assert.match(
      container.querySelector('[role="status"]')?.textContent ?? "",
      /available automatically/,
    ),
  );

  assert.deepEqual(consentBodies, [{ enabled: false }]);
  assert.equal(reloadCalls, 0);
  assert.equal(currentRoute(container), "/guardian/learners/learner-noah");
});

test("refreshes active learner context after targeted recording deletion", async () => {
  const reloads = [];
  window.confirm = () => true;
  globalThis.fetch = async (request, init = {}) => {
    const path = String(request);
    if (
      path === "/api/profile?learnerProfileId=learner-mia" &&
      init.method === "GET"
    ) {
      return Response.json(profileEditorState(mia));
    }
    if (
      path ===
        "/api/profile/lesson-recording-consent?learnerProfileId=learner-mia" &&
      init.method === "PUT"
    ) {
      return Response.json({ cleanupPending: false, enabled: false });
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(
    detailsHarness({
      activeProfileId: mia.id,
      learnerId: mia.id,
      async reloadSelectedLearner(id) {
        reloads.push(id);
        return fullProfile(mia);
      },
    }),
  );
  await waitFor(() => button(container, "Delete saved lesson recordings"));
  await click(button(container, "Delete saved lesson recordings"));
  await waitFor(() =>
    assert.match(
      container.querySelector('[role="status"]')?.textContent ?? "",
      /available automatically/,
    ),
  );

  assert.deepEqual(reloads, ["learner-mia"]);
  assert.equal(currentRoute(container), "/guardian/learners/learner-mia");
});
