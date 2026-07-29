import { expect, test, type Locator, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
}

async function visibleBox(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

const readyMadeArtwork = [
  {
    alt: "Peppa reaching for a red ball high in a tree while Dolly flies up to help",
    src: "/assets/lesson-covers/01-peppas-high-ball.webp",
  },
  {
    alt: "Peppa and Dolly choosing a red flower for their basket",
    src: "/assets/lesson-covers/02-garden-colors.webp",
  },
  {
    alt: "Dolly handing Peppa an apple from a snack basket",
    src: "/assets/lesson-covers/03-snack-time.webp",
  },
  {
    alt: "Peppa waiting beside a swing while Dolly takes her turn",
    src: "/assets/lesson-covers/04-playground-words.webp",
  },
  {
    alt: "Peppa buying two red apples from Dolly's fruit stand",
    src: "/assets/lesson-covers/05-market-day.webp",
  },
  {
    alt: "Dolly pouring juice for Peppa on a picnic blanket",
    src: "/assets/lesson-covers/06-picnic-time.webp",
  },
  {
    alt: "Peppa tucked under a blanket while Dolly reads beside a lantern",
    src: "/assets/lesson-covers/07-bedtime-story.webp",
  },
];

test("ready-made lessons show distinct story-specific artwork", async ({
  page,
}) => {
  await page.route("**/api/lessons/my", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ lessons: [] }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.goto("/lessons");

  const readyMadeLessons = page
    .getByRole("region", { name: "Ready-made lessons" })
    .getByRole("article");

  for (const [index, artwork] of readyMadeArtwork.entries()) {
    const image = readyMadeLessons
      .nth(index)
      .getByRole("img", { name: artwork.alt });
    await expect(image).toHaveAttribute("src", artwork.src);
    await expect
      .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
      .toBeGreaterThan(0);
  }
});

for (const viewport of [
  {
    artworkSize: 76,
    height: 568,
    maxCardHeight: 106,
    maxStartWidth: 52,
    width: 280,
  },
  {
    artworkSize: 86,
    height: 640,
    maxCardHeight: 116,
    maxStartWidth: 84,
    width: 360,
  },
  {
    artworkSize: 86,
    height: 844,
    maxCardHeight: 116,
    maxStartWidth: 84,
    width: 390,
  },
]) {
  test(`lesson discovery stays compact and readable at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.route("**/api/lessons/my", async (route) => {
      await route.fulfill({
        body: JSON.stringify({ lessons: [] }),
        contentType: "application/json",
        status: 200,
      });
    });
    await page.setViewportSize(viewport);
    await page.goto("/lessons");

    const readyMadeLessons = page
      .getByRole("region", { name: "Ready-made lessons" })
      .getByRole("article");
    const firstLesson = readyMadeLessons.first();
    const thirdLesson = readyMadeLessons.nth(2);
    const title = firstLesson.getByRole("heading", {
      name: "Peppa's High Ball",
    });
    const artwork = firstLesson.getByRole("img");
    const summary = firstLesson.getByText(
      /Peppa asks Dolly to help retrieve a ball/i,
    );
    const start = firstLesson.getByRole("link", {
      name: "Start lesson: Peppa's High Ball",
    });
    const cardBox = await visibleBox(firstLesson);
    const artworkBox = await visibleBox(artwork);
    const titleBox = await visibleBox(title);
    const startBox = await visibleBox(start);
    const thirdCardBox = await visibleBox(thirdLesson);
    const cardBoxes = await Promise.all(
      Array.from({ length: 7 }, (_, index) =>
        visibleBox(readyMadeLessons.nth(index)),
      ),
    );

    expect(Math.max(...cardBoxes.map((box) => box.height))).toBeLessThanOrEqual(
      viewport.maxCardHeight,
    );
    expect(artworkBox.width).toBeGreaterThanOrEqual(
      viewport.artworkSize - 1,
    );
    expect(artworkBox.height).toBeGreaterThanOrEqual(
      viewport.artworkSize - 1,
    );
    expect(artworkBox.x + artworkBox.width).toBeLessThanOrEqual(titleBox.x);
    expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(startBox.x);
    expect(startBox.x).toBeGreaterThan(artworkBox.x + artworkBox.width);
    expect(startBox.y).toBeGreaterThanOrEqual(cardBox.y);
    expect(startBox.y + startBox.height).toBeLessThanOrEqual(
      cardBox.y + cardBox.height,
    );
    expect(startBox.height).toBeGreaterThanOrEqual(48);
    expect(startBox.width).toBeGreaterThanOrEqual(
      viewport.width < 360 ? 48 : 80,
    );
    expect(startBox.width).toBeLessThanOrEqual(viewport.maxStartWidth);
    expect(thirdCardBox.y).toBeLessThan(viewport.height);

    if (viewport.width < 360) {
      await expect(summary).toBeHidden();
    } else {
      const summaryBox = await visibleBox(summary);
      expect(summaryBox.x).toBeGreaterThanOrEqual(titleBox.x);
      expect(summaryBox.x + summaryBox.width).toBeLessThanOrEqual(startBox.x);
    }
    await expectNoHorizontalOverflow(page);

    const main = page.getByRole("main");
    await main.evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await expect
      .poll(() => main.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await expect(page.getByRole("heading", { name: "My lessons" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Create custom lesson" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Account for Mia" }),
    ).toBeVisible();
  });
}

for (const viewport of [
  {
    artworkWidth: 128,
    height: 900,
    maxCardHeight: 124,
    width: 687,
  },
  {
    artworkWidth: 160,
    height: 900,
    maxCardHeight: 124,
    width: 1440,
  },
]) {
  test(`lesson discovery remains one compact vertical list at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.route("**/api/lessons/my", async (route) => {
      await route.fulfill({
        body: JSON.stringify({ lessons: [] }),
        contentType: "application/json",
        status: 200,
      });
    });
    await page.setViewportSize(viewport);
    await page.goto("/lessons");

    const lessons = page
      .getByRole("region", { name: "Ready-made lessons" })
      .getByRole("article");
    const firstCard = lessons.nth(0);
    const firstCardBox = await visibleBox(firstCard);
    const secondCardBox = await visibleBox(lessons.nth(1));
    const fifthCardBox = await visibleBox(lessons.nth(4));
    const titleBox = await visibleBox(
      firstCard.getByRole("heading", { name: "Peppa's High Ball" }),
    );
    const artworkBox = await visibleBox(firstCard.getByRole("img"));
    const startBox = await visibleBox(
      firstCard.getByRole("link", {
        name: "Start lesson: Peppa's High Ball",
      }),
    );

    expect(Math.abs(firstCardBox.x - secondCardBox.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(firstCardBox.width - secondCardBox.width)).toBeLessThanOrEqual(
      2,
    );
    expect(secondCardBox.y).toBeGreaterThanOrEqual(
      firstCardBox.y + firstCardBox.height,
    );
    expect(firstCardBox.height).toBeLessThanOrEqual(viewport.maxCardHeight);
    expect(artworkBox.width).toBeGreaterThanOrEqual(
      viewport.artworkWidth - 1,
    );
    expect(artworkBox.height).toBeGreaterThanOrEqual(95);
    expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(startBox.x);
    expect(startBox.width).toBeGreaterThanOrEqual(80);
    expect(startBox.width).toBeLessThanOrEqual(88);
    expect(fifthCardBox.y).toBeLessThan(viewport.height);
    await expectNoHorizontalOverflow(page);
  });
}

test("signed-out protected routes preserve the destination and show account access", async ({
  page,
}) => {
  await page.route("**/api/auth/get-session", async (route) => {
    await route.fulfill({
      body: "null",
      contentType: "application/json",
      status: 200,
    });
  });
  await page.setViewportSize({ height: 568, width: 280 });
  await page.goto("/lessons");

  await expect(page).toHaveURL("/login?returnTo=%2Flessons");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("an incomplete learner sees a skippable profile setup before the requested activity", async ({
  page,
}) => {
  await page.route("**/api/learner-profile", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        canBypass: false,
        experienceMode: "form",
        mode: "full",
        profile: {
          age: null,
          answers: {
            legacyAnswers: null,
            questionnaireVersion: 2,
            responses: {},
            schemaVersion: 2,
          },
          completedAt: null,
          currentQuestionKey: "name",
          description: null,
          name: null,
          profileStatus: "not_started",
          questionnaireVersion: 2,
        },
        progress: { answered: 0, current: 1, total: 6 },
        question: {
          answerKey: "name",
          audio: null,
          maxLength: 120,
          position: 1,
          promptEn: "What's your name?",
          promptZh: null,
          required: true,
        },
        questionnaire: { version: 2 },
      }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.goto("/lessons");

  await expect(page).toHaveURL(
    "/profile/setup?returnTo=%2Flessons",
  );
  await expect(
    page.getByRole("heading", { name: "Help Peppa get to know you" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Set up profile" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Skip for now" }),
  ).toBeVisible();
});

test("learner profile has a clear home exit and distinguishes setup from chat", async ({
  page,
}) => {
  await page.setViewportSize({ height: 568, width: 320 });
  await page.goto("/profile");

  await expect(
    page.getByRole("heading", { name: "Learner profile" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Redo setup questions" }),
  ).toBeVisible();
  await expect(page.getByText(/normal chat/i)).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL("/");
});

test("learner profile returns to the page that opened it", async ({ page }) => {
  await page.goto("/lessons");
  await page.getByRole("button", { name: "Account for Mia" }).click();
  await page.getByRole("menuitem", { name: "Learner profile" }).click();

  await expect(page).toHaveURL("/profile?returnTo=%2Flessons");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL("/lessons");
  await expect(
    page.getByRole("heading", { exact: true, name: "Lessons" }),
  ).toBeVisible();
});

test("account menu separates learner profile from account sign-out", async ({
  page,
}) => {
  let signedOut = false;
  await page.route("**/api/auth/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/auth/sign-out") {
      signedOut = true;
      await route.fulfill({
        body: JSON.stringify({ success: true }),
        contentType: "application/json",
        status: 200,
      });
      return;
    }
    if (pathname === "/api/auth/get-session" && signedOut) {
      await route.fulfill({
        body: "null",
        contentType: "application/json",
        status: 200,
      });
      return;
    }
    await route.continue();
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Account for Mia" }).click();
  const menu = page.getByRole("menu", { name: "Account menu" });
  await expect(menu.getByRole("menuitem", { name: "Learner profile" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Sign out" }).click();

  await expect(page).toHaveURL("/login?returnTo=%2F");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});
