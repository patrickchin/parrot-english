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
    control: { name: "Back to main menu", role: "link" },
  },
  {
    name: "lesson player",
    path: "/lessons/parrot/01-peppas-high-ball/scenes/1",
    control: { name: "Back to lesson list", role: "button" },
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
        page.getByRole("menuitem", { name: "About" }),
      ).toBeHidden();
      await expect(
        page.getByRole("menuitem", { name: "Log out" }),
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

test("the learner name opens the account actions dropdown", async ({ page }) => {
  await page.goto("/lessons");

  const accountMenu = page.getByRole("button", { exact: true, name: "Mia" });
  await expect(accountMenu).toHaveAttribute("aria-expanded", "false");

  await accountMenu.click();

  await expect(accountMenu).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("menu", { name: "Account actions" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Profile" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "About" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Log out" })).toBeVisible();
});

test("About shows independently deployed component versions", async ({ page }) => {
  const viewport = mobileViewports.find(({ name }) => name === "small phone")!;
  await page.setViewportSize(viewport);
  await page.goto("/lessons");
  await page.getByRole("button", { exact: true, name: "Mia" }).click();
  await page.getByRole("menuitem", { name: "About" }).click();

  const about = page.getByRole("dialog", { name: "About Parrot English" });
  await expectInsideViewport(about, viewport);
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
  await expect(about.getByText("openai/gpt-4.1-mini")).toBeVisible();

  await page.getByRole("button", { name: "Close About" }).click();
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

  const accountMenu = page.getByRole("button", { exact: true, name: "Mia" });
  await expectInsideViewport(accountMenu, viewport);
});

test("all visible header controls use the same typography", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/lessons/parrot/01-peppas-high-ball/scenes/1");

  const controls = [
    page.getByRole("button", { exact: true, name: "Mia" }),
    page.getByRole("button", { name: "Back to lesson list" }),
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
