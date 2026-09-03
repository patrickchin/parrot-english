import { expect, test, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";

type Rgb = { blue: number; green: number; red: number };

function guardianPath(path: string) {
  return `${path}${path.includes("?") ? "&" : "?"}parrotE2eGuardian=guardian`;
}

async function openProfileSetup(
  page: Page,
  scenario = "viewport-stability",
) {
  await page.goto(`/profile/setup?parrotE2eProfile=${scenario}`);
  await expect(
    page.getByRole("heading", { name: "Help Peppa know you" }),
  ).toBeVisible();
  await page.getByRole("button", { exact: true, name: "Back" }).click();
  await expect(
    page.getByRole("heading", {
      name: /^Answer \d+(?: more)? questions?$/,
    }),
  ).toBeFocused();
}

async function openProfileQuestion(page: Page) {
  await openProfileSetup(page);
  await page.getByRole("button", { name: "Start questions" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Hi! I'm Peppa. What's your name?",
    }),
  ).toBeFocused();
}

const focusScenarios: Array<{
  keepSurfaceFocus?: boolean;
  name: string;
  prepare: (page: Page) => Promise<Locator>;
  viewport: { height: number; width: number };
}> = [
  {
    keepSurfaceFocus: true,
    name: "dark navy account menu",
    prepare: async (page) => {
      await page.goto(guardianPath("/guardian"));
      await page
        .getByRole("button", {
          name: "Profile for ⁨Alex Guardian⁩, guardian mode",
        })
        .click();
      return page.getByRole("menuitem", { name: "Guardian dashboard" });
    },
    viewport: { height: 844, width: 390 },
  },
  {
    name: "light profile setup",
    prepare: async (page) => {
      await openProfileSetup(page);
      return page.getByRole("button", { name: "Start questions" });
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
      return page.getByRole("textbox", {
        exact: true,
        name: "Your answer",
      });
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
    name: "profile replay icon action",
    prepare: async (page) => {
      await openProfileQuestion(page);
      return page.getByRole("button", { name: "Replay question" });
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
      return page.getByRole("tab", {
        name: "Level 1 · Words & pictures",
      });
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
      await expect(
        page.getByRole("button", { exact: true, name: "Let's go" }),
      ).toBeFocused();
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
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
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
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
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

function renderedScreenshotDelta({
  borderRadius,
  box,
  focused,
  unfocused,
  viewport,
}: {
  borderRadius: number;
  box: NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;
  focused: Awaited<ReturnType<typeof decodedScreenshot>>;
  unfocused: Awaited<ReturnType<typeof decodedScreenshot>>;
  viewport: NonNullable<ReturnType<Page["viewportSize"]>>;
}) {
  expect(focused.info.width).toBe(unfocused.info.width);
  expect(focused.info.height).toBe(unfocused.info.height);
  expect(focused.info.channels).toBe(unfocused.info.channels);

  const scaleX = focused.info.width / viewport.width;
  const scaleY = focused.info.height / viewport.height;
  const horizontalPadding = 20;
  const verticalPadding = 12;
  const left = Math.max(0, Math.floor((box.x - horizontalPadding) * scaleX));
  const right = Math.min(
    focused.info.width,
    Math.ceil((box.x + box.width + horizontalPadding) * scaleX),
  );
  const top = Math.max(0, Math.floor((box.y - verticalPadding) * scaleY));
  const bottom = Math.min(
    focused.info.height,
    Math.ceil((box.y + box.height + verticalPadding) * scaleY),
  );
  const outlineLeftLeft = Math.max(0, Math.floor((box.x - 4) * scaleX));
  const outlineLeftRight = Math.min(
    focused.info.width,
    Math.ceil(box.x * scaleX),
  );
  const targetTop = Math.max(0, Math.floor(box.y * scaleY));
  const targetBottom = Math.min(
    focused.info.height,
    Math.ceil((box.y + box.height) * scaleY),
  );
  const outlineRightLeft = Math.max(
    0,
    Math.floor((box.x + box.width) * scaleX),
  );
  const outlineRightRight = Math.min(
    focused.info.width,
    Math.ceil((box.x + box.width + 4) * scaleX),
  );
  let changedPixels = 0;
  let contrastingPixels = 0;
  let leftOutlineContrastingPixels = 0;
  let rightOutlineContrastingPixels = 0;
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
      if (ratio >= 3) {
        contrastingPixels += 1;
        if (
          x >= outlineLeftLeft &&
          x < outlineLeftRight &&
          y >= targetTop &&
          y < targetBottom
        ) {
          leftOutlineContrastingPixels += 1;
        }
        if (
          x >= outlineRightLeft &&
          x < outlineRightRight &&
          y >= targetTop &&
          y < targetBottom
        ) {
          rightOutlineContrastingPixels += 1;
        }
      }
    }
  }

  const renderedPixelsPerCssPixel = scaleX * scaleY;
  const radius = Math.min(
    Number.isFinite(borderRadius) ? borderRadius : 0,
    box.width / 2,
    box.height / 2,
  );
  return {
    changedArea: changedPixels / renderedPixelsPerCssPixel,
    contrastingArea: contrastingPixels / renderedPixelsPerCssPixel,
    leftOutlineContrastingArea:
      leftOutlineContrastingPixels / renderedPixelsPerCssPixel,
    rightOutlineContrastingArea:
      rightOutlineContrastingPixels / renderedPixelsPerCssPixel,
    forcedOutlineEdgeArea: 1.5 * box.height,
    requiredArea: 4 * (box.width + box.height) - (16 - 4 * Math.PI) * radius,
    strongestContrast,
  };
}

async function focusGeometry(page: Page, target: Locator) {
  const box = await target.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  return {
    borderRadius: await target.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).borderTopLeftRadius),
    ),
    box: box!,
    viewport: viewport!,
  };
}

async function renderedFocusDelta(
  page: Page,
  target: Locator,
  keepSurfaceFocus = false,
) {
  await expect(target).toBeVisible();
  await target.scrollIntoViewIfNeeded();
  if (!keepSurfaceFocus) await blurActiveElement(page);
  const geometry = await focusGeometry(page, target);
  const unfocused = await decodedScreenshot(page);
  await focusWithKeyboard(page, target);
  await expect(target).toBeFocused();
  expect(
    await target.evaluate((element) => element.matches(":focus-visible")),
  ).toBe(true);
  const focused = await decodedScreenshot(page);

  return renderedScreenshotDelta({ ...geometry, focused, unfocused });
}

async function renderedInitialFocusDelta(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  await expect(target).toBeFocused();
  const geometry = await focusGeometry(page, target);
  const focused = await decodedScreenshot(page);
  await target.evaluate((element) => (element as HTMLElement).blur());
  await expect(target).not.toBeFocused();
  const unfocused = await decodedScreenshot(page);

  return renderedScreenshotDelta({
    ...geometry,
    focused,
    unfocused,
  });
}

function expectRenderedFocusTarget(
  focus: Awaited<ReturnType<typeof renderedInitialFocusDelta>>,
  name: string,
) {
  expect
    .soft(
      focus.changedArea,
      `${name} has ${focus.changedArea.toFixed(0)} CSS px² of rendered focus change; ${focus.requiredArea.toFixed(0)} CSS px² required`,
    )
    .toBeGreaterThanOrEqual(focus.requiredArea);
  expect(
    focus.contrastingArea,
    `${name} has ${focus.contrastingArea.toFixed(0)} CSS px² at 3:1 or better (strongest ${focus.strongestContrast.toFixed(3)}:1); ${focus.requiredArea.toFixed(0)} CSS px² required`,
  ).toBeGreaterThanOrEqual(focus.requiredArea);
}

function expectNoRenderedFocusDecoration(
  focus: Awaited<ReturnType<typeof renderedInitialFocusDelta>>,
  name: string,
) {
  expect(
    focus.changedArea,
    `${name} changes ${focus.changedArea.toFixed(0)} CSS px² when focus moves away`,
  ).toBeLessThan(1);
}

function expectRenderedForcedReadingOutline(
  focus: Awaited<ReturnType<typeof renderedInitialFocusDelta>>,
  name: string,
) {
  const requiredArea = focus.forcedOutlineEdgeArea * 2;
  expect
    .soft(
      focus.changedArea,
      `${name} has ${focus.changedArea.toFixed(0)} CSS px² of rendered focus change; ${requiredArea.toFixed(0)} CSS px² required`,
    )
    .toBeGreaterThanOrEqual(requiredArea);
  expect(
    focus.contrastingArea,
    `${name} has ${focus.contrastingArea.toFixed(0)} CSS px² at 3:1 or better (strongest ${focus.strongestContrast.toFixed(3)}:1); ${requiredArea.toFixed(0)} CSS px² required`,
  ).toBeGreaterThanOrEqual(requiredArea);
  expect(
    focus.leftOutlineContrastingArea,
    `${name} has ${focus.leftOutlineContrastingArea.toFixed(0)} CSS px² at 3:1 or better along its left outline edge; ${focus.forcedOutlineEdgeArea.toFixed(0)} CSS px² required`,
  ).toBeGreaterThanOrEqual(focus.forcedOutlineEdgeArea);
  expect(
    focus.rightOutlineContrastingArea,
    `${name} has ${focus.rightOutlineContrastingArea.toFixed(0)} CSS px² at 3:1 or better along its right outline edge; ${focus.forcedOutlineEdgeArea.toFixed(0)} CSS px² required`,
  ).toBeGreaterThanOrEqual(focus.forcedOutlineEdgeArea);
}

for (const scenario of focusScenarios) {
  test(`keyboard focus stays visible on the ${scenario.name}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(scenario.viewport);
    const target = await scenario.prepare(page);
    const focus = await renderedFocusDelta(
      page,
      target,
      scenario.keepSurfaceFocus,
    );

    expectRenderedFocusTarget(focus, scenario.name);
  });
}

test("programmatic story focus adds no decoration on a narrow phone", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ height: 568, width: 280 });
  await page.goto("/stories/the-red-ball/pages/1");
  const text = page.getByText("Here is my red ball.", { exact: true });

  await expect(text).toHaveAttribute(
    "aria-label",
    "Page 1 of 5. Here is my red ball.",
  );
  expect(
    await text.evaluate((element) => {
      const style = getComputedStyle(element);
      return Math.round(
        element.getBoundingClientRect().height /
          Number.parseFloat(style.lineHeight),
      );
    }),
  ).toBe(1);
  expectNoRenderedFocusDecoration(
    await renderedInitialFocusDelta(page, text),
    "narrow Story Reader page text",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("programmatic story completion focus adds no decoration", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ height: 568, width: 280 });
  await page.goto("/stories/the-red-ball/pages/5");
  await page.getByRole("button", { name: "Finish story" }).click();
  const heading = page.getByRole("heading", {
    exact: true,
    name: "Great job!",
  });

  expectNoRenderedFocusDecoration(
    await renderedInitialFocusDelta(page, heading),
    "Story Reader completion heading",
  );
});

test("story page changes add no focus decoration after pointer input", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/stories/the-red-ball/pages/1");
  const reader = page.getByRole("region", { name: "Story reader" });

  await reader.getByRole("button", { name: "Next page" }).click();
  await expect(page).toHaveURL(/\/stories\/the-red-ball\/pages\/2$/);
  const text = reader.getByText("Roll, red ball, roll.", { exact: true });
  await expect(text).toHaveAttribute(
    "aria-label",
    "Page 2 of 5. Roll, red ball, roll.",
  );
  expectNoRenderedFocusDecoration(
    await renderedInitialFocusDelta(page, text),
    "pointer-advanced Story Reader page text",
  );
});

test("long story focus stays visible inside the short-wide reading pane", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto("/stories/kite-come-back/pages/4");
  const text = page.getByText(
    "Rose gives the string one small pull. It will not move.",
    { exact: true },
  );
  const controls = page.getByRole("navigation", { name: "Story controls" });

  await expect(text).toHaveAttribute(
    "aria-label",
    "Page 4 of 7. Rose gives the string one small pull. It will not move.",
  );
  const containment = await text.evaluate((element) => {
    const style = getComputedStyle(element);
    const target = element.getBoundingClientRect();
    return {
      lineCount: Math.round(
        target.height / Number.parseFloat(style.lineHeight),
      ),
    };
  });
  expect(containment.lineCount).toBeLessThanOrEqual(3);

  const textBox = await text.boundingBox();
  const controlsBox = await controls.boundingBox();
  expect(textBox).not.toBeNull();
  expect(controlsBox).not.toBeNull();
  expect(textBox!.y).toBeGreaterThanOrEqual(0);
  expect(textBox!.y + textBox!.height).toBeLessThanOrEqual(controlsBox!.y);
  expectNoRenderedFocusDecoration(
    await renderedInitialFocusDelta(page, text),
    "short-wide Story Reader page text",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("a threshold story line keeps its prompt visible in short-wide reading", async ({
  page,
}) => {
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto("/stories/robo-tries/pages/6");
  const text = page.getByText("Bob smiles. “I can try!”", { exact: true });
  const prompt = page.getByLabel("Say it: I can try!");
  const controls = page.getByRole("navigation", { name: "Story controls" });

  const lineCount = await text.evaluate((element) => {
    const style = getComputedStyle(element);
    return Math.round(
      element.getBoundingClientRect().height /
        Number.parseFloat(style.lineHeight),
    );
  });
  expect(lineCount).toBe(1);
  const promptBox = await prompt.boundingBox();
  const controlsBox = await controls.boundingBox();
  expect(promptBox).not.toBeNull();
  expect(controlsBox).not.toBeNull();
  expect(promptBox!.y).toBeGreaterThanOrEqual(0);
  expect(promptBox!.y + promptBox!.height).toBeLessThanOrEqual(controlsBox!.y);
  const promptVisibility = await prompt.evaluate((element) => {
    let clip = element.parentElement;
    while (clip) {
      const overflowY = getComputedStyle(clip).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") break;
      clip = clip.parentElement;
    }
    if (!clip) return null;
    const target = element.getBoundingClientRect();
    const viewport = clip.getBoundingClientRect();
    return {
      height: target.height,
      visibleHeight: Math.max(
        0,
        Math.min(target.bottom, viewport.bottom) -
          Math.max(target.top, viewport.top),
      ),
    };
  });
  expect(promptVisibility).not.toBeNull();
  expect(promptVisibility!.visibleHeight).toBeGreaterThanOrEqual(
    promptVisibility!.height - 1,
  );
});

for (const scenario of [
  {
    name: "narrow phone",
    route: "/stories/the-red-ball/pages/1",
    text: "Here is my red ball.",
    viewport: { height: 568, width: 280 },
  },
  {
    name: "short-wide reader",
    route: "/stories/kite-come-back/pages/4",
    text: "Rose gives the string one small pull. It will not move.",
    viewport: { height: 360, width: 640 },
  },
] as const) {
  test(`story page focus retains a complete real indicator in forced colors on the ${scenario.name}`, async ({
    page,
  }) => {
    await page.emulateMedia({
      forcedColors: "active",
      reducedMotion: "reduce",
    });
    await page.setViewportSize(scenario.viewport);
    await page.goto(scenario.route);
    const text = page.getByText(scenario.text, { exact: true });

    await expect(text).toBeFocused();
    const indicator = await text.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
      };
    });
    expect(indicator.outlineStyle).not.toBe("none");
    expect(indicator.outlineWidth).toBeGreaterThanOrEqual(2);
    expectRenderedForcedReadingOutline(
      await renderedInitialFocusDelta(page, text),
      `forced-colors Story Reader page text on the ${scenario.name}`,
    );
  });
}

test("story completion focus retains a real indicator in forced colors", async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto("/stories/the-red-ball/pages/5");
  await page.getByRole("button", { name: "Finish story" }).click();
  const heading = page.getByRole("heading", {
    exact: true,
    name: "Great job!",
  });

  await expect(heading).toBeFocused();
  const indicator = await heading.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(indicator.outlineStyle).not.toBe("none");
  expect(indicator.outlineWidth).toBeGreaterThanOrEqual(2);
  expectRenderedForcedReadingOutline(
    await renderedInitialFocusDelta(page, heading),
    "forced-colors Story Reader completion heading",
  );
});

function lessonShelfHeading(page: Page) {
  return page.getByRole("heading", {
    exact: true,
    level: 1,
    name: "Pick a lesson",
  });
}

function firstLessonLink(page: Page) {
  return page
    .getByRole("region", { name: "Lessons" })
    .getByRole("link", { name: "Start lesson: Peppa's High Ball" });
}

async function settleLessonShelf(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images, (image) => image.decode().catch(() => {})),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

async function openSettledLessonShelf(page: Page) {
  await page.goto("/lessons");
  await expect(lessonShelfHeading(page)).toBeFocused();
  await expect(firstLessonLink(page)).toBeVisible();
  await settleLessonShelf(page);
}

async function roundedLocatorBox(target: Locator) {
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  const rounded = (value: number) => Math.round(value * 100) / 100;
  return {
    height: rounded(box!.height),
    width: rounded(box!.width),
    x: rounded(box!.x),
    y: rounded(box!.y),
  };
}

async function lessonShelfHeadingGeometry(page: Page, heading: Locator) {
  const text = await heading.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const box = range.getBoundingClientRect();
    const rounded = (value: number) => Math.round(value * 100) / 100;
    return {
      height: rounded(box.height),
      width: rounded(box.width),
      x: rounded(box.x),
      y: rounded(box.y),
    };
  });
  const presentation = await heading.evaluate((element) => {
    return {
      documentScroll: {
        left: document.documentElement.scrollLeft,
        top: document.documentElement.scrollTop,
      },
      mainScroll: {
        left: element.closest("main")?.scrollLeft ?? null,
        top: element.closest("main")?.scrollTop ?? null,
      },
    };
  });

  return {
    account: await roundedLocatorBox(
      page.getByRole("button", { name: /^Profile for / }),
    ),
    back: await roundedLocatorBox(
      page.getByRole("link", { name: "Back to home" }),
    ),
    firstLesson: await roundedLocatorBox(firstLessonLink(page)),
    heading: await roundedLocatorBox(heading),
    text,
    ...presentation,
  };
}

async function expectLessonShelfFocusIsUndecorated(
  page: Page,
  heading: Locator,
  name: string,
) {
  await expect(heading).toBeFocused();
  await expect(heading).toHaveAttribute("tabindex", "-1");
  const focused = await lessonShelfHeadingGeometry(page, heading);
  expect(focused.heading.width - focused.text.width).toBeLessThanOrEqual(1);
  expect(focused.mainScroll).toEqual({ left: 0, top: 0 });
  expect(focused.documentScroll).toEqual({ left: 0, top: 0 });

  expectNoRenderedFocusDecoration(
    await renderedInitialFocusDelta(page, heading),
    name,
  );

  const blurred = await lessonShelfHeadingGeometry(page, heading);
  // Linux Chromium can requantize this downstream block offset by a fraction
  // of a CSS pixel while taking the focused and unfocused screenshots.
  expect(
    Math.abs(blurred.firstLesson.y - focused.firstLesson.y),
  ).toBeLessThanOrEqual(0.25);
  blurred.firstLesson.y = focused.firstLesson.y;
  expect(blurred).toEqual(focused);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

for (const viewport of [
  { height: 568, width: 280 },
  { height: 360, width: 640 },
]) {
  test(`lesson shelf direct arrival adds no heading decoration at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(viewport);
    await openSettledLessonShelf(page);

    await expectLessonShelfFocusIsUndecorated(
      page,
      lessonShelfHeading(page),
      `lesson shelf heading at ${viewport.width}x${viewport.height}`,
    );
  });
}

for (const activation of ["pointer", "keyboard"] as const) {
  test(`lesson shelf ${activation} navigation adds no heading decoration`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto("/");
    const lessonLink = page.getByRole("link", { name: "Play a lesson" });
    if (activation === "pointer") {
      await lessonLink.click();
    } else {
      await focusWithKeyboard(page, lessonLink);
      await page.keyboard.press("Enter");
    }

    await expect(page).toHaveURL("/lessons");
    await expect(firstLessonLink(page)).toBeVisible();
    await settleLessonShelf(page);
    await expectLessonShelfFocusIsUndecorated(
      page,
      lessonShelfHeading(page),
      `${activation}-arrived lesson shelf heading`,
    );
  });
}

test("lesson shelf heading remains outside the ordinary Tab sequence", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await openSettledLessonShelf(page);
  const heading = lessonShelfHeading(page);
  await page.keyboard.press("Tab");

  await expect(firstLessonLink(page)).toBeFocused();
  await expect(heading).not.toBeFocused();
});

test("lesson shelf arrival keeps a real localized indicator in forced colors", async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.setViewportSize({ height: 360, width: 640 });
  await openSettledLessonShelf(page);
  const heading = lessonShelfHeading(page);
  const indicator = await heading.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });

  expect(indicator.outlineStyle).not.toBe("none");
  expect(indicator.outlineWidth).toBeGreaterThanOrEqual(2);
  const focus = await renderedInitialFocusDelta(page, heading);
  expectRenderedForcedReadingOutline(
    focus,
    "forced-colors lesson shelf heading",
  );
});

async function profileHeadingGeometry(target: Locator) {
  return target.evaluate((element) => {
    const rounded = (value: number) => Math.round(value * 100) / 100;
    const rectangle = (node: Element | null) => {
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return {
        height: rounded(box.height),
        width: rounded(box.width),
        x: rounded(box.x),
        y: rounded(box.y),
      };
    };
    const heading = element.getBoundingClientRect();
    const cardElement = element.closest("section");
    const card = cardElement?.getBoundingClientRect();
    if (!card || !cardElement) {
      throw new Error("Profile heading card was not found.");
    }
    const cardStyle = getComputedStyle(cardElement);
    const style = getComputedStyle(element);
    const textRange = document.createRange();
    textRange.selectNodeContents(element);
    const text = textRange.getBoundingClientRect();
    return {
      actions: Array.from(cardElement.querySelectorAll("button")).map(
        rectangle,
      ),
      art: rectangle(cardElement.querySelector("img")),
      card: rectangle(cardElement),
      cardInnerLeft: card.left + Number.parseFloat(cardStyle.borderLeftWidth),
      cardLeft: card.left,
      cardRight: card.right,
      heading: {
        height: heading.height,
        width: heading.width,
        x: heading.x,
        y: heading.y,
      },
      lineCount: Math.round(
        heading.height / Number.parseFloat(style.lineHeight),
      ),
      mainScrollLeft: element.closest("main")?.scrollLeft ?? null,
      mainScrollTop: element.closest("main")?.scrollTop ?? null,
      text: {
        height: rounded(text.height),
        width: rounded(text.width),
        x: rounded(text.x),
        y: rounded(text.y),
      },
      textarea: rectangle(cardElement.querySelector("textarea")),
    };
  });
}

function profileStepHeading(page: Page, name: string) {
  return page.getByRole("heading", { exact: true, level: 1, name });
}

async function expectProfileHeadingContract(
  target: Locator,
  text: string,
  id?: string,
) {
  await expect(target).toHaveText(text);
  await expect(target).toHaveAttribute("tabindex", "-1");
  if (id) await expect(target).toHaveAttribute("id", id);
}

async function expectProfileFocusIsUndecorated(
  page: Page,
  target: Locator,
  name: string,
) {
  await expect(target).toBeFocused();
  await expect(target).toHaveAttribute("tabindex", "-1");
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) animation.cancel();
  });
  const focused = await profileHeadingGeometry(target);
  expect(focused.heading.x).toBeGreaterThanOrEqual(focused.cardInnerLeft);
  expect(focused.heading.x + focused.heading.width).toBeLessThanOrEqual(
    focused.cardRight + 1,
  );
  expect(focused.mainScrollLeft).toBe(0);
  expect(focused.mainScrollTop).toBe(0);

  expectNoRenderedFocusDecoration(
    await renderedInitialFocusDelta(page, target),
    name,
  );

  const blurred = await profileHeadingGeometry(target);
  if (focused.art && blurred.art) {
    // Chromium can requantize an animation transform by one hundredth of a pixel.
    expect(Math.abs(blurred.art.y - focused.art.y)).toBeLessThanOrEqual(0.02);
    blurred.art.y = focused.art.y;
  }
  expect(blurred).toEqual(focused);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

async function expectProfileForcedReadingCue(
  page: Page,
  target: Locator,
  name: string,
) {
  await expect(target).toBeFocused();
  await expect(target).toHaveAttribute("tabindex", "-1");
  const indicator = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(indicator.outlineStyle).not.toBe("none");
  expect(indicator.outlineWidth).toBeGreaterThanOrEqual(2);

  const focus = await renderedInitialFocusDelta(page, target);
  expectRenderedForcedReadingOutline(focus, name);
}

test("profile steps add no heading decoration through pointer transitions", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ height: 568, width: 280 });
  await openProfileSetup(page);

  const setupHeading = profileStepHeading(page, "Answer 6 questions");
  await expectProfileHeadingContract(setupHeading, "Answer 6 questions");
  await expectProfileFocusIsUndecorated(
    page,
    setupHeading,
    "profile setup heading",
  );

  await page.getByRole("button", { name: "Start questions" }).click();
  const questionHeading = profileStepHeading(
    page,
    "Hi! I'm Peppa. What's your name?",
  );
  await expectProfileHeadingContract(
    questionHeading,
    "Hi! I'm Peppa. What's your name?",
    "learner-profile-question-title",
  );
  await expect(questionHeading).toBeFocused();
  await expectProfileFocusIsUndecorated(
    page,
    questionHeading,
    "pointer-arrived profile question heading",
  );

  await page
    .getByRole("textbox", { exact: true, name: "Your answer" })
    .fill("Mia");
  await page.getByRole("button", { exact: true, name: "Next" }).click();
  const acknowledgmentHeading = profileStepHeading(page, "Thank you!");
  await expectProfileHeadingContract(acknowledgmentHeading, "Thank you!");
  await expect(acknowledgmentHeading).toBeFocused();
  await expectProfileFocusIsUndecorated(
    page,
    acknowledgmentHeading,
    "pointer-arrived profile acknowledgment heading",
  );
});

test("keyboard profile transitions add no heading decoration", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ height: 360, width: 640 });
  await openProfileSetup(page);

  const setup = page.getByRole("button", { name: "Start questions" });
  await focusWithKeyboard(page, setup);
  await page.keyboard.press("Enter");
  const questionHeading = profileStepHeading(
    page,
    "Hi! I'm Peppa. What's your name?",
  );
  await expect(questionHeading).toBeFocused();
  await expectProfileFocusIsUndecorated(
    page,
    questionHeading,
    "keyboard-arrived profile question heading",
  );

  const answer = page.getByRole("textbox", {
    exact: true,
    name: "Your answer",
  });
  await answer.fill("Mia");
  const next = page.getByRole("button", { exact: true, name: "Next" });
  await focusWithKeyboard(page, next);
  await page.keyboard.press("Enter");
  const acknowledgmentHeading = profileStepHeading(page, "Thank you!");
  await expect(acknowledgmentHeading).toBeFocused();
  await expectProfileFocusIsUndecorated(
    page,
    acknowledgmentHeading,
    "keyboard-arrived profile acknowledgment heading",
  );
});

test("profile headings keep a real indicator through forced-color pointer transitions", async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.setViewportSize({ height: 360, width: 640 });
  await openProfileSetup(page);

  const setupHeading = profileStepHeading(page, "Answer 6 questions");
  await expectProfileForcedReadingCue(
    page,
    setupHeading,
    "forced-colors profile setup heading",
  );

  await page.getByRole("button", { name: "Start questions" }).click();
  const questionHeading = profileStepHeading(
    page,
    "Hi! I'm Peppa. What's your name?",
  );
  await expectProfileForcedReadingCue(
    page,
    questionHeading,
    "forced-colors pointer-arrived profile question heading",
  );

  await page
    .getByRole("textbox", { exact: true, name: "Your answer" })
    .fill("Mia");
  await page.getByRole("button", { exact: true, name: "Next" }).click();
  await expectProfileForcedReadingCue(
    page,
    profileStepHeading(page, "Thank you!"),
    "forced-colors pointer-arrived profile acknowledgment heading",
  );
});

test("the long profile acknowledgment focus stays contained and undecorated", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ height: 568, width: 280 });
  await openProfileSetup(page, "long-acknowledgment");
  await page.getByRole("button", { name: "Start questions" }).click();
  await page
    .getByRole("textbox", { exact: true, name: "Your answer" })
    .fill("Mia");
  await page.getByRole("button", { exact: true, name: "Next" }).click();

  const acknowledgmentText =
    "Mia, that is a lovely answer! Peppa is happy to know you, and she cannot wait to hear about your favourite games, animals, stories, songs, and silly dances too!";
  const acknowledgmentHeading = profileStepHeading(page, acknowledgmentText);
  await expectProfileHeadingContract(acknowledgmentHeading, acknowledgmentText);
  await expectProfileFocusIsUndecorated(
    page,
    acknowledgmentHeading,
    "long profile acknowledgment heading",
  );
});

test("profile reading targets stay out of the ordinary Tab sequence", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await openProfileSetup(page);
  await page.keyboard.press("Tab");
  const setup = page.getByRole("button", { name: "Start questions" });
  await expect(setup).toBeFocused();

  await page.keyboard.press("Enter");
  const questionHeading = profileStepHeading(
    page,
    "Hi! I'm Peppa. What's your name?",
  );
  await expect(questionHeading).toBeFocused();
  await page.keyboard.press("Tab");
  const answer = page.getByRole("textbox", {
    exact: true,
    name: "Your answer",
  });
  await expect(answer).toBeFocused();

  await answer.fill("Mia");
  const next = page.getByRole("button", { exact: true, name: "Next" });
  await focusWithKeyboard(page, next);
  await page.keyboard.press("Enter");
  await expect(profileStepHeading(page, "Thank you!")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { exact: true, name: "Next" }),
  ).toBeFocused();
});

test("dark-surface focus does not fade in or linger after moving", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto(guardianPath("/guardian"));
  await expect(
    page.getByRole("heading", {
      exact: true,
      level: 1,
      name: "Guardian dashboard",
    }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Profile for ⁨Alex Guardian⁩, guardian mode" })
    .click();
  const panel = page.getByRole("dialog", { name: "Account menu" });
  await expect(
    panel.getByRole("button", { exact: true, name: "English" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    panel.getByRole("button", { exact: true, name: "中文" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  const dashboard = page.getByRole("menuitem", {
    name: "Guardian dashboard",
  });
  await expect(dashboard).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const signOut = page.getByRole("menuitem", { name: "Sign out" });
  await expect(signOut).toBeFocused();
  const unfocusedShadow = await dashboard.evaluate(
    (element) => getComputedStyle(element).boxShadow,
  );

  await dashboard.evaluate((element) => {
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

  await page.keyboard.press("ArrowUp");
  await expect(dashboard).toBeFocused();
  const initialShadow = await dashboard.evaluate(
    (element) =>
      (element as HTMLElement & { parrotInitialFocusShadow?: string })
        .parrotInitialFocusShadow,
  );
  expect(initialShadow).toBeTruthy();

  await page.waitForTimeout(200);
  const settledShadow = await dashboard.evaluate(
    (element) => getComputedStyle(element).boxShadow,
  );
  expect(initialShadow).toBe(settledShadow);

  await dashboard.evaluate((element) => {
    const measured = element as HTMLElement & {
      parrotInitialBlurShadow?: string;
    };
    element.addEventListener(
      "blur",
      () => {
        measured.parrotInitialBlurShadow = getComputedStyle(element).boxShadow;
      },
      { once: true },
    );
  });
  await dashboard.press("ArrowDown");
  await expect(signOut).toBeFocused();
  const initialBlurShadow = await dashboard.evaluate(
    (element) =>
      (element as HTMLElement & { parrotInitialBlurShadow?: string })
        .parrotInitialBlurShadow,
  );
  expect(initialBlurShadow).toBe(unfocusedShadow);

  await page.waitForTimeout(200);
  expect(
    await dashboard.evaluate(
      (element) => getComputedStyle(element).boxShadow,
    ),
  ).toBe(unfocusedShadow);
});

test("route reading focus stays visually quiet outside forced colors", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto(guardianPath("/guardian"));
  const heading = page.getByRole("heading", {
    exact: true,
    level: 1,
    name: "Guardian dashboard",
  });

  await expect(heading).toBeFocused();
  await expect(heading).toHaveAttribute("data-route-focus-target", "");
  await expect
    .poll(() =>
      heading.evaluate((element) => getComputedStyle(element).outlineStyle),
    )
    .toBe("none");

  await page.emulateMedia({ forcedColors: "active" });
  const forcedColorsIndicator = await heading.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(forcedColorsIndicator.outlineStyle).not.toBe("none");
  expect(forcedColorsIndicator.outlineWidth).toBeGreaterThanOrEqual(2);
});

test("forced colors keeps a visible keyboard focus indicator", async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.setViewportSize({ height: 568, width: 280 });
  await openProfileSetup(page);
  const setup = page.getByRole("button", { name: "Start questions" });
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

test("forced colors keeps the profile Replay focus fully clear", async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.setViewportSize({ height: 568, width: 280 });
  await openProfileQuestion(page);
  const replay = page.getByRole("button", { name: "Replay question" });

  expectRenderedFocusTarget(
    await renderedFocusDelta(page, replay),
    "forced-colors profile replay action",
  );

  const account = page.getByRole("button", { name: /^Profile for / });
  const progress = page.getByText("Question 1 of 6", { exact: true });
  const [accountBox, progressBox, replayBox] = await Promise.all([
    account.boundingBox(),
    progress.boundingBox(),
    replay.boundingBox(),
  ]);
  expect(accountBox).not.toBeNull();
  expect(progressBox).not.toBeNull();
  expect(replayBox).not.toBeNull();
  const focusPaint = await replay.evaluate((element) => {
    const style = getComputedStyle(element);
    return (
      Number.parseFloat(style.outlineOffset) +
      Number.parseFloat(style.outlineWidth)
    );
  });
  const replayPaint = {
    height: replayBox!.height + focusPaint * 2,
    width: replayBox!.width + focusPaint * 2,
    x: replayBox!.x - focusPaint,
    y: replayBox!.y - focusPaint,
  };
  for (const [label, box] of [
    ["Account", accountBox!],
    ["progress text", progressBox!],
  ] as const) {
    const overlaps = !(
      replayPaint.x + replayPaint.width <= box.x ||
      box.x + box.width <= replayPaint.x ||
      replayPaint.y + replayPaint.height <= box.y ||
      box.y + box.height <= replayPaint.y
    );
    expect(overlaps, `${label} overlaps Replay focus paint`).toBe(false);
  }
});
