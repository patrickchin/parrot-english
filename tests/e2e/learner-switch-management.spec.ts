import { expect, test, type Page } from "@playwright/test";

type LearnerController = {
  failNextLearnerDelete(): void;
  failNextLearnerRosterLoad(): void;
  snapshot(): {
    activeProfileId: string | null;
    profiles: Array<{
      deletionPending: boolean;
      id: string;
      name: string;
    }>;
  };
};

function scenarioUrl(
  path: string,
  learnerScenario: "multiple" | "selection-required" | "zero-learners" =
    "multiple",
) {
  const url = new URL(path, "http://parrot-e2e.invalid");
  url.searchParams.set("parrotE2eGuardian", "guardian");
  url.searchParams.set("parrotE2eLearners", learnerScenario);
  return `${url.pathname}${url.search}`;
}

function learnerCard(page: Page, name: string) {
  return page.getByRole("listitem").filter({
    has: page.getByRole("heading", { name, exact: true }),
  });
}

async function readLearnerState(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Boolean(
            (window as Window & { __parrotE2eLearners?: LearnerController })
              .__parrotE2eLearners,
          ),
      ),
    )
    .toBe(true);
  return page.evaluate(() => {
    const controller = (
      window as Window & { __parrotE2eLearners?: LearnerController }
    ).__parrotE2eLearners;
    if (!controller) throw new Error("Learner controller is unavailable.");
    return controller.snapshot();
  });
}

async function deleteLearner(page: Page, name: string) {
  const card = learnerCard(page, name);
  const trigger = card.getByRole("button", { name: `Delete ${name}` });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: `Delete ${name}?` });
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog.getByRole("button", { name: `Delete ${name}` }).click();
  return { dialog, trigger };
}

async function openLearnerChooser(page: Page) {
  const trigger = page.getByRole("button", {
    name: "Switch to learner",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Who is learning now?" });
  await expect(dialog).toBeVisible();
  return { dialog, trigger };
}

test("Manage learners is CRUD-only and deletion of an inactive learner persists", async ({
  page,
}) => {
  await page.goto(scenarioUrl("/guardian/learners"));
  const main = page.getByRole("main");

  await expect(main.getByRole("heading", { name: "Manage learners" })).toBeVisible();
  await expect(
    main.getByText("Add, update, or remove learner profiles.", { exact: true }),
  ).toHaveCount(0);
  await expect(main.getByRole("radio")).toHaveCount(0);
  await expect(main.getByRole("button", { name: /Use .* learner mode/ })).toHaveCount(0);
  await expect(main).not.toContainText(/Learner mode|Current learner|Managing /);

  const { dialog } = await deleteLearner(page, "Noah");
  await expect(dialog).toHaveCount(0);
  await expect(learnerCard(page, "Noah")).toHaveCount(0);
  await expect(learnerCard(page, "Mia")).toBeVisible();
  expect(await readLearnerState(page)).toMatchObject({
    activeProfileId: "learner-mia",
    profiles: [{ id: "learner-mia" }],
  });

  const finalDelete = learnerCard(page, "Mia").getByRole("button", {
    name: "Delete Mia",
  });
  await expect(finalDelete).toBeDisabled();
  await expect(learnerCard(page, "Mia")).toContainText(
    "Add another learner before deleting Mia.",
  );
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const response = await fetch("/api/learner-profiles/learner-mia", {
          method: "DELETE",
        });
        return { body: await response.json(), status: response.status };
      }),
    )
    .toEqual({ body: { error: "last_learner" }, status: 409 });
  expect(await readLearnerState(page)).toMatchObject({
    activeProfileId: "learner-mia",
    profiles: [{ id: "learner-mia" }],
  });
  await page.reload();
  await expect(learnerCard(page, "Noah")).toHaveCount(0);
  await expect(finalDelete).toBeDisabled();
});

test("deleting the active learner never chooses its sibling automatically", async ({
  page,
}) => {
  await page.goto(scenarioUrl("/guardian/learners"));
  const { dialog } = await deleteLearner(page, "Mia");
  await expect(dialog).toHaveCount(0);
  await expect(learnerCard(page, "Mia")).toHaveCount(0);
  await expect(learnerCard(page, "Noah")).toBeVisible();
  expect(await readLearnerState(page)).toMatchObject({ activeProfileId: null });

  await page.getByRole("link", { name: "Back to guardian dashboard" }).click();
  const chooser = await openLearnerChooser(page);
  const start = chooser.dialog.getByRole("button", {
    name: "Start learner mode as ⁨Noah⁩",
  });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("button", { name: /Profile for Noah, learner mode/ }),
  ).toBeVisible();
});

test("pending learner deletion survives refresh, stays out of the chooser, and retries the same learner", async ({
  page,
}) => {
  await page.goto(scenarioUrl("/guardian/learners"));
  await readLearnerState(page);
  await page.evaluate(() => {
    const controller = (
      window as Window & { __parrotE2eLearners?: LearnerController }
    ).__parrotE2eLearners;
    if (!controller) throw new Error("Learner controller is unavailable.");
    controller.failNextLearnerDelete();
  });

  const { dialog } = await deleteLearner(page, "Noah");
  await expect(dialog.getByRole("alert")).toContainText(
    "Learner cleanup is still in progress. Try again.",
  );
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(
    learnerCard(page, "Noah").getByRole("button", {
      name: "Finish deleting Noah",
    }),
  ).toBeVisible();
  expect(await readLearnerState(page)).toMatchObject({
    activeProfileId: "learner-mia",
    profiles: [
      { deletionPending: false, id: "learner-mia" },
      { deletionPending: true, id: "learner-noah" },
    ],
  });

  await page.getByRole("link", { name: "Back to guardian dashboard" }).click();
  const chooser = await openLearnerChooser(page);
  await expect(
    chooser.dialog.getByRole("button", { name: "Start learner mode as ⁨Mia⁩" }),
  ).toBeVisible();
  await expect(chooser.dialog.getByText("Noah", { exact: true })).toHaveCount(0);
  await chooser.dialog.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: /Profile for Alex Guardian/ }).click();
  await page
    .getByRole("menu", { name: "Account menu" })
    .getByRole("menuitem", { name: "Manage learners" })
    .click();
  await page.reload();
  const pending = learnerCard(page, "Noah").getByRole("button", {
    name: "Finish deleting Noah",
  });
  await page.getByRole("link", { name: "Back to guardian dashboard" }).click();
  const refreshedChooser = await openLearnerChooser(page);
  await expect(
    refreshedChooser.dialog.getByRole("button", {
      name: "Start learner mode as ⁨Mia⁩",
    }),
  ).toBeVisible();
  await expect(
    refreshedChooser.dialog.getByText("Noah", { exact: true }),
  ).toHaveCount(0);
  await refreshedChooser.dialog.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("link", { name: "Manage learners", exact: true }).click();
  await expect(pending).toBeVisible();
  await pending.click();
  const retry = page.getByRole("dialog", { name: "Delete Noah?" });
  await retry.getByRole("button", { name: "Delete Noah" }).click();
  await expect(retry).toHaveCount(0);
  await expect(learnerCard(page, "Noah")).toHaveCount(0);
});

test("chooser cancellation and Escape restore focus without changing learner state", async ({
  page,
}) => {
  await page.goto(scenarioUrl("/guardian"));
  const before = await readLearnerState(page);
  const first = await openLearnerChooser(page);
  await expect(
    first.dialog.getByRole("button", { name: "Start learner mode as ⁨Mia⁩" }),
  ).toBeVisible();
  await first.dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(first.trigger).toBeFocused();
  expect(await readLearnerState(page)).toEqual(before);

  const second = await openLearnerChooser(page);
  await page.keyboard.press("Escape");
  await expect(second.dialog).toHaveCount(0);
  await expect(second.trigger).toBeFocused();
  expect(await readLearnerState(page)).toEqual(before);
});

test("a chooser roster failure stays in Guardian mode and retries safely", async ({
  page,
}) => {
  await page.goto(scenarioUrl("/guardian"));
  await readLearnerState(page);
  await page.evaluate(() => {
    const controller = (
      window as Window & { __parrotE2eLearners?: LearnerController }
    ).__parrotE2eLearners;
    if (!controller) throw new Error("Learner controller is unavailable.");
    controller.failNextLearnerRosterLoad();
  });

  const { dialog, trigger } = await openLearnerChooser(page);
  await expect(dialog.getByRole("alert")).toHaveText(
    "Learner profiles could not be loaded.",
  );
  await expect(page).toHaveURL(/\/guardian/);
  await dialog.getByRole("button", { name: "Try again" }).click();
  await expect(
    dialog.getByRole("button", { name: "Start learner mode as ⁨Mia⁩" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(trigger).toBeFocused();
});

test("a Guardian learner deep link opens the chooser inside learner selection state", async ({
  page,
}) => {
  const requested = scenarioUrl("/lessons", "selection-required");
  await page.goto(requested);
  await page
    .getByRole("button", { name: "Switch to learner mode", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Who is learning now?" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Start learner mode as ⁨Noah⁩" })
    .click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/lessons");
  await expect(
    page.getByRole("heading", { name: "Pick a lesson" }),
  ).toBeVisible();
});

test("a zero-profile Guardian learner deep link returns to Manage learners", async ({
  page,
}) => {
  await page.goto(scenarioUrl("/lessons", "zero-learners"));

  await expect.poll(() => new URL(page.url()).pathname).toBe("/guardian/learners");
  await expect(
    page.getByRole("heading", { name: "Manage learners" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Switch to learner mode", exact: true }),
  ).toHaveCount(0);
});
