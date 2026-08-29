import { expect, test, type Page } from "@playwright/test";

const GUARDIAN_NAME = "Alex Guardian";
const GUARDIAN_PASSWORD = "e2e-guardian-password";

type LearnerScenario = "multiple" | "selection-required" | "zero-learners";

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

async function expectActiveLearner(page: Page, learnerProfileId = "learner-mia") {
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

function dashboardCard(page: Page, heading: string) {
  const title = page.getByRole("heading", { exact: true, name: heading });
  return title.locator("xpath=ancestor::*[@aria-labelledby][1]");
}

async function traverseDashboardAction(
  page: Page,
  actionName: string,
  destination: RegExp,
  headingName: string,
  backName: string,
) {
  await page.getByRole("link", { exact: true, name: actionName }).click();
  await expect(page).toHaveURL(destination);
  await expect(
    page.getByRole("heading", { exact: true, name: headingName }),
  ).toBeVisible();
  await page.getByRole("link", { exact: true, name: backName }).click();
  await expect(page).toHaveURL("/guardian");
  await expect(
    page.getByRole("heading", { exact: true, name: "Guardian dashboard" }),
  ).toBeVisible();
}

test("every Guardian dashboard card associates its copy and traverses through its Back action", async ({
  page,
}) => {
  await page.goto(scenarioUrl("/guardian"));
  await expect(
    page.getByRole("button", {
      name: `Profile for ${GUARDIAN_NAME}, guardian mode`,
    }),
  ).toBeVisible();

  for (const { action, description, heading } of [
    {
      action: "Manage learners",
      description:
        "Add, edit, or delete learner profiles. You’ll choose a learner when switching to learner mode.",
      heading: "Manage learners",
    },
    {
      action: "Manage lessons",
      description: "Create or delete custom lessons for the learner.",
      heading: "My Lessons",
    },
    {
      action: "Open story settings",
      description: "Choose the story level and personalized story options.",
      heading: "Story settings",
    },
    {
      action: "Manage voice dubbing",
      description:
        "Allow private voice clips or turn dubbing off and remove them.",
      heading: "Voice dubbing",
    },
    {
      action: "Open account & privacy",
      description:
        "Review how AI is used, what Parrot saves, and account deletion controls.",
      heading: "Account & privacy",
    },
  ]) {
    const card = dashboardCard(page, heading);
    await expect(card, `${heading} card`).toHaveCount(1);
    await expect(card).toContainText(description);
    await expect(card.getByRole("link", { exact: true, name: action })).toBeVisible();
  }

  const cardColors = await Promise.all(
    [
      "Manage learners",
      "My Lessons",
      "Story settings",
      "Voice dubbing",
      "Account & privacy",
    ].map((heading) =>
      dashboardCard(page, heading).evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    ),
  );
  expect(new Set(cardColors).size).toBe(cardColors.length);

  await traverseDashboardAction(
    page,
    "Manage learners",
    /\/guardian\/learners$/,
    "Manage learners",
    "Back to guardian dashboard",
  );
  await traverseDashboardAction(
    page,
    "Manage lessons",
    /\/guardian\/lessons\?learnerProfileId=learner-mia$/,
    "My Lessons",
    "Back to guardian dashboard",
  );
  await traverseDashboardAction(
    page,
    "Open story settings",
    /\/guardian\/stories\?learnerProfileId=learner-mia$/,
    "Story settings",
    "Back to guardian dashboard",
  );
  await traverseDashboardAction(
    page,
    "Manage voice dubbing",
    /\/guardian\/dubbing\?learnerProfileId=learner-mia$/,
    "Voice dubbing",
    "Back to guardian dashboard",
  );
  await traverseDashboardAction(
    page,
    "Open account & privacy",
    /\/guardian\/account$/,
    "Account & privacy",
    "Back to Guardian dashboard",
  );
  await expectActiveLearner(page);
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
  await page.goto(
    scenarioUrl("/guardian/profile?returnTo=%2Fguardian"),
  );
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

test("the removed lesson edit URL falls back to the guardian dashboard", async ({
  page,
}) => {
  await page.goto(scenarioUrl("/lessons/my/old-lesson/edit"));
  await expect(page).toHaveURL("/guardian");
  await expect(
    page.getByRole("heading", { exact: true, name: "Guardian dashboard" }),
  ).toBeVisible();
});

test("setting routes normalize only a missing target and reject blank duplicate or unknown targets", async ({
  page,
}) => {
  await page.goto(scenarioUrl("/guardian/lessons"));
  await expect(page).toHaveURL(
    /\/guardian\/lessons\?.*learnerProfileId=learner-mia/,
  );
  await expect(
    page.getByText("Editing settings for Mia", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Editing settings for Mia", { exact: true }),
  ).toBeVisible();

  for (const path of [
    "/guardian/lessons?learnerProfileId=",
    "/guardian/stories?learnerProfileId=learner-mia&learnerProfileId=learner-noah",
    "/guardian/dubbing?learnerProfileId=unknown-learner",
  ]) {
    await page.goto(scenarioUrl(path));
    await expect(
      page
        .getByRole("main")
        .getByRole("alert")
        .filter({
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
    page.getByRole("heading", { exact: true, name: "Unlock guardian mode" }),
  ).toBeVisible();
  await page.getByRole("main").getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL("/");
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
  await page.getByRole("link", { exact: true, name: "Back to stories" }).click();
  await expect(page).toHaveURL("/stories");

  await page.goto(
    scenarioUrl("/lessons/my/not-a-lesson", "multiple", "learner"),
  );
  await expect(
    page.getByRole("heading", {
      exact: true,
      name: "We couldn’t open that lesson",
    }),
  ).toBeVisible();
  await page.getByRole("link", { exact: true, name: "Back to lessons" }).click();
  await expect(page).toHaveURL("/lessons");

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
    page.getByRole("heading", { exact: true, name: "Unlock guardian mode" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { exact: true, name: "Account & privacy" }),
  ).toHaveCount(0);
  await page.getByRole("main").getByLabel("Password").fill(GUARDIAN_PASSWORD);
  await page
    .getByRole("main")
    .getByRole("button", { exact: true, name: "Unlock guardian mode" })
    .click();
  await expect(page).toHaveURL(/\/guardian\/account/);
  await expect(
    page.getByRole("heading", { exact: true, name: "Account & privacy" }),
  ).toBeVisible();

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
  await page
    .getByRole("link", { exact: true, name: "Back to Guardian dashboard" })
    .click();
  await expect(page).toHaveURL("/guardian/learners");
  await expect(
    page.getByRole("heading", { exact: true, name: "Manage learners" }),
  ).toBeVisible();
});

test("Guardian menu follows its exact native Tab order and restores focus on Escape", async ({
  page,
}) => {
  await page.goto(scenarioUrl("/guardian"));
  const trigger = page.getByRole("button", {
    name: `Profile for ${GUARDIAN_NAME}, guardian mode`,
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Account menu" });
  const items = menu.getByRole("menuitem");
  await expect(items).toHaveText([
    "Guardian dashboard",
    "Manage learners",
    "Account & privacy",
    "Sign out",
  ]);

  for (const name of [
    "Guardian dashboard",
    "Manage learners",
    "Account & privacy",
    "Sign out",
  ]) {
    await expect(
      menu.getByRole("menuitem", { exact: true, name }),
    ).toBeFocused();
    if (name !== "Sign out") await page.keyboard.press("Tab");
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
  await expect(
    page
      .getByRole("menu", { name: "Account menu" })
      .getByRole("menuitem", { exact: true, name: "Guardian dashboard" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Account menu" })).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
