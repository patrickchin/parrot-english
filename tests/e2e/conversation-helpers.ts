import { expect, type Page } from "@playwright/test";

export async function startSmallChat(
  page: Page,
  promptStyle?: "tiny-turns" | "gentle-guide" | "playful-pal",
) {
  const start = page.getByRole("button", { name: "Start chat" });
  await expect(start).toBeVisible();
  if (promptStyle) {
    await page.getByText("Grown-up: chat style", { exact: true }).click();
    await page.getByLabel("Chat style").selectOption(promptStyle);
  }
  await start.click();
}
