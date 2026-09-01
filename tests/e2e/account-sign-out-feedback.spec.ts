import { expect, test, type Locator, type Page } from "@playwright/test";

type Rect = { height: number; width: number; x: number; y: number };

function guardianPath(path: string) {
  return `${path}${path.includes("?") ? "&" : "?"}parrotE2eGuardian=guardian`;
}

function boxesOverlap(first: Rect, second: Rect) {
  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}

async function focusedPaintBox(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const focus = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      isVisible: element.matches(":focus-visible"),
      offset: Number.parseFloat(style.outlineOffset),
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(focus.isVisible).toBe(true);
  expect(focus.style).not.toBe("none");
  const extent = focus.offset + focus.width;
  return {
    height: box!.height + extent * 2,
    width: box!.width + extent * 2,
    x: box!.x - extent,
    y: box!.y - extent,
  };
}

async function applyTextSpacing(page: Page) {
  await page.addStyleTag({
    content: `
      * {
        letter-spacing: 0.12em !important;
        line-height: 1.5 !important;
        word-spacing: 0.16em !important;
      }
      p { margin-bottom: 2em !important; }
    `,
  });
}

async function waitForVisualAssets(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) => image.decode().catch(() => {})),
    );
    await new Promise<void>((resolvePaint) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolvePaint()));
    });
  });
}

const viewports = [
  { height: 568, width: 280 },
  { height: 844, width: 390 },
  { height: 360, width: 640 },
  { height: 900, width: 1440 },
];

for (const viewport of viewports) {
  test(`sign-out feedback is immediate and contained at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    let releaseRequest = () => {};
    let markRequestStarted = () => {};
    let requestCount = 0;
    const requestStarted = new Promise<void>((resolveStarted) => {
      markRequestStarted = resolveStarted;
    });
    const heldRequest = new Promise<void>((resolveRequest) => {
      releaseRequest = resolveRequest;
    });

    await page.route("**/api/auth/sign-out", async (route) => {
      requestCount += 1;
      markRequestStarted();
      await heldRequest;
      await route.abort("failed");
    });
    await page.setViewportSize(viewport);
    await page.goto(guardianPath("/guardian"));
    await waitForVisualAssets(page);

    const account = page.getByRole("button", {
      name: "Profile for ⁨Alex Guardian⁩, guardian mode",
    });
    const heading = page.getByRole("heading", { name: "Guardian dashboard" });
    const status = page
      .getByRole("complementary", { name: "Account" })
      .getByRole("status");
    const headingBefore = await heading.boundingBox();
    await account.click();
    const feedbackStartedAt = Date.now();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(status).toHaveText("Signing out…", { timeout: 500 });
    await expect(status).toBeVisible({ timeout: 500 });
    expect(Date.now() - feedbackStartedAt).toBeLessThan(500);
    await requestStarted;

    const pendingAccount = page.getByRole("button", {
      exact: true,
      name: "Signing out… Profile for ⁨Alex Guardian⁩, guardian mode",
    });
    await expect(pendingAccount).toBeFocused();
    await expect(pendingAccount).toHaveAttribute("aria-disabled", "true");
    expect(await pendingAccount.getAttribute("title")).toBeNull();
    await expect(pendingAccount.getByText("Signing out…")).toHaveCount(0);
    expect(
      await status.evaluate((message) => getComputedStyle(message).color),
    ).toBe(
      await pendingAccount.evaluate(
        (control) => getComputedStyle(control).color,
      ),
    );
    await expect(page.getByRole("menu", { name: "Account menu" })).toBeHidden();

    const [accountBox, statusBox, headingDuring] = await Promise.all([
      pendingAccount.boundingBox(),
      status.boundingBox(),
      heading.boundingBox(),
    ]);
    expect(accountBox).not.toBeNull();
    expect(statusBox).not.toBeNull();
    expect(headingBefore).not.toBeNull();
    expect(headingDuring).toEqual(headingBefore);
    expect(statusBox).toEqual(accountBox);
    expect(accountBox!.x).toBeGreaterThanOrEqual(0);
    expect(accountBox!.x + accountBox!.width).toBeLessThanOrEqual(
      viewport.width,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);
    await pendingAccount.hover();
    expect(await pendingAccount.boundingBox()).toEqual(accountBox);
    expect(
      await pendingAccount.evaluate(
        (control) => getComputedStyle(control).cursor,
      ),
    ).toBe("wait");
    expect(
      await pendingAccount.evaluate((control) => {
        const bounds = control.getBoundingClientRect();
        const hit = document.elementFromPoint(
          bounds.left + bounds.width / 2,
          bounds.top + bounds.height / 2,
        );
        return hit !== null && control.contains(hit);
      }),
    ).toBe(true);

    await page.mouse.click(
      accountBox!.x + accountBox!.width / 2,
      accountBox!.y + accountBox!.height / 2,
    );
    expect(requestCount).toBe(1);

    releaseRequest();
    const alert = page.getByRole("alert");
    await expect(alert).toHaveText("Sign out did not finish.");
    await expect(account).not.toHaveAttribute("aria-disabled", "true");
    await expect(status).toHaveText("");
    await expect(account).toBeFocused();

    const retry = page.getByRole("button", {
      exact: true,
      name: "Sign out again",
    });
    const language = page.getByRole("group", {
      name: /Guardian guidance language|家长指导语言/,
    });
    await expect(retry).toBeVisible();
    const [
      failureAccountBox,
      retryBox,
      headingAfterFailure,
      backBox,
      languageBox,
    ] = await Promise.all([
      account.boundingBox(),
      retry.boundingBox(),
      heading.boundingBox(),
      page.getByRole("button", { name: "Switch to learner" }).boundingBox(),
      language.boundingBox(),
    ]);
    expect(failureAccountBox).not.toBeNull();
    expect(retryBox).not.toBeNull();
    if (viewport.width < 1360) {
      expect(headingAfterFailure!.y - headingBefore!.y).toBe(48);
    } else {
      expect(headingAfterFailure).toEqual(headingBefore);
    }
    expect(backBox).not.toBeNull();
    expect(languageBox).not.toBeNull();
    expect(Math.round(retryBox!.height)).toBeGreaterThanOrEqual(44);
    expect(Math.round(retryBox!.width)).toBeGreaterThanOrEqual(44);
    if (viewport.width < 1360) {
      expect(retryBox!.y).toBeGreaterThanOrEqual(
        failureAccountBox!.y + failureAccountBox!.height,
      );
      expect(boxesOverlap(retryBox!, languageBox!)).toBe(false);
      expect(boxesOverlap(retryBox!, backBox!)).toBe(false);
      expect(boxesOverlap(retryBox!, failureAccountBox!)).toBe(false);
    } else {
      expect(retryBox!.x + retryBox!.width).toBeLessThanOrEqual(
        failureAccountBox!.x,
      );
      expect(boxesOverlap(retryBox!, headingAfterFailure!)).toBe(false);
      expect(boxesOverlap(retryBox!, backBox!)).toBe(false);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);

    await page.keyboard.press("Tab");
    await expect(retry).toBeFocused();
    const retryPaint = await focusedPaintBox(retry);
    expect(retryPaint.x).toBeGreaterThanOrEqual(0);
    expect(retryPaint.y).toBeGreaterThanOrEqual(0);
    expect(retryPaint.x + retryPaint.width).toBeLessThanOrEqual(viewport.width);
    expect(retryPaint.y + retryPaint.height).toBeLessThanOrEqual(
      viewport.height,
    );
    if (viewport.width >= 1360) {
      expect(boxesOverlap(retryPaint, headingAfterFailure!)).toBe(false);
      expect(boxesOverlap(retryPaint, backBox!)).toBe(false);
      expect(boxesOverlap(retryPaint, failureAccountBox!)).toBe(false);
    }

    await retry.evaluate((control) => {
      (control as HTMLElement).click();
      (control as HTMLElement).click();
    });
    await expect(account).toBeFocused();
    await expect(alert).toHaveText("Sign out did not finish.");
    await expect.poll(() => requestCount).toBe(2);

    await account.click();
    await expect(
      page.getByRole("menuitem", { name: "Sign out" }),
    ).toBeVisible();
  });
}

test("sign-out feedback keeps words and focus without motion in forced colors", async ({
  page,
}) => {
  let releaseRequest = () => {};
  const heldRequest = new Promise<void>((resolveRequest) => {
    releaseRequest = resolveRequest;
  });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.route("**/api/auth/sign-out", async (route) => {
    await heldRequest;
    await route.abort("failed");
  });
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto(guardianPath("/guardian"));
  await waitForVisualAssets(page);

  const account = page.getByRole("button", {
    name: "Profile for ⁨Alex Guardian⁩, guardian mode",
  });
  await account.focus();
  await account.press("ArrowDown");
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeFocused();
  await page.keyboard.press("Enter");

  const status = page.getByRole("status").filter({ hasText: "Signing out…" });
  const pendingAccount = page.getByRole("button", {
    exact: true,
    name: "Signing out… Profile for ⁨Alex Guardian⁩, guardian mode",
  });
  await expect(status).toBeVisible();
  await expect(pendingAccount).toBeFocused();
  expect(
    await status
      .locator("svg")
      .evaluate((spinner) => getComputedStyle(spinner).animationName),
  ).toBe("none");
  const focusStyle = await pendingAccount.evaluate((control) => {
    const style = getComputedStyle(control);
    return {
      focusVisible: control.matches(":focus-visible"),
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(focusStyle.focusVisible).toBe(true);
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(2);

  releaseRequest();
  await expect(page.getByRole("alert")).toHaveText("Sign out did not finish.");
  await expect(account).toBeFocused();
  const retry = page.getByRole("button", {
    exact: true,
    name: "Sign out again",
  });
  await expect(retry.locator("svg")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(retry).toBeFocused();
  const retryFocusStyle = await retry.evaluate((control) => {
    const style = getComputedStyle(control);
    return {
      focusVisible: control.matches(":focus-visible"),
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(retryFocusStyle.focusVisible).toBe(true);
  expect(retryFocusStyle.outlineStyle).not.toBe("none");
  expect(retryFocusStyle.outlineWidth).toBeGreaterThanOrEqual(2);
});

test("route heading focus does not override a faster account interaction", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    Object.defineProperty(window, "__parrotDelayedRouteFocusFrames", {
      configurable: true,
      value: frames,
    });
    window.requestAnimationFrame = (callback) => {
      nextFrame += 1;
      frames.set(nextFrame, callback);
      return nextFrame;
    };
    window.cancelAnimationFrame = (frame) => {
      frames.delete(frame);
    };
  });

  await page.goto(guardianPath("/guardian"));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as Window & {
              __parrotDelayedRouteFocusFrames: Map<
                number,
                FrameRequestCallback
              >;
            }
          ).__parrotDelayedRouteFocusFrames.size,
      ),
    )
    .toBeGreaterThan(0);

  const account = page.getByRole("button", {
    name: "Profile for ⁨Alex Guardian⁩, guardian mode",
  });
  await account.focus();
  await expect(account).toBeFocused();

  await page.evaluate(() => {
    const frames = (
      window as unknown as Window & {
        __parrotDelayedRouteFocusFrames: Map<number, FrameRequestCallback>;
      }
    ).__parrotDelayedRouteFocusFrames;
    for (const callback of frames.values()) callback(performance.now());
    frames.clear();
  });

  await expect(account).toBeFocused();
});

test("sign-out feedback preserves the guardian dashboard and shared header", async ({
  page,
}) => {
  let releaseRequest = () => {};
  const heldRequest = new Promise<void>((resolveRequest) => {
    releaseRequest = resolveRequest;
  });
  await page.route("**/api/auth/sign-out", async (route) => {
    await heldRequest;
    await route.abort("failed");
  });
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto(guardianPath("/guardian"));
  await waitForVisualAssets(page);

  const heading = page.getByRole("heading", { name: "Guardian dashboard" });
  const voiceDubbing = page.getByRole("heading", {
    exact: true,
    name: "Voice dubbing",
  });
  const [headingBefore, voiceDubbingBefore] = await Promise.all([
    heading.boundingBox(),
    voiceDubbing.boundingBox(),
  ]);
  const account = page.getByRole("button", {
    name: "Profile for ⁨Alex Guardian⁩, guardian mode",
  });
  await account.click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();

  const pending = page.getByRole("status").filter({ hasText: "Signing out…" });
  const pendingAccount = page.getByRole("button", {
    exact: true,
    name: "Signing out… Profile for ⁨Alex Guardian⁩, guardian mode",
  });
  await expect(pending).toBeVisible();
  await expect(pendingAccount).toBeFocused();
  expect(await heading.boundingBox()).toEqual(headingBefore);
  expect(await voiceDubbing.boundingBox()).toEqual(voiceDubbingBefore);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(640);

  releaseRequest();
  await expect(page.getByRole("alert")).toHaveText("Sign out did not finish.");
  await expect(account).toBeFocused();
  const retry = page.getByRole("button", {
    exact: true,
    name: "Sign out again",
  });
  const language = page.getByRole("group", {
    name: /Guardian guidance language|家长指导语言/,
  });
  const routeControl = page.getByRole("button", {
    name: "Switch to learner",
  });
  const [
    retryBox,
    headingAfter,
    voiceDubbingAfter,
    languageBox,
    routeBox,
    accountBox,
  ] = await Promise.all([
    retry.boundingBox(),
    heading.boundingBox(),
    voiceDubbing.boundingBox(),
    language.boundingBox(),
    routeControl.boundingBox(),
    account.boundingBox(),
  ]);
  expect(retryBox).not.toBeNull();
  expect(headingAfter!.y - headingBefore!.y).toBe(48);
  expect(voiceDubbingAfter!.y - voiceDubbingBefore!.y).toBe(48);
  expect(retryBox!.y).toBeGreaterThanOrEqual(
    accountBox!.y + accountBox!.height,
  );
  expect(boxesOverlap(retryBox!, languageBox!)).toBe(false);
  expect(boxesOverlap(retryBox!, routeBox!)).toBe(false);
  expect(boxesOverlap(retryBox!, accountBox!)).toBe(false);

  await page.keyboard.press("Tab");
  await expect(retry).toBeFocused();
  const retryPaint = await focusedPaintBox(retry);
  expect(retryPaint.x).toBeGreaterThanOrEqual(0);
  expect(retryPaint.y).toBeGreaterThanOrEqual(0);
  expect(retryPaint.x + retryPaint.width).toBeLessThanOrEqual(640);
  expect(retryPaint.y + retryPaint.height).toBeLessThanOrEqual(360);
});

test("sign-out recovery keeps text-spacing focus clear of the narrow dashboard", async ({
  page,
}) => {
  await page.route("**/api/auth/sign-out", (route) => route.abort("failed"));
  await page.setViewportSize({ height: 568, width: 280 });
  await page.goto(guardianPath("/guardian"));
  await applyTextSpacing(page);

  const heading = page.getByRole("heading", { name: "Guardian dashboard" });
  const account = page.getByRole("button", {
    name: "Profile for ⁨Alex Guardian⁩, guardian mode",
  });
  await account.click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("alert")).toHaveText("Sign out did not finish.");
  await expect(account).toBeFocused();
  const retry = page.getByRole("button", {
    exact: true,
    name: "Sign out again",
  });
  const [retryBox, languageBox, routeBox, accountBox, headingBox] =
    await Promise.all([
      retry.boundingBox(),
      page
        .getByRole("group", { name: /Guardian guidance language|家长指导语言/ })
        .boundingBox(),
      page.getByRole("button", { name: "Switch to learner" }).boundingBox(),
      account.boundingBox(),
      heading.boundingBox(),
    ]);
  expect(retryBox).not.toBeNull();
  expect(languageBox).not.toBeNull();
  expect(routeBox).not.toBeNull();
  expect(accountBox).not.toBeNull();
  expect(headingBox).not.toBeNull();
  expect(retryBox!.y).toBeGreaterThanOrEqual(
    accountBox!.y + accountBox!.height,
  );
  expect(boxesOverlap(retryBox!, languageBox!)).toBe(false);
  expect(boxesOverlap(retryBox!, routeBox!)).toBe(false);
  expect(boxesOverlap(retryBox!, accountBox!)).toBe(false);
  expect(
    headingBox!.y - (retryBox!.y + retryBox!.height),
  ).toBeGreaterThanOrEqual(8);
  await page.keyboard.press("Tab");
  await expect(retry).toBeFocused();
  const retryPaint = await focusedPaintBox(retry);
  expect(retryPaint.x).toBeGreaterThanOrEqual(0);
  expect(retryPaint.y).toBeGreaterThanOrEqual(0);
  expect(retryPaint.x + retryPaint.width).toBeLessThanOrEqual(280);
  expect(retryPaint.y + retryPaint.height).toBeLessThanOrEqual(568);
  expect(boxesOverlap(retryPaint, headingBox!)).toBe(false);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(280);
});

test("learner lesson HUD excludes sign-out recovery controls", async ({
  page,
}) => {
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto(
    "/lessons/parrot/01-peppas-high-ball/scenes/1?parrotE2eLesson=held-cue-no-consent",
  );
  await page.getByRole("button", { exact: true, name: "Let's go" }).click();
  const speech = page
    .getByRole("region", { name: "Join in" })
    .filter({ hasText: "It is up high!" });
  await expect(
    speech.getByText("It is up high!", { exact: true }),
  ).toBeVisible();
  await expect(speech.getByRole("status")).toHaveCount(0);
  await waitForVisualAssets(page);
  await applyTextSpacing(page);

  const hud = page.getByRole("region", { name: "Lesson progress" });
  await expect(hud).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Sign out again" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(640);
});
