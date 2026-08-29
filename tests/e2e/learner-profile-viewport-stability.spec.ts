import { expect, test, type Locator, type Page } from "@playwright/test";

const profilePath = "/profile/setup?parrotE2eProfile=viewport-stability";
const resumeProfilePath = "/profile/setup?parrotE2eProfile=viewport-resume";
const peppaPath = "https://media.parrotbook.com/assets/v3/characters/peppa/peppa-happy.webp";
const longAccountEmail =
  "family.account.for.alexandria.montgomery@example.test";

const targetViewports = [
  { height: 568, name: "ultra-narrow phone", width: 280 },
  { height: 640, name: "compact phone", width: 360 },
  { height: 844, name: "regular phone", width: 390 },
  { height: 360, name: "short landscape", width: 640 },
  { height: 900, name: "desktop", width: 1440 },
] as const;

type Rect = { height: number; width: number; x: number; y: number };
type Viewport = { height: number; name: string; width: number };

async function rect(locator: Locator): Promise<Rect> {
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { height: box.height, width: box.width, x: box.x, y: box.y };
  });
}

async function expectInsideViewport(locator: Locator, viewport: Viewport) {
  await expect(locator).toBeVisible();
  const box = await rect(locator);

  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function expectMinimumTarget(locator: Locator) {
  const box = await rect(locator);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
}

async function expectTargetSize(
  locator: Locator,
  expected: { height: number; width: number },
) {
  const box = await rect(locator);
  expect(box.height).toBe(expected.height);
  expect(box.width).toBe(expected.width);
}

async function expectFocusPaintInsideViewport(page: Page, target: Locator) {
  const indicator = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      focusVisible: element.matches(":focus-visible"),
      paint:
        Number.parseFloat(style.outlineOffset) +
        Number.parseFloat(style.outlineWidth),
    };
  });
  expect(indicator.focusVisible).toBe(true);

  const targetPaint = expandRect(await rect(target), indicator.paint);
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(targetPaint.x).toBeGreaterThanOrEqual(0);
  expect(targetPaint.y).toBeGreaterThanOrEqual(0);
  expect(targetPaint.x + targetPaint.width).toBeLessThanOrEqual(
    viewport!.width,
  );
  expect(targetPaint.y + targetPaint.height).toBeLessThanOrEqual(
    viewport!.height,
  );
}

async function expectSingleTextLine(locator: Locator) {
  const lineCount = await locator.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return Array.from(range.getClientRects()).filter(
      (rect) => rect.width > 0 && rect.height > 0,
    ).length;
  });
  expect(lineCount).toBe(1);
}

async function expectTextBlockLineCount(locator: Locator, expected: number) {
  const lineCount = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return Math.round(
      element.getBoundingClientRect().height /
        Number.parseFloat(style.lineHeight),
    );
  });
  expect(lineCount).toBe(expected);
}

function boxesOverlap(first: Rect, second: Rect) {
  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}

function expandRect(box: Rect, amount: number): Rect {
  return {
    height: box.height + amount * 2,
    width: box.width + amount * 2,
    x: box.x - amount,
    y: box.y - amount,
  };
}

async function expectAccountClearOf(page: Page, targets: Locator[]) {
  const account = page.getByRole("button", { name: /^Profile for / });
  await expect(account).toBeVisible();
  const accountBox = await rect(account);

  for (const target of targets) {
    await expect(target).toBeVisible();
    const label = await target.evaluate(
      (element) =>
        element.getAttribute("aria-label") ??
        element.getAttribute("alt") ??
        element.textContent?.trim(),
    );
    expect(
      boxesOverlap(accountBox, await rect(target)),
      `Account control overlaps ${label}`,
    ).toBe(false);
  }
}

async function expectReplayFocusPaintClear(page: Page, target: Locator) {
  const account = page.getByRole("button", { name: /^Profile for / });
  const progress = page.getByText(/^Question \d+ of \d+$/);
  const indicator = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      focusVisible: element.matches(":focus-visible"),
      outlineOffset: Number.parseFloat(style.outlineOffset),
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(indicator.focusVisible).toBe(true);
  expect(indicator.outlineStyle).not.toBe("none");

  const targetPaint = expandRect(
    await rect(target),
    indicator.outlineOffset + indicator.outlineWidth,
  );
  expect(
    boxesOverlap(await rect(account), targetPaint),
    "Account control overlaps the Replay focus paint",
  ).toBe(false);
  expect(
    boxesOverlap(await rect(progress), targetPaint),
    "Progress text overlaps the Replay focus paint",
  ).toBe(false);

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(targetPaint.x).toBeGreaterThanOrEqual(0);
  expect(targetPaint.y).toBeGreaterThanOrEqual(0);
  expect(targetPaint.x + targetPaint.width).toBeLessThanOrEqual(
    viewport!.width,
  );
  expect(targetPaint.y + targetPaint.height).toBeLessThanOrEqual(
    viewport!.height,
  );
}

async function expectAccountFocusPaintClearOf(page: Page, targets: Locator[]) {
  const account = page.getByRole("button", { name: /^Profile for / });
  const indicator = await account.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      focusVisible: element.matches(":focus-visible"),
      outlineOffset: Number.parseFloat(style.outlineOffset),
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(indicator.focusVisible).toBe(true);
  expect(indicator.outlineStyle).not.toBe("none");
  const accountPaint = expandRect(
    await rect(account),
    indicator.outlineOffset + indicator.outlineWidth,
  );

  for (const target of targets) {
    expect(
      boxesOverlap(accountPaint, await rect(target)),
      `Account focus paint overlaps ${(await target.getAttribute("aria-label")) ?? (await target.textContent())?.trim()}`,
    ).toBe(false);
  }

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(accountPaint.x).toBeGreaterThanOrEqual(0);
  expect(accountPaint.y).toBeGreaterThanOrEqual(0);
  expect(accountPaint.x + accountPaint.width).toBeLessThanOrEqual(
    viewport!.width,
  );
  expect(accountPaint.y + accountPaint.height).toBeLessThanOrEqual(
    viewport!.height,
  );
}

async function installFallbackAccountIdentity(page: Page) {
  await page.route("**/api/auth/get-session", async (route) => {
    const response = await route.fetch();
    const payload = (await response.json()) as {
      user: { email: string; name?: string | null };
    };
    payload.user.name = "   ";
    payload.user.email = longAccountEmail;
    await route.fulfill({ response, json: payload });
  });
}

async function expectPointerOwnedBy(target: Locator) {
  const box = await rect(target);
  const points = [
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    { x: box.x + box.width * 0.6, y: box.y + 2 },
    { x: box.x + box.width - 2, y: box.y + box.height / 2 },
  ];

  for (const point of points) {
    expect(
      await target.evaluate(
        (element, sample) =>
          document.elementFromPoint(sample.x, sample.y)?.closest("button") ===
          element,
        point,
      ),
      `Replay does not own pointer sample ${JSON.stringify(point)}`,
    ).toBe(true);
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const main = document.querySelector("main");
        return {
          document: document.documentElement.scrollWidth - window.innerWidth,
          main: main ? main.scrollWidth - main.clientWidth : -1,
        };
      }),
    )
    .toEqual({ document: 0, main: 0 });
}

async function expectMainAtOrigin(page: Page) {
  await expect
    .poll(() => page.getByRole("main").evaluate((element) => element.scrollTop))
    .toBe(0);
}

async function mainScrollRange(page: Page) {
  return page
    .getByRole("main")
    .evaluate((element) => element.scrollHeight - element.clientHeight);
}

function maxRectDelta(before: Rect[], after: Rect[]) {
  return Math.max(
    ...before.flatMap((value, index) => [
      Math.abs(value.height - after[index].height),
      Math.abs(value.width - after[index].width),
      Math.abs(value.x - after[index].x),
      Math.abs(value.y - after[index].y),
    ]),
  );
}

async function expectDelayedImageKeepsGeometry({
  anchors,
  image,
  page,
  token,
}: {
  anchors: Locator[];
  image: Locator;
  page: Page;
  token: string;
}) {
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => element.naturalWidth),
    )
    .toBeGreaterThan(0);

  await image.evaluate((element) => {
    element.removeAttribute("sizes");
    element.removeAttribute("srcset");
    element.removeAttribute("src");
  });
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => element.naturalWidth),
    )
    .toBe(0);

  const delayedPath = `${peppaPath}?geometry=${token}`;
  let release = () => {};
  let finishRequest: Promise<void> = Promise.resolve();
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route(`**${delayedPath}`, (route) => {
    finishRequest = (async () => {
      await held;
      await route.continue();
    })();
    return finishRequest;
  });

  try {
    await image.evaluate(
      (element, src) => element.setAttribute("src", src),
      delayedPath,
    );
    await expect
      .poll(() =>
        image.evaluate((element: HTMLImageElement) => element.naturalWidth),
      )
      .toBe(0);
    const pending = await Promise.all([image, ...anchors].map(rect));

    release();
    await expect
      .poll(() =>
        image.evaluate((element: HTMLImageElement) => element.naturalWidth),
      )
      .toBe(1024);
    expect(
      maxRectDelta(pending, await Promise.all([image, ...anchors].map(rect))),
    ).toBeLessThanOrEqual(1);
  } finally {
    release();
    await finishRequest.catch(() => {});
    await page.unroute(`**${delayedPath}`);
  }
}

async function openSetup(page: Page, viewport: Viewport) {
  await page.setViewportSize(viewport);
  await page.goto(profilePath);
  const heading = page.getByRole("heading", {
    name: "Answer 6 questions",
  });
  await expect(heading).toBeVisible();
  return heading;
}

async function installProfileMicrophoneCounter(page: Page) {
  await page.evaluate(() => {
    const measuredWindow = window as Window & {
      __parrotE2eProfileMicrophoneRequests?: number;
    };
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    measuredWindow.__parrotE2eProfileMicrophoneRequests = 0;
    navigator.mediaDevices.getUserMedia = (constraints) => {
      measuredWindow.__parrotE2eProfileMicrophoneRequests! += 1;
      return originalGetUserMedia(constraints);
    };
  });

  return () =>
    page.evaluate(
      () =>
        (
          window as Window & {
            __parrotE2eProfileMicrophoneRequests?: number;
          }
        ).__parrotE2eProfileMicrophoneRequests ?? 0,
    );
}

async function openFirstProfileQuestion(page: Page, viewport: Viewport) {
  await openSetup(page, viewport);
  await page.getByRole("button", { name: "Start questions" }).click();
  const heading = page.getByRole("heading", {
    name: "Hi! I'm Peppa. What's your name?",
  });
  await expect(heading).toBeFocused();
  return heading;
}

test("profile setup names the task and saved-answer facts in literal language", async ({
  page,
}) => {
  const viewport = targetViewports[0];
  const heading = await openSetup(page, viewport);
  const main = page.getByRole("main");
  const start = page.getByRole("button", { name: "Start questions" });

  await expect(heading).toBeFocused();
  await expect(
    page.getByText(
      "We save your answers. A grown-up can change your name and age.",
      { exact: true },
    ),
  ).toBeVisible();
  await expectSingleTextLine(page.getByText("A grown-up", { exact: true }));
  await expectSingleTextLine(page.getByText("name and age.", { exact: true }));
  await expect(start).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Skip for now" }),
  ).toBeVisible();
  await expect(main).not.toContainText(
    /Help Peppa get to know you|personalize|Learner profile|\bquick\b|Set up profile/i,
  );

  await page.keyboard.press("Tab");
  await expect(start).toBeFocused();
});

test("profile answer and microphone keep separate native labels and controls", async ({
  page,
}) => {
  const viewport = targetViewports[0];
  await openFirstProfileQuestion(page, viewport);
  const answer = page.getByRole("textbox", {
    exact: true,
    name: "Your answer",
  });
  const combinedAnswer = page.getByRole("textbox", {
    exact: true,
    name: "Your answer Speak your answer",
  });
  const speak = page.getByRole("button", {
    exact: true,
    name: "Speak your answer",
  });

  await expect(answer).toHaveCount(1);
  await expect(answer).toHaveAccessibleName("Your answer");
  await expect(combinedAnswer).toHaveCount(0);
  await expect(speak).toHaveCount(1);
  await expect(speak).toHaveAccessibleName("Speak your answer");

  const relationships = await answer.evaluate((element) => {
    const textarea = element as HTMLTextAreaElement;
    const label = textarea.labels?.item(0) ?? null;
    const microphone = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Speak your answer"]',
    );

    return {
      buttonLabels: microphone?.labels?.length ?? -1,
      buttonType: microphone?.type ?? null,
      controlMatches: label?.control === textarea,
      labelFor: label?.htmlFor ?? null,
      labelableDescendants:
        label?.querySelectorAll(
          "button, input, meter, output, progress, select, textarea",
        ).length ?? -1,
      labelText: label?.textContent?.trim() ?? null,
      labels: textarea.labels?.length ?? -1,
      microphoneInsideLabel: Boolean(microphone?.closest("label")),
    };
  });
  expect(relationships).toEqual({
    buttonLabels: 0,
    buttonType: "button",
    controlMatches: true,
    labelFor: await answer.getAttribute("id"),
    labelableDescendants: 0,
    labelText: "Your answer",
    labels: 1,
    microphoneInsideLabel: false,
  });

  await page.keyboard.press("Tab");
  await expect(answer).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(speak).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(answer).toBeFocused();

  const visibleLabel = page.getByText("Your answer", { exact: true });
  await visibleLabel.click();
  await expect(answer).toBeFocused();

  const microphoneRequests = await installProfileMicrophoneCounter(page);
  await answer.click();
  await expect.poll(microphoneRequests).toBe(0);
  await speak.click();
  await expect.poll(microphoneRequests).toBe(1);
  await expect(page.getByRole("main").getByRole("status")).toHaveText(
    "Listening…",
  );
  await expect(answer).toBeDisabled();
  await expect(speak).toHaveAttribute("aria-disabled", "true");
  await expect(speak).not.toBeDisabled();
  expect(
    await answer.evaluate(
      (element) =>
        (element.closest("fieldset") as HTMLFieldSetElement | null)?.disabled,
    ),
  ).toBe(false);

  for (const key of ["Enter", "Space"]) {
    await openFirstProfileQuestion(page, viewport);
    const keyboardSpeak = page.getByRole("button", {
      exact: true,
      name: "Speak your answer",
    });
    const keyboardRequests = await installProfileMicrophoneCounter(page);
    await keyboardSpeak.focus();
    await page.keyboard.press(key);
    await expect.poll(keyboardRequests).toBe(1);
    await expect(page.getByRole("main").getByRole("status")).toHaveText(
      "Listening…",
    );
    await expect(keyboardSpeak).toHaveAttribute("aria-disabled", "true");
    await expect(keyboardSpeak).not.toBeDisabled();
    await expect(keyboardSpeak).toBeFocused();
  }
});

for (const viewport of targetViewports) {
  test(`profile setup names the remaining task on resume on a ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(resumeProfilePath);
    const heading = page.getByRole("heading", {
      name: "Answer 5 more questions",
    });
    const resume = page.getByRole("button", { name: "Continue questions" });
    const skip = page.getByRole("button", { name: "Skip for now" });

    await expect(heading).toBeFocused();
    await expect(resume).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Start questions" }),
    ).toHaveCount(0);
    for (const target of [heading, resume, skip]) {
      await expectInsideViewport(target, viewport);
    }
    await expectMinimumTarget(resume);
    await expectMinimumTarget(skip);
    await expectAccountClearOf(page, [heading, resume, skip]);
    await expectNoHorizontalOverflow(page);

    await page.keyboard.press("Tab");
    await expect(resume).toBeFocused();
  });
}

for (const viewport of targetViewports) {
  test(`profile setup keeps each transition usable on a ${viewport.name}`, async ({
    page,
  }) => {
    const setupHeading = await openSetup(page, viewport);
    const setupImage = page.getByRole("img", { name: "Peppa waving hello" });
    const setup = page.getByRole("button", { name: "Start questions" });
    const skip = page.getByRole("button", { name: "Skip for now" });

    await expectMainAtOrigin(page);
    for (const target of [setupHeading, setup, skip]) {
      await expectInsideViewport(target, viewport);
    }
    await expectMinimumTarget(setup);
    await expectMinimumTarget(skip);
    await expectAccountClearOf(page, [setupImage, setupHeading, setup, skip]);
    await expectNoHorizontalOverflow(page);

    await setup.click();
    const nameHeading = page.getByRole("heading", {
      name: "Hi! I'm Peppa. What's your name?",
    });
    const replay = page.getByRole("button", { name: "Replay question" });
    await expect(
      page.getByText("你好！我是佩奇。你叫什么名字？", { exact: true }),
    ).toBeVisible();
    const answerLabel = page.getByText("Your answer", { exact: true });
    const answer = page.getByRole("textbox", {
      exact: true,
      name: "Your answer",
    });
    const speak = page.getByRole("button", { name: "Speak your answer" });
    const questionSkip = page.getByRole("button", { name: "Skip for now" });
    const questionNext = page.getByRole("button", {
      exact: true,
      name: "Next",
    });

    await expect(nameHeading).toBeFocused();
    await expect(replay).toBeEnabled();
    await expectMainAtOrigin(page);
    for (const target of [
      replay,
      nameHeading,
      answerLabel,
      answer,
      speak,
      questionSkip,
      questionNext,
    ]) {
      await expectInsideViewport(target, viewport);
    }
    for (const target of [replay, speak, questionSkip, questionNext]) {
      await expectMinimumTarget(target);
    }
    await expectAccountClearOf(page, [
      replay,
      page.getByRole("img", { name: "Peppa, your English host" }),
      nameHeading,
      answerLabel,
      answer,
      speak,
      questionSkip,
      questionNext,
    ]);
    await expectTextBlockLineCount(
      page.getByText("Question 1 of 6", { exact: true }),
      1,
    );
    await expectPointerOwnedBy(replay);
    await expectNoHorizontalOverflow(page);

    await page.keyboard.press("Shift+Tab");
    await expect(replay).toBeFocused();
    await expectReplayFocusPaintClear(page, replay);
    await page.keyboard.press("Tab");
    await expect(answer).toBeFocused();

    if (viewport.width === 640 && viewport.height === 360) {
      expect(
        await mainScrollRange(page),
        "Compact-header reflow increased the 13px short-landscape scroll extent",
      ).toBeLessThanOrEqual(13);
    }

    await answer.fill("Mia");
    const main = page.getByRole("main");
    const scrollRange = await main.evaluate(
      (element) => element.scrollHeight - element.clientHeight,
    );
    await main.evaluate((element) => element.scrollTo(0, element.scrollHeight));
    if (scrollRange > 0) {
      await expect
        .poll(() => main.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);
    }
    await questionNext.click();

    const acknowledgment = page.getByRole("heading", {
      name: "Thank you!",
    });
    const acknowledgmentNext = page.getByRole("button", {
      exact: true,
      name: "Next",
    });
    await expect(acknowledgment).toBeFocused();
    await expectMainAtOrigin(page);
    await expectInsideViewport(acknowledgmentNext, viewport);
    await expectMinimumTarget(acknowledgmentNext);
    await expectAccountClearOf(page, [
      page.getByRole("img", { name: "Peppa smiling" }),
      acknowledgment,
      acknowledgmentNext,
    ]);
    await expectNoHorizontalOverflow(page);

    await acknowledgmentNext.click();
    const ageHeading = page.getByRole("heading", { name: "How old are you?" });
    const ageAnswer = page.getByRole("textbox", {
      exact: true,
      name: "Your answer",
    });
    const ageSpeak = page.getByRole("button", { name: "Speak your answer" });
    const ageSkip = page.getByRole("button", { name: "Skip for now" });
    const ageNext = page.getByRole("button", { exact: true, name: "Next" });
    await expect(ageHeading).toBeFocused();
    await expect(
      page.getByText("Question 2 of 6", { exact: true }),
    ).toBeVisible();
    await expectMainAtOrigin(page);
    for (const target of [
      ageHeading,
      page.getByText("Your answer", { exact: true }),
      ageAnswer,
      ageSpeak,
      ageSkip,
      ageNext,
    ]) {
      await expectInsideViewport(target, viewport);
    }
    for (const target of [ageSpeak, ageSkip, ageNext]) {
      await expectMinimumTarget(target);
    }
    await expectAccountClearOf(page, [
      page.getByRole("img", { name: "Peppa, your English host" }),
      ageHeading,
      ageAnswer,
      ageSpeak,
      ageSkip,
      ageNext,
    ]);
    await expectNoHorizontalOverflow(page);
  });

  test(`profile art and direct learner details keep stable geometry on a ${viewport.name}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const setupHeading = await openSetup(page, viewport);
    const setup = page.getByRole("button", { name: "Start questions" });
    await expectDelayedImageKeepsGeometry({
      anchors: [setupHeading, setup],
      image: page.getByRole("img", { name: "Peppa waving hello" }),
      page,
      token: `${viewport.width}-setup`,
    });

    await setup.click();
    const nameHeading = page.getByRole("heading", {
      name: "Hi! I'm Peppa. What's your name?",
    });
    const answer = page.getByRole("textbox", {
      exact: true,
      name: "Your answer",
    });
    await expectDelayedImageKeepsGeometry({
      anchors: [nameHeading, answer],
      image: page.getByRole("img", { name: "Peppa, your English host" }),
      page,
      token: `${viewport.width}-question`,
    });

    await answer.fill("Mia");
    await page.getByRole("button", { exact: true, name: "Next" }).click();
    const acknowledgment = page.getByRole("heading", {
      name: "Thank you!",
    });
    const acknowledgmentNext = page.getByRole("button", {
      exact: true,
      name: "Next",
    });
    await expectDelayedImageKeepsGeometry({
      anchors: [acknowledgment, acknowledgmentNext],
      image: page.getByRole("img", { name: "Peppa smiling" }),
      page,
      token: `${viewport.width}-acknowledgment`,
    });

    await page.goto(
      "/guardian/learners/e2e-learner?parrotE2eProfile=viewport-stability&parrotE2eGuardian=guardian",
    );
    const editorHeading = page.getByRole("heading", {
      name: "Learner details",
    });
    await expect(editorHeading).toBeVisible();
    await expectInsideViewport(editorHeading, viewport);
    const recordings = page.getByRole("region", {
      name: "Lesson voice recordings",
    });
    await recordings.scrollIntoViewIfNeeded();
    await expectInsideViewport(recordings, viewport);
    await expect(
      page.getByRole("button", { name: "Redo setup questions" }),
    ).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
}

test("profile Replay and grown-up access gateway remain independently operable", async ({
  page,
}) => {
  const viewport = targetViewports[0];
  await openSetup(page, viewport);
  await page.getByRole("button", { name: "Start questions" }).click();

  const replay = page.getByRole("button", { name: "Replay question" });
  await expect(replay).toBeDisabled();
  await expect(replay).toBeEnabled();
  await page.evaluate(() => {
    const measuredWindow = window as Window & {
      __parrotE2eProfileReplayCount?: number;
    };
    const originalPlay = window.Audio.prototype.play;
    measuredWindow.__parrotE2eProfileReplayCount = 0;
    window.Audio.prototype.play = function play() {
      measuredWindow.__parrotE2eProfileReplayCount! += 1;
      return originalPlay.call(this);
    };
  });
  const replayCount = () =>
    page.evaluate(
      () =>
        (window as Window & { __parrotE2eProfileReplayCount?: number })
          .__parrotE2eProfileReplayCount ?? 0,
    );

  const replayBox = await rect(replay);
  await replay.click({
    position: { x: replayBox.width / 2, y: replayBox.height / 2 },
  });
  await expect.poll(replayCount).toBe(1);
  await expect(replay).toBeFocused();
  await expect(replay).toBeDisabled();
  await expect(replay).toBeEnabled();
  await page.keyboard.press("Enter");
  await expect.poll(replayCount).toBe(2);

  const account = page.getByRole("button", { name: /^Profile for / });
  await account.click();
  const menu = page.getByRole("menu", { name: "Account menu" });
  const grownUpAccess = menu.getByRole("menuitem", {
    name: /Grown-up access/,
  });
  await expect(menu.getByRole("menuitem")).toHaveText([
    "Grown-up accessPassword optional for now",
  ]);
  await expect(
    page.getByRole("group", { name: "Choose profile mode" }),
  ).toHaveCount(0);
  await expect(grownUpAccess).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(account).toBeFocused();
});

test("a fallback account email stays hidden from learner profile controls", async ({
  page,
}) => {
  await installFallbackAccountIdentity(page);
  const viewports = [
    { height: 568, name: "ultra-narrow phone", width: 280 },
    { height: 640, name: "small reflow phone", width: 320 },
    { height: 640, name: "compact focus boundary", width: 359 },
    { height: 640, name: "first regular pixel", width: 360 },
    { height: 844, name: "regular phone", width: 390 },
    { height: 360, name: "short landscape", width: 640 },
    { height: 621, name: "first post-short tablet pixel", width: 768 },
    { height: 641, name: "last vertical focus seam", width: 768 },
  ];

  for (const viewport of viewports) {
    await openSetup(page, viewport);
    await page.getByRole("button", { name: "Start questions" }).click();

    const heading = page.getByRole("heading", {
      name: "Hi! I'm Peppa. What's your name?",
    });
    const replay = page.getByRole("button", { name: "Replay question" });
    const progress = page.getByText("Question 1 of 6", { exact: true });
    const account = page.getByRole("button", {
      exact: true,
      name: "Profile for Learner, learner mode",
    });
    await expect(page.getByText(longAccountEmail, { exact: true })).toHaveCount(0);

    await expect(replay).toBeDisabled();
    await expect(replay).toBeEnabled();
    await expect(heading).toBeFocused();
    await expectAccountClearOf(page, [replay, progress]);
    await expectMinimumTarget(account);
    const accountBox = await rect(account);
    expect(accountBox.width).toBe(accountBox.height);
    await expectPointerOwnedBy(replay);
    await expectNoHorizontalOverflow(page);

    await page.keyboard.press("Shift+Tab");
    await expect(replay).toBeFocused();
    await expectReplayFocusPaintClear(page, replay);

    await page.keyboard.press("Shift+Tab");
    await expect(account).toBeFocused();
    await expectAccountFocusPaintClearOf(page, [replay, progress]);
    await expectNoHorizontalOverflow(page);
  }
});

for (const viewport of [
  { height: 640, name: "320px reflow phone", width: 320 },
  { height: 640, name: "359px compact boundary", width: 359 },
]) {
  test(`profile controls stay discoverable at the ${viewport.name}`, async ({
    page,
  }) => {
    await openSetup(page, viewport);
    await page.getByRole("button", { name: "Start questions" }).click();

    const heading = page.getByRole("heading", {
      name: "Hi! I'm Peppa. What's your name?",
    });
    const replay = page.getByRole("button", { name: "Replay question" });
    const answer = page.getByRole("textbox", {
      exact: true,
      name: "Your answer",
    });
    const speak = page.getByRole("button", { name: "Speak your answer" });
    const skip = page.getByRole("button", { name: "Skip for now" });
    const next = page.getByRole("button", { exact: true, name: "Next" });

    await expect(heading).toBeFocused();
    await expectMainAtOrigin(page);
    expect(await mainScrollRange(page)).toBe(0);
    await expect(replay).toBeEnabled();
    await expectInsideViewport(replay, viewport);
    await expectMinimumTarget(replay);
    await expectInsideViewport(next, viewport);
    await expectMinimumTarget(next);
    await expectTargetSize(next, { height: 52, width: 144 });
    await expectAccountClearOf(page, [replay]);
    await expectTextBlockLineCount(
      page.getByText("Question 1 of 6", { exact: true }),
      1,
    );
    await expectPointerOwnedBy(replay);
    await expectNoHorizontalOverflow(page);

    await page.keyboard.press("Shift+Tab");
    await expect(replay).toBeFocused();
    await expectReplayFocusPaintClear(page, replay);

    for (const target of [answer, speak, skip, next]) {
      await page.keyboard.press("Tab");
      await expect(target).toBeFocused();
      await expectInsideViewport(target, viewport);
      await expectMinimumTarget(target);
    }
    await expectFocusPaintInsideViewport(page, next);

    await expectMainAtOrigin(page);
    await expectNoHorizontalOverflow(page);
  });
}
