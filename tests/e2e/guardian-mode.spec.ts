import { expect, test, type Locator, type Page } from "@playwright/test";

const LOCK_ERROR =
  "Could not lock guardian mode. Try again before handing over the device.";
const requiredViewports = [
  { width: 280, height: 568 },
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 640, height: 360 },
  { width: 1440, height: 900 },
];
const lessonPrivacyViewports = [
  { width: 280, height: 653 },
  { width: 390, height: 844 },
  { width: 667, height: 375 },
  { width: 1440, height: 900 },
];

type Rect = { height: number; width: number; x: number; y: number };

async function visibleBox(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function expectInsideViewport(
  locator: Locator,
  viewport: { height: number; width: number },
) {
  const box = await visibleBox(locator);
  const subpixelTolerance = 1;
  expect(box.x).toBeGreaterThanOrEqual(-subpixelTolerance);
  expect(box.y).toBeGreaterThanOrEqual(-subpixelTolerance);
  expect(box.x + box.width).toBeLessThanOrEqual(
    viewport.width + subpixelTolerance,
  );
  expect(box.y + box.height).toBeLessThanOrEqual(
    viewport.height + subpixelTolerance,
  );
  return box;
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
}

function boxesOverlap(first: Rect, second: Rect) {
  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}

async function expectNoOverlap(first: Locator, second: Locator) {
  expect(boxesOverlap(await visibleBox(first), await visibleBox(second))).toBe(
    false,
  );
}

function guardianUrl(path: string, scenario: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}parrotE2eGuardian=${scenario}`;
}

function guardianLearnerUrl(path: string, scenario: string) {
  const url = new URL(guardianUrl(path, scenario), "http://parrot-e2e.invalid");
  url.searchParams.set("parrotE2eLearners", "multiple");
  return `${url.pathname}${url.search}${url.hash}`;
}

async function chooseLearnerAndStart(
  page: Page,
  name: string,
  triggerName:
    "Switch to learner" | "Switch to learner mode" = "Switch to learner",
) {
  const trigger = page.getByRole("button", {
    exact: true,
    name: triggerName,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Who is learning now?" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { exact: true, name: `Start learner mode as ${name}` })
    .click();
  return dialog;
}

async function openLearnerAccountMenu(page: Page) {
  await page
    .getByRole("button", { name: /Profile for .+, learner mode/ })
    .click();
  return page.getByRole("menu", { name: "Account menu" });
}

async function switchFromMenu(page: Page) {
  const menu = await openLearnerAccountMenu(page);
  await menu.getByRole("menuitem", { name: /Grown-up access/ }).click();
  await expect(menu).toHaveCount(0);
}

for (const viewport of requiredViewports) {
  test(`profile switch remains contained at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const trigger = page.getByRole("button", {
      name: /Profile for Mia, learner mode/,
    });
    const menu = await openLearnerAccountMenu(page);
    const panel = menu.locator("..");

    await expectInsideViewport(trigger, viewport);
    await expectInsideViewport(panel, viewport);
    await expect(menu.getByRole("menuitem")).toHaveText([
      "Switch learner",
      "Grown-up accessSwitch modes",
    ]);
    await expect(
      page.getByRole("group", { name: "Choose profile mode" }),
    ).toHaveCount(0);
    expect(await horizontalOverflow(page)).toBe(false);

    await menu.getByRole("menuitem", { name: /Grown-up access/ }).click();
    await expect(page).toHaveURL("/guardian");
    await expectInsideViewport(
      page.getByRole("heading", { name: "Guardian dashboard" }),
      viewport,
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}

test("account-menu switching has no password or intermediate dialog", async ({
  page,
}) => {
  const viewport = { width: 280, height: 568 };
  await page.setViewportSize(viewport);
  await page.goto("/");
  await switchFromMenu(page);
  await expect(page).toHaveURL("/guardian");
  await expect(page.getByLabel("Password")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(false);
});

test("direct Guardian routes open without an unlock prompt", async ({
  page,
}) => {
  await page.goto("/guardian/stories");

  await expect(page.getByLabel("Password")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL("/guardian/stories");
  await expect(
    page.getByRole("heading", { name: "Story settings" }),
  ).toBeVisible();
});

test("the browser Guardian API ignores request bodies", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /Profile for Mia, learner mode/ }),
  ).toBeVisible();

  const attempts = await page.evaluate(async () => {
    async function post(body?: string) {
      const response = await fetch("/api/guardian-access", {
        body,
        method: "POST",
      });
      return { body: await response.json(), status: response.status };
    }
    const bodyless = await post();
    await fetch("/api/guardian-access", { method: "DELETE" });
    const ignored = await post("not-json and not a password");
    const status = await fetch("/api/guardian-access").then((response) =>
      response.json(),
    );
    return { bodyless, ignored, status };
  });

  expect(attempts).toEqual({
    bodyless: {
      body: expect.objectContaining({ mode: "guardian" }),
      status: 200,
    },
    ignored: {
      body: expect.objectContaining({ mode: "guardian" }),
      status: 200,
    },
    status: expect.objectContaining({ mode: "guardian" }),
  });
  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toHaveCount(0);
});

test("mode-switch request failure never navigates to guardian content", async ({
  page,
}) => {
  await page.goto(guardianUrl("/", "unlock-error"));
  await switchFromMenu(page);

  await expect(page.getByRole("alert").filter({ hasText: "Guardian access" })).toHaveText(
    "Guardian access could not be checked. Please try again.",
  );
  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(guardianUrl("/", "unlock-error"));
});

test("automatic Guardian access failure stays on the requested route", async ({
  page,
}) => {
  const requestedUrl = guardianUrl("/guardian/stories", "unlock-error");
  await page.goto(requestedUrl);

  await expect(
    page.getByRole("heading", { name: "Guardian tools did not open" }),
  ).toBeVisible();
  await expect(page).toHaveURL(requestedUrl);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Story settings" }),
  ).toHaveCount(0);
});

test("successful switch opens guardian management and announces the mode", async ({
  page,
}) => {
  await page.goto("/");
  await switchFromMenu(page);

  await expect(page).toHaveURL("/guardian");
  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toBeFocused();
  await expect(
    page.getByRole("status").filter({
      hasText: "Guardian mode",
    }),
  ).toHaveText("Guardian mode");

  for (const heading of [
    "Learner profiles",
    "Learning & content",
    "Story settings",
    "Voice dubbing",
    "Account & privacy",
  ]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "My Lessons" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("link", { name: "Create custom lesson" }),
  ).toHaveCount(0);

  const menu = page.getByRole("menu", { name: "Account menu" });
  await expect(menu).toHaveCount(0);
  await page
    .getByRole("button", { name: /Profile for Alex Guardian, guardian mode/ })
    .click();
  await expect(menu.getByRole("menuitem")).toHaveText([
    "Guardian dashboard",
    "Manage learners",
    "Account & privacy",
    "Sign out",
  ]);
  await expect(
    page.getByRole("group", { name: "Choose profile mode" }),
  ).toHaveCount(0);
});

test("automatic Guardian access resumes the current deep link", async ({
  page,
}) => {
  const requestedUrl = "/guardian/stories?section=art#cover";
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /Profile for Mia, learner mode/ }),
  ).toBeVisible();
  await page.evaluate((destination) => {
    window.history.pushState(null, "", destination);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, requestedUrl);
  const historyLengthBeforeAccess = await page.evaluate(
    () => window.history.length,
  );
  await expect(
    page.getByRole("heading", { name: "Story settings" }),
  ).toBeVisible();
  const openedUrl = new URL(page.url());
  expect(openedUrl.pathname).toBe("/guardian/stories");
  expect(openedUrl.searchParams.get("section")).toBe("art");
  expect(openedUrl.searchParams.get("learnerProfileId")).toBe("e2e-learner");
  expect(openedUrl.hash).toBe("#cover");
  expect(await page.evaluate(() => window.history.length)).toBe(
    historyLengthBeforeAccess,
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Story settings" }),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("heading", { name: "Switch to learner mode" }),
  ).toBeVisible();
});

for (const viewport of lessonPrivacyViewports) {
  test(`guardian manages automatic lesson voice recordings at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    const profile = {
      age: 8,
      answers: {
        legacyAnswers: null,
        questionnaireVersion: 2,
        responses: {},
        schemaVersion: 2,
      },
      completedAt: "2026-08-26T08:00:00.000Z",
      currentQuestionKey: null,
      description: null,
      id: "e2e-learner",
      name: "Mia",
      profileStatus: "completed",
      questionnaireVersion: 2,
      storyLevel: "first-words",
    };
    let consent = false;
    let cleanupPending = false;
    const mutations: boolean[] = [];

    await page.setViewportSize(viewport);
    await page.route("**/api/learner-profile", (route) =>
      route.fulfill({
        json: {
          canBypass: true,
          experienceMode: "form",
          mode: "full",
          profile,
          progress: { answered: 6, current: 6, total: 6 },
          question: null,
          questionnaire: { version: 2 },
        },
      }),
    );
    await page.route(
      (url) => url.pathname === "/api/profile",
      (route) =>
        route.fulfill({
          json: {
            profile: {
              ...profile,
              lessonRecordingCleanupPending: cleanupPending,
              lessonRecordingConsent: consent,
            },
            questions: [],
          },
        }),
    );
    await page.route(
      (url) => url.pathname === "/api/profile/lesson-recording-consent",
      async (route) => {
        const body = route.request().postDataJSON() as { enabled: boolean };
        consent = body.enabled;
        mutations.push(consent);
        cleanupPending =
          !consent && mutations.filter((value) => !value).length === 1;
        await route.fulfill({ json: { cleanupPending, enabled: consent } });
      },
    );

    await page.goto(guardianUrl("/guardian/learners/e2e-learner", "guardian"));

    const account = page.getByRole("button", {
      name: "Profile for Alex Guardian, guardian mode",
    });
    const back = page.getByRole("button", { exact: true, name: "Back" });
    const consentSection = page.getByRole("region", {
      name: "Lesson voice recordings",
    });
    const deleteRecordings = consentSection.getByRole("button", {
      name: "Delete saved lesson recordings",
    });
    const recordingState = consentSection.getByRole("status");
    await consentSection.scrollIntoViewIfNeeded();
    await expect(consentSection).toContainText(
      "Recording is available automatically during each join-in moment.",
    );
    await expect(consentSection).toContainText(
      "Clips apply only to this learner profile",
    );
    await expect(consentSection).toContainText(
      "one latest clip is saved per join-in moment",
    );
    await expect(recordingState).toHaveText(
      "Lesson recording is available automatically.",
    );
    const initialRecordingStateBox = await visibleBox(recordingState);
    await expectInsideViewport(consentSection, viewport);
    await expectInsideViewport(deleteRecordings, viewport);
    await expect(deleteRecordings).toHaveAccessibleName("Delete saved lesson recordings");
    await expectNoOverlap(deleteRecordings, account);
    await expectNoOverlap(deleteRecordings, back);
    expect(await horizontalOverflow(page)).toBe(false);

    page.once("dialog", async (dialog) => {
      expect(dialog.type()).toBe("confirm");
      expect(dialog.message()).toMatch(
        /delete all saved lesson voice recordings/i,
      );
      await dialog.accept();
    });
    await deleteRecordings.click();

    const finishDeletion = consentSection.getByRole("button", {
      name: "Finish deleting lesson recordings",
    });
    await expect(finishDeletion).toHaveAccessibleName(
      "Finish deleting lesson recordings",
    );
    await expect(recordingState).toHaveText(
      "Saved lesson recordings are still being deleted.",
    );
    const pendingRecordingStateBox = await visibleBox(recordingState);
    expect(
      Math.abs(
        pendingRecordingStateBox.height - initialRecordingStateBox.height,
      ),
    ).toBeLessThanOrEqual(1);
    await expectInsideViewport(finishDeletion, viewport);
    expect(await horizontalOverflow(page)).toBe(false);
    expect(mutations).toEqual([false]);

    await finishDeletion.click();
    await expect(deleteRecordings).toHaveAccessibleName("Delete saved lesson recordings");
    await expect(recordingState).toHaveText(
      "Lesson recording is available automatically.",
    );
    await expectInsideViewport(deleteRecordings, viewport);
    expect(mutations).toEqual([false, false]);
  });
}

test("automatic Guardian access opens a deep link without an unlock dialog", async ({
  page,
}) => {
  await page.goto("/guardian/stories");

  await expect(page).toHaveURL("/guardian/stories");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Story settings" }),
  ).toBeVisible();
});

for (const { path, protectedName, unlockedPath } of [
  { path: "/guardian", protectedName: "Guardian dashboard" },
  { path: "/guardian/account", protectedName: "Account & privacy" },
  {
    path: "/guardian/learners/e2e-learner",
    protectedName: "Learner details",
  },
  {
    path: "/guardian/profile/setup?parrotE2eProfile=viewport-stability",
    protectedName: "Guardian dashboard",
    unlockedPath: "/guardian",
  },
  {
    path: "/guardian/profile/setup?redo=1&returnTo=%2Fguardian%2Flearners%2Fe2e-learner",
    protectedName: "Update my profile",
  },
  {
    path: "/guardian/stories",
    protectedName: "Story settings",
    unlockedPath:
      "/guardian/stories?parrotE2eGuardian=learner&learnerProfileId=e2e-learner",
  },
  {
    path: "/guardian/dubbing",
    protectedName: "Voice dubbing",
    unlockedPath:
      "/guardian/dubbing?parrotE2eGuardian=learner&learnerProfileId=e2e-learner",
  },
  {
    path: "/profile/setup?redo=1&returnTo=%2Fguardian",
    protectedName: "Update my profile",
  },
]) {
  test(`automatic Guardian access opens ${path}`, async ({
    page,
  }) => {
    const requestedUrl = guardianUrl(path, "learner");
    await page.goto(requestedUrl);

    await expect(page).toHaveURL(unlockedPath ?? requestedUrl);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { exact: true, name: protectedName }),
    ).toBeVisible();
  });
}

test("a guardian-mode duck dub deep link asks to switch profiles", async ({
  page,
}) => {
  await page.goto(
    guardianUrl("/dubs/five-little-ducks?parrotE2eDub=partial", "guardian"),
  );

  await expect(
    page.getByRole("heading", { name: "Switch to learner mode" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Five Little Ducks" }),
  ).toHaveCount(0);
});

test("a guardian-mode Old MacDonald deep link asks to switch profiles", async ({
  page,
}) => {
  await page.goto(
    guardianUrl("/dubs/old-macdonald?parrotE2eDub=partial", "guardian"),
  );

  await expect(
    page.getByRole("heading", { name: "Switch to learner mode" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Old MacDonald Had a Farm" }),
  ).toHaveCount(0);
});

test("a valid guardian unlock resumes after refresh", async ({ page }) => {
  await page.goto("/");
  await switchFromMenu(page);
  await page.reload();

  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Profile for Alex Guardian, guardian mode/,
    }),
  ).toBeVisible();
});

test("a seeded guardian expiry stays fixed across refresh", async ({
  page,
}) => {
  await page.goto(guardianUrl("/", "guardian"));
  await expect(
    page.getByRole("button", {
      name: /Profile for Alex Guardian, guardian mode/,
    }),
  ).toBeVisible();
  const expiresAtBeforeRefresh = await page.evaluate(async () => {
    const response = await fetch("/api/guardian-access");
    const access = (await response.json()) as { expiresAt?: string };
    return access.expiresAt;
  });

  await page.reload();
  await expect(
    page.getByRole("button", {
      name: /Profile for Alex Guardian, guardian mode/,
    }),
  ).toBeVisible();

  const expiresAtAfterRefresh = await page.evaluate(async () => {
    const response = await fetch("/api/guardian-access");
    const access = (await response.json()) as { expiresAt?: string };
    return access.expiresAt;
  });
  expect(expiresAtBeforeRefresh).toBeTruthy();
  expect(expiresAtAfterRefresh).toBe(expiresAtBeforeRefresh);
});

test("an expired guardian session automatically recovers the same deep link", async ({
  page,
}) => {
  await page.clock.install({
    time: new Date("2026-08-25T08:00:00.000Z"),
  });
  await page.goto(guardianUrl("/guardian/stories", "expired"));
  await expect(
    page.getByRole("heading", { name: "Story settings" }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.history.pushState(null, "", "/guardian/stories");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.getByRole("heading", { name: "Story settings" }),
  ).toBeVisible();
  await page.clock.fastForward(2_000);
  await expect(page).toHaveURL(
    "/guardian/stories?learnerProfileId=e2e-learner",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Story settings" }),
  ).toBeVisible();
});

test("failed dashboard lock preserves guardian content and navigation", async ({
  page,
}) => {
  const url = guardianLearnerUrl("/guardian", "lock-error");
  await page.goto(url);
  const dashboard = page.getByRole("heading", { name: "Guardian dashboard" });
  await expect(dashboard).toBeVisible();

  const dialog = await chooseLearnerAndStart(page, "Noah");

  await expect(dialog.getByRole("alert")).toHaveText(LOCK_ERROR);
  await expect(
    dialog.getByRole("button", { name: "Start learner mode as Noah" }),
  ).toBeFocused();
  await expect(dashboard).toBeVisible();
  await expect(page).toHaveURL(url);
});

test("failed learner-boundary lock preserves the requested learner route", async ({
  page,
}) => {
  const url = guardianLearnerUrl("/lessons", "lock-error");
  await page.goto(url);
  const boundary = page.getByRole("heading", {
    name: "Switch to learner mode",
  });
  await expect(boundary).toBeVisible();

  const dialog = await chooseLearnerAndStart(
    page,
    "Noah",
    "Switch to learner mode",
  );

  await expect(dialog.getByRole("alert")).toHaveText(LOCK_ERROR);
  await expect(
    dialog.getByRole("button", { name: "Start learner mode as Noah" }),
  ).toBeFocused();
  await expect(boundary).toBeVisible();
  await expect(page).toHaveURL(url);
});

test("successful lock redirects the stale route once and permits a later direct Guardian route", async ({
  page,
}) => {
  await page.goto(guardianLearnerUrl("/guardian", "guardian"));
  await chooseLearnerAndStart(page, "Noah");

  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("navigation", { name: "Learning activities" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Profile for Noah, learner mode/ }),
  ).toBeVisible();

  await page.goto("/guardian/stories");
  await expect(page).toHaveURL("/guardian/stories");
  await expect(
    page.getByRole("heading", { name: "Story settings" }),
  ).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(
    "/guardian/stories?learnerProfileId=learner-noah",
  );
  await expect(
    page.getByRole("heading", { name: "Story settings" }),
  ).toBeVisible();

  const accessMode = await page.evaluate(async () => {
    const response = await fetch("/api/guardian-access");
    return ((await response.json()) as { mode: string }).mode;
  });
  expect(accessMode).toBe("guardian");
});

test("locking guardian access in one tab returns a sibling tab to learner mode", async ({
  page,
}) => {
  const url = guardianLearnerUrl("/guardian", "guardian");
  const sibling = await page.context().newPage();
  try {
    await Promise.all([page.goto(url), sibling.goto(url)]);
    await expect(
      page.getByRole("heading", { name: "Guardian dashboard" }),
    ).toBeVisible();
    await expect(
      sibling.getByRole("heading", { name: "Guardian dashboard" }),
    ).toBeVisible();
    await expect(sibling.getByRole("dialog")).toHaveCount(0);

    await chooseLearnerAndStart(page, "Noah");

    await expect(sibling).toHaveURL("/");
    await expect(sibling.getByRole("dialog")).toHaveCount(0);
    await expect(
      sibling.getByRole("navigation", { name: "Learning activities" }),
    ).toBeVisible();

    await sibling.evaluate(() => {
      window.history.pushState(null, "", "/guardian/stories");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(sibling).toHaveURL("/guardian/stories");
    await expect(
      sibling.getByRole("heading", { name: "Story settings" }),
    ).toBeVisible();

    await sibling.reload();
    await expect(sibling).toHaveURL(
      "/guardian/stories?learnerProfileId=learner-noah",
    );
    await expect(
      sibling.getByRole("heading", { name: "Story settings" }),
    ).toBeVisible();
  } finally {
    await sibling.close();
  }
});

test("direct switching closes learner menu while guardian-menu keys follow rendered items", async ({
  page,
}) => {
  await page.goto("/");
  const trigger = page.getByRole("button", {
    name: /Profile for Mia, learner mode/,
  });
  await trigger.click();
  const learnerMenu = page.getByRole("menu", { name: "Account menu" });
  const guardian = learnerMenu.getByRole("menuitem", {
    name: /Grown-up access/,
  });
  await guardian.click();
  await expect(learnerMenu).toHaveCount(0);
  await expect(page).toHaveURL("/guardian");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto(guardianUrl("/guardian", "guardian"));
  const guardianTrigger = page.getByRole("button", {
    name: /Profile for Alex Guardian, guardian mode/,
  });
  await guardianTrigger.click();
  const menu = page.getByRole("menu", { name: "Account menu" });
  const dashboard = menu.getByRole("menuitem", {
    name: "Guardian dashboard",
  });
  const manageLearners = menu.getByRole("menuitem", {
    name: "Manage learners",
  });
  const accountPrivacy = menu.getByRole("menuitem", {
    name: "Account & privacy",
  });
  const signOut = menu.getByRole("menuitem", { name: "Sign out" });
  await expect(dashboard).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(manageLearners).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(accountPrivacy).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(signOut).toBeFocused();
  await page.keyboard.press("End");
  await expect(signOut).toBeFocused();
  await page.keyboard.press("Home");
  await expect(dashboard).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(guardianTrigger).toBeFocused();
  await expect(menu).toHaveCount(0);
});

async function expectNoLearnerAdultControls(page: Page) {
  await expect(
    page.getByRole("checkbox", {
      name: /I’m the grown-up|I am (?:the learner|.+)'s guardian/i,
    }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Grown-up options")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Delete (my )?dub/i }),
  ).toHaveCount(0);
  await expect(page.getByLabel(/^Grown-up chat style:/)).toHaveCount(0);
}

test("learner routes omit adult management actions", async ({ page }) => {
  for (const { path, watchDub } of [
    { path: "/", watchDub: false },
    { path: "/talk-to-peppa", watchDub: false },
    { path: "/lessons", watchDub: false },
    { path: "/stories", watchDub: false },
    {
      path: "/dubs/five-little-ducks?parrotE2eDub=complete",
      watchDub: true,
    },
    {
      path: "/dubs/old-macdonald?parrotE2eDub=complete",
      watchDub: true,
    },
  ]) {
    await page.goto(path);
    const menu = await openLearnerAccountMenu(page);
    await expect(menu.getByRole("menuitem")).toHaveText([
      "Switch learner",
      "Grown-up accessSwitch modes",
    ]);
    await expect(
      page.getByRole("group", { name: "Choose profile mode" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Create custom lesson" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: /Sign out|Delete account|Generate story art/,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("group", { name: "Choose story level" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("checkbox", {
        name: /I am 18 or older.*guardian/i,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("checkbox", { name: "Guardian consent" }),
    ).toHaveCount(0);
    await expectNoLearnerAdultControls(page);
    if (watchDub) {
      await expect(
        page.getByRole("button", { name: "Play full video" }),
      ).toBeVisible();
      await expectNoLearnerAdultControls(page);
    }
    await page.keyboard.press("Escape");
  }
});

for (const viewport of [
  { width: 280, height: 568 },
  { width: 640, height: 360 },
  { width: 1440, height: 900 },
]) {
  test(`learner lesson activity remains contained at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(
      "/lessons/parrot/01-peppas-high-ball/scenes/1?parrotE2eLesson=held-cue-no-consent",
    );
    const profile = page.getByRole("button", {
      name: /Profile for Mia, learner mode/,
    });
    const back = page.getByRole("button", { name: "Back to lesson list" });
    const start = page.getByRole("button", { exact: true, name: "Let's go" });
    await expectInsideViewport(profile, viewport);
    await expectInsideViewport(back, viewport);
    await expectInsideViewport(start, viewport);
    await expectNoOverlap(profile, back);

    await start.click();

    const hud = page.getByRole("region", { name: "Lesson progress" });
    const speech = page
      .getByRole("region", { name: "Join in" })
      .filter({ hasText: "It is up high!" });
    const phrase = speech.getByText("It is up high!", { exact: true });
    const status = speech.getByRole("status");
    const controls = page.getByRole("navigation", {
      name: "Lesson playback controls",
    });
    await expect(status).toHaveCount(0);
    for (const element of [
      profile,
      back,
      hud,
      speech,
      phrase,
      controls,
    ]) {
      await expectInsideViewport(element, viewport);
    }
    await expectNoOverlap(profile, hud);
    await expectNoOverlap(back, hud);
    await expectNoOverlap(speech, controls);
    expect(await horizontalOverflow(page)).toBe(false);
  });
}
