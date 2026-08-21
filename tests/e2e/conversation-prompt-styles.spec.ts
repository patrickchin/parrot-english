import { expect, test } from "@playwright/test";
import { startSmallChat } from "./conversation-helpers";

const setupViewports = [
  { height: 568, name: "narrow phone", width: 280 },
  { height: 360, name: "short landscape", width: 640 },
  { height: 900, name: "desktop", width: 1440 },
];

for (const viewport of setupViewports) {
  test(`the child-first chat start fits a ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/talk-to-peppa");

    const main = page.getByRole("main");
    const style = page.getByRole("combobox", { name: "Chat style" });
    const start = page.getByRole("button", { name: "Start chat" });
    const grownUpOptions = page.getByLabel(/^Grown-up chat style:/);
    await expect(start).toBeVisible();
    await expect(start).toContainText("Talk to Peppa");
    await expect(style).toBeHidden();
    await expect(page.getByRole("status")).toContainText(
      "Ready to talk",
    );
    await expect
      .poll(() =>
        main.evaluate((element) => ({
          horizontal: element.scrollWidth > element.clientWidth,
          vertical: element.scrollHeight > element.clientHeight,
        })),
      )
      .toEqual({ horizontal: false, vertical: false });

    for (const locator of [start, grownUpOptions]) {
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    }

    await grownUpOptions.click();
    await expect(style).toBeVisible();
    await expect(style).toHaveValue("tiny-turns");
    const styleBox = await style.boundingBox();
    expect(styleBox).not.toBeNull();
    expect(styleBox!.x).toBeGreaterThanOrEqual(0);
    expect(styleBox!.x + styleBox!.width).toBeLessThanOrEqual(viewport.width);
    expect(styleBox!.y + styleBox!.height).toBeLessThanOrEqual(viewport.height);
  });
}

test("the selected style reaches every retry and setup stays hidden", async ({
  page,
}) => {
  const starts: unknown[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/conversations"
    ) {
      starts.push(request.postDataJSON());
    }
  });
  await page.goto("/talk-to-peppa?parrotE2eConversation=error");

  const grownUpOptions = page.getByLabel(/^Grown-up chat style:/);
  await grownUpOptions.click();
  await page
    .getByRole("combobox", { name: "Chat style" })
    .selectOption("gentle-guide");
  await expect(grownUpOptions).toBeFocused();
  await expect(grownUpOptions).toContainText("Gentle guide");
  await expect(
    page.getByRole("combobox", { name: "Chat style" }),
  ).toBeHidden();
  await startSmallChat(page);
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Chat style" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect.poll(() => starts.length).toBe(2);
  expect(starts).toEqual([
    { promptStyle: "gentle-guide", purpose: "small-chat" },
    { promptStyle: "gentle-guide", purpose: "small-chat" },
  ]);
});
