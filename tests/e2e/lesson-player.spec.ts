import { expect, test, type Locator, type Page } from "@playwright/test";

const lessonPath = "/lessons/parrot/01-peppas-high-ball/scenes/1";

const viewports = [
  { name: "ultra-narrow phone", width: 280, height: 568 },
  { name: "short landscape", width: 768, height: 600 },
  { name: "desktop", width: 1440, height: 900 },
];

async function visibleBox(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function expectInsideViewport(
  locator: Locator,
  viewport: { width: number; height: number },
) {
  const box = await visibleBox(locator);

  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  return box;
}

async function hasHorizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
}

for (const viewport of viewports) {
  test(`lesson HUD and controls stay usable on a ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(lessonPath);

    const hud = page.getByRole("banner", { name: "Lesson progress" });
    const title = page.getByText("The Ball Up High", { exact: true });
    const sceneProgress = page.getByLabel("Scene progress");
    const start = page.getByRole("button", { name: "Start lesson" });
    const controls = page.getByRole("navigation", { name: "Lesson controls" });

    const hudBox = await expectInsideViewport(hud, viewport);
    await expectInsideViewport(title, viewport);
    await expectInsideViewport(sceneProgress, viewport);
    const startBox = await expectInsideViewport(start, viewport);
    await expectInsideViewport(controls, viewport);

    expect(hudBox.y + hudBox.height).toBeLessThan(startBox.y);
    await expect.poll(() => hasHorizontalOverflow(page)).toBe(false);
  });
}
