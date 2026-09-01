import { expect, test } from "@playwright/test";

const languageGroup = (page: import("@playwright/test").Page) =>
  page.getByRole("group", { name: /Guardian guidance language|家长指导语言/ });

async function expectUnchangedNavigation(
  page: import("@playwright/test").Page,
  snapshot: { historyLength: number; href: string },
) {
  await expect.poll(() => page.evaluate(() => location.href)).toBe(snapshot.href);
  await expect.poll(() => page.evaluate(() => history.length)).toBe(
    snapshot.historyLength,
  );
}

test("language selection persists locally without changing login navigation", async ({ page }) => {
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ contentType: "application/json", json: null }),
  );
  await page.goto("/login");
  await expect(languageGroup(page)).toBeVisible();
  const snapshot = await page.evaluate(() => ({
    historyLength: history.length,
    href: location.href,
  }));

  const chinese = page.getByRole("button", { exact: true, name: "中文" });
  await chinese.click();
  await expect(chinese).toBeFocused();
  await expectUnchangedNavigation(page, snapshot);
  await expect(chinese).toHaveAttribute("aria-pressed", "true");
  await expect(chinese).toHaveAttribute("lang", "zh-Hans");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");

  await page.reload();
  await expect(languageGroup(page)).toHaveAttribute("lang", "zh-Hans");
  await expect(chinese).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");
});

test("language control is always visible and keeps learner documents English", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("parrot:guardian-language", "zh-Hans"),
  );
  for (const route of [
    "/guardian?parrotE2eGuardian=guardian",
    "/guardian/learners/e2e-learner?parrotE2eGuardian=guardian",
    "/lessons/parrot/01-peppas-high-ball/scenes/1",
    "/login",
  ]) {
    await page.goto(route);
    await expect(languageGroup(page)).toBeVisible();
  }

  await page.goto("/lessons");
  await expect(languageGroup(page)).toHaveAttribute("lang", "zh-Hans");
  await expect(page.getByRole("button", { exact: true, name: "中文" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("language control remains available when the session check fails", async ({ page }) => {
  await page.route("**/api/auth/get-session", (route) => route.abort("failed"));
  await page.goto("/login");
  await expect(languageGroup(page)).toBeVisible();
});

test("browser Chinese preference is inferred without a persistence write", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("parrot:guardian-language");
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      value: ["zh-CN", "en-US"],
    });
  });
  await page.goto("/login");
  await expect(page.getByRole("button", { exact: true, name: "中文" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("parrot:guardian-language")))
    .toBeNull();
});

test("guardian document language changes immediately while learner document language stays English", async ({ page }) => {
  await page.goto("/guardian?parrotE2eGuardian=guardian");
  const guardianSnapshot = await page.evaluate(() => ({
    historyLength: history.length,
    href: location.href,
  }));
  await page.getByRole("button", { exact: true, name: "中文" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");
  await expectUnchangedNavigation(page, guardianSnapshot);

  await page.goto("/lessons");
  const learnerSnapshot = await page.evaluate(() => ({
    historyLength: history.length,
    href: location.href,
  }));
  await page.getByRole("button", { exact: true, name: "English" }).click();
  await page.getByRole("button", { exact: true, name: "中文" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("button", { exact: true, name: "中文" })).toHaveAttribute(
    "lang",
    "zh-Hans",
  );
  await expectUnchangedNavigation(page, learnerSnapshot);
});
