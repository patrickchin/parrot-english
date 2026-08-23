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

async function invokeStorySpeechCallback(
  page: Page,
  kind: "end" | "error",
  index: number,
) {
  await page.evaluate(
    ({ callbackIndex, callbackKind }) => {
      const speech = (
        window as unknown as {
          __storySpeech: {
            endCallbacks: Array<() => void>;
            errorCallbacks: Array<() => void>;
          };
        }
      ).__storySpeech;
      const callback =
        callbackKind === "end"
          ? speech.endCallbacks[callbackIndex]
          : speech.errorCallbacks[callbackIndex];
      if (!callback) {
        throw new Error(
          `Missing ${callbackKind} callback ${callbackIndex}.`,
        );
      }
      callback();
    },
    { callbackIndex: index, callbackKind: kind },
  );
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
  await expect(firstCover).toHaveAttribute(
    "srcset",
    "/assets/stories/the-red-ball-cover-384.webp 384w, /assets/stories/the-red-ball-cover-768.webp 768w",
  );
  await expect
    .poll(() =>
      firstCover.evaluate((element: HTMLImageElement) =>
        new URL(element.currentSrc).pathname,
      ),
    )
    .toMatch(/\/assets\/stories\/the-red-ball-cover-(384|768)\.webp$/);
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
        controls: ["Listen", "Next page"],
        pageIndex: 0,
      },
      {
        controls: ["Previous page", "Listen", "Next page"],
        pageIndex: 2,
      },
      {
        controls: ["Previous page", "Listen", "Finish story"],
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

test("a short-wide story reveals the join-in task at its speaking phase and resets it for replay", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto("/stories/kite-come-back/pages/4");

  const reader = page.getByRole("region", { name: "Story reader" });
  const controls = reader.getByRole("navigation", {
    name: "Story controls",
  });
  const artwork = reader.getByRole("img", {
    name: "Ana giving the kite string one small pull",
  });
  const text = reader.getByText(
    "Ana gives the string one small pull. It will not move.",
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

  await controls.getByRole("button", { name: "Listen" }).click();
  await expect(
    controls.getByRole("button", { name: "Pause story" }),
  ).toBeFocused();
  await expect
    .poll(async () => (await storySpeechState(page)).snapshots.length)
    .toBe(1);
  expect((await storySpeechState(page)).snapshots[0]).toMatchObject({
    scrollTop: 0,
    text: "Ana gives the string one small pull. It will not move.",
  });

  await invokeStorySpeechCallback(page, "end", 0);
  await expect(
    prompt.getByText("Listen and say it", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await storySpeechState(page)).snapshots.length)
    .toBe(2);
  const joinInSnapshot = (await storySpeechState(page)).snapshots[1];
  expect(joinInSnapshot).toMatchObject({
    promptFullyVisible: true,
    text: "Stop and ask!",
  });
  expect(joinInSnapshot.scrollTop).toBeGreaterThan(0);
  await expectFullyVisibleInReadingPane(prompt);
  await expect(
    controls.getByRole("button", { name: "Pause story" }),
  ).toBeFocused();

  const joinInScrollTop = (await readingPaneGeometry(prompt)).paneScrollTop;
  await controls.getByRole("button", { name: "Pause story" }).click();
  await expect(
    controls.getByRole("button", { name: "Resume story" }),
  ).toBeFocused();
  expect((await readingPaneGeometry(prompt)).paneScrollTop).toBe(
    joinInScrollTop,
  );
  await controls.getByRole("button", { name: "Resume story" }).click();
  await expect(
    controls.getByRole("button", { name: "Pause story" }),
  ).toBeFocused();
  expect((await readingPaneGeometry(prompt)).paneScrollTop).toBe(
    joinInScrollTop,
  );

  await invokeStorySpeechCallback(page, "end", 1);
  await expect(prompt.getByText("Your turn", { exact: true })).toBeVisible();
  await expectFullyVisibleInReadingPane(prompt);
  await expect(
    controls.getByRole("button", { name: "Listen again" }),
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

  await controls.getByRole("button", { name: "Listen again" }).click();
  await expect(
    controls.getByRole("button", { name: "Pause story" }),
  ).toBeFocused();
  await expect
    .poll(async () => (await storySpeechState(page)).snapshots.length)
    .toBe(3);
  expect((await storySpeechState(page)).snapshots[2]).toMatchObject({
    scrollTop: 0,
    text: "Ana gives the string one small pull. It will not move.",
  });
  expect((await readingPaneGeometry(prompt)).paneScrollTop).toBe(0);
  await expectFullyVisibleInReadingPane(text);
});

test("a stale sentence completion cannot reveal or speak on the next page", async ({
  page,
}) => {
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto("/stories/kite-come-back/pages/4");
  const reader = page.getByRole("region", { name: "Story reader" });
  const controls = reader.getByRole("navigation", {
    name: "Story controls",
  });

  await controls.getByRole("button", { name: "Listen" }).click();
  await expect
    .poll(async () => (await storySpeechState(page)).callbackCounts.end)
    .toBe(1);
  await page.evaluate(() => {
    const speech = (
      window as unknown as {
        __storySpeech: { endCallbacks: Array<() => void> };
      }
    ).__storySpeech;
    const next = document.querySelector<HTMLButtonElement>(
      '[aria-label="Next page"]',
    );
    if (!next) throw new Error("Expected the next-page action.");
    speech.endCallbacks[0]();
    next.click();
    speech.endCallbacks[0]();
  });

  await expect(page).toHaveURL(/\/stories\/kite-come-back\/pages\/5$/);
  const kite = STORIES.find(({ id }) => id === "kite-come-back");
  if (!kite) throw new Error("Expected Kite, Come Back! in the catalog.");
  const nextText = reader.getByText(kite.pages[4].text, { exact: true });
  await expect(nextText).toBeFocused();
  await expectFullyVisibleInReadingPane(nextText);
  expect((await storySpeechState(page)).spoken).toEqual([
    "Ana gives the string one small pull. It will not move.",
  ]);
  const nextPrompt = reader.getByLabel(`Say it: ${kite.pages[4].joinIn}`);
  expect((await readingPaneGeometry(nextPrompt)).paneScrollTop).toBe(0);
  await expect(
    controls.getByRole("button", { name: "Listen" }),
  ).toBeVisible();
});

test("read-aloud failure keeps the child prompt beside recovery", async ({
  page,
}) => {
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto(firstStoryPath);

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

  await page.evaluate(() => {
    (
      window as unknown as {
        __storySpeech: { throwOnSpeak: boolean };
      }
    ).__storySpeech.throwOnSpeak = true;
  });
  await controls.getByRole("button", { name: "Listen" }).click();
  let alert = reader.getByRole("alert");
  await expect(alert).toHaveText(
    "I can’t read aloud on this device. You can still read together.",
  );
  await expectFullyVisibleInReadingPane(prompt);
  await expectFullyVisibleInReadingPane(alert);
  await expect(
    controls.getByRole("button", { name: "Listen" }),
  ).toBeFocused();

  await controls.getByRole("button", { name: "Listen" }).click();
  await expect
    .poll(async () => (await storySpeechState(page)).callbackCounts.error)
    .toBe(1);
  await invokeStorySpeechCallback(page, "error", 0);
  alert = reader.getByRole("alert");
  await expect(alert).toHaveText(
    "I can’t read aloud on this device. You can still read together.",
  );
  await expectFullyVisibleInReadingPane(prompt);
  await expectFullyVisibleInReadingPane(alert);
  await expect(
    controls.getByRole("button", { name: "Listen" }),
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
    const reader = page.getByRole("region", { name: "Story reader" });
    const prompt = reader.getByLabel("Say it: Stop and ask!");
    const controls = reader.getByRole("navigation", {
      name: "Story controls",
    });

    await controls.getByRole("button", { name: "Listen" }).click();
    await invokeStorySpeechCallback(page, "end", 0);
    await expect
      .poll(async () => (await storySpeechState(page)).snapshots.length)
      .toBe(2);
    expect((await storySpeechState(page)).snapshots[1]).toMatchObject({
      promptFullyVisible: true,
      scrollTop: 0,
      text: "Stop and ask!",
    });
    await expectFullyVisibleInReadingPane(prompt);
    expect((await readingPaneGeometry(prompt)).paneScrollTop).toBe(0);
  });
}

test("every current device-speech story prompt is fully visible at join-in and Your turn", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ height: 360, width: 640 });
  for (const story of STORIES) {
    await page.goto(`/stories/${story.id}/pages/1`);
    for (const [pageIndex, storyPage] of story.pages.entries()) {
      const route = `/stories/${story.id}/pages/${pageIndex + 1}`;
      await expect(page).toHaveURL(new RegExp(`${route}$`));
      const reader = page.getByRole("region", { name: "Story reader" });
      const controls = reader.getByRole("navigation", {
        name: "Story controls",
      });
      if (storyPage.narrationAudioId === null) {
        const prompt = reader.getByLabel(`Say it: ${storyPage.joinIn}`);
        const callbackStart = (await storySpeechState(page)).callbackCounts.end;
        await controls.getByRole("button", { name: "Listen" }).click();
        await invokeStorySpeechCallback(page, "end", callbackStart);
        await expect
          .poll(async () => (await storySpeechState(page)).snapshots.length)
          .toBe(callbackStart + 2);
        expect(
          (await storySpeechState(page)).snapshots[callbackStart + 1]
            .promptFullyVisible,
          `${route} must expose its prompt before the join-in utterance starts.`,
        ).toBe(true);
        await expectFullyVisibleInReadingPane(prompt);

        await invokeStorySpeechCallback(page, "end", callbackStart + 1);
        await expect(
          prompt.getByText("Your turn", { exact: true }),
        ).toBeVisible();
        await expectFullyVisibleInReadingPane(prompt);
        await expect(
          reader.evaluate((element) => element.scrollTop),
        ).resolves.toBe(0);
      }

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

    const callbackStart = (await storySpeechState(page)).callbackCounts.end;
    await controls.getByRole("button", { name: "Listen" }).click();
    await expect(
      controls.getByRole("button", { name: "Pause story" }),
    ).toBeVisible();
    await invokeStorySpeechCallback(page, "end", callbackStart);
    await expect
      .poll(async () => (await storySpeechState(page)).snapshots.length)
      .toBe(callbackStart + 2);
    expect(
      (await storySpeechState(page)).snapshots[callbackStart + 1]
        .promptFullyVisible,
    ).toBe(true);
    await expectFullyVisibleInReadingPane(prompt);
    await invokeStorySpeechCallback(page, "end", callbackStart + 1);
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
    const replay = complete.getByRole("button", { name: "Listen again" });
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
    await expect(reader.getByRole("button", { name: "Listen" })).toBeEnabled();
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
    await expect(reader.getByRole("button", { name: "Listen" })).toBeFocused();
  });
}

test("keyboard completion and replay return to silent page-one context", async ({
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
  const replay = complete.getByRole("button", { name: "Listen again" });
  await expect(replay).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/stories\/the-red-ball\/pages\/1$/);
  const sentence = page.getByText("Here is my red ball.", { exact: true });
  await expect(sentence).toBeFocused();
  await expect(page.getByRole("button", { name: "Listen" })).toBeEnabled();
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
  await complete.getByRole("button", { name: "Listen again" }).click();

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
  await installStoryMediaGuard(page);
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/stories/the-red-ball/pages/5");

  await page.getByRole("button", { name: "Listen" }).click();
  await expect
    .poll(async () => (await storySpeechState(page)).callbackCounts.end)
    .toBe(1);
  const beforeFinish = await storySpeechState(page);
  expect(beforeFinish.spoken).toEqual(["My red ball is home."]);
  expect(beforeFinish.audioConstructions).toBe(0);

  await page.getByRole("button", { name: "Finish story" }).click();
  const complete = page.getByRole("region", { name: "Story finished" });
  const heading = complete.getByRole("heading", {
    exact: true,
    name: "Great job!",
  });
  await expect(heading).toBeFocused();
  const afterFinish = await storySpeechState(page);
  expect(afterFinish.cancelled).toBeGreaterThan(beforeFinish.cancelled);
  expect(afterFinish.spoken).toEqual(["My red ball is home."]);
  expect(afterFinish.audioConstructions).toBe(0);

  await invokeStorySpeechCallback(page, "end", 0);
  await expect(heading).toBeFocused();
  await expect(complete).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Story reader" }),
  ).toBeHidden();
  const afterStaleCallback = await storySpeechState(page);
  expect(afterStaleCallback.spoken).toEqual(["My red ball is home."]);
  expect(afterStaleCallback.callbackCounts.end).toBe(1);
  expect(afterStaleCallback.audioConstructions).toBe(0);
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
