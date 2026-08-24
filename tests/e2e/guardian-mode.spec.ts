import { expect, test, type Locator, type Page } from "@playwright/test";

const GUARDIAN_PASSWORD = "e2e-guardian-password";
const LOCK_ERROR =
  "Could not lock guardian mode. Try again before handing over the device.";
const requiredViewports = [
  { width: 280, height: 568 },
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 640, height: 360 },
  { width: 1440, height: 900 },
];

type Rect = { height: number; width: number; x: number; y: number };

async function visibleBox(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function expectInsideViewport(
  locator: Locator,
  viewport: { height: number; width: number },
) {
  const box = await visibleBox(locator);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  return box;
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
}

function boxesOverlap(first: Rect, second: Rect) {
  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}

async function expectNoOverlap(first: Locator, second: Locator) {
  expect(boxesOverlap(await visibleBox(first), await visibleBox(second))).toBe(
    false,
  );
}

function guardianUrl(path: string, scenario: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}parrotE2eGuardian=${scenario}`;
}

async function openModeSwitch(page: Page, mode: "guardian" | "learner") {
  const switcher = page.getByRole("group", { name: "Choose profile mode" });
  if (await switcher.isVisible()) return switcher;
  const trigger = page.getByRole("button", {
    name: new RegExp(`Profile for .+, ${mode} mode`),
  });
  await trigger.click();
  return switcher;
}

async function unlockFromMenu(page: Page) {
  const switcher = await openModeSwitch(page, "learner");
  await switcher.getByRole("button", { name: "Guardian" }).click();
  const dialog = page.getByRole("dialog", { name: "Unlock guardian mode" });
  await dialog.getByLabel("Password").fill(GUARDIAN_PASSWORD);
  await dialog.getByRole("button", { name: "Unlock guardian mode" }).click();
  await expect(dialog).toHaveCount(0);
}

for (const viewport of requiredViewports) {
  test(`profile switch remains contained at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const trigger = page.getByRole("button", {
      name: /Profile for Mia, learner mode/,
    });
    const switcher = await openModeSwitch(page, "learner");
    const identity = page.getByRole("group", { name: "Active profile" });

    await expectInsideViewport(trigger, viewport);
    await expectInsideViewport(switcher, viewport);
    const identityBox = await visibleBox(identity);
    const switcherBox = await visibleBox(switcher);
    await expect(identity.locator("xpath=following-sibling::*[1]")).toHaveAttribute(
      "aria-label",
      "Choose profile mode",
    );
    const switcherGap = switcherBox.y - (identityBox.y + identityBox.height);
    expect(switcherGap).toBeGreaterThanOrEqual(0);
    expect(switcherGap).toBeLessThanOrEqual(16);
    await expect(
      switcher.getByRole("button", { name: "Learner" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      switcher.getByRole("button", { name: "Guardian" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(await horizontalOverflow(page)).toBe(false);

    await switcher.getByRole("button", { name: "Guardian" }).click();
    const dialog = page.getByRole("dialog", { name: "Unlock guardian mode" });
    await expectInsideViewport(dialog, viewport);
    await dialog.getByRole("button", { name: "Cancel" }).click();
  });
}

test("incorrect password keeps learner mode and the unlock dialog open", async ({
  page,
}) => {
  const viewport = { width: 280, height: 568 };
  await page.setViewportSize(viewport);
  await page.goto("/");
  const switcher = await openModeSwitch(page, "learner");
  await switcher.getByRole("button", { name: "Guardian" }).click();
  const dialog = page.getByRole("dialog", { name: "Unlock guardian mode" });
  const password = dialog.getByLabel("Password");

  await expect(password).toBeFocused();
  await password.fill("wrong-password");
  await dialog.getByRole("button", { name: "Unlock guardian mode" }).click();

  await expect(dialog.getByRole("alert")).toHaveText(
    "The password did not match this account.",
  );
  await expect(dialog).toBeVisible();
  await expectInsideViewport(dialog, viewport);
  await expect(page).toHaveURL("/");
  expect(await horizontalOverflow(page)).toBe(false);
});

test("unlock request failure never navigates to guardian content", async ({
  page,
}) => {
  await page.goto(guardianUrl("/", "unlock-error"));
  const switcher = await openModeSwitch(page, "learner");
  await switcher.getByRole("button", { name: "Guardian" }).click();
  const dialog = page.getByRole("dialog", { name: "Unlock guardian mode" });
  await dialog.getByLabel("Password").fill(GUARDIAN_PASSWORD);
  await dialog.getByRole("button", { name: "Unlock guardian mode" }).click();

  await expect(dialog.getByRole("alert")).toHaveText(
    "Guardian access could not be checked. Please try again.",
  );
  await expect(page.getByRole("heading", { name: "Guardian dashboard" })).toHaveCount(0);
  await expect(page).toHaveURL(guardianUrl("/", "unlock-error"));
});

test("successful unlock opens guardian management and announces the fifteen-minute window", async ({
  page,
}) => {
  await page.goto("/");
  await unlockFromMenu(page);

  await expect(page).toHaveURL("/guardian");
  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toBeFocused();
  await expect(
    page.getByRole("status").filter({
      hasText: "Guardian mode unlocked for 15 minutes",
    }),
  ).toHaveText("Guardian mode unlocked for 15 minutes");

  for (const heading of [
    "Learner profile",
    "My Lessons",
    "Story settings",
    "Account and privacy",
  ]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }

  const switcher = await openModeSwitch(page, "guardian");
  await expect(
    switcher.getByRole("button", { name: "Guardian" }),
  ).toHaveAttribute("aria-pressed", "true");
  const menu = page.getByRole("menu", { name: "Account menu" });
  for (const item of [
    "Learner profile",
    "AI and saved data",
    "Sign out",
    "Delete account",
  ]) {
    await expect(menu.getByRole("menuitem", { name: item })).toBeVisible();
  }
});

test("a locked guardian deep link never flashes protected content", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const inspected = new WeakSet<Node>();
    const inspect = (node: Node) => {
      if (inspected.has(node)) return;
      inspected.add(node);
      if (
        node instanceof HTMLHeadingElement &&
        node.textContent?.trim() === "Story settings"
      ) {
        (window as Window & { __protectedHeadingSeen?: boolean })
          .__protectedHeadingSeen = true;
      }
      node.childNodes.forEach(inspect);
    };
    document.addEventListener("DOMContentLoaded", () => {
      inspect(document.body);
      new MutationObserver((records) => {
        records.forEach((record) => record.addedNodes.forEach(inspect));
      }).observe(document.body, { childList: true, subtree: true });
    });
  });
  await page.goto("/guardian/stories");

  await expect(
    page.getByRole("heading", { name: "Unlock guardian mode" }),
  ).toBeVisible();
  await expect(page).toHaveURL("/guardian/stories");
  await expect(page.getByRole("heading", { name: "Story settings" })).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as Window & { __protectedHeadingSeen?: boolean })
          .__protectedHeadingSeen ?? false,
    ),
  ).toBe(false);
});

test("a valid guardian unlock resumes after refresh", async ({
  page,
}) => {
  await page.goto("/");
  await unlockFromMenu(page);
  await page.reload();

  await expect(
    page.getByRole("heading", { name: "Guardian dashboard" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Profile for Mia, guardian mode/ }),
  ).toBeVisible();
});

test("a seeded guardian expiry stays fixed across refresh", async ({ page }) => {
  await page.goto(guardianUrl("/", "guardian"));
  await expect(
    page.getByRole("button", { name: /Profile for Mia, guardian mode/ }),
  ).toBeVisible();
  const expiresAtBeforeRefresh = await page.evaluate(async () => {
    const response = await fetch("/api/guardian-access");
    const access = (await response.json()) as { expiresAt?: string };
    return access.expiresAt;
  });

  await page.reload();

  const expiresAtAfterRefresh = await page.evaluate(async () => {
    const response = await fetch("/api/guardian-access");
    const access = (await response.json()) as { expiresAt?: string };
    return access.expiresAt;
  });
  expect(expiresAtBeforeRefresh).toBeTruthy();
  expect(expiresAtAfterRefresh).toBe(expiresAtBeforeRefresh);
});

test("an expired guardian session returns the same deep link to the password gate", async ({
  page,
}) => {
  await page.goto(guardianUrl("/guardian/lessons", "expired"));
  await expect(page.getByRole("heading", { name: "My Lessons" })).toBeVisible();
  await page.waitForTimeout(1_000);
  await page.evaluate(() => {
    window.history.pushState(null, "", "/guardian/stories");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByRole("heading", { name: "Story settings" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Unlock guardian mode" }),
  ).toBeVisible({ timeout: 1_500 });
  await expect(page).toHaveURL("/guardian/stories");
  await expect(page.getByRole("heading", { name: "Story settings" })).toHaveCount(0);
});

test("failed dashboard lock preserves guardian content and navigation", async ({
  page,
}) => {
  const url = guardianUrl("/guardian", "lock-error");
  await page.goto(url);
  const dashboard = page.getByRole("heading", { name: "Guardian dashboard" });
  await expect(dashboard).toBeVisible();

  await page.getByRole("button", { name: "Switch to learner" }).click();

  await expect(
    page.getByRole("main").getByRole("alert"),
  ).toHaveText(LOCK_ERROR);
  await expect(dashboard).toBeVisible();
  await expect(page).toHaveURL(url);
});

test("failed learner-boundary lock preserves the requested learner route", async ({
  page,
}) => {
  const url = guardianUrl("/lessons", "lock-error");
  await page.goto(url);
  const boundary = page.getByRole("heading", { name: "Switch to learner mode" });
  await expect(boundary).toBeVisible();

  await page.getByRole("button", { name: "Switch to learner mode" }).click();

  await expect(
    page.getByRole("main").getByRole("alert"),
  ).toHaveText(LOCK_ERROR);
  await expect(boundary).toBeVisible();
  await expect(page).toHaveURL(url);
});

test("successful lock returns to learner home before exposing activities", async ({
  page,
}) => {
  await page.goto(guardianUrl("/guardian", "guardian"));
  await page.getByRole("button", { name: "Switch to learner" }).click();

  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("navigation", { name: "Learning activities" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Profile for Mia, learner mode/ }),
  ).toBeVisible();
});

test("cancel and Escape restore focus while account-menu keys follow rendered items", async ({
  page,
}) => {
  await page.goto("/");
  const trigger = page.getByRole("button", {
    name: /Profile for Mia, learner mode/,
  });
  await trigger.click();
  const guardian = page
    .getByRole("group", { name: "Choose profile mode" })
    .getByRole("button", { name: "Guardian" });
  await guardian.click();
  const dialog = page.getByRole("dialog", { name: "Unlock guardian mode" });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(guardian).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();

  await page.goto(guardianUrl("/guardian", "guardian"));
  const guardianTrigger = page.getByRole("button", {
    name: /Profile for Mia, guardian mode/,
  });
  await guardianTrigger.click();
  const menu = page.getByRole("menu", { name: "Account menu" });
  const profile = menu.getByRole("menuitem", { name: "Learner profile" });
  const data = menu.getByRole("menuitem", { name: "AI and saved data" });
  const deletion = menu.getByRole("menuitem", { name: "Delete account" });
  await expect(profile).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(data).toBeFocused();
  await page.keyboard.press("End");
  await expect(deletion).toBeFocused();
  await page.keyboard.press("Home");
  await expect(profile).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(guardianTrigger).toBeFocused();
  await expect(menu).toHaveCount(0);
});

test("learner home, lesson shelf, and story shelf omit management actions", async ({
  page,
}) => {
  for (const path of ["/", "/lessons", "/stories"]) {
    await page.goto(path);
    const switcher = await openModeSwitch(page, "learner");
    await expect(
      switcher.getByRole("button", { name: "Learner" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("menuitem")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /Create custom lesson|Edit lesson/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: /Sign out|Delete account|Upload learner photo|Generate story art/,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("group", { name: "Choose story level" }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
  }
});

for (const viewport of [
  { width: 280, height: 568 },
  { width: 640, height: 360 },
  { width: 1440, height: 900 },
]) {
  test(`learner lesson activity remains contained at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/lessons/parrot/01-peppas-high-ball/scenes/1");
    const profile = page.getByRole("button", {
      name: /Profile for Mia, learner mode/,
    });
    const back = page.getByRole("button", { name: "Back to lesson list" });
    const start = page.getByRole("button", { name: "Start lesson" });
    await expectInsideViewport(profile, viewport);
    await expectInsideViewport(back, viewport);
    await expectInsideViewport(start, viewport);
    await expectNoOverlap(profile, back);

    await page.evaluate(() => {
      class HeldAudio {
        onended: ((event: Event) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;
        pause() {}
        async play() {}
      }
      Object.defineProperty(window, "Audio", {
        configurable: true,
        value: HeldAudio,
      });
    });
    await start.click();

    const hud = page.getByRole("region", { name: "Lesson progress" });
    const speech = page.getByRole("status").filter({ hasText: "Look! My ball!" });
    const controls = page.getByRole("navigation", {
      name: "Lesson playback controls",
    });
    for (const element of [profile, back, hud, speech, controls]) {
      await expectInsideViewport(element, viewport);
    }
    await expectNoOverlap(profile, hud);
    await expectNoOverlap(back, hud);
    await expectNoOverlap(speech, controls);
    expect(await horizontalOverflow(page)).toBe(false);
  });
}
