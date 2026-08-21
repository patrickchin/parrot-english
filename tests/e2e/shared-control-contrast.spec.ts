import { expect, test, type Locator, type Page } from "@playwright/test";

type Color = { alpha: number; blue: number; green: number; red: number };

const viewports = [
  { height: 568, name: "ultra-narrow phone", width: 280 },
  { height: 900, name: "desktop", width: 1440 },
] as const;

function composite(foreground: Color, background: Color): Color {
  const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha);
  const channel = (front: number, back: number) =>
    alpha === 0
      ? 0
      : (front * foreground.alpha +
          back * background.alpha * (1 - foreground.alpha)) /
        alpha;

  return {
    alpha,
    blue: channel(foreground.blue, background.blue),
    green: channel(foreground.green, background.green),
    red: channel(foreground.red, background.red),
  };
}

function brightnessEffects(filters: string[]) {
  return filters.flatMap((filter) => {
    if (filter === "none") return [];

    const functions = [...filter.matchAll(/([a-z-]+)\(([^)]+)\)/g)];
    if (
      functions.length === 0 ||
      functions.some(([, name]) => name !== "brightness") ||
      functions.map(([value]) => value).join(" ") !== filter
    ) {
      throw new Error(`Unsupported rendered filter: ${filter}`);
    }

    return functions.map(([, , value]) => {
      const parsed = Number.parseFloat(value);
      return value.endsWith("%") ? parsed / 100 : parsed;
    });
  });
}

function brighten(value: Color, amount: number): Color {
  return {
    ...value,
    blue: Math.min(255, value.blue * amount),
    green: Math.min(255, value.green * amount),
    red: Math.min(255, value.red * amount),
  };
}

function luminance(value: Color) {
  const linear = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return (
    0.2126 * linear(value.red) +
    0.7152 * linear(value.green) +
    0.0722 * linear(value.blue)
  );
}

function contrast(first: Color, second: Color) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort(
    (left, right) => right - left,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

async function renderedControlContrast(locator: Locator) {
  await expect(locator).toBeVisible();
  const style = await locator.evaluate((element) => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas color conversion is unavailable");
    canvas.width = 1;
    canvas.height = 1;
    const toColor = (value: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
      return { alpha: alpha / 255, blue, green, red };
    };
    const computed = getComputedStyle(element);
    const effects = [];
    for (let current: Element | null = element; current; current = current.parentElement) {
      const currentStyle = getComputedStyle(current);
      effects.push({
        filter: currentStyle.filter,
        opacity: Number.parseFloat(currentStyle.opacity),
      });
    }

    const background = toColor(computed.backgroundColor);
    const foreground = toColor(computed.color);
    const opacity = effects.reduce(
      (product, effect) => product * effect.opacity,
      1,
    );
    const backgrounds = [];
    if (background.alpha < 1 || foreground.alpha < 1 || opacity < 1) {
      for (
        let current = element.parentElement;
        current;
        current = current.parentElement
      ) {
        const currentStyle = getComputedStyle(current);
        if (currentStyle.backgroundImage !== "none") {
          throw new Error(
            `Cannot calculate transparency through ${currentStyle.backgroundImage}`,
          );
        }
        const layer = toColor(currentStyle.backgroundColor);
        backgrounds.push(layer);
        if (layer.alpha === 1) break;
      }
    }

    return {
      background,
      backgrounds,
      effects,
      foreground,
      opacity,
    };
  });
  const backdrop = style.backgrounds.reverse().reduce(
    (background, layer) => composite(layer, background),
    { alpha: 1, blue: 255, green: 255, red: 255 },
  );
  let background = composite(style.background, backdrop);
  let foreground = composite(style.foreground, background);

  for (const amount of brightnessEffects(
    style.effects.map(({ filter }) => filter),
  )) {
    background = brighten(background, amount);
    foreground = brighten(foreground, amount);
  }

  if (style.opacity < 1) {
    background = composite({ ...background, alpha: style.opacity }, backdrop);
    foreground = composite({ ...foreground, alpha: style.opacity }, backdrop);
  }

  const filters = style.effects
    .map(({ filter }) => filter)
    .filter((filter) => filter !== "none");

  return {
    filter: filters.length === 0 ? "none" : filters.join(" → "),
    opacity: style.opacity,
    ratio: contrast(foreground, background),
  };
}

async function expectPointerStateContrast({
  interaction,
  minimum,
  name,
  page,
  visual = interaction,
}: {
  interaction: Locator;
  minimum: number;
  name: string;
  page: Page;
  visual?: Locator;
}) {
  await page.mouse.move(0, 0);
  const normal = await renderedControlContrast(visual);
  expect.soft(
    normal.ratio,
    `${name} normal contrast (${normal.ratio.toFixed(3)}:1; ${normal.filter}; opacity ${normal.opacity})`,
  ).toBeGreaterThanOrEqual(minimum);

  await interaction.hover();
  const hover = await renderedControlContrast(visual);
  expect.soft(
    hover.ratio,
    `${name} hover contrast (${hover.ratio.toFixed(3)}:1; ${hover.filter}; opacity ${hover.opacity})`,
  ).toBeGreaterThanOrEqual(minimum);

  await page.mouse.down();
  try {
    const active = await renderedControlContrast(visual);
    expect.soft(
      active.ratio,
      `${name} active contrast (${active.ratio.toFixed(3)}:1; ${active.filter}; opacity ${active.opacity})`,
    ).toBeGreaterThanOrEqual(minimum);
  } finally {
    await page.mouse.move(0, 0);
    await page.mouse.up();
  }

  await interaction.focus();
  const focused = await renderedControlContrast(visual);
  expect.soft(
    focused.ratio,
    `${name} focus contrast (${focused.ratio.toFixed(3)}:1; ${focused.filter}; opacity ${focused.opacity})`,
  ).toBeGreaterThanOrEqual(minimum);
}

async function renderedAppearance(locator: Locator) {
  return locator.evaluate((element) => {
    let opacity = 1;
    for (let current: Element | null = element; current; current = current.parentElement) {
      opacity *= Number.parseFloat(getComputedStyle(current).opacity);
    }
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      filter: style.filter,
      foreground: style.color,
      opacity,
    };
  });
}

async function focusWithKeyboard(page: Page, locator: Locator) {
  for (let index = 0; index < 12; index += 1) {
    if (await locator.evaluate((element) => element === document.activeElement)) {
      return;
    }
    await page.keyboard.press("Tab");
  }

  expect(
    await locator.evaluate((element) => element === document.activeElement),
  ).toBe(true);
}

async function renderedFocusContrast(locator: Locator) {
  const style = await locator.evaluate((element) => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas color conversion is unavailable");
    canvas.width = 1;
    canvas.height = 1;
    const toColor = (value: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
      return { alpha: alpha / 255, blue, green, red };
    };
    const computed = getComputedStyle(element);
    const backgrounds = [];

    for (
      let current = element.parentElement;
      current;
      current = current.parentElement
    ) {
      const currentStyle = getComputedStyle(current);
      if (currentStyle.backgroundImage !== "none") {
        throw new Error(
          `Cannot calculate focus adjacency through ${currentStyle.backgroundImage}`,
        );
      }
      const background = toColor(currentStyle.backgroundColor);
      backgrounds.push(background);
      if (background.alpha === 1) break;
    }

    return {
      backgrounds,
      color: toColor(computed.outlineColor),
      offset: computed.outlineOffset,
      style: computed.outlineStyle,
      width: computed.outlineWidth,
    };
  });

  const adjacent = style.backgrounds
    .reverse()
    .reduce(
      (background, layer) => composite(layer, background),
      { alpha: 1, blue: 255, green: 255, red: 255 },
    );

  return {
    ...style,
    ratio: contrast(style.color, adjacent),
  };
}

async function preparePage(
  page: Page,
  viewport: (typeof viewports)[number],
) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(viewport);
}

for (const viewport of viewports) {
  test(`default brand link keeps rendered contrast on a ${viewport.name}`, async ({
    page,
  }) => {
    await preparePage(page, viewport);

    await page.goto("/lessons");
    const createLesson = page.getByRole("link", {
      name: "Create custom lesson",
    });
    await createLesson.scrollIntoViewIfNeeded();
    await expectPointerStateContrast({
      interaction: createLesson,
      minimum: 4.5,
      name: "Create custom lesson link",
      page,
    });
  });

  test(`opaque-dialog brand focus and disabled state stay distinct on a ${viewport.name}`, async ({
    page,
  }) => {
    await preparePage(page, viewport);
    await page.goto("/lessons");

    await page.getByRole("button", { name: "Account for Mia" }).click();
    await page.getByRole("menuitem", { name: "Delete account" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete account" });
    const password = dialog.getByRole("textbox", { name: "Password" });
    const deleteAccount = dialog.getByRole("button", {
      name: "Delete account now",
    });

    await expect(deleteAccount).toBeDisabled();
    await expect(deleteAccount).toBeVisible();
    await expect(deleteAccount).toHaveText("Delete account now");
    const disabledAppearance = await renderedAppearance(deleteAccount);
    await password.fill("not-submitted");
    await expect(deleteAccount).toBeEnabled();
    expect(await renderedAppearance(deleteAccount)).not.toEqual(
      disabledAppearance,
    );

    await page.mouse.move(0, 0);
    await focusWithKeyboard(page, deleteAccount);
    await expect(deleteAccount).toBeFocused();
    const focus = await renderedFocusContrast(deleteAccount);
    expect(focus.style).not.toBe("none");
    expect(Number.parseFloat(focus.width)).toBeGreaterThanOrEqual(2);
    expect(
      focus.ratio,
      `Delete account focus outline contrast (${focus.ratio.toFixed(3)}:1)`,
    ).toBeGreaterThanOrEqual(3);
  });

  test(`default brand button keeps rendered contrast on a ${viewport.name}`, async ({
    page,
  }) => {
    await preparePage(page, viewport);
    await page.goto("/profile/setup?parrotE2eProfile=viewport-stability");
    const setup = page.getByRole("button", { name: "Set up profile" });
    await expectPointerStateContrast({
      interaction: setup,
      minimum: 4.5,
      name: "Set up profile button",
      page,
    });
  });

  test(`default brand icon keeps rendered contrast on a ${viewport.name}`, async ({
    page,
  }) => {
    await preparePage(page, viewport);
    await page.goto("/profile/setup?parrotE2eProfile=viewport-stability");
    await page.getByRole("button", { name: "Set up profile" }).click();
    await expect(
      page.getByRole("heading", { name: "What's your name?" }),
    ).toBeVisible();
    const speak = page.getByRole("button", { name: "Speak your answer" });
    await expectPointerStateContrast({
      interaction: speak,
      minimum: 3,
      name: "Speak your answer icon button",
      page,
    });
  });

  test(`story Listen cue keeps rendered contrast on a ${viewport.name}`, async ({
    page,
  }) => {
    await preparePage(page, viewport);
    await page.goto("/stories");
    const story = page.getByRole("link", {
      name: "Listen to story: The Red Ball",
    });
    const listen = story.getByText("Listen", { exact: true });
    await expect(listen).toBeVisible();
    await expectPointerStateContrast({
      interaction: story,
      minimum: 4.5,
      name: "Story Listen cue",
      page,
      visual: listen,
    });
  });

  if (viewport.name === "desktop") {
    test("lesson Play cue keeps rendered contrast on a desktop", async ({
      page,
    }) => {
      await preparePage(page, viewport);
      await page.goto("/lessons");
      const lesson = page.getByRole("link", {
        name: "Start lesson: Peppa's High Ball",
      });
      const play = lesson.getByText("Play", { exact: true });
      await expect(play).toBeVisible();
      await expectPointerStateContrast({
        interaction: lesson,
        minimum: 4.5,
        name: "Lesson Play cue",
        page,
        visual: play,
      });
    });
  }
}
