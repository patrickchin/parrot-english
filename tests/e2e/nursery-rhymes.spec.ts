import { expect, test, type Locator, type Page } from "@playwright/test";

async function expectContained(page: Page, locator: Locator) {
  const [box, viewport] = await Promise.all([
    locator.boundingBox(),
    Promise.resolve(page.viewportSize()),
  ]);
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
}

async function expectSharedHeaderTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

test("nursery rhyme picker links to both illustrated projects", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dubs");
  await expect(page.getByRole("heading", { name: "Nursery rhymes" })).toBeVisible();
  const picker = page.getByRole("navigation", { name: "Nursery rhymes" });
  const routeHeader = page.getByRole("navigation", { name: "Page navigation" });
  const back = routeHeader.getByRole("link", { name: "Back to home" });
  await expect(picker.getByRole("link")).toHaveCount(2);
  await expect(picker.getByRole("link", { name: "Five Little Ducks" })).toHaveAttribute("href", "/dubs/five-little-ducks");
  await expect(picker.getByRole("link", { name: "Old MacDonald Had a Farm" })).toHaveAttribute("href", "/dubs/old-macdonald");
  await expect.poll(() => picker.locator("img").evaluateAll((images) => images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true);
  await expect(back).toBeVisible();
  await expectSharedHeaderTarget(back);
  for (const card of await picker.getByRole("link").all()) {
    await expectContained(page, card);
    const [cardBox, imageBox] = await Promise.all([card.boundingBox(), card.locator("img").boundingBox()]);
    expect(cardBox).not.toBeNull();
    expect(imageBox).not.toBeNull();
    expect(imageBox!.height / cardBox!.height).toBeGreaterThan(0.65);
  }
});

for (const viewport of [
  { width: 280, height: 568 },
  { width: 320, height: 480 },
  { width: 390, height: 844 },
  { width: 640, height: 360 },
  { width: 1280, height: 900 },
]) {
  test(`nursery picker stays contained at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/dubs");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const routeHeader = page.getByRole("navigation", { name: "Page navigation" });
    const back = routeHeader.getByRole("link", { name: "Back to home" });
    await expect(back).toBeVisible();
    await expectSharedHeaderTarget(back);
    for (const name of ["Five Little Ducks", "Old MacDonald Had a Farm"]) {
      const card = page.getByRole("link", { name });
      await expect(card).toBeVisible();
      await expectContained(page, card);
    }
  });
}
