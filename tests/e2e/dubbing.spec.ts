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

async function confirmDub(
  page: Page,
  action: "Continue dubbing" | "Start dubbing",
) {
  await page.getByRole("button", { name: action }).click();
  await expectNoLearnerAdultControls(page);
}

async function expectNoLearnerAdultControls(page: Page) {
  await expect(
    page.getByRole("checkbox", {
      name: /I’m the grown-up|I am (?:the learner|.+)'s guardian/i,
    }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Grown-up options")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Delete (my )?dub/i }),
  ).toHaveCount(0);
}

async function visibleBox(locator: Locator) {
  await expect(locator).toBeVisible();
  return boundingBoxOrThrow(locator);
}

async function visibleBoxWithin(locator: Locator, container: Locator) {
  const [box, containerBox] = await Promise.all([
    visibleBox(locator),
    visibleBox(container),
  ]);
  return { ...box, x: box.x - containerBox.x, y: box.y - containerBox.y };
}

function expectSameActionSlot(
  actual: { height: number; width: number; x: number; y: number },
  expected: { height: number; width: number; x: number; y: number },
) {
  for (const key of ["height", "width", "x", "y"] as const) {
    expect(
      Math.abs(actual[key] - expected[key]),
      `${key} moved from ${expected[key]} to ${actual[key]}`,
    ).toBeLessThanOrEqual(2);
  }
}

async function openScene(page: Page, sceneNumber: number) {
  await page.getByRole("button", { name: new RegExp(`^Scene ${sceneNumber},`) }).click();
  await expect(page.getByRole("region", { name: "Scene video" })).toBeVisible();
}

async function stopAndSave(page: Page) {
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("timer", { name: "Recording duration" })).toContainText("Recording");
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

test("guardian consent unlocks the storyboard without exposing adult controls", async ({
  page,
}) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=not-granted");

  await expect(
    page.getByRole("main").getByRole("paragraph"),
  ).toHaveText("Ask a grown-up to turn on voice dubbing in Guardian mode.");
  await expectNoLearnerAdultControls(page);
  const lockedGrant = await page.evaluate(async (consentVersion) => {
    const response = await fetch("/api/dubs/five-little-ducks-v2/consent", {
      body: JSON.stringify({ accepted: true, consentVersion }),
      headers: { "Content-Type": "application/json" },
      method: "PUT",
    });
    return { body: await response.json(), status: response.status };
  }, "guardian-voice-r2-v2");
  expect(lockedGrant).toEqual({
    body: { error: "guardian_required" },
    status: 403,
  });

  await page
    .getByRole("button", { name: /Profile for Mia, learner mode/ })
    .click();
  await page
    .getByRole("menu", { name: "Account menu" })
    .getByRole("menuitem", { name: /Grown-up access/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Unlock guardian mode" });
  await dialog.getByLabel("Password").fill("e2e-guardian-password");
  await dialog.getByRole("button", { name: "Unlock guardian mode" }).click();
  await page.getByRole("link", { name: "Manage voice dubbing" }).click();

  await page.getByRole("checkbox", { name: /I am Mia's guardian/i }).check();
  await page.getByRole("button", { name: "Allow voice dubbing" }).click();
  await expect(
    page.getByRole("heading", { name: "Voice dubbing is on" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Switch to .*start dubbing/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Manage learners" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to guardian dashboard" }).click();
  await page.getByRole("button", { name: "Switch to learner" }).click();
  await page.getByRole("link", { name: "Dub a rhyme" }).click();

  await expect(page).toHaveURL("/dubs/five-little-ducks");
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Profile for Mia, learner mode/ }),
  ).toBeVisible();
  await confirmDub(page, "Start dubbing");
  await expect(
    page.getByRole("region", { name: "Full video player" }),
  ).toBeVisible();
  await openScene(page, 1);
  await stopAndSave(page);
  await expectNoLearnerAdultControls(page);
});

test("keeps revoking consent unavailable on the learner surface", async ({
  page,
}) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=revoking");

  await expect(
    page.getByRole("main").getByRole("paragraph"),
  ).toHaveText("Ask a grown-up to turn on voice dubbing in Guardian mode.");
  await expect(
    page.getByRole("button", { name: /Start dubbing|Continue dubbing/ }),
  ).toHaveCount(0);
  await expectNoLearnerAdultControls(page);
});

test("guardian mode deletes a complete private dub and revokes consent", async ({
  page,
}) => {
  await page.goto(
    "/guardian/dubbing?parrotE2eDub=complete&parrotE2eGuardian=guardian",
  );

  await expect(
    page.getByRole("heading", { name: "Voice dubbing is on" }),
  ).toBeVisible();
  await expect(
    page.getByText("24 of 24 lines saved", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Turn off Mia's voice dubbing and delete saved clips",
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Turn on private voice dubbing" }),
  ).toBeVisible();
});

const guardianResponsiveStates = [
  {
    action: "Turn off Mia's voice dubbing and delete saved clips",
    heading: "Voice dubbing is on",
    scenario: "complete",
  },
  {
    action: "Allow voice dubbing",
    heading: "Turn on private voice dubbing",
    scenario: "not-granted",
  },
  {
    action: "Finish removing voice clips",
    heading: "Voice clip removal needs to finish",
    scenario: "reset-delete-failed",
  },
] as const;

for (const viewport of [
  { height: 568, width: 280 },
  { height: 844, width: 390 },
  { height: 360, width: 640 },
]) {
  for (const state of guardianResponsiveStates) {
    test(`keeps guardian ${state.scenario} settings usable at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(
        `/guardian/dubbing?parrotE2eDub=${state.scenario}&parrotE2eGuardian=guardian`,
      );

      const back = page.getByRole("link", {
        name: "Back to guardian dashboard",
      });
      const account = page.getByRole("button", {
        name: /Profile for Alex Guardian, guardian mode/,
      });
      const pageHeading = page.getByRole("heading", {
        exact: true,
        name: "Voice dubbing",
      });
      const stateHeading = page.getByRole("heading", {
        exact: true,
        name: state.heading,
      });
      const action = page.getByRole("button", { name: state.action });

      const headerBoxes = await Promise.all([back, account].map(visibleBox));
      for (const box of headerBoxes) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      }
      expect(boxesOverlap(headerBoxes[0], headerBoxes[1])).toBe(false);
      await expect(pageHeading).toBeVisible();
      await expect(stateHeading).toBeVisible();
      await action.scrollIntoViewIfNeeded();
      const actionBox = await visibleBox(action);
      expect(actionBox.x).toBeGreaterThanOrEqual(0);
      expect(actionBox.x + actionBox.width).toBeLessThanOrEqual(viewport.width);
      expect(actionBox.y).toBeGreaterThanOrEqual(0);
      expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(
        viewport.height,
      );
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
    });
  }
}

test("guardian mode recovers a legacy interrupted reset after a fresh grant", async ({
  page,
}) => {
  await page.goto(
    "/guardian/dubbing?parrotE2eDub=reset-interrupted&parrotE2eGuardian=guardian",
  );

  await expect(
    page.getByRole("heading", { name: "Turn on private voice dubbing" }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: /I am Mia's guardian/,
    })
    .check();
  await page.getByRole("button", { name: "Allow voice dubbing" }).click();

  await expect(
    page.getByRole("heading", { name: "Voice clip removal needs to finish" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Allow voice dubbing" }),
  ).toHaveCount(0);
  const interruptedStatus = await page.evaluate(async () => {
    const response = await fetch("/api/dubs/five-little-ducks-v2");
    return { body: await response.json(), status: response.status };
  });
  expect(interruptedStatus).toEqual({
    body: { error: "dub_reset_in_progress" },
    status: 409,
  });

  await page
    .getByRole("button", { name: "Finish removing voice clips" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Turn on private voice dubbing" }),
  ).toBeVisible();
  const finalConsentState = await page.evaluate(async () => {
    const response = await fetch("/api/dubs/five-little-ducks-v2");
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null && "consentState" in body
      ? body.consentState
      : null;
  });
  expect(finalConsentState).toBe("not_granted");
});

test("keeps a failed cleanup revoking until the guardian retries", async ({
  page,
}) => {
  await page.goto(
    "/guardian/dubbing?parrotE2eDub=reset-delete-failed&parrotE2eGuardian=guardian",
  );
  await page
    .getByRole("button", { name: "Finish removing voice clips" })
    .click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "Your saved dub was not deleted.",
    }),
  ).toBeVisible();

  await expect(
    page.getByRole("heading", { name: "Voice clip removal needs to finish" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Finish removing voice clips" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Voice clip removal needs to finish" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Finish removing voice clips" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Allow voice dubbing" }),
  ).toHaveCount(0);

  const blockedRegrant = await page.evaluate(async (consentVersion) => {
    const response = await fetch("/api/dubs/five-little-ducks-v2/consent", {
      body: JSON.stringify({ accepted: true, consentVersion }),
      headers: { "Content-Type": "application/json" },
      method: "PUT",
    });
    return { body: await response.json(), status: response.status };
  }, "guardian-voice-r2-v2");
  expect(blockedRegrant).toEqual({
    body: { error: "dub_consent_revoking" },
    status: 409,
  });

  const blockedMedia = await page.evaluate(async () => {
    const responses = await Promise.all([
      fetch("/api/dubs/five-little-ducks-v2/lines/line-1/audio"),
      fetch("/api/dubs/five-little-ducks-v2/lines/line-1", {
        body: new Blob(["blocked clip"], { type: "audio/webm" }),
        headers: { "Content-Type": "audio/webm" },
        method: "PUT",
      }),
    ]);
    return Promise.all(
      responses.map(async (response) => ({
        body: await response.json(),
        status: response.status,
      })),
    );
  });
  expect(blockedMedia).toEqual([
    { body: { error: "dub_consent_revoking" }, status: 409 },
    { body: { error: "dub_consent_revoking" }, status: 409 },
  ]);

  await page
    .getByRole("button", { name: "Finish removing voice clips" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Turn on private voice dubbing" }),
  ).toBeVisible();
});

test("reconciles a lost cleanup response from durable status", async ({
  page,
}) => {
  await page.goto(
    "/guardian/dubbing?parrotE2eDub=reset-delete-lost-response&parrotE2eGuardian=guardian",
  );
  await page
    .getByRole("button", { name: "Finish removing voice clips" })
    .click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "Your saved dub was not deleted.",
    }),
  ).toBeVisible();

  await expect(
    page.getByRole("heading", { name: "Turn on private voice dubbing" }),
  ).toBeVisible();
});

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

test("a partial project mixes saved and generated audio in full playback", async ({ page }) => {
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
  await page.getByRole("button", { name: "Stop full video" }).click();
});

test("Continue opens the first missing line while scenes remain selectable", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await confirmDub(page, "Continue dubbing");
  await page.getByRole("button", { name: "Continue Scene 1" }).click();
  await expect(page.getByText("Line 4 of 4", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", {
    name: "But only four little ducks came back.",
  })).toBeVisible();

  await page.getByRole("button", { name: "Back to full video" }).click();
  await openScene(page, 5);
  await expect(page.getByText("Line 1 of 4", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next line" }).click();
  await page.getByRole("button", { name: "Next line" }).click();
  await page.getByRole("button", { name: "Next line" }).click();
  await expect(page.getByText("Line 4 of 4", { exact: true })).toBeVisible();
  await expect(page.getByText("But none of the five little ducks came back.", { exact: true })).toBeVisible();
});

test("scene recording follows one linear Choicer-style action flow", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);

  await expect(page.getByRole("button", { name: "Record line" })).toBeVisible();
  await expect(page.getByText("Line 1 of 4", { exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Scene line controls" }).locator("details, summary")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Scene line selectors" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Play scene" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Hear line" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next line" })).toBeVisible();
  await expect(page.getByText("Up to 6 seconds", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Original audio waveform" })).toBeVisible();

  await page.getByRole("button", { name: "Next line" }).click();
  await expect(page.getByText("Line 2 of 4", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next line" }).click();
  await expect(page.getByText("Line 3 of 4", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next line" }).click();
  await expect(page.getByText("Line 4 of 4", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next, finish scene" }).click();
  await expect(page.getByRole("region", { name: "Full video player" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play full video" })).toBeFocused();
});

test("recording shows elapsed time, saves, and leaves Next in its fixed action slot", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 3);
  await page.getByRole("button", { name: "Next line" }).click();
  await page.getByRole("button", { name: "Next line" }).click();
  const controls = page.getByRole("complementary", { name: "Scene line controls" });
  const idleRecordBox = await visibleBoxWithin(page.getByRole("button", { name: "Record line" }), controls);
  const idleNextBox = await visibleBoxWithin(page.getByRole("button", { name: "Next line" }), controls);
  await page.getByRole("button", { name: "Record line" }).click();
  const timer = page.getByRole("timer", { name: "Recording duration" });
  const progress = page.getByRole("progressbar", { name: "Recording time" });
  await expect(timer).toContainText("0:06");
  await expect(progress).toHaveAttribute("aria-valuemax", "6000");
  await expect.poll(async () => Number(await progress.getAttribute("aria-valuenow"))).toBeGreaterThan(500);
  const guideWaveform = page.getByRole("img", { name: "Original audio waveform" });
  const liveWaveform = page.getByRole("img", { name: "Your live recording waveform" });
  expectSameActionSlot(await visibleBox(liveWaveform), await visibleBox(guideWaveform));
  await expect(page.getByText(/get ready|3…|2…|1…/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Stop recording" }).click();

  await expect(page.getByRole("img", { name: "Your recording waveform" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hear my voice" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next line" })).toBeFocused();
  expectSameActionSlot(
    await visibleBoxWithin(page.getByRole("button", { name: "Record again" }), controls),
    idleRecordBox,
  );
  expectSameActionSlot(
    await visibleBoxWithin(page.getByRole("button", { name: "Next line" }), controls),
    idleNextBox,
  );
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
  await expect(page.getByText("Line 1 of 4", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", {
    name: "Four little ducks went out one day.",
  })).toBeVisible();
  await stopAndSave(page);
  await expect(page.getByText("Saved ✓", { exact: true })).toBeVisible();
  await expect.poll(async () => (await dubStoreSnapshot(page)).uploads).toEqual([
    "/api/dubs/five-little-ducks-v2/lines/line-5",
  ]);
});

test("a saved take keeps its local review URL while the line stays active", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);
  await stopAndSave(page);

  await expect.poll(async () => (await dubStoreSnapshot(page)).createdObjectUrls).toHaveLength(1);
  const [objectUrl] = (await dubStoreSnapshot(page)).createdObjectUrls;
  expect(revocationCount(await dubStoreSnapshot(page), objectUrl)).toBe(0);

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

test("Next and Back never double-revoke review URLs", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);
  await stopAndSave(page);
  const [firstUrl] = (await dubStoreSnapshot(page)).createdObjectUrls;

  await page.getByRole("button", { name: "Next line" }).click();
  await expect(page.getByText("Line 2 of 4", { exact: true })).toBeVisible();
  let snapshot = await dubStoreSnapshot(page);
  expect(revocationCount(snapshot, firstUrl)).toBe(1);

  await stopAndSave(page);
  await expect.poll(async () => (await dubStoreSnapshot(page)).createdObjectUrls).toHaveLength(2);
  const secondUrl = (await dubStoreSnapshot(page)).createdObjectUrls[1];
  await page.getByRole("button", { name: "Back to full video" }).click();
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

test("retryable save survives guide and Blob replay while retry remains exclusive", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=upload-retry-held&parrotE2eDubPlayback=held");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);
  await page.getByRole("button", { name: "Record line" }).click();
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "not saved" })).toBeVisible();
  await expect(page.getByText("Not saved", { exact: true })).toBeVisible();
  await expect(page.getByText("Saved ✓", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Your recording waveform" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save again" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record again" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to full video" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next line" })).toBeDisabled();
  await expect(page.getByText("Line 1 of 4", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Hear line" }).click();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText(
    "Playing example for Scene 1, line 1.",
  );
  await expect(page.getByRole("button", { name: "Save again" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "not saved" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next line" })).toBeDisabled();
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
  await expect(page.getByRole("button", { name: "Next line" })).toBeDisabled();
  await expect.poll(async () =>
    (await dubStoreSnapshot(page)).playedAudioSources.some((source) => source.startsWith("blob:")),
  ).toBe(true);

  await page.getByRole("button", { name: "Save again" }).click();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("Saving your take…");
  await expect(page.getByRole("button", { name: "Saving recording" })).toBeDisabled();
  await expect(page.getByText("Saving your voice…", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hear line" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Hear my voice" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save again" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next line" })).toBeDisabled();
  await releaseDubOperation(page, "upload");
  await expect(page.getByRole("button", { name: "Save again" })).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Your recording waveform" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hear my voice" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Next line" })).toBeEnabled();
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

test("linear line navigation cancels guide playback", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty&parrotE2eDubPlayback=held");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);
  await page.getByRole("button", { name: "Hear line" }).click();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText(
    "Playing example for Scene 1, line 1.",
  );
  await page.getByRole("button", { name: "Next line" }).click();
  await expect(page.getByText("Line 2 of 4", { exact: true })).toBeVisible();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("Scene 1, line 2 selected. Generated.");
  await expect.poll(async () => (await dubStoreSnapshot(page)).audioContextDoubleCloses).toBe(0);
});

test("recording silences guide playback", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty&parrotE2eDubPlayback=held");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);
  await page.getByRole("button", { name: "Hear line" }).click();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText(
    "Playing example for Scene 1, line 1.",
  );
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("timer", { name: "Recording duration" })).toContainText("Recording");
  await expect(page.getByRole("button", { name: "Hear line" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next line" })).toBeDisabled();
  await expect.poll(async () => (await dubStoreSnapshot(page)).audioContextDoubleCloses).toBe(0);
  await page.getByRole("button", { name: "Stop recording" }).click();
});

test("automatically stops and saves one six-second recording", async ({ page }) => {
  test.setTimeout(15_000);
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("progressbar", { name: "Recording time" })).toHaveAttribute("aria-valuemax", "6000");
  await expect(page.getByRole("img", { name: "Your recording waveform" })).toBeVisible({ timeout: 8_000 });
  await expect.poll(async () => (await dubStoreSnapshot(page)).uploads).toHaveLength(1);
});

test("held microphone readiness keeps every scene action locked behind one live status", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty&parrotE2eMicrophone=delayed");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const controls = page.getByRole("complementary", { name: "Scene line controls" });
  const idleRecordBox = await visibleBoxWithin(page.getByRole("button", { name: "Record line" }), controls);
  const idleNextBox = await visibleBoxWithin(page.getByRole("button", { name: "Next line" }), controls);
  await page.getByRole("button", { name: "Record line" }).click();

  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("Opening microphone…");
  await expect(page.getByRole("button", { name: "Starting microphone" })).toBeVisible();
  expectSameActionSlot(
    await visibleBoxWithin(page.getByRole("button", { name: "Starting microphone" }), controls),
    idleRecordBox,
  );
  expectSameActionSlot(
    await visibleBoxWithin(page.getByRole("button", { name: "Next line" }), controls),
    idleNextBox,
  );
  await expect(page.getByRole("button", { name: "Back to full video" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Hear line" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Starting microphone" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next line" })).toBeDisabled();

  await resolveDelayedMicrophone(page);
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("Recording…");
  await expect(page.getByRole("timer", { name: "Recording duration" })).toContainText("0:06");
  expectSameActionSlot(
    await visibleBoxWithin(page.getByRole("button", { name: "Stop recording" }), controls),
    idleRecordBox,
  );
  expectSameActionSlot(
    await visibleBoxWithin(page.getByRole("button", { name: "Next line" }), controls),
    idleNextBox,
  );
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByRole("img", { name: "Your recording waveform" })).toBeVisible();
});

test("stops a delayed microphone stream that resolves after route exit", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty&parrotE2eMicrophone=delayed");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("button", { name: "Starting microphone" })).toBeVisible();
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

test("route exit cancels an active recording without uploading it", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty&parrotE2eMicrophone=delayed");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);
  await page.getByRole("button", { name: "Record line" }).click();
  await expect.poll(() => microphoneSnapshot(page)).toMatchObject({ pending: 1, requests: 1 });
  await resolveDelayedMicrophone(page);
  await expect(page.getByRole("timer", { name: "Recording duration" })).toContainText("Recording");
  await expect.poll(() => microphoneSnapshot(page)).toMatchObject({
    requests: 1,
    resolved: 1,
    stoppedTracks: 0,
  });

  await page.getByRole("link", { name: "Back to home" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => microphoneSnapshot(page)).toMatchObject({ stoppedTracks: 1 });
  await expect.poll(async () => (await dubStoreSnapshot(page)).uploads).toHaveLength(0);
});

for (const microphone of ["denied", "unsupported"] as const) {
  test(`keeps the current line after a ${microphone} microphone`, async ({ page }) => {
    await page.goto(`/dubs/five-little-ducks?parrotE2eDub=empty&parrotE2eMicrophone=${microphone}`);
    await confirmDub(page, "Start dubbing");
    await openScene(page, 4);
    await page.getByRole("button", { name: "Next line" }).click();
    await page.getByRole("button", { name: "Record line" }).click();
    const message = microphone === "denied"
      ? "The microphone is off. Ask a grown-up to allow it, then try again."
      : "This browser cannot record yet. Try another device or browser.";
    await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
    await expect(page.getByText("Line 2 of 4", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Over the hill and far away." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Record line" })).toBeFocused();
  });
}

test("a held Guardian delete is exclusive until removal succeeds", async ({ page }) => {
  await page.goto(
    "/guardian/dubbing?parrotE2eDub=delete-held&parrotE2eGuardian=guardian",
  );
  await page
    .getByRole("button", {
      name: "Turn off Mia's voice dubbing and delete saved clips",
    })
    .click();

  await expect(
    page.getByRole("button", { name: "Removing voice clips…" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /Switch to .*start dubbing/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Manage learners" }),
  ).toBeVisible();

  await releaseDubOperation(page, "delete");
  await expect(
    page.getByRole("heading", { name: "Turn on private voice dubbing" }),
  ).toBeVisible();
});

test("a failed Guardian delete stays actionable only in Guardian mode", async ({
  page,
}) => {
  await page.goto(
    "/guardian/dubbing?parrotE2eDub=delete-failed&parrotE2eGuardian=guardian",
  );
  await page
    .getByRole("button", {
      name: "Turn off Mia's voice dubbing and delete saved clips",
    })
    .click();

  await expect(
    page.getByRole("alert").filter({
      hasText: "Your saved dub was not deleted.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Voice clip removal needs to finish" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Finish removing voice clips" }),
  ).toBeEnabled();
});

test("every dubbing route shell owns the constrained vertical scroll viewport", async ({ page }) => {
  await page.setViewportSize({ height: 568, width: 280 });

  await page.goto("/dubs/five-little-ducks?parrotE2eDub=load-held");
  await expect(page.getByRole("button", { name: "Loading your private dub…" })).toBeVisible();
  await expectDubScrollViewport(page);

  await page.goto("/dubs/five-little-ducks?parrotE2eDub=reset-interrupted");
  await expect(
    page.getByRole("main").getByRole("paragraph"),
  ).toHaveText("Ask a grown-up to turn on voice dubbing in Guardian mode.");
  await expectNoLearnerAdultControls(page);
  await expectDubScrollViewport(page);

  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expect(page.getByRole("button", { name: "Start dubbing" })).toBeVisible();
  await expectDubScrollViewport(page);
  await confirmDub(page, "Start dubbing");
  await expectDubScrollViewport(page);
  await openScene(page, 1);
  await expectDubScrollViewport(page);
});

test("a narrow phone keeps the longest line actions in one clear scroll path", async ({ page }) => {
  await page.setViewportSize({ height: 568, width: 280 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await confirmDub(page, "Continue dubbing");
  await openScene(page, 6);
  await page.getByRole("button", { name: "Next line" }).click();
  await page.getByRole("button", { name: "Next line" }).click();
  const lyric = page.getByRole("heading", {
    name: "Sad mother duck said, “Quack, quack, quack, quack.”",
  });
  await expect.poll(() => lyric.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const record = page.getByRole("button", { name: "Record line" });
  const next = page.getByRole("button", { name: "Next line" });
  await record.scrollIntoViewIfNeeded();
  await expectFullyInViewport(page, record);
  await next.scrollIntoViewIfNeeded();
  await expectFullyInViewport(page, next);
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

test("stopping after a cue change cancels both pose motion and actor transitions", async ({ page }) => {
  test.setTimeout(15_000);
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await confirmDub(page, "Start dubbing");
  await page.getByRole("button", { name: "Play full video" }).click();

  const stage = page.getByRole("region", { name: "Full video player" }).locator("[data-story-stage]");
  await expect(stage.locator('[data-duck-actor="duckling-1"] img')).toHaveAttribute(
    "data-motion",
    "walk",
    { timeout: 7_000 },
  );
  await page.getByRole("button", { name: "Stop full video" }).click();

  await expect.poll(() => stage.evaluate((element) =>
    element.getAnimations({ subtree: true }).filter(({ playState }) => playState === "running").length
  )).toBe(0);
});

test("a failed painted pose uses a safe fallback without broken-image UI", async ({ page }) => {
  await page.route("**/duckling-walk.webp", (route) => route.abort());
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);
  await page.getByRole("button", { name: "Next line" }).click();

  const visibleActors = page
    .getByRole("region", { name: "Scene video" })
    .locator('[data-duck-actor][data-visible="true"]');
  await expect(visibleActors).toHaveCount(5);
  await expect.poll(() => visibleActors.evaluateAll((actors) => actors.every((actor) => {
    const image = actor.querySelector("img");
    return actor.getAttribute("data-image-state") === "failed"
      && image instanceof HTMLImageElement
      && getComputedStyle(image).opacity === "0"
      && getComputedStyle(actor).backgroundImage.includes("duckling-swim.webp");
  }))).toBe(true);
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
  await page.getByRole("button", { name: "Hear line" }).click();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText(
    "Playing example for Scene 1, line 1.",
  );
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText(
    "Scene 1, line 1 selected. Recorded.",
  );
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

test("the short-landscape project preserves the painted stage at 16:9", async ({ page }) => {
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await confirmDub(page, "Continue dubbing");

  const stage = page
    .getByRole("region", { name: "Full video player" })
    .locator('[data-story-stage="five-little-ducks"]');
  const box = await boundingBoxOrThrow(stage);
  expect(Math.abs(box.width / box.height - 16 / 9)).toBeLessThan(0.01);
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

test("the narrow scene editor reads stage, lyric, then its linear controls", async ({ page }) => {
  await page.setViewportSize({ height: 568, width: 280 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await confirmDub(page, "Continue dubbing");
  await openScene(page, 1);

  const stage = page.getByRole("region", { name: "Scene video" });
  const lyric = page.getByRole("heading", { name: "But only four little ducks came back." });
  const controls = page.getByRole("complementary", { name: "Scene line controls" });
  const example = page.getByRole("button", { name: "Hear line" });
  const record = page.getByRole("button", { name: "Record line" });
  const next = page.getByRole("button", { name: "Next, finish scene" });
  const [stageBox, lyricBox, controlsBox, exampleBox, recordBox, nextBox] = await Promise.all([
    boundingBoxOrThrow(stage),
    boundingBoxOrThrow(lyric),
    boundingBoxOrThrow(controls),
    boundingBoxOrThrow(example),
    boundingBoxOrThrow(record),
    boundingBoxOrThrow(next),
  ]);

  expect(lyricBox.y).toBeGreaterThanOrEqual(stageBox.y + stageBox.height);
  expect(controlsBox.y).toBeGreaterThanOrEqual(lyricBox.y + lyricBox.height);
  expect(recordBox.y).toBeGreaterThanOrEqual(exampleBox.y + exampleBox.height);
  expect(nextBox.y).toBeGreaterThanOrEqual(recordBox.y + recordBox.height);
  await expect(page.getByRole("region", { name: "Scene line selectors" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Play scene" })).toHaveCount(0);
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
    const lineHeading = page.getByRole("heading", {
      name: "Sad mother duck went out one day.",
    });
    await expect(lineHeading).toBeFocused();
    await expect(page.getByText("Line 1 of 4", { exact: true })).toHaveAttribute("aria-current", "step");

    for (const action of [
      page.getByRole("button", { name: "Hear line" }),
      page.getByRole("button", { name: "Record line" }),
      page.getByRole("button", { name: "Next line" }),
    ]) {
      await action.scrollIntoViewIfNeeded();
      await expectFullyInViewport(page, action);
    }
    await expectNoHorizontalOverflow(page);
    await expectLearnerTargetsAtLeast48px(page);
  });
}

test("keyboard navigation focuses the selected scene line and advances linearly", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await confirmDub(page, "Start dubbing");
  const sceneTwo = page.getByRole("button", { name: "Scene 2, Not started" });
  await expect(page.getByRole("button", { name: "Scene 1, Not started" })).toHaveAttribute("aria-current", "page");

  await sceneTwo.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", {
    name: "Four little ducks went out one day.",
  })).toBeFocused();
  await expect(page.getByText("Line 1 of 4", { exact: true })).toHaveAttribute("aria-current", "step");

  const next = page.getByRole("button", { name: "Next line" });
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Line 2 of 4", { exact: true })).toHaveAttribute("aria-current", "step");
  await expect(page.getByRole("heading", { name: "Over the hill and far away." })).toBeFocused();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveCount(1);
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText(
    "Scene 2, line 2 selected. Generated.",
  );
});

test("keyboard Continue focuses the first missing line heading", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await confirmDub(page, "Continue dubbing");
  const continueButton = page.getByRole("button", { name: "Continue Scene 1" });
  await continueButton.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", {
    name: "But only four little ducks came back.",
  })).toBeFocused();
  await expect(page.getByText("Line 4 of 4", { exact: true })).toBeVisible();
});

test("save recovery restores focus to the fixed Next action", async ({ page }) => {
  test.setTimeout(15_000);
  await page.addInitScript(() => {
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    let runEarly = false;
    Object.defineProperty(window, "__runNextAnimationFrameEarly", {
      configurable: true,
      value: () => { runEarly = true; },
    });
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        if (!runEarly) return nativeRequestAnimationFrame(callback);
        runEarly = false;
        callback(performance.now());
        return -1;
      },
    });
  });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=upload-retry-held");
  await confirmDub(page, "Start dubbing");
  await openScene(page, 1);
  await page.getByRole("button", { name: "Record line" }).click();
  await page.evaluate(() => {
    (window as typeof window & { __runNextAnimationFrameEarly(): void })
      .__runNextAnimationFrameEarly();
  });
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByRole("button", { name: "Save again" })).toBeFocused();

  await page.getByRole("button", { name: "Save again" }).click();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("Saving your take…");
  await releaseDubOperation(page, "upload");
  await expect(page.getByRole("button", { name: "Next line" })).toBeFocused();
});

test("completed full playback restores focus to the full-video play action", async ({ page }) => {
  test.setTimeout(15_000);
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
  await confirmDub(page, "Continue dubbing");
  await page.getByRole("button", { name: "Play full video" }).click();
  await page
    .getByRole("button", { name: /Profile for Mia, learner mode/ })
    .focus();
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

  const hearLine = page.getByRole("button", { name: "Hear line" });
  await hearLine.click();
  await page.evaluate(() => {
    (window as typeof window & { __flushAnimationFrames(): void }).__flushAnimationFrames();
  });
  await expect(hearLine).toBeFocused();
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
  const lineHeading = page.getByRole("heading", { name: "But only four little ducks came back." });
  const example = page.getByRole("button", { name: "Hear line" });
  const record = page.getByRole("button", { name: "Record line" });
  const next = page.getByRole("button", { name: "Next, finish scene" });
  const waveform = page.getByRole("img", { name: "Original audio waveform" });
  const [sceneHeaderBox, stageBox, controlsBox, lineBox] = await Promise.all([
    boundingBoxOrThrow(routeHeader),
    boundingBoxOrThrow(sceneStage),
    boundingBoxOrThrow(sceneControls),
    boundingBoxOrThrow(lineHeading),
  ]);
  expect(stageBox.x + stageBox.width).toBeLessThanOrEqual(controlsBox.x);
  for (const box of [stageBox, controlsBox, lineBox]) {
    expect(box.y).toBeGreaterThanOrEqual(sceneHeaderBox.y + sceneHeaderBox.height);
    expect(box.y + box.height).toBeLessThanOrEqual(360);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(640);
  }
  expect(boxesOverlap(stageBox, controlsBox)).toBe(false);
  for (const action of [example, record, waveform, next]) {
    const actionBox = await boundingBoxOrThrow(action);
    expect(actionBox.y).toBeGreaterThanOrEqual(controlsBox.y);
    expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(controlsBox.y + controlsBox.height + 1);
    await expectFullyInViewport(page, action);
  }
  for (const action of [example, record, next]) {
    expect((await boundingBoxOrThrow(action)).height).toBeGreaterThanOrEqual(48);
  }
  await expect.poll(() => sceneControls.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }))).toEqual(expect.objectContaining({ scrollTop: 0 }));
  const controlScroll = await sceneControls.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(controlScroll.scrollHeight).toBeLessThanOrEqual(controlScroll.clientHeight + 1);
  await expect(page.getByRole("button", { name: "Play scene" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Scene line selectors" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

for (const recovery of [
  { action: "Save again", microphone: "", scenario: "upload-retry-held" },
  { action: "Record again", microphone: "", scenario: "upload-rejected" },
  { action: "Record line", microphone: "&parrotE2eMicrophone=denied", scenario: "empty" },
] as const) {
  test(`short landscape contains ${recovery.scenario} recovery without nested scrolling`, async ({ page }) => {
    await page.setViewportSize({ height: 360, width: 640 });
    await page.goto(`/dubs/five-little-ducks?parrotE2eDub=${recovery.scenario}${recovery.microphone}`);
    await confirmDub(page, "Start dubbing");
    await openScene(page, 1);
    await page.getByRole("button", { name: "Record line" }).click();
    if (recovery.microphone === "") {
      await page.getByRole("button", { name: "Stop recording" }).click();
    }

    const controls = page.getByRole("complementary", { name: "Scene line controls" });
    const feedback = page.getByRole("region", { name: "Recording feedback" });
    await expect(controls.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("button", { name: recovery.action })).toBeVisible();
    const alertFontSize = await controls.getByRole("alert").evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize));
    expect(alertFontSize).toBeGreaterThanOrEqual(12);
    const feedbackActions = feedback.getByRole("button");
    for (let index = 0; index < await feedbackActions.count(); index += 1) {
      const target = await boundingBoxOrThrow(feedbackActions.nth(index));
      expect(target.width).toBeGreaterThanOrEqual(48);
      expect(target.height).toBeGreaterThanOrEqual(48);
    }
    for (const region of [controls, feedback]) {
      const metrics = await region.evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop,
      }));
      expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 1);
      expect(metrics.scrollTop).toBe(0);
    }
    await expectFullyInViewport(page, page.getByRole("button", { name: recovery.action }));
    await expectNoHorizontalOverflow(page);
  });
}

function boxesOverlap(
  first: { height: number; width: number; x: number; y: number },
  second: { height: number; width: number; x: number; y: number },
) {
  return first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y;
}
