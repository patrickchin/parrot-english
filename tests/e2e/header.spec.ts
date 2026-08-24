import { expect, test, type Locator, type Page } from "@playwright/test";

interface HeaderRoute {
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
    name: "custom lesson creator",
    path: "/lessons/my/create",
    control: { name: "Back to lessons", role: "link" },
  },
  {
    name: "learner profile",
    path: "/profile",
    control: { name: "Back", role: "button" },
  },
];

const mobileViewports: Viewport[] = [
  { name: "ultra narrow", width: 280, height: 568 },
  { name: "small phone", width: 320, height: 568 },
  { name: "short phone", width: 360, height: 640 },
  { name: "regular phone", width: 390, height: 844 },
];

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

function relativeLuminance([red, green, blue]: number[]) {
  const linear = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
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

for (const route of routes) {
  for (const viewport of mobileViewports) {
    test(`${route.name} header stays in one unobstructed row on a ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(route.path);

      const account = page.getByRole("complementary", {
        name: "Account",
      });
      const accountMenu = page.getByRole("button", {
        exact: true,
        name: "Account for Mia",
      });
      const accountBox = await expectInsideViewport(account, viewport);
      await expectInsideViewport(accountMenu, viewport);
      await expect(
        page.getByRole("menuitem", { name: "Learner profile" }),
      ).toBeHidden();
      await expect(
        page.getByRole("menuitem", { name: "AI and saved data" }),
      ).toBeHidden();
      await expect(
        page.getByRole("menuitem", { name: "Sign out" }),
      ).toBeHidden();

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

test("arbitrary account identity cannot cover the compact Back action", async ({
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
      await page.goto("/lessons");

      const account = page.getByRole("button", { name: /^Account for / });
      const back = page.getByRole("link", {
        exact: true,
        name: "Back to home",
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

test("Account keeps identity in its menu instead of the persistent header", async ({
  page,
}) => {
  let identity = {
    email: longAccountEmail,
    name: longAccountName,
  };
  await installAccountIdentity(page, () => identity);
  await page.setViewportSize({ height: 568, width: 280 });
  await page.goto("/lessons");

  const account = page.getByRole("button", {
    exact: true,
    name: `Account for ${longAccountName}`,
  });
  await expect(account).not.toContainText(longAccountName);
  const closedBox = await visibleBox(account);
  expect(closedBox.width).toBe(closedBox.height);

  await account.click();
  const name = page.getByText(longAccountName, { exact: true });
  const email = page.getByText(longAccountEmail, { exact: true });
  await expect(name).toBeVisible();
  await expect(email).toBeVisible();
  await expect(name).toHaveAttribute("dir", "auto");
  await expect(email).toHaveAttribute("dir", "auto");
  for (const value of [name, email]) {
    await expectInsideViewport(value, {
      height: 568,
      name: "ultra narrow",
      width: 280,
    });
    expect(
      await value.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(account).toBeFocused();

  await page.setViewportSize({ height: 900, width: 1360 });
  await page.goto("/lessons");
  const wideAccount = page.getByRole("button", {
    exact: true,
    name: `Account for ${longAccountName}`,
  });
  await expect(wideAccount).toContainText("Account");
  await expect(wideAccount).not.toContainText(longAccountName);

  identity = { email: longAccountEmail, name: "   " };
  await page.setViewportSize({ height: 568, width: 280 });
  await page.goto("/lessons");
  await page
    .getByRole("button", {
      exact: true,
      name: `Account for ${longAccountEmail}`,
    })
    .click();
  await expect(page.getByText(longAccountEmail, { exact: true })).toHaveCount(
    1,
  );
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
    await page.goto("/lessons");
    await expect(
      page.getByRole("heading", { level: 1, name: "Pick a lesson" }),
    ).toBeFocused();

    const account = page.getByRole("button", { name: /^Account for / });
    await account.click();
    const menu = page.getByRole("menu", { name: "Account menu" });
    const panel = menu.locator("..");
    await expectInsideViewport(panel, currentCase.viewport);
    expect(
      await panel.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    ).toBe(true);

    const name = page.getByText(currentCase.identity.name, { exact: true });
    await expect(name).toHaveAttribute("dir", "auto");
    expect(
      await name.evaluate((element) => getComputedStyle(element).direction),
    ).toBe(currentCase.direction);

    const firstAction = page.getByRole("menuitem", {
      name: "Learner profile",
    });
    await expect(firstAction).toBeFocused();
    await page.keyboard.press("End");
    const deleteAccount = page.getByRole("menuitem", {
      name: "Delete account",
    });
    await expect(deleteAccount).toBeFocused();
    const deletePaint = await focusedPaintBox(deleteAccount);
    expectBoxInside(deletePaint, await overflowClipBox(panel));
    await expectPointerCenterOwnedBy(deleteAccount);

    await page.keyboard.press("ArrowUp");
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
    expect(await panel.evaluate((element) => element.scrollTop)).toBeGreaterThan(
      0,
    );

    await page.keyboard.press("Escape");
    await expect(account).toBeFocused();
  }
});

test("a failed sign out keeps Account beside one specific retry", async ({
  page,
}) => {
  const viewport = { height: 568, name: "ultra narrow", width: 280 };
  const identity = { email: longAccountEmail, name: longAccountName };
  let signOutRequests = 0;
  await installAccountIdentity(page, () => identity);
  await page.route("**/api/auth/sign-out", async (route) => {
    signOutRequests += 1;
    await route.abort("failed");
  });
  await page.setViewportSize(viewport);
  await page.goto("/lessons");

  const account = page.getByRole("button", { name: /^Account for / });
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
    await account.evaluate(
      (element) => element.nextElementSibling?.textContent?.trim(),
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
  const back = page.getByRole("link", { name: "Back to home" });
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
        (window as Window & { signOutAlert?: Element }).signOutAlert === element,
    ),
  ).toBe(true);
  await expect(retry).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(account).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(retry).toBeFocused();
  await retry.evaluate((control) => {
    control.click();
    control.click();
  });
  await expect(account).toBeFocused();
  await expect(alert).toHaveText("Sign out did not finish.");
  expect(signOutRequests).toBe(2);

  await account.click();
  await expect(menu).toBeVisible();
  expect(
    await alert.evaluate(
      (element) =>
        (window as Window & { signOutAlert?: Element }).signOutAlert === element,
    ),
  ).toBe(true);
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await expect(retry).toBeVisible();

  await page.keyboard.press("End");
  await expect(
    page.getByRole("menuitem", { name: "Delete account" }),
  ).toBeFocused();
  await page.keyboard.press("ArrowUp");
  const signOut = page.getByRole("menuitem", { name: "Sign out" });
  await expect(signOut).toBeFocused();
  const signOutPaint = await focusedPaintBox(signOut);
  expectBoxInside(signOutPaint, await overflowClipBox(panel));
  expect(signOutPaint.y).toBeGreaterThanOrEqual(0);
  expect(signOutPaint.y + signOutPaint.height).toBeLessThanOrEqual(
    viewport.height,
  );
});

test("the learner name opens the account menu", async ({ page }) => {
  await page.goto("/lessons");

  const accountMenu = page.getByRole("button", {
    exact: true,
    name: "Account for Mia",
  });
  await expect(accountMenu).toHaveAttribute("aria-expanded", "false");

  await accountMenu.click();

  await expect(accountMenu).toHaveAttribute("aria-expanded", "true");
  const menu = page.getByRole("menu", { name: "Account menu" });
  await expect(menu).toBeVisible();
  await expect(menu.locator(":scope > :not([role='menuitem'])")).toHaveCount(0);
  await expect(
    page.getByRole("menuitem", { name: "Learner profile" }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "AI and saved data" }),
  ).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
});

test("account actions separate routine sign out from staged deletion", async ({
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
    await page.goto("/lessons");
    await page.getByRole("button", { name: "Account for Mia" }).click();

    const menu = page.getByRole("menu", { name: "Account menu" });
    const items = menu.getByRole("menuitem");
    await expect(items).toHaveText([
      "Learner profile",
      "AI and saved data",
      "Sign out",
      "Delete account",
    ]);

    const about = menu.getByRole("menuitem", { name: "AI and saved data" });
    const signOut = menu.getByRole("menuitem", { name: "Sign out" });
    const deleteAccount = menu.getByRole("menuitem", {
      name: "Delete account",
    });
    const [aboutColors, signOutColors, deleteColors] = await Promise.all([
      renderedColors(about),
      renderedColors(signOut),
      renderedColors(deleteAccount),
    ]);

    expect(signOutColors).toEqual(aboutColors);
    expect(deleteColors.background).not.toEqual(signOutColors.background);
    expect(deleteColors.foreground).not.toEqual(signOutColors.foreground);
    expect(relativeLuminance(deleteColors.background)).toBeGreaterThan(0.8);

    const itemBoxes = [];
    for (let index = 0; index < (await items.count()); index += 1) {
      const box = await visibleBox(items.nth(index));
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      itemBoxes.push(box);
    }
    const ordinaryGap = itemBoxes[2].y - (itemBoxes[1].y + itemBoxes[1].height);
    const destructiveGap =
      itemBoxes[3].y - (itemBoxes[2].y + itemBoxes[2].height);
    expect(ordinaryGap).toBeGreaterThanOrEqual(4);
    expect(destructiveGap).toBeGreaterThanOrEqual(ordinaryGap + 8);

    await page.keyboard.press("End");
    await expect(deleteAccount).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(signOut).toBeFocused();

    if (viewport.name === "regular phone") {
      const menuDeleteColors = deleteColors;
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
      expect(confirmColors).not.toEqual(menuDeleteColors);
      await cancel.click();
    }
  }
});

test("forced colors keeps both account exit actions visibly focused", async ({
  page,
}) => {
  const viewport = { height: 360, name: "short landscape", width: 640 };
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.setViewportSize(viewport);
  await page.goto("/lessons");

  const trigger = page.getByRole("button", { name: "Account for Mia" });
  await trigger.press("ArrowDown");
  const menu = page.getByRole("menu", { name: "Account menu" });
  const panel = menu.locator("..");
  const signOut = menu.getByRole("menuitem", { name: "Sign out" });
  const deleteAccount = menu.getByRole("menuitem", {
    name: "Delete account",
  });

  await page.keyboard.press("End");
  for (const action of [deleteAccount, signOut]) {
    await action.focus();
    await expect(action).toBeFocused();
    const outline = await renderedFocusOutline(action);
    expect(outline.style).not.toBe("none");
    expect(Number.parseFloat(outline.width)).toBeGreaterThanOrEqual(2);
    expectBoxInside(await focusedPaintBox(action), await overflowClipBox(panel));
  }
});

test("AI and saved data explains caregiver facts before optional technical details", async ({
  page,
}) => {
  const viewport = mobileViewports.find(({ name }) => name === "small phone")!;
  await page.setViewportSize(viewport);
  await page.goto("/lessons");
  await page
    .getByRole("button", { exact: true, name: "Account for Mia" })
    .click();
  await page.getByRole("menuitem", { name: "AI and saved data" }).click();

  const about = page.getByRole("dialog", { name: "AI and saved data" });
  await expectInsideViewport(about, viewport);
  await expect(
    about.getByRole("heading", { name: "How Parrot uses AI" }),
  ).toBeVisible();
  await expect(
    about.getByRole("heading", { name: "What this account keeps" }),
  ).toBeVisible();
  await expect(
    about.getByText("Raw audio is not added to the Parrot account.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    about.getByText("Talk to Peppa does not change the learner profile.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(about.getByRole("heading", { name: "Web app" })).toBeHidden();

  const closeAbout = page.getByRole("button", {
    name: "Close AI and saved data",
  });
  const technicalDetails = about.getByLabel("Technical build details");
  const done = about.getByRole("button", { name: "Done" });
  await expect(closeAbout).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(technicalDetails).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(done).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(technicalDetails).toBeFocused();

  await technicalDetails.click();
  await expect(about.getByRole("heading", { name: "Web app" })).toBeVisible();
  await expect(
    about.getByRole("heading", { name: "Cloudflare Worker" }),
  ).toBeVisible();
  await expect(
    about.getByRole("heading", { name: "Conversation agent" }),
  ).toBeVisible();
  await expect(about.getByText("e2e-web", { exact: true })).toBeVisible();
  await expect(about.getByText("e2e-api", { exact: true })).toBeVisible();
  await expect(about.getByText("e2e-agent", { exact: true })).toBeVisible();
  await expect(
    about.getByText("Worker deployment e2e-deployment"),
  ).toBeVisible();
  await expect(about.getByText("Lesson script LLM")).toBeVisible();
  await expect(about.getByText("openai/gpt-5.6-luna")).toBeVisible();
  await expect(about.getByText("Realtime voice model")).toBeVisible();
  await expect(about.getByText("gpt-realtime-2.1-mini")).toBeVisible();
  await expect(about.getByText("Input transcription")).toBeVisible();
  await expect(about.getByText("gpt-4o-mini-transcribe")).toBeVisible();

  const closeBox = await visibleBox(closeAbout);
  expect(closeBox.width).toBeGreaterThanOrEqual(44);
  expect(closeBox.height).toBeGreaterThanOrEqual(44);
  await closeAbout.click();
  await expect(about).toBeHidden();
});

test("AI and saved data stays usable on a 280px by 480px screen when technical details fail", async ({
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
  await page.goto("/lessons");
  await page
    .getByRole("button", { exact: true, name: "Account for Mia" })
    .click();
  await page.getByRole("menuitem", { name: "AI and saved data" }).click();

  const about = page.getByRole("dialog", { name: "AI and saved data" });
  await expectInsideViewport(about, viewport);
  await expect(
    about.getByRole("heading", { name: "How Parrot uses AI" }),
  ).toBeVisible();
  await expect(
    about.getByRole("heading", { name: "What this account keeps" }),
  ).toBeVisible();

  const technicalDetails = about.getByLabel("Technical build details");
  await technicalDetails.scrollIntoViewIfNeeded();
  const technicalBox = await visibleBox(technicalDetails);
  expect(technicalBox.width).toBeGreaterThanOrEqual(44);
  expect(technicalBox.height).toBeGreaterThanOrEqual(44);
  await technicalDetails.click();
  await expect(
    about
      .getByText(
        "Technical details could not load. The AI and saved data notes above are still available.",
        { exact: true },
      )
      .first(),
  ).toBeVisible();

  const done = about.getByRole("button", { name: "Done" });
  await done.scrollIntoViewIfNeeded();
  const doneBox = await visibleBox(done);
  expect(doneBox.width).toBeGreaterThanOrEqual(44);
  expect(doneBox.height).toBeGreaterThanOrEqual(44);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await done.click();
  await expect(about).toBeHidden();
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
    exact: true,
    name: "Account for Mia",
  });
  await expectInsideViewport(accountMenu, viewport);
});

test("desktop header controls share one rendered chrome and focus outline", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/lessons/parrot/01-peppas-high-ball/scenes/1");

  const controls = [
    page.getByRole("button", { exact: true, name: "Account for Mia" }),
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
