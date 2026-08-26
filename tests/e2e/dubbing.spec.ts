import { expect, test, type Locator, type Page } from "@playwright/test";

type DubStoreSnapshot = {
  audioContextDoubleCloses: number;
  createdObjectUrls: string[];
  guideFetches: string[];
  playedAudioSources: string[];
  privateFetches: string[];
  revokedObjectUrls: string[];
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

async function revealSceneListening(page: Page) {
  const disclosure = page.getByRole("complementary", { name: "Scene line controls" }).locator("details");
  if (!await disclosure.evaluate((element: HTMLDetailsElement) => element.open)) {
    await page.getByLabel("Listen").click();
  }
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

function revocationCount(snapshot: DubStoreSnapshot, url: string) {
  return snapshot.revokedObjectUrls.filter((revoked) => revoked === url).length;
}

async function releaseDubOperation(page: Page, operation: "delete" | "upload") {
  await expect.poll(async () => page.evaluate((requestedOperation) => {
    const store = (
      window as typeof window & { __parrotE2eDub?: DubStoreController }
    ).__parrotE2eDub;
    if (!store) throw new Error("Dub store is missing.");
    return requestedOperation === "delete"
      ? store.releaseDelete()
      : store.releaseUpload();
  }, operation)).toBe(true);
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
  await expect(page.getByText("0 / 24", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Project recording progress" })).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByRole("progressbar", { name: "Project recording progress" })).toHaveAttribute("aria-valuetext", "0 of 24 clips recorded");
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
  await revealSceneListening(page);
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

test("secondary listening actions stay under one collapsed control", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);

  await expect(page.getByRole("button", { name: "Record line" })).toBeVisible();
  await expect(page.getByText("0 / 4", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Scene recording progress" })).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByRole("progressbar", { name: "Scene recording progress" })).toHaveAttribute("aria-valuetext", "0 of 4 lines recorded");
  await expect(page.getByLabel("Listen")).toBeVisible();
  await expect(page.getByRole("button", { name: "Play this scene" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Hear example" })).toBeHidden();

  await revealSceneListening(page);
  await expect(page.getByRole("button", { name: "Play this scene" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hear example" })).toBeVisible();
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
  await expect(page.getByRole("button", { name: "Scene 1, 1 / 4" })).toBeVisible();
  await expect(page.getByText("1 / 24", { exact: true })).toBeVisible();

  await page.reload();
  await confirmDub(page, "Continue dubbing");
  await expect(page.getByRole("button", { name: "Scene 1, 1 / 4" })).toBeVisible();
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

test("reselecting the active line keeps its saved local review URL", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);
  await stopAndSave(page);

  await expect.poll(async () => (await dubStoreSnapshot(page)).createdObjectUrls).toHaveLength(1);
  const [objectUrl] = (await dubStoreSnapshot(page)).createdObjectUrls;
  expect(revocationCount(await dubStoreSnapshot(page), objectUrl)).toBe(0);

  await page.getByRole("button", { name: "Line 1, selected, recorded" }).click();
  await expect(page.getByRole("img", { name: "Your recording waveform" })).toBeVisible();
  expect(revocationCount(await dubStoreSnapshot(page), objectUrl)).toBe(0);

  await page.getByRole("button", { name: "Hear my voice" }).click();
  await expect.poll(async () => (await dubStoreSnapshot(page)).playedAudioSources).toContain(objectUrl);
});

test("replacing a take revokes the previous object URL exactly once", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);
  await stopAndSave(page);
  const [firstUrl] = (await dubStoreSnapshot(page)).createdObjectUrls;

  await page.getByRole("button", { name: "Record again" }).click();
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect.poll(async () => (await dubStoreSnapshot(page)).createdObjectUrls).toHaveLength(2);
  const snapshot = await dubStoreSnapshot(page);
  const secondUrl = snapshot.createdObjectUrls[1];
  expect(revocationCount(snapshot, firstUrl)).toBe(1);
  expect(revocationCount(snapshot, secondUrl)).toBe(0);
});

test("changed-line selection, Back, and deletion never double-revoke review URLs", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);
  await stopAndSave(page);
  const [firstUrl] = (await dubStoreSnapshot(page)).createdObjectUrls;

  await page.getByRole("button", { name: "Line 2, generated" }).click();
  let snapshot = await dubStoreSnapshot(page);
  expect(revocationCount(snapshot, firstUrl)).toBe(1);

  await stopAndSave(page);
  await expect.poll(async () => (await dubStoreSnapshot(page)).createdObjectUrls).toHaveLength(2);
  const secondUrl = (await dubStoreSnapshot(page)).createdObjectUrls[1];
  await page.getByRole("button", { name: "Back to full video" }).click();
  snapshot = await dubStoreSnapshot(page);
  expect(revocationCount(snapshot, firstUrl)).toBe(1);
  expect(revocationCount(snapshot, secondUrl)).toBe(1);

  await page.getByLabel("More grown-up options").click();
  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete my dub" }).click();
  await expect(page.getByRole("button", { name: "Start dubbing" })).toBeVisible();
  snapshot = await dubStoreSnapshot(page);
  expect(revocationCount(snapshot, firstUrl)).toBe(1);
  expect(revocationCount(snapshot, secondUrl)).toBe(1);
});

test("route unmount revokes the retained review URL exactly once", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);
  await stopAndSave(page);
  const [objectUrl] = (await dubStoreSnapshot(page)).createdObjectUrls;

  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(async () =>
    revocationCount(await dubStoreSnapshot(page), objectUrl)).toBe(1);
});

test("scene playback advances only the visual before recording the selected canonical slot", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 2);
  await page.getByRole("button", { name: "Line 1, selected, generated" }).click();
  await revealSceneListening(page);
  await page.getByRole("button", { name: "Play this scene" }).click();
  await expect(page.getByRole("button", { name: "Stop this scene" })).toBeVisible();
  await expect(page.getByRole("figure")).toHaveAccessibleName(
    "The flock travels over a green hill.",
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
  const snapshot = await dubStoreSnapshot(page);
  expect(snapshot.createdObjectUrls).toHaveLength(1);
  expect(revocationCount(snapshot, snapshot.createdObjectUrls[0])).toBe(1);
});

test("corrupt private audio falls back to its guide and marks the scene Needs retake", async ({ page }) => {
  test.setTimeout(15_000);
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=corrupt-line-5");
  await confirmDub(page, "Continue dubbing");
  await page.getByRole("button", { name: "Play full video" }).click();
  await expect(page.getByRole("button", { name: "Stop full video" })).toBeVisible();
  await expect(page.getByText("24 / 24", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Scene 2, Needs retake" })).toBeVisible();
  await expect.poll(async () => (await dubStoreSnapshot(page)).guideFetches).toContain(
    "/assets/audio/five-little-ducks-v2-guide-line-5.mp3",
  );
  await expect(page.getByRole("button", { name: "Play full video" })).toBeVisible({ timeout: 8_000 });
  await openScene(page, 2);
  await stopAndSave(page);
  await page.getByRole("button", { name: "Back to full video" }).click();
  await expect(page.getByRole("button", { name: "Scene 2, Done" })).toBeVisible();
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
  await expect(
    page.getByRole("region", { name: "Full video player" }).getByRole("figure"),
  ).toHaveAccessibleName(/duck/i);
});

test("multiple unavailable voices are announced once in canonical order", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=multiple-source-failed");
  await confirmDub(page, "Continue dubbing");
  await page.getByRole("button", { name: "Play full video" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "could not play" })).toHaveText(
    "Scene 2, line 1 could not play. The video will continue without it. " +
      "Scene 2, line 4 could not play. The video will continue without it.",
  );
  await expect(page.getByRole("button", { name: "Stop full video" })).toBeVisible();
});

test("scene and line navigation cancel scoped playback", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await confirmDub(page, "Start dubbing");
  await page.getByRole("button", { name: "Play full video" }).click();
  await expect(page.getByRole("button", { name: "Stop full video" })).toBeVisible();
  await openScene(page, 1);
  await revealSceneListening(page);
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
  await revealSceneListening(page);
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
  await revealSceneListening(page);
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("main").getByText("Recording…", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Your recording waveform" })).toBeVisible({ timeout: 8_000 });
  await expect.poll(async () => (await dubStoreSnapshot(page)).uploads).toHaveLength(1);
});

test("held microphone readiness keeps every scene action locked behind one live status", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty&parrotE2eMicrophone=delayed");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);
  await revealSceneListening(page);
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
  await page.getByLabel("More grown-up options").click();
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
  await page.getByLabel("More grown-up options").click();
  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete my dub" }).click();

  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("Deleting your dub…");
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("button", { name: "Play full video" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Continue Scene 1" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Scene 1, 3 / 4" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Deleting my dub…" })).toBeDisabled();

  await releaseDubOperation(page, "delete");
  await expect(page.getByRole("button", { name: "Start dubbing" })).toBeVisible();
});

test("a held pre-confirmation delete marks the intro route busy", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=delete-held");
  await page.getByLabel("More grown-up options").click();
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
  await page.getByLabel("More grown-up options").click();
  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete my dub" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Your saved dub was not deleted." })).toBeVisible();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("Your saved dub was not deleted.");
  await expect(page.getByRole("region", { name: "Full video player" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play full video" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Scene 1, 3 / 4" })).toBeEnabled();
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

test("every dubbing route shell owns the constrained vertical scroll viewport", async ({ page }) => {
  await page.setViewportSize({ height: 568, width: 280 });

  await page.goto("/dubs/five-little-ducks?parrotE2eDub=load-held");
  await expect(page.getByRole("button", { name: "Loading your private dub…" })).toBeVisible();
  await expectDubScrollViewport(page);

  await page.goto("/dubs/five-little-ducks?parrotE2eDub=reset-interrupted");
  await expect(page.getByRole("button", { name: "Finish deleting my dub" })).toBeVisible();
  await expectDubScrollViewport(page);

  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expect(page.getByRole("button", { name: "Start dubbing" })).toBeVisible();
  await expectDubScrollViewport(page);
  await confirmDub(page, "Start dubbing");
  await expectDubScrollViewport(page);
  await openScene(page, 1);
  await expectDubScrollViewport(page);
});

test("a narrow phone surfaces the longest line actions without scrolling", async ({ page }) => {
  await page.setViewportSize({ height: 568, width: 280 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await confirmDub(page, "Continue dubbing");
  await openScene(page, 6);
  await page.getByRole("button", { name: "Line 3, generated" }).click();
  const sceneTitle = page.getByRole("heading", { name: "Sad mother duck", exact: true });
  await expect.poll(() => sceneTitle.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const record = page.getByRole("button", { name: "Record line" });
  await expectFullyInViewport(page, record);
  await expectFullyInViewport(page, page.getByLabel("Listen"));
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("full playback animates the story actors when motion is allowed", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await confirmDub(page, "Start dubbing");
  await page.getByRole("button", { name: "Play full video" }).click();

  const stage = page.getByRole("region", { name: "Full video player" }).locator("[data-story-stage]");
  await expect(stage).toHaveAttribute("data-animated", "true");
  const movingDuck = stage.locator('[data-duck-actor="duckling-1"] img');
  await expect(movingDuck).toHaveAttribute("data-motion", "swim");
  await expect.poll(() => movingDuck.evaluate((element) =>
    element.getAnimations().filter(({ playState }) => playState === "running").length
  )).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Stop full video" }).click();
});

test("stopping playback stops visible actor motion immediately", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await confirmDub(page, "Start dubbing");
  await page.getByRole("button", { name: "Play full video" }).click();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: "Stop full video" }).click();

  const actorImage = page
    .getByRole("region", { name: "Full video player" })
    .locator('[data-duck-actor="duckling-1"] img');
  await expect.poll(() => actorImage.evaluate((element) =>
    element.getAnimations().filter(({ playState }) => playState === "running").length
  )).toBe(0);
  await expect(
    page.getByRole("region", { name: "Full video player" }).locator("[data-story-stage]"),
  ).not.toHaveAttribute("data-animated", "true");
});

test("reduced motion disables playing duck animation and playback cleanup stays idempotent", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
  await confirmDub(page, "Continue dubbing");
  await page.getByRole("button", { name: "Play full video" }).click();
  await expect(page.getByRole("button", { name: "Stop full video" })).toBeVisible();
  const stage = page.getByRole("region", { name: "Full video player" }).locator("[data-story-stage]");
  await expect(stage).toHaveAttribute("aria-hidden", "true");
  await expect.poll(() => stage.evaluate((element) =>
    element.getAnimations({ subtree: true }).filter(({ playState }) => playState === "running").length
  )).toBe(0);
  await page.getByRole("button", { name: "Stop full video" }).click();
  await openScene(page, 1);
  await revealSceneListening(page);
  await page.getByRole("button", { name: "Play this scene" }).click();
  await page.getByRole("button", { name: "Stop this scene" }).click();
  await expect.poll(async () => (await dubStoreSnapshot(page)).audioContextDoubleCloses).toBe(0);
});

async function boundingBoxOrThrow(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Expected a visible element with a bounding box.");
  return box;
}

async function expectFullyInViewport(page: Page, locator: Locator) {
  const box = await boundingBoxOrThrow(locator);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Expected an explicit viewport size.");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

async function expectDubScrollViewport(page: Page) {
  const metrics = await page.getByRole("main").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      bottom: rect.bottom,
      height: rect.height,
      left: rect.left,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      overscrollY: style.overscrollBehaviorY,
      right: rect.right,
      viewportHeight: innerHeight,
      viewportWidth: innerWidth,
    };
  });
  expect(metrics).toMatchObject({
    left: 0,
    overflowX: "hidden",
    overflowY: "auto",
    overscrollY: "contain",
  });
  expect(metrics.height).toBe(metrics.viewportHeight);
  expect(metrics.bottom).toBe(metrics.viewportHeight);
  expect(metrics.right).toBe(metrics.viewportWidth);
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function expectLearnerTargetsAtLeast48px(page: Page) {
  const targets = page.getByRole("main").getByRole("button");
  const sizes = await targets.evaluateAll((elements) => elements.map((element) => {
    const { height, width } = element.getBoundingClientRect();
    return { height, name: element.getAttribute("aria-label") ?? element.textContent?.trim(), width };
  }));
  expect(sizes).not.toEqual([]);
  for (const target of sizes) {
    expect(target.width, `${target.name} is narrower than 48px`).toBeGreaterThanOrEqual(48);
    expect(target.height, `${target.name} is shorter than 48px`).toBeGreaterThanOrEqual(48);
  }
}

test("the desktop project keeps the video and compact scene strip in one view", async ({ page }) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await confirmDub(page, "Continue dubbing");

  const workspace = page.getByRole("region", { name: "Dub project workspace" });
  const player = page.getByRole("region", { name: "Full video player" });
  const dock = page.getByRole("navigation", { name: "Scenes" });
  const continueButton = page.getByRole("button", { name: "Continue Scene 1" });
  const playButton = page.getByRole("button", { name: "Play full video" });
  const workspaceBox = await boundingBoxOrThrow(workspace);
  const playerBox = await boundingBoxOrThrow(player);
  const dockBox = await boundingBoxOrThrow(dock);
  const playBox = await boundingBoxOrThrow(playButton);

  expect(workspaceBox.width).toBeGreaterThanOrEqual(1280 * 0.9);
  expect(playerBox.width / playerBox.height).toBeGreaterThan(1.7);
  expect(playerBox.width / playerBox.height).toBeLessThan(1.8);
  expect(playerBox.width).toBeGreaterThanOrEqual(workspaceBox.width * 0.65);
  expect(playerBox.x + playerBox.width).toBeLessThanOrEqual(dockBox.x);
  expect(playBox.y).toBeGreaterThanOrEqual(playerBox.y + playerBox.height);
  expect(boxesOverlap(playerBox, playBox)).toBe(false);
  await expect(player).toBeInViewport();
  await expect(dock).toBeInViewport();
  await expect(continueButton).toBeInViewport();
  await expect(dock.getByRole("button")).toHaveCount(6);
  await expectNoHorizontalOverflow(page);
});

test("the narrow project keeps its full title and transport outside the story art", async ({ page }) => {
  await page.setViewportSize({ height: 568, width: 280 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await confirmDub(page, "Continue dubbing");

  const title = page.getByRole("heading", { name: "Five Little Ducks" });
  await expect.poll(() => title.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const [playerBox, playBox] = await Promise.all([
    boundingBoxOrThrow(page.getByRole("region", { name: "Full video player" })),
    boundingBoxOrThrow(page.getByRole("button", { name: "Play full video" })),
  ]);
  expect(playBox.y).toBeGreaterThanOrEqual(playerBox.y + playerBox.height);
  expect(boxesOverlap(playerBox, playBox)).toBe(false);
});

test("the desktop scene editor keeps the stage left of its selected-line controls", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await confirmDub(page, "Continue dubbing");
  await openScene(page, 1);

  const workspace = page.getByRole("region", { name: "Scene editor workspace" });
  const stage = page.getByRole("region", { name: "Scene video" });
  const controls = page.getByRole("complementary", { name: "Scene line controls" });
  const [workspaceBox, stageBox, controlsBox] = await Promise.all([
    boundingBoxOrThrow(workspace),
    boundingBoxOrThrow(stage),
    boundingBoxOrThrow(controls),
  ]);

  expect(workspaceBox.width).toBeGreaterThanOrEqual(1440 * 0.9);
  expect(stageBox.x + stageBox.width).toBeLessThanOrEqual(controlsBox.x);
  expect(stageBox.y + stageBox.height).toBeGreaterThan(controlsBox.y);
  await expect(stage).toBeInViewport();
  await expect(controls).toBeInViewport();
  await expectNoHorizontalOverflow(page);
});

test("the narrow scene editor reads stage, selectors, selected lyric, then controls", async ({ page }) => {
  await page.setViewportSize({ height: 568, width: 280 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await confirmDub(page, "Continue dubbing");
  await openScene(page, 1);

  const stage = page.getByRole("region", { name: "Scene video" });
  const selectors = page.getByRole("region", { name: "Scene line selectors" });
  const lyric = page.getByRole("heading", { name: "But only four little ducks came back." });
  const record = page.getByRole("button", { name: "Record line" });
  const listen = page.getByLabel("Listen");
  const [stageBox, selectorsBox, lyricBox, recordBox, listenBox] = await Promise.all([
    boundingBoxOrThrow(stage),
    boundingBoxOrThrow(selectors),
    boundingBoxOrThrow(lyric),
    boundingBoxOrThrow(record),
    boundingBoxOrThrow(listen),
  ]);

  expect(selectorsBox.y).toBeGreaterThanOrEqual(stageBox.y + stageBox.height);
  expect(lyricBox.y).toBeGreaterThanOrEqual(selectorsBox.y + selectorsBox.height);
  expect(recordBox.y).toBeGreaterThanOrEqual(lyricBox.y + lyricBox.height);
  expect(listenBox.y).toBeGreaterThanOrEqual(recordBox.y + recordBox.height);
  await expect(page.getByRole("button", { name: "Play this scene" })).toBeHidden();
  await expect(page.getByRole("region", { name: "Scene lyrics" })).toHaveCount(0);
});

for (const viewport of [
  { height: 568, width: 280 },
  { height: 844, width: 390 },
]) {
  test(`phone project and scene controls remain reachable at ${viewport.width} by ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
    await confirmDub(page, "Continue dubbing");

    const dock = page.getByRole("navigation", { name: "Scenes" });
    const sceneSix = dock.getByRole("button", { name: "Scene 6, Not started" });
    await expectNoHorizontalOverflow(page);
    await expect.poll(() => dock.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    await page.mouse.move(viewport.width / 2, viewport.height - 24);
    await page.mouse.wheel(0, 800);
    await expect(dock).toBeInViewport();
    await dock.hover();
    await page.mouse.wheel(1_000, 0);
    await expect.poll(() => dock.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    const [dockBox, sceneBox] = await Promise.all([
      boundingBoxOrThrow(dock),
      boundingBoxOrThrow(sceneSix),
    ]);
    expect(sceneBox.x).toBeGreaterThanOrEqual(dockBox.x);
    expect(sceneBox.x + sceneBox.width).toBeLessThanOrEqual(dockBox.x + dockBox.width + 1);
    await expectLearnerTargetsAtLeast48px(page);

    await sceneSix.focus();
    await page.keyboard.press("Enter");
    const sceneHeading = page.getByRole("heading", { name: "Sad mother duck", exact: true });
    await expect(sceneHeading).toBeFocused();
    await expect(page.getByText("Scene 6 of 6", { exact: true })).toHaveAttribute("aria-current", "page");

    for (const selector of await page.getByRole("region", { name: "Scene line selectors" }).getByRole("button").all()) {
      const box = await boundingBoxOrThrow(selector);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }

    const record = page.getByRole("button", { name: "Record line" });
    await page.mouse.move(viewport.width / 2, viewport.height - 24);
    await page.mouse.wheel(0, 1_000);
    await expect(record).toBeInViewport();
    await expectNoHorizontalOverflow(page);
    await expectLearnerTargetsAtLeast48px(page);
  });
}

test("keyboard navigation exposes current selections and focuses scene and line headings", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await confirmDub(page, "Start dubbing");
  const sceneTwo = page.getByRole("button", { name: "Scene 2, Not started" });
  await expect(page.getByRole("button", { name: "Scene 1, Not started" })).toHaveAttribute("aria-current", "page");

  await sceneTwo.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Four little ducks", exact: true })).toBeFocused();
  await expect(page.getByText("Scene 2 of 6", { exact: true })).toHaveAttribute("aria-current", "page");

  const lineTwo = page.getByRole("button", { name: "Line 2, generated" });
  await lineTwo.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Line 2, selected, generated" })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("heading", { name: "Over the hill and far away." })).toBeFocused();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveCount(1);
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText(
    "Scene 2, line 2 selected. Generated.",
  );
});

test("keyboard Continue focuses the selected scene heading", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await confirmDub(page, "Continue dubbing");
  const continueButton = page.getByRole("button", { name: "Continue Scene 1" });
  await continueButton.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: "Five little ducks" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Line 4, selected, generated" })).toBeVisible();
});

test("save recovery and completed scoped playback restore focus to their fixed action", async ({ page }) => {
  test.setTimeout(15_000);
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=upload-retry-held");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);
  await page.getByRole("button", { name: "Record line" }).click();
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByRole("button", { name: "Save again" })).toBeFocused();

  await page.getByRole("button", { name: "Save again" }).click();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("Saving your take…");
  await releaseDubOperation(page, "upload");
  await expect(page.getByRole("button", { name: "Record again" })).toBeFocused();

  await page.getByRole("button", { name: "Play this scene" }).click();
  await page.getByRole("button", { name: "Hear example" }).focus();
  await expect(page.getByRole("button", { name: "Play this scene" })).toBeFocused({ timeout: 8_000 });
});

test("completed full playback restores focus to the full-video play action", async ({ page }) => {
  test.setTimeout(15_000);
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
  await confirmDub(page, "Continue dubbing");
  await page.getByRole("button", { name: "Play full video" }).click();
  await page.getByLabel("More grown-up options").focus();
  await expect(page.getByRole("button", { name: "Play full video" })).toBeFocused({ timeout: 8_000 });
});

test("a stale microphone-error animation-frame callback cannot steal focus", async ({ page }) => {
  await page.addInitScript(() => {
    const callbacks: FrameRequestCallback[] = [];
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        callbacks.push(callback);
        return callbacks.length;
      },
    });
    Object.defineProperty(window, "__flushAnimationFrames", {
      configurable: true,
      value: () => callbacks.splice(0).forEach((callback) => callback(performance.now())),
    });
  });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty&parrotE2eMicrophone=denied");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "The microphone is off." })).toBeVisible();

  const hearExample = page.getByRole("button", { name: "Hear example" });
  await revealSceneListening(page);
  await hearExample.click();
  await page.evaluate(() => {
    (window as typeof window & { __flushAnimationFrames(): void }).__flushAnimationFrames();
  });
  await expect(hearExample).toBeFocused();
});

test("short landscape keeps project and scene actions clear of the route header", async ({ page }) => {
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await confirmDub(page, "Continue dubbing");

  const routeHeader = page.getByRole("navigation", { name: "Page navigation" });
  const player = page.getByRole("region", { name: "Full video player" });
  const dock = page.getByRole("navigation", { name: "Scenes" });
  const playFull = page.getByRole("button", { name: "Play full video" });
  const continueScene = page.getByRole("button", { name: "Continue Scene 1" });
  const [headerBox, playerBox, dockBox, playFullBox, continueBox] = await Promise.all([
    boundingBoxOrThrow(routeHeader),
    boundingBoxOrThrow(player),
    boundingBoxOrThrow(dock),
    boundingBoxOrThrow(playFull),
    boundingBoxOrThrow(continueScene),
  ]);
  for (const box of [playerBox, dockBox, playFullBox, continueBox]) {
    expect(box.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
    expect(box.y + box.height).toBeLessThanOrEqual(360);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(640);
  }
  expect(playFullBox.height).toBeGreaterThanOrEqual(48);
  expect(continueBox.height).toBeGreaterThanOrEqual(48);
  expect(boxesOverlap(playerBox, dockBox)).toBe(false);
  expect(playFullBox.x).toBeGreaterThanOrEqual(playerBox.x);
  expect(playFullBox.x + playFullBox.width).toBeLessThanOrEqual(playerBox.x + playerBox.width);
  expect(playFullBox.y).toBeGreaterThanOrEqual(playerBox.y + playerBox.height);
  expect(boxesOverlap(playerBox, playFullBox)).toBe(false);
  expect(boxesOverlap(playerBox, continueBox)).toBe(false);
  expect(boxesOverlap(dockBox, playFullBox)).toBe(false);
  expect(boxesOverlap(dockBox, continueBox)).toBe(false);
  expect(boxesOverlap(playFullBox, continueBox)).toBe(false);
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Scene 1, 3 / 4" }).click();
  const sceneStage = page.getByRole("region", { name: "Scene video" });
  const sceneControls = page.getByRole("complementary", { name: "Scene line controls" });
  const selectors = page.getByRole("region", { name: "Scene line selectors" });
  const lineHeading = page.getByRole("heading", { name: "But only four little ducks came back." });
  const record = page.getByRole("button", { name: "Record line" });
  const listen = page.getByLabel("Listen");
  const [sceneHeaderBox, stageBox, controlsBox, selectorsBox, lineBox, recordBox, listenBox] = await Promise.all([
    boundingBoxOrThrow(routeHeader),
    boundingBoxOrThrow(sceneStage),
    boundingBoxOrThrow(sceneControls),
    boundingBoxOrThrow(selectors),
    boundingBoxOrThrow(lineHeading),
    boundingBoxOrThrow(record),
    boundingBoxOrThrow(listen),
  ]);
  expect(stageBox.x + stageBox.width).toBeLessThanOrEqual(controlsBox.x);
  for (const box of [stageBox, controlsBox, selectorsBox, lineBox, recordBox, listenBox]) {
    expect(box.y).toBeGreaterThanOrEqual(sceneHeaderBox.y + sceneHeaderBox.height);
    expect(box.y + box.height).toBeLessThanOrEqual(360);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(640);
  }
  expect(boxesOverlap(stageBox, controlsBox)).toBe(false);
  expect(recordBox.y).toBeGreaterThanOrEqual(lineBox.y + lineBox.height);
  expect(listenBox.y).toBeGreaterThanOrEqual(recordBox.y + recordBox.height);
  expect(recordBox.height).toBeGreaterThanOrEqual(48);
  expect(listenBox.height).toBeGreaterThanOrEqual(48);
  await expect(page.getByRole("button", { name: "Play this scene" })).toBeHidden();
  await expectNoHorizontalOverflow(page);
});

function boxesOverlap(
  first: { height: number; width: number; x: number; y: number },
  second: { height: number; width: number; x: number; y: number },
) {
  return first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y;
}
