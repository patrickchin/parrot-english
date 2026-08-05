import { expect, test, type Page } from "@playwright/test";

// Phaser initialization is intentionally heavy; keep these engine scenarios
// serial so several browser contexts do not compile the game bundle at once.
test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

const generatedLesson = {
  schemaVersion: 1,
  title: "Market Manners",
  learnerName: "Mia",
  summary: "Practise asking for an apple politely.",
  worldId: "lesson-garden",
  intro: "Follow the golden marker and help Peppa shop.",
  missions: [
    {
      targetId: "flower-patch",
      instruction: "Walk to the flowers before we visit the market.",
      phrase: "May I have an apple, please?",
      success: "That was a wonderfully polite request!",
      emote: "surprised",
    },
  ],
  completion: "Market mission complete, Mia!",
};

async function mockGeneration(page: Page) {
  await page.route("**/api/pixel-lessons/generate", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ lesson: generatedLesson, warnings: [] }),
      contentType: "application/json",
      status: 200,
    });
  });
}

test("a generated speaking mission becomes playable in the Phaser preview", async ({
  page,
}) => {
  await mockGeneration(page);
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.goto("/games");

  await expect(
    page.getByRole("heading", { name: "Pixel Lesson Lab" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Garden English Adventure" }),
  ).toBeVisible();

  await page
    .getByLabel("What should this adventure practice?")
    .fill("asking for fruit politely at the market");
  await page.getByRole("button", { name: "Generate in game" }).click();

  await expect(page.getByText("The generated adventure is now live")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: generatedLesson.title }),
  ).toBeVisible();
  await expect(
    page.getByText(generatedLesson.summary, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(generatedLesson.intro, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Target: flower patch")).toBeVisible();

  const canvas = page.getByRole("application", {
    name: /Interactive pixel lesson garden/i,
  });
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  const main = page.getByRole("main");
  await canvas.focus();
  const scrollTopBeforeKeyboardMove = await main.evaluate(
    (element) => element.scrollTop,
  );
  await page.keyboard.press("ArrowUp");
  await expect
    .poll(() => main.evaluate((element) => element.scrollTop))
    .toBe(scrollTopBeforeKeyboardMove);

  // The flower patch is just to the right of the authored starting point.
  await page.getByRole("button", { name: "Move right" }).click();
  await expect(page.getByText("Say it out loud")).toBeVisible();
  await expect(page.getByText(`“${generatedLesson.missions[0].phrase}”`)).toBeVisible();

  await page.getByRole("button", { name: "I said it!" }).click();
  await expect(
    page.getByText(generatedLesson.missions[0].success, { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Finish adventure" }).click();
  await expect(
    page.getByText(generatedLesson.completion, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Replay adventure" }),
  ).toBeVisible();

  await page
    .getByText("Advanced: inspect and edit game JSON", { exact: true })
    .click();
  await expect(page.getByLabel("Editable game script")).toHaveValue(
    /"targetId": "flower-patch"/,
  );
});

for (const viewport of [
  { height: 568, name: "ultra-narrow phone", width: 280 },
  { height: 480, name: "short landscape", width: 720 },
  { height: 900, name: "desktop", width: 1440 },
]) {
  test(`the pixel lesson lab remains contained on a ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/games");

    const main = page.getByRole("main");
    await expect(
      page.getByRole("heading", { name: "Pixel Lesson Lab" }),
    ).toBeVisible();
    await expect(page.getByLabel("What should this adventure practice?")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);

    if (viewport.name === "desktop") {
      const accountBox = await page
        .getByRole("complementary", { name: "Account" })
        .boundingBox();
      const previewBox = await page
        .getByRole("region", { name: "Live game preview" })
        .boundingBox();
      expect(accountBox).not.toBeNull();
      expect(previewBox).not.toBeNull();
      expect(previewBox!.y).toBeGreaterThanOrEqual(
        accountBox!.y + accountBox!.height,
      );
    }

    await main.evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await expect
      .poll(() => main.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await expect(
      page.getByRole("region", { name: "Pixel lesson game world" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Move up" })).toBeVisible();
  });
}

test("generation errors keep the sample game available for recovery", async ({
  page,
}) => {
  await page.route("**/api/pixel-lessons/generate", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        error: "generation_failed",
        message: "Pixel lesson generation failed. Please try again.",
      }),
      contentType: "application/json",
      status: 502,
    });
  });
  await page.goto("/games");
  await page
    .getByLabel("What should this adventure practice?")
    .fill("a garden greeting");
  await page.getByRole("button", { name: "Generate in game" }).click();

  await expect(page.getByRole("alert")).toContainText(
    "Pixel lesson generation failed. Please try again.",
  );
  await expect(
    page.getByRole("heading", { name: "Garden English Adventure" }),
  ).toBeVisible();
});
