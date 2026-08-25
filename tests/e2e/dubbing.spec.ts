import { expect, test, type Locator, type Page } from "@playwright/test";

type Rect = { height: number; width: number; x: number; y: number };
type DubStoreSnapshot = {
  audioFetches: string[];
  audioContextDoubleCloses: number;
  playedAudioSources: string[];
  uploads: string[];
};
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

test("guides, records, replays, and resumes verse 1 at line 2", async ({
  page,
}) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await enterStudio(page, "Start dubbing");

  await expect(page.getByRole("button", { name: "Record line 1" })).toBeVisible();
  await expect(page.getByText("Now read", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Replay example" })).toBeVisible();
  await expect.poll(async () => (await dubStoreSnapshot(page))?.playedAudioSources).toContain(
    "/assets/audio/five-little-ducks-v2-guide-line-1.mp3",
  );
  await expect(page.getByLabel("Grown-up options")).toHaveCount(0);
  await page.getByRole("button", { name: "Record line 1" }).click();
  await expect(page.getByText("Recording…", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stop recording line 1" }).click();
  await expect(page.getByRole("button", { name: "Next line" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record again" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Your recording waveform" })).toBeVisible();
  await page.getByRole("button", { name: "Hear my voice" }).click();
  await expect.poll(async () =>
    (await dubStoreSnapshot(page))?.playedAudioSources.some((source) => source.startsWith("blob:")),
  ).toBe(true);
  await page.getByRole("button", { name: "Next line" }).click();
  await expect(page.getByText("Verse 1 of 6 · Line 2 of 4", { exact: true })).toBeVisible();
  await expect.poll(async () =>
    (await dubStoreSnapshot(page))?.audioContextDoubleCloses,
  ).toBe(0);

  await page.reload();
  await enterStudio(page, "Continue dubbing");
  await expect(page.getByText("Verse 1 of 6 · Line 2 of 4", { exact: true })).toBeVisible();
  await expect(page.getByText("Over the hill and far away.", { exact: true })).toBeVisible();
});

test("keeps fixed actions and previews a completed four-line verse before continuing", async ({
  page,
}) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await enterStudio(page, "Continue dubbing");

  await expect(page.getByText("Verse 1 of 6 · Line 4 of 4", { exact: true })).toBeVisible();
  const record = page.getByRole("button", { name: "Record line 4" });
  const next = page.getByRole("button", { name: "Next line" });
  const recordBefore = await visibleBox(record);
  const nextBefore = await visibleBox(next);
  await expect(next).toBeDisabled();

  await record.click();
  await expect(page.getByRole("button", { name: "Stop recording line 4" })).toBeVisible();
  await expect(next).toBeDisabled();
  await page.getByRole("button", { name: "Stop recording line 4" }).click();

  const recordAgain = page.getByRole("button", { name: "Record again line 4" });
  await expect(recordAgain).toBeVisible();
  await expect(next).toBeEnabled();
  await page.mouse.move(0, 0);
  await expect.poll(() => recordAgain.boundingBox()).toEqual(recordBefore);
  await expect.poll(() => next.boundingBox()).toEqual(nextBefore);
  await expect(page.getByRole("img", { name: "Your recording waveform" })).toBeVisible();

  await next.click();
  await expect(page.getByText("Playing verse 1…", { exact: true })).toBeVisible();
  await expect.poll(() => dubStoreSnapshot(page)).toMatchObject({
    audioFetches: [
      "/api/dubs/five-little-ducks-v2/lines/line-1/audio",
      "/api/dubs/five-little-ducks-v2/lines/line-2/audio",
      "/api/dubs/five-little-ducks-v2/lines/line-3/audio",
      "/api/dubs/five-little-ducks-v2/lines/line-4/audio",
    ],
  });

  await expect(page.getByText("Verse 2 of 6 · Line 1 of 4", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record line 5" })).toBeEnabled();
  await expect(next).toBeDisabled();
});

test("keeps a failed verse preview retryable and lets Next skip the retry", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=verse-fetch-failed");
  await enterStudio(page, "Continue dubbing");

  await page.getByRole("button", { name: "Record line 4" }).click();
  await page.getByRole("button", { name: "Stop recording line 4" }).click();
  const next = page.getByRole("button", { name: "Next line" });
  await next.click();

  await expect(
    page.getByRole("alert").filter({ hasText: "could not play" }),
  ).toBeVisible();
  await expect(page.getByText("Verse 1 of 6 · Line 4 of 4", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Your recording waveform" })).toBeVisible();
  await expect(next).toBeEnabled();

  await next.click();
  await expect(page.getByText("Playing verse 1…", { exact: true })).toBeVisible();
  await next.click();
  await expect(page.getByText("Verse 2 of 6 · Line 1 of 4", { exact: true })).toBeVisible();
});

test("previews the final verse once and treats its default line as a replacement", async ({
  page,
}) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=almost-complete");
  await enterStudio(page, "Continue dubbing");

  await expect(page.getByText("Verse 6 of 6 · Line 4 of 4", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Record line 24" }).click();
  await page.getByRole("button", { name: "Stop recording line 24" }).click();
  await page.getByRole("button", { name: "Next line" }).click();
  await expect(page.getByText("Playing verse 6…", { exact: true })).toBeVisible();
  const watch = page.getByRole("button", { name: "Watch my dub" });
  await expect(watch).toBeVisible();
  await expect(watch).toBeFocused();

  await page.getByLabel("Grown-up options").click();
  await expect(page.getByRole("combobox", { name: "Choose a saved line" })).toHaveValue("line-24");
  await page.getByRole("button", { name: "Record selected line" }).click();
  await page.getByRole("button", { name: "Record line 24" }).click();
  await page.getByRole("button", { name: "Stop recording line 24" }).click();
  await page.getByRole("button", { name: "Next line" }).click();
  await expect(page.getByRole("button", { name: "Watch my dub" })).toBeVisible();
  await expect.poll(async () => (await dubStoreSnapshot(page))?.audioFetches).toEqual([
    "/api/dubs/five-little-ducks-v2/lines/line-21/audio",
    "/api/dubs/five-little-ducks-v2/lines/line-22/audio",
    "/api/dubs/five-little-ducks-v2/lines/line-23/audio",
    "/api/dubs/five-little-ducks-v2/lines/line-24/audio",
  ]);
});

test("keeps the same take available when its first upload fails", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=upload-failed");
  await enterStudio(page, "Start dubbing");

  await page.getByRole("button", { name: "Record line 1" }).click();
  await page.getByRole("button", { name: "Stop recording line 1" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "not saved" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record again line 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next line" })).toBeDisabled();
  await page.getByRole("button", { name: "Save again" }).click();
  await expect(page.getByRole("button", { name: "Next line" })).toBeVisible();
});

test("asks for one new take when the upload rejects the recording", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=upload-rejected");
  await enterStudio(page, "Start dubbing");

  await page.getByRole("button", { name: "Record line 1" }).click();
  await page.getByRole("button", { name: "Stop recording line 1" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "too long" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save again" })).toHaveCount(0);
  await page.getByRole("button", { name: "Record again" }).click();
  await page.getByRole("button", { name: "Record line 1" }).click();
  await page.getByRole("button", { name: "Stop recording line 1" }).click();
  await expect(page.getByRole("button", { name: "Next line" })).toBeVisible();
  await expect.poll(() => dubStoreSnapshot(page)).toMatchObject({
    uploads: [
      "/api/dubs/five-little-ducks-v2/lines/line-1",
      "/api/dubs/five-little-ducks-v2/lines/line-1",
    ],
  });
});

test("replaces selected middle line 5 and keeps the complete dub after reload", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
  await page.reload();
  await enterStudio(page, "Continue dubbing");

  await expect(page.getByText("All 6 verses recorded", { exact: true })).toBeVisible();
  await expect(page.getByText("Your dub is ready!", { exact: true })).toBeVisible();
  await expect(page.getByText("Verse 1 of 6 · Line 1 of 4", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Watch my dub" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Choose a saved line" })).toBeHidden();
  await page.getByLabel("Grown-up options").click();
  const lineSelect = page.getByRole("combobox", { name: "Choose a saved line" });
  await lineSelect.selectOption("line-5");
  await expect(lineSelect).toHaveValue("line-5");
  await expect(page.getByText("Your dub is ready!", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Record selected line" }).click();
  await expect(page.getByRole("button", { name: "Next line" })).toBeEnabled();
  await page.getByRole("button", { name: "Next line" }).click();
  await expect(page.getByRole("button", { name: "Watch my dub" })).toBeVisible();
  await page.getByLabel("Grown-up options").click();
  await page.getByRole("button", { name: "Record selected line" }).click();
  await page.getByRole("button", { name: "Record line 5" }).click();
  await expect(page.getByText("Recording…", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stop recording line 5" }).click();
  await expect(page.getByRole("button", { name: "Next line" })).toBeVisible();
  await expect.poll(() => dubStoreSnapshot(page)).toMatchObject({
    uploads: ["/api/dubs/five-little-ducks-v2/lines/line-5"],
  });
  await page.getByRole("button", { name: "Next line" }).click();
  await expect(page.getByRole("button", { name: "Watch my dub" })).toBeVisible();

  await page.reload();
  await enterStudio(page, "Continue dubbing");
  await page.getByLabel("Grown-up options").click();
  const reloadedLineSelect = page.getByRole("combobox", { name: "Choose a saved line" });
  await reloadedLineSelect.selectOption("line-5");
  await expect(reloadedLineSelect).toHaveValue("line-5");
  await expect(page.getByText("Your dub is ready!", { exact: true })).toBeVisible();
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
  await expect(page.getByText("Verse 2 of 6 · Line 1 of 4", { exact: true })).toBeVisible();
  await expect(page.getByText("Four little ducks went out one day.", { exact: true })).toBeVisible();
  await expect.poll(async () => (await dubStoreSnapshot(page))?.playedAudioSources).toContain(
    "/assets/audio/five-little-ducks-v2-guide-line-5.mp3",
  );
  const record = page.getByRole("button", { name: "Record line 5" });
  await expect(record).toBeVisible();
  await expect(record).toBeFocused();

  await record.click();
  await page.getByRole("button", { name: "Stop recording line 5" }).click();
  await expect(page.getByRole("button", { name: "Next line" })).toBeVisible();
  await page.getByRole("button", { name: "Next line" }).click();
  await page.getByRole("button", { name: "Watch my dub" }).click();
  await expect(page.getByRole("button", { name: "Stop playback" })).toBeVisible();
});

test("keeps a complete dub ready when a saved-line audio fetch fails", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=audio-fetch-failed");
  await enterStudio(page, "Continue dubbing");

  await page.getByRole("button", { name: "Watch my dub" }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "Your saved dub could not be played. Try again.",
    }),
  ).toBeVisible();
  await expect(page.getByText("All 6 verses recorded", { exact: true })).toBeVisible();
  await expect(page.getByText("Your dub is ready!", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Record line/ })).toHaveCount(0);

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
  await page.getByLabel("Grown-up options").click();
  const lineSelect = page.getByRole("combobox", { name: "Choose a saved line" });
  await expect(lineSelect).toBeEnabled();
  await lineSelect.selectOption("line-5");
  await expect(lineSelect).toHaveValue("line-5");
  await expect(page.getByText("Your dub is ready!", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Watch my dub" })).toBeEnabled();
});

test("automatically finishes and saves a six-second recording", async ({ page }) => {
  test.setTimeout(15_000);
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await enterStudio(page, "Start dubbing");

  await page.getByRole("button", { name: "Record line 1" }).click();
  await expect(page.getByText("Recording…", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next line" })).toBeVisible({
    timeout: 8_000,
  });
});

test("stops a delayed microphone stream that resolves after leaving the dub", async ({ page }) => {
  await page.goto(
    "/dubs/five-little-ducks?parrotE2eDub=empty&parrotE2eMicrophone=delayed",
  );
  await enterStudio(page, "Start dubbing");
  await page.getByRole("button", { name: "Record line 1" }).click();
  await expect(page.getByText("Opening microphone…", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record line 1" })).toBeDisabled();
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

test("keeps grown-up options closed and gives its controls 48px touch targets", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
  await enterStudio(page, "Continue dubbing");

  const grownUpOptions = page.getByLabel("Grown-up options");
  await expect(grownUpOptions).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Choose a saved line" })).toBeHidden();
  expect((await visibleBox(grownUpOptions)).height).toBeGreaterThanOrEqual(48);
  await grownUpOptions.focus();
  await expect(grownUpOptions).toBeFocused();
  await grownUpOptions.press("Enter");
  await expect(page.getByRole("combobox", { name: "Choose a saved line" })).toBeVisible();
  await grownUpOptions.press("Space");
  await expect(page.getByRole("combobox", { name: "Choose a saved line" })).toBeHidden();
  await grownUpOptions.press("Enter");
  for (const name of ["Record selected line", "Delete my dub"]) {
    const box = await visibleBox(page.getByRole("button", { name }));
    expect(box.height).toBeGreaterThanOrEqual(48);
  }
});

test("deletes a complete private dub", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
  await enterStudio(page, "Continue dubbing");

  await page.getByLabel("Grown-up options").click();
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

test("lets a grown-up delete saved recordings before completing v2", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");

  await page.getByLabel("Grown-up options").click();
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Delete saved recordings" }).click();

  await expect(page.getByRole("button", { name: "Start dubbing" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue dubbing" })).toHaveCount(0);
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
  await expect(
    page.getByRole("button", { name: "Finish deleting my dub" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try loading again" })).toHaveCount(0);

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

test("clears a failed recovery DELETE before retrying a successful status load", async ({
  page,
}) => {
  await page.goto(
    "/dubs/five-little-ducks?parrotE2eDub=reset-delete-failed",
  );
  await expect(
    page.getByRole("button", { name: "Finish deleting my dub" }),
  ).toBeVisible();

  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Finish deleting my dub" }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "Your saved dub was not deleted.",
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Try loading again" }).click();
  await expect(
    page.getByRole("button", { name: "Loading your private dub…" }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Finish deleting my dub" }),
  ).toHaveCount(0);
  await expect(page.getByRole("main").locator('[role="status"]')).toHaveText(
    "Loading your private dub.",
  );

  await expect(page.getByRole("button", { name: "Start dubbing" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: /I’m the grown-up/ })).not.toBeChecked();
  await expect(page.getByRole("main").locator('[role="status"]')).toHaveText(
    "Grown-up confirmation is needed before dubbing.",
  );
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
    await expect(page.getByText("Verse 1 of 6 · Line 1 of 4", { exact: true })).toBeVisible();
    await expect(record).toBeVisible();
    await expect(record).toBeFocused();
  });
}

for (const viewport of [{ height: 568, width: 280 }, { height: 800, width: 1280 }]) {
  test(`keeps the intro action inside the initial viewport at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");

    const consent = page.getByRole("checkbox", { name: /I’m the grown-up/ });
    const start = page.getByRole("button", { name: "Start dubbing" });
    await expect(consent).toBeVisible();
    await expect(start).toBeVisible();
    await expect(consent).toBeInViewport();
    await expect(start).toBeInViewport();
  });
}

for (const viewport of studioViewports) {
  test(`contains the studio without header, stage, or action overlap at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
    await enterStudio(page, "Continue dubbing");

    const main = page.getByRole("main");
    const back = page.getByRole("link", { name: "Back to home" });
    const account = page.getByRole("button", {
      name: "Profile for Mia, learner mode",
    });
    const stage = page.getByRole("figure");
    await expect(stage).toHaveAccessibleName(/ducklings come back/i);
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

test("lets a narrow-phone learner scroll to the active recording action", async ({
  page,
}) => {
  await page.setViewportSize({ height: 568, width: 280 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await enterStudio(page, "Continue dubbing");

  const main = page.getByRole("main");
  const record = page.getByRole("button", { name: "Record line 4" });
  await main.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(record).not.toBeInViewport();

  await page.mouse.move(140, 450);
  await page.mouse.wheel(0, 1_000);

  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(record).toBeInViewport();
});

for (const viewport of [
  { height: 360, width: 640 },
  { height: 360, width: 800 },
  { height: 360, width: 840 },
]) {
  test(`keeps the untouched short-landscape prompt and action visible after Continue at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
    await enterStudio(page, "Continue dubbing");

    const back = page.getByRole("link", { name: "Back to home" });
    const account = page.getByRole("button", {
      name: "Profile for Mia, learner mode",
    });
    const content = [
      page.getByRole("figure"),
      page.getByRole("region", { name: "Current line" }),
      page.getByRole("button", { name: "Record line 4" }),
    ];
    const headerBottom = Math.max(
      ...(await Promise.all([back, account].map(visibleBox))).map(({ y, height }) => y + height),
    );

    for (const locator of content) {
      const box = await visibleBox(locator);
      expect(box.y).toBeGreaterThanOrEqual(headerBottom);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    }
  });
}

test("uses the desktop viewport and makes the current lyric more prominent than the title", async ({
  page,
}) => {
  const viewport = { height: 900, width: 1440 };
  await page.setViewportSize(viewport);
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await enterStudio(page, "Start dubbing");

  const studio = page.getByRole("region", { name: "Five Little Ducks" });
  const stage = page.getByRole("figure");
  const title = page.getByRole("heading", { name: "Five Little Ducks" });
  const lyric = page.getByText("Five little ducks went out one day.", {
    exact: true,
  });
  const studioBox = await visibleBox(studio);
  const stageBox = await visibleBox(stage);
  expect(studioBox.width).toBeGreaterThanOrEqual(viewport.width * 0.9);
  expect(stageBox.width).toBeGreaterThanOrEqual(viewport.width * 0.58);
  expect(stageBox.height).toBeGreaterThanOrEqual(viewport.height * 0.65);

  const [titleSize, lyricSize] = await Promise.all(
    [title, lyric].map((locator) =>
      locator.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    ),
  );
  expect(lyricSize).toBeGreaterThan(titleSize);
});

test("contains the recorded waveform and review actions on the narrowest phone", async ({
  page,
}) => {
  const viewport = { height: 568, width: 280 };
  await page.setViewportSize(viewport);
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await enterStudio(page, "Start dubbing");
  await page.getByRole("button", { name: "Record line 1" }).click();
  await page.getByRole("button", { name: "Stop recording line 1" }).click();

  const reviewControls = [
    page.getByRole("img", { name: "Your recording waveform" }),
    page.getByRole("button", { name: "Hear my voice" }),
    page.getByRole("button", { name: "Next line" }),
    page.getByRole("button", { name: "Record again" }),
  ];
  for (const control of reviewControls) {
    await control.scrollIntoViewIfNeeded();
    const box = await visibleBox(control);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  }
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});

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
