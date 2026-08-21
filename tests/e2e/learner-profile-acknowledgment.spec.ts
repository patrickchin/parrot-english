import { expect, test, type Locator, type Page } from "@playwright/test";

const acknowledgmentPath =
  "/profile/setup?parrotE2eProfile=acknowledgment";
const longAcknowledgmentPath =
  "/profile/setup?parrotE2eProfile=long-acknowledgment";
const longAcknowledgment =
  "Mia, that is a lovely answer! Peppa is happy to know you, and she cannot wait to hear about your favourite games, animals, stories, songs, and silly dances too!";

const responsiveViewports = [
  { height: 568, width: 280 },
  { height: 844, width: 390 },
  { height: 360, width: 640 },
  { height: 900, width: 1440 },
] as const;

async function openAcknowledgment(
  page: Page,
  {
    path = acknowledgmentPath,
    text = "Mia is a lovely name!",
  }: { path?: string; text?: string } = {},
) {
  await page.goto(path);
  await page
    .getByRole("button", { name: "Set up profile" })
    .click();
  await page.getByRole("textbox", { name: /Your answer/ }).fill("Mia");
  await page.getByRole("button", { exact: true, name: "Next" }).click();

  const heading = page.getByRole("heading", {
    name: text,
  });
  await expect(heading).toBeVisible();
  return heading;
}

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  return value!;
}

function boxesOverlap(
  first: { height: number; width: number; x: number; y: number },
  second: { height: number; width: number; x: number; y: number },
) {
  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}

async function expectInsideViewport(
  locator: Locator,
  viewport: (typeof responsiveViewports)[number],
) {
  await expect(locator).toBeVisible();
  const value = await box(locator);
  expect(value.x).toBeGreaterThanOrEqual(0);
  expect(value.y).toBeGreaterThanOrEqual(0);
  expect(value.x + value.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(value.y + value.height).toBeLessThanOrEqual(viewport.height + 1);
  return value;
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        document: document.documentElement.scrollWidth - window.innerWidth,
        main:
          document.querySelector("main")!.scrollWidth -
          document.querySelector("main")!.clientWidth,
      })),
    )
    .toEqual({ document: 0, main: 0 });
}

test("profile acknowledgment stays until its explicit Next action", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  const heading = await openAcknowledgment(page);
  const next = page.getByRole("button", { exact: true, name: "Next" });

  await expect(heading).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(next).toBeFocused();

  await page.waitForTimeout(2_200);
  await expect(page).toHaveURL(acknowledgmentPath);
  await expect(heading).toBeVisible();
  await expect(next).toBeVisible();
  await expect(next).toBeFocused();

  await next.click();
  await expect(page).toHaveURL("/");
  await expect(heading).toHaveCount(0);
});

test("profile acknowledgment keeps one ordered action at responsive targets", async ({
  page,
}) => {
  for (const viewport of responsiveViewports) {
    await page.setViewportSize(viewport);
    const heading = await openAcknowledgment(page);
    const image = page.getByRole("img", { name: "Peppa smiling" });
    const next = page.getByRole("button", { exact: true, name: "Next" });
    const main = page.getByRole("main");

    await next.scrollIntoViewIfNeeded();
    const [imageBox, headingBox, nextBox] = await Promise.all([
      box(image),
      box(heading),
      box(next),
    ]);

    if (viewport.width === 640 && viewport.height === 360) {
      expect(imageBox.x + imageBox.width).toBeLessThanOrEqual(headingBox.x + 1);
      expect(imageBox.x + imageBox.width).toBeLessThanOrEqual(nextBox.x + 1);
    } else {
      expect(imageBox.y + imageBox.height).toBeLessThanOrEqual(
        headingBox.y + 1,
      );
    }
    expect(headingBox.y + headingBox.height).toBeLessThanOrEqual(nextBox.y + 1);
    expect(nextBox.height).toBeGreaterThanOrEqual(44);
    expect(nextBox.width).toBeGreaterThanOrEqual(44);
    await expect
      .poll(() =>
        page.evaluate(() => ({
          document: document.documentElement.scrollWidth - window.innerWidth,
          main:
            document.querySelector("main")!.scrollWidth -
            document.querySelector("main")!.clientWidth,
        })),
      )
      .toEqual({ document: 0, main: 0 });
    await expect(main).toContainText("Mia is a lovely name!");
  }
});

for (const viewport of responsiveViewports) {
  test(`a 160-character acknowledgment stays fully usable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const heading = await openAcknowledgment(page, {
      path: longAcknowledgmentPath,
      text: longAcknowledgment,
    });
    const image = page.getByRole("img", { name: "Peppa smiling" });
    const next = page.getByRole("button", { exact: true, name: "Next" });
    const account = page.getByRole("button", { name: /^Account for / });
    const main = page.getByRole("main");

    await expect(heading).toHaveText(longAcknowledgment);
    await expect(heading).toBeFocused();
    await expect
      .poll(() =>
        heading.evaluate((element) => ({
          horizontal: element.scrollWidth - element.clientWidth,
          vertical: element.scrollHeight - element.clientHeight,
        })),
      )
      .toEqual({ horizontal: 0, vertical: 0 });
    await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBe(0);
    await expect(image).toBeVisible();
    const [imageBox, headingBox, nextBox, accountBox] = await Promise.all([
      box(image),
      expectInsideViewport(heading, viewport),
      expectInsideViewport(next, viewport),
      expectInsideViewport(account, viewport),
    ]);
    expect(nextBox.height).toBeGreaterThanOrEqual(44);
    expect(nextBox.width).toBeGreaterThanOrEqual(44);
    for (const contentBox of [imageBox, headingBox, nextBox]) {
      expect(boxesOverlap(accountBox, contentBox)).toBe(false);
    }
    await expectNoHorizontalOverflow(page);

    await page.waitForTimeout(2_200);
    await expect(page).toHaveURL(longAcknowledgmentPath);
    await expect(heading).toHaveText(longAcknowledgment);
    await expect(next).toBeVisible();
    await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBe(0);

    await next.click();
    await expect(page).toHaveURL("/");
    await expect(heading).toHaveCount(0);
  });
}
