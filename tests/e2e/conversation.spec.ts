import { expect, test } from "@playwright/test";

test("Back returns home and Talk to Peppa can be opened again", async ({
  page,
}) => {
  await page.goto("/talk-to-peppa");
  await expect(page.getByRole("button", { name: "Start my turn" })).toBeVisible();

  await page.getByRole("button", { exact: true, name: "Back" }).click();

  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("navigation", { name: "Learning activities" }),
  ).toBeVisible();
  await expect(
    page.getByText("Peppa's voice chat is unavailable right now."),
  ).toBeHidden();

  await page.getByRole("link", { name: /^Talk to Peppa/ }).click();

  await expect(page).toHaveURL("/talk-to-peppa");
  const turnButton = page.getByRole("button", { name: "Start my turn" });
  await expect(turnButton).toBeVisible();
  await turnButton.click();
  await expect(
    page.getByRole("button", { name: "End my turn" }),
  ).toBeVisible();
});

test("the learner sees a streamed transcript while speaking", async ({ page }) => {
  await page.goto("/talk-to-peppa");

  await page.getByRole("button", { name: "Start my turn" }).click();

  const transcript = page.getByLabel("Live transcript");
  await expect(transcript).toBeVisible();
  await expect(transcript).toContainText("My name is Mia");

  await page.getByRole("button", { name: "End my turn" }).click();
  await expect(transcript).toBeVisible();
  await expect(transcript).toContainText("You said");
  await expect(transcript).toContainText("My name is Mia");
});

test("the latest Peppa message repeats from its bottom-right audio control", async ({
  page,
}) => {
  await page.setViewportSize({ width: 280, height: 568 });
  await page.goto("/talk-to-peppa");

  const message = page.getByRole("group", { name: "Peppa's message" });
  const text = message.getByText("Hello again! What's your name?", {
    exact: true,
  });
  const repeat = message.getByRole("button", {
    name: "Repeat Peppa's audio",
  });

  await expect(message).toBeVisible();
  await expect(text).toBeVisible();
  await expect(repeat).toBeEnabled();

  const messageBox = await message.boundingBox();
  const textBox = await text.boundingBox();
  const repeatBox = await repeat.boundingBox();
  expect(messageBox).not.toBeNull();
  expect(textBox).not.toBeNull();
  expect(repeatBox).not.toBeNull();

  expect(messageBox!.x + messageBox!.width - (repeatBox!.x + repeatBox!.width))
    .toBeLessThanOrEqual(16);
  expect(messageBox!.y + messageBox!.height - (repeatBox!.y + repeatBox!.height))
    .toBeLessThanOrEqual(16);
  expect(textBox!.x + textBox!.width).toBeLessThanOrEqual(repeatBox!.x);

  await repeat.click();
  await expect(repeat).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("Peppa is talking");
  await expect(repeat).toBeEnabled();
});
