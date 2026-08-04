import { expect, test } from "@playwright/test";

test("the pixel stage demonstrates one sprite sheet across four states", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/prototypes/pixel-stage/");

  await expect(
    page.getByRole("heading", { name: "Pixel stage proof of concept" }),
  ).toBeVisible();

  const sprite = page.getByRole("img", { name: "Animated pixel Peppa" });
  await expect(sprite).toHaveAttribute("data-state", "idle");
  await expect(sprite).toHaveCSS("image-rendering", "pixelated");

  for (const state of ["Talking", "Happy", "Surprised", "Idle"]) {
    await page.getByRole("button", { name: state }).click();
    await expect(sprite).toHaveAttribute("data-state", state.toLowerCase());
  }

  const stage = page.getByRole("region", { name: "Animated pixel lesson stage" });
  const stageBox = await stage.boundingBox();
  const spriteBox = await sprite.boundingBox();

  expect(stageBox).not.toBeNull();
  expect(spriteBox).not.toBeNull();
  expect(spriteBox!.x).toBeGreaterThanOrEqual(stageBox!.x);
  expect(spriteBox!.y).toBeGreaterThanOrEqual(stageBox!.y);
  expect(spriteBox!.x + spriteBox!.width).toBeLessThanOrEqual(
    stageBox!.x + stageBox!.width,
  );
  expect(spriteBox!.y + spriteBox!.height).toBeLessThanOrEqual(
    stageBox!.y + stageBox!.height,
  );
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
});
