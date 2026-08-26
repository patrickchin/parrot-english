import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import { createLessonScript } from "../fixtures/lesson-script.mjs";

const GUARDIAN_PASSWORD = "e2e-guardian-password";

type LearnerScenario =
  | "create-error"
  | "multiple"
  | "select-error"
  | "selection-required"
  | "stale-selection";

function learnerScenarioUrl(
  path: string,
  scenario: LearnerScenario,
  guardian: "guardian" | "learner" = "guardian",
  sessionId?: string,
) {
  const url = new URL(path, "http://parrot-e2e.invalid");
  url.searchParams.set("parrotE2eGuardian", guardian);
  url.searchParams.set("parrotE2eLearners", scenario);
  if (sessionId) url.searchParams.set("parrotE2eSession", sessionId);
  return `${url.pathname}${url.search}${url.hash}`;
}

async function createAuthenticatedBrowserContext(
  browser: Browser,
  baseURL: string,
  sessionId: string,
) {
  const context = await browser.newContext({ baseURL });
  await context.route("**/api/auth/get-session", async (route) => {
    const response = await route.fetch();
    const payload = (await response.json()) as {
      session: { id: string; token: string; userId: string };
      user: { id: string };
    };
    payload.session.id = sessionId;
    payload.session.token = `e2e-token-${sessionId}`;
    payload.session.userId = "e2e-user";
    payload.user.id = "e2e-user";
    await route.fulfill({ response, json: payload });
  });
  return context;
}

function learnerCard(page: Page, name: string) {
  return page.getByRole("listitem").filter({
    has: page.getByRole("heading", { exact: true, name }),
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const main = document.querySelector("main");
        return (
          document.documentElement.scrollWidth <= window.innerWidth &&
          (!main || main.scrollWidth <= main.clientWidth)
        );
      }),
    )
    .toBe(true);
}

async function expectContainedHorizontally(locator: Locator, page: Page) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
}

async function expectNameContentContained(page: Page, name: string) {
  const matches = page.getByText(name, { exact: true });
  const readMetrics = () =>
    matches.evaluateAll((elements) =>
      elements.flatMap((element) => {
        const style = window.getComputedStyle(element);
        const fragments = [...element.getClientRects()].filter(
          (rect) => rect.width > 0 && rect.height > 0,
        );
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          fragments.length === 0
        ) {
          return [];
        }
        const container =
          element.closest(
            "button, [role='menuitem'], h1, h2, h3, label, p, a",
          ) ?? element;
        const containerRect = container.getBoundingClientRect();
        return [
          {
            containerClientWidth: container.clientWidth,
            containerLeft: containerRect.left,
            containerRight: containerRect.right,
            containerScrollWidth: container.scrollWidth,
            direction: style.direction,
            fragments: fragments.map(({ left, right }) => ({ left, right })),
            viewportWidth: window.innerWidth,
          },
        ];
      }),
    );
  await expect
    .poll(async () => (await readMetrics()).length)
    .toBeGreaterThan(0);
  const metrics = await readMetrics();

  for (const [index, metric] of metrics.entries()) {
    expect(
      metric.containerLeft,
      `name container ${index} left edge`,
    ).toBeGreaterThanOrEqual(-0.5);
    expect(
      metric.containerRight,
      `name container ${index} right edge`,
    ).toBeLessThanOrEqual(metric.viewportWidth + 0.5);
    expect(
      metric.containerScrollWidth,
      `name container ${index} clipped content`,
    ).toBeLessThanOrEqual(metric.containerClientWidth + 1);
    for (const [fragmentIndex, fragment] of metric.fragments.entries()) {
      expect(
        fragment.left,
        `name ${index} fragment ${fragmentIndex} left edge`,
      ).toBeGreaterThanOrEqual(-0.5);
      expect(
        fragment.right,
        `name ${index} fragment ${fragmentIndex} right edge`,
      ).toBeLessThanOrEqual(metric.viewportWidth + 0.5);
    }
  }
  return metrics.map(({ direction }) => direction);
}

async function openGuardianMenu(page: Page) {
  await page
    .getByRole("button", { name: /Profile for Mia, guardian mode/ })
    .click();
  return page.getByRole("menu", { name: "Account menu" });
}

async function unlockGuardianScreen(page: Page) {
  const main = page.getByRole("main");
  await main.getByLabel("Password").fill(GUARDIAN_PASSWORD);
  await main.getByRole("button", { name: "Unlock guardian mode" }).click();
}

test("selects a sibling and keeps that session selection after refresh", async ({
  page,
}) => {
  await page.goto(learnerScenarioUrl("/guardian/learners", "multiple"));

  await expect(
    page.getByRole("heading", { name: "Learner profiles" }),
  ).toBeVisible();
  await expect(learnerCard(page, "Mia")).toContainText("Current learner");

  await learnerCard(page, "Noah")
    .getByRole("button", { name: "Use Noah" })
    .click();

  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "Now managing Noah",
  );
  await expect(
    page.getByRole("heading", { name: "Managing Noah" }),
  ).toBeFocused();
  await page.reload();
  await expect(learnerCard(page, "Noah")).toContainText("Current learner");
  await expect(
    page.getByRole("button", { name: /Profile for Mia, guardian mode/ }),
  ).toBeVisible();
});

test("adds a learner, opens their details, and keeps the new roster after refresh", async ({
  page,
}) => {
  await page.goto(learnerScenarioUrl("/guardian/learners", "multiple"));

  await page.getByLabel("Preferred name").fill("Ava");
  await page.getByRole("button", { name: "Add learner" }).click();

  await expect(page).toHaveURL(
    /\/guardian\/profile\?returnTo=%2Fguardian%2Flearners$/,
  );
  await expect(
    page.getByRole("heading", { name: "Learner details" }),
  ).toBeVisible();
  await expect(page.getByText("Managing Ava", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();

  const ava = learnerCard(page, "Ava");
  await expect(ava).toContainText("Current learner");
  await expect(ava).toContainText("Setup not started");
  await page.reload();
  await expect(learnerCard(page, "Ava")).toContainText("Current learner");
});

test("scopes learner selections to authenticated browser sessions", async ({
  baseURL,
  browser,
}) => {
  if (!baseURL) throw new Error("Playwright baseURL is required.");
  const firstContext = await createAuthenticatedBrowserContext(
    browser,
    baseURL,
    "e2e-session-a",
  );
  const secondContext = await createAuthenticatedBrowserContext(
    browser,
    baseURL,
    "e2e-session-b",
  );
  try {
    const firstSession = await firstContext.newPage();
    const sameSessionTab = await firstContext.newPage();
    const secondSession = await secondContext.newPage();
    await Promise.all([
      firstSession.goto(
        learnerScenarioUrl(
          "/guardian/learners",
          "multiple",
          "guardian",
          "e2e-session-a",
        ),
      ),
      sameSessionTab.goto(
        learnerScenarioUrl(
          "/guardian/learners",
          "multiple",
          "guardian",
          "e2e-session-a",
        ),
      ),
      secondSession.goto(
        learnerScenarioUrl(
          "/guardian/learners",
          "multiple",
          "guardian",
          "e2e-session-b",
        ),
      ),
    ]);

    const identities = await Promise.all(
      [firstSession, secondSession].map((sessionPage) =>
        sessionPage.evaluate(async () => {
          const auth = (await fetch("/api/auth/get-session").then((response) =>
            response.json(),
          )) as {
            session: { id: string };
            user: { id: string };
          };
          const mockSessionId = (
            window as typeof window & {
              __parrotE2eLearners?: {
                snapshot(): { sessionId: string };
              };
            }
          ).__parrotE2eLearners?.snapshot().sessionId;
          return {
            authSessionId: auth.session.id,
            authUserId: auth.user.id,
            mockSessionId,
          };
        }),
      ),
    );
    expect(identities).toEqual([
      {
        authSessionId: "e2e-session-a",
        authUserId: "e2e-user",
        mockSessionId: "e2e-session-a",
      },
      {
        authSessionId: "e2e-session-b",
        authUserId: "e2e-user",
        mockSessionId: "e2e-session-b",
      },
    ]);

    await expect(learnerCard(sameSessionTab, "Mia")).toContainText(
      "Current learner",
    );
    await firstSession.bringToFront();
    await learnerCard(firstSession, "Noah")
      .getByRole("button", { name: "Use Noah" })
      .click();

    await expect(learnerCard(firstSession, "Noah")).toContainText(
      "Current learner",
    );
    await expect(learnerCard(firstSession, "Mia")).not.toContainText(
      "Current learner",
    );
    await expect(learnerCard(sameSessionTab, "Noah")).toContainText(
      "Current learner",
    );
    await expect(learnerCard(secondSession, "Mia")).toContainText(
      "Current learner",
    );
    await expect(learnerCard(secondSession, "Noah")).not.toContainText(
      "Current learner",
    );
  } finally {
    await Promise.all([firstContext.close(), secondContext.close()]);
  }
});

test("synchronizes same-session learner selection through storage without BroadcastChannel", async ({
  baseURL,
  browser,
}) => {
  if (!baseURL) throw new Error("Playwright baseURL is required.");
  const context = await createAuthenticatedBrowserContext(
    browser,
    baseURL,
    "e2e-session-storage-selection",
  );
  await context.addInitScript(() => {
    Object.defineProperty(window, "BroadcastChannel", {
      configurable: true,
      value: undefined,
    });
  });
  try {
    const sourcePage = await context.newPage();
    const siblingPage = await context.newPage();
    await Promise.all([
      sourcePage.goto(
        learnerScenarioUrl(
          "/guardian/learners",
          "multiple",
          "guardian",
          "e2e-session-storage-selection",
        ),
      ),
      siblingPage.goto(
        learnerScenarioUrl(
          "/guardian/learners",
          "multiple",
          "guardian",
          "e2e-session-storage-selection",
        ),
      ),
    ]);
    await expect(learnerCard(siblingPage, "Mia")).toContainText(
      "Current learner",
    );

    await learnerCard(sourcePage, "Noah")
      .getByRole("button", { name: "Use Noah" })
      .click();

    await expect(learnerCard(sourcePage, "Noah")).toContainText(
      "Current learner",
    );
    await expect(learnerCard(siblingPage, "Noah")).toContainText(
      "Current learner",
    );
    await expect(learnerCard(siblingPage, "Mia")).not.toContainText(
      "Current learner",
    );
  } finally {
    await context.close();
  }
});

test("preserves same-learner drafts on tab return and clears them after a learner switch", async ({
  baseURL,
  browser,
}) => {
  if (!baseURL) throw new Error("Playwright baseURL is required.");
  const context = await createAuthenticatedBrowserContext(
    browser,
    baseURL,
    "e2e-session-draft-revalidation",
  );
  try {
    const draftPage = await context.newPage();
    const managerPage = await context.newPage();
    await Promise.all([
      draftPage.goto(
        learnerScenarioUrl(
          "/lessons/my/create",
          "multiple",
          "guardian",
          "e2e-session-draft-revalidation",
        ),
      ),
      managerPage.goto(
        learnerScenarioUrl(
          "/guardian/learners",
          "multiple",
          "guardian",
          "e2e-session-draft-revalidation",
        ),
      ),
    ]);

    const lessonTopic = draftPage.getByLabel(
      "What should this lesson be about?",
    );
    await lessonTopic.fill("Unsaved garden helpers lesson");
    await managerPage.bringToFront();
    await draftPage.bringToFront();
    await draftPage.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(lessonTopic).toHaveValue("Unsaved garden helpers lesson");

    await draftPage.goto(
      learnerScenarioUrl(
        "/guardian/profile",
        "multiple",
        "guardian",
        "e2e-session-draft-revalidation",
      ),
    );
    const profileName = draftPage.getByLabel("Name", { exact: true });
    await profileName.fill("Unsaved Mia name");
    await managerPage.bringToFront();
    await draftPage.bringToFront();
    await draftPage.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(profileName).toHaveValue("Unsaved Mia name");

    await managerPage.bringToFront();
    await learnerCard(managerPage, "Noah")
      .getByRole("button", { name: "Use Noah" })
      .click();
    await expect(learnerCard(managerPage, "Noah")).toContainText(
      "Current learner",
    );

    await draftPage.bringToFront();
    await expect(
      draftPage.getByText("Managing Noah", { exact: true }),
    ).toBeVisible();
    await expect(draftPage.getByLabel("Name", { exact: true })).toHaveValue(
      "Noah",
    );
  } finally {
    await context.close();
  }
});

test("blocks a stale profile write when sibling learner revalidation fails, then switches on retry", async ({
  baseURL,
  browser,
}) => {
  if (!baseURL) throw new Error("Playwright baseURL is required.");
  const context = await createAuthenticatedBrowserContext(
    browser,
    baseURL,
    "e2e-session-failed-peer-revalidation",
  );
  try {
    const profilePage = await context.newPage();
    const managerPage = await context.newPage();
    await Promise.all([
      profilePage.goto(
        learnerScenarioUrl(
          "/guardian/profile",
          "multiple",
          "guardian",
          "e2e-session-failed-peer-revalidation",
        ),
      ),
      managerPage.goto(
        learnerScenarioUrl(
          "/guardian/learners",
          "multiple",
          "guardian",
          "e2e-session-failed-peer-revalidation",
        ),
      ),
    ]);

    await profilePage
      .getByLabel("Name", { exact: true })
      .fill("Stale Mia name");
    await profilePage.evaluate(() => {
      const learners = (
        window as Window & {
          __parrotE2eLearners?: {
            failNextLearnerProfileLoad(): void;
          };
        }
      ).__parrotE2eLearners;
      if (!learners) throw new Error("Learner mock controller is unavailable.");
      learners.failNextLearnerProfileLoad();
    });

    await managerPage.bringToFront();
    await learnerCard(managerPage, "Noah")
      .getByRole("button", { name: "Use Noah" })
      .click();
    await expect(learnerCard(managerPage, "Noah")).toContainText(
      "Current learner",
    );
    await expect
      .poll(() =>
        profilePage.evaluate(
          () =>
            (
              window as Window & {
                __parrotE2eLearners?: {
                  snapshot(): { learnerProfileLoadFailures: number };
                };
              }
            ).__parrotE2eLearners?.snapshot().learnerProfileLoadFailures ?? 0,
        ),
      )
      .toBe(1);
    await expect(
      profilePage.getByRole("heading", {
        name: /couldn't verify the current learner/i,
      }),
    ).toBeVisible();
    await expect(
      profilePage.getByRole("button", {
        includeHidden: true,
        name: "Save changes",
      }),
    ).toBeHidden();

    await profilePage.evaluate(() => {
      const save = [...document.querySelectorAll("button")].find(
        (candidate) => candidate.textContent?.trim() === "Save changes",
      );
      if (!(save instanceof HTMLButtonElement)) {
        throw new Error("The mounted stale Save changes control is missing.");
      }
      save.click();
    });
    const noahBeforeRetry = await profilePage.evaluate(() => {
      const snapshot = (
        window as Window & {
          __parrotE2eLearners?: {
            snapshot(): {
              profiles: Array<{ age: number | null; id: string; name: string }>;
            };
          };
        }
      ).__parrotE2eLearners?.snapshot();
      return snapshot?.profiles.find(({ id }) => id === "learner-noah");
    });
    expect(noahBeforeRetry).toMatchObject({ age: 10, name: "Noah" });

    await profilePage.getByRole("button", { name: "Try again" }).click();
    await expect(
      profilePage.getByText("Managing Noah", { exact: true }),
    ).toBeVisible();
    await expect(profilePage.getByLabel("Name", { exact: true })).toHaveValue(
      "Noah",
    );
  } finally {
    await context.close();
  }
});

test("keeps lessons, conversations, art, and dubbing isolated by selected learner", async ({
  page,
}) => {
  await page.goto(learnerScenarioUrl("/guardian/learners", "multiple"));
  await expect(
    page.getByRole("heading", { name: "Learner profiles" }),
  ).toBeVisible();
  const miaData = await page.evaluate(async (lesson) => {
    const savedLessonResponse = await fetch("/api/lessons/my", {
      body: JSON.stringify({ lesson, source: "uploaded" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const savedLesson = (await savedLessonResponse.json()) as {
      lesson: { id: string };
    };
    const conversationResponse = await fetch("/api/conversations", {
      body: JSON.stringify({ purpose: "small-chat" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const conversation = (await conversationResponse.json()) as {
      conversation: { id: string };
    };
    const generationResponse = await fetch("/api/lessons/my/generate", {
      body: JSON.stringify({ topic: "garden helpers" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const generated = (await generationResponse.json()) as {
      lesson?: { childName?: string };
    };
    const artResponse = await fetch(
      "/api/stories/the-red-ball/personalized-art",
      { body: new FormData(), method: "POST" },
    );
    const consentResponse = await fetch(
      "/api/dubs/five-little-ducks-v2/consent",
      {
        body: JSON.stringify({
          accepted: true,
          consentVersion: "guardian-voice-r2-v2",
        }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      },
    );
    return {
      artStatus: artResponse.status,
      consentStatus: consentResponse.status,
      conversationId: conversation.conversation.id,
      generatedChildName: generated.lesson?.childName,
      generationStatus: generationResponse.status,
      lessonId: savedLesson.lesson.id,
    };
  }, createLessonScript());

  expect(miaData.artStatus).toBe(201);
  expect(miaData.consentStatus).toBe(204);
  expect(miaData.generationStatus).toBe(200);
  expect(miaData.generatedChildName).toBe("Mia");
  await learnerCard(page, "Noah")
    .getByRole("button", { name: "Use Noah" })
    .click();

  const noahData = await page.evaluate(async ({ conversationId, lessonId }) => {
    const [lessons, siblingLesson, siblingConversation, art, dub, generated] =
      await Promise.all([
        fetch("/api/lessons/my").then((response) => response.json()),
        fetch(`/api/lessons/my/${lessonId}`),
        fetch(`/api/conversations/${conversationId}`),
        fetch("/api/stories/the-red-ball/personalized-art").then((response) =>
          response.json(),
        ),
        fetch("/api/dubs/five-little-ducks-v2").then((response) =>
          response.json(),
        ),
        fetch("/api/lessons/my/generate", {
          body: JSON.stringify({ topic: "rainy day" }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }).then((response) => response.json()),
      ]);
    return {
      art,
      dub,
      generated,
      lessons,
      siblingConversationStatus: siblingConversation.status,
      siblingLessonStatus: siblingLesson.status,
    };
  }, miaData);

  expect(noahData.lessons).toEqual({ lessons: [] });
  expect(noahData.siblingLessonStatus).toBe(404);
  expect(noahData.siblingConversationStatus).toBe(404);
  expect(noahData.art).toMatchObject({ hasStoredArt: false, stories: {} });
  expect(noahData.dub).toMatchObject({
    consentState: "not_granted",
    recordingEnabled: false,
  });
  expect(noahData.generated).toMatchObject({
    lesson: { childName: "Noah" },
    warnings: [],
  });
});

test("keeps automatic lesson recordings isolated by selected learner", async ({
  page,
}) => {
  const recordingSnapshot = () =>
    page.evaluate(() => {
      const media = (
        window as Window & {
          __parrotE2eLessonMedia?: {
            snapshot(): {
              getUserMediaCalls: number;
              uploads: Array<{
                lessonId: string;
                sceneIndex: number;
                stepIndex: number;
              }>;
            };
          };
        }
      ).__parrotE2eLessonMedia;
      if (!media) throw new Error("Lesson media controller is missing.");
      return media.snapshot();
    });
  const lessonPath =
    "/lessons/parrot/01-peppas-high-ball/scenes/1?parrotE2eLesson=recording";

  await page.goto(learnerScenarioUrl("/guardian/profile", "multiple"));
  const consentSection = page.getByRole("region", {
    name: "Lesson voice recordings",
  });
  await consentSection
    .getByRole("button", { name: "Allow lesson voice recordings" })
    .click();
  await expect(consentSection.getByRole("status")).toHaveText(
    "Lesson recording is currently allowed.",
  );

  await page.goto(learnerScenarioUrl(lessonPath, "multiple", "learner"));
  await page.getByRole("button", { exact: true, name: "Let's go" }).click();
  await expect(
    page
      .getByRole("region", { name: "Join in" })
      .filter({ hasText: "It is up high!" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await recordingSnapshot()).uploads.length)
    .toBe(1);
  await expect(
    page.getByText(/tap to talk|start recording|stop recording/i),
  ).toHaveCount(0);
  expect((await recordingSnapshot()).uploads[0]).toMatchObject({
    lessonId: "01-peppas-high-ball",
    sceneIndex: 0,
    stepIndex: 2,
  });

  await page.goto(learnerScenarioUrl("/guardian/learners", "multiple"));
  await learnerCard(page, "Noah")
    .getByRole("button", { name: "Use Noah" })
    .click();
  await page.goto(learnerScenarioUrl("/guardian/profile", "multiple"));
  await expect(
    page
      .getByRole("region", { name: "Lesson voice recordings" })
      .getByRole("status"),
  ).toHaveText("Lesson recording is currently off.");

  await page.goto(learnerScenarioUrl(lessonPath, "multiple", "learner"));
  await page.getByRole("button", { exact: true, name: "Let's go" }).click();
  await expect(
    page
      .getByRole("region", { name: "Join in" })
      .filter({ hasText: "It is up high!" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await recordingSnapshot()).uploads)
    .toEqual([]);
  expect((await recordingSnapshot()).getUserMediaCalls).toBe(0);

  await page.goto(learnerScenarioUrl("/guardian/learners", "multiple"));
  await learnerCard(page, "Mia")
    .getByRole("button", { name: "Use Mia" })
    .click();
  await page.goto(learnerScenarioUrl("/guardian/profile", "multiple"));
  await expect(
    page
      .getByRole("region", { name: "Lesson voice recordings" })
      .getByRole("status"),
  ).toHaveText("Lesson recording is currently allowed.");
  expect((await recordingSnapshot()).uploads).toHaveLength(1);
});

test("rejects Mia's queued lesson recording after the Guardian switches to Noah", async ({
  page,
}) => {
  const oneLineLesson = createLessonScript();
  oneLineLesson.scenes = oneLineLesson.scenes.slice(0, 1);
  const recordingFor = (profileId: string) =>
    page.evaluate((learnerProfileId) => {
      const learners = (
        window as Window & {
          __parrotE2eLearners?: {
            snapshot(profileId?: string): {
              lessonRecording: {
                pendingUploads: number;
                uploads: Array<{
                  expectedLearnerProfileId: string | null;
                  outcome: string;
                  size: number;
                  type: string;
                }>;
              } | null;
            };
          };
        }
      ).__parrotE2eLearners;
      if (!learners) throw new Error("Learner controller is missing.");
      return learners.snapshot(learnerProfileId).lessonRecording;
    }, profileId);
  const mediaSnapshot = () =>
    page.evaluate(() => {
      const media = (
        window as Window & {
          __parrotE2eLessonMedia?: {
            snapshot(): {
              recorderStops: Array<{ id: number }>;
            };
          };
        }
      ).__parrotE2eLessonMedia;
      if (!media) throw new Error("Lesson media controller is missing.");
      return media.snapshot();
    });
  const allowRecordings = async () => {
    const consent = page.getByRole("region", {
      name: "Lesson voice recordings",
    });
    await consent
      .getByRole("button", { name: "Allow lesson voice recordings" })
      .click();
    await expect(consent.getByRole("status")).toHaveText(
      "Lesson recording is currently allowed.",
    );
  };

  await page.goto(learnerScenarioUrl("/guardian/profile", "multiple"));
  await allowRecordings();
  await page.goto(learnerScenarioUrl("/guardian/learners", "multiple"));
  await learnerCard(page, "Noah")
    .getByRole("button", { name: "Use Noah" })
    .click();
  await page.goto(learnerScenarioUrl("/guardian/profile", "multiple"));
  await allowRecordings();
  await page.goto(learnerScenarioUrl("/guardian/learners", "multiple"));
  await learnerCard(page, "Mia")
    .getByRole("button", { name: "Use Mia" })
    .click();

  const lessonId = await page.evaluate(async (lesson) => {
    const response = await fetch("/api/lessons/my", {
      body: JSON.stringify({ lesson, source: "uploaded" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) throw new Error("The Mia lesson could not be saved.");
    const payload = (await response.json()) as { lesson: { id: string } };
    return payload.lesson.id;
  }, oneLineLesson);
  const lessonPath = `/lessons/my/${encodeURIComponent(lessonId)}/scenes/1?parrotE2eLesson=upload-held`;

  await page.goto(learnerScenarioUrl(lessonPath, "multiple", "learner"));
  await page.getByRole("button", { exact: true, name: "Let's go" }).click();
  await expect(
    page.getByRole("heading", { name: "Lesson complete!" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await recordingFor("learner-mia"))?.pendingUploads)
    .toBe(1);
  await expect
    .poll(async () => (await mediaSnapshot()).recorderStops.length)
    .toBe(1);

  await page.getByRole("button", { name: "Replay lesson" }).click();
  await expect
    .poll(async () => (await mediaSnapshot()).recorderStops.length)
    .toBe(2);
  await expect(
    page.getByRole("heading", { name: "Lesson complete!" }),
  ).toBeVisible();
  await expect(
    page.getByText("Saving your voices…", { exact: true }),
  ).toBeVisible();
  const queuedForMia = await recordingFor("learner-mia");
  expect(
    queuedForMia?.uploads,
    "only the first of two completed recordings should have started its PUT",
  ).toEqual([
    expect.objectContaining({
      expectedLearnerProfileId: "learner-mia",
      outcome: "held",
    }),
  ]);
  expect(queuedForMia?.pendingUploads).toBe(1);

  await page
    .getByRole("button", { name: /Profile for Mia, learner mode/ })
    .click();
  await page
    .getByRole("menu", { name: "Account menu" })
    .getByRole("menuitem", { name: /Grown-up access/ })
    .click();
  const unlock = page.getByRole("dialog", { name: "Unlock guardian mode" });
  await unlock.getByLabel("Password").fill(GUARDIAN_PASSWORD);
  await unlock.getByRole("button", { name: "Unlock guardian mode" }).click();
  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Manage learner profiles" }).click();
  await expect(
    page.getByRole("heading", { name: "Learner profiles" }),
  ).toBeVisible();
  await learnerCard(page, "Noah")
    .getByRole("button", { name: "Use Noah" })
    .click();
  const released = await page.evaluate(() =>
    (
      window as Window & {
        __parrotE2eLessonMedia?: { resolveNextUpload(): boolean };
      }
    ).__parrotE2eLessonMedia?.resolveNextUpload(),
  );
  expect(released).toBe(true);

  await expect
    .poll(async () => (await recordingFor("learner-mia"))?.pendingUploads)
    .toBe(0);
  await expect
    .poll(async () => (await recordingFor("learner-noah"))?.uploads.length)
    .toBe(1);
  const mia = await recordingFor("learner-mia");
  const noah = await recordingFor("learner-noah");
  expect(mia?.uploads).toEqual([
    expect.objectContaining({
      expectedLearnerProfileId: "learner-mia",
      outcome: "saved",
    }),
  ]);
  expect(noah?.uploads).toEqual([
    expect.objectContaining({
      expectedLearnerProfileId: "learner-mia",
      outcome: "learner_selection_changed",
      size: 0,
      type: "",
    }),
  ]);
  expect(noah?.pendingUploads).toBe(0);
});

test("requires the account password before revealing a selection-required roster", async ({
  page,
}) => {
  const requestedUrl = learnerScenarioUrl(
    "/guardian/learners",
    "selection-required",
    "learner",
  );
  await page.goto(requestedUrl);

  await expect(
    page.getByRole("heading", { name: "Unlock guardian mode" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Learner profiles" }),
  ).toHaveCount(0);
  await expect(page.getByText("Noah", { exact: true })).toHaveCount(0);
  const lockedRoster = await page.evaluate(async () => {
    const response = await fetch("/api/learner-profiles");
    return { body: await response.json(), status: response.status };
  });
  expect(lockedRoster).toEqual({
    body: { error: "guardian_required" },
    status: 403,
  });

  await unlockGuardianScreen(page);
  await expect(page).toHaveURL(requestedUrl);
  await expect(
    page.getByRole("heading", { name: "Learner profiles" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Choose a learner" }),
  ).toBeVisible();
});

test("shows a learner-safe no-selection state and sends an incomplete learner to setup", async ({
  page,
}) => {
  await page.goto(learnerScenarioUrl("/", "selection-required", "learner"));

  await expect(
    page.getByRole("heading", {
      name: "Ask a grown-up to choose a learner",
    }),
  ).toBeVisible();
  await expect(page.getByText("Mia", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Noah", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: /Profile for Learner, learner mode/ })
    .click();
  await expect(
    page.getByRole("menu", { name: "Account menu" }).getByRole("menuitem"),
  ).toHaveText(["Grown-up accessAccount password required"]);

  await page.goto(
    learnerScenarioUrl("/guardian/learners", "selection-required"),
  );
  await page.getByLabel("Preferred name").fill("Ava");
  await page.getByRole("button", { name: "Add learner" }).click();
  await expect(page.getByText("Managing Ava", { exact: true })).toBeVisible();

  const menu = await openGuardianMenu(page);
  await menu.getByRole("menuitem", { name: "Switch to Ava" }).click();
  await expect(page).toHaveURL(/\/profile\/setup/);
  await expect(
    page.getByRole("heading", { name: "Answer 6 questions" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Profile for Ava, learner mode/ }),
  ).toBeVisible();
});

test("fails closed when learner selection has an ambiguous server failure", async ({
  page,
}) => {
  await page.goto(learnerScenarioUrl("/guardian/learners", "select-error"));
  const selectNoah = learnerCard(page, "Noah").getByRole("button", {
    name: "Use Noah",
  });

  await selectNoah.click();

  await expect(
    page.getByRole("heading", {
      name: /couldn't verify the current learner/i,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { includeHidden: true, name: "Use Noah" }),
  ).toBeHidden();
  const pending = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.includes(":pending:"),
    );
    return key ? { key, value: localStorage.getItem(key) } : null;
  });
  expect(pending).toMatchObject({ value: "uncertain" });
  expect(pending?.key).not.toContain("e2e-session");
  expect(
    await page.evaluate(
      () =>
        (
          window as Window & {
            __parrotE2eLearners?: {
              snapshot(): { activeProfileId: string | null };
            };
          }
        ).__parrotE2eLearners?.snapshot().activeProfileId,
    ),
  ).toBe("learner-mia");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", {
      name: /couldn't verify the current learner/i,
    }),
  ).toBeVisible();
});

test("fails closed when learner creation has an ambiguous server failure", async ({
  page,
}) => {
  await page.goto(learnerScenarioUrl("/guardian/learners", "create-error"));
  await page.getByLabel("Preferred name").fill("Ava");
  await page.getByRole("button", { name: "Add learner" }).click();

  await expect(
    page.getByRole("heading", {
      name: /couldn't verify the current learner/i,
    }),
  ).toBeVisible();
  const pending = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.includes(":pending:"),
    );
    return key ? { key, value: localStorage.getItem(key) } : null;
  });
  expect(pending).toMatchObject({ value: "uncertain" });
  expect(
    await page.evaluate(() =>
      (
        window as Window & {
          __parrotE2eLearners?: {
            snapshot(): {
              activeProfileId: string | null;
              profiles: Array<{ name: string }>;
            };
          };
        }
      ).__parrotE2eLearners?.snapshot(),
    ),
  ).toMatchObject({
    activeProfileId: "learner-mia",
    profiles: [{ name: "Mia" }, { name: "Noah" }],
  });
  await expect(
    page.getByRole("button", { includeHidden: true, name: "Add learner" }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", {
      name: /couldn't verify the current learner/i,
    }),
  ).toBeVisible();
});

test("suppresses a held selection response after a newer selection wins", async ({
  page,
}) => {
  await page.goto(learnerScenarioUrl("/guardian/learners", "stale-selection"));
  const selectNoah = learnerCard(page, "Noah").getByRole("button", {
    name: "Use Noah",
  });
  await selectNoah.click({ noWaitAfter: true });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __parrotE2eLearners?: {
                snapshot(): { staleSelectionPending: boolean };
              };
            }
          ).__parrotE2eLearners?.snapshot().staleSelectionPending ?? false,
      ),
    )
    .toBe(true);

  const newerSelection = await page.evaluate(async () => {
    const selected = await fetch("/api/learner-profiles/learner-mia/active", {
      method: "PUT",
    }).then((response) => response.json());
    const profile = await fetch("/api/learner-profile").then((response) =>
      response.json(),
    );
    return { profile, selected };
  });
  expect(newerSelection).toMatchObject({
    profile: { profile: { id: "learner-mia", name: "Mia" } },
    selected: { activeProfileId: "learner-mia" },
  });
  expect(
    await page.evaluate(
      () =>
        (
          window as Window & {
            __parrotE2eLearners?: { releaseStaleSelection(): boolean };
          }
        ).__parrotE2eLearners?.releaseStaleSelection() ?? false,
    ),
  ).toBe(true);

  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "The selected learner could not be loaded.",
  );
  await expect(selectNoah).toBeFocused();
  await expect(learnerCard(page, "Mia")).toContainText("Current learner");
  await expect(page.getByText("Now managing Noah")).toHaveCount(0);
});

test("removes stale account actions while the source learner switch is pending", async ({
  page,
}) => {
  await page.goto(learnerScenarioUrl("/guardian/learners", "stale-selection"));
  await learnerCard(page, "Noah")
    .getByRole("button", { name: "Use Noah" })
    .click({ noWaitAfter: true });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __parrotE2eLearners?: {
                snapshot(): { staleSelectionPending: boolean };
              };
            }
          ).__parrotE2eLearners?.snapshot().staleSelectionPending ?? false,
      ),
    )
    .toBe(true);

  await expect(
    page.getByRole("heading", { name: "Checking the current learner" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /guardian mode/ }).click();
  const menu = page.getByRole("menu", { name: "Account menu" });
  await expect(
    menu.getByRole("menuitem", { name: "Switch to Mia" }),
  ).toHaveCount(0);
  await expect(
    menu.getByRole("menuitem", { name: "Manage Mia's details" }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(/\/guardian\/learners/);
  await page.keyboard.press("Escape");

  expect(
    await page.evaluate(
      () =>
        (
          window as Window & {
            __parrotE2eLearners?: { releaseStaleSelection(): boolean };
          }
        ).__parrotE2eLearners?.releaseStaleSelection() ?? false,
    ),
  ).toBe(true);
  await expect(learnerCard(page, "Noah")).toContainText("Current learner");
  await page.getByRole("button", { name: /guardian mode/ }).click();
  await expect(
    page
      .getByRole("menu", { name: "Account menu" })
      .getByRole("menuitem", { name: "Switch to Noah" }),
  ).toBeVisible();
});

const learnerRoutes = [
  "/",
  "/talk-to-peppa",
  "/lessons",
  "/lessons/parrot/01-peppas-high-ball/scenes/1",
  "/stories",
  "/stories/the-red-ball/pages/1",
  "/progress",
  "/profile/setup",
  "/dubs/five-little-ducks",
] as const;

test("keeps sibling identity and every Guardian action out of learner routes", async ({
  page,
}) => {
  for (const path of learnerRoutes) {
    await page.goto(learnerScenarioUrl(path, "multiple", "learner"));
    const trigger = page.getByRole("button", {
      name: /Profile for Mia, learner mode/,
    });
    await expect(trigger, `active learner header on ${path}`).toBeVisible();

    const bodyText = await page.locator("body").innerText();
    const pageSource = await page.content();
    expect(bodyText, `rendered sibling name on ${path}`).not.toContain("Noah");
    expect(pageSource, `sibling name in page source on ${path}`).not.toContain(
      "Noah",
    );
    for (const guardianAction of [
      "Guardian dashboard",
      "Learner profiles",
      "Manage Mia's details",
      "AI and saved data",
      "Sign out",
      "Delete account",
    ]) {
      await expect(
        page.getByRole("menuitem", { name: guardianAction }),
        `${guardianAction} on ${path}`,
      ).toHaveCount(0);
    }

    await trigger.click();
    const menu = page.getByRole("menu", { name: "Account menu" });
    await expect(menu.getByRole("menuitem")).toHaveText([
      "Grown-up accessAccount password required",
    ]);
    await expect(menu).not.toContainText("Noah");
    await page.keyboard.press("Escape");

    if (path === "/dubs/five-little-ducks") {
      await expect(
        page.getByRole("main").getByRole("paragraph").filter({
          hasText: "Ask a grown-up to turn on voice dubbing in Guardian mode.",
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("checkbox", { name: /grown-up|guardian|consent/i }),
      ).toHaveCount(0);
      await trigger.click();
      await page
        .getByRole("menu", { name: "Account menu" })
        .getByRole("menuitem", { name: /Grown-up access/ })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Unlock guardian mode" }),
      ).toBeVisible();
    }
  }
});

const requiredViewports = [
  { width: 280, height: 568 },
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 640, height: 360 },
  { width: 1440, height: 900 },
] as const;

for (const viewport of requiredViewports) {
  test(`keeps the roster, active context, and Guardian menu contained at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(learnerScenarioUrl("/guardian/learners", "multiple"));

    const main = page.getByRole("main");
    const back = page.getByRole("link", { name: "Back to guardian dashboard" });
    const trigger = page.getByRole("button", {
      name: /Profile for Mia, guardian mode/,
    });
    const noah = learnerCard(page, "Noah");
    const add = page.getByRole("button", { name: "Add learner" });
    await expect(
      page.getByRole("heading", { name: "Managing Mia" }),
    ).toBeVisible();
    await expect(noah).toContainText("Setup complete");
    await expect(noah.getByRole("button", { name: "Use Noah" })).toBeVisible();
    await expect(
      noah.getByRole("button", { name: "Manage Noah's details" }),
    ).toBeVisible();
    await expect(add).toBeVisible();
    await expectContainedHorizontally(back, page);
    await expectContainedHorizontally(trigger, page);
    await expectContainedHorizontally(noah, page);
    await expectContainedHorizontally(add, page);
    await expectNoHorizontalOverflow(page);

    await trigger.click();
    const menu = page.getByRole("menu", { name: "Account menu" });
    const panel = menu.locator("..");
    await expect(
      panel.getByRole("group", { name: "Active profile" }),
    ).toContainText("Managing Mia");
    await expect(menu.getByRole("menuitem")).toHaveText([
      "Guardian dashboard",
      "Learner profiles",
      "Manage Mia's details",
      "Switch to Mia",
      "AI and saved data",
      "Sign out",
      "Delete account",
    ]);
    await menu
      .getByRole("menuitem", { name: "Delete account" })
      .scrollIntoViewIfNeeded();
    await expectContainedHorizontally(panel, page);
    await expectNoHorizontalOverflow(page);

    await page.keyboard.press("Escape");
    await main.evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await expect(add).toBeVisible();
  });
}

const guardianNameSurfaces = [
  { heading: "Learner details", path: "/guardian/profile" },
  { heading: "My Lessons", path: "/guardian/lessons" },
  { heading: "Story settings", path: "/guardian/stories" },
  { heading: "Voice dubbing", path: "/guardian/dubbing" },
] as const;

async function renameActiveLearner(page: Page, name: string) {
  await expect(
    page.getByRole("heading", { name: "Learner profiles" }),
  ).toBeVisible();
  const updated = await page.evaluate(async (nextName) => {
    const response = await fetch("/api/profile", {
      body: JSON.stringify({
        answers: { age: "8", description: "", name: nextName },
      }),
      headers: { "Content-Type": "application/json" },
      method: "PUT",
    });
    return {
      body: await response.json(),
      snapshot: (
        window as Window & {
          __parrotE2eLearners?: {
            snapshot(): { profiles: Array<{ id: string; name: string }> };
          };
        }
      ).__parrotE2eLearners?.snapshot(),
      status: response.status,
    };
  }, name);
  expect(updated.status).toBe(200);
  expect(updated.body).toMatchObject({
    profile: { id: "learner-mia", name },
  });
  expect(
    updated.snapshot?.profiles.find(({ id }) => id === "learner-mia"),
  ).toMatchObject({ id: "learner-mia", name });
  await page.reload();
}

async function expectGuardianNameSurfacesContained(page: Page, name: string) {
  const directions: string[] = [];
  for (const surface of guardianNameSurfaces) {
    await page.goto(learnerScenarioUrl(surface.path, "multiple"));
    await expect(
      page.getByRole("heading", { exact: true, name: surface.heading }),
      `${surface.path} heading`,
    ).toBeVisible();

    if (surface.path === "/guardian/profile") {
      await expect(page.getByLabel("Name")).toHaveValue(name);
      await expect(
        page.getByText(`About ${name}`, { exact: true }),
      ).toBeVisible();
    } else if (surface.path === "/guardian/lessons") {
      await expect(
        page
          .getByRole("main")
          .getByRole("status")
          .filter({ hasText: "No custom lessons yet." }),
      ).toHaveText("No custom lessons yet.");
    } else if (surface.path === "/guardian/stories") {
      const art = page.getByRole("region", { name: "Personalized story art" });
      await expect(art).toBeVisible();
      await expect(
        art.getByLabel(`Upload ${name}'s photo`, { exact: false }),
      ).toBeVisible();
    } else {
      const consent = page.getByRole("checkbox");
      await expect(consent).toBeVisible();
      await expect(consent).toHaveAccessibleName(new RegExp(name));
    }

    directions.push(...(await expectNameContentContained(page, name)));
    await expectNoHorizontalOverflow(page);

    const trigger = page.getByRole("button", {
      name: /Profile for Mia, guardian mode/,
    });
    await expectContainedHorizontally(trigger, page);
    await trigger.click();
    const menu = page.getByRole("menu", { name: "Account menu" });
    await expect(
      menu.getByRole("menuitem", { name: `Manage ${name}'s details` }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: `Switch to ${name}` }),
    ).toBeVisible();
    directions.push(...(await expectNameContentContained(page, name)));
    await expectContainedHorizontally(menu.locator(".."), page);
    await expectNoHorizontalOverflow(page);
    await page.keyboard.press("Escape");
  }
  return directions;
}

test("wraps an unbroken 120-character active learner name without horizontal overflow", async ({
  page,
}) => {
  const longName = "A".repeat(120);
  await page.setViewportSize({ width: 280, height: 568 });
  await page.goto(learnerScenarioUrl("/guardian/learners", "multiple"));
  await renameActiveLearner(page, longName);

  await expect(learnerCard(page, longName)).toContainText("Current learner");
  await expectNameContentContained(page, longName);
  const trigger = page.getByRole("button", {
    name: /Profile for Mia, guardian mode/,
  });
  await trigger.click();
  const menu = page.getByRole("menu", { name: "Account menu" });
  await expect(
    menu.getByRole("menuitem", { name: `Switch to ${longName}` }),
  ).toBeVisible();
  await expectContainedHorizontally(menu.locator(".."), page);
  await expectNoHorizontalOverflow(page);
  await page.keyboard.press("Escape");

  await expectGuardianNameSurfacesContained(page, longName);
});

test("isolates a right-to-left learner name across every Guardian context at 280px", async ({
  page,
}) => {
  const rtlName = "مريم الببغاء ١٢٣";
  await page.setViewportSize({ width: 280, height: 568 });
  await page.goto(learnerScenarioUrl("/guardian/learners", "multiple"));
  await renameActiveLearner(page, rtlName);

  await expect(learnerCard(page, rtlName)).toContainText("Current learner");
  const rosterDirections = await expectNameContentContained(page, rtlName);
  expect(rosterDirections).toContain("rtl");
  await expectNoHorizontalOverflow(page);

  const surfaceDirections = await expectGuardianNameSurfacesContained(
    page,
    rtlName,
  );
  expect(surfaceDirections).toContain("rtl");
});

test("keeps wildcard, mode-mismatch, redo, and profile-return exits inside Guardian navigation", async ({
  page,
}) => {
  await page.goto(
    learnerScenarioUrl(
      "/guardian/profile?returnTo=%2Fguardian%2Fprofile",
      "multiple",
    ),
  );
  await expect(
    page.getByRole("heading", { name: "Learner details" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL("/guardian");
  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toBeVisible();

  await page.goto(learnerScenarioUrl("/guardian/not-a-route", "multiple"));
  await expect(page).toHaveURL("/guardian");
  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toBeVisible();

  await page.goto(learnerScenarioUrl("/lessons", "multiple"));
  await expect(
    page.getByRole("heading", { name: "Switch to learner mode" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to Guardian dashboard" }).click();
  await expect(page).toHaveURL("/guardian");
  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toBeVisible();

  await page.goto(
    learnerScenarioUrl(
      "/guardian/profile/setup?redo=1&returnTo=%2Fguardian&parrotE2eProfile=viewport-stability",
      "multiple",
    ),
  );
  await expect(
    page.getByRole("heading", {
      name: "Hi! I'm Peppa. What's your name?",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL("/guardian");
});

test("returns lesson creation and editing Back and Save actions to Guardian lessons", async ({
  page,
}) => {
  const lesson = createLessonScript();
  await page.goto(learnerScenarioUrl("/guardian/learners", "multiple"));
  await expect(
    page.getByRole("heading", { name: "Learner profiles" }),
  ).toBeVisible();
  const lessonId = await page.evaluate(async (script) => {
    const response = await fetch("/api/lessons/my", {
      body: JSON.stringify({ lesson: script, source: "uploaded" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as { lesson: { id: string } };
    return payload.lesson.id;
  }, lesson);

  await page.goto(learnerScenarioUrl("/lessons/my/create", "multiple"));
  await expect(page.getByText("Managing Mia", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to lessons" }).click();
  await expect(page).toHaveURL("/guardian/lessons");

  await page.goto(
    learnerScenarioUrl("/lessons/my/create?tab=upload", "multiple"),
  );
  await page
    .getByLabel("Editable lesson script (JSON)")
    .fill(JSON.stringify(lesson));
  await page.getByRole("button", { name: "Review script" }).click();
  await page.getByRole("button", { exact: true, name: "Save lesson" }).click();
  await expect(page).toHaveURL("/guardian/lessons");

  await page.goto(
    learnerScenarioUrl(`/lessons/my/${lessonId}/edit`, "multiple"),
  );
  await expect(
    page.getByRole("heading", { name: "Edit Lesson" }),
  ).toBeVisible();
  await expect(page.getByText("Managing Mia", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to lessons" }).click();
  await expect(page).toHaveURL("/guardian/lessons");

  await page.goto(
    learnerScenarioUrl(`/lessons/my/${lessonId}/edit`, "multiple"),
  );
  await page.getByRole("button", { exact: true, name: "Save changes" }).click();
  await expect(page).toHaveURL("/guardian/lessons");
});
