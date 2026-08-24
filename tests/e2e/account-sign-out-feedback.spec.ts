import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const artifactDirectory = resolve(
  "artifacts/ux-review/account-sign-out-feedback/implementation",
);

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
    const headingBefore = await heading.boundingBox();
    await account.click();
    const startedAt = Date.now();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await requestStarted;
    expect(Date.now() - startedAt).toBeLessThan(500);

    const status = page
      .getByRole("complementary", { name: "Account" })
      .getByRole("status");
    const pendingAccount = page.getByRole("button", {
      exact: true,
      name: "Signing out… Account for Mia",
    });
    await expect(status).toHaveText("Signing out…");
    await expect(status).toBeVisible();
    await expect(pendingAccount).toBeFocused();
    await expect(pendingAccount).toHaveAttribute("aria-disabled", "true");
    await expect(pendingAccount).toHaveAttribute("title", "Account");
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

    mkdirSync(artifactDirectory, { recursive: true });
    await page.screenshot({
      animations: "disabled",
      path: resolve(
        artifactDirectory,
        `signing-out-${viewport.width}x${viewport.height}.png`,
      ),
    });

    releaseRequest();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(account).not.toHaveAttribute("aria-disabled", "true");
    await expect(status).toHaveText("");
    await account.click();
    await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
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

  mkdirSync(artifactDirectory, { recursive: true });
  await page.screenshot({
    animations: "disabled",
    path: resolve(
      artifactDirectory,
      "signing-out-forced-colors-reduced-motion-640x360.png",
    ),
  });

  releaseRequest();
  await expect(page.getByRole("alert")).toBeVisible();
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

  mkdirSync(artifactDirectory, { recursive: true });
  await page.screenshot({
    animations: "disabled",
    path: resolve(
      artifactDirectory,
      "signing-out-lesson-player-640x360.png",
    ),
  });

  releaseRequest();
  await expect(page.getByRole("alert")).toBeVisible();
});
