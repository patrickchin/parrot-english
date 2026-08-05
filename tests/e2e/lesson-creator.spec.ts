import { expect, test, type Locator, type Page } from "@playwright/test";
import { createLessonScript } from "../fixtures/lesson-script.mjs";

const shortPhone = { width: 320, height: 568 };

async function expectMainScrollsTo(page: Page, target: Locator) {
  const main = page.getByRole("main");
  const scrollRange = await main.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(scrollRange.scrollHeight).toBeGreaterThan(scrollRange.clientHeight);

  await main.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect
    .poll(() => main.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);

  await target.scrollIntoViewIfNeeded();
  const targetBox = await target.boundingBox();
  expect(targetBox).not.toBeNull();
  expect(targetBox!.y).toBeGreaterThanOrEqual(0);
  expect(targetBox!.y + targetBox!.height).toBeLessThanOrEqual(
    shortPhone.height,
  );
}

test("lesson creator scrolls to its review controls on a short phone", async ({
  page,
}) => {
  await page.setViewportSize(shortPhone);
  await page.goto("/lessons/my/create");

  await expect(
    page.getByRole("heading", { name: "Create a custom lesson" }),
  ).toBeVisible();

  const makeLessonButton = page.getByRole("button", {
    exact: true,
    name: "Make lesson",
  });
  await expectMainScrollsTo(page, makeLessonButton);
});

test("lesson creator tabs expose selection and support arrow keys", async ({
  page,
}) => {
  await page.goto("/lessons/my/create");

  const makeWithAi = page.getByRole("tab", { name: "Make with AI" });
  const importJson = page.getByRole("tab", { name: "Import JSON" });

  await expect(makeWithAi).toHaveAttribute("aria-selected", "true");
  await expect(makeWithAi).toHaveAttribute(
    "aria-controls",
    "lesson-creator-panel",
  );
  await expect(makeWithAi).toHaveAttribute("tabindex", "0");
  await expect(importJson).toHaveAttribute("aria-selected", "false");
  await expect(importJson).toHaveAttribute(
    "aria-controls",
    "lesson-creator-panel",
  );
  await expect(importJson).toHaveAttribute("tabindex", "-1");
  await expect(page.locator("#lesson-creator-panel")).toHaveCount(1);

  await makeWithAi.focus();
  await page.keyboard.press("ArrowRight");

  await expect(importJson).toBeFocused();
  await expect(importJson).toHaveAttribute("aria-selected", "true");
  await expect(importJson).toHaveAttribute("tabindex", "0");
  await expect(makeWithAi).toHaveAttribute("aria-selected", "false");
  await expect(makeWithAi).toHaveAttribute("tabindex", "-1");
  await expect(page.locator("#lesson-creator-panel")).toHaveCount(1);
  await expect(page.getByRole("tabpanel")).toHaveAccessibleName("Import JSON");
});

test("lesson editor scrolls to its review controls on a short phone", async ({
  page,
}) => {
  await page.route("**/api/lessons/my/scroll-test", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        lesson: {
          id: "scroll-test",
          lesson: createLessonScript(),
          source: "generated",
        },
      }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.setViewportSize(shortPhone);
  await page.goto("/lessons/my/scroll-test/edit");

  await expect(page.getByRole("heading", { name: "Edit Lesson" })).toBeVisible();

  const reviewButton = page.getByRole("button", {
    exact: true,
    name: "Review script",
  });
  await expect(reviewButton).toBeEnabled();
  await expectMainScrollsTo(page, reviewButton);
});
