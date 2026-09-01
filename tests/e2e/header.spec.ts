import { expect, test, type Locator, type Page } from "@playwright/test";

import { SHARED_GUEST_USER_ID } from "../../lib/shared-guest.ts";

interface HeaderRoute {
  mode?: "guardian" | "learner";
  name: string;
  path: string;
  control: { name: string; role: "button" | "link" };
}

interface Viewport {
  height: number;
  name: string;
  width: number;
}

interface AccountIdentity {
  email: string;
  name: string;
}

type Rect = { height: number; width: number; x: number; y: number };

const longAccountName = "Alexandria-Montgomery-Washington";
const longAccountEmail =
  "family.account.for.alexandria.montgomery@example.test";

const routes: HeaderRoute[] = [
  {
    name: "conversation",
    path: "/talk-to-peppa",
    control: { name: "Back", role: "button" },
  },
  {
    name: "lesson list",
    path: "/lessons",
    control: { name: "Back to home", role: "link" },
  },
  {
    name: "story library",
    path: "/stories",
    control: { name: "Back to home", role: "link" },
  },
  {
    name: "word game library",
    path: "/word-games",
    control: { name: "Back to home", role: "link" },
  },
  {
    name: "word game player",
    path: "/word-games/animals",
    control: { name: "Back to games", role: "link" },
  },
  {
    name: "story reader",
    path: "/stories/the-lantern-trail/pages/1",
    control: { name: "Back to stories", role: "link" },
  },
  {
    name: "lesson player",
    path: "/lessons/parrot/01-peppas-high-ball/scenes/1",
    control: { name: "Back to lesson list", role: "button" },
  },
  {
    name: "learner details",
    mode: "guardian",
    path: "/guardian/learners/e2e-learner",
    control: { name: "Back", role: "button" },
  },
  {
    name: "duck dubbing studio",
    path: "/dubs/five-little-ducks?parrotE2eDub=partial",
    control: { name: "Back to Nursery rhymes", role: "link" },
  },
  {
    name: "Old MacDonald dubbing studio",
    path: "/dubs/old-macdonald?parrotE2eDub=partial",
    control: { name: "Back to Nursery rhymes", role: "link" },
  },
];

const mobileViewports: Viewport[] = [
  { name: "ultra narrow", width: 280, height: 568 },
  { name: "small phone", width: 320, height: 568 },
  { name: "short phone", width: 360, height: 640 },
  { name: "regular phone", width: 390, height: 844 },
];

function guardianPath(path: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}parrotE2eGuardian=guardian`;
}

async function visibleBox(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function expectInsideViewport(locator: Locator, viewport: Viewport) {
  const box = await visibleBox(locator);

  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  return box;
}

function headerControl(page: Page, control: HeaderRoute["control"]) {
  return page.getByRole(control.role, { exact: true, name: control.name });
}

async function focusWithKeyboard(page: Page, locator: Locator) {
  if (await locator.evaluate((element) => element === document.activeElement)) {
    return;
  }

  for (let index = 0; index < 20; index += 1) {
    await page.keyboard.press("Tab");
    if (
      await locator.evaluate((element) => element === document.activeElement)
    ) {
      return;
    }
  }

  expect(
    await locator.evaluate((element) => element === document.activeElement),
  ).toBe(true);
}

async function renderedControlChrome(locator: Locator) {
  const box = await visibleBox(locator);
  const style = await locator.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      backgroundColor: computed.backgroundColor,
      borderBottomColor: computed.borderBottomColor,
      borderBottomStyle: computed.borderBottomStyle,
      borderBottomWidth: computed.borderBottomWidth,
      borderLeftColor: computed.borderLeftColor,
      borderLeftStyle: computed.borderLeftStyle,
      borderLeftWidth: computed.borderLeftWidth,
      borderRadius: computed.borderRadius,
      borderRightColor: computed.borderRightColor,
      borderRightStyle: computed.borderRightStyle,
      borderRightWidth: computed.borderRightWidth,
      borderTopColor: computed.borderTopColor,
      borderTopStyle: computed.borderTopStyle,
      borderTopWidth: computed.borderTopWidth,
      boxShadow: computed.boxShadow,
      color: computed.color,
      family: computed.fontFamily,
      paddingBottom: computed.paddingBottom,
      paddingLeft: computed.paddingLeft,
      paddingRight: computed.paddingRight,
      paddingTop: computed.paddingTop,
      size: computed.fontSize,
      weight: computed.fontWeight,
    };
  });

  return { height: box.height, ...style };
}

async function renderedFocusOutline(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      color: style.outlineColor,
      offset: style.outlineOffset,
      style: style.outlineStyle,
      width: style.outlineWidth,
    };
  });
}

async function renderedColors(locator: Locator) {
  await expect(locator).toBeVisible();
  return locator.evaluate((element) => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas color conversion is unavailable");
    canvas.width = 1;
    canvas.height = 1;

    const toRgba = (value: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    };
    const style = getComputedStyle(element);
    return {
      background: toRgba(style.backgroundColor),
      foreground: toRgba(style.color),
    };
  });
}

async function installAccountIdentity(
  page: Page,
  currentIdentity: () => AccountIdentity,
) {
  await page.route("**/api/auth/get-session", async (route) => {
    const response = await route.fetch();
    const payload = (await response.json()) as {
      user: { email: string; name?: string | null };
    };
    const identity = currentIdentity();
    payload.user.name = identity.name;
    payload.user.email = identity.email;
    await route.fulfill({ response, json: payload });
  });
}

function boxesOverlap(first: Rect, second: Rect) {
  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}

function expectBoxInside(inner: Rect, outer: Rect) {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
}

async function overflowClipBox(locator: Locator): Promise<Rect> {
  await expect(locator).toBeVisible();
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      height: element.clientHeight,
      width: element.clientWidth,
      x: box.x + element.clientLeft,
      y: box.y + element.clientTop,
    };
  });
}

async function focusedPaintBox(locator: Locator): Promise<Rect> {
  const box = await visibleBox(locator);
  const indicator = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      focusVisible: element.matches(":focus-visible"),
      outlineOffset: Number.parseFloat(style.outlineOffset),
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(indicator.focusVisible).toBe(true);
  expect(indicator.outlineStyle).not.toBe("none");
  const extent = indicator.outlineOffset + indicator.outlineWidth;
  return {
    height: box.height + extent * 2,
    width: box.width + extent * 2,
    x: box.x - extent,
    y: box.y - extent,
  };
}

async function expectPointerCenterOwnedBy(locator: Locator) {
  const box = await visibleBox(locator);
  expect(
    await locator.evaluate(
      (element, point) =>
        document.elementFromPoint(point.x, point.y)?.closest("a, button") ===
        element,
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    ),
  ).toBe(true);
}

const authViewports: Viewport[] = [
  { height: 520, name: "ultra-narrow auth", width: 280 },
  { height: 568, name: "small auth", width: 320 },
  { height: 844, name: "regular auth", width: 390 },
  { height: 360, name: "short auth landscape", width: 640 },
  { height: 900, name: "desktop auth", width: 1440 },
];

for (const mode of ["sign-in", "sign-up"] as const) {
  for (const viewport of authViewports) {
    test(`${mode} stays horizontally contained and vertically usable on ${viewport.name}`, async ({
      page,
    }) => {
      await page.route("**/api/auth/get-session", async (route) => {
        await route.fulfill({
          body: "null",
          contentType: "application/json",
          status: 200,
        });
      });
      await page.setViewportSize(viewport);
      await page.goto("/login");
      await page
        .getByRole("button", {
          name: mode === "sign-up" ? "Sign up" : "Sign in",
          exact: true,
        })
        .click();

      const main = page.getByRole("main");
      const submit = page.getByRole("button", {
        name: mode === "sign-up" ? "Create account" : "Sign in and start",
      });
      const guest = page.getByRole("button", { name: "Continue as guest" });
      const securityCheck = page.getByRole("group", {
        name: "Security check",
      });
      await expect(submit).toBeVisible();
      await expect(guest).toBeEnabled();
      await expect(securityCheck).toBeVisible();
      const sizing = await main.evaluate((element) => ({
        clientHeight: element.clientHeight,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        scrollWidth: element.scrollWidth,
      }));
      expect(sizing.scrollWidth).toBeLessThanOrEqual(sizing.clientWidth);
      expect(
        await main.evaluate((element) => {
          element.scrollLeft = 100;
          return element.scrollLeft;
        }),
      ).toBe(0);

      await submit.scrollIntoViewIfNeeded();
      await submit.focus();
      await expect(submit).toBeFocused();
      await expectInsideViewport(submit, viewport);
      await guest.scrollIntoViewIfNeeded();
      await expectInsideViewport(guest, viewport);
      if (sizing.scrollHeight > sizing.clientHeight) {
        await main.evaluate((element) =>
          element.scrollTo(0, element.scrollHeight),
        );
        expect(
          await main.evaluate((element) => element.scrollTop),
        ).toBeGreaterThan(0);
      }
    });
  }
}

test("Continue as guest normalizes a Guardian return target to learner home", async ({
  page,
}) => {
  const timestamp = "2026-08-31T00:00:00.000Z";
  const authenticatedSession = {
    session: {
      id: "e2e-guest-session",
      userId: SHARED_GUEST_USER_ID,
      token: "e2e-guest-token",
      expiresAt: "2099-01-01T00:00:00.000Z",
      createdAt: timestamp,
      updatedAt: timestamp,
      ipAddress: null,
      userAgent: "Playwright",
    },
    user: {
      id: SHARED_GUEST_USER_ID,
      name: "Guest",
      email: "temporary@example.test",
      emailVerified: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
  let isAuthenticated = false;
  let guestRequests = 0;

  await page.route("**/api/auth/get-session", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: isAuthenticated ? authenticatedSession : null,
      status: 200,
    });
  });
  await page.route("**/api/auth/sign-in/shared-guest", async (route) => {
    guestRequests += 1;
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers()["x-captcha-response"]).toBe(
      "parrot-e2e-turnstile-token",
    );
    isAuthenticated = true;
    await route.fulfill({
      contentType: "application/json",
      json: {
        token: authenticatedSession.session.token,
        user: authenticatedSession.user,
      },
      status: 200,
    });
  });

  await page.goto("/login?returnTo=%2Fguardian");
  const guest = page.getByRole("button", { name: "Continue as guest" });
  await expect(guest).toBeEnabled();
  await guest.click();

  await expect.poll(() => guestRequests).toBe(1);
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("complementary", { name: "Account" }),
  ).toBeVisible();

  await page.goto(guardianPath("/guardian/account"));
  await expect(
    page.getByRole("heading", { level: 1, name: "Account & privacy" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "How Parrot uses AI" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Technical build details" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Danger zone" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { exact: true, name: "Delete account" }),
  ).toHaveCount(0);
});

for (const route of routes) {
  for (const viewport of mobileViewports) {
    test(`${route.name} header stays in one unobstructed row on a ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const mode = route.mode ?? "learner";
      await page.goto(
        mode === "guardian" ? guardianPath(route.path) : route.path,
      );

      const account = page.getByRole("complementary", {
        name: "Account",
      });
      const accountMenu = page.getByRole("button", {
        name: new RegExp(
          `Profile for ${mode === "guardian" ? "Alex Guardian" : "Mia"}, ${mode} mode`,
        ),
      });
      const accountBox = await expectInsideViewport(account, viewport);
      await expectInsideViewport(accountMenu, viewport);
      await expect(page.getByRole("menuitem")).toHaveCount(0);

      const pageNavigation = page.getByRole("navigation", {
        name: "Page navigation",
      });
      await expect(
        pageNavigation.getByRole("button").or(pageNavigation.getByRole("link")),
      ).toHaveCount(1);
      const controlBox = await expectInsideViewport(
        headerControl(page, route.control),
        viewport,
      );

      expect(Math.abs(controlBox.y - accountBox.y)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(controlBox.height - accountBox.height),
      ).toBeLessThanOrEqual(1);
      expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(accountBox.x);

      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
    });
  }
}

test("arbitrary guardian identity cannot cover the compact Back action", async ({
  page,
}) => {
  let identity: AccountIdentity = {
    email: "alexandria@example.test",
    name: longAccountName,
  };
  await installAccountIdentity(page, () => identity);

  const identities: AccountIdentity[] = [
    identity,
    { email: longAccountEmail, name: "   " },
  ];
  const compactViewports: Viewport[] = [
    { height: 568, name: "ultra narrow", width: 280 },
    { height: 640, name: "small reflow", width: 320 },
    { height: 640, name: "compact boundary", width: 359 },
    { height: 640, name: "first regular pixel", width: 360 },
    { height: 844, name: "regular phone", width: 390 },
    { height: 360, name: "short landscape", width: 640 },
    { height: 621, name: "first post-short tablet pixel", width: 768 },
    { height: 900, name: "last compact desktop pixel", width: 1359 },
  ];

  for (const nextIdentity of identities) {
    identity = nextIdentity;
    for (const viewport of compactViewports) {
      await page.setViewportSize(viewport);
      await page.goto(guardianPath("/guardian/account"));

      const account = page.getByRole("button", {
        name: /^Profile for .+, guardian mode$/,
      });
      const back = page.getByRole("link", {
        exact: true,
        name: "Back to Guardian dashboard",
      });
      const accountBox = await expectInsideViewport(account, viewport);
      const backBox = await expectInsideViewport(back, viewport);

      expect(accountBox.width).toBe(accountBox.height);
      expect(accountBox.width).toBe(backBox.width);
      expect(accountBox.height).toBe(backBox.height);
      expect(boxesOverlap(accountBox, backBox)).toBe(false);
      await expectPointerCenterOwnedBy(back);

      await focusWithKeyboard(page, back);
      const backPaint = await focusedPaintBox(back);
      expect(boxesOverlap(accountBox, backPaint)).toBe(false);

      await page.keyboard.press("Shift+Tab");
      await expect(account).toBeFocused();
      const accountPaint = await focusedPaintBox(account);
      expect(boxesOverlap(accountPaint, backBox)).toBe(false);
      expect(accountPaint.x).toBeGreaterThanOrEqual(0);
      expect(accountPaint.y).toBeGreaterThanOrEqual(0);
      expect(accountPaint.x + accountPaint.width).toBeLessThanOrEqual(
        viewport.width,
      );
      expect(accountPaint.y + accountPaint.height).toBeLessThanOrEqual(
        viewport.height,
      );
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
    }
  }
});

test("guardian profile keeps its identity in the account trigger at every header width", async ({
  page,
}) => {
  let identity = {
    email: longAccountEmail,
    name: longAccountName,
  };
  await installAccountIdentity(page, () => identity);
  await page.setViewportSize({ height: 568, width: 280 });
  await page.goto(guardianPath("/guardian"));

  const account = page.getByRole("button", {
    name: `Profile for ${longAccountName}, guardian mode`,
  });
  const closedBox = await visibleBox(account);
  expect(closedBox.width).toBe(closedBox.height);
  await expect(account).toHaveAccessibleName(
    `Profile for ${longAccountName}, guardian mode`,
  );
  const compactName = account.getByText(longAccountName, { exact: true });
  await expect(compactName).toHaveAttribute("dir", "auto");

  await account.click();
  const menu = page.getByRole("menu", { name: "Account menu" });
  await expect(menu.getByRole("menuitem")).toHaveText([
    "Guardian dashboard",
    "Manage learners",
    "Account & privacy",
    "Sign out",
  ]);
  await expect(page.getByRole("group", { name: "Active profile" })).toHaveCount(
    0,
  );

  await page.keyboard.press("Escape");
  await expect(account).toBeFocused();

  await page.setViewportSize({ height: 900, width: 1360 });
  await page.goto(guardianPath("/guardian"));
  const wideAccount = page.getByRole("button", {
    name: `Profile for ${longAccountName}, guardian mode`,
  });
  await expect(wideAccount).toContainText(longAccountName);
  await expect(wideAccount).toContainText("Guardian");
  await expect(
    wideAccount.getByText(longAccountName, { exact: true }),
  ).toHaveAttribute("dir", "auto");

  identity = { email: longAccountEmail, name: "   " };
  await page.setViewportSize({ height: 568, width: 280 });
  await page.goto(guardianPath("/guardian"));
  await expect(
    page.getByRole("button", {
      name: `Profile for ${longAccountEmail}, guardian mode`,
    }),
  ).toBeVisible();
});

test("Account menu keeps arbitrary identity and every action reachable in short viewports", async ({
  page,
}) => {
  let identity: AccountIdentity = {
    email: longAccountEmail,
    name: longAccountName,
  };
  await installAccountIdentity(page, () => identity);

  const cases: Array<{
    direction: "ltr" | "rtl";
    identity: AccountIdentity;
    viewport: Viewport;
  }> = [
    {
      direction: "ltr",
      identity,
      viewport: { height: 360, name: "short landscape", width: 640 },
    },
    {
      direction: "ltr",
      identity: {
        email: longAccountEmail,
        name: "家庭学习者🦜".repeat(35),
      },
      viewport: { height: 480, name: "short CJK phone", width: 280 },
    },
    {
      direction: "rtl",
      identity: {
        email: longAccountEmail,
        name: "اسم-العائلة-".repeat(24),
      },
      viewport: { height: 480, name: "short RTL phone", width: 280 },
    },
  ];

  for (const currentCase of cases) {
    identity = currentCase.identity;
    await page.setViewportSize(currentCase.viewport);
    await page.goto(guardianPath("/guardian"));
    await expect(
      page.getByRole("heading", { level: 1, name: "Guardian dashboard" }),
    ).toBeFocused();

    const account = page.getByRole("button", {
      name: /^Profile for .+, guardian mode$/,
    });
    await expect(account).toHaveAccessibleName(
      `Profile for ${currentCase.identity.name}, guardian mode`,
    );
    const name = account.getByText(currentCase.identity.name, { exact: true });
    await expect(name).toHaveAttribute("dir", "auto");
    expect(
      await name.evaluate((element) => getComputedStyle(element).direction),
    ).toBe(currentCase.direction);
    await account.click();
    const menu = page.getByRole("menu", { name: "Account menu" });
    const panel = menu.locator("..");
    await expectInsideViewport(panel, currentCase.viewport);
    const panelOverflows = await panel.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    );

    await expect(
      page.getByRole("group", { name: "Active profile" }),
    ).toHaveCount(0);

    const firstAction = page.getByRole("menuitem", {
      name: "Guardian dashboard",
    });
    await expect(firstAction).toBeFocused();
    await page.keyboard.press("End");
    const signOut = page.getByRole("menuitem", { name: "Sign out" });
    await expect(signOut).toBeFocused();
    const signOutPaint = await focusedPaintBox(signOut);
    expectBoxInside(signOutPaint, await overflowClipBox(panel));
    expect(signOutPaint.x).toBeGreaterThanOrEqual(0);
    expect(signOutPaint.y).toBeGreaterThanOrEqual(0);
    expect(signOutPaint.x + signOutPaint.width).toBeLessThanOrEqual(
      currentCase.viewport.width,
    );
    expect(signOutPaint.y + signOutPaint.height).toBeLessThanOrEqual(
      currentCase.viewport.height,
    );
    await expectPointerCenterOwnedBy(signOut);
    const panelScrollTop = await panel.evaluate((element) => element.scrollTop);
    if (panelOverflows) expect(panelScrollTop).toBeGreaterThan(0);
    else expect(panelScrollTop).toBe(0);

    await page.keyboard.press("Escape");
    await expect(account).toBeFocused();
  }
});

test("a failed sign out keeps Account beside one specific retry", async ({
  page,
}) => {
  const viewport = { height: 568, name: "ultra narrow", width: 280 };
  const identity = { email: longAccountEmail, name: longAccountName };
  let releaseRetry = () => {};
  let signOutRequests = 0;
  const heldRetry = new Promise<void>((resolveRetry) => {
    releaseRetry = resolveRetry;
  });
  await installAccountIdentity(page, () => identity);
  await page.route("**/api/auth/sign-out", async (route) => {
    signOutRequests += 1;
    if (signOutRequests === 2) await heldRetry;
    await route.abort("failed");
  });
  await page.setViewportSize(viewport);
  await page.goto(guardianPath("/guardian"));

  const account = page.getByRole("button", {
    name: /^Profile for .+, guardian mode$/,
  });
  const alert = page.getByRole("alert");
  await expect(alert).toBeAttached();
  await expect(alert).toHaveText("");
  await alert.evaluate((element) => {
    (window as Window & { signOutAlert?: Element }).signOutAlert = element;
  });
  await account.click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(alert).toHaveText("Sign out did not finish.");
  await expect(account).toBeFocused();

  const retry = page.getByRole("button", {
    exact: true,
    name: "Sign out again",
  });
  const alertId = await alert.getAttribute("id");
  expect(alertId).toBeTruthy();
  await expect(retry).toHaveAttribute("aria-describedby", alertId!);
  const accountBox = await expectInsideViewport(account, viewport);
  const retryBox = await expectInsideViewport(retry, viewport);
  expect(retryBox.x + retryBox.width).toBeLessThanOrEqual(accountBox.x);
  expect(retryBox.height).toBeGreaterThanOrEqual(44);
  expect(retryBox.width).toBeGreaterThanOrEqual(44);
  expect(
    await account.evaluate((element) =>
      element.nextElementSibling?.textContent?.trim(),
    ),
  ).toBe("Sign out again");
  await page.keyboard.press("Tab");
  await expect(retry).toBeFocused();
  const retryPaint = await focusedPaintBox(retry);
  expectBoxInside(retryPaint, {
    height: viewport.height,
    width: viewport.width,
    x: 0,
    y: 0,
  });
  const back = page.getByRole("button", { name: "Switch to learner" });
  expect(boxesOverlap(retryPaint, await visibleBox(back))).toBe(false);
  await page.keyboard.press("Shift+Tab");
  await expect(account).toBeFocused();

  await account.click();
  const menu = page.getByRole("menu", { name: "Account menu" });
  const panel = menu.locator("..");
  await expectInsideViewport(panel, viewport);
  await expect(panel.getByRole("alert")).toHaveCount(0);
  expect(
    await alert.evaluate(
      (element) =>
        (window as Window & { signOutAlert?: Element }).signOutAlert ===
        element,
    ),
  ).toBe(true);
  await expect(retry).toBeVisible();
  const readyAccountName = await account.getAttribute("aria-label");
  expect(readyAccountName).toBeTruthy();

  await retry.evaluate((control) => {
    (control as HTMLElement).click();
    (control as HTMLElement).click();
  });
  const pendingAccount = page.getByRole("button", {
    exact: true,
    name: `Signing out… ${readyAccountName}`,
  });
  await expect(pendingAccount).toBeFocused();
  await expect(alert).toHaveText("");
  await expect(
    page.getByRole("status").filter({ hasText: "Signing out…" }),
  ).toBeVisible();
  await expect(menu).toBeHidden();
  await expect(pendingAccount).toHaveAttribute("aria-expanded", "false");
  expect(signOutRequests).toBe(2);
  expect(
    await alert.evaluate(
      (element) =>
        (window as Window & { signOutAlert?: Element }).signOutAlert ===
        element,
    ),
  ).toBe(true);

  releaseRetry();
  await expect(alert).toHaveText("Sign out did not finish.");
  await expect(account).toBeFocused();

  await account.click();
  await expect(menu).toBeVisible();
  expect(
    await alert.evaluate(
      (element) =>
        (window as Window & { signOutAlert?: Element }).signOutAlert ===
        element,
    ),
  ).toBe(true);
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await expect(retry).toBeVisible();

  await page.keyboard.press("End");
  const signOut = page.getByRole("menuitem", { name: "Sign out" });
  await expect(signOut).toBeFocused();
  const signOutPaint = await focusedPaintBox(signOut);
  expectBoxInside(signOutPaint, await overflowClipBox(panel));
  expect(signOutPaint.y).toBeGreaterThanOrEqual(0);
  expect(signOutPaint.y + signOutPaint.height).toBeLessThanOrEqual(
    viewport.height,
  );
});

for (const viewport of [
  { height: 568, name: "ultra narrow", width: 280 },
  { height: 844, name: "regular phone", width: 390 },
  { height: 360, name: "short landscape", width: 640 },
]) {
  test(`sign-out recovery stays clear with text spacing on a ${viewport.name}`, async ({
    page,
  }) => {
    await page.route("**/api/auth/sign-out", (route) => route.abort("failed"));
    await page.setViewportSize(viewport);
    await page.goto(guardianPath("/guardian"));
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

    const heading = page.getByRole("heading", { name: "Guardian dashboard" });
    const back = page.getByRole("button", { name: "Switch to learner" });
    const account = page.getByRole("button", {
      name: "Profile for Alex Guardian, guardian mode",
    });
    await account.click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();

    const retry = page.getByRole("button", {
      exact: true,
      name: "Sign out again",
    });
    const retryBox = await expectInsideViewport(retry, viewport);
    expect(boxesOverlap(retryBox, await visibleBox(heading))).toBe(false);
    expect(boxesOverlap(retryBox, await visibleBox(back))).toBe(false);
    expect(boxesOverlap(retryBox, await visibleBox(account))).toBe(false);
    const sizing = await retry.evaluate((control) => ({
      clientHeight: control.clientHeight,
      clientWidth: control.clientWidth,
      scrollHeight: control.scrollHeight,
      scrollWidth: control.scrollWidth,
    }));
    expect(sizing.scrollHeight).toBeLessThanOrEqual(sizing.clientHeight);
    expect(sizing.scrollWidth).toBeLessThanOrEqual(sizing.clientWidth);
    await page.keyboard.press("Tab");
    await expect(retry).toBeFocused();
    const retryPaint = await focusedPaintBox(retry);
    expectBoxInside(retryPaint, {
      height: viewport.height,
      width: viewport.width,
      x: 0,
      y: 0,
    });
    expect(boxesOverlap(retryPaint, await visibleBox(heading))).toBe(false);
    expect(boxesOverlap(retryPaint, await visibleBox(back))).toBe(false);
    expect(boxesOverlap(retryPaint, await visibleBox(account))).toBe(false);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);
  });
}

for (const key of ["Enter", "Space"]) {
  test(`${key} starts one sign-out retry and pending absorbs another press`, async ({
    page,
  }) => {
    let releaseRetry = () => {};
    let signOutRequests = 0;
    const heldRetry = new Promise<void>((resolveRetry) => {
      releaseRetry = resolveRetry;
    });
    await page.route("**/api/auth/sign-out", async (route) => {
      signOutRequests += 1;
      if (signOutRequests === 2) await heldRetry;
      await route.abort("failed");
    });
    await page.goto(guardianPath("/guardian"));

    const account = page.getByRole("button", {
      name: "Profile for Alex Guardian, guardian mode",
    });
    await account.click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    const retry = page.getByRole("button", {
      exact: true,
      name: "Sign out again",
    });
    await expect(page.getByRole("alert")).toHaveText(
      "Sign out did not finish.",
    );
    await expect(account).toBeFocused();
    await expect(retry).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(retry).toBeFocused();
    await retry.press(key);

    const pendingAccount = page.getByRole("button", {
      exact: true,
      name: "Signing out… Profile for Alex Guardian, guardian mode",
    });
    await expect(pendingAccount).toBeFocused();
    await expect(
      page.getByRole("status").filter({ hasText: "Signing out…" }),
    ).toBeVisible();
    await page.keyboard.press(key);
    expect(signOutRequests).toBe(2);

    releaseRetry();
    await expect(page.getByRole("alert")).toHaveText(
      "Sign out did not finish.",
    );
    await expect(account).toBeFocused();
  });
}

test("wide pending sign out keeps its established 180px frame", async ({
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
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto(guardianPath("/guardian"));

  await page
    .getByRole("button", { name: "Profile for Alex Guardian, guardian mode" })
    .click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  const pendingAccount = page.getByRole("button", {
    exact: true,
    name: "Signing out… Profile for Alex Guardian, guardian mode",
  });
  expect((await visibleBox(pendingAccount)).width).toBe(180);

  releaseRequest();
  await expect(
    page.getByRole("button", { exact: true, name: "Sign out again" }),
  ).toBeVisible();
});

test("the learner profile opens a locked grown-up access gateway", async ({
  page,
}) => {
  await page.goto("/lessons");

  const accountMenu = page.getByRole("button", {
    name: "Profile for Mia, learner mode",
  });
  await expect(accountMenu).toHaveAttribute("aria-expanded", "false");

  await accountMenu.click();

  await expect(accountMenu).toHaveAttribute("aria-expanded", "true");
  const menu = page.getByRole("menu", { name: "Account menu" });
  await expect(menu.getByRole("menuitem")).toHaveText([
    "Switch learner",
    "Grown-up accessSwitch modes",
  ]);
  await expect(
    page.getByRole("group", { name: "Choose profile mode" }),
  ).toHaveCount(0);
});

test("the learner menu switches to a sibling and returns to learner home", async ({
  page,
}) => {
  await page.goto(
    "/lessons?parrotE2eGuardian=learner&parrotE2eLearners=multiple",
  );

  await page
    .getByRole("button", { name: "Profile for Mia, learner mode" })
    .click();
  await page.getByRole("menuitem", { name: "Switch learner" }).click();

  const chooser = page.getByRole("dialog", { name: "Who is learning now?" });
  await chooser
    .getByRole("button", { name: "Start learner mode as Noah" })
    .click();

  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("navigation", { name: "Learning activities" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Profile for Noah, learner mode" }),
  ).toBeVisible();
});

test("Guardian menu opens the protected Account & privacy page with deletion only in its Danger zone", async ({
  page,
}) => {
  await page.goto(guardianPath("/guardian"));
  await page
    .getByRole("button", { name: "Profile for Alex Guardian, guardian mode" })
    .click();

  const menu = page.getByRole("menu", { name: "Account menu" });
  await expect(menu.getByRole("menuitem")).toHaveText([
    "Guardian dashboard",
    "Manage learners",
    "Account & privacy",
    "Sign out",
  ]);

  await menu.getByRole("menuitem", { name: "Account & privacy" }).click();
  await expect(page).toHaveURL("/guardian/account");
  await expect(
    page.getByRole("heading", { level: 1, name: "Account & privacy" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "How Parrot uses AI" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Technical build details" }),
  ).toBeVisible();

  const danger = page.getByRole("region", { name: "Danger zone" });
  const deleteAccount = danger.getByRole("button", { name: "Delete account" });
  await expect(deleteAccount).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Delete account", exact: true }),
  ).toHaveCount(1);
  await deleteAccount.click();
  const dialog = page.getByRole("dialog", { name: "Delete account" });
  await expect(dialog.getByLabel("Password")).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("link", { name: "Back to Guardian dashboard" }).click();
  await expect(page).toHaveURL("/guardian");
  await expect(
    page.getByRole("heading", { level: 1, name: "Guardian dashboard" }),
  ).toBeVisible();
});

test("account actions keep routine sign out in the menu and stage deletion on its page", async ({
  page,
}) => {
  const viewports: Viewport[] = [
    { height: 568, name: "ultra narrow", width: 280 },
    { height: 844, name: "regular phone", width: 390 },
    { height: 360, name: "short landscape", width: 640 },
    { height: 900, name: "desktop", width: 1440 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto(guardianPath("/guardian"));
    await page
      .getByRole("button", { name: "Profile for Alex Guardian, guardian mode" })
      .click();

    const menu = page.getByRole("menu", { name: "Account menu" });
    const items = menu.getByRole("menuitem");
    await expect(items).toHaveText([
      "Guardian dashboard",
      "Manage learners",
      "Account & privacy",
      "Sign out",
    ]);
    await expect(
      page.getByRole("group", { name: "Choose profile mode" }),
    ).toHaveCount(0);

    const accountPrivacy = menu.getByRole("menuitem", {
      name: "Account & privacy",
    });
    const signOut = menu.getByRole("menuitem", { name: "Sign out" });
    const [accountColors, signOutColors] = await Promise.all([
      renderedColors(accountPrivacy),
      renderedColors(signOut),
    ]);

    expect(signOutColors).toEqual(accountColors);

    for (let index = 0; index < (await items.count()); index += 1) {
      const box = await visibleBox(items.nth(index));
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await expect(items.first()).toBeFocused();
    await page.keyboard.press("End");
    await expect(signOut).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(accountPrivacy).toBeFocused();

    if (viewport.name === "regular phone") {
      await accountPrivacy.click();
      const deleteAccount = page.getByRole("button", {
        exact: true,
        name: "Delete account",
      });
      await deleteAccount.scrollIntoViewIfNeeded();
      const deleteColors = await renderedColors(deleteAccount);
      expect(deleteColors).not.toEqual(signOutColors);
      await deleteAccount.click();
      const dialog = page.getByRole("dialog", { name: "Delete account" });
      await dialog.getByLabel("Password").fill("not-submitted");
      const cancel = dialog.getByRole("button", { name: "Cancel" });
      const confirm = dialog.getByRole("button", {
        name: "Delete account now",
      });
      await expect(confirm).toBeEnabled();
      const [cancelColors, confirmColors] = await Promise.all([
        renderedColors(cancel),
        renderedColors(confirm),
      ]);
      expect(confirmColors).not.toEqual(cancelColors);
      await cancel.click();
    }
  }
});

test("switching to guardian mode reaches learner details through Manage learners", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Profile for Mia, learner mode" })
    .click();
  await page.getByRole("menuitem", { name: /Grown-up access/ }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page
    .getByRole("link", { exact: true, name: "Manage learners" })
    .click();
  await page
    .getByRole("button", { exact: true, name: "Edit Mia's profile" })
    .click();

  await expect(page).toHaveURL("/guardian/learners/e2e-learner");
  await expect(
    page.getByRole("heading", { name: "Learner details" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { exact: true, name: "Name" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { exact: true, name: "Age" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { exact: true, name: "About Mia" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Lesson voice recordings" }),
  ).toBeVisible();
});

test("forced colors keeps account exit actions visibly focused", async ({
  page,
}) => {
  const viewport = { height: 360, name: "short landscape", width: 640 };
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.setViewportSize(viewport);
  await page.goto(guardianPath("/guardian"));
  await expect(
    page.getByRole("heading", {
      exact: true,
      level: 1,
      name: "Guardian dashboard",
    }),
  ).toBeFocused();

  const trigger = page.getByRole("button", {
    name: "Profile for Alex Guardian, guardian mode",
  });
  await trigger.press("ArrowDown");
  const menu = page.getByRole("menu", { name: "Account menu" });
  const panel = menu.locator("..");
  const signOut = menu.getByRole("menuitem", { name: "Sign out" });

  await page.keyboard.press("End");
  await expect(signOut).toBeFocused();
  const signOutOutline = await renderedFocusOutline(signOut);
  expect(signOutOutline.style).not.toBe("none");
  expect(Number.parseFloat(signOutOutline.width)).toBeGreaterThanOrEqual(2);
  expectBoxInside(await focusedPaintBox(signOut), await overflowClipBox(panel));

  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  const deleteAccount = page.getByRole("button", {
    exact: true,
    name: "Delete account",
  });
  await deleteAccount.scrollIntoViewIfNeeded();
  await deleteAccount.focus();
  const deleteOutline = await renderedFocusOutline(deleteAccount);
  expect(deleteOutline.style).not.toBe("none");
  expect(Number.parseFloat(deleteOutline.width)).toBeGreaterThanOrEqual(2);
});

test("Account & privacy explains caregiver facts before optional technical details", async ({
  page,
}) => {
  const viewport = mobileViewports.find(({ name }) => name === "small phone")!;
  await page.setViewportSize(viewport);
  await page.goto(guardianPath("/guardian"));
  await page
    .getByRole("button", { name: "Profile for Alex Guardian, guardian mode" })
    .click();
  await page.getByRole("menuitem", { name: "Account & privacy" }).click();

  const accountPage = page.getByRole("main");
  await expect(
    accountPage.getByRole("heading", { level: 1, name: "Account & privacy" }),
  ).toBeFocused();
  await expect(
    accountPage.getByText("For grown-ups", { exact: true }),
  ).toHaveCount(0);
  await expect(
    accountPage.getByRole("heading", { name: "How Parrot uses AI" }),
  ).toBeVisible();
  await expect(
    accountPage.getByRole("heading", { name: "What this account keeps" }),
  ).toBeVisible();
  await expect(
    accountPage.getByText(
      "Lessons save one private voice clip for each join-in moment. A new take replaces the previous take for that moment. Parrot does not score or transcribe these clips yet. Stopping lesson recording or deleting the account deletes them.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    accountPage.getByText(
      /^Voice-dubbing rhymes save that learner's private voice clips/i,
    ),
  ).toBeVisible();
  await expect(
    accountPage.getByText("Raw audio is not added to the Parrot account.", {
      exact: false,
    }),
  ).toHaveCount(0);
  await expect(
    accountPage.getByText(
      "Choosing a learner in Guardian settings changes only which learner's data you manage. Learner mode changes only through Switch to learner, where you choose who will use the session.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    accountPage.getByRole("heading", { name: "Web app" }),
  ).toBeHidden();

  const technicalDetails = accountPage.getByLabel("Technical build details");

  await technicalDetails.click();
  await expect(
    accountPage.getByRole("heading", { name: "Web app" }),
  ).toBeVisible();
  await expect(
    accountPage.getByRole("heading", { name: "Cloudflare Worker" }),
  ).toBeVisible();
  await expect(
    accountPage.getByRole("heading", { name: "Conversation agent" }),
  ).toBeVisible();
  await expect(accountPage.getByText("e2e-web", { exact: true })).toBeVisible();
  await expect(accountPage.getByText("e2e-api", { exact: true })).toBeVisible();
  await expect(
    accountPage.getByText("e2e-agent", { exact: true }),
  ).toBeVisible();
  await expect(
    accountPage.getByText("Worker deployment e2e-deployment"),
  ).toBeVisible();
  await expect(accountPage.getByText("Lesson script LLM")).toHaveCount(0);
  await expect(
    accountPage.getByText("openai/gpt-5.6-luna"),
  ).toHaveCount(0);
  await expect(accountPage.getByText("Realtime voice model")).toBeVisible();
  await expect(accountPage.getByText("gpt-realtime-2.1-mini")).toBeVisible();
  await expect(accountPage.getByText("Input transcription")).toBeVisible();
  await expect(accountPage.getByText("gpt-4o-mini-transcribe")).toBeVisible();

  await page.getByRole("link", { name: "Back to Guardian dashboard" }).click();
  await expect(page).toHaveURL("/guardian");
});

test("Account & privacy stays usable on a 280px by 480px screen when technical details fail", async ({
  page,
}) => {
  const viewport = {
    name: "short ultra-narrow phone",
    width: 280,
    height: 480,
  };
  await page.setViewportSize(viewport);
  await page.route("**/api/build-info", async (route) => {
    await route.fulfill({ body: "", status: 503 });
  });
  await page.goto(guardianPath("/guardian"));
  await page
    .getByRole("button", { name: "Profile for Alex Guardian, guardian mode" })
    .click();
  await page.getByRole("menuitem", { name: "Account & privacy" }).click();

  const accountPage = page.getByRole("main");
  await expect(
    accountPage.getByRole("heading", { name: "How Parrot uses AI" }),
  ).toBeVisible();
  await expect(
    accountPage.getByRole("heading", { name: "What this account keeps" }),
  ).toBeVisible();

  const technicalDetails = accountPage.getByLabel("Technical build details");
  await technicalDetails.scrollIntoViewIfNeeded();
  const technicalBox = await visibleBox(technicalDetails);
  expect(technicalBox.width).toBeGreaterThanOrEqual(44);
  expect(technicalBox.height).toBeGreaterThanOrEqual(44);
  await technicalDetails.click();
  await expect(
    accountPage
      .getByText(
        "Technical details could not load. The AI and saved data notes above are still available.",
        { exact: true },
      )
      .first(),
  ).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.getByRole("link", { name: "Back to Guardian dashboard" }).click();
  await expect(page).toHaveURL("/guardian");
});

test("account menu stays visible after scrolling a short lesson list", async ({
  page,
}) => {
  const viewport = mobileViewports.find(({ name }) => name === "small phone")!;
  await page.setViewportSize(viewport);
  await page.goto("/lessons");

  const main = page.getByRole("main");
  await expect
    .poll(() =>
      main.evaluate((element) => element.scrollHeight > element.clientHeight),
    )
    .toBe(true);

  await main.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect
    .poll(() => main.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);

  const accountMenu = page.getByRole("button", {
    name: "Profile for Mia, learner mode",
  });
  await expectInsideViewport(accountMenu, viewport);
});

test("desktop header controls share one rendered chrome and focus outline", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/lessons/parrot/01-peppas-high-ball/scenes/1");

  const controls = [
    page.getByRole("button", {
      name: "Profile for Mia, learner mode",
    }),
    page.getByRole("button", { name: "Back to lesson list" }),
  ];
  const chrome = await Promise.all(controls.map(renderedControlChrome));

  expect(Math.abs(chrome[0].height - chrome[1].height)).toBeLessThanOrEqual(1);
  expect({ ...chrome[0], height: 0 }).toEqual({ ...chrome[1], height: 0 });

  const outlines = [];
  for (const control of controls) {
    await focusWithKeyboard(page, control);
    const outline = await renderedFocusOutline(control);
    expect(outline.style).not.toBe("none");
    expect(Number.parseFloat(outline.width)).toBeGreaterThan(0);
    outlines.push(outline);
  }

  expect(outlines[0]).toEqual(outlines[1]);
});

test("shared route-header icons render at one stroke weight", async ({ page }) => {
  const routes = [
    "/stories",
    "/dubs",
    guardianPath("/guardian/account"),
  ];
  const strokeWidths = [];

  for (const path of routes) {
    await page.goto(path);
    const icon = page
      .getByRole("navigation", { name: "Page navigation" })
      .locator("svg")
      .first();
    await expect(icon).toBeVisible();
    strokeWidths.push(
      await icon.evaluate((element) => getComputedStyle(element).strokeWidth),
    );
  }

  expect(strokeWidths).toEqual(["3px", "3px", "3px"]);
});
