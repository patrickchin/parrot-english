import { expect, test, type Locator, type Page } from "@playwright/test";

const lessonPath = "/lessons/parrot/01-peppas-high-ball/scenes/1";
const longDialogue =
  "Can you help me carry the bright yellow picnic basket to the big tree, please? I want to share apples, sandwiches, and juice with all our friends.";
const longFeedback =
  "You kept trying and said the whole picnic sentence clearly, so Peppa and Dolly can carry the basket to the big tree with you now.";
const reviewedCharacterLine =
  "Peppa and Dolly see one bright red kite over the green garden today.";

const viewports = [
  { name: "ultra-narrow phone", width: 280, height: 568 },
  { name: "regular phone", width: 390, height: 844 },
  { name: "short landscape", width: 768, height: 600 },
  { name: "desktop", width: 1440, height: 900 },
];

const boxedLandscapeViewports = [
  { name: "small phone landscape", width: 640, height: 360 },
  { name: "large phone landscape", width: 768, height: 360 },
  { name: "wide short window", width: 1280, height: 360 },
  { name: "short tablet", width: 768, height: 600 },
];

function usesLayeredLearningPane(viewport: { width: number; height: number }) {
  return (
    (viewport.width >= 560 && viewport.height <= 420) ||
    (viewport.width >= 768 && viewport.height <= 480)
  );
}

async function visibleBox(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function expectInsideViewport(
  locator: Locator,
  viewport: { width: number; height: number },
) {
  const box = await visibleBox(locator);

  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  return box;
}

async function expectBefore(upper: Locator, lower: Locator) {
  const upperBox = await visibleBox(upper);
  const lowerBox = await visibleBox(lower);
  expect(upperBox.y + upperBox.height).toBeLessThanOrEqual(lowerBox.y + 1);
}

async function expectLeftOf(left: Locator, right: Locator) {
  const leftBox = await visibleBox(left);
  const rightBox = await visibleBox(right);
  expect(leftBox.x + leftBox.width).toBeLessThanOrEqual(rightBox.x + 1);
}

async function expectNoOverlap(first: Locator, second: Locator) {
  const firstBox = await visibleBox(first);
  const secondBox = await visibleBox(second);
  const horizontalOverlap =
    Math.min(firstBox.x + firstBox.width, secondBox.x + secondBox.width) -
    Math.max(firstBox.x, secondBox.x);
  const verticalOverlap =
    Math.min(firstBox.y + firstBox.height, secondBox.y + secondBox.height) -
    Math.max(firstBox.y, secondBox.y);

  expect(horizontalOverlap > 0 && verticalOverlap > 0).toBe(false);
}

async function expectNoPageOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        horizontal: document.documentElement.scrollWidth > window.innerWidth,
        vertical: document.documentElement.scrollHeight > window.innerHeight,
      })),
    )
    .toEqual({ horizontal: false, vertical: false });
}

async function expectContainedBy(child: Locator, parent: Locator) {
  const childBox = await visibleBox(child);
  const parentBox = await visibleBox(parent);

  expect(childBox.x).toBeGreaterThanOrEqual(parentBox.x);
  expect(childBox.y).toBeGreaterThanOrEqual(parentBox.y);
  expect(childBox.x + childBox.width).toBeLessThanOrEqual(
    parentBox.x + parentBox.width,
  );
  expect(childBox.y + childBox.height).toBeLessThanOrEqual(
    parentBox.y + parentBox.height,
  );
}

async function expectLongTextReachable(locator: Locator) {
  const metrics = await locator.evaluate((element) => {
    const target = element as HTMLElement;
    return {
      clientHeight: target.clientHeight,
      scrollHeight: target.scrollHeight,
    };
  });

  expect(metrics.scrollHeight).toBeGreaterThanOrEqual(metrics.clientHeight);
  if (metrics.scrollHeight > metrics.clientHeight) {
    await expect(locator).toHaveAttribute("tabindex", "0");
    await locator.focus();
    await locator.press("End");
    await expect
      .poll(() => locator.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await locator.press("Home");
    await expect
      .poll(() => locator.evaluate((element) => element.scrollTop))
      .toBe(0);
  } else {
    await expect(locator).not.toHaveAttribute("tabindex", "0");
  }
}

async function installAudioDelay(
  page: Page,
  delayMs: number,
  heldAudio?: { delayMs: number; source: string },
) {
  await page
    .getByRole("button", { name: /Start lesson|Replay lesson/ })
    .waitFor();
  await page.evaluate(({ defaultDelay, held }) => {
    class DelayedAudio {
      onended: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      private remainingMs: number;
      private startedAt = 0;
      private timeoutId: number | null = null;

      constructor(readonly src = "") {
        const testWindow = window as Window & {
          __lessonAudioCreations?: number;
        };
        testWindow.__lessonAudioCreations =
          (testWindow.__lessonAudioCreations ?? 0) + 1;
        this.remainingMs =
          held && this.src.includes(held.source)
            ? held.delayMs
            : defaultDelay;
      }

      pause() {
        if (this.timeoutId === null) return;
        window.clearTimeout(this.timeoutId);
        this.timeoutId = null;
        this.remainingMs = Math.max(
          0,
          this.remainingMs - (performance.now() - this.startedAt),
        );
      }

      async play() {
        if (this.timeoutId !== null) return;
        this.startedAt = performance.now();
        this.timeoutId = window.setTimeout(() => {
          this.timeoutId = null;
          this.remainingMs = 0;
          this.onended?.(new Event("ended"));
        }, this.remainingMs);
      }
    }

    Object.defineProperty(window, "Audio", {
      configurable: true,
      value: DelayedAudio,
    });
  }, { defaultDelay: delayMs, held: heldAudio });
}

async function installDeviceSpeechDelay(page: Page, delayMs = 5_000) {
  await page.addInitScript(({ delay }) => {
    class DelayedSpeechUtterance {
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

    let pendingTimer: number | null = null;
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: DelayedSpeechUtterance,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel() {
          if (pendingTimer !== null) window.clearTimeout(pendingTimer);
          pendingTimer = null;
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
        pause() {},
        resume() {},
        speak(utterance: DelayedSpeechUtterance) {
          pendingTimer = window.setTimeout(() => {
            pendingTimer = null;
            utterance.onend?.();
          }, delay);
        },
      },
    });
  }, { delay: delayMs });
}

async function waitForLearnerTurn(page: Page) {
  const microphone = page.getByRole("button", { name: "Microphone" });
  await expect(microphone).toBeVisible({ timeout: 8_000 });
  return microphone;
}

async function mockLongDialogueLesson(page: Page) {
  await page.route("**/api/lessons/my/long-dialogue", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        lesson: {
          id: "long-dialogue",
          source: "generated",
          lesson: {
            title: "The Big Picnic",
            childName: "Mia",
            goalPhrases: [longDialogue],
            summary: "Peppa and Dolly get ready for a picnic.",
            detailedSummary:
              "Mia helps Peppa and Dolly carry a picnic basket to the tree.",
            location: {
              name: "The garden",
              description: "A sunny garden with a tall tree.",
            },
            scenes: [
              {
                title: "Packing the Picnic",
                settingDescription:
                  "Peppa and Dolly wait beside a full picnic basket.",
                background: "episode-garden",
                characters: ["peppa", "dolly"],
                steps: [
                  {
                    speaker: "user",
                    dialogue: longDialogue,
                    emotes: {
                      peppa: "listening",
                      dolly: "listening",
                    },
                    check: {
                      maxAttempts: 2,
                      correct: {
                        speaker: "narrator",
                        dialogue: longFeedback,
                        after: "continue",
                      },
                      incorrect: {
                        speaker: "narrator",
                        dialogue: "Almost! Try again.",
                        after: "retry",
                      },
                      incorrectFinal: {
                        speaker: "narrator",
                        dialogue: "Good try! Let's keep going.",
                        after: "continue",
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      }),
    });
  });
}

async function mockLayeredListeningLesson(
  page: Page,
  {
    characters,
    dialogue = "Look at the red kite!",
    id,
  }: {
    characters: Array<"dolly" | "peppa">;
    dialogue?: string;
    id: string;
  },
) {
  const speaker = characters.at(-1) ?? "dolly";
  await page.route(`**/api/lessons/my/${id}`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        lesson: {
          id,
          source: "generated",
          lesson: {
            title: "The Red Kite",
            childName: "Mia",
            goalPhrases: [dialogue],
            summary: "Friends find a red kite in the garden.",
            detailedSummary:
              "Mia listens and talks about the bright red kite with Peppa and Dolly.",
            location: {
              name: "The garden",
              description: "A sunny garden with a red kite.",
            },
            scenes: [
              {
                title: "The Red Kite",
                settingDescription:
                  "The friends look at one bright red kite in the sky.",
                background: "episode-garden",
                characters,
                steps: [
                  {
                    speaker,
                    dialogue,
                    emotes: Object.fromEntries(
                      characters.map((character) => [
                        character,
                        character === speaker ? "talking" : "listening",
                      ]),
                    ),
                  },
                  {
                    speaker: "user",
                    dialogue: "Red kite!",
                    emotes: Object.fromEntries(
                      characters.map((character) => [character, "listening"]),
                    ),
                  },
                ],
              },
            ],
          },
        },
      }),
    });
  });
}

async function mockSavedLessonPortrait(page: Page) {
  await page.route(
    /\/api\/stories\/the-red-ball\/personalized-art(?:\/asset)?(?:\?.*)?$/,
    async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.endsWith("/asset")) {
        await route.fulfill({
          body: [
            '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">',
            '<rect width="96" height="96" rx="20" fill="#ffcf40"/>',
            '<circle cx="48" cy="39" r="20" fill="#f5b895"/>',
            '<path d="M20 96c2-25 16-36 28-36s26 11 28 36" fill="#315f89"/>',
            "</svg>",
          ].join(""),
          contentType: "image/svg+xml",
        });
        return;
      }

      await route.fulfill({
        body: JSON.stringify({
          enabled: true,
          hasStoredArt: true,
          stories: {
            "the-red-ball": {
              pages: {
                "my-red-ball": {
                  alt: "A child holding a bright red ball",
                  src: "/api/stories/the-red-ball/personalized-art/asset?v=1787276800000",
                },
              },
            },
          },
          updatedAt: "2026-08-21T00:00:00.000Z",
        }),
        contentType: "application/json",
      });
    },
  );
}

test("the start state introduces the lesson without premature scene UI", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(lessonPath);

  const introduction = page.getByRole("region", {
    name: "Lesson introduction",
  });
  await expect(introduction).toBeVisible();
  await expect(
    introduction.getByRole("heading", { name: "Peppa's High Ball" }),
  ).toBeVisible();
  await expect(introduction.getByText("5 parts", { exact: true })).toBeVisible();
  const directions = introduction.getByRole("list", { name: "How to play" });
  await expect(directions.getByText("1. Listen", { exact: true })).toBeVisible();
  await expect(directions.getByText("2. Talk", { exact: true })).toBeVisible();

  const start = page.getByRole("button", { name: "Start lesson" });
  await expect(start).toBeFocused();
  const artwork = page.getByRole("region", { name: "Lesson artwork" });
  await expect(artwork).toBeVisible();
  await expect(
    artwork.getByAltText(
      "Peppa and Dolly look up at the red ball caught high in the tree",
    ),
  ).toBeVisible();
  await expect(
    page.getByAltText("A sunny garden with flowers and a tall tree"),
  ).toBeHidden();
  await expect(page.getByText(/Wide · 16:9|Full-scene artwork/)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Lesson progress" })).toBeHidden();
  await expect(page.getByText("Look! My ball!", { exact: true })).toBeHidden();
  await expect(artwork.getByRole("img")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Speaking controls" })).toBeHidden();
  await expect(page.getByLabel(/Build version/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Previous scene" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next scene" })).toHaveCount(0);
  await expectNoPageOverflow(page);
});

for (const viewport of viewports) {
  test(`listening and learner turns stay composed on a ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(lessonPath);
    await installAudioDelay(page, 5_000);
    await page.getByRole("button", { name: "Start lesson" }).click();

    const hud = page.getByRole("region", { name: "Lesson progress" });
    const progress = page.getByRole("progressbar", { name: "Scene progress" });
    const speech = page.getByRole("status").filter({
      hasText: "Look! My ball!",
    });
    const artwork = page.getByRole("region", { name: "Lesson artwork" });
    const back = page.getByRole("button", { name: "Back to lesson list" });
    const account = page.getByRole("button", {
      exact: true,
      name: "Account for Mia",
    });

    await expect(hud).toContainText("The Ball Up High");
    await expect(progress).toHaveAttribute("aria-valuenow", "1");
    await expect(progress).toHaveAttribute("aria-valuemax", "5");
    await expect(speech).toContainText("Listen");
    await expectInsideViewport(hud, viewport);
    await expectInsideViewport(speech, viewport);
    await expectInsideViewport(artwork, viewport);
    await expectNoOverlap(back, hud);
    await expectNoOverlap(account, hud);
    await expectBefore(hud, speech);
    await expect(
      page.getByRole("region", { name: "Lesson introduction" }),
    ).toBeHidden();
    const playbackControls = page.getByRole("navigation", {
      name: "Lesson playback controls",
    });
    await expectInsideViewport(playbackControls, viewport);
    const previous = playbackControls.getByRole("button", {
      name: "Previous scene",
    });
    const pause = playbackControls.getByRole("button", {
      name: "Pause lesson",
    });
    const next = playbackControls.getByRole("button", { name: "Next scene" });
    await expect(previous).toBeDisabled();
    await expect(pause).toBeVisible();
    await expect(next).toBeEnabled();
    const playbackBoxes = await Promise.all(
      [previous, pause, next].map((control) =>
        expectInsideViewport(control, viewport),
      ),
    );
    for (const box of playbackBoxes) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(
      Math.max(...playbackBoxes.map(({ width }) => width)) -
        Math.min(...playbackBoxes.map(({ width }) => width)),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.max(...playbackBoxes.map(({ height }) => height)) -
        Math.min(...playbackBoxes.map(({ height }) => height)),
    ).toBeLessThanOrEqual(1);

    await page.goto(lessonPath);
    await page.getByRole("button", { name: "Start lesson" }).click();
    const microphone = await waitForLearnerTurn(page);
    const prompt = page.getByRole("region", { name: "Your turn" });
    const controls = page.getByRole("navigation", {
      name: "Speaking controls",
    });
    const skip = controls.getByRole("button", {
      name: "Skip speaking turn",
    });

    await expect(prompt).toContainText("It is up high!");
    await expect(prompt).toContainText("Your turn");
    await expect(
      page.getByRole("status", { name: "Lesson updates" }),
    ).toContainText("Say: It is up high!");
    await expect(microphone).toContainText("Tap to talk");
    await expect(microphone).toHaveAttribute("aria-pressed", "false");
    await expect(skip).toContainText("Skip");
    await expectInsideViewport(prompt, viewport);
    await expectInsideViewport(controls, viewport);
    const [microphoneBox, skipBox] = await Promise.all([
      expectInsideViewport(microphone, viewport),
      expectInsideViewport(skip, viewport),
    ]);
    expect(microphoneBox.width).toBeGreaterThanOrEqual(44);
    expect(microphoneBox.height).toBeGreaterThanOrEqual(44);
    expect(skipBox.width).toBeGreaterThanOrEqual(44);
    expect(skipBox.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(microphoneBox.height - skipBox.height)).toBeLessThanOrEqual(
      1,
    );
    await expectInsideViewport(artwork, viewport);
    await expectBefore(hud, prompt);
    await expectNoOverlap(prompt, controls);
    await expectLeftOf(microphone, skip);
    await expectNoPageOverflow(page);
  });
}

for (const viewport of boxedLandscapeViewports) {
  test(`boxed lesson keeps its learning layers separate on a ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(lessonPath);
    await installAudioDelay(page, 5_000);
    await page.getByRole("button", { name: "Start lesson" }).click();

    const artwork = page.getByRole("region", { name: "Lesson artwork" });
    const hud = page.getByRole("region", { name: "Lesson progress" });
    const speech = page.getByRole("status").filter({
      hasText: "Look! My ball!",
    });
    const controls = page.getByRole("navigation", {
      name: "Lesson playback controls",
    });

    const artworkBox = await expectInsideViewport(artwork, viewport);
    expect(artworkBox.width).toBeGreaterThanOrEqual(300);
    expect(artworkBox.height).toBeGreaterThanOrEqual(165);
    await expectInsideViewport(hud, viewport);
    await expectInsideViewport(speech, viewport);
    await expectInsideViewport(controls, viewport);
    await expectLeftOf(artwork, hud);
    await expectLeftOf(artwork, speech);
    await expectLeftOf(artwork, controls);
    await expectNoOverlap(artwork, hud);
    await expectNoOverlap(artwork, speech);
    await expectNoOverlap(artwork, controls);
    await expectBefore(hud, speech);
    await expectNoOverlap(speech, controls);
    await expectNoPageOverflow(page);
  });
}

for (const fixture of [
  {
    characters: ["dolly"] as Array<"dolly" | "peppa">,
    dialogue: "Look at the red kite!",
    id: "one-character-landscape",
    viewport: { name: "one character at the boundary", width: 560, height: 360 },
  },
  {
    characters: ["peppa", "dolly"] as Array<"dolly" | "peppa">,
    dialogue: "Look at the red kite!",
    id: "two-character-boundary",
    viewport: { name: "two characters at the boundary", width: 560, height: 360 },
  },
  ...[
    { name: "421px-tall phone landscape", width: 844, height: 421 },
    { name: "430px-tall phone landscape", width: 932, height: 430 },
    { name: "two-pane height boundary", width: 768, height: 480 },
  ].map((viewport) => ({
    characters: ["peppa", "dolly"] as Array<"dolly" | "peppa">,
    dialogue: reviewedCharacterLine,
    id: `two-character-${viewport.width}x${viewport.height}`,
    viewport,
  })),
  ...boxedLandscapeViewports
    .filter((viewport) => viewport.height <= 420)
    .map((viewport) => ({
      characters: ["peppa", "dolly"] as Array<"dolly" | "peppa">,
      dialogue:
        viewport.width === 768 && viewport.height === 360
          ? reviewedCharacterLine
          : "Look at the red kite!",
      id: `two-character-${viewport.width}x${viewport.height}`,
      viewport,
    })),
]) {
  test(`layered lesson keeps characters and learning UI separate with ${fixture.viewport.name}`, async ({
    page,
  }) => {
    const {
      characters,
      dialogue = "Look at the red kite!",
      id,
      viewport,
    } = fixture;
    await page.setViewportSize(viewport);
    await installDeviceSpeechDelay(page);
    await mockLayeredListeningLesson(page, { characters, dialogue, id });
    await page.goto(`/lessons/my/${id}/scenes/1`);
    await page.getByRole("button", { name: "Start lesson" }).click();

    const hud = page.getByRole("region", { name: "Lesson progress" });
    const speech = page.getByRole("status", {
      name: `${characters.at(-1) === "peppa" ? "Peppa" : "Dolly"} is speaking`,
    });
    const controls = page.getByRole("navigation", {
      name: "Lesson playback controls",
    });
    const characterImages = characters.map((character) =>
      page.getByRole("img", {
        name: new RegExp(`^${character[0].toUpperCase()}${character.slice(1)} `),
      }),
    );

    const line = speech.getByText(dialogue, { exact: true });
    await expect(line).toBeVisible();
    await expect(speech).toContainText(
      `Listen · ${characters.at(-1) === "peppa" ? "Peppa" : "Dolly"}`,
    );
    await expectInsideViewport(hud, viewport);
    await expectInsideViewport(speech, viewport);
    await expectInsideViewport(controls, viewport);
    await expectBefore(hud, speech);
    await expectNoOverlap(speech, controls);
    await expect
      .poll(() =>
        line.evaluate(
          (element) => element.scrollHeight <= element.clientHeight,
        ),
      )
      .toBe(true);
    await expect(line).not.toHaveAttribute("tabindex", "0");

    for (const character of characterImages) {
      const characterBox = await expectInsideViewport(character, viewport);
      expect(characterBox.width).toBeGreaterThanOrEqual(100);
      expect(characterBox.height).toBeGreaterThanOrEqual(165);
      await expectLeftOf(character, hud);
      await expectLeftOf(character, speech);
      await expectLeftOf(character, controls);
      await expectNoOverlap(character, hud);
      await expectNoOverlap(character, speech);
      await expectNoOverlap(character, controls);
    }

    for (const button of await controls.getByRole("button").all()) {
      const buttonBox = await visibleBox(button);
      expect(buttonBox.width).toBeGreaterThanOrEqual(44);
      expect(buttonBox.height).toBeGreaterThanOrEqual(44);
    }
    await expectNoPageOverflow(page);
  });
}

for (const viewport of [
  { name: "first stabilized vertical pixel", width: 768, height: 481 },
  { name: "short tablet", width: 768, height: 600 },
  { name: "compact-band boundary", width: 768, height: 640 },
  { name: "first smooth transition pixel", width: 768, height: 641 },
  { name: "matched default geometry", width: 768, height: 807 },
]) {
  test(`layered lesson keeps its vertical composition collision-free at the ${viewport.name}`, async ({
    page,
  }) => {
    const id = `vertical-${viewport.width}x${viewport.height}`;
    await page.setViewportSize(viewport);
    await installDeviceSpeechDelay(page);
    await mockLayeredListeningLesson(page, {
      characters: ["peppa", "dolly"],
      id,
    });
    await page.goto(`/lessons/my/${id}/scenes/1`);
    await page.getByRole("button", { name: "Start lesson" }).click();

    const hud = page.getByRole("region", { name: "Lesson progress" });
    const speech = page.getByRole("status", { name: "Dolly is speaking" });
    const controls = page.getByRole("navigation", {
      name: "Lesson playback controls",
    });
    const peppa = page.getByRole("img", { name: /^Peppa / });
    const dolly = page.getByRole("img", { name: /^Dolly / });

    await expectInsideViewport(hud, viewport);
    await expectInsideViewport(speech, viewport);
    await expectInsideViewport(controls, viewport);
    await expectBefore(hud, speech);
    for (const character of [peppa, dolly]) {
      await expectInsideViewport(character, viewport);
      await expectBefore(speech, character);
      await expectBefore(character, controls);
      await expectNoOverlap(speech, character);
      await expectNoOverlap(character, controls);
    }
    await expectNoPageOverflow(page);
  });
}

for (const viewport of [
  { name: "small phone landscape", width: 640, height: 360 },
  { name: "large phone landscape", width: 768, height: 360 },
  { name: "vertical transition", width: 768, height: 481 },
  { name: "smoothed vertical transition", width: 768, height: 641 },
  { name: "vertical transition midpoint", width: 768, height: 720 },
  { name: "matched default geometry", width: 768, height: 807 },
]) {
  test(`long generated dialogue stays contained on a ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await mockLongDialogueLesson(page);
    await page.goto("/lessons/my/long-dialogue/scenes/1");
    await page.getByRole("button", { name: "Start lesson" }).click();

    const hud = page.getByRole("region", { name: "Lesson progress" });
    const prompt = page.getByRole("region", { name: "Your turn" });
    const phrase = prompt.getByText(longDialogue, { exact: true });
    const peppa = page.getByRole("img", { name: /^Peppa / });
    const dolly = page.getByRole("img", { name: /^Dolly / });
    const controls = page.getByRole("navigation", {
      name: "Speaking controls",
    });

    await expectInsideViewport(prompt, viewport);
    await expectInsideViewport(phrase, viewport);
    await expectContainedBy(phrase, prompt);
    await expectLongTextReachable(phrase);
    await expectBefore(hud, prompt);
    await expectNoOverlap(prompt, controls);
    for (const character of [peppa, dolly]) {
      if (usesLayeredLearningPane(viewport)) {
        await expectLeftOf(character, prompt);
        await expectLeftOf(character, controls);
      } else {
        await expectBefore(prompt, character);
        await expectBefore(character, controls);
      }
      await expectNoOverlap(character, prompt);
      await expectNoOverlap(character, controls);
    }
    await expectNoPageOverflow(page);
  });
}

for (const viewport of [
  { name: "short learning pane", width: 640, height: 360 },
  { name: "vertical transition", width: 768, height: 481 },
  { name: "smoothed vertical transition", width: 768, height: 641 },
  { name: "vertical transition midpoint", width: 768, height: 720 },
  { name: "matched default geometry", width: 768, height: 807 },
]) {
  test(`long generated character speech stays reachable at the ${viewport.name}`, async ({
    page,
  }) => {
    const id = `long-character-speech-${viewport.width}x${viewport.height}`;
    await page.setViewportSize(viewport);
    await installDeviceSpeechDelay(page);
    await mockLayeredListeningLesson(page, {
      characters: ["peppa", "dolly"],
      dialogue: longDialogue,
      id,
    });
    await page.goto(`/lessons/my/${id}/scenes/1`);
    await page.getByRole("button", { name: "Start lesson" }).click();

    const hud = page.getByRole("region", { name: "Lesson progress" });
    const speech = page.getByRole("status", { name: "Dolly is speaking" });
    const phrase = speech.getByText(longDialogue, { exact: true });
    const controls = page.getByRole("navigation", {
      name: "Lesson playback controls",
    });

    await expectInsideViewport(speech, viewport);
    await expectInsideViewport(phrase, viewport);
    await expectContainedBy(phrase, speech);
    await expectLongTextReachable(phrase);
    await expectBefore(hud, speech);
    await expectNoOverlap(speech, controls);
    for (const character of [
      page.getByRole("img", { name: /^Peppa / }),
      page.getByRole("img", { name: /^Dolly / }),
    ]) {
      if (usesLayeredLearningPane(viewport)) {
        await expectLeftOf(character, speech);
        await expectLeftOf(character, controls);
      } else {
        await expectBefore(speech, character);
        await expectBefore(character, controls);
      }
      await expectNoOverlap(character, speech);
      await expectNoOverlap(character, controls);
    }
    await expectNoPageOverflow(page);
  });
}

for (const viewport of [
  { name: "short learning pane", width: 640, height: 360 },
  { name: "vertical transition", width: 768, height: 481 },
  { name: "smoothed vertical transition", width: 768, height: 641 },
  { name: "vertical transition midpoint", width: 768, height: 720 },
  { name: "matched default geometry", width: 768, height: 807 },
]) {
  test(`long generated feedback stays reachable at the ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await installDeviceSpeechDelay(page);
    await mockLongDialogueLesson(page);
    await page.goto("/lessons/my/long-dialogue/scenes/1");
    await page.getByRole("button", { name: "Start lesson" }).click();

    const microphone = await waitForLearnerTurn(page);
    await microphone.click();
    await microphone.click();

    const feedback = page.getByRole("region", { name: "Speaking feedback" });
    const phrase = feedback.getByText(longFeedback, { exact: true });
    const controls = page.getByRole("navigation", {
      name: "Lesson playback controls",
    });
    const peppa = page.getByRole("img", { name: /^Peppa / });
    const dolly = page.getByRole("img", { name: /^Dolly / });
    await expect(phrase).toBeVisible({ timeout: 3_000 });
    await expectInsideViewport(feedback, viewport);
    await expectInsideViewport(phrase, viewport);
    await expectContainedBy(phrase, feedback);
    await expectLongTextReachable(phrase);
    await expectNoOverlap(feedback, controls);
    for (const character of [peppa, dolly]) {
      if (usesLayeredLearningPane(viewport)) {
        await expectLeftOf(character, feedback);
        await expectLeftOf(character, controls);
      } else {
        await expectBefore(feedback, character);
        await expectBefore(character, controls);
      }
      await expectNoOverlap(character, feedback);
      await expectNoOverlap(character, controls);
    }
    await expectNoPageOverflow(page);
  });
}

for (const viewport of [
  { name: "small phone landscape", width: 640, height: 360 },
  { name: "large phone landscape", width: 768, height: 360 },
]) {
  test(`built-in final feedback stays name-free on a ${viewport.name}`, async ({
    page,
  }) => {
    const finalLine = "Great job!";
    await page.setViewportSize(viewport);
    await page.goto("/lessons/parrot/04-playground-words/scenes/5");
    await installAudioDelay(page, 25, {
      delayMs: 15_000,
      source: "narrator-feedback-success",
    });
    await page.getByRole("button", { name: "Start lesson" }).click();
    await waitForLearnerTurn(page);
    await page.getByRole("button", { name: "Skip speaking turn" }).click();

    const artwork = page.getByRole("region", { name: "Lesson artwork" });
    const narration = page.getByRole("status", { name: "Lesson narration" });
    const line = narration.getByText(finalLine, { exact: true });

    await expect(line).toBeVisible();
    await expect(narration).not.toContainText("Bella");
    await expectInsideViewport(narration, viewport);
    await expectLeftOf(artwork, narration);
    await expectNoOverlap(artwork, narration);
    await expect
      .poll(() =>
        line.evaluate(
          (element) => element.scrollHeight <= element.clientHeight,
        ),
      )
      .toBe(true);
  });
}

test("a saved portrait stays inside a boxed learner turn in short landscape", async ({
  page,
}) => {
  const viewport = { width: 640, height: 360 };
  await page.setViewportSize(viewport);
  await mockSavedLessonPortrait(page);
  await page.goto(lessonPath);
  await page.getByRole("button", { name: "Start lesson" }).click();
  await waitForLearnerTurn(page);

  const artwork = page.getByRole("region", { name: "Lesson artwork" });
  const prompt = page.getByRole("region", { name: "Your turn" });
  const portrait = prompt.getByRole("img", { name: "You in storybook style" });
  const controls = page.getByRole("navigation", { name: "Speaking controls" });

  const portraitBox = await expectInsideViewport(portrait, viewport);
  expect(portraitBox.width).toBeGreaterThanOrEqual(44);
  expect(portraitBox.height).toBeGreaterThanOrEqual(44);
  await expectContainedBy(portrait, prompt);
  await expectLeftOf(artwork, prompt);
  await expectLeftOf(artwork, controls);
  await expectNoOverlap(artwork, prompt);
  await expectNoOverlap(artwork, controls);
  await expectNoOverlap(prompt, controls);
  await expectNoPageOverflow(page);
});

test("playback controls pause, resume, and navigate between scenes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(lessonPath);
  await installAudioDelay(page, 5_000);
  await page.getByRole("button", { name: "Start lesson" }).click();

  const controls = page.getByRole("navigation", {
    name: "Lesson playback controls",
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __lessonAudioCreations?: number })
            .__lessonAudioCreations ?? 0,
      ),
    )
    .toBe(1);
  await controls.getByRole("button", { name: "Pause lesson" }).click();
  await expect(
    controls.getByRole("button", { name: "Resume lesson" }),
  ).toBeVisible();
  await expect(page.getByText("Look! My ball!", { exact: true })).toBeVisible();

  await controls.getByRole("button", { name: "Resume lesson" }).click();
  await expect(
    controls.getByRole("button", { name: "Pause lesson" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __lessonAudioCreations?: number })
            .__lessonAudioCreations ?? 0,
      ),
    )
    .toBe(1);
  await controls.getByRole("button", { name: "Next scene" }).click();
  await expect(page).toHaveURL(/\/scenes\/2$/);
  await expect(
    page.getByRole("region", { name: "Lesson progress" }),
  ).toContainText("Peppa Cannot Reach");

  await controls.getByRole("button", { name: "Previous scene" }).click();
  await expect(page).toHaveURL(/\/scenes\/1$/);
  await expect(
    page.getByRole("region", { name: "Lesson progress" }),
  ).toContainText("The Ball Up High");
});

test("Skip advances past the learner line without evaluation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(lessonPath);
  await page.getByRole("button", { name: "Start lesson" }).click();
  await waitForLearnerTurn(page);

  await page.getByRole("button", { name: "Skip speaking turn" }).click();

  await expect(page).toHaveURL(/\/scenes\/2$/);
  await expect(
    page.getByRole("region", { name: "Lesson progress" }),
  ).toContainText("Peppa Cannot Reach");
  await expect(
    page.getByRole("region", { name: "Speaking feedback" }),
  ).toBeHidden();
});

test("narration is distinct from character speech", async ({ page }) => {
  await page.goto(lessonPath);
  await installAudioDelay(page, 50, {
    delayMs: 5_000,
    source: "narrator-copy-dolly",
  });
  await page.getByRole("button", { name: "Start lesson" }).click();

  const narration = page.getByRole("status", { name: "Lesson narration" });
  await expect(narration).toContainText("Let's copy Dolly!", {
    timeout: 3_000,
  });
  await expect(narration).toContainText("Story");
});

test("checking and feedback replace the speaking action", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(lessonPath);
  await installAudioDelay(page, 10);
  await page.getByRole("button", { name: "Start lesson" }).click();
  const microphone = await waitForLearnerTurn(page);

  await microphone.click();
  await expect(microphone).toHaveAttribute("aria-pressed", "true");
  await expect(microphone).toContainText("Tap when done");

  await microphone.click();
  await expect(
    page.getByRole("status").filter({ hasText: "Checking your words…" }),
  ).toBeVisible();
  await expect(microphone).toBeHidden();

  const feedback = page.getByRole("region", { name: "Speaking feedback" });
  const speakingControls = page.getByRole("navigation", {
    name: "Speaking controls",
  });
  await expect(feedback).toContainText("You did it!", { timeout: 3_000 });
  await expect(feedback).toContainText("Great job!");
  await expect(speakingControls).toBeHidden();
  await page.waitForTimeout(800);
  await expect(feedback).toBeVisible();
  await expect(feedback).toBeHidden({ timeout: 3_000 });
  await expect(page).toHaveURL(/\/scenes\/2$/);
  await expect(
    page.getByRole("region", { name: "Lesson progress" }),
  ).toContainText("Peppa Cannot Reach");
});

test("retry feedback uses universal, name-free copy", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${lessonPath}?parrotE2eScenario=incorrect`);
  await installAudioDelay(page, 10, {
    delayMs: 15_000,
    source: "narrator-feedback-retry.mp3",
  });
  await page.getByRole("button", { name: "Start lesson" }).click();
  const microphone = await waitForLearnerTurn(page);

  await microphone.click();
  await microphone.click();

  const feedback = page.getByRole("region", { name: "Speaking feedback" });
  await expect(feedback).toContainText("Try once more", { timeout: 3_000 });
  await expect(feedback).toContainText("Almost! Try again.");
  await expect(feedback).not.toContainText("Bella");
});

test("microphone setup gives immediate feedback and blocks duplicate actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(lessonPath);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () =>
          new Promise<MediaStream>((resolve) => {
            const testWindow = window as Window & {
              __resolveLessonMicrophone?: () => void;
            };
            testWindow.__resolveLessonMicrophone = () => {
              const track = { stop() {} } as MediaStreamTrack;
              resolve({
                getAudioTracks: () => [track],
                getTracks: () => [track],
              } as unknown as MediaStream);
            };
          }),
      },
    });
  });

  await page.getByRole("button", { name: "Start lesson" }).click();
  const microphone = await waitForLearnerTurn(page);
  const skip = page.getByRole("button", { name: "Skip speaking turn" });
  const prompt = page.getByRole("region", { name: "Your turn" });
  await microphone.click();

  await expect(microphone).toContainText("Opening mic…");
  await expect(microphone).toHaveAttribute("aria-busy", "true");
  await expect(microphone).toBeDisabled();
  await expect(skip).toBeDisabled();
  await expect(prompt).toContainText("Opening mic");

  await page.evaluate(() => {
    const testWindow = window as Window & {
      __resolveLessonMicrophone?: () => void;
    };
    testWindow.__resolveLessonMicrophone?.();
  });
  await expect(microphone).toContainText("Tap when done");
  await expect(microphone).toHaveAttribute("aria-pressed", "true");
  await expect(prompt).toContainText("Listening");
  await microphone.click();
});

test("completion becomes a focused end screen and replay restarts the story", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(lessonPath);
  await installAudioDelay(page, 10);
  await page.getByRole("button", { name: "Start lesson" }).click();

  for (let turn = 0; turn < 6; turn += 1) {
    const microphone = await waitForLearnerTurn(page);
    await microphone.click();
    await expect(microphone).toHaveAttribute("aria-pressed", "true");
    await microphone.click();
    if (turn === 0) {
      await expect(page).toHaveURL(/\/scenes\/2$/, { timeout: 4_000 });
    }
  }

  const completion = page.getByRole("region", { name: "Lesson completion" });
  await expect(completion).toContainText("Lesson complete!", {
    timeout: 5_000,
  });
  await expect(completion).toContainText("You finished Peppa's High Ball!");
  await expect(page.getByRole("region", { name: "Lesson progress" })).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Speaking controls" })).toBeHidden();
  await expect(page.getByAltText(/Peppa/)).toBeHidden();
  await expect(page.getByText("Great job!", { exact: true })).toBeHidden();

  await installAudioDelay(page, 2_000);
  await completion.getByRole("button", { name: "Replay lesson" }).click();
  await expect(completion).toBeHidden();
  await expect(page).toHaveURL(/\/scenes\/1$/);
  await expect(page.getByRole("region", { name: "Lesson progress" })).toBeVisible();
  await expect(page.getByText("Look! My ball!", { exact: true })).toBeVisible();
});

for (const viewport of viewports) {
  test(`long learner dialogue stays readable on a ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await mockLongDialogueLesson(page);
    await page.goto("/lessons/my/long-dialogue/scenes/1");
    await page.getByRole("button", { name: "Start lesson" }).click();

    const hud = page.getByRole("region", { name: "Lesson progress" });
    const prompt = page.getByRole("region", { name: "Your turn" });
    const phrase = prompt.getByText(longDialogue, { exact: true });
    const peppa = page.getByAltText(/Peppa/);
    const dolly = page.getByAltText(/Dolly/);
    const controls = page.getByRole("navigation", {
      name: "Speaking controls",
    });

    await expectInsideViewport(prompt, viewport);
    await expectInsideViewport(phrase, viewport);
    await expectBefore(hud, prompt);
    if (usesLayeredLearningPane(viewport)) {
      await expectLeftOf(peppa, prompt);
      await expectLeftOf(dolly, prompt);
      await expectLeftOf(peppa, controls);
      await expectLeftOf(dolly, controls);
      await expectNoOverlap(peppa, prompt);
      await expectNoOverlap(dolly, prompt);
      await expectNoOverlap(peppa, controls);
      await expectNoOverlap(dolly, controls);
    } else {
      await expectBefore(prompt, peppa);
      await expectBefore(prompt, dolly);
      await expectBefore(peppa, controls);
      await expectBefore(dolly, controls);
    }
    await expectNoPageOverflow(page);
    if (usesLayeredLearningPane(viewport)) {
      await expectLongTextReachable(phrase);
    } else {
      await expect
        .poll(() =>
          prompt.evaluate(
            (element) => element.scrollHeight <= element.clientHeight,
          ),
        )
        .toBe(true);
    }
  });
}

test("a microphone error stays above the speaking controls on a narrow phone", async ({
  page,
}) => {
  const viewport = { width: 280, height: 568 };
  await page.setViewportSize(viewport);
  await page.goto(lessonPath);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException("Permission denied", "NotAllowedError");
        },
      },
    });
  });

  await page.getByRole("button", { name: "Start lesson" }).click();
  const microphone = await waitForLearnerTurn(page);
  await microphone.click();

  const error = page.getByRole("alert");
  const controls = page.getByRole("navigation", {
    name: "Speaking controls",
  });
  await expect(error).toContainText(
    "Please allow microphone access, then tap the microphone again.",
  );
  await expectInsideViewport(error, viewport);
  await expectBefore(error, controls);
  await expectNoPageOverflow(page);
});
