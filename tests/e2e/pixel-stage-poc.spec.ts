import { expect, test } from "@playwright/test";

test("Peppa can explore a scrolling tile world with physical depth", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/prototypes/pixel-stage/");

  await expect(
    page.getByRole("heading", { name: "Walk Peppa through Willowbrook" }),
  ).toBeVisible();

  const world = page.getByRole("group", { name: "Willowbrook village game world" });
  const canvas = page.getByRole("img", { name: "Willowbrook pixel game world" });
  await expect(world).toHaveAttribute("data-engine", "phaser");
  await expect(world).toHaveAttribute("data-ready", "true");
  await expect(world).toHaveAttribute("data-camera-zoom", "2");
  await expect(world).toHaveAttribute("data-map-width", "240");
  await expect(world).toHaveAttribute("data-map-height", "160");
  await expect(world).toHaveAttribute("data-x", "128");
  await expect(world).toHaveAttribute("data-y", "64");
  await expect(canvas).toHaveAttribute("width", "240");
  await expect(canvas).toHaveAttribute("height", "160");
  await expect(canvas).toHaveCSS("image-rendering", "pixelated");
  expect(Number(await world.getAttribute("data-depth"))).toBeLessThan(
    Number(await world.getAttribute("data-maple-depth")),
  );
  const initialCameraY = Number(await world.getAttribute("data-camera-y"));

  // The maple's visible trunk and physical footprint share the same foot line.
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(700);
  await page.keyboard.up("ArrowDown");
  expect(Number(await world.getAttribute("data-y"))).toBeLessThan(96);

  // Walk around it. The same sprite now sorts in front, and the camera follows.
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(600);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(900);
  await page.keyboard.up("ArrowDown");
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(600);
  await page.keyboard.up("ArrowLeft");

  await expect
    .poll(async () => Number(await world.getAttribute("data-depth")))
    .toBeGreaterThan(Number(await world.getAttribute("data-maple-depth")));
  await expect
    .poll(async () => Number(await world.getAttribute("data-camera-y")))
    .toBeGreaterThan(initialCameraY);

  for (const { button, state } of [
    { button: "Talk", state: "talking" },
    { button: "Happy", state: "happy" },
    { button: "Surprise", state: "surprised" },
    { button: "Idle", state: "idle" },
  ]) {
    await page.getByRole("button", { name: button }).click();
    await expect(world).toHaveAttribute("data-state", state);
  }

  const stage = page.getByRole("region", { name: "Willowbrook exploration stage" });
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
