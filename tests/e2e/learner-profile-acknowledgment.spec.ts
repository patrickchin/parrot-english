import { expect, test, type Locator, type Page } from "@playwright/test";

const acknowledgmentPath =
  "/profile/setup?parrotE2eProfile=acknowledgment";

const responsiveViewports = [
  { height: 568, width: 280 },
  { height: 844, width: 390 },
  { height: 360, width: 640 },
  { height: 900, width: 1440 },
] as const;

async function openAcknowledgment(page: Page) {
  await page.goto(acknowledgmentPath);
  await page
    .getByRole("button", { name: "Set up profile" })
    .click();
  await page.getByRole("textbox", { name: /Your answer/ }).fill("Mia");
  await page.getByRole("button", { exact: true, name: "Next" }).click();

  const heading = page.getByRole("heading", {
    name: "Mia is a lovely name!",
  });
  await expect(heading).toBeVisible();
  return heading;
}

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  return value!;
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

    expect(imageBox.y + imageBox.height).toBeLessThanOrEqual(headingBox.y + 1);
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
