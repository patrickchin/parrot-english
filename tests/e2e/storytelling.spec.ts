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

test("the shelf shows one reading level at a time with teaching notes on demand", async ({
  page,
}) => {
  await page.goto("/stories");

  await expect(
    page.getByRole("heading", { exact: true, name: "Storytelling" }),
  ).toBeVisible();
  const shelf = page.getByRole("region", { name: "Read-aloud stories" });
  const levelTabs = shelf.getByRole("tablist", {
    name: "Choose a reading level",
  });
  const firstWordsTab = levelTabs.getByRole("tab", { name: /First words/ });
  let panel = shelf.getByRole("region", { name: /First words stories/ });

  await expect(firstWordsTab).toHaveAttribute("aria-selected", "true");
  await expect(firstWordsTab).toHaveAttribute("tabindex", "0");
  await expect(panel.getByRole("article")).toHaveCount(5);
  await expect(panel.getByRole("link", { name: /^Read story:/ })).toHaveCount(5);

  await expect(
    panel.getByRole("link", { name: "Read story: The Red Ball" }),
  ).toHaveAttribute("href", firstStoryPath);
  const firstCover = panel.getByRole("img", {
    name: "A bright red ball beside a smiling young child",
  });
  await expect(firstCover).toBeVisible();
  await expect(firstCover).toHaveAttribute("loading", "eager");
  await expect(
    panel.getByRole("img", {
      name: "Three simple hats in red, blue, and yellow",
    }),
  ).toHaveAttribute("loading", "lazy");

  const redBallCard = panel.getByRole("article", { name: "The Red Ball" });
  await expect(
    redBallCard.getByText("5 pages", { exact: true }),
  ).toBeVisible();
  await expect(
    redBallCard.getByText("23 narrator words", { exact: true }),
  ).toBeVisible();
  await expect(
    redBallCard.getByText("Assumes familiar: no extra content words", {
      exact: true,
    }),
  ).toBeHidden();
  await redBallCard.getByText("Teaching notes", { exact: true }).click();
  await expect(
    redBallCard.getByText("Assumes familiar: no extra content words", {
      exact: true,
    }),
  ).toBeVisible();

  await firstWordsTab.focus();
  await firstWordsTab.press("ArrowRight");
  const patternsTab = levelTabs.getByRole("tab", {
    name: /Repeating patterns/,
  });
  await expect(patternsTab).toBeFocused();
  await expect(patternsTab).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\/stories\?level=repeating-patterns$/);
  panel = shelf.getByRole("region", { name: /Repeating patterns stories/ });
  await expect(panel.getByRole("article")).toHaveCount(5);
  await expect(
    panel.getByRole("link", { name: "Read story: Boots in the Rain" }),
  ).toBeVisible();

  for (const level of [
    {
      id: "tiny-stories",
      name: "Tiny stories",
      story: "The Lantern Trail",
    },
    { id: "early-a1", name: "Early A1", story: "The Moon Bus" },
  ]) {
    await levelTabs.getByRole("tab", { name: new RegExp(level.name) }).click();
    await expect(page).toHaveURL(new RegExp(`\\?level=${level.id}$`));
    panel = shelf.getByRole("region", {
      name: new RegExp(`${level.name} stories`),
    });
    await expect(panel.getByRole("article")).toHaveCount(5);
    await expect(
      panel.getByRole("link", { name: `Read story: ${level.story}` }),
    ).toBeVisible();
  }

  await levelTabs.getByRole("tab", { name: /Original baseline/ }).click();
  await expect(page).toHaveURL(/\?level=original-baseline$/);
  panel = shelf.getByRole("region", { name: /Original baseline stories/ });
  await expect(panel.getByRole("article")).toHaveCount(1);
  await expect(
    panel.getByRole("link", {
      name: "Read story: The Lantern Trail — Original",
    }),
  ).toHaveAttribute("href", "/stories/the-lantern-trail-original/pages/1");
  const originalCard = panel.getByRole("article", {
    name: "The Lantern Trail — Original",
  });
  await originalCard.getByText("Teaching notes", { exact: true }).click();
  await expect(
    originalCard.getByText(
      "Assumes familiar: 107 extra word forms in the original",
      { exact: true },
    ),
  ).toBeVisible();

  await page.goto("/stories?level=not-a-level");
  await expect(page).toHaveURL(/\/stories$/);
  await expect(
    shelf.getByRole("tab", { name: /First words/ }),
  ).toHaveAttribute("aria-selected", "true");
});

test("returning from a story restores its shelf level", async ({ page }) => {
  await page.goto("/stories?level=tiny-stories");

  const shelf = page.getByRole("region", { name: "Read-aloud stories" });
  await shelf
    .getByRole("link", { name: "Read story: The Lantern Trail" })
    .click();

  const backToStories = page.getByRole("link", { name: "Back to stories" });
  await expect(backToStories).toHaveAttribute(
    "href",
    "/stories?level=tiny-stories",
  );
  await backToStories.click();
  await expect(page).toHaveURL(/\/stories\?level=tiny-stories$/);
  await expect(
    page.getByRole("tab", { name: /Tiny stories/ }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("region", { name: /Tiny stories/ }),
  ).toContainText("The Lantern Trail");
});

test("a phone uses one compact reading-level picker", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/stories");

  const shelf = page.getByRole("region", { name: "Read-aloud stories" });
  const levelPicker = shelf.getByRole("combobox", { name: "Reading level" });
  await expect(levelPicker).toHaveValue("first-words");
  await expect(
    shelf.getByRole("tablist", { name: "Choose a reading level" }),
  ).toBeHidden();

  await levelPicker.selectOption("early-a1");
  await expect(page).toHaveURL(/\/stories\?level=early-a1$/);
  await expect(levelPicker).toHaveValue("early-a1");
  await expect(
    shelf.getByRole("region", { name: "Early A1 stories" }),
  ).toContainText("The Moon Bus");

  await page.reload();
  await expect(levelPicker).toHaveValue("early-a1");
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

test("the complete original Lantern Trail remains readable as a baseline", async ({
  page,
}) => {
  await page.goto("/stories/the-lantern-trail-original/pages/1");

  const reader = page.getByRole("region", { name: "Story reader" });
  await expect(
    reader.getByRole("heading", {
      exact: true,
      name: "The Lantern Trail — Original",
    }),
  ).toBeVisible();
  await expect(
    reader.getByText(
      /At sunset, Pip the green parrot heard a tiny voice by the garden gate/,
    ),
  ).toBeVisible();
  await expect(
    reader.getByText(/Glow, little lantern, show us the way!/),
  ).toBeVisible();
  await expect(reader.getByText("Page 1 of 6", { exact: true })).toBeVisible();
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
      name: "A bright red ball beside a smiling young child",
    }),
  ).toBeVisible();
  await expect(complete.getByRole("button", { name: "Read again" })).toBeEnabled();
  await expect(complete.getByRole("link", { name: "Back to the story shelf" })).toHaveAttribute(
    "href",
    "/stories",
  );
});

for (const viewport of viewports) {
  test(`the filtered shelf and reader avoid horizontal overflow on a ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/stories");

    const shelf = page.getByRole("region", { name: "Read-aloud stories" });
    const panel = shelf.getByRole("region", { name: /First words stories/ });
    const readStory = shelf.getByRole("link", {
      name: "Read story: The Red Ball",
    });
    await expect(panel.getByRole("article")).toHaveCount(5);
    await expect(
      panel.getByText("Assumes familiar: no extra content words", {
        exact: true,
      }).first(),
    ).toBeHidden();
    await expectInsideViewportHorizontally(shelf, page);
    if (viewport.width < 640) {
      await expectInsideViewportHorizontally(
        shelf.getByRole("combobox", { name: "Reading level" }),
        page,
      );
    } else {
      await expectInsideViewportHorizontally(
        shelf.getByRole("tablist", { name: "Choose a reading level" }),
        page,
      );
    }
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
