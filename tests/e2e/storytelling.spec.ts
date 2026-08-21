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
    const storySpeech = {
      cancelled: 0,
      paused: 0,
      resumed: 0,
      spoken: [] as string[],
    };
    class StorySpeechUtterance {
      lang = "";
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      pitch = 1;
      rate = 1;
      text: string;
      voice = null;
      volume = 1;

      constructor(text: string) {
        this.text = text;
      }
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: StorySpeechUtterance,
    });
    Object.defineProperty(window, "__storySpeech", {
      configurable: true,
      value: storySpeech,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel() {
          storySpeech.cancelled += 1;
        },
        getVoices() {
          return [
            {
              default: true,
              lang: "en-US",
              localService: true,
              name: "Test English",
            },
          ];
        },
        pause() {
          storySpeech.paused += 1;
        },
        resume() {
          storySpeech.resumed += 1;
        },
        speak(utterance: StorySpeechUtterance) {
          storySpeech.spoken.push(utterance.text);
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

async function enablePersonalizedStoryArtPanel(page: Page) {
  await page.route(
    /\/api\/stories\/the-red-ball\/personalized-art(?:\?.*)?$/,
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        json: {
          enabled: true,
          guardianConsentVersion: "guardian-photo-cloudflare-v1",
          hasStoredArt: false,
          stories: {},
          updatedAt: null,
        },
        status: 200,
      });
    },
  );
}

async function visibleBoxWithoutScrolling(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function expectContainedWithoutScrolling(
  container: Locator,
  content: Locator,
) {
  const [containerBox, contentBox] = await Promise.all([
    visibleBoxWithoutScrolling(container),
    visibleBoxWithoutScrolling(content),
  ]);

  expect(contentBox.x).toBeGreaterThanOrEqual(containerBox.x);
  expect(contentBox.y).toBeGreaterThanOrEqual(containerBox.y);
  expect(contentBox.x + contentBox.width).toBeLessThanOrEqual(
    containerBox.x + containerBox.width,
  );
  expect(contentBox.y + contentBox.height).toBeLessThanOrEqual(
    containerBox.y + containerBox.height,
  );
  return contentBox;
}

function expectStablePosition(
  before: { x: number; y: number },
  after: { x: number; y: number },
) {
  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
}

test.beforeEach(async ({ page }) => {
  await installStoryMediaGuard(page);
});

test("the shelf shows beginner pictures before grown-up level choices", async ({
  page,
}) => {
  await page.goto("/stories");

  await expect(
    page.getByRole("heading", { exact: true, name: "Pick a story" }),
  ).toBeVisible();
  const shelf = page.getByRole("region", { name: "Read-aloud stories" });
  let panel = shelf.getByRole("region", { name: /Start here stories/ });

  const grownUpOptions = shelf.getByLabel("Grown-up options");
  const levelTabs = shelf.getByRole("tablist", {
    name: "Pick a story group",
  });
  await expect(levelTabs).toBeHidden();
  await expect(panel.getByRole("article")).toHaveCount(5);
  await expect(panel.getByRole("link", { name: /^Listen to story:/ })).toHaveCount(5);

  await expect(
    panel.getByRole("link", { name: "Listen to story: The Red Ball" }),
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
  await expect(redBallCard.getByText("Listen", { exact: true })).toBeVisible();
  await expect(
    redBallCard.getByText(/pages|Teaching notes|Prompt test/),
  ).toHaveCount(0);
  await expect(
    redBallCard.getByText(
      "Follow one red ball as it rolls away and comes home.",
      { exact: true },
    ),
  ).toHaveCount(0);

  await grownUpOptions.click();
  const firstWordsTab = levelTabs.getByRole("tab", { name: /Start here/ });
  await expect(firstWordsTab).toHaveAttribute("aria-selected", "true");
  await expect(firstWordsTab).toHaveAttribute("tabindex", "0");
  await firstWordsTab.focus();
  await firstWordsTab.press("ArrowRight");
  const patternsTab = levelTabs.getByRole("tab", {
    name: /Say it again/,
  });
  await expect(patternsTab).toBeFocused();
  await expect(patternsTab).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\/stories\?level=repeating-patterns$/);
  panel = shelf.getByRole("region", { name: /Say it again stories/ });
  await expect(panel.getByRole("article")).toHaveCount(5);
  await expect(
    panel.getByRole("link", { name: "Listen to story: Boots in the Rain" }),
  ).toBeVisible();

  for (const level of [
    {
      id: "tiny-stories",
      name: "Little stories",
      story: "The Lantern Trail",
    },
    { id: "early-a1", name: "Big adventures", story: "The Moon Bus" },
  ]) {
    await levelTabs.getByRole("tab", { name: new RegExp(level.name) }).click();
    await expect(page).toHaveURL(new RegExp(`\\?level=${level.id}$`));
    panel = shelf.getByRole("region", {
      name: new RegExp(`${level.name} stories`),
    });
    await expect(panel.getByRole("article")).toHaveCount(5);
    await expect(
      panel.getByRole("link", { name: `Listen to story: ${level.story}` }),
    ).toBeVisible();
  }

  await expect(levelTabs.getByRole("tab")).toHaveCount(4);

  await page.goto("/stories?level=not-a-level");
  await expect(page).toHaveURL(/\/stories$/);
  await shelf.getByLabel("Grown-up options").click();
  await expect(
    shelf.getByRole("tab", { name: /Start here/ }),
  ).toHaveAttribute("aria-selected", "true");
});

test("returning from a story restores its shelf level", async ({ page }) => {
  await page.goto("/stories?level=tiny-stories");

  const shelf = page.getByRole("region", { name: "Read-aloud stories" });
  await shelf
    .getByRole("link", { name: "Listen to story: The Lantern Trail" })
    .click();

  const backToStories = page.getByRole("link", { name: "Back to stories" });
  await expect(backToStories).toHaveAttribute(
    "href",
    "/stories?level=tiny-stories",
  );
  await backToStories.click();
  await expect(page).toHaveURL(/\/stories\?level=tiny-stories$/);
  await expect(
    page.getByRole("tab", { name: /Little stories/ }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("region", { name: /Little stories/ }),
  ).toContainText("The Lantern Trail");
});

test("a phone puts story pictures before secondary level choices", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/stories");

  const shelf = page.getByRole("region", { name: "Read-aloud stories" });
  const levelTabs = shelf.getByRole("tablist", { name: "Pick a story group" });
  const redBall = shelf.getByRole("link", {
    name: "Listen to story: The Red Ball",
  });
  const grownUpOptions = shelf.getByLabel("Grown-up options");
  await expect(redBall).toBeVisible();
  await expect(levelTabs).toBeHidden();
  const [storyBox, optionsBox] = await Promise.all([
    redBall.boundingBox(),
    grownUpOptions.boundingBox(),
  ]);
  expect(storyBox).not.toBeNull();
  expect(optionsBox).not.toBeNull();
  expect(storyBox!.y).toBeLessThan(optionsBox!.y);

  await grownUpOptions.click();
  await expect(levelTabs).toBeVisible();
  await expect(levelTabs.getByRole("tab")).toHaveCount(4);
  await expect(
    levelTabs.getByRole("tab", { name: "Start here" }),
  ).toHaveAttribute("aria-selected", "true");

  await levelTabs.getByRole("tab", { name: "Big adventures" }).click();
  await expect(page).toHaveURL(/\/stories\?level=early-a1$/);
  await expect(
    shelf.getByRole("region", { name: "Big adventures stories" }),
  ).toContainText("The Moon Bus");

  await page.reload();
  await expect(
    levelTabs.getByRole("tab", { name: "Big adventures" }),
  ).toHaveAttribute("aria-selected", "true");
});

test("a script-only story has descriptive art, read-aloud, and obvious page controls", async ({
  page,
}) => {
  await page.goto(firstStoryPath);

  const reader = page.getByRole("region", { name: "Story reader" });
  const progress = reader.getByRole("progressbar", {
    name: "Story progress",
  });
  const controls = reader.getByRole("navigation", {
    name: "Story controls",
  });

  await expect(
    reader.getByRole("heading", { exact: true, name: "The Red Ball" }),
  ).toBeVisible();
  await expect(reader.getByText(/Words to notice|First words|One object/)).toHaveCount(0);
  await expect(progress).toHaveAttribute("aria-valuemin", "1");
  await expect(progress).toHaveAttribute("aria-valuemax", "5");
  await expect(progress).toHaveAttribute("aria-valuenow", "1");
  await expect(reader.getByText("Page 1 of 5", { exact: true })).toBeVisible();
  await expect(
    reader.getByRole("img", {
      name: "A child holding one bright red ball",
    }),
  ).toBeVisible();
  await expect(
    reader.getByText(/Artwork placeholder|Picture coming later/),
  ).toHaveCount(0);
  const readToMe = controls.getByRole("button", { name: "Listen" });
  await expect(readToMe).toBeEnabled();
  await expect(controls.getByText("Back", { exact: true })).toBeVisible();
  await expect(controls.getByText("Next", { exact: true })).toBeVisible();
  await expect(controls.getByRole("button", { name: "Previous page" })).toBeDisabled();

  await readToMe.click();
  await expect(
    controls.getByRole("button", { name: "Pause story" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __storySpeech: { spoken: string[] };
            }
          ).__storySpeech.spoken,
      ),
    )
    .toEqual(["Here is my red ball."]);
  await controls.getByRole("button", { name: "Pause story" }).click();
  await expect(
    controls.getByRole("button", { name: "Resume story" }),
  ).toBeVisible();
  await controls.getByRole("button", { name: "Resume story" }).click();
  await expect(
    controls.getByRole("button", { name: "Pause story" }),
  ).toBeVisible();

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

for (const viewport of [
  { height: 360, name: "compact landscape", width: 640 },
  { height: 360, name: "wide short screen", width: 1280 },
]) {
  test(`a ${viewport.name} keeps story art and child controls fixed while secondary content scrolls`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await enablePersonalizedStoryArtPanel(page);
    await page.goto(firstStoryPath);

    const reader = page.getByRole("region", { name: "Story reader" });
    const controls = reader.getByRole("navigation", {
      name: "Story controls",
    });
    const artwork = reader.getByRole("img", {
      name: "A child holding one bright red ball",
    });
    const grownUpOptions = reader.getByLabel("Grown-up options");

    await expect(
      reader.evaluate((element) => ({
        hasOuterScroll: element.scrollHeight > element.clientHeight,
        scrollTop: element.scrollTop,
      })),
    ).resolves.toEqual({ hasOuterScroll: false, scrollTop: 0 });

    const initialControlsBox = await expectContainedWithoutScrolling(
      reader,
      controls,
    );
    const initialArtworkBox = await visibleBoxWithoutScrolling(artwork);
    for (const button of await controls.getByRole("button").all()) {
      const box = await visibleBoxWithoutScrolling(button);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    await grownUpOptions.click();
    const personalization = reader.getByRole("region", {
      name: "Personalized story art",
    });
    await expect(personalization).toBeVisible();
    await expect(
      personalization.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).resolves.toBe(true);
    expectStablePosition(
      initialControlsBox,
      await expectContainedWithoutScrolling(reader, controls),
    );
    expectStablePosition(
      initialArtworkBox,
      await visibleBoxWithoutScrolling(artwork),
    );

    await controls.getByRole("button", { name: "Listen" }).click();
    await expect(
      controls.getByRole("button", { name: "Pause story" }),
    ).toBeVisible();
    expectStablePosition(
      initialControlsBox,
      await expectContainedWithoutScrolling(reader, controls),
    );

    await controls.getByRole("button", { name: "Next page" }).click();
    await expect(page).toHaveURL(/\/stories\/the-red-ball\/pages\/2$/);
    await expect(
      reader.getByRole("progressbar", { name: "Story progress" }),
    ).toHaveAttribute("aria-valuenow", "2");
    expectStablePosition(
      initialControlsBox,
      await expectContainedWithoutScrolling(reader, controls),
    );
    await expect(
      reader.evaluate((element) => element.scrollTop),
    ).resolves.toBe(0);
  });
}

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
    reader.getByRole("button", { name: "Listen" }),
  ).toBeEnabled();
});

test("the retired original Lantern Trail returns to the story shelf", async ({
  page,
}) => {
  await page.goto("/stories/the-lantern-trail-original/pages/1");

  await expect(page).toHaveURL("/stories");
  await expect(
    page.getByRole("heading", { exact: true, name: "Pick a story" }),
  ).toBeVisible();
});

test("finishing a prototype uses story-owned completion copy", async ({ page }) => {
  await page.goto("/stories/the-red-ball/pages/5");

  await page.getByRole("button", { name: "Finish story" }).click();

  const complete = page.getByRole("region", { name: "Story finished" });
  await expect(
    complete.getByRole("heading", { name: "Great job!" }),
  ).toBeVisible();
  await expect(complete.getByText("The end!", { exact: true })).toBeVisible();
  await expect(complete.getByText("The red ball is home.", { exact: true })).toBeVisible();
  await expect(
    complete.getByRole("img", {
      name: "A bright red ball beside a smiling young child",
    }),
  ).toBeVisible();
  await expect(complete.getByRole("button", { name: "Listen again" })).toBeEnabled();
  await expect(complete.getByRole("link", { name: "Pick another story" })).toHaveAttribute(
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
    const panel = shelf.getByRole("region", { name: /Start here stories/ });
    const readStory = shelf.getByRole("link", {
      name: "Listen to story: The Red Ball",
    });
    await expect(panel.getByRole("article")).toHaveCount(5);
    await expect(
      panel.getByText("Assumes familiar: no extra content words", {
        exact: true,
      }).first(),
    ).toBeHidden();
    await expectInsideViewportHorizontally(shelf, page);
    const grownUpOptions = shelf.getByLabel("Grown-up options");
    await expectInsideViewportHorizontally(grownUpOptions, page);
    await grownUpOptions.click();
    await expectInsideViewportHorizontally(
      shelf.getByRole("tablist", { name: "Pick a story group" }),
      page,
    );
    await expectInsideViewportHorizontally(readStory, page);
    await expectNoHorizontalOverflow(page);

    await readStory.click();

    const reader = page.getByRole("region", { name: "Story reader" });
    const progress = reader.getByRole("progressbar", {
      name: "Story progress",
    });
    const controls = reader.getByRole("navigation", {
      name: "Story controls",
    });
    await expectInsideViewportHorizontally(reader, page);
    await expectInsideViewportHorizontally(progress, page);
    await expectInsideViewportHorizontally(controls, page);
    await expectInsideViewportHorizontally(
      controls.getByRole("button", { name: "Listen" }),
      page,
    );
    await expectNoHorizontalOverflow(page);
  });
}
