import { expect, test } from "@playwright/test";

test("Peppa can explore a generated lesson garden with physical depth", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/prototypes/pixel-stage/");

  await expect(
    page.getByRole("heading", { name: "Explore Peppa's lesson garden" }),
  ).toBeVisible();

  const world = page.getByRole("group", { name: "Peppa lesson garden game world" });
  const canvas = page.getByRole("img", { name: "Peppa lesson garden pixel game world" });
  await expect(world).toHaveAttribute("data-engine", "phaser");
  await expect(world).toHaveAttribute("data-ready", "true");
  await expect(world).toHaveAttribute("data-art-pixel-size", "2");
  await expect(world).toHaveAttribute("data-camera-zoom", "1");
  await expect(world).toHaveAttribute("data-native-scale", "1");
  await expect(world).toHaveAttribute("data-map-width", "720");
  await expect(world).toHaveAttribute("data-map-height", "480");
  await expect(world).toHaveAttribute("data-x", "450");
  await expect(world).toHaveAttribute("data-y", "192");
  await expect(world).toHaveAttribute("data-frame", "0");
  await page.waitForTimeout(700);
  await expect(world).toHaveAttribute("data-frame", "0");
  await expect(canvas).toHaveAttribute("width", "360");
  await expect(canvas).toHaveAttribute("height", "240");
  await expect(canvas).toHaveCSS("image-rendering", "pixelated");
  expect(Number(await world.getAttribute("data-depth"))).toBeLessThan(
    Number(await world.getAttribute("data-landmark-depth")),
  );
  const initialCameraY = Number(await world.getAttribute("data-camera-y"));

  // Return to the lesson tree, whose visible trunk and footprint share one foot line.
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(1250);
  await page.keyboard.up("ArrowLeft");
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(500);
  await page.keyboard.up("ArrowDown");
  expect(Number(await world.getAttribute("data-y"))).toBeLessThan(240);

  // Walk around it. The same sprite now sorts in front, and the camera follows.
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(700);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(900);
  await page.keyboard.up("ArrowDown");
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(700);
  await page.keyboard.up("ArrowLeft");

  await expect
    .poll(async () => Number(await world.getAttribute("data-depth")))
    .toBeGreaterThan(Number(await world.getAttribute("data-landmark-depth")));
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

  const stage = page.getByRole("region", { name: "Peppa lesson garden exploration stage" });
  const stageBox = await stage.boundingBox();
  const canvasBox = await canvas.boundingBox();

  expect(stageBox).not.toBeNull();
  expect(canvasBox).not.toBeNull();
  expect(canvasBox!.width).toBe(360);
  expect(canvasBox!.height).toBe(240);
  expect(stageBox!.width).toBe(366);
  expect(stageBox!.height).toBe(246);
  expect(canvasBox!.x).toBe(stageBox!.x + 3);
  expect(canvasBox!.y).toBe(stageBox!.y + 3);
  expect(canvasBox!.width).toBe(stageBox!.width - 6);
  expect(canvasBox!.height).toBe(stageBox!.height - 6);

  await page.setViewportSize({ width: 900, height: 900 });
  const desktopStageBox = await stage.boundingBox();
  const desktopCanvasBox = await canvas.boundingBox();
  expect(desktopStageBox).not.toBeNull();
  expect(desktopCanvasBox).not.toBeNull();
  expect(desktopStageBox!.width).toBe(726);
  expect(desktopStageBox!.height).toBe(486);
  expect(desktopCanvasBox!.width).toBe(720);
  expect(desktopCanvasBox!.height).toBe(480);
  expect(desktopCanvasBox!.x).toBe(desktopStageBox!.x + 3);
  expect(desktopCanvasBox!.y).toBe(desktopStageBox!.y + 3);

  await page.setViewportSize({ width: 1280, height: 1000 });
  const wideStageBox = await stage.boundingBox();
  const wideCanvasBox = await canvas.boundingBox();
  expect(wideStageBox).not.toBeNull();
  expect(wideCanvasBox).not.toBeNull();
  expect(wideStageBox!.width).toBe(1086);
  expect(wideStageBox!.height).toBe(726);
  expect(wideCanvasBox!.width).toBe(1080);
  expect(wideCanvasBox!.height).toBe(720);
  expect(wideCanvasBox!.x).toBe(wideStageBox!.x + 3);
  expect(wideCanvasBox!.y).toBe(wideStageBox!.y + 3);

  await page.setViewportSize({ width: 280, height: 700 });
  const narrowStageBox = await stage.boundingBox();
  const narrowCanvasBox = await canvas.boundingBox();
  expect(narrowStageBox).not.toBeNull();
  expect(narrowCanvasBox).not.toBeNull();
  expect(narrowStageBox!.width).toBe(246);
  expect(narrowStageBox!.height).toBe(166);
  expect(narrowCanvasBox!.width).toBe(360);
  expect(narrowCanvasBox!.height).toBe(240);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(280);
});
