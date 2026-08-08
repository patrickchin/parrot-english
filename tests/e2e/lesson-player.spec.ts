import { expect, test, type Locator, type Page } from "@playwright/test";

const lessonPath = "/lessons/parrot/01-peppas-high-ball/scenes/1";
const fullSceneLessonPath =
  "/lessons/parrot/02-garden-colors/variants/full-scene/scenes/1";
const longDialogue =
  "Can you help me carry the bright yellow picnic basket to the big tree, please? I want to share apples, sandwiches, and juice with all our friends.";

const viewports = [
  { name: "ultra-narrow phone", width: 280, height: 568 },
  { name: "regular phone", width: 390, height: 844 },
  { name: "short landscape", width: 768, height: 600 },
  { name: "desktop", width: 1440, height: 900 },
];

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
  await expect(introduction.getByText("5 scenes", { exact: true })).toBeVisible();
  await expect(
    introduction.getByText(
      "Listen to the story, then speak when it is your turn.",
      { exact: true },
    ),
  ).toBeVisible();

  const start = page.getByRole("button", { name: "Start lesson" });
  await expect(start).toBeFocused();
  await expect(page.getByAltText("A sunny garden with flowers and a tall tree")).toBeVisible();
  await expect(page.getByRole("region", { name: "Lesson progress" })).toBeHidden();
  await expect(page.getByText("Look! My ball!", { exact: true })).toBeHidden();
  await expect(page.getByAltText(/Peppa/)).toBeHidden();
  await expect(page.getByAltText(/Dolly/)).toBeHidden();
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
    const peppa = page.getByAltText(/Peppa/);
    const dolly = page.getByAltText(/Dolly/);
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
    await expectInsideViewport(peppa, viewport);
    await expectInsideViewport(dolly, viewport);
    await expectNoOverlap(back, hud);
    await expectNoOverlap(account, hud);
    await expectBefore(hud, speech);
    await expectBefore(speech, peppa);
    await expectBefore(speech, dolly);
    await expect(
      page.getByRole("region", { name: "Lesson introduction" }),
    ).toBeHidden();
    const playbackControls = page.getByRole("navigation", {
      name: "Story playback controls",
    });
    await expectInsideViewport(playbackControls, viewport);
    const previous = playbackControls.getByRole("button", {
      name: "Previous scene",
    });
    const pause = playbackControls.getByRole("button", {
      name: "Pause story",
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
    await expectInsideViewport(peppa, viewport);
    await expectInsideViewport(dolly, viewport);
    await expectBefore(hud, prompt);
    await expectBefore(prompt, peppa);
    await expectBefore(prompt, dolly);
    await expectBefore(peppa, controls);
    await expectBefore(dolly, controls);
    await expectLeftOf(microphone, skip);
    await expectNoPageOverflow(page);
  });
}

for (const viewport of viewports) {
  test(`full-scene artwork stays boxed on a ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(fullSceneLessonPath);
    await installAudioDelay(page, 5_000);
    await page.getByRole("button", { name: "Start lesson" }).click();

    const artwork = page.getByRole("region", {
      name: "Full-scene artwork",
    });
    const image = artwork.getByRole("img", {
      name: /Peppa and Dolly discover many colorful flowers/i,
    });

    const artworkBox = await expectInsideViewport(artwork, viewport);
    await expectInsideViewport(image, viewport);
    await expect(artwork).toHaveAttribute("data-frame-preset", "landscape");
    await expect(artwork.getByText("Landscape · 3:2", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Lesson progress" }),
    ).toContainText("Colorful Flowers");
    await expect(page.getByText("Look at the flowers!", { exact: true })).toBeVisible();
    await expect(page.locator("[data-character]")).toHaveCount(0);
    expect(artworkBox.width).toBeLessThan(viewport.width);
    expect(artworkBox.height).toBeLessThan(viewport.height);
    await expectNoPageOverflow(page);
  });
}

test("the full-scene route keeps the same lesson flow while each scene selects its frame", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(fullSceneLessonPath);
  await installAudioDelay(page, 5_000);
  await page.getByRole("button", { name: "Start lesson" }).click();

  const controls = page.getByRole("navigation", {
    name: "Story playback controls",
  });
  const artwork = page.getByRole("region", { name: "Full-scene artwork" });

  await controls.getByRole("button", { name: "Next scene" }).click();
  await expect(page).toHaveURL(
    /\/lessons\/parrot\/02-garden-colors\/variants\/full-scene\/scenes\/2$/,
  );
  await expect(artwork).toHaveAttribute("data-frame-preset", "square");
  await expect(artwork.getByText("Square · 1:1", { exact: true })).toBeVisible();
  let artworkBox = await visibleBox(artwork);
  expect(Math.abs(artworkBox.width - artworkBox.height)).toBeLessThanOrEqual(2);

  await controls.getByRole("button", { name: "Next scene" }).click();
  await expect(page).toHaveURL(/\/variants\/full-scene\/scenes\/3$/);
  await expect(artwork).toHaveAttribute("data-frame-preset", "portrait");
  await expect(artwork.getByText("Portrait · 2:3", { exact: true })).toBeVisible();
  artworkBox = await visibleBox(artwork);
  expect(artworkBox.height).toBeGreaterThan(artworkBox.width);

  await controls.getByRole("button", { name: "Next scene" }).click();
  await expect(page).toHaveURL(/\/variants\/full-scene\/scenes\/4$/);
  await expect(artwork).toHaveAttribute("data-frame-preset", "wide");
  await expect(artwork.getByText("Wide · 16:9", { exact: true })).toBeVisible();

  await controls.getByRole("button", { name: "Next scene" }).click();
  await expect(page).toHaveURL(/\/variants\/full-scene\/scenes\/5$/);
  await expect(artwork).toHaveAttribute("data-frame-preset", "free");
  await expect(artwork.getByText("Natural size", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Lesson progress" }),
  ).toContainText("The Finished Basket");
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
    name: "Story playback controls",
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
  await controls.getByRole("button", { name: "Pause story" }).click();
  await expect(
    controls.getByRole("button", { name: "Resume story" }),
  ).toBeVisible();
  await expect(page.getByText("Look! My ball!", { exact: true })).toBeVisible();

  await controls.getByRole("button", { name: "Resume story" }).click();
  await expect(
    controls.getByRole("button", { name: "Pause story" }),
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

  const narration = page.getByRole("status", { name: "Story narration" });
  await expect(narration).toContainText("Let's copy Dolly!", {
    timeout: 3_000,
  });
  await expect(narration).toContainText("Story");
});

test("checking and feedback replace the speaking action", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(lessonPath);
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
  await expect(feedback).toContainText("You did it!", { timeout: 3_000 });
  await expect(feedback).toContainText("Great job!");
  await expect(
    page.getByRole("navigation", { name: "Speaking controls" }),
  ).toBeHidden();
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
  await expect(completion).toContainText("Story complete!", {
    timeout: 5_000,
  });
  await expect(completion).toContainText("You finished Peppa's High Ball!");
  await expect(page.getByRole("region", { name: "Lesson progress" })).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Speaking controls" })).toBeHidden();
  await expect(page.getByAltText(/Peppa/)).toBeHidden();
  await expect(page.getByText("Great job, Bella! Peppa has her ball!")).toBeHidden();

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
    await expectBefore(prompt, peppa);
    await expectBefore(prompt, dolly);
    await expectBefore(peppa, controls);
    await expectBefore(dolly, controls);
    await expectNoPageOverflow(page);
    await expect
      .poll(() =>
        prompt.evaluate(
          (element) => element.scrollHeight <= element.clientHeight,
        ),
      )
      .toBe(true);
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
