import { expect, type Page } from "@playwright/test";

export async function openLearnerProfileForm(page: Page, path: string) {
  await page.goto(path);
  await page.getByRole("button", { exact: true, name: "Back" }).click();
  await expect(
    page.getByRole("button", { name: /^(Start|Continue) questions$/ }),
  ).toBeVisible();
}
