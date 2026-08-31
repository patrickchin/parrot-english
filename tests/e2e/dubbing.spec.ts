import { expect, test, type Locator, type Page } from "@playwright/test";
import { DUB_LINES } from "../../src/dubbing/dub-script";
import { DUB_DEFINITIONS } from "../../src/dubbing/rhyme-catalog";

type DubStoreSnapshot = {
  audioContextDoubleCloses: number;
  backingStarts: Array<{ at: number; frequencyHz: number }>;
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

async function expectDubProject(page: Page) {
  await expect(page.getByRole("button", { name: "Play full video" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Start dubbing|Continue dubbing|Continue Scene/ }),
  ).toHaveCount(0);
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

async function expectTargetAtLeast48(locator: Locator) {
  const box = await boundingBoxOrThrow(locator);
  expect(box.width).toBeGreaterThanOrEqual(48);
  expect(box.height).toBeGreaterThanOrEqual(48);
}

async function expectSharedHeaderTarget(locator: Locator) {
  const box = await boundingBoxOrThrow(locator);
  expect(box.width).toBeGreaterThanOrEqual(48);
  expect(box.height).toBeGreaterThanOrEqual(48);
}

async function expectBelow(locator: Locator, boundary: Locator) {
  const [box, boundaryBox] = await Promise.all([
    boundingBoxOrThrow(locator),
    boundingBoxOrThrow(boundary),
  ]);
  expect(box.y).toBeGreaterThanOrEqual(boundaryBox.y + boundaryBox.height);
}

async function holdDubRecordingEnd(page: Page) {
  await page.evaluate(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("parrotE2eDubRecording", "held");
    window.history.replaceState(window.history.state, "", url);
  });
}

async function stopAndSave(page: Page) {
  await holdDubRecordingEnd(page);
  await page.getByRole("button", { name: /^Record (?:line|again)$/ }).click();
  await expect(page.getByRole("timer", { name: "Recording duration" })).toContainText("Recording");
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByRole("img", { name: "Your recording waveform" })).toBeVisible();
}

async function expectSavedTake(page: Page, uploadCount: number) {
  await expect(page.getByRole("img", { name: "Your recording waveform" })).toBeVisible();
  await expect.poll(async () => (await dubStoreSnapshot(page)).uploads).toHaveLength(uploadCount);
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

async function expectListenOnlyPlaybackFocus(page: Page) {
  await expect(page.getByText("You can watch the video now.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play full video" })).toBeFocused();
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
  await page.goto(
    "/dubs/five-little-ducks?parrotE2eDub=not-granted&parrotE2eLearners=multiple",
  );

  await expect(
    page.getByRole("main").getByRole("paragraph"),
  ).toContainText("You can watch the video now.");
  await expect(page.getByRole("button", { name: "Play full video" })).toBeVisible();
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

  await expect(
    page
      .getByRole("heading", { name: "Turn on private voice dubbing" })
      .locator("..")
      .getByText(
        /^All voice-dubbing rhymes save.*private voice clips/i,
      ),
  ).toBeVisible();

  await page.getByRole("checkbox", { name: /I am Mia's guardian/i }).check();
  await page.getByRole("button", { name: "Allow voice dubbing" }).click();
  await expect(
    page.getByRole("heading", { name: "Voice dubbing is on" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Switch to .*start dubbing/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Back to guardian dashboard" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to guardian dashboard" }).click();
  await page.getByRole("button", { name: "Switch to learner" }).click();
  const learnerDialog = page.getByRole("dialog", {
    name: "Who is learning now?",
  });
  await expect(learnerDialog).toBeVisible();
  await learnerDialog
    .getByRole("button", { name: "Start learner mode as Mia" })
    .click();
  await page.getByRole("link", { name: "Nursery rhymes" }).click();
  await page.getByRole("link", { name: "Five Little Ducks" }).click();

  await expect(page).toHaveURL("/dubs/five-little-ducks");
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Profile for Mia, learner mode/ }),
  ).toBeVisible();
  await expectDubProject(page);
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
  ).toContainText("You can watch the video now.");
  await expect(page.getByRole("button", { name: "Play full video" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Start dubbing|Continue dubbing/ }),
  ).toHaveCount(0);
  await expectNoLearnerAdultControls(page);
});

test("recording-disabled learners watch public video without private media", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=not-granted");
  await expect(page.getByText("You can watch the video now.", { exact: false })).toBeVisible();
  await expectNoLearnerAdultControls(page);
  await expect(page.getByRole("button", { name: /Record|Play my recording|Save/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Scene \d/ })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Scene video" })).toHaveCount(0);
  await expect(page.getByRole("progressbar", { name: "Project recording progress" })).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("");
  const storeBefore = await dubStoreSnapshot(page);
  expect(storeBefore.guideFetches).toEqual([]);
  expect(storeBefore.privateFetches).toEqual([]);
  expect(storeBefore.uploads).toEqual([]);
  expect(storeBefore.createdObjectUrls).toEqual([]);
  expect((await microphoneSnapshot(page)).requests).toBe(0);

  await page.getByRole("button", { name: "Play full video" }).click();
  await expect.poll(async () => (await dubStoreSnapshot(page)).guideFetches.length).toBeGreaterThan(0);

  const [store, microphoneAfter] = await Promise.all([
    dubStoreSnapshot(page),
    microphoneSnapshot(page),
  ]);
  expect(store.guideFetches.every((url) => url.startsWith("/assets/audio/"))).toBe(true);
  expect(store.privateFetches).toEqual([]);
  expect(store.uploads).toEqual([]);
  expect(store.createdObjectUrls).toEqual([]);
  expect(microphoneAfter.requests).toBe(0);
});

test("listen-only guide failure restores Play with one child-readable alert", async ({ page }) => {
  await page.route("**/assets/audio/*", (route) => route.fulfill({ status: 503 }));
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=not-granted");

  await page.getByRole("button", { name: "Play full video" }).click();
  const error = page.getByRole("alert").filter({
    hasText: "The video could not start. Try again.",
  });
  await expect(error).toHaveText("The video could not start. Try again.");
  await expect(page.getByRole("button", { name: "Play full video" })).toBeFocused();
  await expect(error).toHaveCount(1);

  const store = await dubStoreSnapshot(page);
  expect(store.privateFetches).toEqual([]);
  expect(store.uploads).toEqual([]);
  expect(store.createdObjectUrls).toEqual([]);
  expect((await microphoneSnapshot(page)).requests).toBe(0);
});

test("disabled dubbing mock records rejected private media attempts", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=revoking");
  await page.evaluate(() => sessionStorage.removeItem("parrot-e2e-learners:active-scenario"));
  await page.reload();
  const attempts = await page.evaluate(async () => Promise.all([
    fetch("/api/dubs/five-little-ducks-v2/lines/line-1/audio"),
    fetch("/api/dubs/five-little-ducks-v2/lines/line-1", {
      body: new Blob(["forbidden"], { type: "audio/webm" }),
      headers: { "Content-Type": "audio/webm" },
      method: "PUT",
    }),
  ]).then((responses) => responses.map(({ status }) => status)));

  expect(attempts).toEqual([409, 409]);
  const store = await dubStoreSnapshot(page);
  expect(store.privateFetches).toEqual([
    "/api/dubs/five-little-ducks-v2/lines/line-1/audio",
  ]);
  expect(store.uploads).toEqual([
    "/api/dubs/five-little-ducks-v2/lines/line-1",
  ]);
});

test("full-video startup failure restores its Play action", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=playback-setup-failed");
  await page.getByRole("button", { name: "Play full video" }).click();
  await expect(page.getByRole("alert").filter({
    hasText: "The video could not start. Try again.",
  })).toHaveText("The video could not start. Try again.");
  await expect(page.getByRole("button", { name: "Play full video" })).toBeFocused();
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
  await expect.soft(
    page.getByText(
      "81 of 81 clips saved; Mia can record and replace lines across all six nursery rhymes.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect.soft(
    page.getByText(
      "Manage Mia's private voice clips for all six nursery rhymes.",
      { exact: true },
    ),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Turn off Mia's voice dubbing and delete all nursery-rhyme clips",
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Turn on private voice dubbing" }),
  ).toBeVisible();
});

test("Guardian dubbing settings can load independent status for every rhyme ID", async ({
  page,
}) => {
  await page.goto(
    "/guardian/dubbing?parrotE2eDub=empty&parrotE2eGuardian=guardian",
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Voice dubbing" }),
  ).toBeVisible();

  const definitions = DUB_DEFINITIONS.map(({ id, lines }) => ({
    id,
    lineCount: lines.length,
  }));
  const statuses = await page.evaluate(async (rhymeDefinitions) => {
    const results = [];
    for (const { id: dubId } of rhymeDefinitions) {
      const response = await fetch(`/api/dubs/${dubId}`);
      const body = (await response.json()) as {
        dubId?: string;
        lines?: unknown[];
      };
      results.push({ body, status: response.status });
    }
    return results;
  }, definitions);

  expect(statuses).toHaveLength(definitions.length);
  for (const [index, definition] of definitions.entries()) {
    expect(statuses[index]).toMatchObject({
      body: { dubId: definition.id, lines: expect.any(Array) },
      status: 200,
    });
    expect(statuses[index]?.body.lines).toHaveLength(definition.lineCount);
  }
});

test("shared-consent deletion clears saved clips for both rhyme routes", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);
  await openScene(page, 1);
  await stopAndSave(page);
  await expect(page.getByText("Recorded ✓", { exact: true })).toBeVisible();

  await page.goto("/dubs/old-macdonald?parrotE2eDub=empty");
  await expectDubProject(page);
  await openScene(page, 1);
  await stopAndSave(page);
  await expect(page.getByText("Recorded ✓", { exact: true })).toBeVisible();

  await page.goto(
    "/guardian/dubbing?parrotE2eDub=empty&parrotE2eGuardian=guardian",
  );
  await page.getByRole("button", {
    name: "Turn off Mia's voice dubbing and delete all nursery-rhyme clips",
  }).click();
  await page.getByRole("checkbox", { name: /I am Mia's guardian/ }).check();
  await page.getByRole("button", { name: "Allow voice dubbing" }).click();
  await expect(
    page.getByRole("heading", { name: "Voice dubbing is on" }),
  ).toBeVisible();

  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);
  await expect(page.getByText("Ready to start", { exact: true })).toBeVisible();

  await page.goto("/dubs/old-macdonald?parrotE2eDub=empty");
  await expectDubProject(page);
  await expect(page.getByText("Ready to start", { exact: true })).toBeVisible();
});

const guardianResponsiveStates = [
  {
    action: "Turn off Mia's voice dubbing and delete all nursery-rhyme clips",
    heading: "Voice dubbing is on",
    scenario: "complete",
  },
  {
    action: "Allow voice dubbing",
    heading: "Turn on private voice dubbing",
    scenario: "not-granted",
  },
  {
    action: "Finish removing nursery-rhyme clips",
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
    .getByRole("button", { name: "Finish removing nursery-rhyme clips" })
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
    .getByRole("button", { name: "Finish removing nursery-rhyme clips" })
    .click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "Your saved nursery-rhyme voice clips were not deleted.",
    }),
  ).toBeVisible();

  await expect(
    page.getByRole("heading", { name: "Voice clip removal needs to finish" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Finish removing nursery-rhyme clips" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Voice clip removal needs to finish" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Finish removing nursery-rhyme clips" }),
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
    .getByRole("button", { name: "Finish removing nursery-rhyme clips" })
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
    .getByRole("button", { name: "Finish removing nursery-rhyme clips" })
    .click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "Your saved nursery-rhyme voice clips were not deleted.",
    }),
  ).toBeVisible();

  await expect(
    page.getByRole("heading", { name: "Turn on private voice dubbing" }),
  ).toBeVisible();
});

test("direct entry opens the project home instead of line 1", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);

  await expect(page.getByRole("region", { name: "Full video player" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play full video" })).toBeVisible();
  await expect(page.getByText("Ready to start", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Project recording progress" })).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByRole("progressbar", { name: "Project recording progress" })).toHaveAttribute("aria-valuetext", "Ready to start");
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("");
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Record line" })).toHaveCount(0);
  await expect(page.getByText("Five little ducks went out one day.", { exact: true })).toHaveCount(0);
});

test("Start and Continue open the earliest line that needs work", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await page.getByRole("button", { name: "Start with Scene 1" }).click();
  await expect(page.getByRole("heading", { name: DUB_LINES[0].text })).toBeFocused();

  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await page.getByRole("button", { name: "Continue with Scene 1" }).click();
  await expect(page.getByRole("heading", { name: DUB_LINES[3].text })).toBeFocused();
});

test("an empty project plays a fully generated draft", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);
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
  await expectDubProject(page);
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

test("opening a scene selects its first missing line while scenes remain selectable", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await expectDubProject(page);
  await openScene(page, 1);
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

test("scene navigation has previous and uses the shared header to return", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);
  await openScene(page, 1);

  const previous = page.getByRole("button", { name: "Previous line" });
  await expect(previous).toBeDisabled();
  await page.getByRole("button", { name: "Next line" }).click();
  await expect(page.getByRole("heading", { name: DUB_LINES[1].text })).toBeVisible();
  await expect(previous).toBeEnabled();
  await previous.click();
  await expect(page.getByRole("heading", { name: DUB_LINES[0].text })).toBeVisible();

  await page.getByRole("navigation", { name: "Page navigation" }).getByRole("button", { name: "Back to full video" }).click();
  await expect(page.getByRole("button", { name: "Play full video" })).toBeVisible();
  await page.getByRole("link", { name: "Back to Nursery rhymes" }).click();
  await expect(page).toHaveURL("/dubs");
});

test("next, finish scene celebrates a completed partial scene", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await expectDubProject(page);
  await openScene(page, 1);
  await stopAndSave(page);
  await page.getByRole("button", { name: "Next, finish scene" }).click();
  await expect(page.getByRole("button", { name: "Play full video" })).toBeVisible();
  await expect(page.getByText("Scene 1 is ready — great singing!", { exact: true })).toBeVisible();
});

test("scene recording follows one linear Choicer-style action flow", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);
  await openScene(page, 1);

  await expect(page.getByRole("button", { name: "Record line" })).toBeVisible();
  await expect(page.getByText("Line 1 of 4", { exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Scene line controls" }).locator("details, summary")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Scene line selectors" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Play scene" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Hear line" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next line" })).toBeVisible();
  await expect(page.getByText("Melody length: 0:04", { exact: true })).toBeVisible();
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

test("Old MacDonald route loads its public studio and opens the first scene", async ({
  page,
}) => {
  await page.goto("/dubs/old-macdonald?parrotE2eDub=empty");

  await expect(
    page.getByRole("heading", { name: "Old MacDonald Had a Farm" }),
  ).toBeVisible();

  const status = await page.evaluate(async () => {
    const response = await fetch("/api/dubs/old-macdonald-v1");
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) {
      throw new Error("Expected Old MacDonald status payload.");
    }
    const payload = body as { dubId?: unknown; lines?: unknown };
    return {
      dubId: payload.dubId,
      linesLength: Array.isArray(payload.lines) ? payload.lines.length : -1,
    };
  });

  expect(status.dubId).toBe("old-macdonald-v1");
  expect(status.linesLength).toBe(35);
  await expectDubProject(page);
  await expect(
    page.getByRole("region", { name: "Full video player" }),
  ).toBeVisible();
  await expect(page.getByText("Ready to start", { exact: true })).toBeVisible();
  await openScene(page, 1);
  await expect(
    page.getByRole("heading", {
      name: "Old MacDonald had a farm, E-I-E-I-O!",
    }),
  ).toBeVisible();
});

test("Old MacDonald full playback is observed by the browser guide mock", async ({ page }) => {
  await page.goto("/dubs/old-macdonald?parrotE2eDub=empty");
  await expectDubProject(page);
  await page.getByRole("button", { name: "Play full video" }).click();

  await expect.poll(async () => (await dubStoreSnapshot(page)).guideFetches).toContain(
    "/assets/audio/old-macdonald-v1-guide-line-1.mp3",
  );
});

test("the Old MacDonald desktop project keeps the video and compact scene strip in one view", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto("/dubs/old-macdonald?parrotE2eDub=empty");
  await expectDubProject(page);

  const workspace = page.getByRole("region", { name: "Dub project workspace" });
  const player = page.getByRole("region", { name: "Full video player" });
  const stage = player.locator("img");
  await expect(stage).toHaveCount(1);
  const dock = page.getByRole("navigation", { name: "Scenes" });
  const playButton = page.getByRole("button", { name: "Play full video" });
  const [workspaceBox, playerBox, stageBox, dockBox, playBox] = await Promise.all([
    boundingBoxOrThrow(workspace),
    boundingBoxOrThrow(player),
    boundingBoxOrThrow(stage),
    boundingBoxOrThrow(dock),
    boundingBoxOrThrow(playButton),
  ]);

  expect(workspaceBox.width).toBeGreaterThanOrEqual(1440 * 0.9);
  expect(stageBox.width).toBeLessThanOrEqual(playerBox.width);
  expect(stageBox.height).toBeLessThanOrEqual(playerBox.height);
  expect(playerBox.x + playerBox.width).toBeLessThanOrEqual(dockBox.x);
  expect(playBox.y).toBeGreaterThanOrEqual(playerBox.y + playerBox.height);
  expect(boxesOverlap(playerBox, playBox)).toBe(false);
  await expect(player).toBeInViewport();
  await expect(dock).toBeInViewport();
  await expect(dock.getByRole("button")).toHaveCount(5);
  await expectNoHorizontalOverflow(page);

  await openScene(page, 1);
  const sceneWorkspace = page.getByRole("region", { name: "Scene editor workspace" });
  const sceneStage = page.getByRole("region", { name: "Scene video" });
  const sceneControls = page.getByRole("complementary", { name: "Scene line controls" });
  const [sceneWorkspaceBox, sceneStageBox, sceneControlsBox] = await Promise.all([
    boundingBoxOrThrow(sceneWorkspace),
    boundingBoxOrThrow(sceneStage),
    boundingBoxOrThrow(sceneControls),
  ]);

  expect(sceneWorkspaceBox.width).toBeGreaterThanOrEqual(1440 * 0.9);
  expect(sceneStageBox.x + sceneStageBox.width).toBeLessThanOrEqual(sceneControlsBox.x);
  expect(sceneStageBox.y + sceneStageBox.height).toBeGreaterThan(sceneControlsBox.y);
  await expect(sceneStage).toBeInViewport();
  await expect(sceneControls).toBeInViewport();
  await expectNoHorizontalOverflow(page);
});

test("the Old MacDonald narrow route keeps project and scene controls reachable", async ({
  page,
}) => {
  await page.setViewportSize({ height: 568, width: 280 });
  await page.goto("/dubs/old-macdonald?parrotE2eDub=empty");
  await expectDubProject(page);

  const title = page.getByRole("heading", { name: "Old MacDonald Had a Farm" });
  await expect(title).toBeVisible();
  await expectFullyInViewport(page, title);
  const [playerBox, playBox] = await Promise.all([
    boundingBoxOrThrow(page.getByRole("region", { name: "Full video player" })),
    boundingBoxOrThrow(page.getByRole("button", { name: "Play full video" })),
  ]);
  expect(playBox.y).toBeGreaterThanOrEqual(playerBox.y + playerBox.height);
  expect(boxesOverlap(playerBox, playBox)).toBe(false);
  await expectLearnerTargetsAtLeast48px(page);
  await expectNoHorizontalOverflow(page);

  await openScene(page, 1);
  const stage = page.getByRole("region", { name: "Scene video" });
  const lyric = page.getByRole("heading", { name: "Old MacDonald had a farm, E-I-E-I-O!" });
  const controls = page.getByRole("complementary", { name: "Scene line controls" });
  const example = page.getByRole("button", { name: "Hear line" });
  const record = page.getByRole("button", { name: "Record line" });
  const next = page.getByRole("button", { name: "Next line" });
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
  await expect(page.getByText("Line 1 of 7", { exact: true })).toHaveAttribute("aria-current", "step");
  await expect(page.getByRole("region", { name: "Scene line selectors" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Play scene" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Scene lyrics" })).toHaveCount(0);
  await expectLearnerTargetsAtLeast48px(page);
  await expectNoHorizontalOverflow(page);
});

test("the Old MacDonald short-landscape route keeps project and scene actions clear of the header", async ({
  page,
}) => {
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto("/dubs/old-macdonald?parrotE2eDub=empty");
  await expectDubProject(page);

  const routeHeader = page.getByRole("navigation", { name: "Page navigation" });
  const player = page.getByRole("region", { name: "Full video player" });
  const dock = page.getByRole("navigation", { name: "Scenes" });
  const playFull = page.getByRole("button", { name: "Play full video" });
  const firstScene = dock.getByRole("button", {
    name: "Scene 1, Cows on the farm, Ready to start",
  });
  const secondScene = dock.getByRole("button", {
    name: "Scene 2, Ducks on the farm, Ready to start",
  });
  const [headerBox, playerBox, dockBox, playFullBox, firstSceneBox, secondSceneBox] = await Promise.all([
    boundingBoxOrThrow(routeHeader),
    boundingBoxOrThrow(player),
    boundingBoxOrThrow(dock),
    boundingBoxOrThrow(playFull),
    boundingBoxOrThrow(firstScene),
    boundingBoxOrThrow(secondScene),
  ]);

  for (const box of [playerBox, dockBox, playFullBox, firstSceneBox, secondSceneBox]) {
    expect(box.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(640);
  }
  expect(playFullBox.height).toBeGreaterThanOrEqual(48);
  expect(firstSceneBox.height).toBeGreaterThanOrEqual(48);
  expect(secondSceneBox.height).toBeGreaterThanOrEqual(48);
  expect(boxesOverlap(playerBox, dockBox)).toBe(false);
  expect(boxesOverlap(playerBox, playFullBox)).toBe(false);
  expect(boxesOverlap(playerBox, firstSceneBox)).toBe(false);
  expect(boxesOverlap(playerBox, secondSceneBox)).toBe(false);
  expect(boxesOverlap(firstSceneBox, secondSceneBox)).toBe(false);
  expect(Math.abs(firstSceneBox.y - secondSceneBox.y)).toBeLessThanOrEqual(1);
  expect(boxesOverlap(dockBox, playFullBox)).toBe(false);
  await expectNoHorizontalOverflow(page);

  await firstScene.click();
  const sceneStage = page.getByRole("region", { name: "Scene video" });
  const sceneControls = page.getByRole("complementary", { name: "Scene line controls" });
  const lineHeading = page.getByRole("heading", {
    name: "Old MacDonald had a farm, E-I-E-I-O!",
  });
  const example = page.getByRole("button", { name: "Hear line" });
  const record = page.getByRole("button", { name: "Record line" });
  const next = page.getByRole("button", { name: "Next line" });
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

test("recording shows elapsed time, saves, and leaves Next in its fixed action slot", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);
  await openScene(page, 3);
  await page.getByRole("button", { name: "Next line" }).click();
  await page.getByRole("button", { name: "Next line" }).click();
  const controls = page.getByRole("complementary", { name: "Scene line controls" });
  const idleRecordBox = await visibleBoxWithin(page.getByRole("button", { name: "Record line" }), controls);
  const idleNextBox = await visibleBoxWithin(page.getByRole("button", { name: "Next line" }), controls);
  await holdDubRecordingEnd(page);
  await page.getByRole("button", { name: "Record line" }).click();
  const timer = page.getByRole("timer", { name: "Recording duration" });
  const progress = page.getByRole("progressbar", { name: "Recording time" });
  await expect(timer).toContainText("0:04");
  await expect(progress).toHaveAttribute("aria-valuemax", "4000");
  await expect.poll(async () => Number(await progress.getAttribute("aria-valuenow"))).toBeGreaterThan(500);
  const guideWaveform = page.getByRole("img", { name: "Original audio waveform" });
  const liveWaveform = page.getByRole("img", { name: "Your live recording waveform" });
  expectSameActionSlot(await visibleBox(liveWaveform), await visibleBox(guideWaveform));
  await expect(page.getByText(/get ready|3…|2…|1…/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expectSavedTake(page, 1);

  await expect(page.getByRole("img", { name: "Your recording waveform" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play my recording" })).toBeVisible();
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
  await expectDubProject(page);
  await openScene(page, 1);
  await stopAndSave(page);
  await page.getByRole("button", { name: "Back to full video" }).click();
  await expect(page.getByRole("button", { name: "Scene 1, Five little ducks, 1 of 4 lines ready" })).toBeVisible();
  await expect(page.getByText("1 of 24 lines ready", { exact: true })).toBeVisible();

  await page.reload();
  await expectDubProject(page);
  await expect(page.getByRole("button", { name: "Scene 1, Five little ducks, 1 of 4 lines ready" })).toBeVisible();
});

test("a replacement overwrites the chosen canonical slot", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
  await expectDubProject(page);
  await openScene(page, 2);
  await expect(page.getByText("Line 1 of 4", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", {
    name: "Four little ducks went out one day.",
  })).toBeVisible();
  await stopAndSave(page);
  await expect(page.getByText("Recorded ✓", { exact: true })).toBeVisible();
  await expect.poll(async () => (await dubStoreSnapshot(page)).uploads).toEqual([
    "/api/dubs/five-little-ducks-v2/lines/line-5",
  ]);
});

test("a saved take keeps its local review URL while the line stays active", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);
  await openScene(page, 1);
  await stopAndSave(page);

  await expect.poll(async () => (await dubStoreSnapshot(page)).createdObjectUrls).toHaveLength(1);
  const [objectUrl] = (await dubStoreSnapshot(page)).createdObjectUrls;
  expect(revocationCount(await dubStoreSnapshot(page), objectUrl)).toBe(0);

  await expect(page.getByRole("img", { name: "Your recording waveform" })).toBeVisible();
  expect(revocationCount(await dubStoreSnapshot(page), objectUrl)).toBe(0);

  await page.getByRole("button", { name: "Play my recording" }).click();
  await expect(page.getByRole("button", { name: "Stop my recording" })).toBeVisible();
});

test("saved recording replay uses private audio with a Stop action", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete&parrotE2eDubPlayback=held");
  await expectDubProject(page);
  await openScene(page, 1);

  await expect(page.getByRole("button", { name: "Record again" })).toBeVisible();
  await page.getByRole("button", { name: "Play my recording" }).click();
  await expect.poll(async () => (await dubStoreSnapshot(page)).privateFetches).toContain(
    "/api/dubs/five-little-ducks-v2/lines/line-1/audio",
  );
  await expect(page.getByRole("button", { name: "Stop my recording" })).toBeVisible();
  await page.getByRole("button", { name: "Stop my recording" }).click();
  await expect.poll(async () => (await dubStoreSnapshot(page)).guideFetches).toEqual([]);
});

test("saved recording consent loss shows listen-only playback immediately", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
  await expectDubProject(page);
  await openScene(page, 1);
  await page.evaluate(() => {
    const currentFetch = window.fetch;
    window.fetch = async (input, init) => {
      const source = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      if (new URL(source, window.location.href).pathname.endsWith("/lines/line-1/audio")) {
        return Response.json({ error: "dubbing_not_enabled" }, { status: 403 });
      }
      return currentFetch(input, init);
    };
  });

  await page.getByRole("button", { name: "Play my recording" }).click();
  await expect(page.getByText(
    "You can watch the video now.",
    { exact: false },
  )).toBeVisible();
  await expect(page.getByRole("button", { name: "Record again" })).toHaveCount(0);
  await expectListenOnlyPlaybackFocus(page);
});

test("full-video consent loss focuses listen-only playback", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
  await expectDubProject(page);
  await page.evaluate(() => {
    const currentFetch = window.fetch;
    window.fetch = async (input, init) => {
      const source = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      if (new URL(source, window.location.href).pathname.endsWith("/audio")) {
        return Response.json({ error: "dubbing_not_enabled" }, { status: 403 });
      }
      return currentFetch(input, init);
    };
  });

  await page.getByRole("button", { name: "Play full video" }).click();
  await expectListenOnlyPlaybackFocus(page);
});

test("stale focus work cannot overtake consent-loss playback focus", async ({ page }) => {
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
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
  await expectDubProject(page);
  await openScene(page, 1);
  await page.evaluate(() => {
    const currentFetch = window.fetch;
    window.fetch = async (input, init) => {
      const source = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      if (new URL(source, window.location.href).pathname.endsWith("/lines/line-1/audio")) {
        return Response.json({ error: "dubbing_not_enabled" }, { status: 403 });
      }
      return currentFetch(input, init);
    };
  });

  await page.getByRole("button", { name: "Play my recording" }).click();
  await expect(page.getByText("You can watch the video now.", { exact: false })).toBeVisible();
  await page.evaluate(() => {
    (window as typeof window & { __flushAnimationFrames(): void }).__flushAnimationFrames();
  });
  await expect(page.getByRole("button", { name: "Play full video" })).toBeFocused();
});

test("upload consent loss focuses listen-only playback", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);
  await openScene(page, 1);
  await page.evaluate(() => {
    const currentFetch = window.fetch;
    window.fetch = async (input, init) => {
      const source = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      if (
        new URL(source, window.location.href).pathname.endsWith("/lines/line-1")
        && init?.method === "PUT"
      ) {
        return Response.json({ error: "dubbing_not_enabled" }, { status: 403 });
      }
      return currentFetch(input, init);
    };
  });

  await holdDubRecordingEnd(page);
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("timer", { name: "Recording duration" })).toContainText("Recording");
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expectListenOnlyPlaybackFocus(page);
});

test("saved recording failure keeps its error readable beside take controls on a narrow phone", async ({ page }) => {
  await page.setViewportSize({ height: 480, width: 320 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=audio-fetch-failed");
  await expectDubProject(page);
  await openScene(page, 1);

  await page.getByRole("button", { name: "Play my recording" }).click();
  const error = page.getByRole("alert", {
    name: "Your recording could not be played. Record the line again.",
  });
  await expect(error).toHaveText("Your recording could not be played. Record the line again.");
  const wordFragments = await error.evaluate((element) => {
    const text = element.textContent ?? "";
    const node = [...element.childNodes].find(({ nodeType }) => nodeType === Node.TEXT_NODE);
    if (!node) throw new Error("Expected the error to have text.");
    let offset = 0;
    return text.match(/\S+/g)?.map((word) => {
      const start = text.indexOf(word, offset);
      offset = start + word.length;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + word.length);
      return { fragments: range.getClientRects().length, word };
    }) ?? [];
  });
  expect(wordFragments).toEqual([
    { fragments: 1, word: "Your" },
    { fragments: 1, word: "recording" },
    { fragments: 1, word: "could" },
    { fragments: 1, word: "not" },
    { fragments: 1, word: "be" },
    { fragments: 1, word: "played." },
    { fragments: 1, word: "Record" },
    { fragments: 1, word: "the" },
    { fragments: 1, word: "line" },
    { fragments: 1, word: "again." },
  ]);
  await expect(page.getByRole("button", { name: "Record again" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play my recording" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Scene video" })).toBeVisible();
  await expectLearnerTargetsAtLeast48px(page);
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "Back to full video" }).click();
  await expect(page.getByRole("button", {
    name: "Scene 1, Five little ducks, Needs a new take",
  })).toBeVisible();
});

test("record again pending preview takes precedence without a private GET", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty&parrotE2eDubPlayback=held");
  await expectDubProject(page);
  await openScene(page, 1);
  await stopAndSave(page);
  const [previewUrl] = (await dubStoreSnapshot(page)).createdObjectUrls;

  await page.getByRole("button", { name: "Play my recording" }).click();
  await expect(page.getByRole("button", { name: "Stop my recording" })).toBeVisible();
  await expect.poll(async () => (await dubStoreSnapshot(page)).privateFetches).toEqual([]);
  await page.getByRole("button", { name: "Stop my recording" }).click();
  expect(revocationCount(await dubStoreSnapshot(page), previewUrl)).toBe(0);
});

test("replacing a take revokes the previous object URL exactly once", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);
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
  await expectDubProject(page);
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
  await expectDubProject(page);
  await openScene(page, 1);
  await stopAndSave(page);
  const [objectUrl] = (await dubStoreSnapshot(page)).createdObjectUrls;

  await page.getByRole("navigation", { name: "Page navigation" }).getByRole("button", { name: "Back to full video" }).click();
  await page.getByRole("link", { name: "Back to Nursery rhymes" }).click();
  await expect(page).toHaveURL(/\/dubs$/);
  await expect.poll(async () =>
    revocationCount(await dubStoreSnapshot(page), objectUrl)).toBe(1);
});

test("retryable save survives guide and Blob replay while retry remains exclusive", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=upload-retry-held&parrotE2eDubPlayback=held");
  await expectDubProject(page);
  await openScene(page, 1);
  await holdDubRecordingEnd(page);
  await page.getByRole("button", { name: "Record line" }).click();
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "not saved" })).toBeVisible();
  await expect(page.getByText("Not saved", { exact: true })).toBeVisible();
  await expect(page.getByText("Recorded ✓", { exact: true })).toHaveCount(0);
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

  await page.getByRole("button", { name: "Play my recording" }).click();
  await expect(page.getByRole("button", { name: "Stop my recording" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText(
    "Playing your recording for Scene 1, line 1.",
  );
  await expect(page.getByRole("button", { name: "Save again" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "not saved" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to full video" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next line" })).toBeDisabled();

  await page.getByRole("button", { name: "Save again" }).click();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("Saving your take…");
  await expect(page.getByRole("button", { name: "Saving recording" })).toBeDisabled();
  await expect(page.getByText("Saving your voice…", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hear line" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Play my recording" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save again" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next line" })).toBeDisabled();
  await releaseDubOperation(page, "upload");
  await expect(page.getByRole("button", { name: "Save again" })).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Your recording waveform" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play my recording" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Next line" })).toBeEnabled();
});

for (const viewport of [
  { width: 280, height: 568 },
  { width: 320, height: 568 },
  { width: 390, height: 844 },
]) {
  test(`retryable save keeps Save again touch-sized at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/dubs/five-little-ducks?parrotE2eDub=upload-retry-held");
    await expectDubProject(page);
    await openScene(page, 1);
    await holdDubRecordingEnd(page);
    await page.getByRole("button", { name: "Record line" }).click();
    await page.getByRole("button", { name: "Stop recording" }).click();

    const retry = page.getByRole("button", { name: "Save again" });
    await expect(retry).toBeVisible();
    await expectTargetAtLeast48(retry);
    await expectNoHorizontalOverflow(page);
  });
}

test("a rejected upload discards the take and offers Record again", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=upload-rejected");
  await expectDubProject(page);
  await openScene(page, 1);
  await holdDubRecordingEnd(page);
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
  await expectDubProject(page);
  await page.getByRole("button", { name: "Play full video" }).click();
  await expect(page.getByRole("button", { name: "Stop full video" })).toBeVisible();
  await expect(page.getByText("23 of 24 lines ready", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", {
    name: "Scene 2, Four little ducks, Needs a new take",
  })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fix Scene 2" })).toBeVisible();
  await expect.poll(async () => (await dubStoreSnapshot(page)).guideFetches).toContain(
    "/assets/audio/five-little-ducks-v2-guide-line-5.mp3",
  );
  await expect(page.getByRole("button", { name: "Play full video" })).toBeVisible({ timeout: 8_000 });
  await openScene(page, 2);
  await stopAndSave(page);
  await page.getByRole("button", { name: "Back to full video" }).click();
  await expect(page.getByRole("button", {
    name: "Scene 2, Four little ducks, Scene ready",
  })).toBeVisible();
});

test("a double-source failure names the exact slot while video and music continue", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=both-source-failed");
  await expectDubProject(page);
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
  await expectDubProject(page);
  await page.getByRole("button", { name: "Play full video" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "could not play" })).toHaveText(
    "Scene 2, line 1 could not play. The video will continue without it. " +
      "Scene 2, line 4 could not play. The video will continue without it.",
  );
  await expect(page.getByRole("button", { name: "Stop full video" })).toBeVisible();
});

test("linear line navigation cancels guide playback", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty&parrotE2eDubPlayback=held");
  await expectDubProject(page);
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
  await expectDubProject(page);
  await openScene(page, 1);
  await holdDubRecordingEnd(page);
  await page.getByRole("button", { name: "Hear line" }).click();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText(
    "Playing example for Scene 1, line 1.",
  );
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("timer", { name: "Recording duration" })).toContainText("Recording");
  await page.waitForTimeout(300);
  await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hear line" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next line" })).toBeDisabled();
  await expect.poll(async () => (await dubStoreSnapshot(page)).audioContextDoubleCloses).toBe(0);
  await page.getByRole("button", { name: "Stop recording" }).click();
});

test("automatically stops and saves at the selected four-second phrase", async ({ page }) => {
  test.setTimeout(15_000);
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);
  await openScene(page, 1);
  await expect(page.getByText("Melody length: 0:04", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("progressbar", { name: "Recording time" })).toHaveAttribute("aria-valuemax", "4000");
  await expect(page.getByRole("timer", { name: "Recording duration" }))
    .toContainText("Recording with melody");
  await expectSavedTake(page, 1);
  await expect.poll(async () => (await dubStoreSnapshot(page)).backingStarts.length)
    .toBeGreaterThan(0);
});

test("Old MacDonald records on its two- and eight-second phrase windows", async ({ page }) => {
  await page.goto("/dubs/old-macdonald?parrotE2eDub=empty");
  await expectDubProject(page);
  await openScene(page, 1);
  await expect(page.getByText("Melody length: 0:08", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("progressbar", { name: "Recording time" }))
    .toHaveAttribute("aria-valuemax", "8000");
  await expectSavedTake(page, 1);
  await expect.poll(async () => (await dubStoreSnapshot(page)).backingStarts.length)
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Next line" }).click();
  await page.getByRole("button", { name: "Next line" }).click();
  await expect(page.getByText("Melody length: 0:02", { exact: true })).toBeVisible();
  const backingCount = (await dubStoreSnapshot(page)).backingStarts.length;
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("progressbar", { name: "Recording time" }))
    .toHaveAttribute("aria-valuemax", "2000");
  await expect.poll(async () => (await dubStoreSnapshot(page)).backingStarts.length)
    .toBeGreaterThan(backingCount);
  await expectSavedTake(page, 2);
});

for (const definition of DUB_DEFINITIONS) {
  test(`${definition.title} starts its authored backing while recording`, async ({ page }) => {
    await page.goto(`${definition.route}?parrotE2eDub=empty`);
    await page.getByRole("button", { name: "Play full video" }).waitFor();
    await page.getByRole("button", { name: /^Scene 1,/ }).click();
    await expect(page.getByText(/^Melody length: 0:/)).toBeVisible();
    await page.getByRole("button", { name: "Record line" }).click();
    await expectSavedTake(page, 1);
    await expect.poll(async () => (await dubStoreSnapshot(page)).backingStarts.length)
      .toBeGreaterThan(0);
  });
}

test("held microphone readiness keeps every scene action locked behind one live status", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty&parrotE2eMicrophone=delayed");
  await expectDubProject(page);
  await openScene(page, 1);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const controls = page.getByRole("complementary", { name: "Scene line controls" });
  const idleRecordBox = await visibleBoxWithin(page.getByRole("button", { name: "Record line" }), controls);
  const idleNextBox = await visibleBoxWithin(page.getByRole("button", { name: "Next line" }), controls);
  await holdDubRecordingEnd(page);
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
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("Recording with melody…");
  await expect(page.getByRole("timer", { name: "Recording duration" })).toContainText("0:04");
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
  await expectDubProject(page);
  await openScene(page, 1);
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("button", { name: "Starting microphone" })).toBeVisible();
  await expect.poll(() => microphoneSnapshot(page)).toMatchObject({ pending: 1, requests: 1 });
  await page.evaluate(() => {
    window.history.pushState(null, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
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
  await expectDubProject(page);
  await openScene(page, 1);
  await holdDubRecordingEnd(page);
  await page.getByRole("button", { name: "Record line" }).click();
  await expect.poll(() => microphoneSnapshot(page)).toMatchObject({ pending: 1, requests: 1 });
  await resolveDelayedMicrophone(page);
  await expect(page.getByRole("timer", { name: "Recording duration" })).toContainText("Recording");
  await expect.poll(() => microphoneSnapshot(page)).toMatchObject({
    requests: 1,
    resolved: 1,
    stoppedTracks: 0,
  });

  await page.evaluate(() => {
    window.history.pushState(null, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });

  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => microphoneSnapshot(page)).toMatchObject({ stoppedTracks: 1 });
  await expect.poll(async () => (await dubStoreSnapshot(page)).uploads).toHaveLength(0);
});

for (const microphone of ["denied", "unsupported"] as const) {
  test(`keeps the current line after a ${microphone} microphone`, async ({ page }) => {
    await page.goto(`/dubs/five-little-ducks?parrotE2eDub=empty&parrotE2eMicrophone=${microphone}`);
    await expectDubProject(page);
    await openScene(page, 4);
    await page.getByRole("button", { name: "Next line" }).click();
    await page.getByRole("button", { name: "Record line" }).click();
    const message = microphone === "denied"
      ? "The microphone is off. Ask a grown-up to allow it, then try again."
      : "This browser cannot record yet. Try another device or browser.";
    await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: message })).toHaveCount(1);
    await expect(page.getByRole("status", { name: "Dub updates" })).not.toContainText(message);
    await expect(page.getByText("Line 2 of 4", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Over the hill and far away." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Record line" })).toBeFocused();
  });
}

test("a held Guardian delete is exclusive until removal succeeds", async ({ page }) => {
  await page.goto("/dubs/old-macdonald?parrotE2eDub=delete-held");
  await expectDubProject(page);
  await expect(page.getByText("3 of 35 lines ready", { exact: true })).toBeVisible();

  await page.goto(
    "/guardian/dubbing?parrotE2eDub=delete-held&parrotE2eGuardian=guardian",
  );
  await page
    .getByRole("button", {
      name: "Turn off Mia's voice dubbing and delete all nursery-rhyme clips",
    })
    .click();

  await expect(
    page.getByRole("button", { name: "Removing voice clips…" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /Switch to .*start dubbing/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Back to guardian dashboard" }),
  ).toBeVisible();

  await releaseDubOperation(page, "delete");
  await expect(
    page.getByRole("heading", { name: "Turn on private voice dubbing" }),
  ).toBeVisible();

  await page.getByRole("checkbox", { name: /I am Mia's guardian/i }).check();
  await page.getByRole("button", { name: "Allow voice dubbing" }).click();
  await expect(
    page.getByRole("heading", { name: "Voice dubbing is on" }),
  ).toBeVisible();

  await page.goto("/dubs/old-macdonald?parrotE2eDub=delete-held");
  await expectDubProject(page);
  await expect(page.getByText("Ready to start", { exact: true })).toBeVisible();
});

test("a failed Guardian delete stays actionable only in Guardian mode", async ({
  page,
}) => {
  await page.goto(
    "/guardian/dubbing?parrotE2eDub=delete-failed&parrotE2eGuardian=guardian",
  );
  await page
    .getByRole("button", {
      name: "Turn off Mia's voice dubbing and delete all nursery-rhyme clips",
    })
    .click();

  await expect(
    page.getByRole("alert").filter({
      hasText:
        "Your saved nursery-rhyme voice clips were not deleted.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Voice clip removal needs to finish" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Finish removing nursery-rhyme clips" }),
  ).toBeEnabled();
});

test("every dubbing route state stays horizontally contained", async ({ page }) => {
  await page.setViewportSize({ height: 568, width: 280 });

  await page.goto("/dubs/five-little-ducks?parrotE2eDub=load-held");
  await expect(page.getByRole("button", { name: "Loading your private dub…" })).toBeVisible();
  await expectDubRouteContained(page);

  await page.goto("/dubs/five-little-ducks?parrotE2eDub=reset-interrupted");
  await expect(
    page.getByRole("main").getByRole("paragraph"),
  ).toContainText("You can watch the video now.");
  await expectNoLearnerAdultControls(page);
  await expectDubRouteContained(page);

  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);
  await expectDubRouteContained(page);
  await openScene(page, 1);
  await expectDubRouteContained(page);
});

test("a narrow phone keeps the longest line actions in one clear scroll path", async ({ page }) => {
  await page.setViewportSize({ height: 568, width: 280 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await expectDubProject(page);
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

test("reduced-motion playback stop and guide cleanup stay idempotent", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
  await expectDubProject(page);
  await page.getByRole("button", { name: "Play full video" }).click();
  await expect(page.getByRole("button", { name: "Stop full video" })).toBeVisible();
  await page.getByRole("button", { name: "Stop full video" }).click();
  await expect(page.getByRole("button", { name: "Play full video" })).toBeFocused();
  await openScene(page, 1);
  const hearLine = page.getByRole("button", { name: "Hear line" });
  await hearLine.click();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText(
    "Playing example for Scene 1, line 1.",
  );
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText(
    "Scene 1, line 1 selected. Recorded.",
  );
  await expect(hearLine).toBeFocused();
  await expect.poll(async () => (await dubStoreSnapshot(page)).audioContextDoubleCloses).toBe(0);
});

for (const project of [
  {
    route: "/dubs/five-little-ducks",
    sceneTitles: [
      "Five little ducks",
      "Four little ducks",
      "Three little ducks",
      "Two little ducks",
      "One little duck",
      "Sad mother duck",
    ],
  },
  {
    route: "/dubs/old-macdonald",
    sceneTitles: [
      "Cows on the farm",
      "Ducks on the farm",
      "Pigs on the farm",
      "A dog on the farm",
      "Sheep on the farm",
    ],
  },
] as const) {
  test(`${project.route} aligns its generated player and titled scene panel`, async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 1280 });
    await page.goto(`${project.route}?parrotE2eDub=empty`);
    await expectDubProject(page);

    const player = page.getByRole("region", { name: "Full video player" });
    const scenePanel = page.getByRole("complementary", { name: "Scene selection" });
    const scenes = page.getByRole("navigation", { name: "Scenes" });
    const [playerBox, scenePanelBox] = await Promise.all([
      boundingBoxOrThrow(player),
      boundingBoxOrThrow(scenePanel),
    ]);
    expect(Math.abs(playerBox.y - scenePanelBox.y)).toBeLessThanOrEqual(2);

    const images = scenes.locator("img");
    await expect(images).toHaveCount(project.sceneTitles.length);
    for (const image of await images.all()) {
      await expect(image).toBeVisible();
    }
    await expect.poll(() => images.evaluateAll((elements) => elements.every((element) =>
      element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
    ))).toBe(true);
    const sources = await images.evaluateAll((elements) => elements.map((element) =>
      (element as HTMLImageElement).currentSrc,
    ));
    expect(new Set(sources).size).toBe(sources.length);

    for (const [index, title] of project.sceneTitles.entries()) {
      await expect(scenes.getByRole("button", {
        name: `Scene ${index + 1}, ${title}, Ready to start`,
      })).toBeVisible();
    }

    const firstScene = scenes.getByRole("button", {
      name: `Scene 1, ${project.sceneTitles[0]}, Ready to start`,
    });
    await firstScene.hover();
    await expect(firstScene).toBeVisible();
    await firstScene.focus();
    await expect(firstScene).toBeFocused();
    await expect(firstScene).toBeVisible();
  });
}

for (const viewport of [
  { height: 568, width: 280 },
  { height: 480, width: 320 },
  { height: 844, width: 390 },
  { height: 360, width: 640 },
  { height: 900, width: 1280 },
]) {
  test(`both rhyme editors keep required actions reachable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);

    for (const project of [
      { route: "/dubs/five-little-ducks", sceneTitle: "Five little ducks" },
      { route: "/dubs/old-macdonald", sceneTitle: "Cows on the farm" },
    ]) {
      await page.goto(`${project.route}?parrotE2eDub=complete`);
      await expectDubProject(page);
      await expectNoHorizontalOverflow(page);

      const routeHeader = page.getByRole("navigation", { name: "Page navigation" });
      const backToRhymes = routeHeader.getByRole("link", { name: "Back to Nursery rhymes" });
      await expect(backToRhymes).toBeVisible();
      await expectSharedHeaderTarget(backToRhymes);
      await expectBelow(page.getByRole("region", { name: "Dub project workspace" }), routeHeader);

      await page.getByRole("button", {
        name: `Scene 1, ${project.sceneTitle}, Scene ready`,
      }).click();
      const backToFullVideo = routeHeader.getByRole("button", { name: "Back to full video" });
      await expect(backToFullVideo).toBeVisible();
      await expectSharedHeaderTarget(backToFullVideo);
      await expectBelow(page.getByRole("region", { name: "Scene editor workspace" }), routeHeader);

      for (const action of [
        page.getByRole("button", { name: "Hear line" }),
        page.getByRole("button", { name: "Record again" }),
        page.getByRole("button", { name: "Play my recording" }),
        page.getByRole("button", { name: "Previous line" }),
        page.getByRole("button", { name: "Next line" }),
      ]) {
        await action.scrollIntoViewIfNeeded();
        await expect(action).toBeInViewport();
        await expectBelow(action, routeHeader);
        await expectTargetAtLeast48(action);
      }
      await expectNoHorizontalOverflow(page);

      await backToFullVideo.click();
      await expectDubProject(page);
    }
  });
}

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

async function expectDubRouteContained(page: Page) {
  const metrics = await page.getByRole("main").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      viewportWidth: innerWidth,
    };
  });
  expect(metrics.left).toBeGreaterThanOrEqual(0);
  expect(metrics.right).toBe(metrics.viewportWidth);
  await expectNoHorizontalOverflow(page);
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
  await expectDubProject(page);

  const workspace = page.getByRole("region", { name: "Dub project workspace" });
  const player = page.getByRole("region", { name: "Full video player" });
  const dock = page.getByRole("navigation", { name: "Scenes" });
  const sceneButton = dock.getByRole("button", {
    name: "Scene 1, Five little ducks, 3 of 4 lines ready",
  });
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
  await expect(sceneButton).toBeInViewport();
  await expect(dock.getByRole("button")).toHaveCount(6);
  await expectNoHorizontalOverflow(page);
});

test("the narrow project keeps its full title and transport outside the story art", async ({ page }) => {
  await page.setViewportSize({ height: 568, width: 280 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await expectDubProject(page);

  const title = page.getByRole("heading", { name: "Five Little Ducks" });
  await expect.poll(() => title.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const [playerBox, playBox] = await Promise.all([
    boundingBoxOrThrow(page.getByRole("region", { name: "Full video player" })),
    boundingBoxOrThrow(page.getByRole("button", { name: "Play full video" })),
  ]);
  expect(playBox.y).toBeGreaterThanOrEqual(playerBox.y + playerBox.height);
  expect(boxesOverlap(playerBox, playBox)).toBe(false);
});

test("the short-landscape project preserves the generated scene at 16:9", async ({ page }) => {
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await expectDubProject(page);

  const stage = page.getByRole("region", { name: "Full video player" }).locator("img");
  await expect(stage).toHaveCount(1);
  const box = await boundingBoxOrThrow(stage);
  expect(Math.abs(box.width / box.height - 16 / 9)).toBeLessThan(0.01);
});

test("the desktop scene editor keeps the stage left of its selected-line controls", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await expectDubProject(page);
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
  await expectDubProject(page);
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
    await expectDubProject(page);

    const dock = page.getByRole("navigation", { name: "Scenes" });
    const sceneSix = dock.getByRole("button", {
      name: "Scene 6, Sad mother duck, Ready to start",
    });
    await expectNoHorizontalOverflow(page);
    await sceneSix.scrollIntoViewIfNeeded();
    await expect(sceneSix).toBeInViewport();
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
      page.getByRole("button", { name: "Previous line" }),
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
  await expectDubProject(page);
  const sceneTwo = page.getByRole("button", {
    name: "Scene 2, Four little ducks, Ready to start",
  });
  await expect(page.getByRole("button", {
    name: "Scene 1, Five little ducks, Ready to start",
  })).toHaveAttribute("aria-current", "step");

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

test("keyboard scene selection focuses the first missing line heading", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await expectDubProject(page);
  const sceneButton = page.getByRole("button", {
    name: "Scene 1, Five little ducks, 3 of 4 lines ready",
  });
  await sceneButton.focus();
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
  await expectDubProject(page);
  await openScene(page, 1);
  await holdDubRecordingEnd(page);
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
  await expectDubProject(page);
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
  await expectDubProject(page);
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

test("short landscape shows video, guidance, and every compact scene action", async ({ page }) => {
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await expectDubProject(page);

  const routeHeader = page.getByRole("navigation", { name: "Page navigation" });
  const player = page.getByRole("region", { name: "Full video player" });
  const play = page.getByRole("button", { name: "Play full video" });
  const guidance = page.getByRole("button", { name: "Continue with Scene 1" });
  const scenes = page.getByRole("navigation", { name: "Scenes" });
  const sceneSelection = page.getByRole("complementary", { name: "Scene selection" });
  const first = scenes.getByRole("button", { name: /Scene 1, Five little ducks, 3 of 4 lines ready/ });
  const second = scenes.getByRole("button", { name: /Scene 2, Four little ducks, Ready to start/ });
  const fifth = scenes.getByRole("button", { name: /Scene 5, One little duck, Ready to start/ });
  const last = scenes.getByRole("button", { name: /Scene 6, Sad mother duck, Ready to start/ });
  const [headerBox, playerBox, playBox, guidanceBox, firstBox, secondBox, fifthBox, lastBox] = await Promise.all([
    boundingBoxOrThrow(routeHeader),
    boundingBoxOrThrow(player),
    boundingBoxOrThrow(play),
    boundingBoxOrThrow(guidance),
    boundingBoxOrThrow(first),
    boundingBoxOrThrow(second),
    boundingBoxOrThrow(fifth),
    boundingBoxOrThrow(last),
  ]);
  for (const box of [playerBox, playBox, guidanceBox, firstBox, secondBox, fifthBox, lastBox]) {
    expect(box.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
    expect(box.y + box.height).toBeLessThanOrEqual(360);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(640);
  }
  expect(playerBox.x + playerBox.width).toBeLessThanOrEqual(firstBox.x);
  expect(playBox.y).toBeGreaterThanOrEqual(playerBox.y + playerBox.height);
  expect(guidanceBox.y + guidanceBox.height).toBeLessThanOrEqual(firstBox.y);
  expect(firstBox.x + firstBox.width).toBeLessThanOrEqual(secondBox.x);
  expect(Math.abs(firstBox.y - secondBox.y)).toBeLessThanOrEqual(2);
  expect(fifthBox.x + fifthBox.width).toBeLessThanOrEqual(lastBox.x);
  expect(Math.abs(fifthBox.y - lastBox.y)).toBeLessThanOrEqual(2);
  expect(fifthBox.y).toBeGreaterThanOrEqual(firstBox.y + firstBox.height);
  for (const target of [play, guidance, first, second, fifth, last]) {
    await expectTargetAtLeast48(target);
  }
  await expect(first.locator("img")).not.toBeVisible();
  await expect(last.locator("img")).not.toBeVisible();
  for (const container of [sceneSelection, scenes]) {
    const dimensions = await container.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.clientHeight);
  }
  await expectNoHorizontalOverflow(page);
});

test("short landscape keeps completion feedback in the scene pane", async ({ page }) => {
  await page.setViewportSize({ height: 360, width: 640 });

  for (const { completion, scenario, selectCompletedScene } of [
    { completion: "Scene 1 is ready — great singing!", scenario: "almost-complete", selectCompletedScene: true },
    { completion: "Your video is ready — great singing!", scenario: "complete", selectCompletedScene: false },
  ]) {
    await page.goto(`/dubs/five-little-ducks?parrotE2eDub=${scenario}`);
    await expectDubProject(page);

    if (selectCompletedScene) {
      await page.getByRole("navigation", { name: "Scenes" }).getByRole("button", {
        name: "Scene 1, Five little ducks, Scene ready",
      }).click();
      await page.getByRole("navigation", { name: "Page navigation" }).getByRole("button", {
        name: "Back to full video",
      }).click();
      await expectDubProject(page);
    }

    const sceneSelection = page.getByRole("complementary", { name: "Scene selection" });
    const completionFeedback = sceneSelection.getByText(completion, { exact: true });
    await expect(completionFeedback).toBeVisible();

    const [paneBox, feedbackBox] = await Promise.all([
      boundingBoxOrThrow(sceneSelection),
      boundingBoxOrThrow(completionFeedback),
    ]);
    expect(feedbackBox.x).toBeGreaterThanOrEqual(paneBox.x);
    expect(feedbackBox.x + feedbackBox.width).toBeLessThanOrEqual(paneBox.x + paneBox.width);
    expect(feedbackBox.y).toBeGreaterThanOrEqual(paneBox.y);
    expect(feedbackBox.y + feedbackBox.height).toBeLessThanOrEqual(paneBox.y + paneBox.height);
    await expectFullyInViewport(page, completionFeedback);
  }
});

for (const recovery of [
  { action: "Save again", microphone: "", scenario: "upload-retry-held" },
  { action: "Record again", microphone: "", scenario: "upload-rejected" },
  { action: "Record line", microphone: "&parrotE2eMicrophone=denied", scenario: "empty" },
] as const) {
  test(`short landscape contains ${recovery.scenario} recovery without nested scrolling`, async ({ page }) => {
    await page.setViewportSize({ height: 360, width: 640 });
    await page.goto(`/dubs/five-little-ducks?parrotE2eDub=${recovery.scenario}${recovery.microphone}`);
    await expectDubProject(page);
    await openScene(page, 1);
    await holdDubRecordingEnd(page);
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
