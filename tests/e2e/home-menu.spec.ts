import { expect, test, type Locator, type Page } from "@playwright/test";

const phoneViewports = [
  { height: 568, name: "ultra narrow", width: 280 },
  { height: 480, name: "short", width: 320 },
  { height: 844, name: "regular", width: 390 },
];

async function expectInsidePage(locator: Locator, page: Page) {
  await locator.evaluate((element) =>
    element.scrollIntoView({ block: "center", inline: "nearest" }),
  );
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
}

async function focusWithKeyboard(page: Page, locator: Locator) {
  if (await locator.evaluate((element) => element === document.activeElement)) {
    return;
  }

  for (let index = 0; index < 20; index += 1) {
    await page.keyboard.press("Tab");
    if (await locator.evaluate((element) => element === document.activeElement)) {
      return;
    }
  }

  expect(
    await locator.evaluate((element) => element === document.activeElement),
  ).toBe(true);
}

async function renderedCardChrome(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderBottomColor: style.borderBottomColor,
      borderBottomStyle: style.borderBottomStyle,
      borderBottomWidth: style.borderBottomWidth,
      borderLeftColor: style.borderLeftColor,
      borderLeftStyle: style.borderLeftStyle,
      borderLeftWidth: style.borderLeftWidth,
      borderRadius: style.borderRadius,
      borderRightColor: style.borderRightColor,
      borderRightStyle: style.borderRightStyle,
      borderRightWidth: style.borderRightWidth,
      borderTopColor: style.borderTopColor,
      borderTopStyle: style.borderTopStyle,
      borderTopWidth: style.borderTopWidth,
      boxShadow: style.boxShadow,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft,
      paddingRight: style.paddingRight,
      paddingTop: style.paddingTop,
    };
  });
}

async function renderedFocusOutline(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      color: style.outlineColor,
      offset: style.outlineOffset,
      style: style.outlineStyle,
      width: style.outlineWidth,
    };
  });
}

for (const viewport of phoneViewports) {
  test(`home separates primary and upcoming activities on a ${viewport.name} phone`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "What do you want to do today?" }),
    ).toBeVisible();

    const activities = page.getByRole("navigation", {
      name: "Learning activities",
    });
    await expect(activities.getByRole("link")).toHaveCount(6);
    const talk = activities.getByRole("link", { name: /^Talk to Peppa/ });
    const createLesson = activities.getByRole("link", {
      name: /^Create a Lesson/,
    });
    await expect(talk).toBeVisible();
    await expect(
      activities.getByRole("link", { name: /^Lessons/ }),
    ).toBeVisible();
    await expect(
      activities.getByRole("link", { name: /^Game/ }),
    ).toBeVisible();
    await expect(createLesson).toBeVisible();
    await expect(createLesson).toHaveAttribute("href", "/lessons/my/create");
    const storytelling = activities.getByRole("link", {
      name: /^Storytelling/,
    });
    await expect(storytelling).toBeVisible();
    await expect(storytelling).toHaveAttribute("href", "/stories");
    const pixelLab = activities.getByRole("link", {
      name: /^Pixel Lesson Lab/,
    });
    await expect(pixelLab).toBeVisible();
    await expect(pixelLab).toHaveAttribute("href", "/games");
    const progress = activities.getByRole("button", {
      name: "Progress, coming soon",
    });
    await expect(activities.getByRole("button")).toHaveCount(1);
    await expect(progress).toBeDisabled();

    const talkBox = await talk.boundingBox();
    const descriptionBox = await page
      .getByText("Chat freely about things you like.")
      .boundingBox();
    expect(talkBox).not.toBeNull();
    expect(descriptionBox).not.toBeNull();
    expect(descriptionBox!.x).toBeLessThanOrEqual(talkBox!.x + 24);
    expect(descriptionBox!.width).toBeGreaterThanOrEqual(talkBox!.width - 48);

    for (const activity of await activities.getByRole("link").all()) {
      await expectInsidePage(activity, page);
    }
    await expectInsidePage(progress, page);

    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
  });
}

test("home routes into and back out of a guided lesson", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /^Lessons/ }).click();

  await expect(page).toHaveURL("/lessons");
  await page
    .getByRole("link", { name: "Start lesson: Peppa's High Ball" })
    .click();
  await expect(page).toHaveURL(
    "/lessons/parrot/01-peppas-high-ball/scenes/1",
  );

  await page.getByRole("button", { name: "Back to lesson list" }).click();
  await expect(page).toHaveURL("/lessons");
  await expect(
    page.getByRole("heading", { exact: true, name: "Lessons" }),
  ).toBeVisible();
});

test("primary home activities share one rendered card chrome and focus outline", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.goto("/");

  const activities = page.getByRole("navigation", {
    name: "Learning activities",
  });
  const cards = [
    activities.getByRole("link", { name: /^Talk to Peppa/ }),
    activities.getByRole("link", { name: /^Lessons/ }),
    activities.getByRole("link", { name: /^Storytelling/ }),
    activities.getByRole("link", { name: /^Game/ }),
    activities.getByRole("link", { name: /^Pixel Lesson Lab/ }),
    activities.getByRole("link", { name: /^Create a Lesson/ }),
  ];
  const boxes = await Promise.all(
    cards.map(async (card) => {
      await expect(card).toBeVisible();
      const box = await card.boundingBox();
      expect(box).not.toBeNull();
      return box!;
    }),
  );

  expect(
    Math.max(...boxes.map(({ width }) => width)) -
      Math.min(...boxes.map(({ width }) => width)),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.max(...boxes.map(({ height }) => height)) -
      Math.min(...boxes.map(({ height }) => height)),
  ).toBeLessThanOrEqual(1);

  const chrome = await Promise.all(cards.map(renderedCardChrome));
  for (const cardChrome of chrome.slice(1)) {
    expect(cardChrome).toEqual(chrome[0]);
  }

  const outlines = [];
  for (const card of cards) {
    await focusWithKeyboard(page, card);
    const outline = await renderedFocusOutline(card);
    expect(outline.style).not.toBe("none");
    expect(Number.parseFloat(outline.width)).toBeGreaterThan(0);
    outlines.push(outline);
  }

  for (const outline of outlines.slice(1)) {
    expect(outline).toEqual(outlines[0]);
  }
});

test("the retired Progress URL returns to the useful home hub", async ({ page }) => {
  await page.goto("/progress");
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("navigation", { name: "Learning activities" }),
  ).toBeVisible();
});

test("Game opens the pixel garden proof of concept", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.goto("/");

  const game = page.getByRole("link", { name: /^Game/ });
  const pixelLab = page.getByRole("link", { name: /^Pixel Lesson Lab/ });
  const talk = page.getByRole("link", { name: /^Talk to Peppa/ });
  const lessons = page.getByRole("link", { name: /^Lessons/ });
  const createLesson = page.getByRole("link", { name: /^Create a Lesson/ });
  const storytelling = page.getByRole("link", { name: /^Storytelling/ });
  await expect(game).toBeVisible();
  await expect(talk).toBeVisible();
  await expect(lessons).toBeVisible();
  await expect(storytelling).toBeVisible();
  await expect(pixelLab).toBeVisible();
  await expect(createLesson).toBeVisible();
  await expect(game).toHaveAttribute("href", "/prototypes/pixel-stage/");
  await expect(game.getByText("Proof of concept", { exact: true })).toBeVisible();
  await expect(createLesson).toHaveAttribute("href", "/lessons/my/create");
  await expect(pixelLab).toHaveAttribute("href", "/games");

  const [
    createLessonBox,
    gameBox,
    lessonsBox,
    pixelLabBox,
    storytellingBox,
    talkBox,
  ] = await Promise.all([
    createLesson.boundingBox(),
    game.boundingBox(),
    lessons.boundingBox(),
    pixelLab.boundingBox(),
    storytelling.boundingBox(),
    talk.boundingBox(),
  ]);
  expect(createLessonBox).not.toBeNull();
  expect(gameBox).not.toBeNull();
  expect(lessonsBox).not.toBeNull();
  expect(pixelLabBox).not.toBeNull();
  expect(storytellingBox).not.toBeNull();
  expect(talkBox).not.toBeNull();
  expect(lessonsBox!.y).toBe(talkBox!.y);
  expect(storytellingBox!.y).toBe(talkBox!.y);
  expect(createLessonBox!.y).toBe(gameBox!.y);
  expect(gameBox!.y).toBe(pixelLabBox!.y);
  expect(gameBox!.y).toBeGreaterThan(talkBox!.y);
  await game.click();

  await expect(page).toHaveURL(/\/prototypes\/pixel-stage\/$/);
  await expect(page).toHaveTitle("Explore Peppa's lesson garden");
  await expect(
    page.getByRole("region", {
      name: "Peppa lesson garden exploration stage",
    }),
  ).toBeVisible();
});

test("Pixel Lesson Lab opens the generated game experiment", async ({ page }) => {
  await page.goto("/");

  const pixelLab = page.getByRole("link", { name: /^Pixel Lesson Lab/ });
  await expect(pixelLab).toHaveAttribute("href", "/games");
  await expect(
    pixelLab.getByText("Experiment", { exact: true }),
  ).toBeVisible();
  await pixelLab.click();

  await expect(page).toHaveURL("/games");
  await expect(
    page.getByRole("heading", { name: "Pixel Lesson Lab" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Live game preview" }),
  ).toBeVisible();
});
