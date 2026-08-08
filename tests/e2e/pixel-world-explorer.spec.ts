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

  await expect(
    page.getByRole("region", { name: "Scene chooser" }).getByRole("button"),
  ).toHaveCount(8);
  await expect(
    page
      .getByRole("region", { name: "Holdable item chooser" })
      .getByRole("button"),
  ).toHaveCount(17);

  await page.getByRole("button", { name: "paint brush" }).click();
  await expect(world).toHaveAttribute("data-held-item", "paint-brush");

  await page.getByRole("button", { name: "Market Morning" }).click();
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
  const composer = page.getByRole("region", { name: "Scene composer" });

  await expect(composer).toBeVisible();
  await expect(world).toHaveAttribute("data-character-count", "2");
  await expect(world).toHaveAttribute("data-active-character", "peppa");
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
  await expect(world).toHaveAttribute("data-camera-follow-offset-y", "72");
  await composer
    .getByRole("button", { exact: true, name: "storybook" })
    .click();
  await expect(world).toHaveAttribute("data-polly-held-item", "storybook");
  await expect(world).toHaveAttribute(
    "data-polly-hold-presentation",
    "front-covered",
  );

  await composer
    .getByRole("button", { exact: true, name: "Place Polly front right" })
    .click();
  await expect(world).toHaveAttribute("data-polly-slot", "front-right");

  await composer
    .getByRole("button", { exact: true, name: "Story: Three Apples" })
    .click();
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

  const composer = page.getByRole("region", { name: "Scene composer" });
  await expect(composer).toBeVisible();
  await expect(
    composer.getByRole("button", { exact: true, name: "Polly" }),
  ).toBeVisible();
  await expect(
    composer.getByRole("button", {
      exact: true,
      name: "Story: Three Apples",
    }),
  ).toBeVisible();
  await expect(
    composer.getByRole("button", {
      exact: true,
      name: "Reset composition",
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Move up" })).toBeVisible();
  await expect(page.getByRole("button", { name: "garden shovel" })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("reduced motion forces the effective parallax mode off", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ height: 800, width: 1024 });
  const world = await openExplorer(page);

  await page.getByRole("button", { exact: true, name: "Ambient drift" }).click();
  await expect(world).toHaveAttribute("data-reduced-motion", "true");
  await expect(world).toHaveAttribute("data-parallax-mode", "off");
});
