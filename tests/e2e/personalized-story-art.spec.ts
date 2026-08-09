import { Buffer } from "node:buffer";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createLessonScript } from "../fixtures/lesson-script.mjs";

const narrowPhone = { width: 280, height: 568 };
const storyPath = "/stories/the-red-ball/pages/1";
const lessonPath = "/lessons/my/personalized-speaking-turn/scenes/1";
const guardianConsentLabel =
  "I confirm I am the child's guardian or have permission to use this photo.";
const personalizedStoryAlt = "You holding a bright red ball";
const lessonPortraitAlt = "You in storybook style";
const placeholderAlt = "Artwork placeholder for The Red Ball, page 1";
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGPQqNjyH4QZYAwATjwJTSZS7G8AAAAASUVORK5CYII=",
  "base64",
);

type PhotoState = "deleted" | "empty" | "ready";

function readyPhotoPayload() {
  return {
    enabled: true,
    guardianConsentVersion: "2026-08-09",
    hasStoredArt: true,
    stories: {
      "the-red-ball": {
        pages: {
          "my-red-ball": {
            alt: personalizedStoryAlt,
            src: "/api/stories/the-red-ball/personalized-art/asset?v=1786276800000",
          },
        },
      },
    },
    updatedAt: "2026-08-09T12:00:00.000Z",
  };
}

async function installStoryMediaGuard(page: Page) {
  await page.addInitScript(() => {
    class ForbiddenStoryAudio {
      constructor() {
        throw new Error("A script-only story tried to create audio.");
      }
    }

    Object.defineProperty(window, "Audio", {
      configurable: true,
      value: ForbiddenStoryAudio,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel() {},
        getVoices() {
          return [];
        },
        pause() {},
        resume() {},
        speak() {
          throw new Error("A script-only story tried to use browser speech.");
        },
      },
    });
  });
}

async function expectInsideViewportHorizontally(locator: Locator, page: Page) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();

  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
}

async function mockPersonalizedStoryArtApis(
  page: Page,
  initialState: PhotoState = "empty",
) {
  let state = initialState;

  await page.route(
    /\/api\/stories\/the-red-ball\/personalized-art(?:\/asset)?(?:\?.*)?$/,
    async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const method = route.request().method();

      if (
        pathname === "/api/stories/the-red-ball/personalized-art" &&
        method === "GET"
      ) {
        await route.fulfill({
          body: JSON.stringify(
            state === "ready"
              ? readyPhotoPayload()
              : {
                  enabled: true,
                  guardianConsentVersion: "2026-08-09",
                  hasStoredArt: false,
                  stories: {},
                  updatedAt: null,
                },
          ),
          contentType: "application/json",
          status: 200,
        });
        return;
      }

      if (
        pathname === "/api/stories/the-red-ball/personalized-art" &&
        method === "POST"
      ) {
        expect(
          route.request().headers()["content-type"] ?? "",
          "expected multipart upload",
        ).toContain("multipart/form-data");
        expect(
          route.request().postDataBuffer()?.byteLength ?? 0,
          "expected a photo upload body",
        ).toBeGreaterThan(0);
        state = "ready";
        await route.fulfill({
          body: JSON.stringify(readyPhotoPayload()),
          contentType: "application/json",
          status: 201,
        });
        return;
      }

      if (
        pathname === "/api/stories/the-red-ball/personalized-art" &&
        method === "DELETE"
      ) {
        state = "deleted";
        await route.fulfill({ body: "", status: 204 });
        return;
      }

      if (
        pathname === "/api/stories/the-red-ball/personalized-art/asset" &&
        method === "GET"
      ) {
        await route.fulfill(
          state === "ready"
            ? {
                body: tinyPng,
                contentType: "image/png",
                status: 200,
              }
            : {
                body: "",
                status: 404,
              },
        );
        return;
      }

      await route.continue();
    },
  );
}

async function mockSpeakingTurnLesson(page: Page) {
  const lesson = createLessonScript({ title: "Personalized Speaking Turn" });
  lesson.scenes = [
    {
      title: "Show the ball",
      settingDescription: "Peppa and Dolly wait for Mia to speak.",
      background: "episode-garden",
      characters: ["peppa", "dolly"],
      steps: [
        {
          speaker: "user",
          dialogue: "Red ball!",
          emotes: {
            dolly: "listening",
            peppa: "listening",
          },
        },
      ],
    },
  ];

  await page.route("**/api/lessons/my/personalized-speaking-turn", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        lesson: {
          id: "personalized-speaking-turn",
          lesson,
          source: "generated",
        },
      }),
      contentType: "application/json",
      status: 200,
    });
  });
}

test("storytelling shelf offers guardian-consented story-art opt-in on a 280px phone", async ({
  page,
}) => {
  await installStoryMediaGuard(page);
  await page.setViewportSize(narrowPhone);
  await mockPersonalizedStoryArtApis(page);
  await page.goto("/stories");

  const panel = page.getByRole("region", { name: "Personalized story art" });
  const consent = panel.getByRole("checkbox", { name: guardianConsentLabel });
  const upload = panel.getByLabel("Upload learner photo");
  const generate = panel.getByRole("button", { name: "Generate story art" });

  await expectInsideViewportHorizontally(panel, page);
  await expect(generate).toBeDisabled();
  await upload.setInputFiles({
    buffer: tinyPng,
    mimeType: "image/png",
    name: "mia.png",
  });
  await consent.check();
  await generate.click();

  await expect(panel.getByText("Story art ready", { exact: true })).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Delete learner photo" }),
  ).toBeVisible();
  await expectInsideViewportHorizontally(
    panel.getByRole("img", { name: personalizedStoryAlt }),
    page,
  );
  await expectNoHorizontalOverflow(page);
});

test("The Red Ball page 1 uses personalized story art instead of the placeholder", async ({
  page,
}) => {
  await installStoryMediaGuard(page);
  await page.setViewportSize(narrowPhone);
  await mockPersonalizedStoryArtApis(page, "ready");
  await page.goto(storyPath);

  const reader = page.getByRole("region", { name: "Story reader" });
  const personalized = reader.getByRole("img", { name: personalizedStoryAlt });

  await expect(personalized).toBeVisible();
  await expectInsideViewportHorizontally(personalized, page);
  await expect(
    reader.getByRole("img", { name: placeholderAlt }),
  ).toHaveCount(0);
  await expect(
    reader.getByText("Picture coming later", { exact: true }),
  ).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("deleting learner photo falls back to the default story placeholder", async ({
  page,
}) => {
  await installStoryMediaGuard(page);
  await mockPersonalizedStoryArtApis(page, "ready");
  await page.goto("/stories");

  const panel = page.getByRole("region", { name: "Personalized story art" });
  await panel.getByRole("button", { name: "Delete learner photo" }).click();
  await expect(
    panel.getByText("Personalized story art removed.", { exact: true }),
  ).toBeVisible();

  await page.goto(storyPath);
  const reader = page.getByRole("region", { name: "Story reader" });

  await expect(reader.getByRole("img", { name: placeholderAlt })).toBeVisible();
  await expect(
    reader.getByText("Picture coming later", { exact: true }),
  ).toBeVisible();
  await expect(
    reader.getByRole("img", { name: personalizedStoryAlt }),
  ).toHaveCount(0);
});

test("a learner speaking turn can show the saved portrait without overflowing a 280px phone", async ({
  page,
}) => {
  await page.setViewportSize(narrowPhone);
  await mockPersonalizedStoryArtApis(page, "ready");
  await mockSpeakingTurnLesson(page);
  await page.goto(lessonPath);
  await page.getByRole("button", { name: "Start lesson" }).click();

  const prompt = page.getByRole("region", { name: "Your turn" });
  const controls = page.getByRole("navigation", { name: "Speaking controls" });
  const portrait = page.getByRole("img", { name: lessonPortraitAlt });

  await expect(prompt).toContainText("Red ball!");
  await expect(portrait).toBeVisible();
  await expectInsideViewportHorizontally(prompt, page);
  await expectInsideViewportHorizontally(controls, page);
  await expectInsideViewportHorizontally(portrait, page);
  await expectNoHorizontalOverflow(page);
});
