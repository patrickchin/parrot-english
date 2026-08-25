import { expect, test, type Locator, type Page } from "@playwright/test";
import { createLessonScript } from "../fixtures/lesson-script.mjs";

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
}

function guardianPath(path: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}parrotE2eGuardian=guardian`;
}

async function visibleBox(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function expectContained(parent: Locator, child: Locator) {
  const parentBox = await visibleBox(parent);
  const childBox = await visibleBox(child);
  expect(childBox.x).toBeGreaterThanOrEqual(parentBox.x - 1);
  expect(childBox.y).toBeGreaterThanOrEqual(parentBox.y - 1);
  expect(childBox.x + childBox.width).toBeLessThanOrEqual(
    parentBox.x + parentBox.width + 1,
  );
  expect(childBox.y + childBox.height).toBeLessThanOrEqual(
    parentBox.y + parentBox.height + 1,
  );
}

const readyMadeArtwork = [
  {
    alt: "Peppa reaching for a red ball high in a tree while Dolly flies up to help",
    id: "01-peppas-high-ball",
    src: "https://media.parrotbook.com/assets/v3/lesson-covers/01-peppas-high-ball.webp",
    title: "Peppa's High Ball",
  },
  {
    alt: "Peppa and Dolly choosing a red flower for their basket",
    id: "02-garden-colors",
    src: "https://media.parrotbook.com/assets/v3/lesson-covers/02-garden-colors.webp",
    title: "The Red Flower",
  },
  {
    alt: "Dolly handing Peppa an apple from a snack basket",
    id: "03-snack-time",
    src: "https://media.parrotbook.com/assets/v3/lesson-covers/03-snack-time.webp",
    title: "Peppa's Apple Snack",
  },
  {
    alt: "Peppa waiting beside a swing while Dolly takes her turn",
    id: "04-playground-words",
    src: "https://media.parrotbook.com/assets/v3/lesson-covers/04-playground-words.webp",
    title: "A Turn on the Swing",
  },
  {
    alt: "Peppa buying two red apples from Dolly's fruit stand",
    id: "05-market-day",
    src: "https://media.parrotbook.com/assets/v3/lesson-covers/05-market-day.webp",
    title: "Two Apples for Peppa",
  },
  {
    alt: "Dolly pouring juice for Peppa on a picnic blanket",
    id: "06-picnic-time",
    src: "https://media.parrotbook.com/assets/v3/lesson-covers/06-picnic-time.webp",
    title: "Juice at the Picnic",
  },
  {
    alt: "Peppa tucked under a blanket while Dolly reads beside a lantern",
    id: "07-bedtime-story",
    src: "https://media.parrotbook.com/assets/v3/lesson-covers/07-bedtime-story.webp",
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
    .toMatch(
      /\/assets\/v3\/lesson-covers\/01-peppas-high-ball-(384|768)\.webp$/,
    );
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
    await expect(page.getByText("Grown-up tools", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Create custom lesson" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Profile for Mia, learner mode" }),
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

for (const viewport of [
  {
    failureBody: "null",
    failureContentType: "application/json",
    failureStatus: 200,
    height: 568,
    width: 280,
  },
  {
    failureBody: JSON.stringify({
      error: "database_unavailable",
      message: "D1 binding LESSON_DB is missing.",
    }),
    failureContentType: "application/json",
    failureStatus: 500,
    height: 844,
    width: 390,
  },
  {
    failureBody: "<html>not json</html>",
    failureContentType: "text/html",
    failureStatus: 200,
    height: 360,
    width: 640,
  },
]) {
  test(`My Lessons recovers safely at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    let attempts = 0;
    let retryMode = false;
    let releaseRetry = () => {};
    let reportRetryStarted = () => {};
    const retryGate = new Promise<void>((resolve) => {
      releaseRetry = resolve;
    });
    const retryStarted = new Promise<void>((resolve) => {
      reportRetryStarted = resolve;
    });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/api/lessons/my", async (route) => {
      attempts += 1;
      if (!retryMode) {
        await route.fulfill({
          body: viewport.failureBody,
          contentType: viewport.failureContentType,
          status: viewport.failureStatus,
        });
        return;
      }

      reportRetryStarted();
      await retryGate;
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
    await expect(readyMadeLessons).toHaveCount(readyMadeArtwork.length);
    await expect(
      readyMadeLessons.first().getByRole("link", {
        name: "Start lesson: Peppa's High Ball",
      }),
    ).toBeVisible();

    const main = page.getByRole("main");
    await main.evaluate((element) => element.scrollTo(0, element.scrollHeight));
    const panel = page.getByRole("region", { name: "Saved lesson status" });
    const status = panel.getByRole("status");
    const retry = panel.getByRole("button", { name: "Try again" });

    await expect(status).toHaveText("We couldn't load My Lessons.");
    await expect(status).toHaveAttribute("aria-live", "polite");
    await expect(status).toHaveAttribute("aria-atomic", "true");
    await expect(retry).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Create custom lesson" }),
    ).toHaveCount(0);
    await expect(
      page.getByText(
        /Cannot read properties|TypeError|invalid_response|database_unavailable|D1 binding/i,
      ),
    ).toHaveCount(0);
    const panelBox = await visibleBox(panel);
    const statusBox = await visibleBox(status);
    const retryBox = await visibleBox(retry);
    expect(statusBox.width).toBeGreaterThanOrEqual(180);
    expect(retryBox.height).toBeGreaterThanOrEqual(44);
    expect(retryBox.width).toBeGreaterThanOrEqual(44);
    expect(panelBox.y).toBeGreaterThanOrEqual(0);
    expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(viewport.height);
    await expectContained(panel, retry);
    await expectNoHorizontalOverflow(page);
    expect(pageErrors).toEqual([]);

    const attemptsBeforeRetry = attempts;
    retryMode = true;
    await retry.evaluate((button) => {
      const statusElement = document.getElementById("my-lessons-status");
      const metrics = window as Window & {
        parrotMyLessonsFeedbackMs?: number;
        parrotMyLessonsFeedbackStart?: number;
      };
      metrics.parrotMyLessonsFeedbackMs = undefined;
      button.addEventListener(
        "click",
        () => {
          metrics.parrotMyLessonsFeedbackStart = performance.now();
        },
        { capture: true, once: true },
      );
      const observer = new MutationObserver(() => {
        if (
          statusElement?.textContent === "Loading My Lessons…" &&
          metrics.parrotMyLessonsFeedbackStart !== undefined
        ) {
          metrics.parrotMyLessonsFeedbackMs =
            performance.now() - metrics.parrotMyLessonsFeedbackStart;
          observer.disconnect();
        }
      });
      observer.observe(statusElement!, {
        characterData: true,
        childList: true,
        subtree: true,
      });
    });
    await retry.click();
    await expect(status).toHaveText("Loading My Lessons…", { timeout: 500 });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as Window & { parrotMyLessonsFeedbackMs?: number })
              .parrotMyLessonsFeedbackMs ?? null,
        ),
      )
      .not.toBeNull();
    const feedbackMs = await page.evaluate(
      () =>
        (window as Window & { parrotMyLessonsFeedbackMs?: number })
          .parrotMyLessonsFeedbackMs!,
    );
    expect(feedbackMs).toBeLessThan(100);
    await retryStarted;
    await expect(retry).toHaveAttribute("aria-disabled", "true");
    await expect(retry).toBeFocused();
    expect(attempts).toBe(attemptsBeforeRetry + 1);
    await retry.press("Enter");
    expect(attempts).toBe(attemptsBeforeRetry + 1);
    await expect(page).toHaveURL("/lessons");
    expect(await main.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expectContained(panel, retry);
    await expectNoHorizontalOverflow(page);

    releaseRetry();
    await expect(status).toHaveText("No made-for-you lessons yet.");
    await expect(retry).toHaveCount(0);
    await expect(status).toBeFocused();
    await expect(readyMadeLessons).toHaveCount(readyMadeArtwork.length);
    expect(pageErrors).toEqual([]);
  });
}

test("My Lessons keeps recovery stable across a failed retry and populated success", async ({
  page,
}) => {
  const savedLesson = {
    id: "recovered-garden",
    lesson: createLessonScript({ title: "Recovered Garden" }),
    source: "uploaded",
  };
  let attempts = 0;
  let phase: "initial-failure" | "retry-failure" | "success" =
    "initial-failure";
  let releaseRetryFailure = () => {};
  let reportRetryFailureStarted = () => {};
  const retryFailureGate = new Promise<void>((resolve) => {
    releaseRetryFailure = resolve;
  });
  const retryFailureStarted = new Promise<void>((resolve) => {
    reportRetryFailureStarted = resolve;
  });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/lessons/my", async (route) => {
    attempts += 1;
    if (phase === "initial-failure") {
      await route.abort("failed");
      return;
    }
    if (phase === "retry-failure") {
      reportRetryFailureStarted();
      await retryFailureGate;
      await route.fulfill({
        body: JSON.stringify({
          error: "database_unavailable",
          message: "D1 binding LESSON_DB is missing.",
        }),
        contentType: "application/json",
        status: 503,
      });
      return;
    }
    await route.fulfill({
      body: JSON.stringify({ lessons: [savedLesson] }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/lessons");

  const readyMadeLessons = page
    .getByRole("region", { name: "Lessons" })
    .getByRole("article");
  const panel = page.getByRole("region", { name: "Saved lesson status" });
  const status = panel.getByRole("status");
  const retry = panel.getByRole("button", { name: "Try again" });
  await expect(status).toHaveText("We couldn't load My Lessons.");
  await panel.scrollIntoViewIfNeeded();
  await expect(readyMadeLessons).toHaveCount(readyMadeArtwork.length);
  await expect(
    page.getByRole("link", { name: "Create custom lesson" }),
  ).toHaveCount(0);

  const attemptsBeforeFailedRetry = attempts;
  phase = "retry-failure";
  await retry.click();
  await expect(status).toHaveText("Loading My Lessons…", { timeout: 500 });
  await retryFailureStarted;
  await expect(retry).toHaveAttribute("aria-disabled", "true");
  await expect(retry).toBeFocused();
  await retry.press("Enter");
  expect(attempts).toBe(attemptsBeforeFailedRetry + 1);
  releaseRetryFailure();

  await expect(status).toHaveText("We couldn't load My Lessons.");
  await expect(retry).not.toHaveAttribute("aria-disabled", "true");
  await expect(retry).toBeFocused();
  await expect(readyMadeLessons).toHaveCount(readyMadeArtwork.length);
  await expect(
    page.getByText(/database_unavailable|D1 binding|503|TypeError/i),
  ).toHaveCount(0);

  const attemptsBeforeSuccess = attempts;
  phase = "success";
  await retry.click();
  await expect(
    page.getByRole("heading", { name: "Recovered Garden" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Start lesson: Recovered Garden" }),
  ).toBeVisible();
  expect(attempts).toBe(attemptsBeforeSuccess + 1);
  await expect(status).toBeFocused();
  await expect(readyMadeLessons).toHaveCount(readyMadeArtwork.length);
  expect(pageErrors).toEqual([]);
});

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

async function routeIncompleteLearnerProfile(page: Page) {
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
}

test("an incomplete learner sees a skippable profile setup before the requested activity", async ({
  page,
}) => {
  await routeIncompleteLearnerProfile(page);
  await page.goto("/lessons");

  await expect(page).toHaveURL(
    "/profile/setup?returnTo=%2Flessons",
  );
  await expect(
    page.getByRole("heading", { name: "Answer 6 questions" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start questions" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Skip for now" }),
  ).toBeVisible();
});

test("an incomplete learner returns to the requested duck dub after profile setup", async ({
  page,
}) => {
  await routeIncompleteLearnerProfile(page);
  const requested = "/dubs/five-little-ducks?parrotE2eDub=partial";
  await page.goto(requested);

  await expect(page).toHaveURL(
    `/profile/setup?returnTo=${encodeURIComponent(requested)}`,
  );
  await expect(
    page.getByRole("heading", { name: "Answer 6 questions" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Five Little Ducks" }),
  ).toHaveCount(0);
});

test("guardian learner details has a clear dashboard exit and distinguishes setup from chat", async ({
  page,
}) => {
  await page.setViewportSize({ height: 568, width: 320 });
  await page.goto(
    guardianPath("/guardian/profile?returnTo=%2Fguardian"),
  );

  await expect(
    page.getByRole("heading", { name: "Learner details" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Redo setup questions" }),
  ).toBeVisible();
  await expect(page.getByText(/normal chat/i)).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL("/guardian");
  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toBeVisible();
});

test("guardian learner details returns to the manager that opened it", async ({ page }) => {
  await page.goto(guardianPath("/guardian/lessons"));
  await page
    .getByRole("button", { name: "Profile for Mia, guardian mode" })
    .click();
  await page.getByRole("menuitem", { name: "Manage learner details" }).click();

  await expect(page).toHaveURL(
    "/guardian/profile?returnTo=%2Fguardian%2Flessons%3FparrotE2eGuardian%3Dguardian",
  );
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(guardianPath("/guardian/lessons"));
  await expect(
    page.getByRole("heading", { exact: true, name: "My Lessons" }),
  ).toBeVisible();
});

test("account menu separates learner details from account sign-out", async ({
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
  await page.goto(guardianPath("/guardian"));

  await page
    .getByRole("button", { name: "Profile for Mia, guardian mode" })
    .click();
  const menu = page.getByRole("menu", { name: "Account menu" });
  await expect(
    menu.getByRole("menuitem", { name: "Manage learner details" }),
  ).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/\/login\?returnTo=%2Fguardian/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeFocused();
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
  await page.goto(guardianPath("/guardian"));

  await page
    .getByRole("button", { name: "Profile for Mia, guardian mode" })
    .click();
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

  await expect(page).toHaveURL(/\/login\?returnTo=%2Fguardian/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeFocused();
  expect(deletePayload).toEqual({ password: "parent-password" });
});
