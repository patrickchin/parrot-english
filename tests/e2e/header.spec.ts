import { expect, test, type Locator, type Page } from "@playwright/test";

interface HeaderRoute {
  name: string;
  path: string;
  controls: Array<{ name: string; role: "button" | "link" }>;
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
    controls: [{ name: "Back", role: "button" }],
  },
  {
    name: "lesson list",
    path: "/lessons",
    controls: [{ name: "Back to main menu", role: "link" }],
  },
  {
    name: "lesson player",
    path: "/lessons/parrot/01-peppas-high-ball/scenes/1",
    controls: [
      { name: "Back to lesson list", role: "button" },
      { name: "Back to main menu", role: "button" },
    ],
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

function headerControl(page: Page, control: HeaderRoute["controls"][number]) {
  return page.getByRole(control.role, { exact: true, name: control.name });
}

for (const route of routes) {
  for (const viewport of mobileViewports) {
    test(`${route.name} header stays in one unobstructed row on a ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(route.path);

      const account = page.getByRole("complementary", {
        name: "Current account",
      });
      const accountMenu = page.getByRole("button", {
        exact: true,
        name: "Mia",
      });
      const accountBox = await expectInsideViewport(account, viewport);
      await expectInsideViewport(accountMenu, viewport);
      await expect(
        page.getByRole("menuitem", { name: "Profile" }),
      ).toBeHidden();
      await expect(
        page.getByRole("menuitem", { name: "Log out" }),
      ).toBeHidden();

      for (const control of route.controls) {
        const controlBox = await expectInsideViewport(
          headerControl(page, control),
          viewport,
        );

        expect(Math.abs(controlBox.y - accountBox.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(controlBox.height - accountBox.height)).toBeLessThanOrEqual(1);
        expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(
          accountBox.x,
        );
      }

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

test("the learner name opens the account actions dropdown", async ({ page }) => {
  await page.goto("/lessons");

  const accountMenu = page.getByRole("button", { exact: true, name: "Mia" });
  await expect(accountMenu).toHaveAttribute("aria-expanded", "false");

  await accountMenu.click();

  await expect(accountMenu).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("menu", { name: "Account actions" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Profile" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Log out" })).toBeVisible();
});

test("account actions stay visible after scrolling a short lesson list", async ({
  page,
}) => {
  const viewport = mobileViewports.find(({ name }) => name === "small phone")!;
  await page.setViewportSize(viewport);
  await page.goto("/lessons");

  const main = page.getByRole("main");
  const scrollRange = await main.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(scrollRange.scrollHeight).toBeGreaterThan(scrollRange.clientHeight);

  await main.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  const accountMenu = page.getByRole("button", { exact: true, name: "Mia" });
  await expectInsideViewport(accountMenu, viewport);
});

test("all visible header controls use the same typography", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/lessons/parrot/01-peppas-high-ball/scenes/1");

  const controls = [
    page.getByRole("button", { exact: true, name: "Mia" }),
    page.getByRole("button", { name: "Back to lesson list" }),
    page.getByRole("button", { name: "Back to main menu" }),
  ];
  const typography = await Promise.all(
    controls.map(async (control) => {
      await expect(control).toBeVisible();
      return control.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          family: style.fontFamily,
          size: style.fontSize,
          weight: style.fontWeight,
        };
      });
    }),
  );

  expect(new Set(typography.map(({ family }) => family)).size).toBe(1);
  expect(new Set(typography.map(({ size }) => size)).size).toBe(1);
  expect(new Set(typography.map(({ weight }) => weight)).size).toBe(1);
});
