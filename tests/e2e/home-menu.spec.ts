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
}

for (const viewport of phoneViewports) {
  test(`home presents three focused learning paths on a ${viewport.name} phone`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Choose how you want to practice" }),
    ).toBeVisible();

    const activities = page.getByRole("navigation", {
      name: "Learning activities",
    });
    const links = activities.getByRole("link");
    await expect(links).toHaveCount(3);
    await expect(
      activities.getByRole("link", { name: /^Talk to Peppa/ }),
    ).toHaveAttribute("href", "/talk-to-peppa");
    await expect(
      activities.getByRole("link", { name: /^Speaking lessons/ }),
    ).toHaveAttribute("href", "/lessons");
    await expect(
      activities.getByRole("link", { name: /^Story time/ }),
    ).toHaveAttribute("href", "/stories");
    await expect(activities.getByRole("button")).toHaveCount(0);

    for (const activity of await links.all()) {
      await expectInsidePage(activity, page);
    }

    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
  });
}

test("desktop home gives the three learner paths equal visual weight", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.goto("/");

  const cards = await page
    .getByRole("navigation", { name: "Learning activities" })
    .getByRole("link")
    .all();
  expect(cards).toHaveLength(3);

  const boxes = await Promise.all(cards.map((card) => card.boundingBox()));
  for (const box of boxes) expect(box).not.toBeNull();
  expect(
    Math.max(...boxes.map((box) => box!.width)) -
      Math.min(...boxes.map((box) => box!.width)),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.max(...boxes.map((box) => box!.height)) -
      Math.min(...boxes.map((box) => box!.height)),
  ).toBeLessThanOrEqual(1);

  await expect(page.getByText(/World Explorer|Pixel Lesson Lab/)).toHaveCount(0);
  await expect(page.getByText(/Coming soon|Grown-up tools/)).toHaveCount(0);
});

test("home routes into and back out of a guided lesson", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /^Speaking lessons/ }).click();
  await expect(page).toHaveURL("/lessons");

  await page
    .getByRole("link", { name: "Start lesson: Peppa's High Ball" })
    .click();
  await expect(page).toHaveURL(
    "/lessons/parrot/01-peppas-high-ball/scenes/1",
  );

  await page.getByRole("button", { name: "Back to lesson list" }).click();
  await expect(page).toHaveURL("/lessons");
});

test("retired experiment URLs return to the learner home", async ({ page }) => {
  for (const path of ["/games", "/games/worlds", "/progress"]) {
    await page.goto(path);
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("navigation", { name: "Learning activities" }),
    ).toBeVisible();
  }
});
