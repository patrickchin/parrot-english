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

async function expectAnimationCount(locator: Locator, count: number) {
  await expect
    .poll(() =>
      locator.evaluate(
        (element) =>
          element
            .getAnimations({ subtree: true })
            .filter((animation) => animation.playState === "running").length,
      ),
    )
    .toBe(count);
}

async function observePendingFeedback(
  action: Locator,
  pendingLabel: string,
) {
  await action.evaluate((button, label) => {
    const metrics = window as Window & {
      parrotDirectActionFeedbackMs?: number;
      parrotDirectActionFeedbackStart?: number;
    };
    metrics.parrotDirectActionFeedbackMs = undefined;
    metrics.parrotDirectActionFeedbackStart = undefined;
    button.addEventListener(
      "click",
      () => {
        metrics.parrotDirectActionFeedbackStart = performance.now();
      },
      { capture: true, once: true },
    );
    const observer = new MutationObserver(() => {
      if (
        button.textContent?.includes(label) &&
        button.getAttribute("aria-disabled") === "true" &&
        metrics.parrotDirectActionFeedbackStart !== undefined
      ) {
        metrics.parrotDirectActionFeedbackMs =
          performance.now() - metrics.parrotDirectActionFeedbackStart;
        observer.disconnect();
      }
    });
    observer.observe(button, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
  }, pendingLabel);
}

async function expectImmediatePendingFeedback(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { parrotDirectActionFeedbackMs?: number })
            .parrotDirectActionFeedbackMs ?? null,
      ),
    )
    .not.toBeNull();
  const feedbackMs = await page.evaluate(
    () =>
      (window as Window & { parrotDirectActionFeedbackMs?: number })
        .parrotDirectActionFeedbackMs!,
  );
  expect(feedbackMs).toBeLessThan(100);
}

function expectSameControlSlot(
  before: Awaited<ReturnType<typeof visibleBox>>,
  after: Awaited<ReturnType<typeof visibleBox>>,
) {
  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(2);
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
    const peppa = page.getByRole("img", { exact: true, name: "Peppa" });
    const hear = page.getByRole("button", { name: "Tap for sound" });
    await expect(status).toHaveText(/Sound is off/);
    await expect(captions).toContainText("Hello again!");
    await expect(captions).not.toContainText(/Sound is off|Tap for sound/);
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

    await hear.focus();
    await expect(hear).toBeFocused();
    if (viewport.width === 390) {
      await observePendingFeedback(hear, "Starting sound");
    }
    await hear.click();
    const pending = page.getByRole("button", { name: "Starting sound" });
    await expect(pending).toHaveAttribute("aria-disabled", "true");
    await expect
      .poll(() => pending.evaluate((button: HTMLButtonElement) => button.disabled))
      .toBe(false);
    await expect(pending).toBeFocused();
    if (viewport.width === 390) {
      await expectImmediatePendingFeedback(page);
    }
    await expect(status.getByText("Sound is off", { exact: true })).toBeVisible();
    const statusSnapshot = await status.ariaSnapshot();
    expect(statusSnapshot).toContain("Starting sound.");
    expect(statusSnapshot).not.toContain("Sound is off");
    await expect(captions).not.toContainText(/Starting sound|Tap for sound/);
    await expectAnimationCount(status, 0);
    await expectAnimationCount(peppa, 0);
    await expectAnimationCount(pending, 1);
    await expectAnimationCount(page.getByRole("main"), 1);
    const pendingBox = await visibleBox(pending);
    expectSameControlSlot(blockedBox, pendingBox);
    await expectNoPageScroll(page);

    await page.keyboard.down("Space");
    await expectAnimationCount(pending, 1);
    expectSameControlSlot(pendingBox, await visibleBox(pending));
    await page.keyboard.up("Space");
    await page.keyboard.press("Enter");
    await expect(pending).toHaveAttribute("aria-disabled", "true");
    await expect(pending).toBeFocused();

    await expect(status).toHaveText(/Peppa’s turn/);
    await expect(captions).toBeFocused();
    await expect(
      page.getByRole("button", { name: "Listen to Peppa" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tap for sound" })).toHaveCount(0);
    const nextAction = page.getByRole("button", { name: "Tap, then talk" });
    await expect(nextAction).toBeVisible({ timeout: 3_000 });
    await expect(captions).toBeFocused();
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

  const action = page.getByRole("button", { name: "Tap for sound" });
  await action.focus();
  await action.click();
  await expect(page.getByRole("button", { name: "Starting sound" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  const retry = page.getByRole("button", { name: "Tap for sound" });
  await expect(retry).toBeVisible();
  await expect(retry).toBeFocused();
  const failedStatus = page.getByRole("status");
  await expect(failedStatus).toHaveText(/Sound is off/);
  expect(await failedStatus.ariaSnapshot()).toContain(
    "Sound did not start. Tap again.",
  );
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

test("sound recovery does not steal focus after the learner moves away", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/talk-to-peppa?parrotE2eConversation=audio-blocked");
  await startSmallChat(page);

  const action = page.getByRole("button", { name: "Tap for sound" });
  await action.focus();
  await action.click();
  await expect(page.getByRole("button", { name: "Starting sound" })).toBeFocused();

  const back = page.getByRole("button", { name: "Back" });
  await back.focus();
  await expect(back).toBeFocused();
  await expect(page.getByRole("button", { name: "Tap, then talk" })).toBeVisible({
    timeout: 3_000,
  });
  await expect(back).toBeFocused();
});

test("established sound recovery hands focus to the ready turn action", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto(
    "/talk-to-peppa?parrotE2eConversation=audio-established-blocked",
  );
  await startSmallChat(page);

  const sound = page.getByRole("button", { name: "Tap for sound" });
  await expect(sound).toBeVisible();
  await sound.focus();
  await sound.click();
  await expect(page.getByRole("button", { name: "Starting sound" })).toBeFocused();

  const turn = page.getByRole("button", { name: "Tap, then talk" });
  await expect(turn).toBeVisible({ timeout: 3_000 });
  await expect(turn).toBeFocused();
  await turn.press("Space");
  await expect(page.getByRole("button", { name: "I’m done" })).toBeFocused();
});

test("opening the microphone keeps one focused pending action", async ({
  page,
}) => {
  const viewport = { height: 844, width: 390 };
  await page.setViewportSize(viewport);
  await page.goto("/talk-to-peppa?parrotE2eConversation=microphone-delayed");
  await startSmallChat(page);

  const status = page.getByRole("status");
  const captions = page.getByRole("region", {
    name: "Conversation captions",
  });
  const peppa = page.getByRole("img", { exact: true, name: "Peppa" });
  const action = page.getByRole("button", { name: "Tap, then talk" });
  const actionBox = await visibleBox(action);
  await action.focus();
  await observePendingFeedback(action, "Opening microphone");
  await action.click();

  const pending = page.getByRole("button", { name: "Opening microphone" });
  await expect(pending).toHaveAttribute("aria-disabled", "true");
  await expect(pending).not.toHaveAttribute("disabled", "");
  await expect(pending).not.toHaveAttribute("aria-keyshortcuts", "Space");
  await expect(pending).not.toHaveAttribute("aria-pressed", /.+/);
  await expect(pending).toBeFocused();
  await expectImmediatePendingFeedback(page);
  await expect(status.getByText("Your turn", { exact: true })).toBeVisible();
  const statusSnapshot = await status.ariaSnapshot();
  expect(statusSnapshot).toContain("Opening microphone.");
  expect(statusSnapshot).not.toContain("Your turn");
  await expect(captions).toContainText("Hello again!");
  await expect(captions).not.toContainText("Opening microphone");
  await expectAnimationCount(status, 0);
  await expectAnimationCount(peppa, 0);
  await expectAnimationCount(pending, 1);
  await expectAnimationCount(page.getByRole("main"), 1);
  const pendingBox = await visibleBox(pending);
  expectSameControlSlot(actionBox, pendingBox);
  await expectNoPageScroll(page);

  await page.keyboard.down("Space");
  await expectAnimationCount(pending, 1);
  expectSameControlSlot(pendingBox, await visibleBox(pending));
  await page.keyboard.up("Space");
  await page.keyboard.press("Enter");
  await expect(pending).toHaveAttribute("aria-disabled", "true");
  await expect(pending).toBeFocused();

  const endTurn = page.getByRole("button", { name: "I’m done" });
  await expect(endTurn).toBeVisible({ timeout: 3_000 });
  await expect(endTurn).toBeFocused();
  await expect(status).toHaveText("Listening");
  expectSameControlSlot(actionBox, await visibleBox(endTurn));
  await expectNoPageScroll(page);
});

test("direct pending feedback has no running motion when reduced motion is requested", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/talk-to-peppa?parrotE2eConversation=audio-blocked");
  await startSmallChat(page);

  await page.getByRole("button", { name: "Tap for sound" }).click();
  const pending = page.getByRole("button", { name: "Starting sound" });
  await expect(pending).toHaveAttribute("aria-disabled", "true");
  await expectAnimationCount(page.getByRole("main"), 0);
  await page.keyboard.down("Space");
  await expectAnimationCount(page.getByRole("main"), 0);
  await page.keyboard.up("Space");
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
