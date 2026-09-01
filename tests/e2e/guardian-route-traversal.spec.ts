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

test("Guardian dashboard exposes all management controls without destination links", async ({
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
  for (const heading of [
    "Manage learners",
    "Voice dubbing",
    "Account & privacy",
  ]) {
    await expect(
      dashboard.getByRole("heading", { exact: true, level: 2, name: heading }),
    ).toBeVisible();
  }
  await expect(
    dashboard.getByRole("button", { name: "Add learner" }),
  ).toBeVisible();
  await expect(
    dashboard.getByRole("group", { name: "Choose learner settings target" }),
  ).toBeVisible();
  await expect(dashboard.getByLabel("Technical build details")).toBeVisible();
  await expect(
    dashboard.getByRole("button", { exact: true, name: "Delete account" }),
  ).toBeVisible();
  for (const retiredLink of [
    "Manage learners",
    "Manage voice dubbing",
    "Open account & privacy",
  ]) {
    await expect(
      dashboard.getByRole("link", { exact: true, name: retiredLink }),
    ).toHaveCount(0);
  }
  await expectActiveLearner(page);
});

test("legacy Guardian management routes redirect to dashboard sections", async ({
  page,
}) => {
  for (const { heading, path, section } of [
    {
      heading: "Manage learners",
      path: "/guardian/learners",
      section: "learner-profiles",
    },
    {
      heading: "Voice dubbing",
      path: "/guardian/dubbing",
      section: "voice-dubbing",
    },
    {
      heading: "Account & privacy",
      path: "/guardian/account",
      section: "account-privacy",
    },
  ]) {
    await page.goto(scenarioUrl(path));
    await expect
      .poll(() => {
        const url = new URL(page.url());
        return `${url.pathname}${url.hash}`;
      })
      .toBe(`/guardian#${section}`);
    await expect(
      page.getByRole("heading", {
        exact: true,
        level: 1,
        name: "Guardian dashboard",
      }),
    ).toBeVisible();
    const sectionHeading = page.getByRole("heading", {
      exact: true,
      level: 2,
      name: heading,
    });
    await expect(sectionHeading).toBeVisible();
    await expect(sectionHeading).toBeInViewport();
    await expect(sectionHeading).toBeFocused();
    const redirected = new URL(page.url());
    expect(redirected.searchParams.get("parrotE2eGuardian")).toBe("guardian");
    expect(redirected.searchParams.get("parrotE2eLearners")).toBe("multiple");
  }
});

test("same-page Guardian navigation moves focus with the visible section", async ({
  page,
}) => {
  await page.goto(
    scenarioUrl("/guardian/dubbing?learnerProfileId=unknown-learner"),
  );
  const manageLearnersLink = page.getByRole("link", {
    exact: true,
    name: "Manage learners",
  });
  await expect(manageLearnersLink).toBeVisible();
  await manageLearnersLink.click();

  const manageLearnersHeading = page.getByRole("heading", {
    exact: true,
    level: 2,
    name: "Manage learners",
  });
  await expect(page).toHaveURL("/guardian#learner-profiles");
  await expect(manageLearnersHeading).toBeInViewport();
  await expect(manageLearnersHeading).toBeFocused();

  await page
    .getByRole("button", {
      name: `Profile for ⁨${GUARDIAN_NAME}⁩, guardian mode`,
    })
    .click();
  await page
    .getByRole("menuitem", { exact: true, name: "Guardian dashboard" })
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
  const dashboardItem = menu.getByRole("menuitem", {
    exact: true,
    name: "Guardian dashboard",
  });
  await expect(dashboardItem).toBeFocused();

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
  await expect(dashboardItem).toBeFocused();
});

test("a reconciled learner creation refreshes inline dubbing targets", async ({
  page,
}) => {
  await page.goto(scenarioUrl("/guardian"));
  await expect(
    page.getByRole("group", { name: "Choose learner settings target" }),
  ).toBeVisible();
  await page.evaluate(() => {
    const originalFetch = window.fetch;
    let loseNextCreateResponse = true;
    window.fetch = async (input, init) => {
      const request = input instanceof Request ? input : null;
      const source =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const url = new URL(source, window.location.href);
      const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
      if (
        loseNextCreateResponse &&
        url.pathname === "/api/learner-profiles" &&
        method === "POST"
      ) {
        loseNextCreateResponse = false;
        const response = await originalFetch(input, init);
        if (response.ok) {
          return Response.json(
            {
              error: "create_response_lost",
              message: "The learner could not be added.",
            },
            { status: 503 },
          );
        }
        return response;
      }
      return originalFetch(input, init);
    };
  });

  await page.getByLabel("Preferred name").fill("Rose");
  await page.getByRole("button", { exact: true, name: "Add learner" }).click();

  await expect(
    page.getByRole("heading", { exact: true, level: 3, name: "Rose" }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "The learner could not be added.",
  );
  await expect(
    page
      .getByRole("group", { name: "Choose learner settings target" })
      .getByRole("button", { exact: true, name: "⁨Rose⁩" }),
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
  await expect(page).toHaveURL("/guardian#learner-profiles");

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
  await expect(page).toHaveURL("/guardian#learner-profiles");
  await expect(
    page.getByRole("heading", { exact: true, name: "Manage learners" }),
  ).toBeVisible();
});

test("the retired Guardian profile route replaces history with Manage learners", async ({
  page,
}) => {
  await page.goto(scenarioUrl("/guardian"));
  await page.goto(scenarioUrl("/guardian/profile?returnTo=%2Fguardian"));
  await expect(page).toHaveURL("/guardian#learner-profiles");
  await expect(
    page.getByRole("heading", { exact: true, name: "Manage learners" }),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/guardian\?.*parrotE2eLearners=multiple/);
  await expect(
    page.getByRole("heading", { exact: true, name: "Guardian dashboard" }),
  ).toBeVisible();
});

test("learner-targeted dashboard settings default cleanly and reject duplicate or unknown targets", async ({
  page,
}) => {
  await page.goto(scenarioUrl("/guardian/dubbing"));
  await expect.poll(() => new URL(page.url()).hash).toBe("#voice-dubbing");
  const defaultTarget = new URL(page.url());
  expect(defaultTarget.pathname).toBe("/guardian");
  expect(defaultTarget.searchParams.get("learnerProfileId")).toBeNull();
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
  await expect.poll(() => new URL(page.url()).hash).toBe("#account-privacy");

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
    page.getByRole("heading", { exact: true, name: "Manage learners" }),
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
