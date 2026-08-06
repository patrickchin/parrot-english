import { expect, test, type Locator, type Page } from "@playwright/test";

const firstStoryPath = "/stories/the-lantern-trail/pages/1";

const viewports = [
  { height: 568, name: "ultra-narrow phone", width: 280 },
  { height: 480, name: "short phone", width: 320 },
  { height: 844, name: "regular phone", width: 390 },
  { height: 800, name: "desktop", width: 1280 },
];

type StoryPlaybackMockState = {
  audioPauseCount: number;
  audioPlayCount: number;
  audioSources: string[];
  spokenTexts: string[];
};

async function installStoryPlaybackMock(page: Page) {
  await page.addInitScript(() => {
    const state: StoryPlaybackMockState = {
      audioPauseCount: 0,
      audioPlayCount: 0,
      audioSources: [],
      spokenTexts: [],
    };

    class MockStoryAudio {
      onended: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor(readonly src = "") {
        state.audioSources.push(src);
      }

      pause() {
        state.audioPauseCount += 1;
      }

      async play() {
        state.audioPlayCount += 1;
      }
    }

    class MockSpeechSynthesisUtterance {
      lang = "";
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      pitch = 1;
      rate = 1;
      voice: SpeechSynthesisVoice | null = null;
      volume = 1;

      constructor(readonly text: string) {}
    }

    let activeUtterance: MockSpeechSynthesisUtterance | null = null;
    let paused = false;

    Object.defineProperty(window, "Audio", {
      configurable: true,
      value: MockStoryAudio,
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: MockSpeechSynthesisUtterance,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel() {
          activeUtterance = null;
          paused = false;
        },
        get paused() {
          return paused;
        },
        get pending() {
          return false;
        },
        get speaking() {
          return activeUtterance !== null;
        },
        getVoices() {
          return [
            {
              default: true,
              lang: "en-US",
              localService: true,
              name: "Parrot E2E English",
              voiceURI: "parrot-e2e-english",
            },
          ];
        },
        pause() {
          paused = true;
        },
        resume() {
          paused = false;
        },
        speak(utterance: MockSpeechSynthesisUtterance) {
          activeUtterance = utterance;
          paused = false;
          state.spokenTexts.push(utterance.text);
        },
      },
    });
    Object.defineProperty(window, "__storyPlaybackMock", {
      configurable: true,
      value: { state },
    });
  });
}

async function playbackMockState(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as Window & {
          __storyPlaybackMock: { state: StoryPlaybackMockState };
        }
      ).__storyPlaybackMock.state,
  );
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
  await installStoryPlaybackMock(page);
});

test("the story shelf opens The Lantern Trail in its reader", async ({
  page,
}) => {
  await page.goto("/stories");

  await expect(
    page.getByRole("heading", { exact: true, name: "Storytelling" }),
  ).toBeVisible();
  const shelf = page.getByRole("region", { name: "Read-aloud stories" });
  const readStory = shelf.getByRole("link", {
    name: "Read story: The Lantern Trail",
  });
  await expect(readStory).toHaveAttribute("href", firstStoryPath);

  await readStory.click();

  await expect(page).toHaveURL(firstStoryPath);
  const reader = page.getByRole("region", { name: "Story reader" });
  await expect(reader).toBeVisible();
  await expect(
    reader.getByRole("heading", { exact: true, name: "The Lantern Trail" }),
  ).toBeVisible();
});

test("the reader exposes progress and page navigation", async ({
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
  const previous = controls.getByRole("button", { name: "Previous page" });
  const next = controls.getByRole("button", { name: "Next page" });

  await expect(progress).toHaveAttribute("aria-valuemin", "1");
  await expect(progress).toHaveAttribute("aria-valuemax", "6");
  await expect(progress).toHaveAttribute("aria-valuenow", "1");
  await expect(reader.getByText("Page 1 of 6", { exact: true })).toBeVisible();
  await expect(reader.getByRole("img")).toBeVisible();
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  await expect(
    controls.getByRole("button", { name: "Read to me" }),
  ).toBeEnabled();
  await expect((await playbackMockState(page)).audioSources).toEqual([]);
  await expect((await playbackMockState(page)).spokenTexts).toEqual([]);

  await next.click();
  await expect(page).toHaveURL(/\/stories\/the-lantern-trail\/pages\/2$/);
  await expect(progress).toHaveAttribute("aria-valuenow", "2");
  await expect(reader.getByText("Page 2 of 6", { exact: true })).toBeVisible();
  await expect(previous).toBeEnabled();

  await previous.click();
  await expect(page).toHaveURL(firstStoryPath);
  await expect(progress).toHaveAttribute("aria-valuenow", "1");

  await page.goto("/stories/the-lantern-trail/pages/6");
  await expect(progress).toHaveAttribute("aria-valuenow", "6");
  await expect(reader.getByText("Page 6 of 6", { exact: true })).toBeVisible();
  await expect(
    controls.getByRole("button", { name: "Finish story" }),
  ).toBeEnabled();
});

test("page 6 Read to me pauses and resumes one saved narration", async ({
  page,
}) => {
  await page.goto("/stories/the-lantern-trail/pages/6");

  const controls = page.getByRole("navigation", {
    name: "Story playback controls",
  });
  await controls.getByRole("button", { name: "Read to me" }).click();

  await expect(
    controls.getByRole("button", { name: "Pause story" }),
  ).toBeVisible();
  await expect
    .poll(async () => await playbackMockState(page))
    .toMatchObject({
      audioPlayCount: 1,
      audioSources: ["/assets/audio/story-lantern-trail-one-last-glow.mp3"],
      spokenTexts: [],
    });

  await controls.getByRole("button", { name: "Pause story" }).click();
  await expect(
    controls.getByRole("button", { name: "Resume story" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await playbackMockState(page)).audioPauseCount)
    .toBe(1);

  await controls.getByRole("button", { name: "Resume story" }).click();
  await expect(
    controls.getByRole("button", { name: "Pause story" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await playbackMockState(page)).audioPlayCount)
    .toBe(2);
  expect((await playbackMockState(page)).audioSources).toHaveLength(1);
  expect((await playbackMockState(page)).spokenTexts).toHaveLength(0);
});

for (const viewport of viewports) {
  test(`the story shelf and reader avoid horizontal overflow on a ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/stories");

    const shelf = page.getByRole("region", { name: "Read-aloud stories" });
    const readStory = shelf.getByRole("link", {
      name: "Read story: The Lantern Trail",
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
      controls.getByRole("button", { name: "Read to me" }),
      page,
    );
    await expectNoHorizontalOverflow(page);
  });
}
