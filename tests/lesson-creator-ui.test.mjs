import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, useLocation } from "react-router";
import test, { after, describe, it } from "node:test";
import { createServer } from "vite";
import { createLessonScript } from "./fixtures/lesson-script.mjs";
import {
  cleanupMountedRoots,
  click,
  input,
  installDom,
  mountStrict,
  waitFor,
} from "./helpers/react-lifecycle.mjs";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true },
});
const creatorModule = await vite
  .ssrLoadModule("/src/lessons/LessonCreator.tsx")
  .catch(() => ({}));
const scriptModule = await vite
  .ssrLoadModule("/src/lessons/lesson-creator-script.ts")
  .catch(() => ({}));
const { LessonCreator, LessonWarnings, TargetedLessonCreator } = creatorModule;
const { formatLessonScript, parseLessonScript } = scriptModule;
const restoreDom = installDom();
const originalFetch = globalThis.fetch;

after(async () => {
  await cleanupMountedRoots();
  globalThis.fetch = originalFetch;
  await vite.close();
  restoreDom();
});

test.afterEach(async () => {
  await cleanupMountedRoots();
  document.body.replaceChildren();
  globalThis.fetch = originalFetch;
});

function CurrentRoute() {
  const location = useLocation();
  return createElement(
    "output",
    { "aria-label": "Current route" },
    `${location.pathname}${location.search}`,
  );
}

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

function readyTarget() {
  const roster = learnerRoster();
  return {
    activeProfileId: roster.activeProfileId,
    error: "",
    learnerName: "Mia",
    learnerProfileId: "learner-mia",
    phase: "ready",
    profiles: roster.profiles,
    retry() {},
    select() {},
  };
}

function renderCreator(initialEntry) {
  assert.equal(
    typeof TargetedLessonCreator,
    "function",
    "Expected targeted LessonCreator view",
  );
  const url = new URL(initialEntry, "https://example.test");
  url.searchParams.set("learnerProfileId", "learner-mia");
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [`${url.pathname}${url.search}`] },
      createElement(TargetedLessonCreator, {
        learnerProfileId: "learner-mia",
        target: readyTarget(),
      }),
    ),
  );
}

test("custom lesson creation defaults to a simple AI path", () => {
  const html = renderCreator("/lessons/my/create");
  const tabList = html.match(/<div[^>]*role="tablist"[^>]*>/)?.[0];
  const generateTab = html.match(
    /<button[^>]*>[\s\S]*?Make with AI<\/button>/,
  )?.[0];

  assert.match(html, /<h1[^>]*>Create a custom lesson<\/h1>/);
  assert.match(html, /Editing settings for Mia/);
  assert.match(html, /Noah/);
  assert.match(html, /grown-up/i);
  assert.ok(tabList);
  assert.match(tabList, /role="tablist"/);
  assert.match(tabList, /aria-label="Choose how to create a custom lesson"/);
  assert.ok(generateTab);
  assert.match(generateTab, /role="tab"/);
  assert.match(generateTab, /aria-selected="true"/);
  assert.match(html, /role="tab"[\s\S]*?Import JSON<\/button>/);
  assert.match(html, /<label[^>]*for="lesson-topic"[^>]*>.*lesson.*about/is);
  assert.match(html, /<textarea[^>]*id="lesson-topic"[^>]*maxlength="500"/i);
  assert.match(
    html,
    /<button[^>]*type="submit"[^>]*>[\s\S]*?Make lesson<\/button>/,
  );
  assert.doesNotMatch(html, /id="lesson-script-editor"|Review script/i);
  assert.doesNotMatch(html, /type="file"/);
  assert.match(
    html,
    /<a[^>]*aria-label="Back to lessons"[^>]*href="\/guardian\/lessons\?learnerProfileId=learner-mia"/,
  );
});

test("the import query reveals the advanced clipboard-paste panel", () => {
  const html = renderCreator("/lessons/my/create?tab=upload");
  const uploadTab = [...html.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)]
    .map(([button]) => button)
    .find((button) => button.includes("Import JSON"));
  const uploadPanel = html.match(
    /<section[^>]*id="lesson-creator-panel"[^>]*>/,
  )?.[0];

  assert.ok(uploadTab);
  assert.match(uploadTab, /role="tab"/);
  assert.match(uploadTab, /aria-selected="true"/);
  assert.ok(uploadPanel);
  assert.match(uploadPanel, /role="tabpanel"/);
  assert.match(uploadPanel, /aria-labelledby="upload-script-tab"/);
  assert.match(html, /Paste from clipboard/i);
  assert.match(html, /paste.*lesson JSON.*editor/i);
  assert.match(
    html,
    /<textarea[^>]*id="lesson-script-editor"[^>]*spellcheck="false"/i,
  );
  assert.match(html, /Review script/i);
  assert.doesNotMatch(html, /type="file"/);
  assert.doesNotMatch(html, /id="lesson-topic"/);
});

test("saving a custom lesson returns to Guardian lessons", async () => {
  const lesson = createLessonScript();
  globalThis.fetch = async (path, init = {}) => {
    if (
      path === "/api/lessons/my/generate?learnerProfileId=learner-mia" &&
      init.method === "POST"
    ) {
      return Response.json({ lesson, warnings: [] });
    }
    if (
      path === "/api/lessons/my?learnerProfileId=learner-mia" &&
      init.method === "POST"
    ) {
      return Response.json({
        lesson: { id: "garden-help", lesson, source: "generated" },
      });
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  await mountStrict(
    createElement(
      MemoryRouter,
      {
        initialEntries: ["/lessons/my/create?learnerProfileId=learner-mia"],
      },
      createElement(TargetedLessonCreator, {
        learnerProfileId: "learner-mia",
        target: readyTarget(),
      }),
      createElement(CurrentRoute),
    ),
  );

  await input(document.querySelector("#lesson-topic"), "Garden help");
  await click(
    [...document.querySelectorAll("button")].find(
      (candidate) => candidate.textContent.trim() === "Make lesson",
    ),
  );
  await waitFor(() =>
    assert.ok(
      [...document.querySelectorAll("button")].find(
        (candidate) => candidate.textContent.trim() === "Save lesson",
      ),
    ),
  );
  await click(
    [...document.querySelectorAll("button")].find(
      (candidate) => candidate.textContent.trim() === "Save lesson",
    ),
  );
  await waitFor(() =>
    assert.equal(
      document.querySelector('output[aria-label="Current route"]').textContent,
      "/guardian/lessons?learnerProfileId=learner-mia",
    ),
  );
});

test("preserves Noah's target through tabs, generation, save, and return navigation", async () => {
  const lesson = createLessonScript({ title: "Noah's garden lesson" });
  const requests = [];
  globalThis.fetch = async (path, init = {}) => {
    requests.push({ method: init.method ?? "GET", path });
    if (path === "/api/learner-profiles") {
      return Response.json(learnerRoster());
    }
    if (
      path === "/api/lessons/my/generate?learnerProfileId=learner-noah" &&
      init.method === "POST"
    ) {
      return Response.json({ lesson, warnings: [] });
    }
    if (
      path === "/api/lessons/my?learnerProfileId=learner-noah" &&
      init.method === "POST"
    ) {
      return Response.json({
        lesson: {
          id: "noah-garden",
          lesson,
          revision: "a".repeat(64),
          source: "generated",
        },
      });
    }
    if (path === "/api/lessons/my/generate" && init.method === "POST") {
      return Response.json({ lesson, warnings: [] });
    }
    if (path === "/api/lessons/my" && init.method === "POST") {
      return Response.json({
        lesson: {
          id: "mia-garden",
          lesson,
          revision: "a".repeat(64),
          source: "generated",
        },
      });
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(
    createElement(
      MemoryRouter,
      {
        initialEntries: ["/lessons/my/create?learnerProfileId=learner-noah"],
      },
      createElement(LessonCreator, { learnerName: "Mia" }),
      createElement(CurrentRoute),
    ),
  );

  await waitFor(() =>
    assert.match(container.textContent, /Editing settings for Noah/),
  );
  await click(
    [...container.querySelectorAll('[role="tab"]')].find((candidate) =>
      candidate.textContent.includes("Import JSON"),
    ),
  );
  assert.match(
    container.querySelector('output[aria-label="Current route"]')
      ?.textContent ?? "",
    /tab=upload.*learnerProfileId=learner-noah|learnerProfileId=learner-noah.*tab=upload/,
  );
  await click(
    [...container.querySelectorAll('[role="tab"]')].find((candidate) =>
      candidate.textContent.includes("Make with AI"),
    ),
  );
  await input(container.querySelector("#lesson-topic"), "Garden help");
  await click(
    [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent.trim() === "Make lesson",
    ),
  );
  await waitFor(() =>
    assert.ok(
      [...container.querySelectorAll("button")].find(
        (candidate) => candidate.textContent.trim() === "Save lesson",
      ),
    ),
  );
  await click(
    [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent.trim() === "Save lesson",
    ),
  );
  await waitFor(() =>
    assert.equal(
      container.querySelector('output[aria-label="Current route"]')
        ?.textContent,
      "/guardian/lessons?learnerProfileId=learner-noah",
    ),
  );
  const featureRequests = requests.filter(({ path }) =>
    path.startsWith("/api/lessons/my"),
  );
  assert.deepEqual(
    featureRequests.map(({ path }) => path),
    [
      "/api/lessons/my/generate?learnerProfileId=learner-noah",
      "/api/lessons/my?learnerProfileId=learner-noah",
    ],
  );
});

test("switching learner keeps the creator shell focused while clearing the previous draft", async () => {
  const lesson = createLessonScript({ title: "Private garden draft" });
  globalThis.fetch = async (path, init = {}) => {
    if (path === "/api/learner-profiles") return Response.json(learnerRoster());
    if (
      path === "/api/lessons/my/generate?learnerProfileId=learner-mia" &&
      init.method === "POST"
    ) {
      return Response.json({ lesson, warnings: [] });
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };

  const container = await mountStrict(
    createElement(
      MemoryRouter,
      { initialEntries: ["/lessons/my/create?learnerProfileId=learner-mia"] },
      createElement(LessonCreator, { learnerName: "Mia" }),
    ),
  );

  await waitFor(() => assert.match(container.textContent, /Editing settings for Mia/));
  const shell = container.querySelector("main");
  const noahTarget = container.querySelector('button[aria-label="Noah"]');
  assert.ok(shell instanceof HTMLElement);
  assert.ok(noahTarget instanceof HTMLElement);

  await input(container.querySelector("#lesson-topic"), "A private garden draft");
  await click(
    [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent.trim() === "Make lesson",
    ),
  );
  await waitFor(() =>
    assert.ok(
      [...container.querySelectorAll("button")].some(
        (candidate) => candidate.textContent.trim() === "Save lesson",
      ),
    ),
  );

  noahTarget.focus();
  await click(noahTarget);
  await waitFor(() => assert.match(container.textContent, /Editing settings for Noah/));

  assert.ok(
    container.querySelector("main") === shell,
    "The creator main shell must remain mounted.",
  );
  assert.equal(shell.isConnected, true);
  assert.ok(
    container.querySelector('button[aria-label="Noah"]') === noahTarget,
    "The selected learner button must remain mounted.",
  );
  assert.equal(noahTarget.isConnected, true);
  assert.equal(document.activeElement, noahTarget);
  assert.equal(container.querySelector("#lesson-topic")?.value, "");
  assert.equal(
    [...container.querySelectorAll("button")].some(
      (candidate) => candidate.textContent.trim() === "Save lesson",
    ),
    false,
  );
});

test("normalizes a missing create target before enabling lesson generation", async () => {
  const lesson = createLessonScript();
  const requests = [];
  globalThis.fetch = async (path, init = {}) => {
    requests.push({ method: init.method ?? "GET", path });
    if (path === "/api/learner-profiles") {
      return Response.json(learnerRoster());
    }
    if (
      path === "/api/lessons/my/generate?learnerProfileId=learner-mia" &&
      init.method === "POST"
    ) {
      return Response.json({ lesson, warnings: [] });
    }
    if (path === "/api/lessons/my/generate" && init.method === "POST") {
      return Response.json({ lesson, warnings: [] });
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };
  const container = await mountStrict(
    createElement(
      MemoryRouter,
      { initialEntries: ["/lessons/my/create"] },
      createElement(LessonCreator, { learnerName: "Mia" }),
      createElement(CurrentRoute),
    ),
  );

  await waitFor(() =>
    assert.equal(
      container.querySelector('output[aria-label="Current route"]')
        ?.textContent,
      "/lessons/my/create?learnerProfileId=learner-mia",
    ),
  );
  await input(container.querySelector("#lesson-topic"), "Garden help");
  await click(
    [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent.trim() === "Make lesson",
    ),
  );
  await waitFor(() =>
    assert.ok(
      requests.some(
        ({ path }) =>
          path === "/api/lessons/my/generate?learnerProfileId=learner-mia",
      ),
    ),
  );
  assert.equal(
    requests.some(({ path }) => path === "/api/lessons/my/generate"),
    false,
  );
});

test("an invalid create target hides authoring and never makes a feature request", async () => {
  const requests = [];
  globalThis.fetch = async (path, init = {}) => {
    requests.push({ method: init.method ?? "GET", path });
    if (path === "/api/learner-profiles") {
      return Response.json(learnerRoster());
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };
  const container = await mountStrict(
    createElement(
      MemoryRouter,
      {
        initialEntries: ["/lessons/my/create?learnerProfileId=missing-learner"],
      },
      createElement(LessonCreator, { learnerName: "Mia" }),
    ),
  );

  await waitFor(() =>
    assert.match(
      container.textContent,
      /target in this page link could not be found/i,
    ),
  );
  assert.equal(container.querySelector("#lesson-topic"), null);
  assert.deepEqual(
    requests.filter(({ path }) => path.startsWith("/api/lessons/my")),
    [],
  );
});

describe("uploaded lesson parsing", () => {
  it("accepts a complete lesson without warnings", () => {
    assert.equal(
      typeof parseLessonScript,
      "function",
      "Expected parseLessonScript",
    );
    const source = JSON.stringify({
      title: "Garden Help",
      childName: "Mia",
      goalPhrases: ["Can you help me?", "Thank you!"],
      summary: "Peppa asks Dolly for help in the garden.",
      detailedSummary:
        "Peppa finds a watering can beside the flowers. Dolly helps after Peppa asks politely. Peppa says thank you, and the flowers get their water.",
      location: {
        name: "The garden",
        description: "A bright garden with flowers and green grass.",
      },
      scenes: Array.from({ length: 5 }, (_, index) => ({
        title: `Scene ${index + 1}`,
        settingDescription:
          "Peppa and Dolly stand together beside the garden flowers.",
        background: "episode-garden",
        characters: ["peppa", "dolly"],
        steps: [
          {
            speaker: "dolly",
            dialogue: index === 4 ? "Thank you!" : "Can you help me?",
            emotes: {
              peppa: "listening",
              dolly: "talking",
            },
          },
          {
            speaker: "user",
            dialogue: index === 4 ? "Thank you!" : "Can you help me?",
            emotes: {
              peppa: "listening",
              dolly: "listening",
            },
          },
          ...(index === 4
            ? [
                {
                  speaker: "narrator",
                  dialogue: "Great job, Mia! The flowers have their water!",
                  emotes: {
                    peppa: "happy",
                    dolly: "happy",
                  },
                },
              ]
            : []),
        ],
      })),
    });

    const draft = parseLessonScript(source, "garden-help.json");
    assert.equal(draft.lesson.title, "Garden Help");
    assert.equal(draft.lesson.scenes.length, 5);
    assert.deepEqual(draft.warnings, []);
  });

  it("reports malformed JSON without accepting a partial script", () => {
    assert.equal(typeof parseLessonScript, "function");
    assert.throws(
      () => parseLessonScript('{"title":', "broken.json"),
      /broken\.json must contain valid JSON/i,
    );
  });

  it("formats generated lessons as editable JSON that validates again", () => {
    assert.equal(typeof formatLessonScript, "function");
    const sourceLesson = createLessonScript();
    const formatted = formatLessonScript(sourceLesson);

    assert.match(formatted, /^\{\n {2}"title": "Garden Help",/);
    assert.deepEqual(parseLessonScript(formatted, "edited script"), {
      lesson: sourceLesson,
      warnings: [],
    });
  });

  it("rejects pasted scripts larger than the editor limit", () => {
    const oversized = JSON.stringify({ script: "x".repeat(256 * 1024) });

    assert.throws(
      () => parseLessonScript(oversized, "pasted script"),
      /smaller than 256 KB/i,
    );
  });
});

test("draft warnings are visible without blocking save", () => {
  assert.equal(typeof LessonWarnings, "function", "Expected LessonWarnings");
  const html = renderToStaticMarkup(
    createElement(LessonWarnings, {
      warnings: [
        "Missing title; using Untitled lesson.",
        "Unknown background; using episode-garden.",
      ],
    }),
  );

  assert.match(html, /role="status"/);
  assert.match(html, /Draft warnings/);
  assert.match(html, /Missing title/);
  assert.match(html, /Unknown background/);
  assert.match(html, /do not change the draft or block saving/i);
  assert.doesNotMatch(html, /disabled/);
});

test("child-language notes appear in the existing draft warning surface", () => {
  const lesson = createLessonScript();
  lesson.scenes = lesson.scenes.slice(0, 1);
  lesson.scenes[0].steps[0].dialogue =
    "Can you please point to the little red flower beside Peppa?";
  const html = renderToStaticMarkup(
    createElement(LessonWarnings, { lesson, warnings: [] }),
  );

  assert.match(html, /Draft warnings/);
  assert.match(html, /question has 11 words/i);
  assert.match(html, /about 7 words or fewer/i);
  assert.match(html, /do not change the draft or block saving/i);
  assert.doesNotMatch(html, /role="status"/);
});
