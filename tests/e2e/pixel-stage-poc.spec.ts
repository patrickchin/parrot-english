import { expect, test, type Page } from "@playwright/test";

async function expectAppToFitViewport(page: Page) {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();

  const documentSize = await page.evaluate(() => ({
    clientHeight: document.documentElement.clientHeight,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(documentSize.scrollWidth).toBeLessThanOrEqual(documentSize.clientWidth);
  expect(documentSize.scrollHeight).toBeLessThanOrEqual(
    documentSize.clientHeight,
  );

  for (const element of [
    page.getByRole("heading", { name: "Explore Peppa's lesson garden" }),
    page.getByRole("region", {
      name: "Peppa lesson garden exploration stage",
    }),
    page.getByText("Come on — let's explore the lesson garden!", {
      exact: true,
    }),
    page.getByRole("navigation", { name: "Lesson garden game controls" }),
    page.getByRole("button", { name: "Move up" }),
    page.getByRole("button", { name: "Surprise" }),
    page.getByText(
      "1:1 textures · shared 2px art grid · 64-color palette · y-sorted props",
      { exact: true },
    ),
  ]) {
    await expect(element).toBeVisible();
    const box = await element.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
  }
}

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
  const stage = page.getByRole("region", {
    name: "Peppa lesson garden exploration stage",
  });
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
  await expect(canvas).toHaveAttribute("width", "388");
  await expect(canvas).toHaveCSS("image-rendering", "pixelated");
  await expect(stage).toHaveCSS("background-color", "rgb(215, 215, 215)");
  expect(
    await stage.evaluate((element) => getComputedStyle(element).backgroundImage),
  ).not.toBe("none");
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

  const stageBox = await stage.boundingBox();
  const canvasBox = await canvas.boundingBox();

  expect(stageBox).not.toBeNull();
  expect(canvasBox).not.toBeNull();
  expect(canvasBox!.width).toBe(388);
  expect(stageBox!.width).toBe(388);
  expect(stageBox!.height).toBeGreaterThan(160);
  expect(Math.abs(canvasBox!.height - stageBox!.height)).toBeLessThanOrEqual(4);
  expect(canvasBox!.x).toBe(stageBox!.x);
  expect(Math.abs(canvasBox!.y - stageBox!.y)).toBeLessThanOrEqual(2);
  await expectAppToFitViewport(page);

  await page.setViewportSize({ width: 900, height: 900 });
  await expect(world).toHaveAttribute("data-presentation-scale", "2");
  await expect(canvas).toHaveAttribute("width", "448");
  const desktopStageBox = await stage.boundingBox();
  const desktopCanvasBox = await canvas.boundingBox();
  expect(desktopStageBox).not.toBeNull();
  expect(desktopCanvasBox).not.toBeNull();
  expect(desktopStageBox!.width).toBe(896);
  expect(desktopCanvasBox!.width).toBe(896);
  expect(desktopStageBox!.height).toBeGreaterThan(200);
  expect(
    Math.abs(desktopCanvasBox!.height - desktopStageBox!.height),
  ).toBeLessThanOrEqual(4);
  expect(desktopCanvasBox!.x).toBe(desktopStageBox!.x);
  expect(
    Math.abs(desktopCanvasBox!.y - desktopStageBox!.y),
  ).toBeLessThanOrEqual(2);
  await expectAppToFitViewport(page);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(world).toHaveAttribute("data-presentation-scale", "2");
  await expect(canvas).toHaveAttribute("width", "638");
  const wideStageBox = await stage.boundingBox();
  const wideCanvasBox = await canvas.boundingBox();
  expect(wideStageBox).not.toBeNull();
  expect(wideCanvasBox).not.toBeNull();
  expect(wideStageBox!.width).toBe(1276);
  expect(wideCanvasBox!.width).toBe(1276);
  expect(wideStageBox!.height).toBeGreaterThan(200);
  expect(Math.abs(wideCanvasBox!.height - wideStageBox!.height)).toBeLessThanOrEqual(
    4,
  );
  expect(wideCanvasBox!.x).toBe(wideStageBox!.x);
  expect(Math.abs(wideCanvasBox!.y - wideStageBox!.y)).toBeLessThanOrEqual(2);
  expect(wideStageBox!.x).toBeGreaterThanOrEqual(0);
  expect(wideStageBox!.x + wideStageBox!.width).toBeLessThanOrEqual(1280);
  expect(wideStageBox!.y).toBeLessThanOrEqual(64);
  await expectAppToFitViewport(page);

  await page.setViewportSize({ width: 722, height: 966 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(world).toHaveAttribute("data-presentation-scale", "2");
  await expect(canvas).toHaveAttribute("width", "360");
  const tallStageBox = await stage.boundingBox();
  const tallCanvasBox = await canvas.boundingBox();
  expect(tallStageBox).not.toBeNull();
  expect(tallCanvasBox).not.toBeNull();
  expect(tallStageBox!.width).toBe(720);
  expect(tallCanvasBox!.width).toBe(720);
  expect(tallStageBox!.height).toBeGreaterThan(200);
  expect(Math.abs(tallCanvasBox!.height - tallStageBox!.height)).toBeLessThanOrEqual(
    4,
  );
  expect(tallCanvasBox!.x).toBe(tallStageBox!.x);
  expect(Math.abs(tallCanvasBox!.y - tallStageBox!.y)).toBeLessThanOrEqual(2);
  expect(tallStageBox!.y).toBeLessThanOrEqual(50);
  await expectAppToFitViewport(page);

  await page.setViewportSize({ width: 672, height: 966 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(world).toHaveAttribute("data-presentation-scale", "2");
  await expect(canvas).toHaveAttribute("width", "334");
  const splitPaneStageBox = await stage.boundingBox();
  const splitPaneCanvasBox = await canvas.boundingBox();
  expect(splitPaneStageBox).not.toBeNull();
  expect(splitPaneCanvasBox).not.toBeNull();
  expect(splitPaneStageBox!.width).toBe(668);
  expect(splitPaneCanvasBox!.width).toBe(668);
  expect(splitPaneStageBox!.height).toBeGreaterThan(200);
  expect(
    Math.abs(splitPaneCanvasBox!.height - splitPaneStageBox!.height),
  ).toBeLessThanOrEqual(4);
  expect(splitPaneCanvasBox!.x).toBe(splitPaneStageBox!.x);
  expect(
    Math.abs(splitPaneCanvasBox!.y - splitPaneStageBox!.y),
  ).toBeLessThanOrEqual(2);
  await expectAppToFitViewport(page);

  await page.setViewportSize({ width: 280, height: 700 });
  await expect(world).toHaveAttribute("data-presentation-scale", "1");
  await expect(canvas).toHaveAttribute("width", "278");
  const narrowStageBox = await stage.boundingBox();
  const narrowCanvasBox = await canvas.boundingBox();
  expect(narrowStageBox).not.toBeNull();
  expect(narrowCanvasBox).not.toBeNull();
  expect(narrowStageBox!.width).toBe(278);
  expect(narrowCanvasBox!.width).toBe(278);
  expect(narrowStageBox!.height).toBeGreaterThan(120);
  expect(
    Math.abs(narrowCanvasBox!.height - narrowStageBox!.height),
  ).toBeLessThanOrEqual(4);
  await expectAppToFitViewport(page);
});

test("the game uses the usable page width when browser chrome takes space", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/prototypes/pixel-stage/");

  const world = page.getByRole("group", {
    name: "Peppa lesson garden game world",
  });
  const stage = page.getByRole("region", {
    name: "Peppa lesson garden exploration stage",
  });
  await expect(world).toHaveAttribute("data-ready", "true");

  await page.evaluate(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1310,
    });
    window.dispatchEvent(new Event("resize"));
  });

  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  expect(stageBox!.x).toBeGreaterThanOrEqual(0);
  expect(stageBox!.x + stageBox!.width).toBeLessThanOrEqual(1280);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(1280);
});

test("the canvas follows app-shell reflow without a window resize", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto("/prototypes/pixel-stage/");

  const world = page.getByRole("group", {
    name: "Peppa lesson garden game world",
  });
  const stage = page.getByRole("region", {
    name: "Peppa lesson garden exploration stage",
  });
  const canvas = page.getByRole("img", {
    name: "Peppa lesson garden pixel game world",
  });
  await expect(world).toHaveAttribute("data-ready", "true");

  const initialStageBox = await stage.boundingBox();
  expect(initialStageBox).not.toBeNull();

  await page.locator(".speech").evaluate((element) => {
    (element as HTMLElement).style.paddingBlock = "40px";
  });

  await expect
    .poll(async () => (await stage.boundingBox())?.height)
    .toBeLessThan(initialStageBox!.height - 40);

  const reflowedStageBox = await stage.boundingBox();
  const reflowedCanvasBox = await canvas.boundingBox();
  expect(reflowedStageBox).not.toBeNull();
  expect(reflowedCanvasBox).not.toBeNull();
  expect(
    Math.abs(reflowedCanvasBox!.height - reflowedStageBox!.height),
  ).toBeLessThanOrEqual(4);
  await expectAppToFitViewport(page);
});

test("Peppa's sprite-sheet pixels render at one CSS pixel each", async ({
  page,
}) => {
  await page.setViewportSize({ width: 943, height: 966 });
  await page.goto("/prototypes/pixel-stage/");

  const world = page.getByRole("group", {
    name: "Peppa lesson garden game world",
  });
  const canvas = page.getByRole("img", {
    name: "Peppa lesson garden pixel game world",
  });
  await expect(world).toHaveAttribute("data-ready", "true");
  await expect(world).toHaveAttribute("data-native-scale", "1");
  await expect(world).toHaveAttribute("data-camera-zoom", "1");
  await expect(world).toHaveAttribute("data-presentation-scale", "1");

  const canvasPixels = await canvas.evaluate((element: HTMLCanvasElement) => ({
    height: element.height,
    width: element.width,
  }));
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  expect(canvasBox!.width).toBe(canvasPixels.width);
  expect(canvasBox!.height).toBe(canvasPixels.height);
});
