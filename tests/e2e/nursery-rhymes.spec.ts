import { expect, test, type Locator, type Page } from "@playwright/test";

const RHYMES = [
  ["Five Little Ducks", "/dubs/five-little-ducks"],
  ["Old MacDonald Had a Farm", "/dubs/old-macdonald"],
  ["Twinkle Twinkle Little Star", "/dubs/twinkle-twinkle"],
  ["Row Row Row Your Boat", "/dubs/row-row-row-your-boat"],
  ["Mary Had a Little Lamb", "/dubs/mary-had-a-little-lamb"],
  ["Humpty Dumpty", "/dubs/humpty-dumpty"],
] as const;

async function expectContained(page: Page, locator: Locator) {
  const [box, viewport] = await Promise.all([
    locator.boundingBox(),
    Promise.resolve(page.viewportSize()),
  ]);
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
}

async function expectSharedHeaderTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(48);
  expect(box!.height).toBeGreaterThanOrEqual(48);
}

test("nursery rhyme picker presents six large illustrated projects", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dubs");
  await expect(page.getByRole("heading", { name: "Nursery rhymes" })).toBeVisible();
  await expect(page.getByText("Sing and record", { exact: true })).toHaveCount(0);
  const picker = page.getByRole("navigation", { name: "Nursery rhymes" });
  const routeHeader = page.getByRole("navigation", { name: "Page navigation" });
  const back = routeHeader.getByRole("link", { name: "Back to home" });
  await expect(page.getByText(
    "Choose a rhyme to watch. With a grown-up's permission, you can sing and save your recording.",
  )).toBeVisible();
  await expect(picker.getByRole("link")).toHaveCount(6);
  for (const [name, route] of RHYMES) {
    const card = picker.getByRole("link", {
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+Sing & record$`),
    });
    await expect(card).toHaveAttribute("href", route);
    await expect(card.getByText("Sing & record", { exact: true })).toBeVisible();
  }
  await expect.poll(() => picker.locator("img").evaluateAll((images) => images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true);
  await expect(back).toBeVisible();
  await expectSharedHeaderTarget(back);
  for (const card of await picker.getByRole("link").all()) {
    await expectContained(page, card);
    const [cardBox, imageBox] = await Promise.all([card.boundingBox(), card.locator("img").boundingBox()]);
    expect(cardBox).not.toBeNull();
    expect(imageBox).not.toBeNull();
    expect(imageBox!.height).toBeGreaterThan(180);
    expect(imageBox!.height / cardBox!.height).toBeGreaterThan(0.45);
  }

  const boxes = await Promise.all(
    (await picker.getByRole("link").all()).map((card) => card.boundingBox()),
  );
  expect(new Set(boxes.slice(0, 3).map((box) => Math.round(box!.y))).size).toBe(1);
  expect(boxes[3]!.y).toBeGreaterThan(boxes[0]!.y + boxes[0]!.height);
});

for (const viewport of [
  { width: 280, height: 568 },
  { width: 320, height: 480 },
  { width: 390, height: 844 },
  { width: 640, height: 360 },
  { width: 1280, height: 900 },
]) {
  test(`nursery picker stays contained at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/dubs");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const routeHeader = page.getByRole("navigation", { name: "Page navigation" });
    const back = routeHeader.getByRole("link", { name: "Back to home" });
    await expect(back).toBeVisible();
    await expectSharedHeaderTarget(back);
    for (const [name] of RHYMES) {
      const card = page.getByRole("link", {
        name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+Sing & record$`),
      });
      await expect(card).toBeVisible();
      await expectContained(page, card);
    }
  });
}

test("every new rhyme opens its own recording workspace", async ({ page }) => {
  for (const [title, route] of RHYMES.slice(2)) {
    await page.goto(`${route}?parrotE2eDub=empty`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Play full video" }),
    ).toBeVisible();
  }
});

for (const project of [
  {
    route: "/dubs/row-row-row-your-boat",
    sceneTitle: "Row the boat",
  },
  {
    route: "/dubs/humpty-dumpty",
    sceneTitle: "Humpty Dumpty",
  },
] as const) {
  test(`${project.route} uses one scene with a different image for each line`, async ({ page }) => {
    await page.goto(`${project.route}?parrotE2eDub=empty`);
    const scenes = page.getByRole("navigation", { name: "Scenes" });
    await expect(scenes.getByRole("button")).toHaveCount(1);
    await scenes.getByRole("button", {
      name: `Scene 1, ${project.sceneTitle}, Ready to start`,
    }).click();

    const video = page.getByRole("region", { name: "Scene video" });
    const sources: string[] = [];
    for (let line = 1; line <= 4; line += 1) {
      await expect(page.getByText(`Line ${line} of 4`, { exact: true })).toBeVisible();
      const image = video.getByRole("img");
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((element) =>
        element instanceof HTMLImageElement
        && element.complete
        && element.naturalWidth > 0,
      )).toBe(true);
      sources.push((await image.getAttribute("src")) ?? "");
      if (line < 4) {
        await page.getByRole("button", { name: "Next line" }).click();
      }
    }
    expect(new Set(sources).size).toBe(4);

    await page.getByRole("button", { name: "Back to full video" }).click();
    const [sceneBox, scenesBox] = await Promise.all([
      scenes.getByRole("button").boundingBox(),
      scenes.boundingBox(),
    ]);
    expect(sceneBox).not.toBeNull();
    expect(scenesBox).not.toBeNull();
    expect(Math.abs(sceneBox!.width - scenesBox!.width)).toBeLessThanOrEqual(2);
  });
}

test("the visible Old MacDonald project title wraps without ellipsis", async ({ page }) => {
  await page.setViewportSize({ height: 640, width: 320 });
  await page.goto("/dubs/old-macdonald?parrotE2eDub=empty");
  const heading = page.getByRole("heading", { name: "Old MacDonald Had a Farm" });
  const metrics = await heading.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      clientHeight: element.clientHeight,
      clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight,
      scrollWidth: element.scrollWidth,
      textOverflow: style.textOverflow,
    };
  });
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight);
  expect(metrics.textOverflow).not.toBe("ellipsis");
});
