import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import test, { after, describe, it } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true },
});
const creatorModule = await vite
  .ssrLoadModule("/src/LessonCreator.tsx")
  .catch(() => ({}));
const scriptModule = await vite
  .ssrLoadModule("/src/lesson-creator-script.ts")
  .catch(() => ({}));
const { LessonCreator } = creatorModule;
const { parseLessonScript } = scriptModule;

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
  const tabList = html.match(/<div[^>]*class="lesson-creator-tabs"[^>]*>/)?.[0];
  const generateTab = html.match(
    /<button[^>]*>[\s\S]*?Generate Script<\/button>/,
  )?.[0];

  assert.match(html, /<h1>Create a Lesson<\/h1>/);
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
  assert.doesNotMatch(html, /type="file"/);
});

test("the upload query selects a JSON upload panel", () => {
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
  assert.match(
    html,
    /<input[^>]*type="file"[^>]*accept="\.json,application\/json"/,
  );
  assert.match(html, /Choose a JSON lesson script/i);
  assert.doesNotMatch(html, /id="lesson-topic"/);
});

describe("uploaded lesson parsing", () => {
  it("accepts the same strict JSON contract as built-in lessons", () => {
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
        characters: ["peppa", "dolly", "user"],
        steps: [
          {
            speaker: "dolly",
            dialogue: index === 4 ? "Thank you!" : "Can you help me?",
            emotes: {
              peppa: "listening",
              dolly: "talking",
              user: "listening",
            },
          },
          {
            speaker: "user",
            dialogue: index === 4 ? "Thank you!" : "Can you help me?",
            emotes: {
              peppa: "listening",
              dolly: "listening",
              user: "talking",
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
                    user: "happy",
                  },
                },
              ]
            : []),
        ],
      })),
    });

    const lesson = parseLessonScript(source, "garden-help.json");
    assert.equal(lesson.title, "Garden Help");
    assert.equal(lesson.scenes.length, 5);
  });

  it("reports malformed JSON without accepting a partial script", () => {
    assert.equal(typeof parseLessonScript, "function");
    assert.throws(
      () => parseLessonScript('{"title":', "broken.json"),
      /broken\.json must contain valid JSON/i,
    );
  });
});
