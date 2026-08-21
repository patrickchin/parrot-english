import { expect, test, type Locator, type Page } from "@playwright/test";

const profilePath = "/profile/setup?parrotE2eProfile=viewport-stability";
const peppaPath = "/assets/characters/peppa/peppa-happy.webp";

const targetViewports = [
  { height: 568, name: "ultra-narrow phone", width: 280 },
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

function boxesOverlap(first: Rect, second: Rect) {
  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}

async function expectAccountClearOf(page: Page, targets: Locator[]) {
  const account = page.getByRole("button", { name: /^Account for / });
  await expect(account).toBeVisible();
  const accountBox = await rect(account);

  for (const target of targets) {
    await expect(target).toBeVisible();
    const label = await target.evaluate(
      (element) => element.getAttribute("alt") ?? element.textContent?.trim(),
    );
    expect(
      boxesOverlap(accountBox, await rect(target)),
      `Account control overlaps ${label}`,
    ).toBe(false);
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
    name: "Help Peppa get to know you",
  });
  await expect(heading).toBeVisible();
  return heading;
}

for (const viewport of targetViewports) {
  test(`profile setup keeps each transition usable on a ${viewport.name}`, async ({
    page,
  }) => {
    const setupHeading = await openSetup(page, viewport);
    const setupImage = page.getByRole("img", { name: "Peppa waving hello" });
    const setup = page.getByRole("button", { name: "Set up profile" });
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
    const nameHeading = page.getByRole("heading", { name: "What's your name?" });
    const answerLabel = page.getByText("Your answer", { exact: true });
    const answer = page.getByRole("textbox", { name: "Your answer" });
    const speak = page.getByRole("button", { name: "Speak your answer" });
    const questionSkip = page.getByRole("button", { name: "Skip for now" });
    const questionNext = page.getByRole("button", {
      exact: true,
      name: "Next",
    });

    await expect(nameHeading).toBeFocused();
    await expectMainAtOrigin(page);
    for (const target of [
      nameHeading,
      answerLabel,
      answer,
      speak,
      questionSkip,
      questionNext,
    ]) {
      await expectInsideViewport(target, viewport);
    }
    for (const target of [speak, questionSkip, questionNext]) {
      await expectMinimumTarget(target);
    }
    await expectAccountClearOf(page, [
      page.getByRole("img", { name: "Peppa, your English host" }),
      nameHeading,
      answerLabel,
      answer,
      speak,
      questionSkip,
      questionNext,
    ]);
    await expectNoHorizontalOverflow(page);

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
      name: "Mia is a lovely name!",
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
    await expect(page.getByText("Question 2 of 2", { exact: true })).toBeVisible();
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
    const setup = page.getByRole("button", { name: "Set up profile" });
    await expectDelayedImageKeepsGeometry({
      anchors: [setupHeading, setup],
      image: page.getByRole("img", { name: "Peppa waving hello" }),
      page,
      token: `${viewport.width}-setup`,
    });

    await setup.click();
    const nameHeading = page.getByRole("heading", { name: "What's your name?" });
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
      name: "Mia is a lovely name!",
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
