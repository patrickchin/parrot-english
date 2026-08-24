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
    await expect(status).toHaveText("Signing out…");
    await expect(account).toBeFocused();
    await expect(account).toHaveAttribute("aria-disabled", "true");
    await expect(account.getByText("Signing out…")).toBeVisible();
    await expect(page.getByRole("menu", { name: "Account menu" })).toBeHidden();

    const [accountBox, headingDuring] = await Promise.all([
      account.boundingBox(),
      heading.boundingBox(),
    ]);
    expect(accountBox).not.toBeNull();
    expect(headingBefore).not.toBeNull();
    expect(headingDuring).toEqual(headingBefore);
    expect(accountBox!.x).toBeGreaterThanOrEqual(0);
    expect(accountBox!.x + accountBox!.width).toBeLessThanOrEqual(
      viewport.width,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);
    expect(
      await account.evaluate((control) => {
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
