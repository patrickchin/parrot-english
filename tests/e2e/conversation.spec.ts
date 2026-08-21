import { expect, test } from "@playwright/test";
import { startSmallChat } from "./conversation-helpers";

test("Back returns home and Talk to Peppa can be opened again", async ({
  page,
}) => {
  await page.goto("/talk-to-peppa");
  await startSmallChat(page);
  await expect(page.getByRole("button", { name: "Tap, then talk" })).toBeVisible();

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
  await startSmallChat(page);
  const turnButton = page.getByRole("button", { name: "Tap, then talk" });
  await expect(turnButton).toBeVisible();
  await turnButton.click();
  await expect(
    page.getByRole("button", { name: "I’m done" }),
  ).toBeVisible();
});

test("the learner sees a streamed transcript while speaking", async ({ page }) => {
  await page.goto("/talk-to-peppa");
  await startSmallChat(page);

  await page.getByRole("button", { name: "Tap, then talk" }).click();

  const transcript = page.getByLabel("Live transcript");
  await expect(transcript).toBeVisible();
  await expect(transcript).toContainText("My name is Mia");

  await page.getByRole("button", { name: "I’m done" }).click();
  const answer = page.getByLabel("Your answer");
  await expect(answer).toBeVisible();
  await expect(answer).toContainText("You said");
  await expect(answer).toContainText("My name is Mia");
});

test("the latest Peppa message repeats from its bottom-right audio control", async ({
  page,
}) => {
  await page.setViewportSize({ width: 280, height: 568 });
  await page.goto("/talk-to-peppa");
  await startSmallChat(page);

  const message = page.getByRole("group", { name: "Peppa's message" });
  const quotedSpeech = message.getByRole("blockquote", {
    name: "Peppa's speech",
  });
  const text = message.getByText("Hello again! What's your name?", {
    exact: true,
  });
  const repeat = message.getByRole("button", {
    name: "Repeat Peppa's audio",
  });

  await expect(message).toBeVisible();
  await expect(quotedSpeech).toBeVisible();
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
  await expect(repeat).toBeHidden();
  await expect(page.getByRole("status")).toContainText("Peppa’s turn");
  await expect(repeat).toBeVisible();
});
