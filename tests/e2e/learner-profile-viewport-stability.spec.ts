import { expect, test, type Locator, type Page } from "@playwright/test";

const profilePath = "/profile/setup?parrotE2eProfile=viewport-stability";
const resumeProfilePath = "/profile/setup?parrotE2eProfile=viewport-resume";
const peppaPath = "/assets/characters/peppa/peppa-happy.webp";

const targetViewports = [
  { height: 568, name: "ultra-narrow phone", width: 280 },
  { height: 640, name: "compact phone", width: 360 },
  { height: 844, name: "regular phone", width: 390 },
  { height: 360, name: "short landscape", width: 640 },
  { height: 900, name: "desktop", width: 1440 },
] as const;

type Rect = { height: number; width: number; x: number; y: number };
type Viewport = (typeof targetViewports)[number];

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
  const account = page.getByRole("button", { name: /^Account for / });
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

async function expectFocusPaintClearOfAccount(page: Page, target: Locator) {
  const account = page.getByRole("button", { name: /^Account for / });
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
    .toBe(1024);

  await image.evaluate((element) => element.removeAttribute("src"));
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
  await expect(page.getByRole("button", { name: "Skip for now" })).toBeVisible();
  await expect(main).not.toContainText(
    /Help Peppa get to know you|personalize|Learner profile|\bquick\b|Set up profile/i,
  );

  await page.keyboard.press("Tab");
  await expect(start).toBeFocused();
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
    await expect(page.getByText("你好！我是佩奇。你叫什么名字？", { exact: true })).toBeVisible();
    const answerLabel = page.getByText("Your answer", { exact: true });
    const answer = page.getByRole("textbox", { name: "Your answer" });
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
    await expectFocusPaintClearOfAccount(page, replay);
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
    const ageAnswer = page.getByRole("textbox", { name: "Your answer" });
    const ageSpeak = page.getByRole("button", { name: "Speak your answer" });
    const ageSkip = page.getByRole("button", { name: "Skip for now" });
    const ageNext = page.getByRole("button", { exact: true, name: "Next" });
    await expect(ageHeading).toBeFocused();
    await expect(page.getByText("Question 2 of 6", { exact: true })).toBeVisible();
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

  test(`profile Peppa art reserves its 1024-square geometry on a ${viewport.name}`, async ({
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
    const answer = page.getByRole("textbox", { name: "Your answer" });
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

    await page.goto("/profile?parrotE2eProfile=viewport-stability");
    const editorHeading = page.getByRole("heading", { name: "Learner profile" });
    const redoHeading = page.getByRole("heading", { name: "Redo learner setup" });
    await expect(editorHeading).toBeVisible();
    await expectDelayedImageKeepsGeometry({
      anchors: [
        redoHeading,
        page.getByRole("button", { name: "Redo setup questions" }),
      ],
      image: page.getByRole("img", { name: "Peppa smiling" }),
      page,
      token: `${viewport.width}-editor`,
    });
  });
}

test("profile Replay remains operable at the 320px reflow width", async ({
  page,
}) => {
  const viewport = { height: 640, name: "320px reflow phone", width: 320 };
  await openSetup(page, viewport);
  await page.getByRole("button", { name: "Start questions" }).click();

  const heading = page.getByRole("heading", {
    name: "Hi! I'm Peppa. What's your name?",
  });
  const replay = page.getByRole("button", { name: "Replay question" });
  const next = page.getByRole("button", { exact: true, name: "Next" });

  await expect(heading).toBeFocused();
  await expect(replay).toBeEnabled();
  await expectInsideViewport(replay, viewport);
  await expectMinimumTarget(replay);
  await expectAccountClearOf(page, [replay]);
  await expectTextBlockLineCount(
    page.getByText("Question 1 of 6", { exact: true }),
    1,
  );
  await expectPointerOwnedBy(replay);
  await expectNoHorizontalOverflow(page);

  await page.keyboard.press("Shift+Tab");
  await expect(replay).toBeFocused();
  await expectFocusPaintClearOfAccount(page, replay);

  await next.scrollIntoViewIfNeeded();
  await expectInsideViewport(next, viewport);
  await expectMinimumTarget(next);
  await expectNoHorizontalOverflow(page);
});
