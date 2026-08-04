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
  const world = page.getByRole("group", { name: "Original pixel game world" });
  await expect(sprite).toHaveAttribute("data-state", "idle");
  await expect(sprite).toHaveCSS("image-rendering", "pixelated");
  await expect(world).toHaveAttribute("data-scale", "1");

  for (const state of ["Talking", "Happy", "Surprised", "Idle"]) {
    await page.getByRole("button", { name: state }).click();
    await expect(sprite).toHaveAttribute("data-state", state.toLowerCase());
  }

  const stage = page.getByRole("region", { name: "Animated pixel lesson stage" });
  const stageBox = await stage.boundingBox();
  const worldBox = await world.boundingBox();
  const spriteBox = await sprite.boundingBox();

  expect(stageBox).not.toBeNull();
  expect(worldBox).not.toBeNull();
  expect(spriteBox).not.toBeNull();
  expect(worldBox!.width).toBe(240);
  expect(worldBox!.height).toBe(160);
  expect(spriteBox!.width).toBe(64);
  expect(spriteBox!.height).toBe(64);
  expect(worldBox!.x).toBeGreaterThanOrEqual(stageBox!.x);
  expect(worldBox!.y).toBeGreaterThanOrEqual(stageBox!.y);
  expect(worldBox!.x + worldBox!.width).toBeLessThanOrEqual(stageBox!.x + stageBox!.width);
  expect(worldBox!.y + worldBox!.height).toBeLessThanOrEqual(stageBox!.y + stageBox!.height);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
});
