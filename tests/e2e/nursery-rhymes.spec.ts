import { expect, test } from "@playwright/test";

test("nursery rhyme picker links to both illustrated projects", async ({ page }) => {
  await page.goto("/dubs");
  await expect(page.getByRole("heading", { name: "Nursery rhymes" })).toBeVisible();
  const picker = page.getByRole("navigation", { name: "Nursery rhymes" });
  await expect(picker.getByRole("link")).toHaveCount(2);
  await expect(picker.getByRole("link", { name: "Five Little Ducks" })).toHaveAttribute("href", "/dubs/five-little-ducks");
  await expect(picker.getByRole("link", { name: "Old MacDonald Had a Farm" })).toHaveAttribute("href", "/dubs/old-macdonald");
  await expect.poll(() => picker.locator("img").evaluateAll((images) => images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true);
});

for (const viewport of [
  { width: 280, height: 568 },
  { width: 390, height: 844 },
  { width: 640, height: 360 },
  { width: 1280, height: 900 },
]) {
  test(`nursery picker stays contained at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/dubs");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("link", { name: "Five Little Ducks" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Old MacDonald Had a Farm" })).toBeVisible();
  });
}
