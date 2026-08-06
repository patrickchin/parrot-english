import { expect, test, type Locator, type Page } from "@playwright/test";

type ElementBox = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;

const BUTTON_NAMES = [
  "Move up",
  "Move left",
  "Move down",
  "Move right",
  "Idle animation",
  "Talking animation",
  "Happy animation",
  "Surprised animation",
] as const;

function boxesOverlap(left: ElementBox, right: ElementBox) {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  );
}

async function expectDocumentToFitViewport(page: Page) {
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
}

async function expectFullscreenGame(page: Page, width: number, height: number) {
  const world = page.getByRole("group", {
    name: "Peppa lesson garden game world",
  });
  const canvas = page.getByRole("img", {
    name: "Peppa lesson garden pixel game world",
  });
  const stage = page.getByRole("region", {
    name: "Peppa lesson garden exploration stage",
  });

  await expect(world).toHaveAttribute("data-viewport-width", String(width));
  await expect(world).toHaveAttribute("data-viewport-height", String(height));
  await expect(canvas).toHaveAttribute("width", String(width));
  await expect(canvas).toHaveAttribute("height", String(height));

  const stageBox = await stage.boundingBox();
  const canvasBox = await canvas.boundingBox();
  expect(stageBox).not.toBeNull();
  expect(canvasBox).not.toBeNull();
  expect(stageBox!.x).toBe(0);
  expect(stageBox!.y).toBe(0);
  expect(stageBox!.width).toBe(width);
  expect(stageBox!.height).toBe(height);
  expect(canvasBox!.x).toBe(0);
  expect(canvasBox!.y).toBe(0);
  expect(canvasBox!.width).toBe(width);
  expect(canvasBox!.height).toBe(height);
  await expectDocumentToFitViewport(page);
}

async function expectCompactOverlayControls(page: Page) {
  const canvas = page.getByRole("img", {
    name: "Peppa lesson garden pixel game world",
  });
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();

  for (const name of BUTTON_NAMES) {
    const button = page.getByRole("button", { name });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeLessThanOrEqual(48);
    expect(box!.height).toBeLessThanOrEqual(48);
    expect(box!.x).toBeGreaterThanOrEqual(canvasBox!.x);
    expect(box!.y).toBeGreaterThanOrEqual(canvasBox!.y);
    expect(box!.x + box!.width).toBeLessThanOrEqual(
      canvasBox!.x + canvasBox!.width,
    );
    expect(box!.y + box!.height).toBeLessThanOrEqual(
      canvasBox!.y + canvasBox!.height,
    );
    expect(
      await button.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const topElement = document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2,
        );
        return topElement === element || element.contains(topElement);
      }),
    ).toBe(true);
  }

  const overlays = [
    page.getByRole("link", { name: "Back to home" }),
    page.getByRole("group", { name: "Move Peppa" }),
    page.getByRole("group", { name: "Peppa animations" }),
    page.getByRole("group", { name: "Game status" }),
    page.getByRole("group", { name: "Peppa speech" }),
  ];
  const overlayBoxes: ElementBox[] = [];
  for (const overlay of overlays) {
    await expect(overlay).toBeVisible();
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    overlayBoxes.push(box!);
  }

  for (let leftIndex = 0; leftIndex < overlayBoxes.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < overlayBoxes.length;
      rightIndex += 1
    ) {
      expect(boxesOverlap(overlayBoxes[leftIndex], overlayBoxes[rightIndex])).toBe(
        false,
      );
    }
  }
}

test("the game back control returns to the home hub", async ({ page }) => {
  await page.setViewportSize({ width: 280, height: 700 });
  await page.goto("/prototypes/pixel-stage/");

  const back = page.getByRole("link", { name: "Back to home" });
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute("href", "/");

  const backBox = await back.boundingBox();
  expect(backBox).not.toBeNull();
  expect(backBox!.width).toBeGreaterThanOrEqual(44);
  expect(backBox!.height).toBeGreaterThanOrEqual(44);

  await back.click();

  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("navigation", { name: "Learning activities" }),
  ).toBeVisible();
});

test("Peppa explores a fullscreen lesson garden with genuinely detailed large sprites", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/prototypes/pixel-stage/");

  await expect(page).toHaveTitle("Explore Peppa's lesson garden");
  await expect(
    page.getByRole("heading", { name: "Explore Peppa's lesson garden" }),
  ).toBeAttached();

  const world = page.getByRole("group", {
    name: "Peppa lesson garden game world",
  });
  const canvas = page.getByRole("img", {
    name: "Peppa lesson garden pixel game world",
  });
  await expect(world).toHaveAttribute("data-engine", "phaser");
  await expect(world).toHaveAttribute("data-ready", "true");
  await expect(world).toHaveAttribute("data-camera-zoom", "2");
  await expect(world).toHaveAttribute("data-sprite-detail-pixel-size", "1");
  await expect(world).toHaveAttribute("data-sprite-render-scale", "0.5");
  await expect(world).toHaveAttribute("data-sprite-frame-size", "320");
  await expect(world).toHaveAttribute("data-sprite-world-frame-size", "160");
  await expect(world).toHaveAttribute("data-sprite-screen-frame-size", "320");
  await expect(world).toHaveAttribute("data-ground-source-width", "1440");
  await expect(world).toHaveAttribute("data-ground-source-height", "960");
  await expect(world).toHaveAttribute("data-ground-world-width", "720");
  await expect(world).toHaveAttribute("data-ground-world-height", "480");
  await expect(world).toHaveAttribute("data-player-body-width", "48");
  await expect(world).toHaveAttribute("data-player-body-height", "24");
  await expect(world).toHaveAttribute("data-x", "450");
  await expect(world).toHaveAttribute("data-y", "192");
  await expect(world).toHaveAttribute("data-frame", "0");
  await page.waitForTimeout(700);
  await expect(world).toHaveAttribute("data-frame", "0");
  await expect(canvas).toHaveCSS("image-rendering", "pixelated");
  await expectFullscreenGame(page, 390, 844);
  await expectCompactOverlayControls(page);

  expect(Number(await world.getAttribute("data-depth"))).toBeLessThan(
    Number(await world.getAttribute("data-landmark-depth")),
  );
  const initialCameraY = Number(await world.getAttribute("data-camera-y"));
  const moveLeft = page.getByRole("button", { name: "Move left" });
  const moveRight = page.getByRole("button", { name: "Move right" });
  const moveDown = page.getByRole("button", { name: "Move down" });

  await moveLeft.dispatchEvent("pointerdown");
  try {
    await expect
      .poll(async () => Number(await world.getAttribute("data-x")), {
        timeout: 10_000,
      })
      .toBeLessThanOrEqual(315);
  } finally {
    await moveLeft.dispatchEvent("pointerup");
  }
  await moveDown.dispatchEvent("pointerdown");
  try {
    await expect
      .poll(async () => Number(await world.getAttribute("data-y")), {
        timeout: 10_000,
      })
      .toBeGreaterThanOrEqual(220);
  } finally {
    await moveDown.dispatchEvent("pointerup");
  }
  expect(Number(await world.getAttribute("data-y"))).toBeLessThan(300);
  await expect(world).toHaveAttribute("data-occlusion", "behind-tree");

  await moveRight.dispatchEvent("pointerdown");
  try {
    await expect
      .poll(async () => Number(await world.getAttribute("data-x")), {
        timeout: 10_000,
      })
      .toBeGreaterThanOrEqual(390);
  } finally {
    await moveRight.dispatchEvent("pointerup");
  }
  await moveDown.dispatchEvent("pointerdown");
  try {
    await expect
      .poll(async () => Number(await world.getAttribute("data-y")), {
        timeout: 10_000,
      })
      .toBeGreaterThanOrEqual(305);
  } finally {
    await moveDown.dispatchEvent("pointerup");
  }
  await moveLeft.dispatchEvent("pointerdown");
  try {
    await expect
      .poll(async () => Number(await world.getAttribute("data-x")), {
        timeout: 10_000,
      })
      .toBeLessThanOrEqual(350);
  } finally {
    await moveLeft.dispatchEvent("pointerup");
  }

  await expect(world).toHaveAttribute("data-occlusion", "in-front-of-tree");
  await expect
    .poll(async () => Number(await world.getAttribute("data-camera-y")))
    .toBeGreaterThan(initialCameraY);

  for (const { button, state } of [
    { button: "Talking animation", state: "talking" },
    { button: "Happy animation", state: "happy" },
    { button: "Surprised animation", state: "surprised" },
    { button: "Idle animation", state: "idle" },
  ]) {
    await page.getByRole("button", { name: button }).click();
    await expect(world).toHaveAttribute("data-state", state);
  }
});

test("the canvas remains edge-to-edge across narrow, odd, tall, and wide viewports", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/prototypes/pixel-stage/");
  const world = page.getByRole("group", {
    name: "Peppa lesson garden game world",
  });
  await expect(world).toHaveAttribute("data-ready", "true");

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 943, height: 966 },
    { width: 722, height: 966 },
    { width: 672, height: 966 },
    { width: 375, height: 667 },
    { width: 280, height: 700 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await expectFullscreenGame(page, viewport.width, viewport.height);
    if (viewport.width === 280 || viewport.height === 390) {
      await expectCompactOverlayControls(page);
    }
  }

  await page.setViewportSize({ width: 1920, height: 1200 });
  await expectFullscreenGame(page, 1920, 1200);
  await expect(world).toHaveAttribute("data-camera-visible-width", "960");
  await expect(world).toHaveAttribute("data-camera-visible-height", "600");
  await expect(world).toHaveAttribute("data-camera-x", "-120");
  await expect(world).toHaveAttribute("data-camera-y", "-60");
});

test("overlaid speech never reduces the playable canvas", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto("/prototypes/pixel-stage/");
  const world = page.getByRole("group", {
    name: "Peppa lesson garden game world",
  });
  const speech = page.getByRole("group", { name: "Peppa speech" });
  await expect(world).toHaveAttribute("data-ready", "true");
  await expectFullscreenGame(page, 900, 900);

  await speech.evaluate((element) => {
    (element as HTMLElement).style.paddingBlock = "40px";
  });

  await expectFullscreenGame(page, 900, 900);
});
