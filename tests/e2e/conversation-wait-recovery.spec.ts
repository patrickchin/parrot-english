import { expect, test, type Locator, type Page } from "@playwright/test";
import { startSmallChat } from "./conversation-helpers";

const viewports = [
  { height: 568, name: "narrow phone", width: 280 },
  { height: 844, name: "phone", width: 390 },
  { height: 360, name: "short landscape", width: 640 },
  { height: 900, name: "desktop", width: 1440 },
];

async function box(locator: Locator) {
  await expect(locator).toBeVisible();
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  return value!;
}

function expectSameBox(
  before: Awaited<ReturnType<typeof box>>,
  after: Awaited<ReturnType<typeof box>>,
) {
  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(2);
}

function expectSameControlRow(
  before: Awaited<ReturnType<typeof box>>,
  after: Awaited<ReturnType<typeof box>>,
) {
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(2);
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

async function expectNoBusyAttribute(locator: Locator) {
  await expect.poll(() => locator.getAttribute("aria-busy")).toBeNull();
}

async function expectAnimationCount(locator: Locator, count: number) {
  await expect
    .poll(() =>
      locator.evaluate(
        (element) => element.getAnimations({ subtree: true }).length,
      ),
    )
    .toBe(count);
}

async function expectActiveAnimation(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate(
        (element) => element.getAnimations({ subtree: true }).length,
      ),
    )
    .toBeGreaterThan(0);
}

async function endLearnerTurn(page: Page) {
  await page.getByRole("button", { name: "Tap, then talk" }).click();
  await expect(page.getByLabel("Live transcript")).toContainText(
    "My name is Mia",
  );
  await page.clock.install();
  await page.getByRole("button", { name: "I’m done" }).click();
}

for (const viewport of viewports) {
  test(`a long unanswered turn becomes one honest recovery on a ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/talk-to-peppa");
    await startSmallChat(page);
    await endLearnerTurn(page);

    const captions = page.getByRole("region", {
      name: "Conversation captions",
    });
    const controls = page.getByRole("group", {
      name: "Conversation controls",
    });
    const status = page.getByRole("status");
    const waiting = page.getByRole("button", { name: "Waiting for Peppa" });

    await expect(status).toContainText("Thinking");
    await expectNoBusyAttribute(status);
    await expectActiveAnimation(status);
    await expect(captions).toContainText("You said");
    await expect(captions).toContainText("My name is Mia");
    await expect(
      page.getByRole("button", { name: "Finish chat" }),
    ).toBeVisible();
    const waitingBox = await box(waiting);
    const controlsBox = await box(controls);

    await page.clock.fastForward(1_800);
    await expect(captions).toContainText("Wait for Peppa.");
    await expect(captions).not.toContainText("My name is Mia");

    await page.clock.fastForward(5_200);
    await expect(captions).toContainText("Still waiting for Peppa.");

    await page.clock.fastForward(8_000);
    const retry = page.getByRole("button", { name: "Try chat again" });
    await expect(status).toContainText("Chat paused");
    await expect(status).toContainText("Peppa did not answer");
    await expect(status).toContainText("Try chat again");
    await expectNoBusyAttribute(status);
    await expectAnimationCount(status, 0);
    await expect(captions).toContainText("Chat paused");
    await expect(captions).toContainText(
      "Peppa did not answer.",
    );
    await expect(captions).not.toContainText("Tap Try chat again");
    await expect(captions).not.toContainText("My name is Mia");
    await expect(retry).toBeVisible();
    await expect(waiting).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Finish chat" }),
    ).toBeHidden();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("img", { name: "Peppa" })).toHaveAttribute(
      "src",
      /peppa-sad-768\.webp$/,
    );

    const retryBox = await box(retry);
    expectSameControlRow(waitingBox, retryBox);
    expect(retryBox.width).toBeGreaterThanOrEqual(waitingBox.width);
    expectSameBox(controlsBox, await box(controls));
    expect(retryBox.height).toBeGreaterThanOrEqual(44);
    expect(retryBox.x).toBeGreaterThanOrEqual(0);
    expect(retryBox.y).toBeGreaterThanOrEqual(0);
    expect(retryBox.x + retryBox.width).toBeLessThanOrEqual(viewport.width);
    expect(retryBox.y + retryBox.height).toBeLessThanOrEqual(viewport.height);
    await expectNoPageScroll(page);

    await retry.click();
    const nextTurn = page.getByRole("button", { name: "Tap, then talk" });
    await expect(nextTurn).toBeVisible();
    await expect(retry).toBeHidden();
    await expect(captions).not.toContainText("My name is Mia");

    await nextTurn.click();
    await page.clock.fastForward(100);
    await expect(page.getByLabel("Live transcript")).toContainText(
      "My name is Mia",
    );
    await page.getByRole("button", { name: "I’m done" }).click();
    await expect(status).toContainText("Thinking");
    await expectNoBusyAttribute(status);
    await expect(retry).toBeHidden();
    await expect(captions).toContainText("My name is Mia");
  });
}

test("a timed-out connection restarts its feedback clock", async ({ page }) => {
  await page.setViewportSize({ height: 568, width: 280 });
  await page.goto("/talk-to-peppa?parrotE2eConversation=connecting");
  await page.clock.install();
  await startSmallChat(page);

  const captions = page.getByRole("region", {
    name: "Conversation captions",
  });
  const controls = page.getByRole("group", {
    name: "Conversation controls",
  });
  const status = page.getByRole("status");
  const controlsBox = await box(controls);

  await expect(status).toContainText("Getting ready");
  await expectNoBusyAttribute(status);
  await expectActiveAnimation(status);
  await page.clock.fastForward(12_000);

  const retry = page.getByRole("button", { name: "Try chat again" });
  await expect(retry).toBeVisible();
  await expect(status).toContainText("Chat paused");
  await expect(status).toContainText("Try chat again");
  await expectNoBusyAttribute(status);
  await expectAnimationCount(status, 0);
  await expect(captions).toContainText(
    "The chat did not start.",
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
  expectSameBox(controlsBox, await box(controls));

  await retry.click();
  await expect(retry).toBeHidden();
  await expect(status).toContainText("Getting ready");
  await expectNoBusyAttribute(status);
  await expectActiveAnimation(status);
  await expect(captions).toContainText("Starting the voice chat.");
  await expect(captions).not.toContainText("did not start");

  await page.clock.fastForward(3_000);
  await expect(captions).toContainText("Starting the voice chat.");
  await page.clock.fastForward(1_100);
  await expect(captions).toContainText("Still getting ready.");
  await page.clock.fastForward(8_000);
  await expect(retry).toBeVisible();
  await expect(status).toContainText("Chat paused");
  await expectNoBusyAttribute(status);
  await expectAnimationCount(status, 0);
  expectSameBox(controlsBox, await box(controls));
  await expectNoPageScroll(page);
});

test("reduced motion keeps terminal recovery static and understandable", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ height: 568, width: 280 });
  await page.goto("/talk-to-peppa");
  await startSmallChat(page);
  await endLearnerTurn(page);
  await page.clock.fastForward(15_000);

  const captions = page.getByRole("region", {
    name: "Conversation captions",
  });
  const peppa = page.getByRole("img", { name: "Peppa" });
  const retry = page.getByRole("button", { name: "Try chat again" });
  const status = page.getByRole("status");

  await expect(status).toContainText("Chat paused");
  await expect(status).toContainText("Try chat again");
  await expectNoBusyAttribute(status);
  await expect(captions).toContainText("Peppa did not answer.");
  await expect(retry).toBeEnabled();

  for (const locator of [status, peppa, retry]) {
    await expectAnimationCount(locator, 0);
  }
});
