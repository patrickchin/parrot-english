import { expect, test, type Locator, type Page } from "@playwright/test";
import { createLessonScript } from "../fixtures/lesson-script.mjs";

const GUARDIAN_PASSWORD = "e2e-guardian-password";
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

async function openLearnerAccountMenu(page: Page) {
  await page
    .getByRole("button", { name: /Profile for .+, learner mode/ })
    .click();
  return page.getByRole("menu", { name: "Account menu" });
}

async function openGuardianUnlock(page: Page) {
  const menu = await openLearnerAccountMenu(page);
  await menu.getByRole("menuitem", { name: /Grown-up access/ }).click();
  return page.getByRole("dialog", { name: "Unlock guardian mode" });
}

async function unlockFromMenu(page: Page) {
  const dialog = await openGuardianUnlock(page);
  await dialog.getByLabel("Password").fill(GUARDIAN_PASSWORD);
  await dialog.getByRole("button", { name: "Unlock guardian mode" }).click();
  await expect(dialog).toHaveCount(0);
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
      "Grown-up accessAccount password required",
    ]);
    await expect(
      page.getByRole("group", { name: "Choose profile mode" }),
    ).toHaveCount(0);
    expect(await horizontalOverflow(page)).toBe(false);

    await menu.getByRole("menuitem", { name: /Grown-up access/ }).click();
    const dialog = page.getByRole("dialog", { name: "Unlock guardian mode" });
    await expectInsideViewport(dialog, viewport);
    await dialog.getByRole("button", { name: "Cancel" }).click();
  });
}

test("incorrect password keeps learner mode and the unlock dialog open", async ({
  page,
}) => {
  const viewport = { width: 280, height: 568 };
  await page.setViewportSize(viewport);
  await page.goto("/");
  const dialog = await openGuardianUnlock(page);
  const password = dialog.getByLabel("Password");

  await expect(password).toBeFocused();
  await password.fill("wrong-password");
  await dialog.getByRole("button", { name: "Unlock guardian mode" }).click();

  await expect(dialog.getByRole("alert")).toHaveText(
    "The password did not match this account.",
  );
  await expect(password).toBeFocused();
  await expect(dialog).toBeVisible();
  await expectInsideViewport(dialog, viewport);
  await expect(page).toHaveURL("/");
  expect(await horizontalOverflow(page)).toBe(false);
});

test("account-menu unlock requires a password and rejects a wrong password without exposing Guardian content", async ({
  page,
}) => {
  await page.goto("/");
  const dialog = await openGuardianUnlock(page);
  const password = dialog.getByLabel("Password");
  const unlock = dialog.getByRole("button", { name: "Unlock guardian mode" });

  await unlock.click();
  await expect(password).toBeFocused();
  await expect(password).toHaveJSProperty("validity.valueMissing", true);
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toHaveCount(0);

  await password.fill("wrong-password");
  await unlock.click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "The password did not match this account.",
  );
  await expect(password).toBeFocused();
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toHaveCount(0);
});

test("direct Guardian unlock requires a password and rejects a wrong password without exposing the protected route", async ({
  page,
}) => {
  await page.goto("/guardian/stories");
  const main = page.getByRole("main");
  const password = main.getByLabel("Password");
  const unlock = main.getByRole("button", { name: "Unlock guardian mode" });

  await unlock.click();
  await expect(password).toBeFocused();
  await expect(password).toHaveJSProperty("validity.valueMissing", true);
  await expect(page).toHaveURL("/guardian/stories");
  await expect(
    page.getByRole("heading", { name: "Story settings" }),
  ).toHaveCount(0);

  await password.fill("wrong-password");
  await unlock.click();
  await expect(main.getByRole("alert")).toHaveText(
    "The password did not match this account.",
  );
  await expect(password).toBeFocused();
  await expect(page).toHaveURL("/guardian/stories");
  await expect(
    page.getByRole("heading", { name: "Story settings" }),
  ).toHaveCount(0);
});

test("the browser Guardian API rejects empty and wrong passwords with the same response", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /Profile for Mia, learner mode/ }),
  ).toBeVisible();

  const attempts = await page.evaluate(async () => {
    const results = [];
    for (const password of ["", "wrong-password"]) {
      const response = await fetch("/api/guardian-access", {
        body: JSON.stringify({ password }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      results.push({ body: await response.json(), status: response.status });
    }
    return results;
  });

  expect(attempts).toEqual([
    {
      body: {
        error: "invalid_password",
        message: "The password did not match this account.",
      },
      status: 401,
    },
    {
      body: {
        error: "invalid_password",
        message: "The password did not match this account.",
      },
      status: 401,
    },
  ]);
  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toHaveCount(0);
});

test("unlock request failure never navigates to guardian content", async ({
  page,
}) => {
  await page.goto(guardianUrl("/", "unlock-error"));
  const dialog = await openGuardianUnlock(page);
  await dialog.getByLabel("Password").fill(GUARDIAN_PASSWORD);
  await dialog.getByRole("button", { name: "Unlock guardian mode" }).click();

  await expect(dialog.getByRole("alert")).toHaveText(
    "Guardian access could not be checked. Please try again.",
  );
  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(guardianUrl("/", "unlock-error"));
});

test("successful unlock opens guardian management and announces the fifteen-minute window", async ({
  page,
}) => {
  await page.goto("/");
  await unlockFromMenu(page);

  await expect(page).toHaveURL("/guardian");
  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toBeFocused();
  await expect(
    page.getByRole("status").filter({
      hasText: "Guardian mode unlocked for 15 minutes",
    }),
  ).toHaveText("Guardian mode unlocked for 15 minutes");

  for (const heading of [
    "Manage learners",
    "Learning & content",
    "My Lessons",
    "Story settings",
    "Voice dubbing",
    "Account & privacy",
  ]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }

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

test("account-menu unlock resumes the current Guardian deep link", async ({
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
  await expect(
    page.getByRole("heading", { name: "Unlock guardian mode" }),
  ).toBeVisible();
  const historyLengthBeforeUnlock = await page.evaluate(
    () => window.history.length,
  );

  await unlockFromMenu(page);

  await expect(page).toHaveURL(requestedUrl);
  expect(await page.evaluate(() => window.history.length)).toBe(
    historyLengthBeforeUnlock,
  );
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
  test(`guardian grants and confirms revocation of lesson voice recordings at ${viewport.width}x${viewport.height}`, async ({
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
    await page.route((url) => url.pathname === "/api/profile", (route) =>
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

    await page.goto(
      guardianUrl("/guardian/learners/e2e-learner", "guardian"),
    );

    const account = page.getByRole("button", {
      name: "Profile for Alex Guardian, guardian mode",
    });
    const back = page.getByRole("button", { exact: true, name: "Back" });
    const consentSection = page.getByRole("region", {
      name: "Lesson voice recordings",
    });
    const grant = consentSection.getByRole("button", {
      name: "Allow lesson voice recordings",
    });
    const recordingState = consentSection.getByRole("status");
    await consentSection.scrollIntoViewIfNeeded();
    await expect(consentSection).toContainText(
      "Recording starts automatically during each join-in moment.",
    );
    await expect(consentSection).toContainText(
      "Permission and clips apply only to this learner profile",
    );
    await expect(consentSection).toContainText(
      "A Guardian manages each learner independently",
    );
    await expect(consentSection).toContainText(
      "one latest clip is saved per join-in moment",
    );
    await expect(recordingState).toHaveText(
      "Lesson recording is currently off.",
    );
    const initialRecordingStateBox = await visibleBox(recordingState);
    await expectInsideViewport(consentSection, viewport);
    await expectInsideViewport(grant, viewport);
    await expect(grant).toHaveAccessibleName("Allow lesson voice recordings");
    await expectNoOverlap(grant, account);
    await expectNoOverlap(grant, back);
    expect(await horizontalOverflow(page)).toBe(false);

    await grant.click();
    const revoke = consentSection.getByRole("button", {
      name: "Stop and delete lesson recordings",
    });
    await expect(revoke).toHaveAccessibleName(
      "Stop and delete lesson recordings",
    );
    await expect(recordingState).toHaveText(
      "Lesson recording is currently allowed.",
    );
    await expectInsideViewport(revoke, viewport);
    await expectNoOverlap(revoke, account);
    await expectNoOverlap(revoke, back);
    expect(mutations).toEqual([true]);

    page.once("dialog", async (dialog) => {
      expect(dialog.type()).toBe("confirm");
      expect(dialog.message()).toMatch(/delete all saved lesson voice recordings/i);
      await dialog.accept();
    });
    await revoke.click();

    const finishDeletion = consentSection.getByRole("button", {
      name: "Finish deleting lesson recordings",
    });
    await expect(finishDeletion).toHaveAccessibleName(
      "Finish deleting lesson recordings",
    );
    await expect(recordingState).toHaveText(
      "Lesson recording is off. Saved clips are still being deleted.",
    );
    const pendingRecordingStateBox = await visibleBox(recordingState);
    expect(
      Math.abs(
        pendingRecordingStateBox.height - initialRecordingStateBox.height,
      ),
    ).toBeLessThanOrEqual(1);
    await expectInsideViewport(finishDeletion, viewport);
    expect(await horizontalOverflow(page)).toBe(false);
    expect(mutations).toEqual([true, false]);

    await finishDeletion.click();
    await expect(grant).toHaveAccessibleName("Allow lesson voice recordings");
    await expect(recordingState).toHaveText(
      "Lesson recording is currently off.",
    );
    await expectInsideViewport(grant, viewport);
    expect(mutations).toEqual([true, false, false]);
  });
}

test("a locked guardian deep link never flashes protected content", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const inspected = new WeakSet<Node>();
    const inspect = (node: Node) => {
      if (inspected.has(node)) return;
      inspected.add(node);
      if (
        node instanceof HTMLHeadingElement &&
        node.textContent?.trim() === "Story settings"
      ) {
        (window as Window & { __protectedHeadingSeen?: boolean })
          .__protectedHeadingSeen = true;
      }
      node.childNodes.forEach(inspect);
    };
    document.addEventListener("DOMContentLoaded", () => {
      inspect(document.body);
      new MutationObserver((records) => {
        records.forEach((record) => record.addedNodes.forEach(inspect));
      }).observe(document.body, { childList: true, subtree: true });
    });
  });
  await page.goto("/guardian/stories");

  await expect(
    page.getByRole("heading", { name: "Unlock guardian mode" }),
  ).toBeVisible();
  await expect(page).toHaveURL("/guardian/stories");
  await expect(
    page.getByRole("heading", { name: "Story settings" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as Window & { __protectedHeadingSeen?: boolean })
          .__protectedHeadingSeen ?? false,
    ),
  ).toBe(false);
});

for (const { path, protectedName, seedEditLesson, unlockedPath } of [
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
  { path: "/guardian/lessons", protectedName: "My Lessons" },
  { path: "/guardian/stories", protectedName: "Story settings" },
  { path: "/guardian/dubbing", protectedName: "Voice dubbing" },
  {
    path: "/profile/setup?redo=1&returnTo=%2Fguardian",
    protectedName: "Update my profile",
  },
  { path: "/lessons/my/create", protectedName: "Create a custom lesson" },
  {
    path: "/lessons/my/boundary-fixture/edit",
    protectedName: "Edit Lesson",
    seedEditLesson: true,
  },
]) {
  test(`locked ${path} shows only the password gate`, async ({ page }) => {
    if (seedEditLesson) {
      await page.route("**/api/lessons/my/boundary-fixture", async (route) => {
        await route.fulfill({
          body: JSON.stringify({
            lesson: {
              id: "boundary-fixture",
              lesson: createLessonScript(),
              revision: "a".repeat(64),
              source: "generated",
            },
          }),
          contentType: "application/json",
          status: 200,
        });
      });
    }

    await page.addInitScript((expectedProtectedName) => {
      const inspected = new WeakSet<Node>();
      const inspect = (node: Node) => {
        if (inspected.has(node)) return;
        inspected.add(node);
        if (
          node instanceof HTMLHeadingElement &&
          node.textContent?.trim() === expectedProtectedName
        ) {
          (
            window as Window & { __protectedHeadingSeen?: boolean }
          ).__protectedHeadingSeen = true;
        }
        node.childNodes.forEach(inspect);
      };
      document.addEventListener("DOMContentLoaded", () => {
        inspect(document.body);
        new MutationObserver((records) => {
          records.forEach((record) => record.addedNodes.forEach(inspect));
        }).observe(document.body, { childList: true, subtree: true });
      });
    }, protectedName);

    const requestedUrl = guardianUrl(path, "learner");
    await page.goto(requestedUrl);

    await expect(
      page.getByRole("heading", { name: "Unlock guardian mode" }),
    ).toBeVisible();
    await expect(page).toHaveURL(requestedUrl);
    await expect(
      page.getByRole("heading", { name: protectedName }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () =>
          (window as Window & { __protectedHeadingSeen?: boolean })
            .__protectedHeadingSeen ?? false,
      ),
    ).toBe(false);

    await page.getByRole("main").getByLabel("Password").fill(GUARDIAN_PASSWORD);
    await page
      .getByRole("main")
      .getByRole("button", { name: "Unlock guardian mode" })
      .click();
    await expect(page).toHaveURL(unlockedPath ?? requestedUrl);
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
  await unlockFromMenu(page);
  await page.reload();

  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Profile for Alex Guardian, guardian mode/ }),
  ).toBeVisible();
});

test("a seeded guardian expiry stays fixed across refresh", async ({
  page,
}) => {
  await page.goto(guardianUrl("/", "guardian"));
  await expect(
    page.getByRole("button", { name: /Profile for Alex Guardian, guardian mode/ }),
  ).toBeVisible();
  const expiresAtBeforeRefresh = await page.evaluate(async () => {
    const response = await fetch("/api/guardian-access");
    const access = (await response.json()) as { expiresAt?: string };
    return access.expiresAt;
  });

  await page.reload();
  await expect(
    page.getByRole("button", { name: /Profile for Alex Guardian, guardian mode/ }),
  ).toBeVisible();

  const expiresAtAfterRefresh = await page.evaluate(async () => {
    const response = await fetch("/api/guardian-access");
    const access = (await response.json()) as { expiresAt?: string };
    return access.expiresAt;
  });
  expect(expiresAtBeforeRefresh).toBeTruthy();
  expect(expiresAtAfterRefresh).toBe(expiresAtBeforeRefresh);
});

test("an expired guardian session returns the same deep link to the password gate", async ({
  page,
}) => {
  await page.clock.install({
    time: new Date("2026-08-25T08:00:00.000Z"),
  });
  await page.goto(guardianUrl("/guardian/lessons", "expired"));
  await expect(page.getByRole("heading", { name: "My Lessons" })).toBeVisible();
  await page.evaluate(() => {
    window.history.pushState(null, "", "/guardian/stories");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.getByRole("heading", { name: "Story settings" }),
  ).toBeVisible();
  await page.clock.fastForward(2_000);
  await expect(
    page.getByRole("heading", { name: "Unlock guardian mode" }),
  ).toBeVisible();
  await expect(page).toHaveURL(
    "/guardian/stories?learnerProfileId=e2e-learner",
  );
  await expect(
    page.getByRole("heading", { name: "Story settings" }),
  ).toHaveCount(0);
});

test("failed dashboard lock preserves guardian content and navigation", async ({
  page,
}) => {
  const url = guardianUrl("/guardian", "lock-error");
  await page.goto(url);
  const dashboard = page.getByRole("heading", { name: "Guardian dashboard" });
  await expect(dashboard).toBeVisible();

  await page.getByRole("button", { name: "Switch to learner" }).click();

  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    LOCK_ERROR,
  );
  await expect(dashboard).toBeVisible();
  await expect(page).toHaveURL(url);
});

test("failed learner-boundary lock preserves the requested learner route", async ({
  page,
}) => {
  const url = guardianUrl("/lessons", "lock-error");
  await page.goto(url);
  const boundary = page.getByRole("heading", {
    name: "Switch to learner mode",
  });
  await expect(boundary).toBeVisible();

  await page.getByRole("button", { name: "Switch to learner mode" }).click();

  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    LOCK_ERROR,
  );
  await expect(boundary).toBeVisible();
  await expect(page).toHaveURL(url);
});

test("successful lock returns to learner home before exposing activities", async ({
  page,
}) => {
  await page.goto(guardianUrl("/guardian", "guardian"));
  await page.getByRole("button", { name: "Switch to learner" }).click();

  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("navigation", { name: "Learning activities" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Profile for Mia, learner mode/ }),
  ).toBeVisible();
});

test("locking guardian access in one tab immediately hides guardian UI in a sibling tab", async ({
  page,
}) => {
  const url = guardianUrl("/guardian", "guardian");
  const sibling = await page.context().newPage();
  try {
    await Promise.all([page.goto(url), sibling.goto(url)]);
    await expect(
      page.getByRole("heading", { name: "Guardian dashboard" }),
    ).toBeVisible();
    await expect(
      sibling.getByRole("heading", { name: "Guardian dashboard" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Switch to learner" }).click();

    await expect(
      sibling.getByRole("heading", { name: "Unlock guardian mode" }),
    ).toBeVisible();
    await expect(
      sibling.getByRole("heading", { name: "Guardian dashboard" }),
    ).toHaveCount(0);
  } finally {
    await sibling.close();
  }
});

test("cancel and Escape restore focus while account-menu keys follow rendered items", async ({
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
  const dialog = page.getByRole("dialog", { name: "Unlock guardian mode" });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(guardian).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();

  await trigger.click();
  const tabMenu = page.getByRole("menu", { name: "Account menu" });
  await expect(
    tabMenu.getByRole("menuitem", { name: /Grown-up access/ }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(tabMenu).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Play a lesson" })).toBeFocused();

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
      "Grown-up accessAccount password required",
    ]);
    await expect(
      page.getByRole("group", { name: "Choose profile mode" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /Create custom lesson|Edit lesson/ }),
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
      await page.getByRole("button", { name: "Continue dubbing" }).click();
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
    await expect(status).toHaveText("Voices are joining in");
    for (const element of [
      profile,
      back,
      hud,
      speech,
      phrase,
      status,
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
