import { expect, test, type Locator, type Page } from "@playwright/test";
import { STORIES } from "../../src/stories/story-catalog";

const firstStoryPath = "/stories/the-red-ball/pages/1";

const viewports = [
  { height: 568, name: "ultra-narrow phone", width: 280 },
  { height: 480, name: "short phone", width: 320 },
  { height: 844, name: "regular phone", width: 390 },
  { height: 800, name: "desktop", width: 1280 },
];

const completionViewports = [
  { height: 568, name: "ultra-narrow phone", width: 280 },
  { height: 844, name: "regular phone", width: 390 },
  { height: 360, name: "short-wide reader", width: 640 },
  { height: 800, name: "desktop", width: 1280 },
] as const;

const longStoryViewports = [
  { cropsArtwork: false, height: 568, name: "ultra-narrow phone", width: 280 },
  { cropsArtwork: false, height: 844, name: "tall ultra-narrow phone", width: 280 },
  { cropsArtwork: false, height: 844, name: "regular phone", width: 390 },
  { cropsArtwork: true, height: 360, name: "short-wide boundary", width: 559 },
  { cropsArtwork: true, height: 360, name: "short-wide reader", width: 640 },
  { cropsArtwork: false, height: 1024, name: "portrait tablet", width: 768 },
  { cropsArtwork: false, height: 800, name: "desktop", width: 1280 },
] as const;

const longStoryInventoryViewports = [
  { height: 568, name: "ultra-narrow phone", width: 280 },
  { height: 844, name: "regular phone", width: 390 },
  { height: 360, name: "short-wide boundary", width: 559 },
  { height: 800, name: "desktop", width: 1280 },
] as const;

async function installStoryMediaGuard(page: Page) {
  await page.addInitScript(() => {
    let forbiddenStoryAudioConstructions = 0;
    class ForbiddenStoryAudio {
      constructor() {
        forbiddenStoryAudioConstructions += 1;
        throw new Error("A script-only story tried to create audio.");
      }
    }

    Object.defineProperty(window, "Audio", {
      configurable: true,
      value: ForbiddenStoryAudio,
    });
    const storySpeech = {
      cancelled: 0,
      endCallbacks: [] as Array<() => void>,
      errorCallbacks: [] as Array<() => void>,
      paused: 0,
      resumed: 0,
      snapshots: [] as Array<{
        promptFullyVisible: boolean;
        scrollTop: number | null;
        text: string;
      }>,
      spoken: [] as string[],
      throwOnSpeak: false,
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
    Object.defineProperty(window, "__storyAudioConstructions", {
      configurable: true,
      get: () => forbiddenStoryAudioConstructions,
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
          if (storySpeech.throwOnSpeak) {
            storySpeech.throwOnSpeak = false;
            throw new Error("Simulated speech start failure.");
          }

          const prompt = document.querySelector<HTMLElement>(
            '[aria-label^="Say it:"]',
          );
          let pane = prompt?.parentElement ?? null;
          while (pane) {
            const overflowY = getComputedStyle(pane).overflowY;
            if (overflowY === "auto" || overflowY === "scroll") break;
            pane = pane.parentElement;
          }
          const promptBox = prompt?.getBoundingClientRect();
          const paneBox = pane?.getBoundingClientRect();
          const visibleHeight =
            promptBox && paneBox
              ? Math.max(
                  0,
                  Math.min(promptBox.bottom, paneBox.bottom) -
                    Math.max(promptBox.top, paneBox.top),
                )
              : 0;

          storySpeech.spoken.push(utterance.text);
          storySpeech.snapshots.push({
            promptFullyVisible: Boolean(
              promptBox && visibleHeight >= promptBox.height - 1,
            ),
            scrollTop: pane?.scrollTop ?? null,
            text: utterance.text,
          });
          if (utterance.onend) {
            storySpeech.endCallbacks.push(utterance.onend);
          }
          if (utterance.onerror) {
            storySpeech.errorCallbacks.push(utterance.onerror);
          }
        },
      },
    });
  });
}

async function installSavedStoryAudio(page: Page) {
  await page.waitForFunction(() => Audio.name === "MockAudioElement");
  await page.evaluate(() => {
    const storyAudio = {
      instances: [] as SavedStoryAudio[],
      staleEnds: [] as Array<() => void>,
    };

    class SavedStoryAudio {
      active = false;
      onended: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      url: string;

      constructor(url = "") {
        this.url = url;
        storyAudio.instances.push(this);
      }

      set src(url: string) {
        this.url = url;
      }

      pause() {
        this.active = false;
      }

      play() {
        this.active = true;
        const onended = this.onended;
        storyAudio.staleEnds.push(() => onended?.(new Event("ended")));
        return Promise.resolve();
      }

      finish() {
        if (!this.active) return false;
        this.active = false;
        this.onended?.(new Event("ended"));
        return true;
      }

      fail() {
        if (!this.active) return false;
        this.active = false;
        this.onerror?.(new Event("error"));
        return true;
      }
    }

    Object.defineProperty(window, "Audio", {
      configurable: true,
      value: SavedStoryAudio,
    });
    Object.defineProperty(window, "__savedStoryAudio", {
      configurable: true,
      value: storyAudio,
    });
  });
}

async function savedStoryAudioState(page: Page) {
  return page.evaluate(() => {
    const audio = (
      window as unknown as {
        __savedStoryAudio: {
          instances: Array<{ active: boolean; url: string }>;
        };
      }
    ).__savedStoryAudio;
    return {
      active: audio.instances
        .filter((instance) => instance.active)
        .map((instance) => instance.url),
      instanceCount: audio.instances.length,
    };
  });
}

async function finishSavedStoryAudio(page: Page) {
  await page.evaluate(() => {
    const instances = (
      window as unknown as {
        __savedStoryAudio: {
          instances: Array<{ active: boolean; finish: () => boolean }>;
        };
      }
    ).__savedStoryAudio.instances;
    const active = [...instances].reverse().find((instance) => instance.active);
    if (!active?.finish()) throw new Error("Missing active saved story audio.");
  });
}

async function failSavedStoryAudio(page: Page) {
  await page.evaluate(() => {
    const instances = (
      window as unknown as {
        __savedStoryAudio: {
          instances: Array<{ active: boolean; fail: () => boolean }>;
        };
      }
    ).__savedStoryAudio.instances;
    const active = [...instances].reverse().find((instance) => instance.active);
    if (!active?.fail()) throw new Error("Missing active saved story audio.");
  });
}

async function invokeStaleSavedStoryAudio(page: Page) {
  await page.evaluate(() => {
    const staleEnds = (
      window as unknown as {
        __savedStoryAudio: {
          staleEnds: Array<() => void>;
        };
      }
    ).__savedStoryAudio.staleEnds;
    const staleEnd = staleEnds.shift();
    if (!staleEnd) throw new Error("Missing stale saved-audio callback.");
    staleEnd();
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

async function expectFullyInsideViewportWithoutScrolling(
  locator: Locator,
  page: Page,
) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
}

async function storyPageScrollState(page: Page) {
  return page.evaluate(() => ({
    body: document.body.scrollTop,
    document: document.documentElement.scrollTop,
    main: document.querySelector("main")?.scrollTop ?? null,
    scrollingElement: document.scrollingElement?.scrollTop ?? null,
    window: window.scrollY,
  }));
}

async function readingPaneGeometry(locator: Locator) {
  return locator.evaluate((element) => {
    let pane = element.parentElement;
    while (pane) {
      const overflowY = getComputedStyle(pane).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") break;
      pane = pane.parentElement;
    }
    if (!pane) throw new Error("Expected a vertical reading pane.");

    const paneBox = pane.getBoundingClientRect();
    const targetBox = element.getBoundingClientRect();
    return {
      documentScrollTop: document.documentElement.scrollTop,
      paneClientHeight: pane.clientHeight,
      paneScrollHeight: pane.scrollHeight,
      paneScrollTop: pane.scrollTop,
      targetHeight: targetBox.height,
      targetVisibleHeight: Math.max(
        0,
        Math.min(targetBox.bottom, paneBox.bottom) -
          Math.max(targetBox.top, paneBox.top),
      ),
    };
  });
}

async function expectFullyVisibleInReadingPane(locator: Locator) {
  await expect
    .poll(async () => {
      const geometry = await readingPaneGeometry(locator);
      return geometry.targetVisibleHeight >= geometry.targetHeight - 1;
    })
    .toBe(true);
}

async function storySpeechState(page: Page) {
  return page.evaluate(() => {
    const speech = (
      window as unknown as {
        __storyAudioConstructions: number;
        __storySpeech: {
          cancelled: number;
          endCallbacks: Array<() => void>;
          errorCallbacks: Array<() => void>;
          paused: number;
          resumed: number;
          snapshots: Array<{
            promptFullyVisible: boolean;
            scrollTop: number | null;
            text: string;
          }>;
          spoken: string[];
          throwOnSpeak: boolean;
        };
      }
    ).__storySpeech;
    return {
      audioConstructions: (
        window as unknown as { __storyAudioConstructions: number }
      ).__storyAudioConstructions,
      callbackCounts: {
        end: speech.endCallbacks.length,
        error: speech.errorCallbacks.length,
      },
      cancelled: speech.cancelled,
      paused: speech.paused,
      resumed: speech.resumed,
      snapshots: speech.snapshots,
      spoken: speech.spoken,
    };
  });
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

test("the learner shelf shows only the saved beginner story level", async ({
  page,
}) => {
  await page.goto("/stories");

  await expect(
    page.getByRole("heading", { exact: true, name: "Pick a story" }),
  ).toBeVisible();
  const shelf = page.getByRole("region", { name: "Read-aloud stories" });
  const panel = shelf.getByRole("region", { name: /Start here stories/ });

  await expect(shelf.getByRole("tablist")).toHaveCount(0);
  await expect(shelf.getByLabel("Grown-up options")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Generate story art/ })).toHaveCount(0);
  await expect(page.getByLabel("Upload learner photo")).toHaveCount(0);
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
  await expect(firstCover).toHaveAttribute(
    "srcset",
    "https://media.parrotbook.com/assets/v3/stories/the-red-ball-cover-384.webp 384w, https://media.parrotbook.com/assets/v3/stories/the-red-ball-cover-768.webp 768w",
  );
  await expect
    .poll(() =>
      firstCover.evaluate((element: HTMLImageElement) =>
        new URL(element.currentSrc).pathname,
      ),
    )
    .toMatch(/\/assets\/v3\/stories\/the-red-ball-cover-(384|768)\.webp$/);
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

  await page.goto("/stories?level=not-a-level");
  await expect(page).toHaveURL(/\/stories$/);
  await expect(shelf.getByRole("region", { name: /Start here stories/ })).toBeVisible();
});

test("a stale shelf level query returns to the learner's saved level", async ({ page }) => {
  await page.goto("/stories?level=tiny-stories");

  const shelf = page.getByRole("region", { name: "Read-aloud stories" });
  await expect(page).toHaveURL("/stories");
  await shelf
    .getByRole("link", { name: "Listen to story: The Red Ball" })
    .click();

  const backToStories = page.getByRole("link", { name: "Back to stories" });
  await expect(backToStories).toHaveAttribute(
    "href",
    "/stories",
  );
  await backToStories.click();
  await expect(page).toHaveURL("/stories");
  await expect(
    page.getByRole("region", { name: /Start here stories/ }),
  ).toContainText("The Red Ball");
});

test("story prose preserves authored line breaks", async ({ page }) => {
  await page.goto(firstStoryPath);

  const pageText = page.getByLabel(/^Page 1 of 5\./);
  await expect(pageText).toBeVisible();
  await expect
    .poll(() =>
      pageText.evaluate((element) => getComputedStyle(element).whiteSpace),
    )
    .toBe("pre-line");
});

test("a phone keeps learner story cards contained without management controls", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/stories");

  const shelf = page.getByRole("region", { name: "Read-aloud stories" });
  const redBall = shelf.getByRole("link", {
    name: "Listen to story: The Red Ball",
  });
  await expect(redBall).toBeVisible();
  await expect(shelf.getByRole("tablist")).toHaveCount(0);
  await expect(shelf.getByLabel("Grown-up options")).toHaveCount(0);
  await expectInsideViewportHorizontally(redBall, page);
  await expectNoHorizontalOverflow(page);
});

test("a saved-audio story has descriptive art, read-aloud, and obvious page controls", async ({
  page,
}) => {
  await page.goto(firstStoryPath);
  await installSavedStoryAudio(page);

  const reader = page.getByRole("region", { name: "Story reader" });
  const progress = reader.getByRole("progressbar", {
    name: "Story progress",
  });
  const controls = reader.getByRole("navigation", {
    name: "Story controls",
  });
  const listenControls = controls.getByRole("group", { name: "Listen" });

  await expect(
    reader.getByRole("heading", { exact: true, name: "The Red Ball" }),
  ).toBeVisible();
  await expect(reader.getByLabel("Grown-up options")).toHaveCount(0);
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
  const readToMe = listenControls.getByRole("button", {
    name: "Listen to this page",
  });
  const keepGoing = listenControls.getByRole("button", {
    name: "Keep playing to the end",
  });
  await expect(readToMe).toBeEnabled();
  await expect(readToMe).toContainText("This page");
  await expect(keepGoing).toContainText("Keep going");
  await expect(keepGoing).toHaveAttribute("aria-pressed", "false");
  await expect(
    reader.getByText("Choose how to listen", { exact: true }),
  ).toBeVisible();
  await expect(controls.getByText("Back", { exact: true })).toBeVisible();
  await expect(controls.getByText("Next", { exact: true })).toBeVisible();
  await expect(controls.getByRole("button", { name: "Previous page" })).toBeDisabled();

  await readToMe.click();
  await expect(
    controls.getByRole("button", { name: "Pause story" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await savedStoryAudioState(page)).active)
    .toEqual([
      "/assets/audio/story-the-red-ball-my-red-ball-narration.mp3",
    ]);
  await controls.getByRole("button", { name: "Pause story" }).click();
  await expect(
    controls.getByRole("button", { name: "Resume story" }),
  ).toBeVisible();
  expect((await savedStoryAudioState(page)).active).toEqual([]);
  await controls.getByRole("button", { name: "Resume story" }).click();
  await expect(
    controls.getByRole("button", { name: "Pause story" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await savedStoryAudioState(page)).active)
    .toEqual([
      "/assets/audio/story-the-red-ball-my-red-ball-narration.mp3",
    ]);

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

test("whole-story playback advances every routed page and completes the story", async ({
  page,
}) => {
  await page.goto(firstStoryPath);
  await installSavedStoryAudio(page);

  const redBall = STORIES.find(({ id }) => id === "the-red-ball");
  if (!redBall) throw new Error("Expected The Red Ball in the catalog.");
  const wholeStory = page.getByRole("button", {
    name: "Keep playing to the end",
  });
  await expect(wholeStory).toHaveAttribute("aria-pressed", "false");
  await wholeStory.click();
  await expect(wholeStory).toHaveAttribute("aria-pressed", "true");

  for (const [pageIndex, storyPage] of redBall.pages.entries()) {
    await expect
      .poll(async () => (await savedStoryAudioState(page)).active)
      .toEqual([expect.stringMatching(
        new RegExp(`/assets/audio/${storyPage.narrationAudioId}\\.mp3$`),
      )]);
    await finishSavedStoryAudio(page);
    await expect(
      page.getByLabel(`Say it: ${storyPage.joinIn}`).getByText(
        "Listen and say it",
        { exact: true },
      ),
    ).toBeVisible();
    await expect
      .poll(async () => (await savedStoryAudioState(page)).active)
      .toEqual([expect.stringMatching(
        new RegExp(`/assets/audio/${storyPage.joinInAudioId}\\.mp3$`),
      )]);
    await finishSavedStoryAudio(page);
    expect((await savedStoryAudioState(page)).instanceCount).toBe(1);

    if (pageIndex < redBall.pages.length - 1) {
      await expect(page).toHaveURL(
        new RegExp(`/stories/the-red-ball/pages/${pageIndex + 2}$`),
      );
      await expect(wholeStory).toHaveAttribute("aria-pressed", "true");
    }
  }

  await expect(
    page.getByRole("region", { name: "Story finished" }),
  ).toBeVisible();
});

for (const viewport of completionViewports) {
  test(`Story Reader keeps child controls directly after each page on the ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await enablePersonalizedStoryArtPanel(page);
    const redBall = STORIES.find(({ id }) => id === "the-red-ball");
    if (!redBall) throw new Error("Expected The Red Ball in the story catalog.");

    for (const scenario of [
      {
        controls: [
          "Listen to this page",
          "Keep playing to the end",
          "Next page",
        ],
        pageIndex: 0,
      },
      {
        controls: [
          "Previous page",
          "Listen to this page",
          "Keep playing to the end",
          "Next page",
        ],
        pageIndex: 2,
      },
      {
        controls: [
          "Previous page",
          "Listen to this page",
          "Keep playing to the end",
          "Finish story",
        ],
        pageIndex: redBall.pages.length - 1,
      },
    ] as const) {
      const storyPage = redBall.pages[scenario.pageIndex];
      await page.goto(
        `/stories/the-red-ball/pages/${scenario.pageIndex + 1}`,
      );

      const reader = page.getByRole("region", { name: "Story reader" });
      const sentence = reader.getByText(storyPage.text, { exact: true });
      const controls = reader.getByRole("navigation", {
        name: "Story controls",
      });
      await expect(sentence).toBeFocused();
      await expect(reader.getByLabel("Grown-up options")).toHaveCount(0);
      await expect(
        reader.getByRole("region", { name: "Personalized story art" }),
      ).toHaveCount(0);

      for (const name of scenario.controls) {
        await page.keyboard.press("Tab");
        const control = controls.getByRole("button", { name });
        await expect(control).toBeFocused();
        await expectFullyInsideViewportWithoutScrolling(control, page);
      }
      for (const name of [...scenario.controls].reverse().slice(1)) {
        await page.keyboard.press("Shift+Tab");
        await expect(controls.getByRole("button", { name })).toBeFocused();
      }

      await expect(reader.evaluate((element) => element.scrollTop)).resolves.toBe(0);
      expect(
        (await readingPaneGeometry(
          reader.getByLabel(`Say it: ${storyPage.joinIn}`),
        )).paneScrollTop,
      ).toBe(0);
      expect(await storyPageScrollState(page)).toEqual({
        body: 0,
        document: 0,
        main: 0,
        scrollingElement: 0,
        window: 0,
      });
      expect((await storySpeechState(page)).spoken).toEqual([]);
      await expectNoHorizontalOverflow(page);
    }
  });
}

for (const viewport of longStoryViewports) {
  test(`the split long-story reader stays contained and groups playback on the ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/stories/the-gruffalo/pages/7");

    const reader = page.getByRole("region", { name: "Story reader" });
    const controls = reader.getByRole("navigation", {
      name: "Story controls",
    });
    const pageText = reader.getByLabel(/^Page 7 of 23\./);
    const readingPane = pageText.locator("..");
    const artwork = reader.getByRole("img", {
      name: "The mouse watches a startled owl fly away above a sparkling stream.",
    });
    const previous = controls.getByRole("button", { name: "Previous page" });
    const listen = controls.getByRole("button", {
      exact: true,
      name: "Listen to this page",
    });
    const wholeStory = controls.getByRole("button", {
      exact: true,
      name: "Keep playing to the end",
    });
    const next = controls.getByRole("button", { name: "Next page" });
    const orderedControls = [previous, listen, wholeStory, next];

    await expect(pageText).toBeFocused();
    await expectContainedWithoutScrolling(reader, controls);
    await expectFullyInsideViewportWithoutScrolling(controls, page);
    await expect(wholeStory).toBeVisible();
    await expect(
      reader.evaluate((element) => ({
        hasOuterScroll: element.scrollHeight > element.clientHeight + 1,
        scrollTop: element.scrollTop,
      })),
    ).resolves.toEqual({ hasOuterScroll: false, scrollTop: 0 });

    const layout = await readingPane.evaluate((pane) => {
      const art = document.querySelector<HTMLElement>(
        '[aria-label="Story reader"] :is(img, [role="img"])',
      );
      if (!art) throw new Error("Expected story art and reading pane.");
      const artBox = art.getBoundingClientRect();
      const paneBox = pane.getBoundingClientRect();
      return {
        scrollRange: pane.scrollHeight - pane.clientHeight,
        separated:
          artBox.bottom <= paneBox.top + 1 ||
          paneBox.bottom <= artBox.top + 1 ||
          artBox.right <= paneBox.left + 1 ||
          paneBox.right <= artBox.left + 1,
      };
    });
    expect(layout.separated).toBe(true);
    expect(layout.scrollRange).toBeLessThanOrEqual(1);
    await expect(artwork).toHaveAttribute(
      "src",
      "https://media.parrotbook.com/assets/v5/story-pages/the-gruffalo-page-004.webp",
    );
    if (!viewport.cropsArtwork) {
      const artworkBox = await visibleBoxWithoutScrolling(artwork);
      const artworkRatio = artworkBox.width / artworkBox.height;
      expect(artworkRatio).toBeGreaterThanOrEqual(1.42);
      expect(artworkRatio).toBeLessThanOrEqual(1.58);
    }
    for (const button of orderedControls) {
      const box = await visibleBoxWithoutScrolling(button);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    const [listenBox, wholeStoryBox] = await Promise.all([
      listen.boundingBox(),
      wholeStory.boundingBox(),
    ]);
    expect(listenBox).not.toBeNull();
    expect(wholeStoryBox).not.toBeNull();
    const verticalOverlap = Math.min(
      listenBox!.y + listenBox!.height,
      wholeStoryBox!.y + wholeStoryBox!.height,
    ) - Math.max(listenBox!.y, wholeStoryBox!.y);
    const horizontalGap = Math.max(
      0,
      wholeStoryBox!.x - (listenBox!.x + listenBox!.width),
      listenBox!.x - (wholeStoryBox!.x + wholeStoryBox!.width),
    );
    expect(verticalOverlap).toBeGreaterThan(0);
    expect(horizontalGap).toBeLessThan(
      Math.min(listenBox!.width, wholeStoryBox!.width),
    );

    for (const control of orderedControls) {
      await page.keyboard.press("Tab");
      await expect(control).toBeFocused();
    }

    await readingPane.evaluate((pane) => {
      pane.scrollTop = pane.scrollHeight;
    });
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/stories\/the-gruffalo\/pages\/8$/);
    const nextText = reader.getByLabel(/^Page 8 of 23\./);
    const nextPane = nextText.locator("..");
    await expect(nextText).toBeFocused();
    await expect
      .poll(() => nextPane.evaluate((pane) => pane.scrollTop))
      .toBe(0);
    await expect(reader.evaluate((element) => element.scrollTop)).resolves.toBe(0);
    await expect
      .poll(() =>
        nextText.evaluate((element) => {
          const pane = element.parentElement;
          if (!pane) return false;
          const paneBox = pane.getBoundingClientRect();
          const textBox = element.getBoundingClientRect();
          return textBox.top >= paneBox.top - 1 && textBox.top < paneBox.bottom;
        }),
      )
      .toBe(true);

    await expectNoHorizontalOverflow(page);
    await expect(artwork).toBeVisible();
  });
}

for (const viewport of longStoryInventoryViewports) {
  test(`every split long-story page fits without a text scroller on the ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const overflowing: Array<{ page: number; range: number; story: string }> = [];

    for (const story of STORIES.filter(
      ({ level }) => level === "long-stories",
    )) {
      await page.goto(`/stories/${story.id}/pages/1`);
      const reader = page.getByRole("region", { name: "Story reader" });
      const controls = reader.getByRole("navigation", {
        name: "Story controls",
      });

      for (const [pageIndex] of story.pages.entries()) {
        const pageText = reader.getByLabel(
          new RegExp(`^Page ${pageIndex + 1} of ${story.pages.length}\\.`),
        );
        const readingPane = pageText.locator("..");
        await expect(pageText).toBeVisible();
        const range = await readingPane.evaluate(
          (pane) => pane.scrollHeight - pane.clientHeight,
        );
        if (range > 1) {
          overflowing.push({
            page: pageIndex + 1,
            range,
            story: story.id,
          });
        }

        if (pageIndex < story.pages.length - 1) {
          await controls.getByRole("button", { name: "Next page" }).click();
          await expect(page).toHaveURL(
            new RegExp(
              `/stories/${story.id}/pages/${pageIndex + 2}$`,
            ),
          );
        }
      }
    }
    expect(overflowing).toEqual([]);
  });
}

test("a short-wide story reveals the join-in task at its speaking phase and resets it for replay", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto("/stories/kite-come-back/pages/4");
  await installSavedStoryAudio(page);

  const reader = page.getByRole("region", { name: "Story reader" });
  const controls = reader.getByRole("navigation", {
    name: "Story controls",
  });
  const artwork = reader.getByRole("img", {
    name: "Rose giving the kite string one small pull",
  });
  const text = reader.getByText(
    "Rose gives the string one small pull. It will not move.",
    { exact: true },
  );
  const prompt = reader.getByLabel("Say it: Stop and ask!");
  const initialArtworkBox = await visibleBoxWithoutScrolling(artwork);
  const initialControlsBox = await expectContainedWithoutScrolling(
    reader,
    controls,
  );

  await expect(text).toBeFocused();
  await expectFullyVisibleInReadingPane(text);
  expect((await readingPaneGeometry(prompt)).paneScrollTop).toBe(0);

  await controls.getByRole("button", { name: "Listen to this page" }).click();
  await expect(
    controls.getByRole("button", { name: "Pause story" }),
  ).toBeFocused();
  await expect
    .poll(async () => (await savedStoryAudioState(page)).active)
    .toEqual([
      "/assets/audio/story-kite-come-back-ana-pulls-narration.mp3",
    ]);
  await controls.getByRole("button", { name: "Pause story" }).click();
  await expect(
    controls.getByRole("button", { name: "Resume story" }),
  ).toBeFocused();
  expect((await savedStoryAudioState(page)).active).toEqual([]);
  expect((await readingPaneGeometry(prompt)).paneScrollTop).toBe(0);
  await controls.getByRole("button", { name: "Resume story" }).click();
  await expect(
    controls.getByRole("button", { name: "Pause story" }),
  ).toBeFocused();
  await expect
    .poll(async () => (await savedStoryAudioState(page)).active)
    .toEqual([
      "/assets/audio/story-kite-come-back-ana-pulls-narration.mp3",
    ]);

  await finishSavedStoryAudio(page);
  await expect(prompt.getByText("Listen and say it", { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await savedStoryAudioState(page)).active)
    .toEqual([
      "/assets/audio/story-join-in-stop-and-ask.mp3",
    ]);
  await finishSavedStoryAudio(page);
  await expect(prompt.getByText("Your turn", { exact: true })).toBeVisible();
  await expectFullyVisibleInReadingPane(prompt);
  await expect(
    controls.getByRole("button", { name: "Listen to this page again" }),
  ).toBeFocused();

  expectStablePosition(
    initialArtworkBox,
    await visibleBoxWithoutScrolling(artwork),
  );
  expectStablePosition(
    initialControlsBox,
    await expectContainedWithoutScrolling(reader, controls),
  );
  await expect(
    reader.evaluate((element) => element.scrollTop),
  ).resolves.toBe(0);
  expect((await readingPaneGeometry(prompt)).documentScrollTop).toBe(0);

  await controls
    .getByRole("button", { name: "Listen to this page again" })
    .click();
  await expect(
    controls.getByRole("button", { name: "Pause story" }),
  ).toBeFocused();
  await expect
    .poll(async () => (await savedStoryAudioState(page)).active)
    .toEqual([
      "/assets/audio/story-kite-come-back-ana-pulls-narration.mp3",
    ]);
  expect((await readingPaneGeometry(prompt)).paneScrollTop).toBe(0);
  await expectFullyVisibleInReadingPane(text);
});

test("a stale sentence completion cannot reveal or speak on the next page", async ({
  page,
}) => {
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto("/stories/kite-come-back/pages/4");
  await installSavedStoryAudio(page);
  const reader = page.getByRole("region", { name: "Story reader" });
  const controls = reader.getByRole("navigation", {
    name: "Story controls",
  });

  await controls.getByRole("button", { name: "Listen to this page" }).click();
  await expect
    .poll(async () => (await savedStoryAudioState(page)).active)
    .toEqual([
      "/assets/audio/story-kite-come-back-ana-pulls-narration.mp3",
    ]);
  await controls.getByRole("button", { name: "Next page" }).click();

  await expect(page).toHaveURL(/\/stories\/kite-come-back\/pages\/5$/);
  await invokeStaleSavedStoryAudio(page);
  const kite = STORIES.find(({ id }) => id === "kite-come-back");
  if (!kite) throw new Error("Expected Kite, Come Back! in the catalog.");
  const nextText = reader.getByText(kite.pages[4].text, { exact: true });
  await expect(nextText).toBeFocused();
  await expectFullyVisibleInReadingPane(nextText);
  expect((await savedStoryAudioState(page)).active).toEqual([]);
  const nextPrompt = reader.getByLabel(`Say it: ${kite.pages[4].joinIn}`);
  expect((await readingPaneGeometry(nextPrompt)).paneScrollTop).toBe(0);
  await expect(
    controls.getByRole("button", { name: "Listen to this page" }),
  ).toBeVisible();
});

test("read-aloud failure keeps the child prompt beside recovery", async ({
  page,
}) => {
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto(firstStoryPath);
  await installSavedStoryAudio(page);

  const reader = page.getByRole("region", { name: "Story reader" });
  const controls = reader.getByRole("navigation", {
    name: "Story controls",
  });
  const artwork = reader.getByRole("img", {
    name: "A child holding one bright red ball",
  });
  const prompt = reader.getByLabel("Say it: Red ball!");
  const initialArtworkBox = await visibleBoxWithoutScrolling(artwork);
  const initialControlsBox = await expectContainedWithoutScrolling(
    reader,
    controls,
  );

  await controls.getByRole("button", { name: "Listen to this page" }).click();
  await expect
    .poll(async () => (await savedStoryAudioState(page)).active)
    .toEqual([
      "/assets/audio/story-the-red-ball-my-red-ball-narration.mp3",
    ]);
  await failSavedStoryAudio(page);
  let alert = reader.getByRole("alert");
  await expect(alert).toHaveText(
    "I can’t read aloud on this device. You can still read together.",
  );
  await expectFullyVisibleInReadingPane(prompt);
  await expectFullyVisibleInReadingPane(alert);
  await expect(
    controls.getByRole("button", { name: "Listen to this page" }),
  ).toBeFocused();

  await controls.getByRole("button", { name: "Listen to this page" }).click();
  await expect
    .poll(async () => (await savedStoryAudioState(page)).active)
    .toEqual([
      "/assets/audio/story-the-red-ball-my-red-ball-narration.mp3",
    ]);
  await failSavedStoryAudio(page);
  alert = reader.getByRole("alert");
  await expect(alert).toHaveText(
    "I can’t read aloud on this device. You can still read together.",
  );
  await expectFullyVisibleInReadingPane(prompt);
  await expectFullyVisibleInReadingPane(alert);
  await expect(
    controls.getByRole("button", { name: "Listen to this page" }),
  ).toBeFocused();

  expectStablePosition(
    initialArtworkBox,
    await visibleBoxWithoutScrolling(artwork),
  );
  expectStablePosition(
    initialControlsBox,
    await expectContainedWithoutScrolling(reader, controls),
  );
  await expect(
    reader.evaluate((element) => element.scrollTop),
  ).resolves.toBe(0);
  expect((await readingPaneGeometry(alert)).documentScrollTop).toBe(0);
});

for (const viewport of [
  { height: 844, name: "portrait", width: 390 },
  { height: 800, name: "desktop", width: 1280 },
]) {
  test(`a ${viewport.name} story does not scroll when its join-in task already fits`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/stories/kite-come-back/pages/4");
    await installSavedStoryAudio(page);
    const reader = page.getByRole("region", { name: "Story reader" });
    const prompt = reader.getByLabel("Say it: Stop and ask!");
    const controls = reader.getByRole("navigation", {
      name: "Story controls",
    });

    await controls
      .getByRole("button", { name: "Listen to this page" })
      .click();
    await expect
      .poll(async () => (await savedStoryAudioState(page)).active)
      .toHaveLength(1);
    await finishSavedStoryAudio(page);
    await expect(
      prompt.getByText("Listen and say it", { exact: true }),
    ).toBeVisible();
    await finishSavedStoryAudio(page);
    await expect(
      prompt.getByText("Your turn", { exact: true }),
    ).toBeVisible();
    await expectFullyVisibleInReadingPane(prompt);
    expect((await readingPaneGeometry(prompt)).paneScrollTop).toBe(0);
  });
}

test("every saved-audio story leaves its next action visible when narration ends", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ height: 360, width: 640 });
  for (const story of STORIES) {
    await page.goto(`/stories/${story.id}/pages/1`);
    await installSavedStoryAudio(page);
    for (const [pageIndex, storyPage] of story.pages.entries()) {
      const route = `/stories/${story.id}/pages/${pageIndex + 1}`;
      await expect(page).toHaveURL(new RegExp(`${route}$`));
      const reader = page.getByRole("region", { name: "Story reader" });
      const controls = reader.getByRole("navigation", {
        name: "Story controls",
      });
      const prompt = reader.getByLabel(`Say it: ${storyPage.joinIn}`);
      await controls
        .getByRole("button", { name: "Listen to this page" })
        .click();
      await expect
        .poll(async () => (await savedStoryAudioState(page)).active)
        .toEqual([
          `/assets/audio/${storyPage.narrationAudioId}.mp3`,
        ]);
      await finishSavedStoryAudio(page);
      if (storyPage.joinInAudioId) {
        await expect(
          prompt.getByText("Listen and say it", { exact: true }),
        ).toBeVisible();
        await expect
          .poll(async () => (await savedStoryAudioState(page)).active)
          .toEqual([
            `/assets/audio/${storyPage.joinInAudioId}.mp3`,
          ]);
        await finishSavedStoryAudio(page);
      } else {
        await expect(prompt).toHaveCount(0);
        await expect
          .poll(async () => (await savedStoryAudioState(page)).active)
          .toEqual([]);
      }
      if (storyPage.joinInAudioId) {
        await expect(
          prompt.getByText("Your turn", { exact: true }),
        ).toBeVisible();
        await expectFullyVisibleInReadingPane(prompt);
      }
      await expect(
        controls.getByRole("button", {
          name:
            pageIndex < story.pages.length - 1
              ? "Next page"
              : "Finish story",
        }),
      ).toBeVisible();
      await expect(
        reader.evaluate((element) => element.scrollTop),
      ).resolves.toBe(0);

      if (pageIndex < story.pages.length - 1) {
        await controls.getByRole("button", { name: "Next page" }).click();
      }
    }
  }
});

for (const viewport of [
  { height: 360, name: "compact landscape", width: 640 },
  { height: 360, name: "wide short screen", width: 1280 },
]) {
  test(`a ${viewport.name} keeps story art and child controls fixed through narration and page changes`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(firstStoryPath);
    await installSavedStoryAudio(page);

    const reader = page.getByRole("region", { name: "Story reader" });
    const controls = reader.getByRole("navigation", {
      name: "Story controls",
    });
    const artwork = reader.getByRole("img", {
      name: "A child holding one bright red ball",
    });
    const prompt = reader.getByLabel("Say it: Red ball!");

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

    await controls
      .getByRole("button", { name: "Listen to this page" })
      .click();
    await expect(
      controls.getByRole("button", { name: "Pause story" }),
    ).toBeVisible();
    await expect
      .poll(async () => (await savedStoryAudioState(page)).active)
      .toEqual([
        "/assets/audio/story-the-red-ball-my-red-ball-narration.mp3",
      ]);
    await finishSavedStoryAudio(page);
    await expect(
      prompt.getByText("Listen and say it", { exact: true }),
    ).toBeVisible();
    await finishSavedStoryAudio(page);
    await expect(prompt.getByText("Your turn", { exact: true })).toBeVisible();
    await expectFullyVisibleInReadingPane(prompt);
    expectStablePosition(
      initialControlsBox,
      await expectContainedWithoutScrolling(reader, controls),
    );
    expectStablePosition(
      initialArtworkBox,
      await visibleBoxWithoutScrolling(artwork),
    );
    await expect(
      reader.evaluate((element) => element.scrollTop),
    ).resolves.toBe(0);
    expect((await readingPaneGeometry(prompt)).documentScrollTop).toBe(0);

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
    reader.getByText("Ben sees a little light. “Hello! I am Sam.”", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(reader.getByText(/Glow, Sam, glow!/)).toBeVisible();
  await expect(reader.getByText(/At sunset|moonlight|lantern tree/i)).toHaveCount(0);
  await expect(
    reader.getByRole("button", { name: "Listen to this page" }),
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
  await expect(complete.getByRole("button", { name: "Start again" })).toBeEnabled();
  await expect(complete.getByRole("link", { name: "Pick another story" })).toHaveAttribute(
    "href",
    "/stories",
  );
});

for (const viewport of completionViewports) {
  test(`story completion owns a visible, useful focus location on a ${viewport.name}`, async ({
    page,
  }) => {
    await installStoryMediaGuard(page);
    await page.setViewportSize(viewport);
    await page.goto("/stories/the-red-ball/pages/5");

    await page.getByRole("button", { name: "Finish story" }).click();

    const complete = page.getByRole("region", { name: "Story finished" });
    const heading = complete.getByRole("heading", {
      exact: true,
      name: "Great job!",
    });
    const replay = complete.getByRole("button", { name: "Start again" });
    await expect(heading).toBeFocused();
    await expect(heading).toHaveAttribute("tabindex", "-1");
    await expectFullyInsideViewportWithoutScrolling(heading, page);
    await expectFullyInsideViewportWithoutScrolling(replay, page);
    expect(await storyPageScrollState(page)).toEqual({
      body: 0,
      document: 0,
      main: 0,
      scrollingElement: 0,
      window: 0,
    });
    expect((await storySpeechState(page)).spoken).toEqual([]);
    await expectNoHorizontalOverflow(page);

    await page.keyboard.press("Tab");
    await expect(replay).toBeFocused();
    await replay.click();

    await expect(page).toHaveURL(/\/stories\/the-red-ball\/pages\/1$/);
    const reader = page.getByRole("region", { name: "Story reader" });
    const sentence = reader.getByText("Here is my red ball.", { exact: true });
    await expect(sentence).toBeFocused();
    await expect(
      reader.getByRole("button", { name: "Listen to this page" }),
    ).toBeEnabled();
    await expect(reader.evaluate((element) => element.scrollTop)).resolves.toBe(0);
    const promptGeometry = await readingPaneGeometry(
      reader.getByLabel("Say it: Red ball!"),
    );
    expect(promptGeometry.paneScrollTop).toBe(0);
    expect(promptGeometry.documentScrollTop).toBe(0);
    expect(await storyPageScrollState(page)).toEqual({
      body: 0,
      document: 0,
      main: 0,
      scrollingElement: 0,
      window: 0,
    });
    expect((await storySpeechState(page)).spoken).toEqual([]);
    await expectNoHorizontalOverflow(page);

    await page.keyboard.press("Tab");
    await expect(
      reader.getByRole("button", { name: "Listen to this page" }),
    ).toBeFocused();
  });
}

test("keyboard completion and restart return to silent page-one context", async ({
  page,
}) => {
  await installStoryMediaGuard(page);
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/stories/the-red-ball/pages/5");

  const finish = page.getByRole("button", { name: "Finish story" });
  await finish.focus();
  await page.keyboard.press("Enter");

  const complete = page.getByRole("region", { name: "Story finished" });
  const heading = complete.getByRole("heading", {
    exact: true,
    name: "Great job!",
  });
  await expect(heading).toBeFocused();
  await page.keyboard.press("Tab");
  const replay = complete.getByRole("button", { name: "Start again" });
  await expect(replay).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/stories\/the-red-ball\/pages\/1$/);
  const sentence = page.getByText("Here is my red ball.", { exact: true });
  await expect(sentence).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Listen to this page" }),
  ).toBeEnabled();
  const reader = page.getByRole("region", { name: "Story reader" });
  await expect(reader.evaluate((element) => element.scrollTop)).resolves.toBe(0);
  const promptGeometry = await readingPaneGeometry(
    page.getByLabel("Say it: Red ball!"),
  );
  expect(promptGeometry.paneScrollTop).toBe(0);
  expect(promptGeometry.documentScrollTop).toBe(0);
  expect(await storyPageScrollState(page)).toEqual({
    body: 0,
    document: 0,
    main: 0,
    scrollingElement: 0,
    window: 0,
  });
  expect((await storySpeechState(page)).spoken).toEqual([]);
});

test("replay resets a deliberately scrolled completion screen", async ({
  page,
}) => {
  await installStoryMediaGuard(page);
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto("/stories/the-red-ball/pages/5");
  await page.getByRole("button", { name: "Finish story" }).click();

  const complete = page.getByRole("region", { name: "Story finished" });
  const completionMain = page.locator("main");
  await completionMain.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(() => completionMain.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await complete.getByRole("button", { name: "Start again" }).click();

  await expect(page).toHaveURL(/\/stories\/the-red-ball\/pages\/1$/);
  const reader = page.getByRole("region", { name: "Story reader" });
  await expect(reader.getByText("Here is my red ball.", { exact: true })).toBeFocused();
  await expect(reader.evaluate((element) => element.scrollTop)).resolves.toBe(0);
  const promptGeometry = await readingPaneGeometry(
    reader.getByLabel("Say it: Red ball!"),
  );
  expect(promptGeometry.paneScrollTop).toBe(0);
  expect(promptGeometry.documentScrollTop).toBe(0);
  expect(await storyPageScrollState(page)).toEqual({
    body: 0,
    document: 0,
    main: 0,
    scrollingElement: 0,
    window: 0,
  });
  expect((await storySpeechState(page)).spoken).toEqual([]);
});

test("completion cancels active narration and ignores its stale callback", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/stories/the-red-ball/pages/5");
  await installSavedStoryAudio(page);

  await page.getByRole("button", { name: "Listen to this page" }).click();
  await expect
    .poll(async () => (await savedStoryAudioState(page)).active)
    .toEqual([
      "/assets/audio/story-the-red-ball-ball-home-narration.mp3",
    ]);

  await page.getByRole("button", { name: "Finish story" }).click();
  const complete = page.getByRole("region", { name: "Story finished" });
  const heading = complete.getByRole("heading", {
    exact: true,
    name: "Great job!",
  });
  await expect(heading).toBeFocused();
  expect((await savedStoryAudioState(page)).active).toEqual([]);

  await invokeStaleSavedStoryAudio(page);
  await expect(heading).toBeFocused();
  await expect(complete).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Story reader" }),
  ).toBeHidden();
  expect((await savedStoryAudioState(page)).active).toEqual([]);
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
    await expect(shelf.getByLabel("Grown-up options")).toHaveCount(0);
    await expect(shelf.getByRole("tablist")).toHaveCount(0);
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
      controls.getByRole("button", { name: "Listen to this page" }),
      page,
    );
    await expectNoHorizontalOverflow(page);
  });
}
