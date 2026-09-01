import { expect, test, type Locator, type Page } from "@playwright/test";

const profilePath =
  "/profile/setup?parrotE2eProfile=viewport-stability&parrotE2eProfileOperation=held&parrotE2eMicrophone=delayed";
const heldPlaybackProfilePath = `${profilePath}&parrotE2eProfilePlayback=held`;
const lateAbortProfilePath = `${profilePath}&parrotE2eProfileAbort=settle-late`;

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
  | "playback"
  | "recording"
  | "transcription"
  | "answerSave"
  | "questionSkip"
  | "skipForNow";
type FetchOperationName = Extract<
  OperationName,
  "answerSave" | "questionSkip" | "skipForNow" | "transcription"
>;
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
  rejectNext: (operation: FetchOperationName, message?: string) => boolean;
  release: (phase: HeldPhase) => boolean;
  releasePlayback: () => boolean;
  resolveNext: (operation: FetchOperationName, payload?: unknown) => boolean;
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

async function settleOperation(
  page: Page,
  operation: FetchOperationName,
  outcome: "reject" | "resolve" = "resolve",
  message?: string,
) {
  const settled = await page.evaluate(
    ({ nextMessage, nextOperation, nextOutcome }) => {
      const controller = (
        window as Window & {
          __parrotE2eProfileOperations?: ProfileOperationController;
        }
      ).__parrotE2eProfileOperations;
      if (!controller) {
        throw new Error("Profile held-operation controller is missing.");
      }
      return nextOutcome === "resolve"
        ? controller.resolveNext(nextOperation)
        : controller.rejectNext(nextOperation, nextMessage);
    },
    { nextMessage: message, nextOperation: operation, nextOutcome: outcome },
  );
  expect(settled, `${operation} should have one pending operation`).toBe(true);
}

async function releasePlayback(page: Page) {
  const released = await page.evaluate(() => {
    const controller = (
      window as Window & {
        __parrotE2eProfileOperations?: ProfileOperationController;
      }
    ).__parrotE2eProfileOperations;
    if (!controller) {
      throw new Error("Profile held-operation controller is missing.");
    }
    return controller.releasePlayback();
  });
  expect(released, "question playback should be pending").toBe(true);
}

async function openQuestion(
  page: Page,
  viewport = { height: 844, width: 390 },
  path = profilePath,
) {
  await page.setViewportSize(viewport);
  await page.goto(path);
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
  expect(
    await action.evaluate((element) => getComputedStyle(element).opacity),
  ).toBe("1");
  await expectRememberedNode(action);
}

async function expectSingleStatus(question: Locator, text: string) {
  const status = question.getByRole("status");
  await expect(status).toHaveCount(1);
  await expect(status).toHaveText(text);
  await expect(question.getByText(text, { exact: true })).toHaveCount(1);
}

async function expectMinimumTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
}

async function expectFocusPaintInsideViewport(page: Page, locator: Locator) {
  const result = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const paint =
      Number.parseFloat(style.outlineOffset) +
      Number.parseFloat(style.outlineWidth);
    return {
      bottom: box.bottom + paint,
      focusVisible: element.matches(":focus-visible"),
      left: box.left - paint,
      right: box.right + paint,
      top: box.top - paint,
    };
  });
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(result.focusVisible).toBe(true);
  expect(result.left).toBeGreaterThanOrEqual(0);
  expect(result.top).toBeGreaterThanOrEqual(0);
  expect(result.right).toBeLessThanOrEqual(viewport!.width);
  expect(result.bottom).toBeLessThanOrEqual(viewport!.height);
}

async function expectCompactNextDiscovery(
  page: Page,
  next: Locator,
  phase: string,
) {
  const viewport = page.viewportSize();
  expect(viewport).toEqual({ height: 640, width: 320 });
  const box = await next.boundingBox();
  expect(box, `${phase} Next geometry`).not.toBeNull();
  expect(box!.height, `${phase} Next height`).toBe(52);
  expect(box!.width, `${phase} Next width`).toBe(144);
  expect(box!.x, `${phase} Next left edge`).toBeGreaterThanOrEqual(0);
  expect(box!.y, `${phase} Next top edge`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${phase} Next right edge`).toBeLessThanOrEqual(
    viewport!.width,
  );
  expect(
    box!.y + box!.height,
    `${phase} Next bottom edge`,
  ).toBeLessThanOrEqual(viewport!.height);
  await expect
    .poll(
      () => page.getByRole("main").evaluate((element) => element.scrollTop),
      { message: `${phase} should not depend on focus scrolling` },
    )
    .toBe(0);
}

async function measurePendingFeedback(action: Locator, expectedStatus: string) {
  return action.evaluate(async (element, expected) => {
    const region = element.closest("section");
    const status = region?.querySelector('[role="status"]');
    let observedAt: number | null = null;
    const observer = new MutationObserver(() => {
      if (
        status?.textContent === expected &&
        element.getAttribute("aria-disabled") === "true"
      ) {
        observedAt ??= performance.now();
      }
    });
    if (!region || !status) {
      throw new Error("Question feedback region is missing.");
    }
    observer.observe(region, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
    const startedAt = performance.now();
    (element as HTMLButtonElement).click();
    const immediate = {
      owned: element.getAttribute("aria-disabled") === "true",
      status: status?.textContent ?? null,
    };
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    const result = {
      elapsedMs: (observedAt ?? performance.now()) - startedAt,
      expected,
      immediate,
      nextFrame: {
        owned: element.getAttribute("aria-disabled") === "true",
        status: status?.textContent ?? null,
      },
      observedBeforeNextFrame: observedAt !== null,
    };
    observer.disconnect();
    return result;
  }, expectedStatus);
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
    window.history.pushState(window.history.state, "", "/guardian");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page).toHaveURL("/guardian");
  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toBeVisible();
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
  await expect
    .poll(() => operationSnapshot(page))
    .toMatchObject({
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

  const account = page.getByRole("button", { name: /^Profile for / });
  await account.focus();
  await expect(account).toBeFocused();
  for (let step = 0; step < 3; step += 1) {
    if (
      await microphone.evaluate((element) => document.activeElement === element)
    ) {
      break;
    }
    await page.keyboard.press("Tab");
  }
  await expect(microphone).toBeFocused();

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
  await expect
    .poll(() => operationSnapshot(page))
    .toMatchObject({
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
  await expect(page.getByRole("heading", { name: "Thank you!" })).toBeFocused();
});

test("both skip actions own one focused node and reject duplicate or mixed work", async ({
  page,
}) => {
  const cases = [
    {
      name: "Skip question",
      operation: "questionSkip" as const,
    },
    {
      name: "Skip for now",
      operation: "skipForNow" as const,
    },
  ];

  for (const testCase of cases) {
    const question = await openQuestion(page);
    const owner = question.getByRole("button", {
      exact: true,
      name: testCase.name,
    });
    const microphone = question.getByRole("button", {
      exact: true,
      name: "Speak your answer",
    });
    const next = question.getByRole("button", { exact: true, name: "Next" });
    const competingSkip = question.getByRole("button", {
      exact: true,
      name:
        testCase.name === "Skip question" ? "Skip for now" : "Skip question",
    });

    await owner.focus();
    await rememberNode(owner);
    await owner.evaluate((button: HTMLButtonElement) => {
      for (let attempt = 0; attempt < 12; attempt += 1) button.click();
    });

    await expectSingleStatus(question, "Thinking…");
    await expectPendingOwner(owner, testCase.name);
    for (const control of [microphone, next, competingSkip]) {
      await expect(control).toBeDisabled();
    }
    await expect
      .poll(() => operationSnapshot(page))
      .toMatchObject({
        [testCase.operation]: { pending: 1, requests: 1 },
        answerSave: { requests: 0 },
        microphone: { requests: 0 },
      });

    await owner.press("Enter");
    await owner.press("Space");
    await owner.evaluate((button: HTMLButtonElement) => button.click());
    await microphone.evaluate((button: HTMLButtonElement) => button.click());
    await next.evaluate((button: HTMLButtonElement) => button.click());
    await competingSkip.evaluate((button: HTMLButtonElement) => button.click());
    await expect(operationSnapshot(page)).resolves.toMatchObject({
      [testCase.operation]: { pending: 1, requests: 1 },
      answerSave: { requests: 0 },
      microphone: { requests: 0 },
    });

    await settleOperation(
      page,
      testCase.operation,
      "reject",
      `${testCase.name} could not finish.`,
    );
    await expect(question.getByRole("status")).toHaveText("");
    await expect(question.getByRole("alert")).toHaveText(
      `${testCase.name} could not finish.`,
    );
    await expect(owner).not.toHaveAttribute("aria-disabled", "true");
    await expect(owner).toBeFocused();
    await expectRememberedNode(owner);
  }
});

test("successful skips hand focus to the next question or route", async ({
  page,
}) => {
  let question = await openQuestion(page);
  await question
    .getByRole("button", { exact: true, name: "Skip question" })
    .press("Enter");
  await expectSingleStatus(question, "Thinking…");
  await settleOperation(page, "questionSkip");
  await expect(
    page.getByRole("heading", { name: "How old are you?" }),
  ).toBeFocused();

  question = await openQuestion(page);
  await question
    .getByRole("button", { exact: true, name: "Skip for now" })
    .press("Enter");
  await expectSingleStatus(question, "Thinking…");
  await settleOperation(page, "skipForNow");
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "Parrot English" }),
  ).toBeFocused();
});

test("Space and initial form-submit bursts still start only one owned request", async ({
  page,
}) => {
  let question = await openQuestion(page);
  let action = question.getByRole("button", {
    exact: true,
    name: "Speak your answer",
  });
  await action.focus();
  await action.press("Space");
  await expect
    .poll(() => operationSnapshot(page))
    .toMatchObject({
      microphone: { pending: 1, requests: 1 },
    });
  await settlePhase(page, "opening", "reject");

  for (const testCase of [
    { name: "Next", operation: "answerSave" as const },
    { name: "Skip question", operation: "questionSkip" as const },
    { name: "Skip for now", operation: "skipForNow" as const },
  ]) {
    question = await openQuestion(page);
    if (testCase.operation === "answerSave") {
      await question
        .getByRole("textbox", { exact: true, name: "Your answer" })
        .fill("Mia");
    }
    action = question.getByRole("button", {
      exact: true,
      name: testCase.name,
    });
    await action.focus();
    await action.press("Space");
    await expect
      .poll(() => operationSnapshot(page))
      .toMatchObject({
        [testCase.operation]: { pending: 1, requests: 1 },
      });
    await settleOperation(page, testCase.operation, "reject");
  }

  question = await openQuestion(page);
  const answer = question.getByRole("textbox", {
    exact: true,
    name: "Your answer",
  });
  await answer.fill("Mia");
  await answer.evaluate((element: HTMLTextAreaElement) => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      element.form?.requestSubmit();
    }
  });
  await expect
    .poll(() => operationSnapshot(page))
    .toMatchObject({
      answerSave: { pending: 1, requests: 1 },
    });
  await settleOperation(page, "answerSave", "reject");
});

test("failed voice and save work stays retryable without stealing deliberately moved focus", async ({
  page,
}) => {
  let question = await openQuestion(page);
  const microphone = question.getByRole("button", {
    exact: true,
    name: "Speak your answer",
  });

  await microphone.focus();
  await rememberNode(microphone);
  await microphone.press("Enter");
  await settlePhase(page, "opening", "reject");
  await expect(question.getByRole("status")).toHaveText("");
  await expect(question.getByRole("alert")).toContainText(
    "You can still type your answer.",
  );
  await expect(microphone).toBeFocused();
  await expect(microphone).not.toHaveAttribute("aria-disabled", "true");
  await expectRememberedNode(microphone);

  await microphone.press("Enter");
  await expectSingleStatus(question, "Opening mic…");
  const account = page.getByRole("button", { name: /^Profile for / });
  await account.focus();
  await settlePhase(page, "opening", "reject");
  await expect(account).toBeFocused();
  await expect(question.getByRole("status")).toHaveText("");
  await expect(operationSnapshot(page)).resolves.toMatchObject({
    microphone: { pending: 0, rejected: 2, requests: 2 },
  });

  question = await openQuestion(page);
  const answer = question.getByRole("textbox", {
    exact: true,
    name: "Your answer",
  });
  const next = question.getByRole("button", { exact: true, name: "Next" });
  await answer.fill("Mia");
  await next.focus();
  await rememberNode(next);
  await next.press("Enter");
  await settleOperation(page, "answerSave", "reject", "Please try again.");
  await expect(question.getByRole("status")).toHaveText("");
  await expect(question.getByRole("alert")).toHaveText("Please try again.");
  await expect(next).toBeFocused();
  await expect(next).not.toHaveAttribute("aria-disabled", "true");
  await expectRememberedNode(next);

  await next.press("Enter");
  await expectSingleStatus(question, "Thinking…");
  await account.focus();
  await settleOperation(page, "answerSave", "reject", "Please try again.");
  await expect(account).toBeFocused();
  await expect(operationSnapshot(page)).resolves.toMatchObject({
    answerSave: { pending: 0, rejected: 2, requests: 2 },
  });
});

for (const testCase of [
  {
    action: "Next",
    operation: "answerSave" as const,
    viewport: { height: 568, width: 280 },
  },
  {
    action: "Skip for now",
    operation: "skipForNow" as const,
    viewport: { height: 640, width: 320 },
  },
  {
    action: "Next",
    operation: "answerSave" as const,
    viewport: { height: 360, width: 640 },
  },
]) {
  test(`a ${testCase.viewport.width}x${testCase.viewport.height} error keeps the focused ${testCase.action} retry visible`, async ({
    page,
  }) => {
    const question = await openQuestion(page, testCase.viewport);
    if (testCase.operation === "answerSave") {
      await question
        .getByRole("textbox", { exact: true, name: "Your answer" })
        .fill("Mia");
    }
    const action = question.getByRole("button", {
      exact: true,
      name: testCase.action,
    });

    await action.focus();
    await action.press("Enter");
    await settleOperation(
      page,
      testCase.operation,
      "reject",
      "Please try again.",
    );

    await expect(question.getByRole("alert")).toHaveText("Please try again.");
    await expect(action).toBeFocused();
    await expectFocusPaintInsideViewport(page, action);
  });
}

test("visible operation ownership is complete by the next frame and within 100 ms", async ({
  page,
}) => {
  let question = await openQuestion(page);
  let action = question.getByRole("button", {
    exact: true,
    name: "Speak your answer",
  });
  let measurement = await measurePendingFeedback(action, "Opening mic…");
  expect(measurement.observedBeforeNextFrame).toBe(true);
  expect(measurement.nextFrame).toEqual({
    owned: true,
    status: measurement.expected,
  });
  expect(measurement.elapsedMs).toBeLessThanOrEqual(100);
  await settlePhase(page, "opening", "reject");

  question = await openQuestion(page);
  await question
    .getByRole("textbox", { exact: true, name: "Your answer" })
    .fill("Mia");
  action = question.getByRole("button", { exact: true, name: "Next" });
  measurement = await measurePendingFeedback(action, "Thinking…");
  expect(measurement.observedBeforeNextFrame).toBe(true);
  expect(measurement.nextFrame).toEqual({
    owned: true,
    status: measurement.expected,
  });
  expect(measurement.elapsedMs).toBeLessThanOrEqual(100);
  await settleOperation(page, "answerSave", "reject");
});

test("start and replay audio cannot overlap recording or duplicate themselves", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto(heldPlaybackProfilePath);
  const start = page.getByRole("button", { name: "Start questions" });
  await start.evaluate((button: HTMLButtonElement) => {
    for (let attempt = 0; attempt < 12; attempt += 1) button.click();
  });
  const questionHeading = page.getByRole("heading", {
    name: "Hi! I'm Peppa. What's your name?",
  });
  await expect(questionHeading).toBeFocused();
  let question = page.getByRole("region", {
    name: "Hi! I'm Peppa. What's your name?",
  });
  let replay = question.getByRole("button", {
    exact: true,
    name: "Replay question",
  });
  await expect(replay).toHaveAttribute("aria-disabled", "true");
  expect(
    await replay.evaluate((button: HTMLButtonElement) => button.disabled),
  ).toBe(false);
  await expect(replay).toHaveCSS("opacity", "1");
  await expect
    .poll(() => operationSnapshot(page))
    .toMatchObject({
      playback: { pending: 1, requests: 1 },
    });

  await question
    .getByRole("button", { exact: true, name: "Speak your answer" })
    .click();
  await expectSingleStatus(question, "Opening mic…");
  await expect
    .poll(() => operationSnapshot(page))
    .toMatchObject({
      microphone: { pending: 1, requests: 1 },
      playback: { aborted: 1, pending: 0, requests: 1 },
    });
  await settlePhase(page, "opening", "reject");

  question = await openQuestion(
    page,
    { height: 844, width: 390 },
    heldPlaybackProfilePath,
  );
  await releasePlayback(page);
  replay = question.getByRole("button", {
    exact: true,
    name: "Replay question",
  });
  await expect(replay).not.toHaveAttribute("aria-disabled", "true");
  await replay.focus();
  await rememberNode(replay);
  await replay.evaluate((button: HTMLButtonElement) => {
    for (let attempt = 0; attempt < 12; attempt += 1) button.click();
  });
  await replay.press("Enter");
  await replay.press("Space");
  await expect
    .poll(() => operationSnapshot(page))
    .toMatchObject({
      playback: { pending: 1, requests: 2, resolved: 1 },
    });
  await expectPendingOwner(replay, "Replay question");

  await question
    .getByRole("button", { exact: true, name: "Speak your answer" })
    .click();
  await expectSingleStatus(question, "Opening mic…");
  await expect
    .poll(() => operationSnapshot(page))
    .toMatchObject({
      microphone: { pending: 1, requests: 1 },
      playback: { aborted: 1, pending: 0, requests: 2, resolved: 1 },
    });
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

  await expect
    .poll(() => operationSnapshot(page))
    .toMatchObject({
      microphone: { pending: 1, requests: 1 },
    });
  await settlePhase(page, "opening");
  await expect
    .poll(() => operationSnapshot(page))
    .toMatchObject({
      microphone: { pending: 0, resolved: 1 },
      recording: { requests: 0, stoppedTracks: 1 },
      transcription: { requests: 0 },
    });

  question = await openQuestion(
    page,
    { height: 844, width: 390 },
    lateAbortProfilePath,
  );
  await question
    .getByRole("button", { exact: true, name: "Speak your answer" })
    .click();
  await settlePhase(page, "opening");
  await settlePhase(page, "listening");
  await expectSingleStatus(question, "Writing…");
  await leaveLearnerRoute(page);
  await expect
    .poll(() => operationSnapshot(page))
    .toMatchObject({
      transcription: { aborted: 1, pending: 1, requests: 1 },
    });
  await settleOperation(page, "transcription");
  await expect
    .poll(() => operationSnapshot(page))
    .toMatchObject({
      transcription: { aborted: 1, pending: 0, resolved: 1 },
    });
  question = page.getByRole("region", {
    name: "Hi! I'm Peppa. What's your name?",
  });
  await expect(question).toHaveCount(0);

  question = await openQuestion(
    page,
    { height: 844, width: 390 },
    lateAbortProfilePath,
  );
  await question
    .getByRole("textbox", { exact: true, name: "Your answer" })
    .fill("Mia");
  await question.getByRole("button", { exact: true, name: "Next" }).click();
  await expectSingleStatus(question, "Thinking…");
  await leaveLearnerRoute(page);
  await expect
    .poll(() => operationSnapshot(page))
    .toMatchObject({
      answerSave: { aborted: 1, pending: 1, requests: 1 },
    });
  await settleOperation(page, "answerSave");
  await expect
    .poll(() => operationSnapshot(page))
    .toMatchObject({
      answerSave: { aborted: 1, pending: 0, resolved: 1 },
    });
  await expect(page.getByRole("heading", { name: "Thank you!" })).toHaveCount(
    0,
  );
  question = page.getByRole("region", {
    name: "Hi! I'm Peppa. What's your name?",
  });
  await expect(question).toHaveCount(0);
});

test("route exit stops active recording and aborts either skip request", async ({
  page,
}) => {
  let question = await openQuestion(page);
  await question
    .getByRole("button", { exact: true, name: "Speak your answer" })
    .click();
  await settlePhase(page, "opening");
  await expectSingleStatus(question, "Listening…");
  await leaveLearnerRoute(page);
  await expect
    .poll(() => operationSnapshot(page))
    .toMatchObject({
      recording: { pending: 0, requests: 1, resolved: 1, stoppedTracks: 1 },
      transcription: { requests: 0 },
    });

  question = await openQuestion(page);
  await question
    .getByRole("button", { exact: true, name: "Skip question" })
    .click();
  await expectSingleStatus(question, "Thinking…");
  await leaveLearnerRoute(page);
  await expect
    .poll(() => operationSnapshot(page))
    .toMatchObject({
      questionSkip: { aborted: 1, pending: 0, requests: 1 },
    });

  question = await openQuestion(page);
  await question
    .getByRole("button", { exact: true, name: "Skip for now" })
    .click();
  await expectSingleStatus(question, "Thinking…");
  await leaveLearnerRoute(page);
  await expect
    .poll(() => operationSnapshot(page))
    .toMatchObject({
      skipForNow: { aborted: 1, pending: 0, requests: 1 },
    });
});

for (const viewport of viewports) {
  test(`operation phases preserve question geometry on a ${viewport.name}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
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
    const replay = question.getByRole("button", { name: "Replay question" });
    const skipQuestion = question.getByRole("button", {
      exact: true,
      name: "Skip question",
    });
    const skip = question.getByRole("button", {
      exact: true,
      name: "Skip for now",
    });
    const next = question.getByRole("button", { exact: true, name: "Next" });
    const anchors = [
      question,
      replay,
      heading,
      answerLabel,
      answer,
      microphone,
      skipQuestion,
      skip,
      next,
    ];
    for (const target of [replay, microphone, skipQuestion, skip, next]) {
      await expectMinimumTarget(target);
    }
    const idle = await geometrySnapshot(page, anchors);
    if (viewport.width === 320) {
      await expectCompactNextDiscovery(page, next, "idle");
    }

    await microphone.focus();
    await microphone.press("Enter");
    await expectSingleStatus(question, "Opening mic…");
    await expectFocusPaintInsideViewport(page, microphone);
    await expectStableGeometry(
      idle,
      await geometrySnapshot(page, anchors),
      "opening",
    );
    if (viewport.width === 320) {
      await expectCompactNextDiscovery(page, next, "opening");
    }

    await settlePhase(page, "opening");
    await expectSingleStatus(question, "Listening…");
    await expectStableGeometry(
      idle,
      await geometrySnapshot(page, anchors),
      "listening",
    );
    if (viewport.width === 320) {
      await expectCompactNextDiscovery(page, next, "listening");
    }

    await settlePhase(page, "listening");
    await expectSingleStatus(question, "Writing…");
    await expectStableGeometry(
      idle,
      await geometrySnapshot(page, anchors),
      "writing",
    );
    if (viewport.width === 320) {
      await expectCompactNextDiscovery(page, next, "writing");
    }

    await settlePhase(page, "writing");
    await expectSingleStatus(question, "Ready.");
    await expectStableGeometry(
      idle,
      await geometrySnapshot(page, anchors),
      "ready",
    );
    if (viewport.width === 320) {
      await expectCompactNextDiscovery(page, next, "ready");
    }

    await next.focus();
    await next.press("Enter");
    await expectSingleStatus(question, "Thinking…");
    await expectFocusPaintInsideViewport(page, next);
    await expectStableGeometry(
      idle,
      await geometrySnapshot(page, anchors),
      "thinking",
    );
    if (viewport.width === 320) {
      await expectCompactNextDiscovery(page, next, "thinking");
    }
  });
}
