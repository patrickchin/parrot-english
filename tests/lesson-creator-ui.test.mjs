import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import test, { after, describe, it } from "node:test";
import { createServer } from "vite";
import { createLessonScript } from "./fixtures/lesson-script.mjs";

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
const { LessonCreator, LessonWarnings } = creatorModule;
const { formatLessonScript, parseLessonScript } = scriptModule;

after(async () => vite.close());

function renderCreator(initialEntry) {
  assert.equal(typeof LessonCreator, "function", "Expected LessonCreator");
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      createElement(LessonCreator),
    ),
  );
}

test("Create Lesson defaults to an accessible Generate Script tab", () => {
  const html = renderCreator("/lessons/my/create");
  const tabList = html.match(/<div[^>]*role="tablist"[^>]*>/)?.[0];
  const generateTab = html.match(
    /<button[^>]*>[\s\S]*?Generate Script<\/button>/,
  )?.[0];

  assert.match(html, /<h1[^>]*>Create a Lesson<\/h1>/);
  assert.ok(tabList);
  assert.match(tabList, /role="tablist"/);
  assert.match(tabList, /aria-label="Create lesson methods"/);
  assert.ok(generateTab);
  assert.match(generateTab, /role="tab"/);
  assert.match(generateTab, /aria-selected="true"/);
  assert.match(html, /role="tab"[\s\S]*?Upload Script<\/button>/);
  assert.match(html, /<label[^>]*for="lesson-topic"[^>]*>.*lesson.*about/is);
  assert.match(html, /<textarea[^>]*id="lesson-topic"[^>]*maxlength="500"/i);
  assert.match(
    html,
    /<button[^>]*type="submit"[^>]*>[\s\S]*?Generate script<\/button>/,
  );
  assert.match(
    html,
    /<label[^>]*for="lesson-script-editor"[^>]*>.*Editable lesson script.*JSON.*<\/label>/is,
  );
  assert.match(
    html,
    /<textarea[^>]*id="lesson-script-editor"[^>]*spellcheck="false"/i,
  );
  assert.match(html, /Review script/i);
  assert.doesNotMatch(html, /type="file"/);
});

test("the upload query selects an editable clipboard-paste panel", () => {
  const html = renderCreator("/lessons/my/create?tab=upload");
  const uploadTab = [...html.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)]
    .map(([button]) => button)
    .find((button) => button.includes("Upload Script"));
  const uploadPanel = html.match(
    /<section[^>]*id="upload-script-panel"[^>]*>/,
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
  assert.doesNotMatch(html, /disabled/);
});
