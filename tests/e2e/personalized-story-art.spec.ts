import { Buffer } from "node:buffer";
import { expect, test, type Locator, type Page } from "@playwright/test";

const narrowPhone = { width: 280, height: 568 };
const storyPath = "/stories/the-red-ball/pages/1";
const guardianConsentLabel =
  "I am 18 or older. I confirm I am Mia's guardian or have permission to use this photo, and I agree to send a cropped copy to Cloudflare Workers AI to make the illustration.";
const personalizedStoryAlt = "You holding a bright red ball";
const defaultArtworkAlt = "A child holding one bright red ball";
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGPQqNjyH4QZYAwATjwJTSZS7G8AAAAASUVORK5CYII=",
  "base64",
);

function guardianPath(path: string) {
  return `${path}${path.includes("?") ? "&" : "?"}parrotE2eGuardian=guardian`;
}

type PhotoState = "cleanup-only" | "deleted" | "empty" | "ready";

function readyPhotoPayload(learnerProfileId?: string | null) {
  const assetSearch = new URLSearchParams({ v: "1786276800000" });
  if (learnerProfileId) assetSearch.set("learnerProfileId", learnerProfileId);
  return {
    enabled: true,
    guardianConsentVersion: "guardian-photo-cloudflare-v1",
    hasStoredArt: true,
    stories: {
      "the-red-ball": {
        pages: {
          "my-red-ball": {
            alt: personalizedStoryAlt,
            src: `/api/stories/the-red-ball/personalized-art/asset?${assetSearch}`,
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
  {
    deleteDelayMs = 0,
    deleteFails = false,
  }: { deleteDelayMs?: number; deleteFails?: boolean } = {},
) {
  let state = initialState;
  let deleteCount = 0;

  await page.route(
    /\/api\/stories\/the-red-ball\/personalized-art(?:\/asset)?(?:\?.*)?$/,
    async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const learnerProfileId = new URL(route.request().url()).searchParams.get(
        "learnerProfileId",
      );
      const method = route.request().method();

      if (
        pathname === "/api/stories/the-red-ball/personalized-art" &&
        method === "GET"
      ) {
        await route.fulfill({
          body: JSON.stringify(
            state === "ready"
              ? readyPhotoPayload(learnerProfileId)
              : state === "cleanup-only"
                ? {
                    enabled: false,
                    guardianConsentVersion: "guardian-photo-cloudflare-v1",
                    hasStoredArt: true,
                    stories: {},
                    updatedAt: "2026-08-09T12:00:00.000Z",
                  }
                : {
                    enabled: true,
                    guardianConsentVersion: "guardian-photo-cloudflare-v1",
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
          body: JSON.stringify(readyPhotoPayload(learnerProfileId)),
          contentType: "application/json",
          status: 201,
        });
        return;
      }

      if (
        pathname === "/api/stories/the-red-ball/personalized-art" &&
        method === "DELETE"
      ) {
        deleteCount += 1;
        if (deleteDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, deleteDelayMs));
        }
        if (deleteFails) {
          await route.fulfill({
            contentType: "application/json",
            json: {
              error: "delete_failed",
              message: "The stored story art could not be deleted.",
            },
            status: 500,
          });
          return;
        }
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

  return { deleteCount: () => deleteCount };
}

test("storytelling shelf offers guardian-consented story-art opt-in on a 280px phone", async ({
  page,
}) => {
  await installStoryMediaGuard(page);
  await page.setViewportSize(narrowPhone);
  await mockPersonalizedStoryArtApis(page);
  await page.goto(guardianPath("/guardian/stories"));

  const panel = page.getByRole("region", { name: "Personalized story art" });
  const consent = panel.getByRole("checkbox", { name: guardianConsentLabel });
  const upload = panel.getByLabel("Upload Mia's photo");
  const generate = panel.getByRole("button", { name: "Generate story art" });

  await expectInsideViewportHorizontally(panel, page);
  await expect.soft(
    page.getByText(
      "Choose stories and manage optional personalized art for Mia.",
      { exact: true },
    ),
  ).toHaveCount(0);
  await expect.soft(
    page.getByRole("heading", { name: "Personalized story art" }),
  ).toHaveCount(0);
  await expect.soft(
    panel.getByText("Guardian consent", { exact: true }),
  ).toHaveCount(0);
  await expect(generate).toBeDisabled();
  await upload.setInputFiles({
    buffer: tinyPng,
    mimeType: "image/png",
    name: "mia.png",
  });
  await consent.check();
  await generate.click();

  await expect(
    panel.getByText("Story art ready", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Delete story art" }),
  ).toBeVisible();
  await expectInsideViewportHorizontally(
    panel.getByRole("img", { name: personalizedStoryAlt }),
    page,
  );
  await expectNoHorizontalOverflow(page);
});

test("disabled generation keeps one cleanup path and confirms deletion", async ({
  page,
}) => {
  await installStoryMediaGuard(page);
  await page.setViewportSize(narrowPhone);
  const requests = await mockPersonalizedStoryArtApis(page, "cleanup-only", {
    deleteDelayMs: 150,
  });
  await page.goto(guardianPath("/guardian/stories"));

  const panel = page.getByRole("region", { name: "Personalized story art" });
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Delete stored story art" }),
  ).toBeVisible();
  await expect(panel.getByLabel("Upload Mia's photo")).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "Generate story art" }),
  ).toHaveCount(0);

  const remove = panel.getByRole("button", {
    name: "Delete stored story art",
  });
  await remove.focus();
  await page.keyboard.press("Enter");

  const pending = panel.getByRole("button", {
    name: "Deleting stored story art",
  });
  await expect(pending).toHaveAttribute("aria-disabled", "true");
  await expect(pending).toBeFocused();

  const confirmation = page.getByText("Personalized story art removed.", {
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toBeFocused();
  await expect(confirmation).toHaveAttribute("tabindex", "-1");
  await expect(
    page.getByRole("button", { name: "Delete stored story art" }),
  ).toHaveCount(0);
  expect(requests.deleteCount()).toBe(1);
  await expectNoHorizontalOverflow(page);
});

test("failed cleanup keeps its keyboard action focused for retry", async ({
  page,
}) => {
  await installStoryMediaGuard(page);
  const requests = await mockPersonalizedStoryArtApis(page, "cleanup-only", {
    deleteDelayMs: 100,
    deleteFails: true,
  });
  await page.goto(guardianPath("/guardian/stories"));

  const panel = page.getByRole("region", { name: "Personalized story art" });
  const remove = panel.getByRole("button", {
    name: "Delete stored story art",
  });
  await remove.focus();
  await page.keyboard.press("Enter");
  await expect(
    panel.getByRole("button", { name: "Deleting stored story art" }),
  ).toBeFocused();

  await expect(panel.getByRole("alert")).toHaveText(
    "The stored story art could not be deleted.",
  );
  await expect(remove).toBeFocused();
  await expect(remove).not.toHaveAttribute("aria-disabled", "true");
  expect(requests.deleteCount()).toBe(1);
});

test("cleanup completion does not steal focus after the caregiver moves away", async ({
  page,
}) => {
  await installStoryMediaGuard(page);
  await mockPersonalizedStoryArtApis(page, "cleanup-only", {
    deleteDelayMs: 150,
  });
  await page.goto(guardianPath("/guardian/stories"));
  const otherControl = page.getByRole("tab", {
    name: "Level 1 · Words & pictures",
  });

  const remove = page.getByRole("button", {
    name: "Delete stored story art",
  });
  await remove.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Deleting stored story art" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(otherControl).toBeFocused();

  await expect(
    page.getByText("Personalized story art removed.", { exact: true }),
  ).toBeVisible();
  await expect(otherControl).toBeFocused();
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
  await expect(reader.getByLabel("Grown-up options")).toHaveCount(0);
  await expectInsideViewportHorizontally(personalized, page);
  await expect(
    reader.getByRole("img", { name: defaultArtworkAlt }),
  ).toHaveCount(0);
  await expect(
    reader.getByText("Picture coming later", { exact: true }),
  ).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("deleting story art falls back to the default story placeholder", async ({
  page,
}) => {
  await installStoryMediaGuard(page);
  await mockPersonalizedStoryArtApis(page, "ready");
  await page.goto(guardianPath("/guardian/stories"));

  const panel = page.getByRole("region", { name: "Personalized story art" });
  const remove = panel.getByRole("button", { name: "Delete story art" });
  await remove.focus();
  await page.keyboard.press("Enter");
  const confirmation = panel.getByText("Personalized story art removed.", {
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toBeFocused();

  await page.goto(storyPath);
  const reader = page.getByRole("region", { name: "Story reader" });

  await expect(
    reader.getByRole("img", { name: defaultArtworkAlt }),
  ).toBeVisible();
  await expect(
    reader.getByText("Picture coming later", { exact: true }),
  ).toHaveCount(0);
  await expect(
    reader.getByRole("img", { name: personalizedStoryAlt }),
  ).toHaveCount(0);
});
