import { expect, test, type Locator, type Page } from "@playwright/test";

type Rect = { height: number; width: number; x: number; y: number };
type DubPreviewSnapshot = { pending: number; requests: number; resolved: number };
type DubStoreSnapshot = { uploads: string[] };
type MicrophoneSnapshot = {
  pending: number;
  requests: number;
  resolved: number;
  resolveNext(): boolean;
  stoppedTracks: number;
};

const studioViewports = [
  { height: 568, width: 280 },
  { height: 844, width: 390 },
  { height: 360, width: 640 },
  { height: 800, width: 1280 },
] as const;

async function enterStudio(page: Page, action: "Continue dubbing" | "Start dubbing") {
  await page.getByRole("checkbox", { name: /I’m the grown-up/ }).check();
  await page.getByRole("button", { name: action }).click();
}

async function visibleBox(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

function boxesOverlap(first: Rect, second: Rect) {
  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}

async function dubPreviewSnapshot(page: Page) {
  const snapshot = await page.evaluate(() =>
    (
      window as typeof window & {
        __parrotE2eDubPreview?: { snapshot(): DubPreviewSnapshot };
      }
    ).__parrotE2eDubPreview?.snapshot(),
  );
  expect(snapshot).toBeDefined();
  return snapshot!;
}

async function dubStoreSnapshot(page: Page) {
  return page.evaluate(() =>
    (
      window as typeof window & {
        __parrotE2eDub?: { snapshot(): DubStoreSnapshot };
      }
    ).__parrotE2eDub?.snapshot(),
  );
}

async function microphoneSnapshot(page: Page) {
  return page.evaluate(() => {
    const microphone = (
      window as typeof window & {
        __parrotE2eLessonMicrophone?: MicrophoneSnapshot;
      }
    ).__parrotE2eLessonMicrophone;
    if (!microphone) throw new Error("Microphone controller is missing.");
    return {
      pending: microphone.pending,
      requests: microphone.requests,
      resolved: microphone.resolved,
      stoppedTracks: microphone.stoppedTracks,
    };
  });
}

async function resolveDelayedMicrophone(page: Page) {
  const resolved = await page.evaluate(() => {
    const microphone = (
      window as typeof window & {
        __parrotE2eLessonMicrophone?: MicrophoneSnapshot;
      }
    ).__parrotE2eLessonMicrophone;
    if (!microphone) throw new Error("Microphone controller is missing.");
    return microphone.resolveNext();
  });
  expect(resolved).toBe(true);
}

test("records, saves, reviews, and resumes the nine-line dub at line 2", async ({
  page,
}) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await enterStudio(page, "Start dubbing");

  await page.getByRole("button", { name: "Record line 1" }).click();
  await expect(page.getByText("Recording…", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stop recording line 1" }).click();
  await expect(page.getByRole("button", { name: "Hear my take" })).toBeVisible();
  expect(await dubPreviewSnapshot(page)).toEqual({ pending: 0, requests: 0, resolved: 0 });
  await page.getByRole("button", { name: "Hear my take" }).click();
  await expect.poll(() => dubPreviewSnapshot(page)).toEqual({
    pending: 0,
    requests: 1,
    resolved: 1,
  });
  await expect(page.getByRole("button", { name: "Next line" })).toBeVisible();
  await page.getByRole("button", { name: "Next line" }).click();
  await expect(page.getByText("Line 2 of 9", { exact: true })).toBeVisible();

  await page.reload();
  await enterStudio(page, "Continue dubbing");
  await expect(page.getByText("Line 2 of 9", { exact: true })).toBeVisible();
  await expect(page.getByText("Over the hill and far away.", { exact: true })).toBeVisible();
});

test("keeps the same take available when its first upload fails", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=upload-failed");
  await enterStudio(page, "Start dubbing");

  await page.getByRole("button", { name: "Record line 1" }).click();
  await page.getByRole("button", { name: "Stop recording line 1" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "not saved" })).toBeVisible();
  await page.getByRole("button", { name: "Save again" }).click();
  await expect(page.getByRole("button", { name: "Hear my take" })).toBeVisible();
});

test("replaces selected middle line 5 and keeps the complete dub after reload", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
  await page.reload();
  await enterStudio(page, "Continue dubbing");

  const lineSelect = page.getByRole("combobox", { name: "Choose a saved line" });
  await lineSelect.selectOption("line-5");
  await expect(page.getByText("Line 5 of 9", { exact: true })).toBeVisible();
  await expect(page.getByText("Three little ducks raced through the reeds.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Record selected line" }).click();
  await page.getByRole("button", { name: "Record line 5" }).click();
  await expect(page.getByText("Recording…", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stop recording line 5" }).click();
  await expect(page.getByRole("button", { name: "Hear my take" })).toBeVisible();
  await expect.poll(() => dubStoreSnapshot(page)).toEqual({
    uploads: ["/api/dubs/five-little-ducks-v1/lines/line-5"],
  });
  await page.getByRole("button", { name: "Next line" }).click();
  await expect(page.getByRole("button", { name: "Watch my dub" })).toBeVisible();

  await page.reload();
  await enterStudio(page, "Continue dubbing");
  await page.getByRole("combobox", { name: "Choose a saved line" }).selectOption("line-5");
  await expect(page.getByText("Line 5 of 9", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Watch my dub" }).click();
  await expect(page.getByRole("button", { name: "Stop playback" })).toBeVisible();
  await page.getByRole("button", { name: "Stop playback" }).click();
});

test("returns an undecodable line 5 to a focused replacement action", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=corrupt-line-5");
  await enterStudio(page, "Continue dubbing");

  await page.getByRole("button", { name: "Watch my dub" }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "That take could not play. Record this line again.",
    }),
  ).toBeVisible();
  await expect(page.getByText("Line 5 of 9", { exact: true })).toBeVisible();
  await expect(page.getByText("Three little ducks raced through the reeds.", { exact: true })).toBeVisible();
  const record = page.getByRole("button", { name: "Record line 5" });
  await expect(record).toBeVisible();
  await expect(record).toBeFocused();

  await record.click();
  await page.getByRole("button", { name: "Stop recording line 5" }).click();
  await expect(page.getByRole("button", { name: "Hear my take" })).toBeVisible();
  await page.getByRole("button", { name: "Next line" }).click();
  await page.getByRole("button", { name: "Watch my dub" }).click();
  await expect(page.getByRole("button", { name: "Stop playback" })).toBeVisible();
});

test("hides generic playback setup details and keeps final controls usable", async ({
  page,
}) => {
  await page.goto(
    "/dubs/five-little-ducks?parrotE2eDub=playback-setup-failed",
  );
  await enterStudio(page, "Continue dubbing");

  await page.getByRole("button", { name: "Watch my dub" }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "Your saved dub could not be played. Try again.",
    }),
  ).toBeVisible();
  await expect(page.getByText(/sample-rate mismatch at graph 7/i)).toHaveCount(0);
  const lineSelect = page.getByRole("combobox", { name: "Choose a saved line" });
  await expect(lineSelect).toBeEnabled();
  await lineSelect.selectOption("line-5");
  await expect(page.getByText("Line 5 of 9", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Watch my dub" })).toBeEnabled();
});

test("automatically finishes and saves a six-second recording", async ({ page }) => {
  test.setTimeout(15_000);
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await enterStudio(page, "Start dubbing");

  await page.getByRole("button", { name: "Record line 1" }).click();
  await expect(page.getByText("Recording…", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hear my take" })).toBeVisible({
    timeout: 8_000,
  });
});

test("stops a delayed microphone stream that resolves after leaving the dub", async ({ page }) => {
  await page.goto(
    "/dubs/five-little-ducks?parrotE2eDub=empty&parrotE2eMicrophone=delayed",
  );
  await enterStudio(page, "Start dubbing");
  await page.getByRole("button", { name: "Record line 1" }).click();
  await expect(page.getByRole("button", { name: "Opening microphone…" })).toBeVisible();
  await expect.poll(() => microphoneSnapshot(page)).toMatchObject({
    pending: 1,
    requests: 1,
    stoppedTracks: 0,
  });

  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await resolveDelayedMicrophone(page);
  await expect.poll(() => microphoneSnapshot(page)).toMatchObject({
    pending: 0,
    resolved: 1,
    stoppedTracks: 1,
  });
  await expect(page.getByText("Five Little Ducks", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("alert").filter({ hasText: /microphone|recording/i }),
  ).toHaveCount(0);
});

test("gives every final secondary action a 48px touch target", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
  await enterStudio(page, "Continue dubbing");

  for (const name of ["Record selected line", "Delete my dub"]) {
    const box = await visibleBox(page.getByRole("button", { name }));
    expect(box.height).toBeGreaterThanOrEqual(48);
  }
});

test("deletes a complete private dub", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
  await enterStudio(page, "Continue dubbing");

  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toBe(
      "Grown-up: delete every saved voice clip in this dub?",
    );
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Delete my dub" }).click();
  await expect(page.getByRole("button", { name: "Start dubbing" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /I’m the grown-up/ })).not.toBeChecked();
});

test("finishes an interrupted reset while preserving ordinary load retry", async ({
  page,
}) => {
  await page.goto(
    "/dubs/five-little-ducks?parrotE2eDub=reset-interrupted",
  );

  await expect(
    page.getByRole("alert").filter({
      hasText:
        "Deleting your saved dub was interrupted. Ask a grown-up to finish deleting it.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try loading again" })).toBeVisible();
  await page.getByRole("button", { name: "Try loading again" }).click();
  await expect(
    page.getByRole("button", { name: "Finish deleting my dub" }),
  ).toBeVisible();

  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toBe(
      "Grown-up: delete every saved voice clip in this dub?",
    );
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Finish deleting my dub" }).click();
  await expect(page.getByRole("button", { name: "Deleting your dub…" })).toBeVisible();
  await expect(page.getByRole("main").locator('[role="status"]')).toHaveText(
    "Deleting your saved dub.",
  );
  await expect(page.getByRole("button", { name: "Start dubbing" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /I’m the grown-up/ })).not.toBeChecked();
});

for (const microphone of ["denied", "unsupported"] as const) {
  test(`keeps line 1 and record focus after a ${microphone} microphone`, async ({ page }) => {
    await page.goto(
      `/dubs/five-little-ducks?parrotE2eDub=empty&parrotE2eMicrophone=${microphone}`,
    );
    await enterStudio(page, "Start dubbing");

    const record = page.getByRole("button", { name: "Record line 1" });
    await record.click();
    const message =
      microphone === "denied"
        ? "The microphone is off. Ask a grown-up to allow it, then try again."
        : "This browser cannot record yet. Try another device or browser.";
    await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
    await expect(page.getByText("Line 1 of 9", { exact: true })).toBeVisible();
    await expect(record).toBeVisible();
    await expect(record).toBeFocused();
  });
}

test("keeps the desktop intro action inside the initial viewport", async ({ page }) => {
  await page.setViewportSize({ height: 800, width: 1280 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");

  const consent = page.getByRole("checkbox", { name: /I’m the grown-up/ });
  const start = page.getByRole("button", { name: "Start dubbing" });
  await expect(consent).toBeVisible();
  await expect(start).toBeVisible();
  await expect(consent).toBeInViewport();
  await expect(start).toBeInViewport();
});

for (const viewport of studioViewports) {
  test(`contains the studio without header, stage, or action overlap at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
    await enterStudio(page, "Continue dubbing");

    const main = page.getByRole("main");
    const back = page.getByRole("link", { name: "Back to home" });
    const account = page.getByRole("button", { name: "Account for Mia" });
    const stage = page.getByRole("figure", { name: "Four ducks make bright ripples." });
    const action = page.getByRole("button", { name: "Record line 4" });

    await main.evaluate((element) => {
      element.scrollTop = 0;
    });
    const topBoxes = await Promise.all([back, account, stage].map(visibleBox));
    for (const box of topBoxes) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }
    for (let first = 0; first < topBoxes.length; first += 1) {
      for (let second = first + 1; second < topBoxes.length; second += 1) {
        expect(boxesOverlap(topBoxes[first], topBoxes[second])).toBe(false);
      }
    }

    await action.scrollIntoViewIfNeeded();
    const actionBox = await visibleBox(action);
    const headerBoxes = await Promise.all([back, account].map(visibleBox));
    expect(actionBox.x).toBeGreaterThanOrEqual(0);
    expect(actionBox.x + actionBox.width).toBeLessThanOrEqual(viewport.width);
    expect(actionBox.y).toBeGreaterThanOrEqual(0);
    expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(viewport.height);
    for (const headerBox of headerBoxes) {
      expect(boxesOverlap(headerBox, actionBox)).toBe(false);
    }
    const contentBoxes = await Promise.all([stage, action].map(async (region) => {
      const box = await visibleBox(region);
      const scrollTop = await main.evaluate((element) => element.scrollTop);
      return { ...box, y: box.y + scrollTop };
    }));
    expect(boxesOverlap(contentBoxes[0], contentBoxes[1])).toBe(false);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  });
}

test("reduced motion disables every playing duck animation without exposing the SVG", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
  await enterStudio(page, "Continue dubbing");
  await page.getByRole("button", { name: "Watch my dub" }).click();
  await expect(page.getByRole("button", { name: "Stop playback" })).toBeVisible();

  const sceneSvg = page.getByRole("figure").locator("svg");
  await expect(sceneSvg).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("img")).toHaveCount(0);
  const duckAnimationNames = await sceneSvg.locator("g").evaluateAll((groups) =>
    groups
      .filter((group) => (group as SVGElement).style.animationDelay !== "")
      .map((group) => getComputedStyle(group).animationName),
  );
  expect(duckAnimationNames.length).toBeGreaterThan(0);
  expect(duckAnimationNames.every((name) => name === "none")).toBe(true);
});
