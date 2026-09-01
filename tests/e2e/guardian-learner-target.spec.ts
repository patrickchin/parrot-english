import { expect, test } from "@playwright/test";

for (const width of [280, 320, 390]) {
  test(`keeps every learner target contained and keyboard-selectable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 640 });
    await page.goto(
      "/tests/fixtures/guardian-learner-target.html?context=stories&learnerProfileId=learner-mia",
    );

    const selector = page.getByRole("group", {
      name: "Choose learner settings target",
    });
    const longNames = [
      "Noah the Extraordinary Space Explorer",
      "Alexandria the Magnificent Storyteller",
    ];
    await expect(selector).toBeVisible();
    for (const name of longNames) {
      await expect(page.getByRole("button", { name })).toBeVisible();
    }
    await expect
      .poll(() =>
        selector.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return {
            documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
            left: Math.round(rect.left),
            right: Math.round(rect.right - window.innerWidth),
          };
        }),
      )
      .toEqual({ documentOverflow: 0, left: 8, right: -8 });

    if (width === 280) {
      const visibleNames = ["Mia", ...longNames];
      for (const name of visibleNames) {
        await page.keyboard.press("Tab");
        await expect(
          selector.getByRole("button", { exact: true, name }),
        ).toBeFocused();
      }
      await page.keyboard.press("Shift+Tab");
      await expect(
        selector.getByRole("button", { exact: true, name: longNames[0] }),
      ).toBeFocused();
      await expect(
        selector.getByRole("button", { exact: true, name: "Mia" }),
      ).toHaveAttribute("aria-pressed", "true");
    }

    const noah = page.getByRole("button", { name: longNames[0] });
    await noah.focus();
    await page.keyboard.press("Enter");
    await expect(noah).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("status").filter({ hasText: "Editing settings" })).toContainText(
      `Editing settings for ⁨${longNames[0]}⁩`,
    );
    await expect(page).toHaveURL(
      new RegExp(
        `context=stories&learnerProfileId=learner-noah$`,
      ),
    );

    const alexandria = page.getByRole("button", { name: longNames[1] });
    await alexandria.focus();
    await page.keyboard.press("Space");
    await expect(alexandria).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("status").filter({ hasText: "Editing settings" })).toContainText(
      `Editing settings for ⁨${longNames[1]}⁩`,
    );
  });
}
