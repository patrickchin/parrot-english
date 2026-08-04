import { expect, test, type Locator, type Page } from "@playwright/test";

const phoneViewports = [
  { height: 568, name: "ultra narrow", width: 280 },
  { height: 480, name: "short", width: 320 },
  { height: 844, name: "regular", width: 390 },
];

async function expectInsidePage(locator: Locator, page: Page) {
  await locator.scrollIntoViewIfNeeded();
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

for (const viewport of phoneViewports) {
  test(`home separates primary and upcoming activities on a ${viewport.name} phone`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "What do you want to do today?" }),
    ).toBeVisible();

    const activities = page.getByRole("navigation", {
      name: "Learning activities",
    });
    await expect(activities.getByRole("link")).toHaveCount(3);
    const talk = activities.getByRole("link", { name: /^Talk to Peppa/ });
    await expect(talk).toBeVisible();
    await expect(
      activities.getByRole("link", { name: /^Lessons/ }),
    ).toBeVisible();
    await expect(
      activities.getByRole("link", { name: /^Game/ }),
    ).toBeVisible();
    await expect(page.getByText("Create a Lesson", { exact: true })).toBeHidden();
    const progress = activities.getByRole("button", {
      name: "Progress, coming soon",
    });
    const storytelling = activities.getByRole("button", {
      name: "Storytelling, coming soon",
    });
    await expect(progress).toBeDisabled();
    await expect(storytelling).toBeDisabled();

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
    await expectInsidePage(storytelling, page);

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

test("retired feature URLs return to the useful home hub", async ({ page }) => {
  for (const path of ["/progress", "/stories"]) {
    await page.goto(path);
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("navigation", { name: "Learning activities" }),
    ).toBeVisible();
  }
});

test("Game opens the pixel garden proof of concept", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.goto("/");

  const game = page.getByRole("link", { name: /^Game/ });
  const talk = page.getByRole("link", { name: /^Talk to Peppa/ });
  const lessons = page.getByRole("link", { name: /^Lessons/ });
  await expect(game).toBeVisible();
  await expect(game).toHaveAttribute("href", "/prototypes/pixel-stage/");
  await expect(game.getByText("Proof of concept", { exact: true })).toBeVisible();

  const [gameBox, lessonsBox, talkBox] = await Promise.all([
    game.boundingBox(),
    lessons.boundingBox(),
    talk.boundingBox(),
  ]);
  expect(gameBox).not.toBeNull();
  expect(lessonsBox).not.toBeNull();
  expect(talkBox).not.toBeNull();
  expect(gameBox!.y).toBe(talkBox!.y);
  expect(lessonsBox!.y).toBe(talkBox!.y);

  await game.click();

  await expect(page).toHaveURL(/\/prototypes\/pixel-stage\/$/);
  await expect(
    page.getByRole("heading", { name: "Explore Peppa's lesson garden" }),
  ).toBeVisible();
});
