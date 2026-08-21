import { expect, test, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";

type Rgb = { blue: number; green: number; red: number };

async function openProfileSetup(page: Page) {
  await page.goto("/profile/setup?parrotE2eProfile=viewport-stability");
  await expect(
    page.getByRole("heading", { name: "Help Peppa get to know you" }),
  ).toBeFocused();
}

async function openProfileQuestion(page: Page) {
  await openProfileSetup(page);
  await page.getByRole("button", { name: "Set up profile" }).click();
  await expect(
    page.getByRole("heading", { name: "What's your name?" }),
  ).toBeFocused();
}

const focusScenarios: Array<{
  name: string;
  prepare: (page: Page) => Promise<Locator>;
  viewport: { height: number; width: number };
}> = [
  {
    name: "dark navy account menu",
    prepare: async (page) => {
      await page.goto("/");
      await page.getByRole("button", { name: "Account for Mia" }).click();
      return page.getByRole("menuitem", { name: "Learner profile" });
    },
    viewport: { height: 844, width: 390 },
  },
  {
    name: "light profile setup",
    prepare: async (page) => {
      await openProfileSetup(page);
      return page.getByRole("button", { name: "Set up profile" });
    },
    viewport: { height: 568, width: 280 },
  },
  {
    name: "transparent profile text action",
    prepare: async (page) => {
      await openProfileSetup(page);
      return page.getByRole("button", { name: "Skip for now" });
    },
    viewport: { height: 568, width: 280 },
  },
  {
    name: "profile answer field",
    prepare: async (page) => {
      await openProfileQuestion(page);
      return page.getByRole("textbox", { name: "Your answer" });
    },
    viewport: { height: 568, width: 280 },
  },
  {
    name: "profile microphone icon action",
    prepare: async (page) => {
      await openProfileQuestion(page);
      return page.getByRole("button", { name: "Speak your answer" });
    },
    viewport: { height: 568, width: 280 },
  },
  {
    name: "story shelf card",
    prepare: async (page) => {
      await page.goto("/stories");
      return page.getByRole("link", {
        name: "Listen to story: The Red Ball",
      });
    },
    viewport: { height: 844, width: 390 },
  },
  {
    name: "selected story level tab",
    prepare: async (page) => {
      await page.goto("/stories");
      await page.getByLabel("Grown-up options").click();
      return page.getByRole("tab", { name: "Start here" });
    },
    viewport: { height: 844, width: 390 },
  },
  {
    name: "dark story reader",
    prepare: async (page) => {
      await page.goto("/stories/the-red-ball/pages/1");
      return page.getByRole("link", { name: "Back to stories" });
    },
    viewport: { height: 844, width: 390 },
  },
  {
    name: "image-adjacent lesson player",
    prepare: async (page) => {
      await page.goto("/lessons/parrot/01-peppas-high-ball/scenes/1");
      return page.getByRole("button", { name: "Back to lesson list" });
    },
    viewport: { height: 900, width: 1440 },
  },
];

function luminance(color: Rgb) {
  const linear = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return (
    0.2126 * linear(color.red) +
    0.7152 * linear(color.green) +
    0.0722 * linear(color.blue)
  );
}

function contrast(first: Rgb, second: Rgb) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort(
    (left, right) => right - left,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

async function blurActiveElement(page: Page) {
  await page.evaluate(async () => {
    for (let index = 0; index < 3; index += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          !(document.activeElement instanceof HTMLElement) ||
          document.activeElement === document.body,
      ),
    )
    .toBe(true);
}

async function focusWithKeyboard(page: Page, target: Locator) {
  for (let index = 0; index < 80; index += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) {
      return;
    }
    await page.keyboard.press("Tab");
  }

  expect(
    await target.evaluate((element) => element === document.activeElement),
  ).toBe(true);
}

async function decodedScreenshot(page: Page) {
  const screenshot = await page.screenshot({ animations: "disabled" });
  return sharp(screenshot)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

function pixel(
  data: Buffer,
  channels: number,
  width: number,
  x: number,
  y: number,
): Rgb {
  const offset = (y * width + x) * channels;
  return {
    blue: data[offset + 2]!,
    green: data[offset + 1]!,
    red: data[offset]!,
  };
}

async function renderedFocusDelta(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  await target.scrollIntoViewIfNeeded();
  await blurActiveElement(page);
  const box = await target.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  const borderRadius = await target.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).borderTopLeftRadius),
  );

  const unfocused = await decodedScreenshot(page);
  await focusWithKeyboard(page, target);
  await expect(target).toBeFocused();
  expect(await target.evaluate((element) => element.matches(":focus-visible"))).toBe(
    true,
  );
  const focused = await decodedScreenshot(page);

  expect(focused.info.width).toBe(unfocused.info.width);
  expect(focused.info.height).toBe(unfocused.info.height);
  expect(focused.info.channels).toBe(unfocused.info.channels);

  const scaleX = focused.info.width / viewport!.width;
  const scaleY = focused.info.height / viewport!.height;
  const padding = 12;
  const left = Math.max(0, Math.floor((box!.x - padding) * scaleX));
  const right = Math.min(
    focused.info.width,
    Math.ceil((box!.x + box!.width + padding) * scaleX),
  );
  const top = Math.max(0, Math.floor((box!.y - padding) * scaleY));
  const bottom = Math.min(
    focused.info.height,
    Math.ceil((box!.y + box!.height + padding) * scaleY),
  );
  let changedPixels = 0;
  let contrastingPixels = 0;
  let strongestContrast = 1;

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const before = pixel(
        unfocused.data,
        unfocused.info.channels,
        unfocused.info.width,
        x,
        y,
      );
      const after = pixel(
        focused.data,
        focused.info.channels,
        focused.info.width,
        x,
        y,
      );
      const channelChange = Math.max(
        Math.abs(after.red - before.red),
        Math.abs(after.green - before.green),
        Math.abs(after.blue - before.blue),
      );
      if (channelChange < 12) continue;

      changedPixels += 1;
      const ratio = contrast(after, before);
      strongestContrast = Math.max(strongestContrast, ratio);
      if (ratio >= 3) contrastingPixels += 1;
    }
  }

  const renderedPixelsPerCssPixel = scaleX * scaleY;
  const radius = Math.min(
    Number.isFinite(borderRadius) ? borderRadius : 0,
    box!.width / 2,
    box!.height / 2,
  );
  return {
    changedArea: changedPixels / renderedPixelsPerCssPixel,
    contrastingArea: contrastingPixels / renderedPixelsPerCssPixel,
    requiredArea:
      4 * (box!.width + box!.height) - (16 - 4 * Math.PI) * radius,
    strongestContrast,
  };
}

for (const scenario of focusScenarios) {
  test(`keyboard focus stays visible on the ${scenario.name}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(scenario.viewport);
    const target = await scenario.prepare(page);
    const focus = await renderedFocusDelta(page, target);

    expect.soft(
      focus.changedArea,
      `${scenario.name} has ${focus.changedArea.toFixed(0)} CSS px² of rendered focus change; ${focus.requiredArea.toFixed(0)} CSS px² required`,
    ).toBeGreaterThanOrEqual(focus.requiredArea);
    expect(
      focus.contrastingArea,
      `${scenario.name} has ${focus.contrastingArea.toFixed(0)} CSS px² at 3:1 or better (strongest ${focus.strongestContrast.toFixed(3)}:1); ${focus.requiredArea.toFixed(0)} CSS px² required`,
    ).toBeGreaterThanOrEqual(focus.requiredArea);
  });
}

test("dark-surface focus does not fade in", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/");
  await page.getByRole("button", { name: "Account for Mia" }).click();
  const profile = page.getByRole("menuitem", { name: "Learner profile" });
  await expect(profile).toBeFocused();
  await blurActiveElement(page);

  await profile.evaluate((element) => {
    const measured = element as HTMLElement & {
      parrotInitialFocusShadow?: string;
    };
    element.addEventListener(
      "focus",
      () => {
        measured.parrotInitialFocusShadow = getComputedStyle(element).boxShadow;
      },
      { once: true },
    );
  });

  await focusWithKeyboard(page, profile);
  await expect(profile).toBeFocused();
  const initialShadow = await profile.evaluate(
    (element) =>
      (element as HTMLElement & { parrotInitialFocusShadow?: string })
        .parrotInitialFocusShadow,
  );
  expect(initialShadow).toBeTruthy();

  await page.waitForTimeout(200);
  const settledShadow = await profile.evaluate(
    (element) => getComputedStyle(element).boxShadow,
  );
  expect(initialShadow).toBe(settledShadow);
});

test("retained pending focus stays visible", async ({ page }) => {
  let retrying = false;
  let releaseRetry = () => {};
  let reportRetryStarted = () => {};
  const retryGate = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });
  const retryStarted = new Promise<void>((resolve) => {
    reportRetryStarted = resolve;
  });
  await page.route("**/api/lessons/my", async (route) => {
    if (!retrying) {
      await route.abort("failed");
      return;
    }
    reportRetryStarted();
    await retryGate;
    await route.fulfill({ json: { lessons: [] }, status: 200 });
  });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/lessons");
  const retry = page
    .getByRole("complementary", { name: "Grown-up tools" })
    .getByRole("button", { name: "Try again" });
  await expect(retry).toBeVisible();
  await blurActiveElement(page);
  await focusWithKeyboard(page, retry);

  retrying = true;
  await retry.press("Enter");
  await retryStarted;
  await expect(retry).toHaveAttribute("aria-disabled", "true");
  await expect(retry).toBeFocused();
  try {
    const focus = await renderedFocusDelta(page, retry);
    expect.soft(focus.changedArea).toBeGreaterThanOrEqual(focus.requiredArea);
    expect(focus.contrastingArea).toBeGreaterThanOrEqual(focus.requiredArea);
  } finally {
    releaseRetry();
  }
});

test("forced colors keeps a visible keyboard focus indicator", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.setViewportSize({ height: 568, width: 280 });
  await openProfileSetup(page);
  const setup = page.getByRole("button", { name: "Set up profile" });
  await blurActiveElement(page);
  await focusWithKeyboard(page, setup);

  await expect(setup).toBeFocused();
  const indicator = await setup.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      focusVisible: element.matches(":focus-visible"),
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(indicator.focusVisible).toBe(true);
  expect(indicator.outlineStyle).not.toBe("none");
  expect(indicator.outlineWidth).toBeGreaterThanOrEqual(2);
});
