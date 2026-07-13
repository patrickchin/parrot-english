import { expect, test } from "@playwright/test";

test("unfinished activities are clearly disabled on the home menu", async ({
  page,
}) => {
  await page.goto("/");

  for (const label of ["Progress", "Storytelling"]) {
    const activity = page.getByRole("button", {
      name: `${label}, coming soon`,
    });

    await expect(activity).toBeVisible();
    await expect(activity).toBeDisabled();
    await expect(activity.getByText("Coming soon", { exact: true })).toBeVisible();
  }

  for (const label of ["Talk to Peppa", "Lessons", "Create a Lesson"]) {
    await expect(page.getByRole("link", { name: new RegExp(`^${label}`) })).toBeVisible();
  }
});
