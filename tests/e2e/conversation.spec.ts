import { expect, test } from "@playwright/test";

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
