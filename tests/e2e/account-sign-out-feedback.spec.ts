import { expect, test, type Locator } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const artifactDirectory = resolve(
  "artifacts/ux-review/account-sign-out-feedback/implementation",
);
const recoveryArtifactDirectory = resolve(
  "artifacts/ux-review/account-sign-out-recovery/implementation",
);
const shouldCaptureEvidence =
  process.env.PARROT_CAPTURE_SIGN_OUT_EVIDENCE === "1";
const shouldCaptureRecoveryEvidence =
  process.env.PARROT_CAPTURE_SIGN_OUT_RECOVERY_EVIDENCE === "1";

type Rect = { height: number; width: number; x: number; y: number };

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

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function roundRect(rect: Rect) {
  return {
    height: round(rect.height),
    width: round(rect.width),
    x: round(rect.x),
    y: round(rect.y),
  };
}

function summarize(samples: number[]) {
  const ordered = [...samples].sort((first, second) => first - second);
  const percentile = (value: number) =>
    ordered[Math.max(0, Math.ceil(ordered.length * value) - 1)];
  return {
    maximum: round(ordered.at(-1) ?? 0),
    median: round(percentile(0.5)),
    minimum: round(ordered[0] ?? 0),
    p95: round(percentile(0.95)),
  };
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
    await page.goto("/lessons");
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images].map((image) =>
          image.complete ? Promise.resolve() : image.decode().catch(() => {}),
        ),
      );
    });

    const account = page.getByRole("button", { name: "Account for Mia" });
    const heading = page.getByRole("heading", { name: "Pick a lesson" });
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
      name: "Signing out… Account for Mia",
    });
    await expect(pendingAccount).toBeFocused();
    await expect(pendingAccount).toHaveAttribute("aria-disabled", "true");
    expect(await pendingAccount.getAttribute("title")).toBeNull();
    await expect(pendingAccount.getByText("Signing out…")).toHaveCount(0);
    expect(
      await status.evaluate((message) => getComputedStyle(message).color),
    ).toBe(
      await pendingAccount.evaluate((control) => getComputedStyle(control).color),
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
      await pendingAccount.evaluate((control) => getComputedStyle(control).cursor),
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

    if (shouldCaptureEvidence) {
      mkdirSync(artifactDirectory, { recursive: true });
      await page.screenshot({
        animations: "disabled",
        path: resolve(
          artifactDirectory,
          `signing-out-${viewport.width}x${viewport.height}.png`,
        ),
      });
    }

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
    await expect(retry).toBeVisible();
    const [failureAccountBox, retryBox, headingAfterFailure, backBox] =
      await Promise.all([
        account.boundingBox(),
        retry.boundingBox(),
        heading.boundingBox(),
        page.getByRole("link", { name: "Back to home" }).boundingBox(),
      ]);
    expect(failureAccountBox).not.toBeNull();
    expect(retryBox).not.toBeNull();
    expect(headingAfterFailure).toEqual(headingBefore);
    expect(backBox).not.toBeNull();
    expect(Math.round(retryBox!.height)).toBeGreaterThanOrEqual(44);
    expect(Math.round(retryBox!.width)).toBeGreaterThanOrEqual(44);
    expect(retryBox!.x + retryBox!.width).toBeLessThanOrEqual(
      failureAccountBox!.x,
    );
    expect(boxesOverlap(retryBox!, headingAfterFailure!)).toBe(false);
    expect(boxesOverlap(retryBox!, backBox!)).toBe(false);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);

    if (shouldCaptureRecoveryEvidence) {
      mkdirSync(recoveryArtifactDirectory, { recursive: true });
      await page.screenshot({
        animations: "disabled",
        path: resolve(
          recoveryArtifactDirectory,
          `failure-${viewport.width}x${viewport.height}.png`,
        ),
      });
    }

    await page.keyboard.press("Tab");
    await expect(retry).toBeFocused();
    const retryPaint = await focusedPaintBox(retry);
    expect(retryPaint.x).toBeGreaterThanOrEqual(0);
    expect(retryPaint.y).toBeGreaterThanOrEqual(0);
    expect(retryPaint.x + retryPaint.width).toBeLessThanOrEqual(viewport.width);
    expect(retryPaint.y + retryPaint.height).toBeLessThanOrEqual(
      viewport.height,
    );
    expect(boxesOverlap(retryPaint, headingAfterFailure!)).toBe(false);
    expect(boxesOverlap(retryPaint, backBox!)).toBe(false);
    expect(boxesOverlap(retryPaint, failureAccountBox!)).toBe(false);

    if (shouldCaptureRecoveryEvidence && viewport.width === 280) {
      await page.screenshot({
        animations: "disabled",
        path: resolve(
          recoveryArtifactDirectory,
          `retry-focus-${viewport.width}x${viewport.height}.png`,
        ),
      });
    }

    await retry.evaluate((control) => {
      control.click();
      control.click();
    });
    await expect(account).toBeFocused();
    await expect(alert).toHaveText("Sign out did not finish.");
    await expect.poll(() => requestCount).toBe(2);

    await account.click();
    await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  });
}

if (shouldCaptureRecoveryEvidence) {
  test("records sign-out recovery geometry and local feedback timing", async ({
    page,
  }) => {
    const geometry = [];
    const timingSamples = [];

    await page.route("**/api/auth/sign-out", (route) =>
      route.abort("failed"),
    );

    for (const viewport of viewports) {
      for (let sample = 1; sample <= 5; sample += 1) {
        await page.setViewportSize(viewport);
        await page.goto("/lessons");
        await page.evaluate(async () => {
          await document.fonts.ready;
        });

        const account = page.getByRole("button", { name: "Account for Mia" });
        await account.click();
        const signOut = page.getByRole("menuitem", { name: "Sign out" });
        await signOut.evaluate((control) => {
          const alert = document.querySelector<HTMLElement>("[role='alert']");
          if (!alert) {
            throw new Error("The persistent sign-out alert was not mounted.");
          }

          const measurement = {
            alertMutationMilliseconds: null as number | null,
            nextFrameMilliseconds: null as number | null,
            startedAt: 0,
          };
          (
            window as Window & {
              __signOutRecoveryTiming?: typeof measurement;
            }
          ).__signOutRecoveryTiming = measurement;

          const observer = new MutationObserver(() => {
            if (
              alert.textContent?.trim() !== "Sign out did not finish." ||
              measurement.alertMutationMilliseconds !== null
            ) {
              return;
            }
            measurement.alertMutationMilliseconds =
              performance.now() - measurement.startedAt;
            requestAnimationFrame(() => {
              measurement.nextFrameMilliseconds =
                performance.now() - measurement.startedAt;
              observer.disconnect();
            });
          });
          observer.observe(alert, {
            characterData: true,
            childList: true,
            subtree: true,
          });
          control.addEventListener(
            "click",
            () => {
              measurement.startedAt = performance.now();
            },
            { capture: true, once: true },
          );
        });

        await signOut.click();
        await page.waitForFunction(
          () =>
            typeof (
              window as Window & {
                __signOutRecoveryTiming?: {
                  nextFrameMilliseconds: number | null;
                };
              }
            ).__signOutRecoveryTiming?.nextFrameMilliseconds === "number",
        );
        const timing = await page.evaluate(() => {
          const measurement = (
            window as Window & {
              __signOutRecoveryTiming?: {
                alertMutationMilliseconds: number | null;
                nextFrameMilliseconds: number | null;
              };
            }
          ).__signOutRecoveryTiming;
          if (
            measurement?.alertMutationMilliseconds === null ||
            measurement?.alertMutationMilliseconds === undefined ||
            measurement.nextFrameMilliseconds === null
          ) {
            throw new Error("Sign-out recovery timing was incomplete.");
          }
          return {
            alertMutationMilliseconds: measurement.alertMutationMilliseconds,
            nextFrameMilliseconds: measurement.nextFrameMilliseconds,
          };
        });
        timingSamples.push({
          alertMutationMilliseconds: round(timing.alertMutationMilliseconds),
          nextFrameMilliseconds: round(timing.nextFrameMilliseconds),
          sample,
          viewport: `${viewport.width}x${viewport.height}`,
        });

        if (sample !== 1) {
          continue;
        }

        const alert = page.getByRole("alert");
        const retry = page.getByRole("button", {
          exact: true,
          name: "Sign out again",
        });
        await expect(alert).toHaveText("Sign out did not finish.");
        await expect(account).toBeFocused();
        const back = page.getByRole("link", { name: "Back to home" });
        const heading = page.getByRole("heading", { name: "Pick a lesson" });
        const [accountBox, retryBox, backBox, headingBox] = await Promise.all([
          account.boundingBox(),
          retry.boundingBox(),
          back.boundingBox(),
          heading.boundingBox(),
        ]);
        expect(accountBox).not.toBeNull();
        expect(retryBox).not.toBeNull();
        expect(backBox).not.toBeNull();
        expect(headingBox).not.toBeNull();
        const retryElement = await retry.elementHandle();
        if (!retryElement) {
          throw new Error("The sign-out retry control was not mounted.");
        }
        const accountPrecedesRetry = await account.evaluate(
          (accountControl, retryControl) =>
            Boolean(
              accountControl.compareDocumentPosition(retryControl) &
                Node.DOCUMENT_POSITION_FOLLOWING,
            ),
          retryElement,
        );
        await page.keyboard.press("Tab");
        await expect(retry).toBeFocused();
        geometry.push({
          account: roundRect(accountBox!),
          accountPrecedesRetryInDom: accountPrecedesRetry,
          alertText: await alert.textContent(),
          back: roundRect(backBox!),
          documentWidth: await page.evaluate(
            () => document.documentElement.scrollWidth,
          ),
          heading: roundRect(headingBox!),
          retry: roundRect(retryBox!),
          retryFocusPaint: roundRect(await focusedPaintBox(retry)),
          viewport,
        });
      }
    }

    const alertMutationSamples = timingSamples.map(
      (sample) => sample.alertMutationMilliseconds,
    );
    const nextFrameSamples = timingSamples.map(
      (sample) => sample.nextFrameMilliseconds,
    );
    const evidence = {
      capture: {
        browser: "Playwright Chromium",
        conditions:
          "Local Vite server; sign-out request aborted immediately; five fresh document loads per viewport.",
        implementationCommit: "fdd5897e3a7a1e12dc76f74ed77c7ca1ac3ce8be",
      },
      geometry,
      timing: {
        clickToAlertDomMutationMilliseconds: {
          samples: alertMutationSamples,
          summary: summarize(alertMutationSamples),
        },
        clickToNextAnimationFrameMilliseconds: {
          samples: nextFrameSamples,
          summary: summarize(nextFrameSamples),
        },
        samples: timingSamples,
      },
    };
    mkdirSync(resolve(recoveryArtifactDirectory, ".."), { recursive: true });
    writeFileSync(
      resolve(recoveryArtifactDirectory, "..", "capture-metrics.json"),
      `${JSON.stringify(evidence, null, 2)}\n`,
    );
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
  await page.goto("/lessons");

  const account = page.getByRole("button", { name: "Account for Mia" });
  await account.focus();
  await account.press("ArrowDown");
  await page.getByRole("menuitem", { name: "Delete account" }).press("ArrowUp");
  await page.getByRole("menuitem", { name: "Sign out" }).press("Enter");

  const status = page.getByRole("status").filter({ hasText: "Signing out…" });
  const pendingAccount = page.getByRole("button", {
    exact: true,
    name: "Signing out… Account for Mia",
  });
  await expect(status).toBeVisible();
  await expect(pendingAccount).toBeFocused();
  expect(
    await status.locator("svg").evaluate((spinner) =>
      getComputedStyle(spinner).animationName,
    ),
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

  if (shouldCaptureEvidence) {
    mkdirSync(artifactDirectory, { recursive: true });
    await page.screenshot({
      animations: "disabled",
      path: resolve(
        artifactDirectory,
        "signing-out-forced-colors-reduced-motion-640x360.png",
      ),
    });
  }

  releaseRequest();
  await expect(page.getByRole("alert")).toHaveText(
    "Sign out did not finish.",
  );
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

  if (shouldCaptureRecoveryEvidence) {
    mkdirSync(recoveryArtifactDirectory, { recursive: true });
    await page.screenshot({
      animations: "disabled",
      path: resolve(
        recoveryArtifactDirectory,
        "retry-forced-colors-reduced-motion-640x360.png",
      ),
    });
  }
});

test("sign-out feedback stays clear over the dense lesson player", async ({
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
  await page.goto("/lessons/parrot/01-peppas-high-ball/scenes/1");
  await page.evaluate(() => {
    class HeldAudio {
      onended: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      pause() {}

      play() {
        return Promise.resolve();
      }
    }
    Object.defineProperty(window, "Audio", {
      configurable: true,
      value: HeldAudio,
    });
  });
  await page.getByRole("button", { name: "Start lesson" }).click();

  const hud = page.getByRole("region", { name: "Lesson progress" });
  const speech = page.getByRole("status").filter({ hasText: "Look! My ball!" });
  const [hudBefore, speechBefore] = await Promise.all([
    hud.boundingBox(),
    speech.boundingBox(),
  ]);
  const account = page.getByRole("button", { name: "Account for Mia" });
  await account.click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();

  const pending = page.getByRole("status").filter({ hasText: "Signing out…" });
  const pendingAccount = page.getByRole("button", {
    exact: true,
    name: "Signing out… Account for Mia",
  });
  await expect(pending).toBeVisible();
  await expect(pendingAccount).toBeFocused();
  expect(await hud.boundingBox()).toEqual(hudBefore);
  expect(await speech.boundingBox()).toEqual(speechBefore);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(640);

  if (shouldCaptureEvidence) {
    mkdirSync(artifactDirectory, { recursive: true });
    await page.screenshot({
      animations: "disabled",
      path: resolve(
        artifactDirectory,
        "signing-out-lesson-player-640x360.png",
      ),
    });
  }

  releaseRequest();
  await expect(page.getByRole("alert")).toHaveText(
    "Sign out did not finish.",
  );
  await expect(account).toBeFocused();
  const retry = page.getByRole("button", {
    exact: true,
    name: "Sign out again",
  });
  const [retryBox, hudAfter, speechAfter] = await Promise.all([
    retry.boundingBox(),
    hud.boundingBox(),
    speech.boundingBox(),
  ]);
  expect(retryBox).not.toBeNull();
  expect(hudAfter).toEqual(hudBefore);
  expect(speechAfter).toEqual(speechBefore);
  expect(boxesOverlap(retryBox!, hudAfter!)).toBe(false);
  expect(boxesOverlap(retryBox!, speechAfter!)).toBe(false);

  if (shouldCaptureRecoveryEvidence) {
    mkdirSync(recoveryArtifactDirectory, { recursive: true });
    await page.screenshot({
      animations: "disabled",
      path: resolve(
        recoveryArtifactDirectory,
        "failure-lesson-player-640x360.png",
      ),
    });
  }

  await page.keyboard.press("Tab");
  await expect(retry).toBeFocused();
  const retryPaint = await focusedPaintBox(retry);
  expect(boxesOverlap(retryPaint, hudAfter!)).toBe(false);
  expect(boxesOverlap(retryPaint, speechAfter!)).toBe(false);

  if (shouldCaptureRecoveryEvidence) {
    await page.screenshot({
      animations: "disabled",
      path: resolve(
        recoveryArtifactDirectory,
        "retry-focus-lesson-player-640x360.png",
      ),
    });
  }
});
