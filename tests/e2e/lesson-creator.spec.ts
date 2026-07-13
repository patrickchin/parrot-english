import { expect, test } from "@playwright/test";

test("lesson creator scrolls to its review controls on a short phone", async ({
  page,
}) => {
  const viewport = { width: 320, height: 568 };
  await page.setViewportSize(viewport);
  await page.goto("/lessons/my/create");

  await expect(
    page.getByRole("heading", { name: "Create a Lesson" }),
  ).toBeVisible();

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

  const reviewButton = page.getByRole("button", {
    exact: true,
    name: "Review script",
  });
  const reviewBox = await reviewButton.boundingBox();
  expect(reviewBox).not.toBeNull();
  expect(reviewBox!.y).toBeGreaterThanOrEqual(0);
  expect(reviewBox!.y + reviewBox!.height).toBeLessThanOrEqual(viewport.height);
});
