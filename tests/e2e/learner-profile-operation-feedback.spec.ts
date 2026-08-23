import { expect, test, type Locator, type Page } from "@playwright/test";

const profilePath =
  "/profile/setup?parrotE2eProfile=viewport-stability&parrotE2eProfileOperation=held&parrotE2eMicrophone=delayed";

const viewports = [
  { height: 568, name: "ultra-narrow phone", width: 280 },
  { height: 640, name: "compact phone", width: 320 },
  { height: 844, name: "regular phone", width: 390 },
  { height: 360, name: "short landscape", width: 640 },
  { height: 900, name: "desktop", width: 1440 },
] as const;

type HeldPhase = "opening" | "listening" | "writing" | "thinking";
type OperationName =
  | "microphone"
  | "recording"
  | "transcription"
  | "answerSave"
  | "questionSkip"
  | "skipForNow";
type OperationCount = {
  aborted: number;
  pending: number;
  rejected: number;
  requests: number;
  resolved: number;
};
type ProfileOperationSnapshot = Record<OperationName, OperationCount> & {
  recording: OperationCount & { stoppedTracks: number };
};
type ProfileOperationController = {
  reject: (phase: HeldPhase) => boolean;
  release: (phase: HeldPhase) => boolean;
  snapshot: () => ProfileOperationSnapshot;
};

type Rect = { height: number; width: number; x: number; y: number };

async function operationSnapshot(page: Page) {
  return page.evaluate(() => {
    const controller = (
      window as Window & {
        __parrotE2eProfileOperations?: ProfileOperationController;
      }
    ).__parrotE2eProfileOperations;
    if (!controller) {
      throw new Error("Profile held-operation controller is missing.");
    }
    return controller.snapshot();
  });
}

async function settlePhase(
  page: Page,
  phase: HeldPhase,
  outcome: "reject" | "release" = "release",
) {
  const settled = await page.evaluate(
    ({ nextOutcome, nextPhase }) => {
      const controller = (
        window as Window & {
          __parrotE2eProfileOperations?: ProfileOperationController;
        }
      ).__parrotE2eProfileOperations;
      if (!controller) {
        throw new Error("Profile held-operation controller is missing.");
      }
      return nextOutcome === "release"
        ? controller.release(nextPhase)
        : controller.reject(nextPhase);
    },
    { nextOutcome: outcome, nextPhase: phase },
  );
  expect(settled, `${phase} should have one pending operation`).toBe(true);
}

async function openQuestion(
  page: Page,
  viewport = { height: 844, width: 390 },
) {
  await page.setViewportSize(viewport);
  await page.goto(profilePath);
  await page.getByRole("button", { name: "Start questions" }).click();
  const heading = page.getByRole("heading", {
    name: "Hi! I'm Peppa. What's your name?",
  });
  await expect(heading).toBeFocused();
  return page.getByRole("region", {
    name: "Hi! I'm Peppa. What's your name?",
  });
}

async function rememberNode(action: Locator) {
  await action.evaluate((element) => {
    (
      window as Window & { __parrotE2eProfileOperationNode?: Element }
    ).__parrotE2eProfileOperationNode = element;
  });
}

async function expectRememberedNode(action: Locator) {
  await expect
    .poll(() =>
      action.evaluate(
        (element) =>
          element ===
          (
            window as Window & {
              __parrotE2eProfileOperationNode?: Element;
            }
          ).__parrotE2eProfileOperationNode,
      ),
    )
    .toBe(true);
}

async function expectPendingOwner(action: Locator, name: string) {
  await expect(action).toHaveAccessibleName(name);
  await expect(action).toHaveAttribute("aria-disabled", "true");
  await expect(action).toBeFocused();
  expect(
    await action.evaluate((element: HTMLButtonElement) => element.disabled),
  ).toBe(false);
  await expectRememberedNode(action);
}

async function expectSingleStatus(question: Locator, text: string) {
  const status = question.getByRole("status");
  await expect(status).toHaveCount(1);
  await expect(status).toHaveText(text);
  await expect(question.getByText(text, { exact: true })).toHaveCount(1);
}

async function layoutRect(locator: Locator): Promise<Rect> {
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const main = element.closest("main");
    return {
      height: box.height,
      width: box.width,
      x: box.x + (main?.scrollLeft ?? 0),
      y: box.y + (main?.scrollTop ?? 0),
    };
  });
}

function maxRectDelta(before: Rect[], after: Rect[]) {
  return Math.max(
    ...before.flatMap((value, index) => [
      Math.abs(value.height - after[index].height),
      Math.abs(value.width - after[index].width),
      Math.abs(value.x - after[index].x),
      Math.abs(value.y - after[index].y),
    ]),
  );
}

async function geometrySnapshot(page: Page, anchors: Locator[]) {
  const main = page.getByRole("main");
  return {
    horizontalOverflow: await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
    mainScrollRange: await main.evaluate(
      (element) => element.scrollHeight - element.clientHeight,
    ),
    rects: await Promise.all(anchors.map(layoutRect)),
  };
}

async function expectStableGeometry(
  before: Awaited<ReturnType<typeof geometrySnapshot>>,
  after: Awaited<ReturnType<typeof geometrySnapshot>>,
  phase: string,
) {
  expect(after.horizontalOverflow, `${phase} horizontal overflow`).toBe(0);
  expect(
    Math.abs(after.mainScrollRange - before.mainScrollRange),
    `${phase} added vertical scroll`,
  ).toBeLessThanOrEqual(1);
  expect(
    maxRectDelta(before.rects, after.rects),
    `${phase} moved a stable question anchor`,
  ).toBeLessThanOrEqual(1);
}

async function leaveLearnerRoute(page: Page) {
  await page.evaluate(() => {
    window.history.pushState(window.history.state, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "Hi! I'm Peppa. What's your name?" }),
  ).toHaveCount(0);
}

test("microphone feedback owns one focused node through opening, listening, writing, and ready", async ({
  page,
}) => {
  const question = await openQuestion(page);
  const microphone = question.getByRole("button", {
    exact: true,
    name: "Speak your answer",
  });
  const next = question.getByRole("button", { exact: true, name: "Next" });
  const skip = question.getByRole("button", { name: "Skip for now" });

  await expect(question.getByRole("status")).toHaveCount(1);
  await expect(question.getByRole("status")).toHaveText("");
  await microphone.focus();
  await rememberNode(microphone);
  await microphone.evaluate((button: HTMLButtonElement) => {
    for (let attempt = 0; attempt < 12; attempt += 1) button.click();
  });

  await expectSingleStatus(question, "Opening mic…");
  await expectPendingOwner(microphone, "Speak your answer");
  await expect(next).toBeDisabled();
  await expect(skip).toBeDisabled();
  await expect.poll(() => operationSnapshot(page)).toMatchObject({
    microphone: { pending: 1, requests: 1 },
    answerSave: { requests: 0 },
    skipForNow: { requests: 0 },
  });

  await microphone.press("Enter");
  await microphone.press("Space");
  await microphone.evaluate((button: HTMLButtonElement) => button.click());
  await next.evaluate((button: HTMLButtonElement) => button.click());
  await skip.evaluate((button: HTMLButtonElement) => button.click());
  await expect(operationSnapshot(page)).resolves.toMatchObject({
    microphone: { pending: 1, requests: 1 },
    answerSave: { requests: 0 },
    skipForNow: { requests: 0 },
  });

  await settlePhase(page, "opening");
  await expectSingleStatus(question, "Listening…");
  await expectPendingOwner(microphone, "Speak your answer");

  await settlePhase(page, "listening");
  await expectSingleStatus(question, "Writing…");
  await expectPendingOwner(microphone, "Speak your answer");

  await settlePhase(page, "writing");
  await expectSingleStatus(question, "Ready.");
  await expect(microphone).toHaveAccessibleName("Speak your answer");
  await expect(microphone).not.toHaveAttribute("aria-disabled", "true");
  await expect(microphone).toBeFocused();
  await expectRememberedNode(microphone);
  await expect(
    question.getByRole("textbox", { exact: true, name: "Your answer" }),
  ).toHaveValue("Mia");
});

test("answer save stays on one named focused node and rejects duplicate or mixed actions", async ({
  page,
}) => {
  const question = await openQuestion(page);
  const answer = question.getByRole("textbox", {
    exact: true,
    name: "Your answer",
  });
  const microphone = question.getByRole("button", {
    exact: true,
    name: "Speak your answer",
  });
  const next = question.getByRole("button", { exact: true, name: "Next" });
  const skip = question.getByRole("button", { name: "Skip for now" });

  await answer.fill("Mia");
  await next.focus();
  await rememberNode(next);
  await next.evaluate((button: HTMLButtonElement) => {
    for (let attempt = 0; attempt < 12; attempt += 1) button.click();
  });

  await expectSingleStatus(question, "Thinking…");
  await expectPendingOwner(next, "Next");
  await expect(answer).toBeDisabled();
  await expect(microphone).toBeDisabled();
  await expect(skip).toBeDisabled();
  await expect.poll(() => operationSnapshot(page)).toMatchObject({
    answerSave: { pending: 1, requests: 1 },
    microphone: { requests: 0 },
    skipForNow: { requests: 0 },
  });

  await next.press("Enter");
  await next.press("Space");
  await next.evaluate((button: HTMLButtonElement) => button.click());
  await microphone.evaluate((button: HTMLButtonElement) => button.click());
  await skip.evaluate((button: HTMLButtonElement) => button.click());
  await answer.evaluate((element: HTMLTextAreaElement) =>
    element.form?.requestSubmit(),
  );
  await expect(operationSnapshot(page)).resolves.toMatchObject({
    answerSave: { pending: 1, requests: 1 },
    microphone: { requests: 0 },
    skipForNow: { requests: 0 },
  });
  await expectPendingOwner(next, "Next");

  await settlePhase(page, "thinking");
  await expect(
    page.getByRole("heading", { name: "Thank you!" }),
  ).toBeFocused();
});

test("route exit aborts held work and quarantines stale settlements", async ({
  page,
}) => {
  let question = await openQuestion(page);
  await question
    .getByRole("button", { exact: true, name: "Speak your answer" })
    .click();
  await expectSingleStatus(question, "Opening mic…");
  await leaveLearnerRoute(page);

  await expect.poll(() => operationSnapshot(page)).toMatchObject({
    microphone: { pending: 1, requests: 1 },
  });
  await settlePhase(page, "opening");
  await expect.poll(() => operationSnapshot(page)).toMatchObject({
    microphone: { pending: 0, resolved: 1 },
    recording: { requests: 0, stoppedTracks: 1 },
    transcription: { requests: 0 },
  });

  question = await openQuestion(page);
  await question
    .getByRole("button", { exact: true, name: "Speak your answer" })
    .click();
  await settlePhase(page, "opening");
  await settlePhase(page, "listening");
  await expectSingleStatus(question, "Writing…");
  await leaveLearnerRoute(page);
  await expect.poll(() => operationSnapshot(page)).toMatchObject({
    transcription: { aborted: 1, pending: 0, requests: 1 },
  });
  expect(
    await page.evaluate(() => {
      const controller = (
        window as Window & {
          __parrotE2eProfileOperations?: ProfileOperationController;
        }
      ).__parrotE2eProfileOperations;
      if (!controller) {
        throw new Error("Profile held-operation controller is missing.");
      }
      return controller.release("writing");
    }),
  ).toBe(false);

  question = await openQuestion(page);
  await question
    .getByRole("textbox", { exact: true, name: "Your answer" })
    .fill("Mia");
  await question
    .getByRole("button", { exact: true, name: "Next" })
    .click();
  await expectSingleStatus(question, "Thinking…");
  await leaveLearnerRoute(page);
  await expect.poll(() => operationSnapshot(page)).toMatchObject({
    answerSave: { aborted: 1, pending: 0, requests: 1 },
  });
  expect(
    await page.evaluate(() => {
      const controller = (
        window as Window & {
          __parrotE2eProfileOperations?: ProfileOperationController;
        }
      ).__parrotE2eProfileOperations;
      if (!controller) {
        throw new Error("Profile held-operation controller is missing.");
      }
      return controller.release("thinking");
    }),
  ).toBe(false);
  await expect(page.getByRole("heading", { name: "Thank you!" })).toHaveCount(
    0,
  );
});

for (const viewport of viewports) {
  test(`operation phases preserve question geometry on a ${viewport.name}`, async ({
    page,
  }) => {
    const question = await openQuestion(page, viewport);
    const heading = question.getByRole("heading", {
      name: "Hi! I'm Peppa. What's your name?",
    });
    const answerLabel = question.getByText("Your answer", { exact: true });
    const answer = question.getByRole("textbox", {
      exact: true,
      name: "Your answer",
    });
    const microphone = question.getByRole("button", {
      exact: true,
      name: "Speak your answer",
    });
    const skip = question.getByRole("button", { name: "Skip for now" });
    const next = question.getByRole("button", { exact: true, name: "Next" });
    const anchors = [question, heading, answerLabel, answer, microphone, skip, next];
    const idle = await geometrySnapshot(page, anchors);

    await microphone.click();
    await expectSingleStatus(question, "Opening mic…");
    await expectStableGeometry(idle, await geometrySnapshot(page, anchors), "opening");

    await settlePhase(page, "opening");
    await expectSingleStatus(question, "Listening…");
    await expectStableGeometry(idle, await geometrySnapshot(page, anchors), "listening");

    await settlePhase(page, "listening");
    await expectSingleStatus(question, "Writing…");
    await expectStableGeometry(idle, await geometrySnapshot(page, anchors), "writing");

    await settlePhase(page, "writing");
    await expectSingleStatus(question, "Ready.");
    await expectStableGeometry(idle, await geometrySnapshot(page, anchors), "ready");

    await next.click();
    await expectSingleStatus(question, "Thinking…");
    await expectStableGeometry(idle, await geometrySnapshot(page, anchors), "thinking");
  });
}
