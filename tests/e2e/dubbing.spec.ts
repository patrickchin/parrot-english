import { expect, test, type Locator, type Page } from "@playwright/test";

type Rect = { height: number; width: number; x: number; y: number };
type DubStoreSnapshot = {
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
  await page.getByRole("button", { name: action }).click();
  await expectNoLearnerAdultControls(page);
}

async function expectNoLearnerAdultControls(page: Page) {
  await expect(
    page.getByRole("checkbox", {
      name: /I’m the grown-up|I am the learner's guardian/i,
    }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Grown-up options")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Delete (my )?dub/i }),
  ).toHaveCount(0);
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

test("guardian consent unlocks learner recording without exposing adult controls", async ({
  page,
}) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=not-granted");

  await expect(
    page
      .getByRole("region", { name: "Five Little Ducks" })
      .getByRole("paragraph"),
  ).toHaveText("Ask a grown-up to turn on voice dubbing in Guardian mode.");
  await expectNoLearnerAdultControls(page);
  const lockedGrant = await page.evaluate(async (consentVersion) => {
    const response = await fetch(
      "/api/dubs/five-little-ducks-v2/consent",
      {
        body: JSON.stringify({ accepted: true, consentVersion }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      },
    );
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
    .getByRole("group", { name: "Choose profile mode" })
    .getByRole("button", { name: "Guardian" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Unlock guardian mode" });
  await dialog.getByLabel("Password").fill("e2e-guardian-password");
  await dialog.getByRole("button", { name: "Unlock guardian mode" }).click();
  await page.getByRole("link", { name: "Manage voice dubbing" }).click();

  await page
    .getByRole("checkbox", { name: /I am the learner's guardian/i })
    .check();
  await page.getByRole("button", { name: "Allow voice dubbing" }).click();
  await expect(
    page.getByRole("heading", { name: "Voice dubbing is on" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Switch to learner and start dubbing" })
    .click();

  await expect(page).toHaveURL("/dubs/five-little-ducks");
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Profile for Mia, learner mode/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start dubbing" }).click();
  await page.getByRole("button", { name: "Record line 1" }).click();
  await page.getByRole("button", { name: "Stop recording line 1" }).click();
  await expect(page.getByRole("button", { name: "Next line" })).toBeVisible();
  await expectNoLearnerAdultControls(page);
});

test("keeps revoking consent unavailable on the learner surface", async ({
  page,
}) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=revoking");

  await expect(
    page
      .getByRole("region", { name: "Five Little Ducks" })
      .getByRole("paragraph"),
  ).toHaveText("Ask a grown-up to turn on voice dubbing in Guardian mode.");
  await expect(
    page.getByRole("button", { name: /Start dubbing|Continue dubbing/ }),
  ).toHaveCount(0);
  await expectNoLearnerAdultControls(page);
});

test("guides, records, replays, and resumes the 24-line dub at line 2", async ({
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
  await expect(page.getByText("Line 2 of 24", { exact: true })).toBeVisible();
  await expect.poll(async () =>
    (await dubStoreSnapshot(page))?.audioContextDoubleCloses,
  ).toBe(0);

  await page.reload();
  await enterStudio(page, "Continue dubbing");
  await expect(page.getByText("Line 2 of 24", { exact: true })).toBeVisible();
  await expect(page.getByText("Over the hill and far away.", { exact: true })).toBeVisible();
});

test("keeps the same take available when its first upload fails", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=upload-failed");
  await enterStudio(page, "Start dubbing");

  await page.getByRole("button", { name: "Record line 1" }).click();
  await page.getByRole("button", { name: "Stop recording line 1" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "not saved" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record again" })).toHaveCount(0);
  await page.getByRole("button", { name: "Save again" }).click();
  await expect(page.getByRole("button", { name: "Next line" })).toBeVisible();
});

test("mirrors the durable line-upload response contract", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expect(page.getByRole("button", { name: "Start dubbing" })).toBeVisible();

  const upload = await page.evaluate(async () => {
    const response = await fetch(
      "/api/dubs/five-little-ducks-v2/lines/line-1",
      {
        body: new Blob(
          [new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00])],
          { type: "audio/webm" },
        ),
        headers: { "Content-Type": "audio/webm" },
        method: "PUT",
      },
    );
    return {
      body: await response.text(),
      contentType: response.headers.get("Content-Type"),
      status: response.status,
    };
  });

  expect(upload.status).toBe(201);
  expect(upload.contentType).toBe("application/json");
  expect(JSON.parse(upload.body)).toEqual({
    lineId: "line-1",
    recordedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
  });
});

test("browser mock rejects obsolete v1 and out-of-range v2 routes", async ({
  page,
}) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expect(page.getByRole("button", { name: "Start dubbing" })).toBeVisible();

  const results = await page.evaluate(async () => {
    const requests: Array<[string, RequestInit]> = [
      ["/api/dubs/five-little-ducks-v1", {}],
      [
        "/api/dubs/five-little-ducks-v1/consent",
        {
          body: JSON.stringify({ accepted: true }),
          headers: { "Content-Type": "application/json" },
          method: "PUT",
        },
      ],
      [
        "/api/dubs/five-little-ducks-v2/lines/line-25",
        {
          body: new Blob(["clip"], { type: "audio/webm" }),
          headers: { "Content-Type": "audio/webm" },
          method: "PUT",
        },
      ],
      ["/api/dubs/five-little-ducks-v2/lines/line-25/audio", {}],
    ];
    return Promise.all(requests.map(async ([path, init]) => {
      const response = await fetch(path, init);
      return {
        body: await response.text(),
        cacheControl: response.headers.get("Cache-Control"),
        status: response.status,
      };
    }));
  });

  expect(results).toEqual(Array.from({ length: 4 }, () => ({
    body: JSON.stringify({ error: "not_found", message: "not_found" }),
    cacheControl: "private, no-store",
    status: 404,
  })));
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

  await expect(page.getByText("All 24 lines recorded", { exact: true })).toBeVisible();
  await expect(page.getByText("Your dub is ready!", { exact: true })).toBeVisible();
  await expect(page.getByText("Line 1 of 24", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Watch my dub" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Choose a saved line" })).toBeHidden();
  await page.getByLabel("Record another take").click();
  const lineSelect = page.getByRole("combobox", { name: "Choose a saved line" });
  await lineSelect.selectOption("line-5");
  await expect(lineSelect).toHaveValue("line-5");
  await expect(page.getByText("Your dub is ready!", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Record selected line" }).click();
  await expect(page.getByRole("button", { name: "Back to my dub" })).toBeVisible();
  await page.getByRole("button", { name: "Back to my dub" }).click();
  await expect(page.getByRole("button", { name: "Watch my dub" })).toBeVisible();
  await page.getByLabel("Record another take").click();
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
  await page.getByLabel("Record another take").click();
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
  await expect(page.getByText("Line 5 of 24", { exact: true })).toBeVisible();
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
  await expect(page.getByText("All 24 lines recorded", { exact: true })).toBeVisible();
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
  await page.getByLabel("Record another take").click();
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

test("keeps retake options closed and gives learner controls 48px touch targets", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
  await enterStudio(page, "Continue dubbing");

  const retakeOptions = page.getByLabel("Record another take");
  await expect(retakeOptions).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Choose a saved line" })).toBeHidden();
  expect((await visibleBox(retakeOptions)).height).toBeGreaterThanOrEqual(48);
  await retakeOptions.focus();
  await expect(retakeOptions).toBeFocused();
  await retakeOptions.press("Enter");
  await expect(page.getByRole("combobox", { name: "Choose a saved line" })).toBeVisible();
  await retakeOptions.press("Space");
  await expect(page.getByRole("combobox", { name: "Choose a saved line" })).toBeHidden();
  await retakeOptions.press("Enter");
  expect(
    (await visibleBox(page.getByRole("button", { name: "Record selected line" })))
      .height,
  ).toBeGreaterThanOrEqual(48);
  await expectNoLearnerAdultControls(page);
});

test("guardian mode deletes a complete private dub and revokes consent", async ({ page }) => {
  await page.goto(
    "/guardian/dubbing?parrotE2eDub=complete&parrotE2eGuardian=guardian",
  );

  await expect(
    page.getByRole("heading", { name: "Voice dubbing is on" }),
  ).toBeVisible();
  await expect(page.getByText("24 of 24 lines saved", { exact: true })).toBeVisible();
  await page
    .getByRole("button", {
      name: "Turn off voice dubbing and delete saved clips",
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Turn on private voice dubbing" }),
  ).toBeVisible();
});

const guardianResponsiveStates = [
  {
    action: "Turn off voice dubbing and delete saved clips",
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

      const back = page.getByRole("link", { name: "Back to guardian dashboard" });
      const account = page.getByRole("button", {
        name: /Profile for Mia, guardian mode/,
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
      expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(viewport.height);
      await expect
        .poll(() =>
          page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
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
  await page.getByRole("checkbox", {
    name: /I am the learner's guardian/,
  }).check();
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

  await page.getByRole("button", { name: "Finish removing voice clips" }).click();
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
  await page.getByRole("button", { name: "Finish removing voice clips" }).click();
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
    const response = await fetch(
      "/api/dubs/five-little-ducks-v2/consent",
      {
        body: JSON.stringify({ accepted: true, consentVersion }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      },
    );
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

  await page.getByRole("button", { name: "Finish removing voice clips" }).click();
  await expect(
    page.getByRole("heading", { name: "Turn on private voice dubbing" }),
  ).toBeVisible();
});

test("reconciles a lost cleanup response from durable status", async ({ page }) => {
  await page.goto(
    "/guardian/dubbing?parrotE2eDub=reset-delete-lost-response&parrotE2eGuardian=guardian",
  );
  await page.getByRole("button", { name: "Finish removing voice clips" }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "Your saved dub was not deleted.",
    }),
  ).toBeVisible();

  await expect(
    page.getByRole("heading", { name: "Turn on private voice dubbing" }),
  ).toBeVisible();
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
    await expect(page.getByText("Line 1 of 24", { exact: true })).toBeVisible();
    await expect(record).toBeVisible();
    await expect(record).toBeFocused();
  });
}

for (const viewport of [{ height: 568, width: 280 }, { height: 800, width: 1280 }]) {
  test(`keeps the intro action inside the initial viewport at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");

    const privacy = page.getByText(
      "Your voice clips stay private in this account.",
      { exact: true },
    );
    const start = page.getByRole("button", { name: "Start dubbing" });
    await expect(privacy).toBeVisible();
    await expect(start).toBeVisible();
    await expect(privacy).toBeInViewport();
    await expect(start).toBeInViewport();
    await expectNoLearnerAdultControls(page);
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
