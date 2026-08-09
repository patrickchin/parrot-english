import { expect, test, type Page } from "@playwright/test";

async function openExplorer(page: Page) {
  await page.goto("/games/worlds");
  await expect(
    page.getByRole("heading", { name: "Pixel World Explorer" }),
  ).toBeVisible();
  const world = page.getByRole("group", {
    name: "Pixel world explorer game world",
  });
  await expect(world).toHaveAttribute("data-ready", "true", {
    timeout: 30_000,
  });
  return world;
}

async function viewportMetrics(page: Page) {
  return page.evaluate(() => ({
    clientHeight: document.documentElement.clientHeight,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
  }));
}

test("the stage dominates a fixed desktop editor with tools around it", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await openExplorer(page);

  const stage = page.getByRole("region", {
    name: "Pixel world explorer stage",
  });
  const worldTools = page.getByRole("region", { name: "World controls" });
  const characterTools = page.getByRole("region", {
    name: "Character controls",
  });
  const movementTools = page.getByRole("region", {
    name: "Movement and facing controls",
  });

  await expect(stage).toBeVisible();
  await expect(worldTools).toBeVisible();
  await expect(characterTools).toBeVisible();
  await expect(movementTools).toBeVisible();

  const [stageBox, worldBox, characterBox, movementBox] = await Promise.all([
    stage.boundingBox(),
    worldTools.boundingBox(),
    characterTools.boundingBox(),
    movementTools.boundingBox(),
  ]);
  expect(stageBox).not.toBeNull();
  expect(worldBox).not.toBeNull();
  expect(characterBox).not.toBeNull();
  expect(movementBox).not.toBeNull();

  expect(worldBox!.x + worldBox!.width).toBeLessThanOrEqual(stageBox!.x);
  expect(characterBox!.x).toBeGreaterThanOrEqual(
    stageBox!.x + stageBox!.width,
  );
  expect(movementBox!.y).toBeGreaterThanOrEqual(
    stageBox!.y + stageBox!.height,
  );
  expect(stageBox!.width).toBeGreaterThan(worldBox!.width);
  expect(stageBox!.width).toBeGreaterThan(characterBox!.width);
  expect(stageBox!.width * stageBox!.height).toBeGreaterThan(
    1280 * 900 * 0.3,
  );

  const dimensions = await viewportMetrics(page);
  expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.clientHeight);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("facing controls turn the selected character without moving it", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  const world = await openExplorer(page);
  const startX = await world.getAttribute("data-x");

  await expect(world).toHaveAttribute("data-facing", "right");
  await page.getByRole("button", { name: "Face Peppa left" }).click();
  await expect(world).toHaveAttribute("data-facing", "left");
  await expect(world).toHaveAttribute("data-peppa-facing", "left");
  await expect(world).toHaveAttribute("data-x", startX!);

  await page.getByRole("button", { name: "Face Peppa right" }).click();
  await expect(world).toHaveAttribute("data-facing", "right");
  await expect(world).toHaveAttribute("data-peppa-facing", "right");

  await page.getByRole("button", { exact: true, name: "Polly" }).click();
  await page.getByRole("button", { name: "Face Polly left" }).click();
  await expect(world).toHaveAttribute("data-active-character", "polly");
  await expect(world).toHaveAttribute("data-facing", "left");
  await expect(world).toHaveAttribute("data-polly-facing", "left");
});

test("the world lab switches scenes, items, and optional parallax", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  const world = await openExplorer(page);

  await expect(world).toHaveAttribute("data-art-cell-screen-pixels", "4");
  await expect(world).toHaveAttribute("data-texture-scale", "1");
  await expect(world).toHaveAttribute("data-scene-id", "garden-party");
  await expect(world).toHaveAttribute("data-held-item", "red-apple");
  await expect(world).toHaveAttribute("data-parallax-mode", "camera");
  await expect(
    page.getByRole("application", { name: /Interactive pixel world explorer/ }),
  ).toHaveCSS("image-rendering", "pixelated");

  await expect(page.getByLabel("World scene").locator("option")).toHaveCount(8);
  await expect(page.getByLabel("Held item").locator("option")).toHaveCount(17);

  await page.getByLabel("Held item").selectOption("paint-brush");
  await expect(world).toHaveAttribute("data-held-item", "paint-brush");

  await page.getByLabel("World scene").selectOption("market-morning");
  await expect(world).toHaveAttribute("data-ready", "true");
  await expect(world).toHaveAttribute("data-scene-id", "market-morning");
  await expect(world).toHaveAttribute("data-held-item", "paint-brush");

  await page.getByRole("button", { exact: true, name: "Parallax off" }).click();
  await expect(world).toHaveAttribute("data-parallax-mode", "off");
  await page.getByRole("button", { exact: true, name: "Camera parallax" }).click();
  await expect(world).toHaveAttribute("data-parallax-mode", "camera");

  const startX = Number(await world.getAttribute("data-x"));
  const moveRight = page.getByRole("button", { name: "Move right" });
  await moveRight.scrollIntoViewIfNeeded();
  const moveRightBounds = await moveRight.boundingBox();
  expect(moveRightBounds).not.toBeNull();
  await page.mouse.move(
    moveRightBounds!.x + moveRightBounds!.width / 2,
    moveRightBounds!.y + moveRightBounds!.height / 2,
  );
  await page.mouse.down();
  try {
    await expect
      .poll(() => world.getAttribute("data-x"), { timeout: 10_000 })
      .not.toBe(String(startX));
  } finally {
    await page.mouse.up();
  }

  await page.waitForTimeout(250);
  const keyboardStartX = Number(await world.getAttribute("data-x"));
  const canvas = page.getByRole("application", {
    name: /Interactive pixel world explorer/,
  });
  await canvas.focus();
  await page.keyboard.down("ArrowLeft");
  try {
    await expect
      .poll(async () => Number(await world.getAttribute("data-x")), {
        timeout: 10_000,
      })
      .toBeLessThan(keyboardStartX);
  } finally {
    await page.keyboard.up("ArrowLeft");
  }
});

test("the scene composer stages Peppa and Polly in reusable story scenes", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  const world = await openExplorer(page);
  const composer = page.getByRole("region", { name: "Character controls" });

  await expect(composer).toBeVisible();
  await expect(world).toHaveAttribute("data-character-count", "2");
  await expect(world).toHaveAttribute("data-active-character", "peppa");
  await expect(world).toHaveAttribute("data-camera-follow-offset-x", "-50");
  await expect(world).toHaveAttribute("data-camera-follow-offset-y", "72");

  const characterChooser = composer.getByRole("group", {
    name: "Character chooser",
  });
  await expect(
    characterChooser.getByRole("button", { exact: true, name: "Peppa" }),
  ).toBeVisible();
  const choosePolly = characterChooser.getByRole("button", {
    exact: true,
    name: "Polly",
  });
  await expect(choosePolly).toBeVisible();

  await choosePolly.click();
  await expect(world).toHaveAttribute("data-active-character", "polly");
  await expect(world).toHaveAttribute("data-camera-follow-offset-x", "50");
  await expect(world).toHaveAttribute("data-camera-follow-offset-y", "72");
  await composer.getByLabel("Held item").selectOption("storybook");
  await expect(world).toHaveAttribute("data-polly-held-item", "storybook");
  await expect(world).toHaveAttribute(
    "data-polly-hold-presentation",
    "front-covered",
  );

  await composer.getByLabel("Placement").selectOption("front-right");
  await expect(world).toHaveAttribute("data-polly-slot", "front-right");

  await page.getByLabel("Ready-made scene").selectOption("story-three-apples");
  await expect(world).toHaveAttribute("data-scene-id", "story-three-apples");
  await expect(world).toHaveAttribute(
    "data-scene-source",
    "story:three-apples",
  );

  await composer
    .getByRole("button", { exact: true, name: "Reset composition" })
    .click();
  await expect(world).toHaveAttribute("data-scene-id", "garden-party");
  await expect(world).toHaveAttribute("data-active-character", "peppa");
  await expect(world).toHaveAttribute("data-character-count", "2");
});

test("the explorer remains usable on mobile without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  const world = await openExplorer(page);

  await expect(world).toHaveAttribute("data-camera-zoom", "1");
  await expect(world).toHaveAttribute("data-art-cell-screen-pixels", "2");

  const composer = page.getByRole("region", { name: "Character controls" });
  await expect(composer).toBeVisible();
  await expect(
    composer.getByRole("button", { exact: true, name: "Polly" }),
  ).toBeVisible();
  await expect(page.getByLabel("Ready-made scene")).toBeVisible();
  await expect(
    composer.getByRole("button", {
      exact: true,
      name: "Reset composition",
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Move up" })).toBeVisible();
  await expect(
    composer.getByRole("button", { name: "Face Peppa left" }),
  ).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    clientHeight: document.documentElement.clientHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.clientHeight);

  await page.setViewportSize({ height: 640, width: 280 });
  const narrowWorld = await openExplorer(page);
  await expect(narrowWorld).toHaveAttribute("data-camera-zoom", "0.5");
  await expect(narrowWorld).toHaveAttribute(
    "data-art-cell-screen-pixels",
    "1",
  );
  const narrowDimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    clientHeight: document.documentElement.clientHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(narrowDimensions.scrollWidth).toBeLessThanOrEqual(
    narrowDimensions.clientWidth,
  );
  expect(narrowDimensions.scrollHeight).toBeLessThanOrEqual(
    narrowDimensions.clientHeight,
  );
});

test("reduced motion forces the effective parallax mode off", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ height: 800, width: 1024 });
  const world = await openExplorer(page);

  await page.getByRole("button", { exact: true, name: "Ambient drift" }).click();
  await expect(world).toHaveAttribute("data-reduced-motion", "true");
  await expect(world).toHaveAttribute("data-parallax-mode", "off");
});
