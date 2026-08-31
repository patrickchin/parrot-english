import { expect, test, type Locator, type Page } from "@playwright/test";

const phoneViewports = [
  { height: 568, name: "ultra narrow", width: 280 },
  { height: 480, name: "compact", width: 320 },
  { height: 844, name: "regular", width: 390 },
];

async function expectActivityPicturesLoaded(activities: Locator) {
  const pictures = activities.locator("img");
  await expect(pictures).toHaveCount(5);
  await expect(activities.getByRole("link")).toHaveCount(5);
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
  test(`home presents five learning paths in three rows on a ${viewport.name} phone`, async ({ page }) => {
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
    await expect(activities.getByRole("link", { name: "Play word game" })).toHaveAttribute("href", "/word-games");

    const boxes = await Promise.all((await links.all()).map((link) => link.boundingBox()));
    for (const [index, box] of boxes.entries()) {
      expect(box).not.toBeNull();
      await expectContained(links.nth(index), page);
    }
    expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(boxes[2]!.y - boxes[3]!.y)).toBeLessThanOrEqual(1);
    expect(boxes[2]!.y).toBeGreaterThan(boxes[0]!.y);
    expect(boxes[4]!.y).toBeGreaterThan(boxes[2]!.y);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("home keeps five equal cards in one desktop row", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.goto("/");

  const activities = page.getByRole("navigation", { name: "Learning activities" });
  await expectActivityPicturesLoaded(activities);
  const links = activities.getByRole("link");
  const boxes = await links.evaluateAll((elements) => elements.map((element) =>
    element.getBoundingClientRect().toJSON(),
  ));
  expect(boxes).toHaveLength(5);
  expect(Math.max(...boxes.map(({ y }) => y)) - Math.min(...boxes.map(({ y }) => y))).toBeLessThanOrEqual(1);
  expect(Math.min(...boxes.map(({ width }) => width))).toBeGreaterThan(200);

  for (const link of await links.all()) {
    const [card, picture] = await Promise.all([
      link.boundingBox(),
      link.locator("img").boundingBox(),
    ]);
    expect(card).not.toBeNull();
    expect(picture).not.toBeNull();
    expect(picture!.height / card!.height).toBeGreaterThan(0.55);
  }

  const nurseryRhymes = activities.getByRole("link", { name: "Nursery rhymes" });
  await nurseryRhymes.hover();
  await expect(nurseryRhymes).toBeVisible();
  await nurseryRhymes.focus();
  await expect(nurseryRhymes).toBeFocused();
  await expect(nurseryRhymes).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("desktop home keeps one activity icon and an unobstructed label on each card", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.goto("/");

  const activities = page.getByRole("navigation", { name: "Learning activities" });
  for (const [accessibleName, visibleLabel] of [
    ["Play a lesson", "Lessons"],
    ["Talk to Peppa", "Talk to Peppa"],
    ["Story time", "Story time"],
    ["Nursery rhymes", "Nursery rhymes"],
    ["Play word game", "Word game"],
  ] as const) {
    const label = activities
      .getByRole("link", { name: accessibleName })
      .getByText(visibleLabel, { exact: true });
    await expect(label).toBeVisible();

    const metrics = await label.evaluate((element) => {
      const card = element.closest("a");
      const labelRect = element.getBoundingClientRect();
      const pictureRect = card?.querySelector("img")?.getBoundingClientRect();
      const textRange = document.createRange();
      textRange.selectNodeContents(element);
      const textRects = [...textRange.getClientRects()].filter(
        (rect) => rect.width > 0 && rect.height > 0,
      );

      return {
        iconCount: card?.querySelectorAll("svg").length ?? 0,
        labelLeft: labelRect.left,
        labelRight: labelRect.right,
        lineCount: textRects.length,
        pictureWidth: pictureRect?.width ?? 0,
        textLeft: Math.min(...textRects.map((rect) => rect.left)),
        textRight: Math.max(...textRects.map((rect) => rect.right)),
      };
    });

    expect(metrics.iconCount).toBe(1);
    expect(metrics.lineCount).toBe(1);
    expect(metrics.textLeft).toBeGreaterThanOrEqual(metrics.labelLeft - 1);
    expect(metrics.textRight).toBeLessThanOrEqual(metrics.labelRight + 1);
    expect(metrics.labelRight - metrics.labelLeft).toBeGreaterThanOrEqual(
      metrics.pictureWidth - 1,
    );
  }
});

test("home keeps five compact cards in one short-landscape row", async ({ page }) => {
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto("/");

  const links = page.getByRole("navigation", { name: "Learning activities" }).getByRole("link");
  await expect(links).toHaveCount(5);
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
