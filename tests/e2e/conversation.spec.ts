import { expect, test } from "@playwright/test";

test("the learner sees a streamed transcript while speaking", async ({ page }) => {
  await page.goto("/talk-to-peppa");

  await page.getByRole("button", { name: "Start my turn" }).click();

  const transcript = page.getByLabel("Live transcript");
  await expect(transcript).toBeVisible();
  await expect(transcript).toContainText("My name is Mia");

  await page.getByRole("button", { name: "End my turn" }).click();
  await expect(transcript).toBeHidden();
});
