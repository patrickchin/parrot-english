import { expect, test, type Locator, type Page } from "@playwright/test";

const viewports = [
  { height: 568, name: "narrow phone", width: 280 },
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

    const captions = page.getByRole("region", {
      name: "Conversation captions",
    });
    const turn = page.getByRole("button", { name: "Start my turn" });
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

    const start = page.getByRole("button", { name: "Start my turn" });
    const before = await box(start);
    await start.click();

    const end = page.getByRole("button", { name: "End my turn" });
    const afterStart = await box(end);
    expectSameBox(before, afterStart);

    const transcript = page.getByLabel("Live transcript");
    await expect(transcript).toContainText("My name is Mia");
    const afterTranscript = await box(end);
    expectSameBox(before, afterTranscript);
    await expectNoPageScroll(page);

    await end.click();
    const waiting = page.getByRole("button", { name: "Waiting for Peppa" });
    const afterEnd = await box(waiting);
    expectSameBox(before, afterEnd);
    await expectNoPageScroll(page);
  });
}

test("short landscape gives Peppa and the conversation their own columns", async ({
  page,
}) => {
  const viewport = { height: 360, width: 640 };
  await page.setViewportSize(viewport);
  await page.goto("/talk-to-peppa");

  const peppa = await box(
    page.getByRole("img", { exact: true, name: "Peppa" }),
  );
  const captions = await box(
    page.getByRole("region", { name: "Conversation captions" }),
  );
  const turn = await box(page.getByRole("button", { name: "Start my turn" }));

  expect(peppa.height).toBeGreaterThanOrEqual(150);
  expect(peppa.x + peppa.width).toBeLessThanOrEqual(captions.x);
  expect(Math.abs(captions.x - turn.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(captions.width - turn.width)).toBeLessThanOrEqual(1);
  await expectNoPageScroll(page);
});

test("a long landscape reply grows upward without moving the turn control", async ({
  page,
}) => {
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto("/talk-to-peppa");

  const normalBubble = await box(
    page.getByRole("region", { name: "Conversation captions" }),
  );
  const normalTurn = await box(
    page.getByRole("button", { name: "Start my turn" }),
  );

  await page.goto("/talk-to-peppa?parrotE2eConversation=long");

  const longBubble = await box(
    page.getByRole("region", { name: "Conversation captions" }),
  );
  const longTurn = await box(
    page.getByRole("button", { name: "Start my turn" }),
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
