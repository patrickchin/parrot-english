import { expect, test, type Page } from "@playwright/test";

type DubStoreSnapshot = {
  audioContextDoubleCloses: number;
  guideFetches: string[];
  playedAudioSources: string[];
  privateFetches: string[];
  uploads: string[];
};

type DubStoreController = {
  releaseDelete(): boolean;
  releaseUpload(): boolean;
  snapshot(): DubStoreSnapshot;
};

type MicrophoneSnapshot = {
  pending: number;
  requests: number;
  resolved: number;
  resolveNext(): boolean;
  stoppedTracks: number;
};

async function confirmDub(page: Page, action: "Continue dubbing" | "Start dubbing") {
  await page.getByRole("checkbox", { name: /I’m the grown-up/ }).check();
  await page.getByRole("button", { name: action }).click();
}

async function openScene(page: Page, sceneNumber: number) {
  await page.getByRole("button", { name: new RegExp(`^Scene ${sceneNumber},`) }).click();
  await expect(page.getByText(`Scene ${sceneNumber} of 6`, { exact: true })).toBeVisible();
}

async function stopAndSave(page: Page) {
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("main").getByText("Recording…", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByRole("img", { name: "Your recording waveform" })).toBeVisible();
}

async function dubStoreSnapshot(page: Page): Promise<DubStoreSnapshot> {
  return page.evaluate(() => {
    const store = (
      window as typeof window & {
        __parrotE2eDub?: { snapshot(): DubStoreSnapshot };
      }
    ).__parrotE2eDub;
    if (!store) throw new Error("Dub store is missing.");
    return store.snapshot();
  });
}

async function releaseDubOperation(page: Page, operation: "delete" | "upload") {
  const released = await page.evaluate((requestedOperation) => {
    const store = (
      window as typeof window & { __parrotE2eDub?: DubStoreController }
    ).__parrotE2eDub;
    if (!store) throw new Error("Dub store is missing.");
    return requestedOperation === "delete"
      ? store.releaseDelete()
      : store.releaseUpload();
  }, operation);
  expect(released).toBe(true);
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

test("confirmation opens the project home instead of line 1", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await confirmDub(page, "Start dubbing");

  await expect(page.getByRole("region", { name: "Full video player" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play full video" })).toBeVisible();
  await expect(page.getByText("0 of 24 voice clips recorded", { exact: true })).toBeVisible();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("0 of 24 voice clips recorded.");
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Record line" })).toHaveCount(0);
  await expect(page.getByText("Five little ducks went out one day.", { exact: true })).toHaveCount(0);
});

test("an empty project plays a fully generated draft", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await confirmDub(page, "Start dubbing");
  await page.getByRole("button", { name: "Play full video" }).click();
  await expect(page.getByRole("button", { name: "Stop full video" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText(/Playing full video: Scene \d, line \d\./);
  await expect.poll(async () => (await dubStoreSnapshot(page)).guideFetches).toHaveLength(24);
  await expect.poll(async () => (await dubStoreSnapshot(page)).privateFetches).toEqual([]);
  expect((await dubStoreSnapshot(page)).guideFetches.every((url) =>
    url.startsWith("/assets/audio/five-little-ducks-v2-guide-line-"),
  )).toBe(true);
  await page.getByRole("button", { name: "Stop full video" }).click();
  await expect(page.getByRole("button", { name: "Play full video" })).toBeVisible();
});

test("a partial project mixes saved and generated audio for full and scene playback", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await confirmDub(page, "Continue dubbing");
  await page.getByRole("button", { name: "Play full video" }).click();
  await expect(page.getByRole("button", { name: "Stop full video" })).toBeVisible();
  await expect.poll(async () => (await dubStoreSnapshot(page)).privateFetches).toEqual([
    "/api/dubs/five-little-ducks-v2/lines/line-1/audio",
    "/api/dubs/five-little-ducks-v2/lines/line-2/audio",
    "/api/dubs/five-little-ducks-v2/lines/line-3/audio",
  ]);
  await expect.poll(async () => (await dubStoreSnapshot(page)).guideFetches).toHaveLength(21);

  await openScene(page, 2);
  await page.getByRole("button", { name: "Play this scene" }).click();
  await expect(page.getByRole("button", { name: "Stop this scene" })).toBeVisible();
  await expect.poll(async () => (await dubStoreSnapshot(page)).privateFetches).toHaveLength(3);
  await expect.poll(async () => (await dubStoreSnapshot(page)).guideFetches).toHaveLength(25);
});

test("Continue opens the first missing slot while scenes and lines remain freely selectable", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await confirmDub(page, "Continue dubbing");
  await page.getByRole("button", { name: "Continue Scene 1" }).click();
  await expect(page.getByText("Scene 1 of 6", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Line 4, selected, generated" })).toBeVisible();

  await page.getByRole("button", { name: "Back to full video" }).click();
  await openScene(page, 5);
  await page.getByRole("button", { name: "Line 4, generated" }).click();
  await expect(page.getByRole("button", { name: "Line 4, selected, generated" })).toBeVisible();
  await expect(page.getByText("But none of the five little ducks came back.", { exact: true })).toBeVisible();
});

test("recording starts without a countdown and saves without leaving the selected line", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 3);
  await page.getByRole("button", { name: "Line 3, generated" }).click();
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("main").getByText("Recording…", { exact: true })).toBeVisible();
  await expect(page.getByText(/get ready|3…|2…|1…/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Stop recording" }).click();

  await expect(page.getByRole("button", { name: "Line 3, selected, recorded" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Your recording waveform" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hear my voice" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record again" })).toBeFocused();
  await expect(page.getByText("Mother duck said, “Quack, quack, quack, quack.”", { exact: true })).toBeVisible();
  await expect.poll(async () => (await dubStoreSnapshot(page)).uploads).toEqual([
    "/api/dubs/five-little-ducks-v2/lines/line-11",
  ]);
  await expect.poll(async () => (await dubStoreSnapshot(page)).playedAudioSources).toEqual([]);
});

test("Back keeps progress and reload resumes the saved scene statuses", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);
  await stopAndSave(page);
  await page.getByRole("button", { name: "Back to full video" }).click();
  await expect(page.getByRole("button", { name: "Scene 1, in progress" })).toBeVisible();
  await expect(page.getByText("1 of 24 voice clips recorded", { exact: true })).toBeVisible();

  await page.reload();
  await confirmDub(page, "Continue dubbing");
  await expect(page.getByRole("button", { name: "Scene 1, in progress" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue Scene 1" })).toBeVisible();
});

test("a replacement overwrites the chosen canonical slot", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
  await confirmDub(page, "Continue dubbing");
  await openScene(page, 2);
  await expect(page.getByRole("button", { name: "Line 1, selected, recorded" })).toBeVisible();
  await stopAndSave(page);
  await expect(page.getByRole("button", { name: "Line 1, selected, recorded" })).toBeVisible();
  await expect.poll(async () => (await dubStoreSnapshot(page)).uploads).toEqual([
    "/api/dubs/five-little-ducks-v2/lines/line-5",
  ]);
});

test("scene playback advances only the visual before recording the selected canonical slot", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 2);
  await page.getByRole("button", { name: "Line 1, selected, generated" }).click();
  await page.getByRole("button", { name: "Play this scene" }).click();
  await expect(page.getByRole("button", { name: "Stop this scene" })).toBeVisible();
  await expect(page.getByRole("figure")).toHaveAccessibleName(
    "The flock swims toward a green hill.",
  );

  await expect(page.getByRole("button", { name: "Line 1, selected, generated" })).toBeVisible();
  await expect(page.getByText("Four little ducks went out one day.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("Recording…");
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByRole("button", { name: "Line 1, selected, recorded" })).toBeVisible();
  await expect.poll(async () => (await dubStoreSnapshot(page)).uploads).toEqual([
    "/api/dubs/five-little-ducks-v2/lines/line-5",
  ]);
});

test("retryable save survives guide and Blob replay while retry remains exclusive", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=upload-retry-held&parrotE2eDubPlayback=held");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);
  await page.getByRole("button", { name: "Record line" }).click();
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "not saved" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Your recording waveform" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save again" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record again" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Line 2, generated" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Line 1, selected, generated" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to full video" })).toBeDisabled();
  await expect(page.getByText("Scene 1 of 6", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Hear example" }).click();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText(
    "Playing example for Scene 1, line 1.",
  );
  await expect(page.getByRole("button", { name: "Save again" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "not saved" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Line 2, generated" })).toBeDisabled();
  await expect.poll(async () => (await dubStoreSnapshot(page)).playedAudioSources).toContain(
    "/assets/audio/five-little-ducks-v2-guide-line-1.mp3",
  );

  await page.getByRole("button", { name: "Hear my voice" }).click();
  await expect(page.getByRole("button", { name: "Stop my voice" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText(
    "Playing your recording for Scene 1, line 1.",
  );
  await expect(page.getByRole("button", { name: "Save again" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "not saved" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to full video" })).toBeDisabled();
  await expect.poll(async () =>
    (await dubStoreSnapshot(page)).playedAudioSources.some((source) => source.startsWith("blob:")),
  ).toBe(true);

  await page.getByRole("button", { name: "Save again" }).click();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("Saving your take…");
  await expect(page.getByRole("button", { name: "Hear example" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Hear my voice" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save again" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Line 2, generated" })).toBeDisabled();
  await releaseDubOperation(page, "upload");
  await expect(page.getByRole("button", { name: "Line 1, selected, recorded" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save again" })).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Your recording waveform" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hear my voice" })).toBeEnabled();
});

test("a rejected upload discards the take and offers Record again", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=upload-rejected");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);
  await page.getByRole("button", { name: "Record line" }).click();
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "too long" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save again" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Record again" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Your recording waveform" })).toHaveCount(0);
});

test("corrupt private audio falls back to its guide and marks the scene Needs retake", async ({ page }) => {
  test.setTimeout(15_000);
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=corrupt-line-5");
  await confirmDub(page, "Continue dubbing");
  await page.getByRole("button", { name: "Play full video" }).click();
  await expect(page.getByRole("button", { name: "Stop full video" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Scene 2, needs retake" })).toBeVisible();
  await expect.poll(async () => (await dubStoreSnapshot(page)).guideFetches).toContain(
    "/assets/audio/five-little-ducks-v2-guide-line-5.mp3",
  );
  await expect(page.getByRole("button", { name: "Play full video" })).toBeVisible({ timeout: 8_000 });
  await openScene(page, 2);
  await stopAndSave(page);
  await page.getByRole("button", { name: "Back to full video" }).click();
  await expect(page.getByRole("button", { name: "Scene 2, recorded" })).toBeVisible();
});

test("a double-source failure names the exact slot while video and music continue", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=both-source-failed");
  await confirmDub(page, "Continue dubbing");
  await page.getByRole("button", { name: "Play full video" }).click();
  await expect(page.getByRole("alert").filter({
    hasText: "Scene 2, line 1 could not play. The video will continue without it.",
  })).toBeVisible();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText(
    /Playing full video: Scene \d, line \d\./,
  );
  await expect(page.getByRole("button", { name: "Stop full video" })).toBeVisible();
  await expect(page.getByRole("figure")).toHaveAccessibleName(/duck/i);
});

test("scene and line navigation cancel scoped playback", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await confirmDub(page, "Start dubbing");
  await page.getByRole("button", { name: "Play full video" }).click();
  await expect(page.getByRole("button", { name: "Stop full video" })).toBeVisible();
  await openScene(page, 1);
  await page.getByRole("button", { name: "Play this scene" }).click();
  await expect(page.getByRole("button", { name: "Stop this scene" })).toBeVisible();
  await page.getByRole("button", { name: "Line 2, generated" }).click();
  await expect(page.getByRole("button", { name: "Play this scene" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Line 2, selected, generated" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("Scene 1, line 2 selected. Generated.");
  await expect.poll(async () => (await dubStoreSnapshot(page)).audioContextDoubleCloses).toBe(0);
});

test("recording silences guide and scene playback", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);
  await page.getByRole("button", { name: "Hear example" }).click();
  await page.getByRole("button", { name: "Play this scene" }).click();
  await expect(page.getByRole("button", { name: "Stop this scene" })).toBeVisible();
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("main").getByText("Recording…", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play this scene" })).toBeVisible();
  await expect.poll(async () => (await dubStoreSnapshot(page)).audioContextDoubleCloses).toBe(0);
});

test("automatically stops and saves one six-second recording", async ({ page }) => {
  test.setTimeout(15_000);
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("main").getByText("Recording…", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Your recording waveform" })).toBeVisible({ timeout: 8_000 });
  await expect.poll(async () => (await dubStoreSnapshot(page)).uploads).toHaveLength(1);
});

test("held microphone readiness keeps every scene action locked behind one live status", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty&parrotE2eMicrophone=delayed");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);
  await page.getByRole("button", { name: "Record line" }).click();

  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("Opening microphone…");
  await expect(page.getByRole("button", { name: "Back to full video" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Play this scene" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Hear example" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Record line" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Line 2, generated" })).toBeDisabled();

  await resolveDelayedMicrophone(page);
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("Recording…");
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByRole("img", { name: "Your recording waveform" })).toBeVisible();
});

test("stops a delayed microphone stream that resolves after route exit", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty&parrotE2eMicrophone=delayed");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("main").getByText("Opening microphone…", { exact: true })).toBeVisible();
  await expect.poll(() => microphoneSnapshot(page)).toMatchObject({ pending: 1, requests: 1 });
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await resolveDelayedMicrophone(page);
  await expect.poll(() => microphoneSnapshot(page)).toMatchObject({
    pending: 0,
    resolved: 1,
    stoppedTracks: 1,
  });
});

for (const microphone of ["denied", "unsupported"] as const) {
  test(`keeps the selected slot after a ${microphone} microphone`, async ({ page }) => {
    await page.goto(`/dubs/five-little-ducks?parrotE2eDub=empty&parrotE2eMicrophone=${microphone}`);
    await confirmDub(page, "Start dubbing");
    await openScene(page, 4);
    await page.getByRole("button", { name: "Line 2, generated" }).click();
    await page.getByRole("button", { name: "Record line" }).click();
    const message = microphone === "denied"
      ? "The microphone is off. Ask a grown-up to allow it, then try again."
      : "This browser cannot record yet. Try another device or browser.";
    await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
    await expect(page.getByRole("button", { name: "Line 2, selected, generated" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Record line" })).toBeFocused();
  });
}

test("deletes a complete dub and recovers an interrupted reset", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
  await confirmDub(page, "Continue dubbing");
  await page.getByLabel("Grown-up options").click();
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toBe("Grown-up: delete every saved voice clip in this dub?");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Delete my dub" }).click();
  await expect(page.getByRole("button", { name: "Start dubbing" })).toBeVisible();

  await page.goto("/dubs/five-little-ducks?parrotE2eDub=reset-interrupted");
  await expect(page.getByRole("button", { name: "Finish deleting my dub" })).toBeVisible();
  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Finish deleting my dub" }).click();
  await expect(page.getByRole("button", { name: "Start dubbing" })).toBeVisible();
});

test("a held project delete is exclusive until reset succeeds", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=delete-held");
  await confirmDub(page, "Continue dubbing");
  await page.getByLabel("Grown-up options").click();
  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete my dub" }).click();

  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("Deleting your dub…");
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("button", { name: "Play full video" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Continue Scene 1" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Scene 1, in progress" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Deleting my dub…" })).toBeDisabled();

  await releaseDubOperation(page, "delete");
  await expect(page.getByRole("button", { name: "Start dubbing" })).toBeVisible();
});

test("a held pre-confirmation delete marks the intro route busy", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=delete-held");
  await page.getByLabel("Grown-up options").click();
  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete saved recordings" }).click();

  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("Deleting your dub…");
  await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("button", { name: "Deleting saved recordings…" })).toBeDisabled();

  await releaseDubOperation(page, "delete");
  await expect(page.getByRole("button", { name: "Start dubbing" })).toBeVisible();
});

test("an ordinary delete failure stays actionable in the project view", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=delete-failed");
  await confirmDub(page, "Continue dubbing");
  await page.getByLabel("Grown-up options").click();
  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete my dub" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Your saved dub was not deleted." })).toBeVisible();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("Your saved dub was not deleted.");
  await expect(page.getByRole("region", { name: "Full video player" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play full video" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Scene 1, in progress" })).toBeEnabled();
});

test("keeps reset retry available after a failed recovery delete", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=reset-delete-failed");
  await expect(page.getByRole("button", { name: "Finish deleting my dub" })).toBeVisible();
  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Finish deleting my dub" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "not deleted" })).toBeVisible();
  await page.getByRole("button", { name: "Try loading again" }).click();
  await expect(page.getByRole("button", { name: "Start dubbing" })).toBeVisible();
});

test("the storyboard remains functional on a narrow phone", async ({ page }) => {
  await page.setViewportSize({ height: 568, width: 280 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await confirmDub(page, "Continue dubbing");
  await page.getByRole("button", { name: "Continue Scene 1" }).click();
  const record = page.getByRole("button", { name: "Record line" });
  await record.scrollIntoViewIfNeeded();
  await expect(record).toBeInViewport();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("reduced motion disables playing duck animation and playback cleanup stays idempotent", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
  await confirmDub(page, "Continue dubbing");
  await page.getByRole("button", { name: "Play full video" }).click();
  await expect(page.getByRole("button", { name: "Stop full video" })).toBeVisible();
  const sceneSvg = page.getByRole("figure").locator("svg");
  await expect(sceneSvg).toHaveAttribute("aria-hidden", "true");
  const animationNames = await sceneSvg.locator("g").evaluateAll((groups) =>
    groups
      .filter((group) => (group as SVGElement).style.animationDelay !== "")
      .map((group) => getComputedStyle(group).animationName),
  );
  expect(animationNames.length).toBeGreaterThan(0);
  expect(animationNames.every((name) => name === "none")).toBe(true);
  await page.getByRole("button", { name: "Stop full video" }).click();
  await openScene(page, 1);
  await page.getByRole("button", { name: "Play this scene" }).click();
  await page.getByRole("button", { name: "Stop this scene" }).click();
  await expect.poll(async () => (await dubStoreSnapshot(page)).audioContextDoubleCloses).toBe(0);
});
