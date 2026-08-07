import { expect, test, type Locator, type Page } from "@playwright/test";

const firstStoryPath = "/stories/the-red-ball/pages/1";

const viewports = [
  { height: 568, name: "ultra-narrow phone", width: 280 },
  { height: 480, name: "short phone", width: 320 },
  { height: 844, name: "regular phone", width: 390 },
  { height: 800, name: "desktop", width: 1280 },
];

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

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
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

test.beforeEach(async ({ page }) => {
  await installStoryMediaGuard(page);
});

test("the shelf exposes all 20 prompt experiments in four levels", async ({
  page,
}) => {
  await page.goto("/stories");

  await expect(
    page.getByRole("heading", { exact: true, name: "Storytelling" }),
  ).toBeVisible();
  const shelf = page.getByRole("region", { name: "Read-aloud stories" });
  await expect(shelf.getByRole("link", { name: /^Read story:/ })).toHaveCount(
    20,
  );

  for (const level of [
    "First words",
    "Repeating patterns",
    "Tiny stories",
    "Early A1",
  ]) {
    await expect(
      shelf.getByRole("heading", { exact: true, name: level }),
    ).toBeVisible();
  }

  await expect(
    shelf.getByRole("link", { name: "Read story: The Red Ball" }),
  ).toHaveAttribute("href", firstStoryPath);
  await expect(
    shelf.getByRole("link", { name: "Read story: The Lantern Trail" }),
  ).toHaveAttribute("href", "/stories/the-lantern-trail/pages/1");
  await expect(shelf.getByText("Script only", { exact: true })).toHaveCount(20);
  await expect(
    shelf.getByText("Assumes familiar: no extra content words", {
      exact: true,
    }),
  ).toHaveCount(2);
});

test("a first-words script exposes placeholders, targets, and page navigation", async ({
  page,
}) => {
  await page.goto(firstStoryPath);

  const reader = page.getByRole("region", { name: "Story reader" });
  const progress = reader.getByRole("progressbar", {
    name: "Story progress",
  });
  const controls = reader.getByRole("navigation", {
    name: "Story playback controls",
  });

  await expect(
    reader.getByRole("heading", { exact: true, name: "The Red Ball" }),
  ).toBeVisible();
  await expect(reader.getByText("First words", { exact: true })).toBeVisible();
  await expect(reader.getByText(/Words to notice:.*red.*ball.*roll/)).toBeVisible();
  await expect(progress).toHaveAttribute("aria-valuemin", "1");
  await expect(progress).toHaveAttribute("aria-valuemax", "5");
  await expect(progress).toHaveAttribute("aria-valuenow", "1");
  await expect(reader.getByText("Page 1 of 5", { exact: true })).toBeVisible();
  await expect(
    reader.getByRole("img", {
      name: "Artwork placeholder for The Red Ball, page 1",
    }),
  ).toBeVisible();
  await expect(reader.getByText("Picture coming later", { exact: true })).toBeVisible();
  await expect(
    reader.getByText("A child holding one bright red ball", { exact: true }),
  ).toHaveCount(0);
  await expect(controls.getByRole("button", { name: "Audio placeholder" })).toBeDisabled();
  await expect(controls.getByText("Audio later", { exact: true })).toBeVisible();
  await expect(controls.getByRole("button", { name: "Previous page" })).toBeDisabled();

  await controls.getByRole("button", { name: "Next page" }).click();
  await expect(page).toHaveURL(/\/stories\/the-red-ball\/pages\/2$/);
  await expect(progress).toHaveAttribute("aria-valuenow", "2");
  const secondPageText = reader.getByText("Roll, red ball, roll.", {
    exact: true,
  });
  await expect(secondPageText).toBeVisible();
  await expect(secondPageText).toBeFocused();
  await expect(secondPageText).toHaveAttribute(
    "aria-label",
    "Page 2 of 5. Roll, red ball, roll.",
  );
  await expect(controls.getByRole("button", { name: "Previous page" })).toBeEnabled();
});

test("the Lantern Trail now uses the plain-language rewrite", async ({ page }) => {
  await page.goto("/stories/the-lantern-trail/pages/1");

  const reader = page.getByRole("region", { name: "Story reader" });
  await expect(
    reader.getByRole("heading", { exact: true, name: "The Lantern Trail" }),
  ).toBeVisible();
  await expect(
    reader.getByText("Pip sees a little light. “Hello! I am Flicker.”", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(reader.getByText(/Glow, Flicker, glow!/)).toBeVisible();
  await expect(reader.getByText(/At sunset|moonlight|lantern tree/i)).toHaveCount(0);
  await expect(
    reader.getByRole("button", { name: "Audio placeholder" }),
  ).toBeDisabled();
});

test("finishing a prototype uses story-owned completion copy", async ({ page }) => {
  await page.goto("/stories/the-red-ball/pages/5");

  await page.getByRole("button", { name: "Finish story" }).click();

  const complete = page.getByRole("region", { name: "Story complete" });
  await expect(
    complete.getByRole("heading", { name: "You finished the story!" }),
  ).toBeVisible();
  await expect(complete.getByText("The red ball is home.", { exact: true })).toBeVisible();
  await expect(
    complete.getByRole("img", {
      name: "Artwork placeholder for the cover of The Red Ball",
    }),
  ).toBeVisible();
  await expect(complete.getByRole("button", { name: "Read again" })).toBeEnabled();
  await expect(complete.getByRole("link", { name: "Back to the story shelf" })).toHaveAttribute(
    "href",
    "/stories",
  );
});

for (const viewport of viewports) {
  test(`the expanded shelf and reader avoid horizontal overflow on a ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/stories");

    const shelf = page.getByRole("region", { name: "Read-aloud stories" });
    const readStory = shelf.getByRole("link", {
      name: "Read story: The Red Ball",
    });
    await expectInsideViewportHorizontally(shelf, page);
    await expectInsideViewportHorizontally(readStory, page);
    await expectNoHorizontalOverflow(page);

    await readStory.click();

    const reader = page.getByRole("region", { name: "Story reader" });
    const progress = reader.getByRole("progressbar", {
      name: "Story progress",
    });
    const controls = reader.getByRole("navigation", {
      name: "Story playback controls",
    });
    await expectInsideViewportHorizontally(reader, page);
    await expectInsideViewportHorizontally(progress, page);
    await expectInsideViewportHorizontally(controls, page);
    await expectInsideViewportHorizontally(
      controls.getByRole("button", { name: "Audio placeholder" }),
      page,
    );
    await expectNoHorizontalOverflow(page);
  });
}
