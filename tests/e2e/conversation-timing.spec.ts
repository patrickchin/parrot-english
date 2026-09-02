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
  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
}

async function controlSlotBox(captions: Locator) {
  const value = await captions.evaluate((element) => {
    const slot = element.parentElement?.nextElementSibling;
    if (!(slot instanceof HTMLElement)) return null;
    const rect = slot.getBoundingClientRect();
    return {
      height: rect.height,
      width: rect.width,
      x: rect.x,
      y: rect.y,
    };
  });
  expect(value).not.toBeNull();
  return value!;
}

async function waitForControlMotion(locator: Locator) {
  await locator.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations()
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
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

for (const viewport of viewports) {
  test(`long Peppa text stays inside the caption viewport on a ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/talk-to-peppa?parrotE2eConversation=long");
    await startSmallChat(page);

    const captions = page.getByRole("region", {
      name: "Conversation captions",
    });
    const turn = page.getByRole("button", { name: "Tap, then talk" });
    const peppa = page.getByRole("img", { exact: true, name: "Peppa" });

    await expect(turn).toBeVisible();
    await expect(captions).toContainText("muddy puddles");
    await expect(peppa).toBeVisible();
    await expectNoPageScroll(page);

    await expect
      .poll(() =>
        captions.evaluate(
          (element) => element.scrollHeight > element.clientHeight,
        ),
      )
      .toBe(true);

    for (const locator of [captions, turn, peppa]) {
      const value = await box(locator);
      expect(value.x).toBeGreaterThanOrEqual(0);
      expect(value.y).toBeGreaterThanOrEqual(0);
      expect(value.x + value.width).toBeLessThanOrEqual(viewport.width);
      expect(value.y + value.height).toBeLessThanOrEqual(viewport.height);
    }
  });

  test(`transcript growth does not move the turn control on a ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/talk-to-peppa");
    await startSmallChat(page);

    const start = page.getByRole("button", { name: "Tap, then talk" });
    const controls = page.getByRole("group", {
      name: "Conversation controls",
    });
    const finish = page.getByRole("button", { name: "Finish chat" });
    await page.mouse.move(1, 1);
    await waitForControlMotion(start);
    const before = await box(start);
    const controlsBefore = await box(controls);
    const finishBefore = await box(finish);
    await start.click();
    await page.mouse.move(1, 1);

    const end = page.getByRole("button", { name: "I’m done" });
    await waitForControlMotion(end);
    const afterStart = await box(end);
    expectSameBox(before, afterStart);

    const transcript = page.getByLabel("Live transcript");
    await expect(transcript).toContainText("My name is Mia");
    const afterTranscript = await box(end);
    expectSameBox(before, afterTranscript);
    await expectNoPageScroll(page);

    await end.click();
    await page.mouse.move(1, 1);
    await expect(page.getByRole("main").getByRole("status")).toHaveText(
      "Thinking",
    );
    await expect(
      page.getByRole("button", { name: "Waiting for Peppa" }),
    ).toHaveCount(0);
    expectSameBox(controlsBefore, await box(controls));
    expectSameBox(finishBefore, await box(finish));
    await expectNoPageScroll(page);
  });

  test(`remote wait, Peppa speech, and learner turn keep their slots stable on a ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);

    await page.goto("/talk-to-peppa?parrotE2eConversation=connecting");
    await startSmallChat(page);
    await expect(
      page.getByRole("main").getByRole("status"),
    ).toContainText("Getting ready");
    const captions = page.getByRole("region", {
      name: "Conversation captions",
    });
    const waitingCaption = await box(captions);
    const waitingControls = await controlSlotBox(captions);

    await page.goto("/talk-to-peppa?parrotE2eConversation=opening-speaking");
    await startSmallChat(page);
    await expect(
      page.getByRole("main").getByRole("status"),
    ).toContainText("Peppa’s turn");
    expectSameBox(waitingCaption, await box(captions));
    expectSameBox(waitingControls, await controlSlotBox(captions));

    await page.goto("/talk-to-peppa");
    await startSmallChat(page);
    await expect(
      page.getByRole("button", { name: "Tap, then talk" }),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByRole("status"),
    ).toContainText("Your turn");
    expectSameBox(waitingCaption, await box(captions));
    expectSameBox(waitingControls, await controlSlotBox(captions));
    await expectNoPageScroll(page);
  });
}

test("short landscape gives Peppa and the conversation their own columns", async ({
  page,
}) => {
  const viewport = { height: 360, width: 640 };
  await page.setViewportSize(viewport);
  await page.goto("/talk-to-peppa");
  await startSmallChat(page);

  const peppa = await box(
    page.getByRole("img", { exact: true, name: "Peppa" }),
  );
  const captions = await box(
    page.getByRole("region", { name: "Conversation captions" }),
  );
  const controls = await box(
    page.getByRole("group", { name: "Conversation controls" }),
  );
  const turn = await box(page.getByRole("button", { name: "Tap, then talk" }));

  expect(peppa.height).toBeGreaterThanOrEqual(150);
  expect(peppa.x + peppa.width).toBeLessThanOrEqual(captions.x);
  expect(Math.abs(captions.x - controls.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(captions.width - controls.width)).toBeLessThanOrEqual(1);
  expect(turn.x).toBeGreaterThanOrEqual(controls.x);
  expect(turn.x + turn.width).toBeLessThanOrEqual(controls.x + controls.width);
  await expectNoPageScroll(page);
});

test("desktop landscapes keep one bounded two-column conversation stage", async ({
  page,
}) => {
  const compactLayouts: Array<{
    captions: Awaited<ReturnType<typeof box>>;
    controls: Awaited<ReturnType<typeof box>>;
    peppa: Awaited<ReturnType<typeof box>>;
  }> = [];
  const viewports = [
    { height: 620, width: 1360 },
    { height: 621, width: 1360 },
    { height: 1080, width: 1920 },
    { height: 1440, width: 2560 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/talk-to-peppa");
    await startSmallChat(page);

    const peppa = await box(
      page.getByRole("img", { exact: true, name: "Peppa" }),
    );
    const captions = await box(
      page.getByRole("region", { name: "Conversation captions" }),
    );
    const controls = await box(
      page.getByRole("group", { name: "Conversation controls" }),
    );

    expect(peppa.width).toBeGreaterThanOrEqual(640);
    expect(peppa.x + peppa.width).toBeLessThanOrEqual(captions.x);
    expect(Math.abs(captions.x - controls.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(captions.width - controls.width)).toBeLessThanOrEqual(1);
    const stageWidth = controls.x + controls.width - peppa.x;
    expect(stageWidth).toBeGreaterThanOrEqual(1200);
    expect(stageWidth).toBeLessThanOrEqual(1320);
    await expectNoPageScroll(page);

    if (viewport.width === 1360) {
      compactLayouts.push({ captions, controls, peppa });
    }
  }

  expect(Math.abs(compactLayouts[1].peppa.x - compactLayouts[0].peppa.x))
    .toBeLessThanOrEqual(12);
  expect(
    Math.abs(
      compactLayouts[1].captions.width - compactLayouts[0].captions.width,
    ),
  ).toBeLessThanOrEqual(12);
  expect(Math.abs(compactLayouts[1].controls.x - compactLayouts[0].controls.x))
    .toBeLessThanOrEqual(12);
});

test("a long landscape reply grows upward without moving the turn control", async ({
  page,
}) => {
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto("/talk-to-peppa");
  await startSmallChat(page);

  const normalBubble = await box(
    page.getByRole("region", { name: "Conversation captions" }),
  );
  const normalTurn = await box(
    page.getByRole("button", { name: "Tap, then talk" }),
  );

  await page.goto("/talk-to-peppa?parrotE2eConversation=long");
  await startSmallChat(page);

  const longBubble = await box(
    page.getByRole("region", { name: "Conversation captions" }),
  );
  const longTurn = await box(
    page.getByRole("button", { name: "Tap, then talk" }),
  );

  expect(longBubble.height).toBeGreaterThanOrEqual(normalBubble.height + 40);
  expect(
    Math.abs(
      longBubble.y +
        longBubble.height -
        (normalBubble.y + normalBubble.height),
    ),
  ).toBeLessThanOrEqual(1);
  expectSameBox(normalTurn, longTurn);
  await expectNoPageScroll(page);
});
