import { expect, test, type Locator, type Page } from "@playwright/test";
import { startSmallChat } from "./conversation-helpers";

const viewports = [
  { height: 568, name: "narrow phone", width: 280 },
  { height: 844, name: "regular phone", width: 390 },
  { height: 360, name: "short landscape", width: 640 },
  { height: 900, name: "desktop", width: 1440 },
];

async function visibleBox(locator: Locator) {
  await expect(locator).toBeVisible();
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  return value!;
}

async function expectInsideViewport(
  locator: Locator,
  viewport: { height: number; width: number },
) {
  const value = await visibleBox(locator);
  expect(value.x).toBeGreaterThanOrEqual(0);
  expect(value.y).toBeGreaterThanOrEqual(0);
  expect(value.x + value.width).toBeLessThanOrEqual(viewport.width);
  expect(value.y + value.height).toBeLessThanOrEqual(viewport.height);
  return value;
}

async function expectNoPageScroll(page: Page) {
  await expect
    .poll(() =>
      page.getByRole("main").evaluate((element) => ({
        horizontal: element.scrollWidth > element.clientWidth,
        vertical: element.scrollHeight > element.clientHeight,
      })),
    )
    .toEqual({ horizontal: false, vertical: false });
}

function expectSameControlSlot(
  before: Awaited<ReturnType<typeof visibleBox>>,
  after: Awaited<ReturnType<typeof visibleBox>>,
) {
  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
}

for (const viewport of viewports) {
  test(`blocked conversation sound has one stable recovery action on a ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/talk-to-peppa?parrotE2eConversation=audio-blocked");
    await startSmallChat(page);

    const status = page.getByRole("status");
    const captions = page.getByRole("region", {
      name: "Conversation captions",
    });
    const hear = page.getByRole("button", { name: "Tap for sound" });
    await expect(status).toHaveText(/Sound is off/);
    await expect(captions).toContainText("Tap for sound.");
    await expect(page.getByRole("button", { name: "Tap, then talk" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Listen to Peppa" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Repeat Peppa's audio" })).toHaveCount(0);

    const blockedBox = await expectInsideViewport(hear, viewport);
    expect(blockedBox.height).toBeGreaterThanOrEqual(44);
    for (const locator of [
      page.getByRole("heading", { name: "Chat with Peppa" }),
      status,
      page.getByRole("img", { exact: true, name: "Peppa" }),
      captions,
      page.getByRole("button", { name: "Back" }),
    ]) {
      await expectInsideViewport(locator, viewport);
    }
    await expectNoPageScroll(page);

    await hear.click();
    const pending = page.getByRole("button", { name: "Starting sound" });
    await expect(pending).toBeDisabled();
    await expect(status).toHaveText(/Starting sound/);
    await expect(captions).toContainText("Starting sound.");
    expectSameControlSlot(blockedBox, await visibleBox(pending));
    await expectNoPageScroll(page);

    await expect(status).toHaveText(/Peppa’s turn/);
    await expect(page.getByRole("button", { name: "Listen to Peppa" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Tap for sound" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tap, then talk" })).toBeVisible({
      timeout: 3_000,
    });
    await expectNoPageScroll(page);
  });
}

test("a failed sound request restores one child-safe retry action", async ({
  page,
}) => {
  const viewport = { height: 568, width: 280 };
  await page.setViewportSize(viewport);
  await page.goto("/talk-to-peppa?parrotE2eConversation=audio-rejected");
  await startSmallChat(page);

  await page.getByRole("button", { name: "Tap for sound" }).click();
  await expect(page.getByRole("button", { name: "Starting sound" })).toBeDisabled();
  const retry = page.getByRole("button", { name: "Tap for sound" });
  await expect(retry).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(/Sound is off/);
  await expect(
    page.getByRole("region", { name: "Conversation captions" }),
  ).toContainText("Sound did not start. Tap again.");
  await expect(page.getByRole("button", { name: "Tap, then talk" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Repeat Peppa's audio" })).toHaveCount(0);
  await expectInsideViewport(retry, viewport);
  await expectNoPageScroll(page);

  await retry.click();
  await expect(page.getByRole("button", { name: "Tap, then talk" })).toBeVisible({
    timeout: 3_000,
  });
});

test("a delayed session playback signal opens the learner turn without inferring missed sound", async ({
  page,
}) => {
  await page.goto("/talk-to-peppa?parrotE2eConversation=audio-delayed");
  await startSmallChat(page);

  await expect(page.getByRole("status")).toHaveText(/Getting ready/);
  await expect(page.getByRole("button", { name: "Tap, then talk" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Listen to Peppa" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Repeat Peppa's audio" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tap, then talk" })).toBeVisible({
    timeout: 3_000,
  });
});
