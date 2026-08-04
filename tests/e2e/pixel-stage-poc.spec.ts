import { expect, test } from "@playwright/test";

test("the Phaser pixel stage behaves like a small game world", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/prototypes/pixel-stage/");

  await expect(
    page.getByRole("heading", { name: "Pixel stage proof of concept" }),
  ).toBeVisible();

  const world = page.getByRole("group", { name: "Original pixel game world" });
  const canvas = page.getByRole("img", { name: "Phaser pixel game world" });
  await expect(world).toHaveAttribute("data-engine", "phaser");
  await expect(world).toHaveAttribute("data-ready", "true");
  await expect(world).toHaveAttribute("data-x", "120");
  await expect(world).toHaveAttribute("data-y", "112");
  await expect(canvas).toHaveAttribute("width", "240");
  await expect(canvas).toHaveAttribute("height", "160");
  await expect(canvas).toHaveCSS("image-rendering", "pixelated");

  const moveRight = page.getByRole("button", { name: "Move right" });
  await moveRight.dispatchEvent("pointerdown", { pointerId: 1 });
  await page.waitForTimeout(120);
  await moveRight.dispatchEvent("pointerup", { pointerId: 1 });
  await expect
    .poll(async () => Number(await world.getAttribute("data-x")))
    .toBeGreaterThan(120);

  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(1_000);
  await page.keyboard.up("ArrowRight");
  const xAtTree = Number(await world.getAttribute("data-x"));
  expect(xAtTree).toBeGreaterThanOrEqual(158);
  expect(xAtTree).toBeLessThanOrEqual(162);

  await page.reload();
  await expect(world).toHaveAttribute("data-ready", "true");

  const yBeforeKeyboard = Number(await world.getAttribute("data-y"));
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(120);
  await page.keyboard.up("ArrowDown");
  await expect
    .poll(async () => Number(await world.getAttribute("data-y")))
    .toBeGreaterThan(yBeforeKeyboard);

  for (const state of ["Talking", "Happy", "Surprised", "Idle"]) {
    await page.getByRole("button", { name: state }).click();
    await expect(world).toHaveAttribute("data-state", state.toLowerCase());
  }

  const stage = page.getByRole("region", { name: "Animated pixel lesson stage" });
  const stageBox = await stage.boundingBox();
  const canvasBox = await canvas.boundingBox();

  expect(stageBox).not.toBeNull();
  expect(canvasBox).not.toBeNull();
  expect(canvasBox!.width).toBe(240);
  expect(canvasBox!.height).toBe(160);
  expect(canvasBox!.x).toBeGreaterThanOrEqual(stageBox!.x);
  expect(canvasBox!.y).toBeGreaterThanOrEqual(stageBox!.y);
  expect(canvasBox!.x + canvasBox!.width).toBeLessThanOrEqual(
    stageBox!.x + stageBox!.width,
  );
  expect(canvasBox!.y + canvasBox!.height).toBeLessThanOrEqual(
    stageBox!.y + stageBox!.height,
  );
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
});
