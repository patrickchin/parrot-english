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
    id: "01-peppas-high-ball",
    src: "/assets/lesson-covers/01-peppas-high-ball.webp",
    title: "Peppa's High Ball",
  },
  {
    alt: "Peppa and Dolly choosing a red flower for their basket",
    id: "02-garden-colors",
    src: "/assets/lesson-covers/02-garden-colors.webp",
    title: "The Red Flower",
  },
  {
    alt: "Dolly handing Peppa an apple from a snack basket",
    id: "03-snack-time",
    src: "/assets/lesson-covers/03-snack-time.webp",
    title: "Peppa's Apple Snack",
  },
  {
    alt: "Peppa waiting beside a swing while Dolly takes her turn",
    id: "04-playground-words",
    src: "/assets/lesson-covers/04-playground-words.webp",
    title: "A Turn on the Swing",
  },
  {
    alt: "Peppa buying two red apples from Dolly's fruit stand",
    id: "05-market-day",
    src: "/assets/lesson-covers/05-market-day.webp",
    title: "Two Apples for Peppa",
  },
  {
    alt: "Dolly pouring juice for Peppa on a picnic blanket",
    id: "06-picnic-time",
    src: "/assets/lesson-covers/06-picnic-time.webp",
    title: "Juice at the Picnic",
  },
  {
    alt: "Peppa tucked under a blanket while Dolly reads beside a lantern",
    id: "07-bedtime-story",
    src: "/assets/lesson-covers/07-bedtime-story.webp",
    title: "Good Night, Peppa",
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
    .getByRole("region", { name: "Lessons" })
    .getByRole("article");

  for (const [index, artwork] of readyMadeArtwork.entries()) {
    const image = readyMadeLessons
      .nth(index)
      .getByRole("img", { name: artwork.alt });
    await expect(image).toHaveAttribute("src", artwork.src);
    await expect(image).toHaveAttribute(
      "srcset",
      `${artwork.src.replace(/\.webp$/, "-384.webp")} 384w, ${artwork.src.replace(/\.webp$/, "-768.webp")} 768w`,
    );
    await expect
      .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
      .toBeGreaterThan(0);
  }

  await expect
    .poll(() =>
      readyMadeLessons
        .first()
        .getByRole("img")
        .evaluate((element: HTMLImageElement) =>
          new URL(element.currentSrc).pathname,
        ),
    )
    .toMatch(/\/assets\/lesson-covers\/01-peppas-high-ball-(384|768)\.webp$/);
});

test("every ready-made lesson exposes one canonical start link", async ({
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

  const cards = page
    .getByRole("region", { name: "Lessons" })
    .getByRole("article");
  await expect(cards).toHaveCount(readyMadeArtwork.length);

  for (const [index, lesson] of readyMadeArtwork.entries()) {
    await expect(
      cards.nth(index).getByRole("link", {
        name: `Start lesson: ${lesson.title}`,
      }),
    ).toHaveAttribute(
      "href",
      `/lessons/parrot/${lesson.id}/scenes/1`,
    );
    await expect(
      cards.nth(index).getByRole("link", { name: /full-scene/i }),
    ).toHaveCount(0);
  }
});

for (const viewport of [
  { height: 568, width: 280 },
  { height: 640, width: 360 },
  { height: 844, width: 390 },
]) {
  test(`lesson discovery is picture-led and reachable at ${viewport.width}px`, async ({
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
      .getByRole("region", { name: "Lessons" })
      .getByRole("article");
    const firstLesson = readyMadeLessons.first();
    const secondLesson = readyMadeLessons.nth(1);
    const thirdLesson = readyMadeLessons.nth(2);
    const title = firstLesson.getByRole("heading", {
      name: "Peppa's High Ball",
    });
    const artwork = firstLesson.getByRole("img");
    const practiceLine = firstLesson.getByText(
      "Say: Can you help me?",
      { exact: true },
    );
    const start = firstLesson.getByRole("link", {
      name: "Start lesson: Peppa's High Ball",
    });
    const cardBox = await visibleBox(firstLesson);
    const secondCardBox = await visibleBox(secondLesson);
    const thirdCardBox = await visibleBox(thirdLesson);
    const artworkBox = await visibleBox(artwork);
    const titleBox = await visibleBox(title);
    const practiceBox = await visibleBox(practiceLine);
    const startBox = await visibleBox(start);

    expect(startBox.x).toBeGreaterThanOrEqual(cardBox.x);
    expect(startBox.y).toBeGreaterThanOrEqual(cardBox.y);
    expect(startBox.width).toBeGreaterThanOrEqual(cardBox.width - 1);
    expect(startBox.height).toBeGreaterThanOrEqual(128);
    expect(startBox.width).toBeGreaterThanOrEqual(
      viewport.width < 360 ? 240 : 150,
    );
    expect(artworkBox.width).toBeGreaterThanOrEqual(102);
    expect(artworkBox.height).toBeGreaterThanOrEqual(110);
    expect(practiceBox.x).toBeGreaterThanOrEqual(titleBox.x);
    expect(thirdCardBox.y).toBeLessThan(viewport.height);

    if (viewport.width < 360) {
      expect(artworkBox.x + artworkBox.width).toBeLessThanOrEqual(titleBox.x);
      expect(secondCardBox.y).toBeGreaterThanOrEqual(
        cardBox.y + cardBox.height,
      );
    } else {
      expect(Math.abs(cardBox.y - secondCardBox.y)).toBeLessThanOrEqual(2);
      expect(secondCardBox.x).toBeGreaterThanOrEqual(
        cardBox.x + cardBox.width,
      );
      expect(thirdCardBox.y).toBeGreaterThanOrEqual(
        cardBox.y + cardBox.height,
      );
      expect(titleBox.y).toBeGreaterThanOrEqual(
        artworkBox.y + artworkBox.height,
      );
    }
    await expect(
      firstLesson.getByText(/retrieve a ball from a high tree branch/i),
    ).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    const main = page.getByRole("main");
    await main.evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await expect
      .poll(() => main.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await expect(
      page.getByRole("heading", { name: "Grown-up tools" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Create custom lesson" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Account for Mia" }),
    ).toBeVisible();
  });
}

for (const viewport of [
  { height: 900, width: 687 },
  { height: 900, width: 1440 },
]) {
  test(`lesson discovery becomes a roomy visual grid at ${viewport.width}px`, async ({
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
      .getByRole("region", { name: "Lessons" })
      .getByRole("article");
    const firstCard = lessons.nth(0);
    const firstCardBox = await visibleBox(firstCard);
    const secondCardBox = await visibleBox(lessons.nth(1));
    const nextRowCardBox = await visibleBox(
      lessons.nth(viewport.width >= 1024 ? 4 : 3),
    );
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

    expect(Math.abs(firstCardBox.y - secondCardBox.y)).toBeLessThanOrEqual(2);
    expect(secondCardBox.x).toBeGreaterThanOrEqual(
      firstCardBox.x + firstCardBox.width,
    );
    expect(nextRowCardBox.y).toBeGreaterThanOrEqual(
      firstCardBox.y + firstCardBox.height,
    );
    expect(firstCardBox.width).toBeGreaterThanOrEqual(180);
    expect(artworkBox.width).toBeGreaterThanOrEqual(firstCardBox.width - 10);
    expect(artworkBox.height).toBeGreaterThanOrEqual(130);
    expect(titleBox.y).toBeGreaterThanOrEqual(artworkBox.y + artworkBox.height);
    expect(startBox.width).toBeGreaterThanOrEqual(firstCardBox.width - 1);
    expect(startBox.height).toBeGreaterThanOrEqual(240);
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
    page.getByRole("heading", { exact: true, name: "Pick a lesson" }),
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

test("account deletion requires the password and returns to sign in only after private-data purge succeeds", async ({
  page,
}) => {
  let deleted = false;
  let deletePayload: unknown = null;
  await page.route("**/api/auth/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/auth/delete-user") {
      deletePayload = route.request().postDataJSON();
      deleted = true;
      await route.fulfill({
        body: JSON.stringify({ success: true, message: "User deleted" }),
        contentType: "application/json",
        status: 200,
      });
      return;
    }
    if (pathname === "/api/auth/get-session" && deleted) {
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
  await page.getByRole("menuitem", { name: "Delete account" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete account" });
  await expect(dialog).toContainText(
    "This removes your account, learner profile, My Lessons, saved conversation text, and private story art from Parrot.",
  );
  const confirm = dialog.getByRole("button", { name: "Delete account now" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Password").fill("parent-password");
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(page).toHaveURL("/login?returnTo=%2F");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  expect(deletePayload).toEqual({ password: "parent-password" });
});
