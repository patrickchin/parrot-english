import { expect, test, type Page } from "@playwright/test";

const GUARDIAN_NAME = "Alex Guardian";

type LearnerScenario =
  | "held-identity"
  | "multiple"
  | "selection-required"
  | "zero-learners";

function scenarioUrl(
  path: string,
  scenario: LearnerScenario = "multiple",
  guardian: "guardian" | "learner" = "guardian",
) {
  const url = new URL(path, "http://parrot-e2e.invalid");
  url.searchParams.set("parrotE2eGuardian", guardian);
  url.searchParams.set("parrotE2eLearners", scenario);
  return `${url.pathname}${url.search}${url.hash}`;
}

async function expectActiveLearner(
  page: Page,
  learnerProfileId = "learner-mia",
) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __parrotE2eLearners?: {
                snapshot(): { activeProfileId: string | null };
              };
            }
          ).__parrotE2eLearners?.snapshot().activeProfileId,
      ),
    )
    .toBe(learnerProfileId);
}

test("Guardian dashboard exposes two clear management destinations", async ({
  page,
}) => {
  await page.goto(scenarioUrl("/guardian"));
  await expect(
    page.getByRole("button", {
      name: `Profile for ⁨${GUARDIAN_NAME}⁩, guardian mode`,
    }),
  ).toBeVisible();

  const dashboard = page.getByRole("main");
  await expect(dashboard.getByRole("heading", { level: 1 })).toHaveText([
    "Guardian dashboard",
  ]);
  for (const heading of ["Learner profiles", "Account & privacy"]) {
    await expect(
      dashboard.getByRole("heading", { exact: true, level: 2, name: heading }),
    ).toBeVisible();
  }
  await expect(dashboard.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(
    dashboard.getByRole("link", { exact: true, name: "Manage learners" }),
  ).toBeVisible();
  await expect(
    dashboard.getByRole("link", {
      exact: true,
      name: "Open account & privacy",
    }),
  ).toBeVisible();
  await expect(
    dashboard.getByRole("heading", { exact: true, name: "Voice dubbing" }),
  ).toHaveCount(0);
  await expect(dashboard.getByLabel("Technical build details")).toHaveCount(0);
  await expect(
    dashboard.getByRole("button", { exact: true, name: "Delete account" }),
  ).toHaveCount(0);
  await expectActiveLearner(page);
});

test("Guardian management routes render focused standalone pages", async ({
  page,
}) => {
  for (const { heading, path } of [
    {
      heading: "Manage learners",
      path: "/guardian/learners",
    },
    {
      heading: "Voice dubbing",
      path: "/guardian/dubbing",
    },
    {
      heading: "Account & privacy",
      path: "/guardian/account",
    },
  ]) {
    await page.goto(scenarioUrl(path));
    await expect.poll(() => new URL(page.url()).pathname).toBe(path);
    expect(new URL(page.url()).hash).toBe("");
    const pageHeading = page.getByRole("heading", {
      exact: true,
      level: 1,
      name: heading,
    });
    await expect(pageHeading).toBeVisible();
    await expect(pageHeading).toBeFocused();
    await expect(
      page.getByRole("link", {
        name: /Back to guardian dashboard/i,
      }),
    ).toBeVisible();
    const directRoute = new URL(page.url());
    expect(directRoute.searchParams.get("parrotE2eGuardian")).toBe("guardian");
    expect(directRoute.searchParams.get("parrotE2eLearners")).toBe("multiple");
  }
});

test("Guardian navigation moves focus between distinct pages", async ({
  page,
}) => {
  await page.goto(scenarioUrl("/guardian"));
  const manageLearnersLink = page.getByRole("link", {
    exact: true,
    name: "Manage learners",
  });
  await expect(manageLearnersLink).toBeVisible();
  await manageLearnersLink.click();

  const manageLearnersHeading = page.getByRole("heading", {
    exact: true,
    level: 1,
    name: "Manage learners",
  });
  await expect(page).toHaveURL("/guardian/learners");
  await expect(manageLearnersHeading).toBeInViewport();
  await expect(manageLearnersHeading).toBeFocused();

  await page
    .getByRole("link", {
      name: /Back to guardian dashboard/i,
    })
    .click();

  const dashboardHeading = page.getByRole("heading", {
    exact: true,
    level: 1,
    name: "Guardian dashboard",
  });
  await expect(page).toHaveURL("/guardian");
  await expect(dashboardHeading).toBeInViewport();
  await expect(dashboardHeading).toBeFocused();
});

test("delayed dashboard readiness preserves an open Account menu", async ({
  page,
}) => {
  await page.goto(scenarioUrl("/guardian", "held-identity"));
  await expect(
    page.getByRole("heading", { name: "Checking the current learner" }),
  ).toBeVisible();

  await page
    .getByRole("button", {
      name: `Profile for ⁨${GUARDIAN_NAME}⁩, guardian mode`,
    })
    .click();
  const menu = page.getByRole("menu", { name: "Account menu" });
  const language = page
    .getByRole("dialog", { name: "Account menu" })
    .getByRole("button", {
      exact: true,
      name: "English",
    });
  await expect(language).toBeFocused();

  expect(
    await page.evaluate(
      () =>
        (
          window as Window & {
            __parrotE2eLearners?: {
              releaseHeldLearnerProfileLoads(): boolean;
            };
          }
        ).__parrotE2eLearners?.releaseHeldLearnerProfileLoads() ?? false,
    ),
  ).toBe(true);

  await expect(
    page.getByRole("heading", { exact: true, name: "Guardian dashboard" }),
  ).toBeVisible();
  await expect(menu).toBeVisible();
  await expect(language).toBeFocused();
});

test("Account and privacy keeps private voice-clip management reachable", async ({
  page,
}) => {
  await page.goto(scenarioUrl("/guardian/account"));
  await page
    .getByRole("link", { exact: true, name: "Manage saved clips" })
    .click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(
    "/guardian/dubbing",
  );
  await expect(
    page.getByRole("heading", { exact: true, level: 1, name: "Voice dubbing" }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Choose learner settings target" }),
  ).toBeVisible();
});

test("direct learner details keep the URL target separate from learner mode and recover invalid IDs", async ({
  page,
}) => {
  await page.goto(scenarioUrl("/guardian/learners/learner-noah"));
  await expect(
    page.getByRole("heading", { exact: true, name: "Learner details" }),
  ).toBeVisible();
  await expect(page.getByText("Managing Noah", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(
    /\/guardian\/learners\/learner-noah\?.*parrotE2eLearners=multiple/,
  );
  await expectActiveLearner(page);
  await page.getByRole("button", { exact: true, name: "Back" }).click();
  await expect(page).toHaveURL("/guardian/learners");

  await page.goto(scenarioUrl("/guardian/learners/unknown-learner"));
  await expect(
    page.getByRole("heading", {
      exact: true,
      name: "Learner details are taking a break",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { exact: true, name: "Back to Manage learners" }),
  ).toBeVisible();
  await expectActiveLearner(page);

  await page.goto(scenarioUrl("/guardian/learners/%20"));
  await expect(page).toHaveURL("/guardian/learners");
  await expect(
    page.getByRole("heading", { exact: true, name: "Manage learners" }),
  ).toBeVisible();
});

test("the retired Guardian profile route replaces history with Manage learners", async ({
  page,
}) => {
  await page.goto(scenarioUrl("/guardian"));
  await page.goto(scenarioUrl("/guardian/profile?returnTo=%2Fguardian"));
  await expect(page).toHaveURL("/guardian/learners");
  await expect(
    page.getByRole("heading", { exact: true, name: "Manage learners" }),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/guardian\?.*parrotE2eLearners=multiple/);
  await expect(
    page.getByRole("heading", { exact: true, name: "Guardian dashboard" }),
  ).toBeVisible();
});

test("learner-targeted dubbing settings default cleanly and reject duplicate or unknown targets", async ({
  page,
}) => {
  await page.goto(scenarioUrl("/guardian/dubbing"));
  await expect.poll(() => new URL(page.url()).pathname).toBe(
    "/guardian/dubbing",
  );
  const defaultTarget = new URL(page.url());
  expect(defaultTarget.hash).toBe("");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("learnerProfileId"))
    .toBe("learner-mia");
  await expect(
    page.getByText("Editing settings for ⁨Mia⁩", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Editing settings for ⁨Mia⁩", { exact: true }),
  ).toBeVisible();

  for (const path of [
    "/guardian/dubbing?learnerProfileId=learner-mia&learnerProfileId=learner-noah",
    "/guardian/dubbing?learnerProfileId=unknown-learner",
  ]) {
    await page.goto(scenarioUrl(path));
    await expect(
      page.getByRole("main").getByRole("alert").filter({
        hasText: "The learner target in this page link could not be found.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { exact: true, name: "Manage learners" }),
    ).toBeVisible();
    await expectActiveLearner(page);
  }
});

test("learner routes recover progress, invalid story and lesson details, and wildcard history", async ({
  page,
}) => {
  await page.goto(scenarioUrl("/lessons", "multiple", "learner"));
  await page.evaluate(() => {
    window.history.pushState(null, "", "/progress");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("navigation", { name: "Learning activities" }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/lessons\?.*parrotE2eGuardian=learner/);

  await page.goto(scenarioUrl("/profile", "multiple", "learner"));
  await expect(
    page.getByRole("heading", { exact: true, name: "Learner details" }),
  ).toBeVisible();
  await page.evaluate(() => fetch("/api/guardian-access", { method: "DELETE" }));
  await page.goto(scenarioUrl("/", "multiple", "learner"));
  await expect(page).toHaveURL(/\/\?.*parrotE2eGuardian=learner/);
  await expect(
    page.getByRole("navigation", { name: "Learning activities" }),
  ).toBeVisible();

  await page.goto(scenarioUrl("/stories/not-a-story", "multiple", "learner"));
  await expect(page).toHaveURL("/stories");
  await expect(
    page.getByRole("heading", { exact: true, name: "Pick a story" }),
  ).toBeVisible();

  await page.goto(
    scenarioUrl(
      "/stories/the-red-ball/pages/not-a-page",
      "multiple",
      "learner",
    ),
  );
  await expect(page).toHaveURL("/stories/the-red-ball/pages/1");
  await expect(
    page.getByRole("region", { exact: true, name: "Story reader" }),
  ).toBeVisible();
  await page
    .getByRole("link", { exact: true, name: "Back to stories" })
    .click();
  await expect(page).toHaveURL("/stories?level=first-words");

  await page.goto(scenarioUrl("/not-a-route", "multiple", "learner"));
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("navigation", { name: "Learning activities" }),
  ).toBeVisible();
});

test("Guardian wildcard and account gates recover without selecting a learner", async ({
  page,
}) => {
  await page.goto(scenarioUrl("/guardian/not-a-route"));
  await expect(page).toHaveURL("/guardian");
  await expect(
    page.getByRole("heading", { exact: true, name: "Guardian dashboard" }),
  ).toBeVisible();

  await page.goto(
    scenarioUrl("/guardian/account", "selection-required", "learner"),
  );
  await expect(
    page.getByRole("heading", { exact: true, name: "Account & privacy" }),
  ).toBeVisible();
  await expect.poll(() => new URL(page.url()).pathname).toBe(
    "/guardian/account",
  );
  expect(new URL(page.url()).hash).toBe("");

  await page.goto(scenarioUrl("/guardian/account", "zero-learners"));
  await expect(
    page.getByRole("heading", { exact: true, name: "Account & privacy" }),
  ).toBeVisible();
  const roster = await page.evaluate(async () => {
    const response = await fetch("/api/learner-profiles");
    return response.json() as Promise<{
      activeProfileId: string | null;
      profiles: unknown[];
    }>;
  });
  expect(roster).toEqual({ activeProfileId: null, profiles: [] });
  await expect(
    page.getByRole("link", { exact: true, name: "Manage saved clips" }),
  ).toBeVisible();
});

test("Guardian menu follows its exact native Tab order and restores focus on Escape", async ({
  page,
}) => {
  await page.goto(scenarioUrl("/guardian"));
  const trigger = page.getByRole("button", {
    name: `Profile for ⁨${GUARDIAN_NAME}⁩, guardian mode`,
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Account menu" });
  const items = menu.getByRole("menuitem");
  const language = page
    .getByRole("dialog", { name: "Account menu" })
    .getByRole("group", { name: "Guardian guidance language" });
  const english = language.getByRole("button", {
    exact: true,
    name: "English",
  });
  const chinese = language.getByRole("button", {
    exact: true,
    name: "中文",
  });
  await expect(items).toHaveText([
    "Guardian dashboard",
    "Sign out",
  ]);

  const controls = [english, chinese, ...(await items.all())];
  for (let index = 0; index < controls.length; index += 1) {
    await expect(controls[index]).toBeFocused();
    if (index < controls.length - 1) await page.keyboard.press("Tab");
  }

  await page.keyboard.press("Tab");
  await expect(menu).toHaveCount(0);
  const nextPageControl = page.getByRole("button", {
    exact: true,
    name: "Switch to learner",
  });
  await expect(nextPageControl).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(english).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Account menu" })).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
