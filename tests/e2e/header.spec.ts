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
    if (await locator.evaluate((element) => element === document.activeElement)) {
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
      expect(Math.abs(controlBox.height - accountBox.height)).toBeLessThanOrEqual(1);
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
    about.getByText(
      "Talk to Peppa does not change the learner profile.",
      { exact: false },
    ),
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
  await expect(about.getByText("Worker deployment e2e-deployment")).toBeVisible();
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
  const viewport = { name: "short ultra-narrow phone", width: 280, height: 480 };
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
    about.getByText(
      "Technical details could not load. The AI and saved data notes above are still available.",
      { exact: true },
    ).first(),
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
      main.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    )
    .toBe(true);

  await main.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

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
