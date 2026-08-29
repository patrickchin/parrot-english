import { expect, test, type Locator, type Page } from "@playwright/test";

const phoneViewports = [
  { height: 568, name: "ultra narrow", width: 280 },
  { height: 844, name: "regular", width: 390 },
];

async function expectActivityPicturesLoaded(activities: Locator) {
  const pictures = activities.locator("img");
  await expect(pictures).toHaveCount(4);
  await expect(activities.getByRole("link")).toHaveCount(4);
  await expect
    .poll(() =>
      pictures.evaluateAll((images) =>
        images.every(
          (image) =>
            image instanceof HTMLImageElement &&
            image.complete &&
            image.naturalWidth > 0,
        ),
      ),
    )
    .toBe(true);
}

async function expectContained(locator: Locator, page: Page) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
}

for (const viewport of phoneViewports) {
  test(`home presents four learning paths in two rows on a ${viewport.name} phone`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const activities = page.getByRole("navigation", {
      name: "Learning activities",
    });
    const links = activities.getByRole("link");
    await expectActivityPicturesLoaded(activities);
    await expect(activities.getByRole("link", { name: "Play a lesson" })).toHaveAttribute("href", "/lessons");
    await expect(activities.getByRole("link", { name: "Talk to Peppa" })).toHaveAttribute("href", "/talk-to-peppa");
    await expect(activities.getByRole("link", { name: "Story time" })).toHaveAttribute("href", "/stories");
    await expect(activities.getByRole("link", { name: "Nursery rhymes" })).toHaveAttribute("href", "/dubs");

    const boxes = await Promise.all((await links.all()).map((link) => link.boundingBox()));
    for (const [index, box] of boxes.entries()) {
      expect(box).not.toBeNull();
      await expectContained(links.nth(index), page);
    }
    expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(boxes[2]!.y - boxes[3]!.y)).toBeLessThanOrEqual(1);
    expect(boxes[2]!.y).toBeGreaterThan(boxes[0]!.y);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("home keeps four equal cards in one desktop row", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.goto("/");

  const activities = page.getByRole("navigation", { name: "Learning activities" });
  await expectActivityPicturesLoaded(activities);
  const boxes = await Promise.all((await activities.getByRole("link").all()).map((link) => link.boundingBox()));
  for (const box of boxes) {
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(240);
  }
  expect(Math.max(...boxes.map((box) => box!.y)) - Math.min(...boxes.map((box) => box!.y))).toBeLessThanOrEqual(1);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("desktop home keeps every visible card label on one line inside its label region", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.goto("/");

  const activities = page.getByRole("navigation", { name: "Learning activities" });
  for (const [accessibleName, visibleLabel] of [
    ["Play a lesson", "Lessons"],
    ["Talk to Peppa", "Talk to Peppa"],
    ["Story time", "Story time"],
    ["Nursery rhymes", "Nursery rhymes"],
  ] as const) {
    const label = activities
      .getByRole("link", { name: accessibleName })
      .getByText(visibleLabel, { exact: true });
    await expect(label).toBeVisible();

    const metrics = await label.evaluate((element) => {
      const labelRect = element.getBoundingClientRect();
      const arrowRect = element.nextElementSibling?.getBoundingClientRect();
      const textRange = document.createRange();
      textRange.selectNodeContents(element);
      const textRects = [...textRange.getClientRects()].filter(
        (rect) => rect.width > 0 && rect.height > 0,
      );

      return {
        arrowLeft: arrowRect?.left ?? null,
        labelLeft: labelRect.left,
        labelRight: labelRect.right,
        lineCount: textRects.length,
        textLeft: Math.min(...textRects.map((rect) => rect.left)),
        textRight: Math.max(...textRects.map((rect) => rect.right)),
      };
    });

    expect(metrics.lineCount).toBe(1);
    expect(metrics.arrowLeft).not.toBeNull();
    expect(metrics.textLeft).toBeGreaterThanOrEqual(metrics.labelLeft - 1);
    expect(metrics.textRight).toBeLessThanOrEqual(metrics.labelRight + 1);
    expect(metrics.labelRight).toBeLessThanOrEqual(metrics.arrowLeft!);
  }
});

test("home keeps four compact cards in one short-landscape row", async ({ page }) => {
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto("/");

  const links = page.getByRole("navigation", { name: "Learning activities" }).getByRole("link");
  await expect(links).toHaveCount(4);
  const boxes = await Promise.all((await links.all()).map((link) => link.boundingBox()));
  for (const [index, box] of boxes.entries()) {
    expect(box).not.toBeNull();
    await expectContained(links.nth(index), page);
  }
  expect(Math.max(...boxes.map((box) => box!.y)) - Math.min(...boxes.map((box) => box!.y))).toBeLessThanOrEqual(1);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("home routes into and back out of a guided lesson", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Play a lesson" }).click();
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
