import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  startSmallChat,
  useIncompleteProfile,
} from "./conversation-helpers";

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
        (element) =>
          element
            .getAnimations({ subtree: true })
            .filter((animation) => animation.playState === "running").length,
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
    const status = page.getByRole("main").getByRole("status");
    const peppa = page.getByRole("img", { exact: true, name: "Peppa" });

    await expect(status).toContainText("Thinking");
    await expectNoBusyAttribute(status);
    await expectActiveAnimation(status);
    await expectAnimationCount(peppa, 0);
    await expectAnimationCount(controls, 0);
    await expectAnimationCount(page.getByRole("main"), 1);
    await expect(captions).toContainText("You said");
    await expect(captions).toContainText("My name is Mia");
    await expect(
      page.getByRole("button", { name: "Finish chat" }),
    ).toBeVisible();
    const captionsBox = await box(captions);
    const controlsBox = await box(controls);
    await expect(
      page.getByRole("button", { name: "Waiting for Peppa" }),
    ).toHaveCount(0);

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
    await expect(captions).not.toContainText("Chat paused");
    await expect(captions).toContainText(
      "Peppa did not answer.",
    );
    await expect(captions).not.toContainText("Tap Try chat again");
    await expect(captions).not.toContainText("My name is Mia");
    await expect(retry).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Waiting for Peppa" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Finish chat" }),
    ).toBeHidden();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("img", { name: "Peppa" })).toHaveAttribute(
      "src",
      /peppa-sad-768\.webp$/,
    );

    const retryBox = await box(retry);
    expectSameControlRow(controlsBox, retryBox);
    expect(retryBox.width).toBeGreaterThanOrEqual(controlsBox.width - 2);
    expectSameBox(captionsBox, await box(captions));
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

test("a timed-out connection gets one retry before a lesson alternative", async ({
  page,
}) => {
  await page.setViewportSize({ height: 568, width: 280 });
  await page.goto("/talk-to-peppa?parrotE2eConversation=connecting");
  await page.clock.install();
  await startSmallChat(page);

  const captions = page.getByRole("region", {
    name: "Conversation captions",
  });
  const status = page.getByRole("main").getByRole("status");
  const captionsBox = await box(captions);

  await expect(status).toContainText("Getting ready");
  await expectNoBusyAttribute(status);
  await expectActiveAnimation(status);
  await expectAnimationCount(
    page.getByRole("img", { exact: true, name: "Peppa" }),
    0,
  );
  await expect(
    page.getByRole("group", { name: "Conversation controls" }),
  ).toHaveCount(0);
  await expectAnimationCount(page.getByRole("main"), 1);
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
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  expectSameBox(captionsBox, await box(captions));

  await retry.click();
  await expect(retry).toBeHidden();
  await expect(status).toContainText("Getting ready");
  await expectNoBusyAttribute(status);
  await expectActiveAnimation(status);
  await expectAnimationCount(
    page.getByRole("img", { exact: true, name: "Peppa" }),
    0,
  );
  await expect(
    page.getByRole("group", { name: "Conversation controls" }),
  ).toHaveCount(0);
  await expectAnimationCount(page.getByRole("main"), 1);
  await expect(captions).toContainText("Starting the voice chat.");
  await expect(captions).not.toContainText("did not start");

  await page.clock.fastForward(3_000);
  await expect(captions).toContainText("Starting the voice chat.");
  await page.clock.fastForward(1_100);
  await expect(captions).toContainText("Still getting ready.");
  await expect(status).toContainText("Still getting ready.");
  await page.clock.fastForward(8_000);
  const lesson = page.getByRole("button", { name: "Play a lesson" });
  const lessonCover = page.getByRole("img", {
    name: /Peppa and Dolly with a red ball/i,
  });
  await expect(lesson).toBeVisible();
  await expect(retry).toBeHidden();
  await expect(status).toContainText("Chat paused");
  await expect(status).toContainText("The chat did not start");
  await expect(status).toContainText("Play a lesson");
  await expect(captions).toContainText("The chat did not start.");
  await expect(lessonCover).toBeVisible();
  await expectNoBusyAttribute(status);
  await expectAnimationCount(status, 0);
  await expectAnimationCount(lessonCover, 0);
  await expectAnimationCount(lesson, 0);
  expectSameBox(captionsBox, await box(captions));
  await expect(
    page.getByRole("group", { name: "Conversation controls" }),
  ).toContainText("Play a lesson");
  expect((await box(lesson)).height).toBeGreaterThanOrEqual(44);
  await expectNoPageScroll(page);

  await lesson.click();
  await expect(page).toHaveURL(/\/lessons$/);
  await expect(
    page.getByRole("heading", { name: "Pick a lesson" }),
  ).toBeVisible();
});

for (const viewport of [
  { height: 568, name: "narrow phone", width: 280 },
  { height: 844, name: "regular phone", width: 390 },
  { height: 360, name: "short landscape", width: 640 },
]) {
  test(`two immediate Talk failures offer one lesson path on a ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/talk-to-peppa?parrotE2eConversation=error");
    await startSmallChat(page);

    const retry = page.getByRole("button", { name: "Try again" });
    await expect(retry).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "Peppa cannot talk now. Tap Try again.",
    );
    await retry.click();

    const status = page.getByRole("main").getByRole("status");
    const captions = page.getByRole("region", {
      name: "Conversation captions",
    });
    const lesson = page.getByRole("button", { name: "Play a lesson" });
    const lessonCover = page.getByRole("img", {
      name: /Peppa and Dolly with a red ball/i,
    });
    await expect(status).toHaveText(
      "Chat paused. Peppa cannot talk now. Play a lesson.",
    );
    await expect(captions).toContainText("Peppa cannot talk now.");
    await expect(lesson).toBeVisible();
    await expect(lessonCover).toBeVisible();
    await expect(retry).toBeHidden();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Finish chat" }),
    ).toHaveCount(0);
    await expectNoBusyAttribute(status);
    for (const locator of [status, lessonCover, lesson]) {
      await expectAnimationCount(locator, 0);
    }
    const lessonBox = await box(lesson);
    expect(lessonBox.height).toBeGreaterThanOrEqual(44);
    expect(lessonBox.x).toBeGreaterThanOrEqual(0);
    expect(lessonBox.y).toBeGreaterThanOrEqual(0);
    expect(lessonBox.x + lessonBox.width).toBeLessThanOrEqual(viewport.width);
    expect(lessonBox.y + lessonBox.height).toBeLessThanOrEqual(viewport.height);
    await expectNoPageScroll(page);

    await lesson.click();
    await expect(page).toHaveURL(/\/lessons$/);
    const lessonHeading = page.getByRole("heading", { name: "Pick a lesson" });
    await expect(lessonHeading).toBeVisible();
    await expect(lessonHeading).toBeFocused();
  });
}

test("an opening greeting does not erase the used voice retry", async ({
  page,
}) => {
  await page.setViewportSize({ height: 568, width: 280 });
  await page.goto("/talk-to-peppa");
  await startSmallChat(page);
  await endLearnerTurn(page);
  await page.clock.fastForward(15_000);

  await page.getByRole("button", { name: "Try chat again" }).click();
  const nextTurn = page.getByRole("button", { name: "Tap, then talk" });
  await expect(nextTurn).toBeVisible();
  await nextTurn.click();
  await page.clock.fastForward(100);
  await page.getByRole("button", { name: "I’m done" }).click();
  await page.clock.fastForward(15_000);

  await expect(
    page.getByRole("button", { name: "Play a lesson" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try chat again" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Conversation captions" }),
  ).toContainText("Peppa did not answer.");
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
  const status = page.getByRole("main").getByRole("status");

  await expect(status).toContainText("Chat paused");
  await expect(status).toContainText("Try chat again");
  await expectNoBusyAttribute(status);
  await expect(captions).toContainText("Peppa did not answer.");
  await expect(retry).toBeEnabled();

  for (const locator of [status, peppa, retry]) {
    await expectAnimationCount(locator, 0);
  }
  await expectAnimationCount(page.getByRole("main"), 0);
});

test("reduced motion keeps every active remote wait static and named", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ height: 568, width: 280 });

  await page.goto("/talk-to-peppa?parrotE2eConversation=connecting");
  await startSmallChat(page);
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "Getting ready",
  );
  await expectAnimationCount(page.getByRole("main"), 0);

  await page.goto("/talk-to-peppa");
  await startSmallChat(page);
  await page.getByRole("button", { name: "Tap, then talk" }).click();
  await expect(page.getByLabel("Live transcript")).toContainText(
    "My name is Mia",
  );
  await page.getByRole("button", { name: "I’m done" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "Thinking",
  );
  await expectAnimationCount(page.getByRole("main"), 0);

  await page.goto("/talk-to-peppa?parrotE2eConversation=reconnecting");
  await startSmallChat(page);
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "Trying again",
  );
  await expectAnimationCount(page.getByRole("main"), 0);

  await useIncompleteProfile(page);
  await page.goto("/profile/setup?parrotE2eConversation=saving");
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "Saving your answers",
  );
  await expectAnimationCount(page.getByRole("main"), 0);
});
