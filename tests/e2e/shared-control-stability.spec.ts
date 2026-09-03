import { Buffer } from "node:buffer";
import { expect, test, type Locator, type Page } from "@playwright/test";

async function expectStationaryPointerStates(
  page: Page,
  interaction: Locator,
  visual = interaction,
) {
  await expect(interaction).toBeVisible();
  await interaction.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  const normal = await visual.boundingBox();
  expect(normal).not.toBeNull();

  await interaction.hover();
  await page.waitForTimeout(250);
  const hover = await visual.boundingBox();
  expect(hover).toEqual(normal);

  await page.evaluate(() => {
    document.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      { capture: true, once: true },
    );
  });
  await page.mouse.down();
  try {
    await page.waitForTimeout(250);
    const active = await visual.boundingBox();
    expect(active).toEqual(normal);
  } finally {
    await page.mouse.up();
    await page.mouse.move(0, 0);
  }
}

async function expectWhiteIconContrast(button: Locator) {
  await expect(button).toBeVisible();
  const contrast = await button.evaluate((element) => {
    const context = document.createElement("canvas").getContext("2d", {
      willReadFrequently: true,
    });
    if (!context) throw new Error("Canvas color conversion is unavailable");
    const color = (value: string) => {
      context.canvas.width = 1;
      context.canvas.height = 1;
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
      return { blue, green, red };
    };
    const luminance = ({ red, green, blue }: ReturnType<typeof color>) => {
      const linear = (channel: number) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
    };
    const icon = element.querySelector("svg");
    if (!icon) throw new Error("Pause/resume control has no icon");
    const foreground = color(getComputedStyle(icon).color);
    const background = color(getComputedStyle(element).backgroundColor);
    const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
      (left, right) => right - left,
    );
    return {
      background,
      foreground,
      ratio: (lighter + 0.05) / (darker + 0.05),
    };
  });

  expect(contrast.foreground).toEqual({ blue: 255, green: 255, red: 255 });
  expect(Math.max(contrast.background.red, contrast.background.green, contrast.background.blue)).toBeGreaterThan(32);
  expect(contrast.ratio).toBeGreaterThanOrEqual(3);
}

test("shared action, icon, and interactive card controls do not move on hover or press", async ({
  page,
}) => {
  await page.goto("/profile/setup?parrotE2eProfile=viewport-stability");
  await expect(
    page.getByRole("heading", { name: "Help Peppa know you" }),
  ).toBeVisible();
  await page.getByRole("button", { exact: true, name: "Back" }).click();
  await expect(
    page.getByRole("heading", { name: "Answer 6 questions" }),
  ).toBeVisible();
  await expectStationaryPointerStates(
    page,
    page.getByRole("button", { name: "Start questions" }),
  );

  await page.getByRole("button", { name: "Start questions" }).click();
  await expectStationaryPointerStates(
    page,
    page.getByRole("button", { name: "Speak your answer" }),
  );

  await page.goto("/lessons");
  const lesson = page.getByRole("link", {
    name: "Start lesson: Peppa's High Ball",
  });
  await expectStationaryPointerStates(
    page,
    lesson,
  );
  await expectStationaryPointerStates(
    page,
    lesson,
    lesson.getByRole("img", {
      name: "Peppa reaching for a red ball high in a tree while Dolly flies up to help",
    }),
  );
});


test("pause and resume use a white glyph with at least 3:1 rendered contrast", async ({
  page,
}) => {
  await page.route("https://media.parrotbook.com/**", async (route) => {
    await route.fulfill({
      body: Buffer.from("UklGRh4AAABXRUJQVlA4TBEAAAAvDwACAAfQ5sp1vf+BiOh/AAA=", "base64"),
      contentType: "image/webp",
    });
  });
  await page.goto(
    "/lessons/parrot/01-peppas-high-ball/scenes/1?parrotE2eLesson=held-story",
  );
  await page.getByRole("button", { exact: true, name: "Let's go" }).click();

  const pause = page.getByRole("button", { name: "Pause lesson" });
  await expectWhiteIconContrast(pause);
  await pause.click();
  await expectWhiteIconContrast(page.getByRole("button", { name: "Resume lesson" }));
});
