import { expect, test, type Locator } from "@playwright/test";

const viewports = [
  { height: 844, name: "phone", width: 390 },
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

for (const viewport of viewports) {
  test(`the bottom actions stay in place after ending a turn on a ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/talk-to-peppa");

    await page.getByRole("button", { name: "Start my turn" }).click();
    await expect(page.getByLabel("Live transcript")).toContainText(
      "My name is Mia",
    );

    const endTurn = page.getByRole("button", { name: "End my turn" });
    const finish = page.getByRole("button", { name: "Finish conversation" });
    const before = await Promise.all([box(endTurn), box(finish)]);

    await endTurn.click();

    const waiting = page.getByRole("button", {
      name: "Waiting for Peppa's reply",
    });
    await expect(waiting).toBeDisabled();
    const after = await Promise.all([box(waiting), box(finish)]);

    for (let index = 0; index < before.length; index += 1) {
      expectSameBox(before[index], after[index]);
    }
  });

  test(`the response timer does not move conversation content on a ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/talk-to-peppa");

    await page.getByRole("button", { name: "Start my turn" }).click();
    await page.getByRole("button", { name: "End my turn" }).click();

    const peppa = page.getByRole("img", { exact: true, name: "Peppa" });
    const status = page.getByRole("status").filter({
      hasText: "Peppa is thinking",
    });
    const finish = page.getByRole("button", { name: "Finish conversation" });
    const timer = page.getByLabel("Peppa response latency");
    const before = await Promise.all([box(peppa), box(status), box(finish)]);
    const peppaBox = before[0];
    const timerBox = await box(timer);

    expect(timerBox.x).toBeGreaterThanOrEqual(peppaBox.x - 1);
    expect(timerBox.y).toBeGreaterThanOrEqual(peppaBox.y - 1);
    expect(timerBox.x + timerBox.width).toBeLessThanOrEqual(
      peppaBox.x + peppaBox.width + 1,
    );
    expect(timerBox.y + timerBox.height).toBeLessThanOrEqual(
      peppaBox.y + peppaBox.height + 1,
    );

    await timer.evaluate((element) => {
      (element as HTMLElement).hidden = true;
    });
    const after = await Promise.all([box(peppa), box(status), box(finish)]);

    for (let index = 0; index < before.length; index += 1) {
      expectSameBox(before[index], after[index]);
    }
  });
}
