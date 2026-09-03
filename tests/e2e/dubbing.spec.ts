import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  DUB_DEFINITIONS,
  FIVE_LITTLE_DUCKS_DUB,
} from "../../src/dubbing/rhyme-catalog";

const DUCK_LINES = FIVE_LITTLE_DUCKS_DUB.lines;

type DubStoreSnapshot = {
  audioContextCloses: number;
  audioContextsCreated: number;
  audioContextDoubleCloses: number;
  backingStarts: Array<{ at: number; frequencyHz: number }>;
  createdObjectUrls: string[];
  microphoneConstraints: MediaStreamConstraints[];
  microphoneRequests: number;
  microphoneTrackStops: number;
  recorderStartCount: number;
  recorderStartWallMs: number[];
  recorderStopCount: number;
  recorderStopWallMs: number[];
  recordedStreamTrackKinds: string[][];
  scheduledVoiceStarts: number;
  scheduledBacking: Array<{
    at: number;
    frequencyHz: number;
    type: OscillatorType;
  }>;
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

// The dubbing AudioContext mock advances 20 authored milliseconds per page-clock millisecond.
const DUB_AUDIO_CLOCK_SCALE = 20;
// One frame-sized page-clock quantum lets queued focus and cleanup RAF work settle.
const PAGE_FRAME_SETTLE_MS = 20;

async function expectDubProject(page: Page) {
  await expect(page.getByRole("button", { name: "Play full video" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Scene selection" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Scenes" })).toBeVisible();
  await expectNoLearnerAdultControls(page);
}

async function expectDubListenOnly(page: Page) {
  await expect(page.getByRole("region", { name: "Listen-only video" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Full video player" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play full video" })).toBeVisible();
  await expect(
    page.getByText(
      "You can watch the video now. Ask a grown-up to turn on recording when you want to join in.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Check recording access" }),
  ).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Scene selection" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Scenes" })).toHaveCount(0);
  await expect(
    page.getByRole("progressbar", { name: "Project recording progress" }),
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

async function expectStaticPresentationText(target: Locator) {
  await expect(target).toHaveCount(1);
  const semantics = await target.evaluate((element) => {
    const activeBefore = document.activeElement;
    const focusTarget = element as HTMLElement;
    focusTarget.focus();
    const acceptedProgrammaticFocus = document.activeElement === element;
    if (document.activeElement !== activeBefore) {
      if (activeBefore instanceof HTMLElement) activeBefore.focus();
      if (
        document.activeElement !== activeBefore &&
        document.activeElement instanceof HTMLElement
      ) {
        document.activeElement.blur();
      }
    }
    return {
      acceptedProgrammaticFocus,
      focusRestored: document.activeElement === activeBefore,
      hasContentEditable: element.hasAttribute("contenteditable") ||
        (element as HTMLElement).isContentEditable,
      hasLiveRegion: element.closest("[aria-live]") !== null,
      hasLiveRegionRole: element.closest(
        '[role~="alert" i], [role~="log" i], [role~="marquee" i], [role~="status" i], [role~="timer" i], output, marquee',
      ) !== null,
      hasTabIndexAttribute: element.hasAttribute("tabindex"),
      nativeFocusTarget: element.matches(
        'a[href], area[href], audio[controls], button, details, embed, iframe, img[usemap], input:not([type="hidden" i]), label, object, select, summary, textarea, video[controls]',
      ),
    };
  });
  expect(semantics).toEqual({
    acceptedProgrammaticFocus: false,
    focusRestored: true,
    hasContentEditable: false,
    hasLiveRegion: false,
    hasLiveRegionRole: false,
    hasTabIndexAttribute: false,
    nativeFocusTarget: false,
  });
}

async function visibleBox(locator: Locator) {
  await expect(locator).toBeVisible();
  return boundingBoxOrThrow(locator);
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
  await page.getByRole("navigation", { name: "Scenes" }).getByRole("button", {
    name: new RegExp(`^Scene ${sceneNumber},`),
  }).click();
  await expect(page.getByRole("complementary", {
    name: "Line recording controls",
  })).toBeVisible();
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
  const uploadCount = (await dubStoreSnapshot(page)).uploads.length;
  await holdDubRecordingEnd(page);
  await page.getByRole("button", { name: /^Record (?:line|again)$/ }).click();
  await expect(page.getByRole("timer", { name: "Recording duration" })).toContainText("Recording");
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect.poll(async () => (await dubStoreSnapshot(page)).uploads).toHaveLength(uploadCount + 1);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play my recording" })).toBeEnabled();
}

async function expectSavedTake(page: Page, uploadCount: number) {
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play my recording" })).toBeEnabled();
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

function expectSingleActionContextCleanup(
  baseline: DubStoreSnapshot,
  snapshot: DubStoreSnapshot,
) {
  // Count only the media action started after the baseline.
  const created = snapshot.audioContextsCreated - baseline.audioContextsCreated;
  const closed = snapshot.audioContextCloses - baseline.audioContextCloses;
  expect(created).toBe(1);
  expect(closed).toBe(1);
  expect(created).toBe(closed);
  expect(
    snapshot.audioContextDoubleCloses - baseline.audioContextDoubleCloses,
  ).toBe(0);
  expect(snapshot.audioContextDoubleCloses).toBe(0);
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

test("dubbing stays listen-only until a guardian grants recording consent", async ({
  page,
}) => {
  await page.goto(
    "/dubs/five-little-ducks?parrotE2eDub=not-granted&parrotE2eLearners=multiple",
  );

  await expectDubListenOnly(page);
  const [store, microphone] = await Promise.all([
    dubStoreSnapshot(page),
    microphoneSnapshot(page),
  ]);
  expect(store.privateFetches).toEqual([]);
  expect(store.uploads).toEqual([]);
  expect(microphone.requests).toBe(0);
});

test("keeps recording unavailable while voice clips are being cleared", async ({
  page,
}) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=revoking");

  await expect(
    page.getByRole("main").getByRole("paragraph"),
  ).toContainText(
    "You can watch the video while saved voice clips are being cleared.",
  );
  await expect(page.getByRole("button", { name: "Play full video" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try recording again" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Start dubbing|Continue dubbing/ }),
  ).toHaveCount(0);
  await expectNoLearnerAdultControls(page);
});

test("learners can watch public video without private media during cleanup", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=revoking");
  await expect(
    page.getByText(
      "You can watch the video while saved voice clips are being cleared.",
      { exact: false },
    ),
  ).toBeVisible();
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
  expect(store.guideFetches.every((url) => url.startsWith("/assets/nursery-rhymes/"))).toBe(true);
  expect(store.privateFetches).toEqual([]);
  expect(store.uploads).toEqual([]);
  expect(store.createdObjectUrls).toEqual([]);
  expect(microphoneAfter.requests).toBe(0);
});

test("listen-only guide failure restores Play with one child-readable alert", async ({ page }) => {
  await page.route("**/assets/nursery-rhymes/*/guides/*.mp3", (route) =>
    route.fulfill({ status: 503 }));
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=revoking");

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
  await expect.poll(() => page.evaluate(() =>
    "__parrotE2eDub" in window)).toBe(true);
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
    page.getByRole("heading", { name: "Voice dubbing is available" }),
  ).toBeVisible();
  await expect.soft(
    page.getByText(
      "81 of 81 clips saved; Mia can record and replace lines across every nursery rhyme.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect.soft(
    page.getByText(
      "Manage Mia's private voice clips for every nursery rhyme.",
      { exact: true },
    ),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Delete Mia's saved nursery-rhyme voice clips",
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "No saved voice clips" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Allow Mia to record and save nursery-rhyme voice clips",
    }),
  ).toBeVisible();
});

test("Guardian dubbing settings can load independent status for every rhyme ID", async ({
  page,
}) => {
  await page.goto(
    "/guardian/dubbing?parrotE2eDub=empty&parrotE2eGuardian=guardian",
  );
  await expect(
    page.getByRole("heading", { level: 2, name: "Voice dubbing" }),
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

test("Chinese Guardian dubbing management does not localize the learner studio", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("parrot:guardian-language", "zh-Hans"),
  );
  await page.goto(
    "/guardian/dubbing?parrotE2eDub=complete&parrotE2eGuardian=guardian",
  );
  await expect(page.getByRole("navigation", { name: "页面导航" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "配音管理" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "家长中心" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "可以使用配音" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "删除 Mia 已保存的童谣配音片段" }),
  ).toBeVisible();

  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Five Little Ducks" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play full video" })).toBeVisible();
});

test("shared-consent deletion clears saved clips for both rhyme routes", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);
  await openScene(page, 1);
  await stopAndSave(page);
  await expect(page.getByText("Recorded ✓", { exact: true })).toHaveCount(0);

  await page.goto("/dubs/old-macdonald?parrotE2eDub=empty");
  await expectDubProject(page);
  await openScene(page, 1);
  await stopAndSave(page);
  await expect(page.getByText("Recorded ✓", { exact: true })).toHaveCount(0);

  await page.goto(
    "/guardian/dubbing?parrotE2eDub=empty&parrotE2eGuardian=guardian",
  );
  await page.getByRole("button", {
    name: "Delete Mia's saved nursery-rhyme voice clips",
  }).click();
  await expect(
    page.getByRole("heading", { name: "No saved voice clips" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Allow Mia to record and save nursery-rhyme voice clips",
    }),
  ).toBeVisible();

  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubListenOnly(page);

  await page.goto("/dubs/old-macdonald?parrotE2eDub=empty");
  await expectDubListenOnly(page);
});

const guardianResponsiveStates = [
  {
    action: "Delete Mia's saved nursery-rhyme voice clips",
    heading: "Voice dubbing is available",
    scenario: "complete",
  },
  {
    action: "Allow Mia to record and save nursery-rhyme voice clips",
    heading: "No saved voice clips",
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

      const backToDashboard = page.getByRole("link", {
        name: /Back to guardian dashboard/i,
      });
      const account = page.getByRole("button", {
        name: /Profile for ⁨Alex Guardian⁩, guardian mode/,
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

      await expect(pageHeading).toBeVisible();
      await expect(stateHeading).toBeVisible();
      const headerBoxes = await Promise.all(
        [backToDashboard, account].map(visibleBox),
      );
      for (const box of headerBoxes) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      }
      expect(boxesOverlap(headerBoxes[0], headerBoxes[1])).toBe(false);
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
      hasText: "Voice dubbing settings could not be changed.",
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
    page.getByRole("button", {
      name: "Allow Mia to record and save nursery-rhyme voice clips",
    }),
  ).toHaveCount(0);

  const blockedRegrant = await page.evaluate(async (consentVersion) => {
    const response = await fetch("/api/dubs/consent", {
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
    page.getByRole("heading", { name: "No saved voice clips" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Allow Mia to record and save nursery-rhyme voice clips",
    }),
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
      hasText: "Voice dubbing settings could not be changed.",
    }),
  ).toBeVisible();

  await expect(
    page.getByRole("heading", { name: "No saved voice clips" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Allow Mia to record and save nursery-rhyme voice clips",
    }),
  ).toBeVisible();
});

test("direct entry shows distinct scenes without opening a line editor", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);

  await expect(page.getByRole("region", { name: "Full video player" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play full video" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose a scene" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start with Scene 1" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Project recording progress" })).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByRole("progressbar", { name: "Project recording progress" })).toHaveAttribute("aria-valuetext", "Ready to start");
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("");
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Record line" })).toHaveCount(0);
  const scenes = page.getByRole("navigation", { name: "Scenes" });
  await expect(scenes.getByRole("button")).toHaveCount(6);
  await expect(scenes.getByRole("button", {
    name: /^Scene 1, Five little ducks, Ready to start$/,
  })).toBeVisible();
  await expect(scenes.locator("[aria-current]")).toHaveCount(0);
  await expect(scenes.getByRole("button", {
    name: /^Scene 6, Sad mother duck, Ready to start$/,
  })).toBeVisible();
  await expect(page.getByRole("complementary", {
    name: "Line recording controls",
  })).toHaveCount(0);
});

test("selecting a scene opens its first line in a focused, scene-local editor", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto(
    "/dubs/five-little-ducks?parrotE2eDub=partial&parrotE2eDubPlayback=held",
  );

  await expectDubProject(page);
  const player = page.getByRole("region", { name: "Full video player" });
  const scenes = page.getByRole("navigation", { name: "Scenes" });
  await expect(scenes.getByRole("button")).toHaveCount(6);
  await scenes.getByRole("button", {
    name: /^Scene 2, Four little ducks, Ready to start$/,
  }).click();

  await expect(player).toBeVisible();
  await expect(page.getByRole("button", { name: "Play full video" })).toHaveCount(0);
  await expect(player.getByRole("img", {
    name: "Four yellow ducklings return across a flower-lined footbridge in the afternoon.",
  })).toBeVisible();
  await expect(scenes).toHaveCount(0);

  const editor = page.getByRole("complementary", {
    name: "Line recording controls",
  });
  await expect(editor.getByText("Scene 2", { exact: true })).toBeVisible();
  await expect(editor.getByText("Line 1 of 4", { exact: true })).toBeVisible();
  await expect(editor.getByText("Four little ducks went out one day.", {
    exact: true,
  })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to scenes" })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Hear example" })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Previous line" })).toBeDisabled();
  await expect(editor.getByRole("button", { name: "Next line" })).toBeEnabled();
  await expect(editor.getByRole("heading", {
    name: "Four little ducks went out one day.",
  })).toBeFocused();
});

test("scene-local playback plays only the learner's selected line", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
  await expectDubProject(page);
  await openScene(page, 2);
  const baseline = await dubStoreSnapshot(page);
  await page.getByRole("button", { name: "Play my recording" }).click();

  await expect(page.getByRole("region", { name: "Full video player" }).getByRole("img", {
    name: "Four yellow ducklings return across a flower-lined footbridge in the afternoon.",
  })).toBeVisible();
  await expect.poll(async () => (await dubStoreSnapshot(page)).privateFetches).toEqual([
    "/api/dubs/five-little-ducks-v2/lines/line-5/audio",
  ]);
  await expect.poll(async () => (await dubStoreSnapshot(page)).guideFetches).toEqual([]);
  await expect.poll(
    async () => (await dubStoreSnapshot(page)).scheduledVoiceStarts,
  ).toBe(baseline.scheduledVoiceStarts + 1);
  await expect(page.getByRole("button", { name: /Stop my recording|Play my recording/ })).toBeVisible();
});

test("failed line playback returns focus to Record again", async ({
  page,
}) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=audio-fetch-failed");
  await expectDubProject(page);
  await openScene(page, 1);
  await page.getByRole("button", { name: "Play my recording" }).click();

  const recordAgain = page.getByRole("button", { name: "Record again" });
  await expect(page.getByRole("alert").filter({
    hasText: "Your recording could not be played",
  })).toBeVisible();
  await expect(page.getByText("Needs attention", { exact: true })).toBeVisible();
  await expect(recordAgain).toBeFocused();
});

test("scene navigation finishes locally and returns focus to its scene card", async ({
  page,
}) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);
  await openScene(page, 1);
  const editor = page.getByRole("complementary", {
    name: "Line recording controls",
  });
  for (let line = 2; line <= 4; line += 1) {
    await editor.getByRole("button", { name: "Next line" }).click();
    await expect(editor.getByText(`Line ${line} of 4`, { exact: true })).toBeVisible();
  }
  await expect(editor.getByRole("button", { name: "Finish scene" })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Next line" })).toHaveCount(0);
  await editor.getByRole("button", { name: "Finish scene" }).click();

  const scene = page.getByRole("navigation", { name: "Scenes" }).getByRole("button", {
    name: /^Scene 1, Five little ducks, Ready to start$/,
  });
  await expect(scene).toBeFocused();
  await expect(page.getByRole("complementary", { name: "Scene selection" })).toBeVisible();
});

test("full-video Play resumes from the lyric selected cue", async ({ page }) => {
  await page.goto(
    "/dubs/five-little-ducks?parrotE2eDub=complete&parrotE2eDubPlayback=held",
  );
  await expectDubProject(page);
  await openScene(page, 2);
  await page.getByRole("button", { name: "Back to scenes" }).click();
  await page.getByRole("button", { name: "Play full video" }).click();

  await expect(page.getByRole("button", { name: "Stop full video" })).toBeVisible();
  await expect.poll(async () => (await dubStoreSnapshot(page)).privateFetches).toHaveLength(20);
  const privateFetches = (await dubStoreSnapshot(page)).privateFetches;
  expect(privateFetches[0]).toBe(
    "/api/dubs/five-little-ducks-v2/lines/line-5/audio",
  );
  expect(privateFetches).not.toContain(
    "/api/dubs/five-little-ducks-v2/lines/line-4/audio",
  );
});

test("scene statuses identify completed work and open the exact scene", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);
  await page.getByRole("navigation", { name: "Scenes" }).getByRole("button", {
    name: /^Scene 1, Five little ducks, Ready to start$/,
  }).click();
  await expect(page.getByRole("heading", { name: DUCK_LINES[0].text })).toBeFocused();

  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await expectDubProject(page);
  const scenes = page.getByRole("navigation", { name: "Scenes" });
  await expect(scenes.getByRole("button", {
    name: /^Scene 1, Five little ducks, 3 of 4 lines ready$/,
  })).toBeVisible();
  await expect.poll(async () => (await dubStoreSnapshot(page)).privateFetches).toEqual([]);
  await scenes.getByRole("button", {
    name: /^Scene 2, Four little ducks, Ready to start$/,
  }).click();
  await expect(page.getByRole("heading", { name: DUCK_LINES[4].text })).toBeFocused();
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
    url.startsWith("/assets/nursery-rhymes/five-little-ducks/guides/"),
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

test("scene cards open exact groups across the complete rhyme", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await expectDubProject(page);
  await openScene(page, 1);
  await expect(page.getByText("Line 4 of 4", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: DUCK_LINES[3].text })).toBeVisible();

  await page.getByRole("button", { name: "Back to scenes" }).click();
  await openScene(page, 5);
  await expect(page.getByText("Line 1 of 4", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: DUCK_LINES[16].text })).toBeVisible();
  await page.getByRole("button", { name: "Next line" }).click();
  await page.getByRole("button", { name: "Next line" }).click();
  await page.getByRole("button", { name: "Next line" }).click();
  await expect(page.getByText("Line 4 of 4", { exact: true })).toBeVisible();
  await expect(page.getByText("But none of the five little ducks came back.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish scene" })).toBeVisible();
});

test("line navigation has previous and keeps the shared route header", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);
  await openScene(page, 1);

  const previous = page.getByRole("button", { name: "Previous line" });
  await expect(previous).toBeDisabled();
  await page.getByRole("button", { name: "Next line" }).click();
  await expect(page.getByRole("heading", { name: DUCK_LINES[1].text })).toBeVisible();
  await expect(previous).toBeEnabled();
  await previous.click();
  await expect(page.getByRole("heading", { name: DUCK_LINES[0].text })).toBeVisible();

  await page.getByRole("button", { name: "Back to scenes" }).click();
  await expect(page.getByRole("button", { name: "Play full video" })).toBeVisible();
  await page.getByRole("link", { name: "Back to Nursery rhymes" }).click();
  await expect(page).toHaveURL("/dubs");
});

test("saving a line updates its overview status and project progress", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);
  await openScene(page, 1);
  await stopAndSave(page);
  await page.getByRole("button", { name: "Back to scenes" }).click();
  await expect(page.getByRole("navigation", { name: "Scenes" }).getByRole("button", {
    name: /^Scene 1, Five little ducks, 1 of 4 lines ready$/,
  })).toBeVisible();
  await expect.poll(async () => (await dubStoreSnapshot(page)).privateFetches).toEqual([]);
  await expect(page.getByRole("progressbar", { name: "Project recording progress" })).toHaveAttribute("aria-valuetext", "1 of 24 lines ready");
});

test("line recording follows one linear action flow", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);
  await openScene(page, 1);

  await expect(page.getByRole("button", { name: "Record line" })).toBeVisible();
  await expect(page.getByText("Line 1 of 4", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hear example" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next line" })).toBeVisible();
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play my recording" })).toHaveCount(0);

  await page.getByRole("button", { name: "Next line" }).click();
  await expect(page.getByText("Line 2 of 4", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next line" }).click();
  await expect(page.getByText("Line 3 of 4", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next line" }).click();
  await expect(page.getByText("Line 4 of 4", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish scene" })).toBeVisible();
  await page.getByRole("button", { name: "Finish scene" }).click();
  await expect(page.getByRole("region", { name: "Full video player" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Scenes" }).getByRole("button", {
    name: /^Scene 1, Five little ducks, Ready to start$/,
  })).toBeFocused();
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
  await expect(page.getByRole("progressbar", { name: "Project recording progress" }))
    .toHaveAttribute("aria-valuetext", "Ready to start");
  await expect(page.getByRole("navigation", { name: "Scenes" }).getByRole("button"))
    .toHaveCount(5);
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
    "/assets/nursery-rhymes/old-macdonald/guides/old-macdonald-v1-guide-line-1.mp3",
  );
});

test("the Old MacDonald desktop project keeps the video beside clear scene choices", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto("/dubs/old-macdonald?parrotE2eDub=empty");
  await expectDubProject(page);

  const workspace = page.getByRole("region", { name: "Dub project workspace" });
  const player = page.getByRole("region", { name: "Full video player" });
  const stage = player.getByRole("img");
  await expect(stage).toHaveCount(1);
  const sceneSelection = page.getByRole("complementary", { name: "Scene selection" });
  const playButton = page.getByRole("button", { name: "Play full video" });
  const [workspaceBox, playerBox, stageBox, sceneSelectionBox, playBox] = await Promise.all([
    boundingBoxOrThrow(workspace),
    boundingBoxOrThrow(player),
    boundingBoxOrThrow(stage),
    boundingBoxOrThrow(sceneSelection),
    boundingBoxOrThrow(playButton),
  ]);

  expect(workspaceBox.width).toBeGreaterThanOrEqual(1440 * 0.9);
  expect(stageBox.width).toBeLessThanOrEqual(playerBox.width);
  expect(stageBox.height).toBeLessThanOrEqual(playerBox.height);
  expect(playerBox.x + playerBox.width).toBeLessThanOrEqual(sceneSelectionBox.x);
  expect(playBox.y).toBeGreaterThanOrEqual(playerBox.y + playerBox.height);
  expect(boxesOverlap(playerBox, playBox)).toBe(false);
  await expect(player).toBeInViewport();
  await expect(sceneSelection).toBeInViewport();
  await expect(sceneSelection.getByRole("navigation", { name: "Scenes" }).getByRole("button"))
    .toHaveCount(5);
  await expectNoHorizontalOverflow(page);

  await openScene(page, 1);
  const editorWorkspace = page.getByRole("region", { name: "Dub project workspace" });
  const persistentPlayer = page.getByRole("region", { name: "Full video player" });
  const lineControls = page.getByRole("complementary", { name: "Line recording controls" });
  const [editorWorkspaceBox, persistentPlayerBox, lineControlsBox] = await Promise.all([
    boundingBoxOrThrow(editorWorkspace),
    boundingBoxOrThrow(persistentPlayer),
    boundingBoxOrThrow(lineControls),
  ]);

  expect(editorWorkspaceBox.width).toBeGreaterThanOrEqual(1440 * 0.9);
  expectSameActionSlot(persistentPlayerBox, playerBox);
  expect(persistentPlayerBox.x + persistentPlayerBox.width).toBeLessThanOrEqual(lineControlsBox.x);
  await expect(persistentPlayer).toBeInViewport();
  await expect(lineControls).toBeInViewport();
  await expectNoHorizontalOverflow(page);
});

test("Old MacDonald summarizes progress by scene without loading private audio", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto("/dubs/old-macdonald?parrotE2eDub=partial");
  await expectDubProject(page);

  const scenes = page.getByRole("navigation", { name: "Scenes" });
  await expect(scenes.getByRole("button")).toHaveCount(5);
  await expect(scenes.getByRole("button", {
    name: /^Scene 1, Cows on the farm, 3 of 7 lines ready$/,
  })).toBeVisible();
  await expect(scenes.getByRole("button", {
    name: /^Scene 2, Ducks on the farm, Ready to start$/,
  })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Scene 1" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Project recording progress" }))
    .toHaveAttribute("aria-valuetext", "3 of 35 lines ready");
  await expect.poll(async () => (await dubStoreSnapshot(page)).privateFetches).toEqual([]);
  const playerBox = await boundingBoxOrThrow(page.getByRole("region", {
    name: "Full video player",
  }));
  expect(playerBox.width / playerBox.height).toBeCloseTo(16 / 9, 1);
  await expectNoHorizontalOverflow(page);
});

test("Old MacDonald keeps its player transport reachable on a wide short desktop", async ({
  page,
}) => {
  await page.setViewportSize({ height: 768, width: 1920 });
  await page.goto("/dubs/old-macdonald?parrotE2eDub=partial&parrotE2eDubPlayback=held");
  await expectDubProject(page);

  const player = page.getByRole("region", { name: "Full video player" });
  await expect(player).toBeInViewport();
  const play = page.getByRole("button", { name: "Play full video" });
  await play.scrollIntoViewIfNeeded();
  await expect(play).toBeInViewport();
  await expectTargetAtLeast48(play);
  const playerBox = await boundingBoxOrThrow(player);
  expect(playerBox.width / playerBox.height).toBeCloseTo(16 / 9, 1);
  await play.click();
  await expect(page.getByRole("region", { name: "Karaoke guide" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Stop full video" })).toBeInViewport();
});

test("Old MacDonald separates the example from the learner's saved recording", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto("/dubs/old-macdonald?parrotE2eDub=empty");
  await expectDubProject(page);
  await openScene(page, 1);
  await stopAndSave(page);

  const controls = page.getByRole("complementary", { name: "Line recording controls" });
  const recording = controls.getByRole("region", { name: "Your recording" });
  await expect(controls.getByRole("button", { name: "Hear example" })).toBeVisible();
  await expect(recording.getByText("Your turn", { exact: true })).toBeVisible();
  await expect(recording.getByText("Saved", { exact: true })).toBeVisible();
  await expect(recording.getByRole("button", { name: "Play my recording" })).toBeVisible();
  await expect(recording.getByRole("button", { name: "Record again" })).toBeVisible();
});

test("Old MacDonald presents one concise saved-state action set", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto("/dubs/old-macdonald?parrotE2eDub=empty");
  await expectDubProject(page);
  await openScene(page, 1);
  await stopAndSave(page);

  const controls = page.getByRole("complementary", { name: "Line recording controls" });
  const learnerActions = controls.getByRole("region", { name: "Your recording" });
  const playLearner = learnerActions.getByRole("button", { name: "Play my recording" });
  const recordAgain = learnerActions.getByRole("button", { name: "Record again" });
  await expect(playLearner).toBeVisible();
  await expect(recordAgain).toBeVisible();
  await expect(learnerActions.getByRole("button")).toHaveCount(2);
  await expect(controls.getByRole("button", { name: "Hear example" })).toBeVisible();
  for (const action of [playLearner, recordAgain]) await expectTargetAtLeast48(action);
});

test("the Old MacDonald narrow route keeps scene and recording controls reachable", async ({
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

  const finalScene = page.getByRole("navigation", { name: "Scenes" }).getByRole("button", {
    name: /^Scene 5, Sheep on the farm, Ready to start$/,
  });
  await finalScene.scrollIntoViewIfNeeded();
  await expect(finalScene).toBeInViewport();

  await openScene(page, 1);
  const stage = page.getByRole("region", { name: "Full video player" });
  const lyric = page.getByRole("heading", { name: "Old MacDonald had a farm, E-I-E-I-O!" });
  const controls = page.getByRole("complementary", { name: "Line recording controls" });
  const example = page.getByRole("button", { name: "Hear example" });
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

  expect(stageBox.y).toBeGreaterThanOrEqual(controlsBox.y + controlsBox.height);
  expect(lyricBox.y).toBeGreaterThanOrEqual(controlsBox.y);
  expect(recordBox.y).toBeGreaterThanOrEqual(exampleBox.y + exampleBox.height);
  expect(nextBox.y).toBeGreaterThanOrEqual(recordBox.y + recordBox.height);
  await expect(page.getByText("Line 1 of 7", { exact: true })).toHaveAttribute("aria-current", "step");
  await expect(page.getByRole("button", { name: "Back to scenes" })).toBeVisible();
  await expectLearnerTargetsAtLeast48px(page);
  await expectNoHorizontalOverflow(page);
});

test("the Old MacDonald short-landscape route keeps the player and sidebar clear of the header", async ({
  page,
}) => {
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto("/dubs/old-macdonald?parrotE2eDub=empty");
  await expectDubProject(page);

  const routeHeader = page.getByRole("navigation", { name: "Page navigation" });
  const player = page.getByRole("region", { name: "Full video player" });
  const sceneSelection = page.getByRole("complementary", { name: "Scene selection" });
  const playFull = page.getByRole("button", { name: "Play full video" });
  const firstScene = sceneSelection.getByRole("button", { name: /^Scene 1,/ });
  const [headerBox, playerBox, sceneSelectionBox, playFullBox, firstSceneBox] = await Promise.all([
    boundingBoxOrThrow(routeHeader),
    boundingBoxOrThrow(player),
    boundingBoxOrThrow(sceneSelection),
    boundingBoxOrThrow(playFull),
    boundingBoxOrThrow(firstScene),
  ]);

  for (const box of [playerBox, sceneSelectionBox, playFullBox, firstSceneBox]) {
    expect(box.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(640);
  }
  expect(playerBox.x + playerBox.width).toBeLessThanOrEqual(sceneSelectionBox.x);
  expect(boxesOverlap(playerBox, sceneSelectionBox)).toBe(false);
  await expectNoHorizontalOverflow(page);

  await firstScene.click();
  const controls = page.getByRole("complementary", { name: "Line recording controls" });
  const persistentPlayer = page.getByRole("region", { name: "Full video player" });
  const lineHeading = page.getByRole("heading", {
    name: "Old MacDonald had a farm, E-I-E-I-O!",
  });
  const [persistentPlayerBox, controlsBox, lineBox] = await Promise.all([
    boundingBoxOrThrow(persistentPlayer),
    boundingBoxOrThrow(controls),
    boundingBoxOrThrow(lineHeading),
  ]);

  expectSameActionSlot(persistentPlayerBox, playerBox);
  expect(persistentPlayerBox.x + persistentPlayerBox.width).toBeLessThanOrEqual(controlsBox.x);
  expect(lineBox.y).toBeGreaterThanOrEqual(controlsBox.y);
  for (const action of [
    page.getByRole("button", { name: "Back to scenes" }),
    page.getByRole("button", { name: "Hear example" }),
    page.getByRole("button", { name: "Record line" }),
    page.getByRole("button", { name: "Next line" }),
  ]) {
    await expectTargetAtLeast48(action);
  }
  await expectNoHorizontalOverflow(page);
});

test("recording shows elapsed time, saves, and exposes the next clear action", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);
  await openScene(page, 3);
  await page.getByRole("button", { name: "Next line" }).click();
  await page.getByRole("button", { name: "Next line" }).click();
  const controls = page.getByRole("complementary", { name: "Line recording controls" });
  await holdDubRecordingEnd(page);
  await page.getByRole("button", { name: "Record line" }).click();
  const timer = page.getByRole("timer", { name: "Recording duration" });
  const progress = page.getByRole("progressbar", { name: "Recording time" });
  await expect(timer).toContainText("0:04");
  await expect(progress).toHaveAttribute("aria-valuemax", "4000");
  await expect.poll(async () => Number(await progress.getAttribute("aria-valuenow"))).toBeGreaterThan(500);
  await expect(timer).toContainText("Recording");
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("Recording…");
  await expect(page.getByText(/get ready|3…|2…|1…/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expectSavedTake(page, 1);

  await expect(controls.getByText("Saved", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play my recording" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next line" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Record again" })).toBeVisible();
  await expect(page.getByText("Mother duck said, “Quack, quack, quack, quack.”", { exact: true })).toBeVisible();
  await expect.poll(async () => (await dubStoreSnapshot(page)).uploads).toEqual([
    "/api/dubs/five-little-ducks-v2/lines/line-11",
  ]);
  await expect.poll(async () => (await dubStoreSnapshot(page)).playedAudioSources).toEqual([]);
});

test("saving the final scene line focuses Finish scene", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);
  await openScene(page, 6);
  for (let line = 1; line < 4; line += 1) {
    await page.getByRole("button", { name: "Next line" }).click();
  }
  await expect(page.getByRole("heading", { name: DUCK_LINES[23].text })).toBeVisible();
  await holdDubRecordingEnd(page);
  await page.getByRole("button", { name: "Record line" }).click();
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expectSavedTake(page, 1);

  await expect(page.getByRole("button", { name: "Next line" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Finish scene" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Finish scene" })).toBeFocused();
});

test("Back keeps progress and reload resumes the saved line statuses", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);
  await openScene(page, 1);
  await stopAndSave(page);
  await page.getByRole("button", { name: "Back to scenes" }).click();
  await expect(page.getByRole("navigation", { name: "Scenes" }).getByRole("button", {
    name: /^Scene 1, Five little ducks, 1 of 4 lines ready$/,
  })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Project recording progress" }))
    .toHaveAttribute("aria-valuetext", "1 of 24 lines ready");

  await page.reload();
  await expectDubProject(page);
  await expect(page.getByRole("navigation", { name: "Scenes" }).getByRole("button", {
    name: /^Scene 1, Five little ducks, 1 of 4 lines ready$/,
  })).toBeVisible();
  await expect.poll(async () => (await dubStoreSnapshot(page)).privateFetches).toEqual([]);
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
  await expect(page.getByText("Recorded ✓", { exact: true })).toHaveCount(0);
  await expect.poll(async () => (await dubStoreSnapshot(page)).uploads).toEqual([
    "/api/dubs/five-little-ducks-v2/lines/line-5",
  ]);
});

test("a saved take keeps its local review URL while the line stays active", async ({ page }) => {
  await page.goto(
    "/dubs/five-little-ducks?parrotE2eDub=empty&parrotE2eDubPlayback=held",
  );
  await expectDubProject(page);
  await openScene(page, 1);
  await stopAndSave(page);

  await expect.poll(async () => (await dubStoreSnapshot(page)).createdObjectUrls).toHaveLength(1);
  const [objectUrl] = (await dubStoreSnapshot(page)).createdObjectUrls;
  expect(revocationCount(await dubStoreSnapshot(page), objectUrl)).toBe(0);

  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
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
  await expect(page.getByRole("button", { name: "Play my recording" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Full video player" })).toBeVisible();
  await expectLearnerTargetsAtLeast48px(page);
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "Back to scenes" }).click();
  await expect(page.getByRole("navigation", { name: "Scenes" }).getByRole("button", {
    name: /^Scene 1, Five little ducks, Needs a new take$/,
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
  await page.getByRole("button", { name: "Back to scenes" }).click();
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

  await page.evaluate(() => {
    window.history.pushState(null, "", "/dubs");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
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
  await expect(page.getByText("Needs attention", { exact: true })).toBeVisible();
  await expect(page.getByText("Recorded ✓", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Play my recording" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save again" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record again" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back to scenes" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next line" })).toBeDisabled();
  await expect(page.getByText("Line 1 of 4", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Hear example" }).click();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText(
    "Playing example for Scene 1, line 1.",
  );
  await expect(page.getByRole("button", { name: "Save again" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "not saved" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next line" })).toBeDisabled();

  await page.getByRole("button", { name: "Play my recording" }).click();
  await expect(page.getByRole("button", { name: "Stop my recording" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText(
    "Playing your recording for line 1.",
  );
  await expect(page.getByRole("button", { name: "Save again" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "not saved" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to scenes" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next line" })).toBeDisabled();

  await page.getByRole("button", { name: "Save again" }).click();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("Saving your take…");
  await expect(page.getByText("Saving your voice…", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Hear example" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Play my recording" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save again" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next line" })).toBeDisabled();
  await releaseDubOperation(page, "upload");
  await expect(page.getByRole("button", { name: "Save again" })).toHaveCount(0);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
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
  await expect(page.getByText("Needs attention", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next line" }).click();
  await expect(page.getByText("Line 2 of 4", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record line" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record again" })).toHaveCount(0);
  const snapshot = await dubStoreSnapshot(page);
  expect(snapshot.createdObjectUrls).toHaveLength(1);
  expect(revocationCount(snapshot, snapshot.createdObjectUrls[0])).toBe(1);
});

test("a fresh microphone failure replaces a stale rejected-upload error", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=upload-rejected");
  await expectDubProject(page);
  await openScene(page, 1);
  await holdDubRecordingEnd(page);
  await page.getByRole("button", { name: "Record line" }).click();
  await page.getByRole("button", { name: "Stop recording" }).click();
  const staleUploadError = page.getByRole("alert").filter({ hasText: "too long" });
  await expect(staleUploadError).toBeVisible();

  await page.evaluate(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("parrotE2eMicrophone", "denied");
    window.history.replaceState(window.history.state, "", url);
  });
  await page.getByRole("button", { name: "Record again" }).click();

  const microphoneError = page.getByRole("alert").filter({
    hasText: "The microphone is off.",
  });
  await expect(microphoneError).toBeVisible();
  await expect(staleUploadError).toHaveCount(0);
  await expect(microphoneError).not.toContainText("too long");
  await expect(page.getByRole("button", { name: "Record line" })).toBeFocused();
});

test("corrupt private audio falls back to its guide and marks the line Record again", async ({ page }) => {
  test.setTimeout(15_000);
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=corrupt-line-5");
  await expectDubProject(page);
  await page.getByRole("button", { name: "Play full video" }).click();
  await expect(page.getByRole("button", { name: "Stop full video" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Project recording progress" }))
    .toHaveAttribute("aria-valuetext", "23 of 24 lines ready");
  await expect(page.getByRole("navigation", { name: "Scenes" }).getByRole("button", {
    name: /^Scene 2, Four little ducks, Needs a new take$/,
  })).toBeVisible();
  await expect.poll(async () => (await dubStoreSnapshot(page)).guideFetches).toContain(
    "/assets/nursery-rhymes/five-little-ducks/guides/five-little-ducks-v2-guide-line-5.mp3",
  );
  await expect(page.getByRole("button", { name: "Play full video" })).toBeVisible({ timeout: 8_000 });
  await openScene(page, 2);
  await stopAndSave(page);
  await page.getByRole("button", { name: "Back to scenes" }).click();
  await expect(page.getByRole("navigation", { name: "Scenes" }).getByRole("button", {
    name: /^Scene 2, Four little ducks, Scene ready$/,
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
  await page.getByRole("button", { name: "Hear example" }).click();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText(
    "Playing example for Scene 1, line 1.",
  );
  await page.getByRole("button", { name: "Next line" }).click();
  await expect(page.getByText("Line 2 of 4", { exact: true })).toBeVisible();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("Line 2 selected. Not recorded.");
  await expect.poll(async () => (await dubStoreSnapshot(page)).audioContextDoubleCloses).toBe(0);
});

test("recording silences guide playback", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty&parrotE2eDubPlayback=held");
  await expectDubProject(page);
  await openScene(page, 1);
  await holdDubRecordingEnd(page);
  await page.getByRole("button", { name: "Hear example" }).click();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText(
    "Playing example for Scene 1, line 1.",
  );
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("timer", { name: "Recording duration" })).toContainText("Recording");
  await page.waitForTimeout(300);
  await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hear example" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next line" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Play full video" })).toHaveCount(0);
  await expect.poll(async () => (await dubStoreSnapshot(page)).audioContextDoubleCloses).toBe(0);
  await page.getByRole("button", { name: "Stop recording" }).click();
});

test("automatically stops and saves at the selected four-second phrase", async ({ page }) => {
  test.setTimeout(15_000);
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);
  await openScene(page, 1);
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("progressbar", { name: "Recording time" })).toHaveAttribute("aria-valuemax", "4000");
  await expect(page.getByRole("timer", { name: "Recording duration" }))
    .toContainText("Recording");
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("Recording…");
  await expectSavedTake(page, 1);
  await expect.poll(async () => (await dubStoreSnapshot(page)).backingStarts.length)
    .toBeGreaterThan(0);
});

test("exposes recorder, microphone, context, and scheduled-backing evidence only for dubbing", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);
  await openScene(page, 1);
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();

  const snapshot = await dubStoreSnapshot(page);
  expect(snapshot.audioContextsCreated).toBe(1);
  expect(snapshot.audioContextCloses).toBe(0);
  expect(snapshot.recorderStartCount).toBe(1);
  expect(snapshot.recorderStopCount).toBe(0);
  expect(snapshot.microphoneRequests).toBe(1);
  expect(snapshot.microphoneConstraints).toEqual([{
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
    },
  }]);
  expect(snapshot.recordedStreamTrackKinds).toEqual([["audio"]]);
  expect(snapshot.scheduledBacking.some(({ type }) => type === "triangle")).toBe(true);
});

test("starts capture on the authored downbeat and records exactly the line window", async ({ page }) => {
  const definition = DUB_DEFINITIONS[0];
  const line = definition.lines[0];
  const clockStartedAt = Date.parse("2026-09-01T08:00:00.000Z");
  await page.clock.install({ time: clockStartedAt });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);
  await openScene(page, 1);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
  const countInStartedAt = await page.evaluate(() => performance.now());

  await page.getByRole("button", { name: "Record line" }).click();
  const recording = page.getByRole("region", { name: "Your recording" });
  await expect(recording.getByText("Recording starts in", { exact: true })).toBeVisible();
  const countInTwo = recording.getByText("2", { exact: true });
  await expect(countInTwo).toBeVisible();
  await expectStaticPresentationText(countInTwo);
  await expect(page.getByRole("status", { name: "Dub updates" })).not.toContainText(
    "Recording starts in",
  );
  await expect(page.getByRole("button", { name: "Cancel count-in" })).toBeVisible();
  let snapshot = await dubStoreSnapshot(page);
  expect(snapshot.recorderStartCount).toBe(0);
  expect(snapshot.recorderStartWallMs).toEqual([]);
  expect(snapshot.uploads).toEqual([]);
  expect(snapshot.createdObjectUrls).toEqual([]);

  await page.clock.runFor(definition.music.countInBeatMs / DUB_AUDIO_CLOCK_SCALE);
  const countInOne = recording.getByText("1", { exact: true });
  await expect(countInOne).toBeVisible();
  await expectStaticPresentationText(countInOne);
  await expect(page.getByRole("status", { name: "Dub updates" })).not.toContainText(
    "Recording starts in",
  );
  expect((await dubStoreSnapshot(page)).recorderStartCount).toBe(0);

  await page.clock.runFor(
    (definition.music.countInDurationMs - definition.music.countInBeatMs) /
      DUB_AUDIO_CLOCK_SCALE,
  );
  await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
  await expect(page.getByRole("timer", { name: "Recording duration" })).toContainText(
    "0:00 / 0:04",
  );
  const heading = page.getByRole("heading", { level: 2, name: line.text });
  const firstActiveWord = heading.getByText("Five", { exact: true });
  await expect(firstActiveWord).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expectStaticPresentationText(firstActiveWord);
  snapshot = await dubStoreSnapshot(page);
  expect(snapshot.recorderStartCount).toBe(1);
  expect(snapshot.recorderStartWallMs[0] - countInStartedAt).toBeGreaterThanOrEqual(
    definition.music.countInDurationMs / DUB_AUDIO_CLOCK_SCALE,
  );
  const firstClick = snapshot.scheduledBacking.find(
    ({ type }) => type === "sine",
  );
  const firstMelody = snapshot.scheduledBacking.find(
    ({ type }) => type === "triangle",
  );
  expect(firstClick).toBeDefined();
  expect(firstMelody).toBeDefined();
  expect((firstMelody?.at ?? 0) - (firstClick?.at ?? 0)).toBeCloseTo(
    definition.music.countInDurationMs / 1_000,
    5,
  );
  expect(snapshot.scheduledBacking.some(
    ({ at, type }) => type === "sine" && at === firstMelody?.at,
  )).toBe(true);

  await page.clock.runFor(line.durationMs / DUB_AUDIO_CLOCK_SCALE);
  await expectSavedTake(page, 1);
  snapshot = await dubStoreSnapshot(page);
  expect(snapshot.recorderStopCount).toBe(1);
  // One page-clock millisecond is one scale quantum of authored time.
  expect(
    Math.abs(
      (snapshot.recorderStopWallMs[0] - snapshot.recorderStartWallMs[0]) *
        DUB_AUDIO_CLOCK_SCALE -
        line.durationMs,
    ),
  ).toBeLessThanOrEqual(DUB_AUDIO_CLOCK_SCALE);
  expect(snapshot.microphoneTrackStops).toBe(1);
  expect(snapshot.audioContextsCreated).toBe(1);
  expect(snapshot.audioContextCloses).toBe(1);
  expect(snapshot.audioContextDoubleCloses).toBe(0);
});

for (const cancelBeat of [2, 1] as const) {
  test(`cancelling visible count-in ${cancelBeat} retains the old take and releases media once`, async ({ page }) => {
    const definition = DUB_DEFINITIONS[0];
    const clockStartedAt = Date.parse("2026-09-01T08:00:00.000Z");
    await page.clock.install({ time: clockStartedAt });
    await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
    await expectDubProject(page);
    await openScene(page, 1);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
    const baseline = await dubStoreSnapshot(page);

    await page.getByRole("button", { name: "Record again" }).click();
    const recording = page.getByRole("region", { name: "Your recording" });
    await expect(recording.getByText("2", { exact: true })).toBeVisible();
    if (cancelBeat === 1) {
      await page.clock.runFor(
        definition.music.countInBeatMs / DUB_AUDIO_CLOCK_SCALE,
      );
      await expect(recording.getByText("1", { exact: true })).toBeVisible();
    }
    await page.getByRole("button", { name: "Cancel count-in" }).click();

    await expect(page.getByRole("button", { name: "Record again" })).toBeFocused();
    await expect(page.getByRole("button", { name: "Play my recording" })).toBeEnabled();
    await expect(page.getByText("Recorded ✓", { exact: true })).toHaveCount(0);
    const snapshot = await dubStoreSnapshot(page);
    expect(snapshot.recorderStartCount).toBe(0);
    expect(snapshot.recorderStartWallMs).toEqual([]);
    expect(snapshot.recorderStopCount).toBe(0);
    expect(snapshot.recorderStopWallMs).toEqual([]);
    expect(snapshot.uploads).toEqual([]);
    expect(snapshot.createdObjectUrls).toEqual([]);
    expect(snapshot.microphoneTrackStops - baseline.microphoneTrackStops).toBe(1);
    expectSingleActionContextCleanup(baseline, snapshot);
  });
}

test("recorder start failure retains the old take without creating or uploading a replacement", async ({ page }) => {
  const definition = DUB_DEFINITIONS[0];
  const clockStartedAt = Date.parse("2026-09-01T08:00:00.000Z");
  await page.clock.install({ time: clockStartedAt });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=recorder-start-failed");
  await expectDubProject(page);
  await openScene(page, 1);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
  const baseline = await dubStoreSnapshot(page);

  await page.getByRole("button", { name: "Record again" }).click();
  await expect(page.getByRole("region", { name: "Your recording" })
    .getByText("2", { exact: true })).toBeVisible();
  await page.clock.runFor(
    definition.music.countInDurationMs / DUB_AUDIO_CLOCK_SCALE,
  );
  await expect(page.getByRole("alert").filter({
    hasText: "Recording failed. Try recording again.",
  })).toBeVisible();
  await page.clock.runFor(PAGE_FRAME_SETTLE_MS);
  await expect(page.getByRole("button", { name: "Record again" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Play my recording" })).toBeVisible();

  const snapshot = await dubStoreSnapshot(page);
  expect(snapshot.recorderStartCount).toBe(1);
  expect(snapshot.recorderStartWallMs).toHaveLength(
    snapshot.recorderStartCount,
  );
  expect(snapshot.recorderStopCount).toBe(0);
  expect(snapshot.recorderStopWallMs).toEqual([]);
  expect(snapshot.uploads).toEqual([]);
  expect(snapshot.createdObjectUrls).toEqual([]);
  expect(snapshot.microphoneTrackStops - baseline.microphoneTrackStops).toBe(1);
  expectSingleActionContextCleanup(baseline, snapshot);
  expect(snapshot.scheduledBacking.some(({ type }) => type === "triangle")).toBe(true);
});

async function installControllablePlaybackFrames(page: Page) {
  await page.evaluate(() => {
    let nextFrameId = 1;
    const callbacks = new Map<number, FrameRequestCallback>();
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        const frameId = nextFrameId;
        nextFrameId += 1;
        callbacks.set(frameId, callback);
        return frameId;
      },
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: (frameId: number) => callbacks.delete(frameId),
    });
    Object.defineProperty(window, "__flushAnimationFrames", {
      configurable: true,
      value: () => {
        const queued = [...callbacks.values()];
        callbacks.clear();
        queued.forEach((callback) => callback(performance.now()));
      },
    });
    Object.defineProperty(window, "__hasPlaybackAnimationFrame", {
      configurable: true,
      value: () => callbacks.size > 0,
    });
  });
}

const FULL_PLAYBACK_START_LEAD_MS = 120;

async function waitForQueuedPlaybackFrame(page: Page) {
  await page.waitForFunction(() => (
    (window as typeof window & {
      __hasPlaybackAnimationFrame(): boolean;
    }).__hasPlaybackAnimationFrame()
  ));
}

async function flushPlaybackFrame(page: Page) {
  await page.evaluate(() => {
    (
      window as typeof window & { __flushAnimationFrames(): void }
    ).__flushAnimationFrames();
  });
}

async function expectFirstFullPlaybackWordTransition(page: Page) {
  const line = DUB_DEFINITIONS[0].lines[0];
  const guide = page.getByRole("region", { name: "Karaoke guide" });
  const ducks = line.words[2];
  const went = line.words[3];
  await waitForQueuedPlaybackFrame(page);
  await page.clock.runFor(
    (FULL_PLAYBACK_START_LEAD_MS + line.cueMs + ducks.atMs) /
      DUB_AUDIO_CLOCK_SCALE,
  );
  await flushPlaybackFrame(page);
  await expect(guide).toBeVisible();
  const activeWord = guide.locator('[aria-current="true"]');
  await expect(activeWord).toHaveText("ducks");
  await expectStaticPresentationText(activeWord);
  await expect(page.getByRole("status", { name: "Dub updates" })).not.toContainText(
    "ducks",
  );

  await page.clock.runFor((went.atMs - ducks.atMs) / DUB_AUDIO_CLOCK_SCALE);
  await flushPlaybackFrame(page);
  await expect(activeWord).toHaveText("went");
  await expectStaticPresentationText(activeWord);
}

test("full playback initializes the selected line before its first presentation frame", async ({ page }) => {
  const definition = DUB_DEFINITIONS[0];
  const firstLine = definition.lines[0];
  const finalLine = definition.lines.at(-1)!;
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
  await expectDubProject(page);
  await openScene(page, 6);
  const next = page.getByRole("button", { name: "Next line" });
  for (let lineNumber = 1; lineNumber < definition.linesPerScene; lineNumber += 1) {
    await next.click();
  }
  await expect(page.getByRole("heading", { level: 2, name: finalLine.text })).toBeVisible();
  await page.getByRole("button", { name: "Back to scenes" }).click();
  await expectDubProject(page);
  await installControllablePlaybackFrames(page);

  await page.getByRole("button", { name: "Play full video" }).click();
  await expect(page.getByRole("button", { name: "Stop full video" })).toBeVisible();
  await waitForQueuedPlaybackFrame(page);

  const guide = page.getByRole("region", { name: "Karaoke guide" });
  await expect(guide).toContainText(finalLine.text);
  await expect(guide).not.toContainText(firstLine.text);
  await expect(guide.locator('[aria-current="true"]')).toHaveCount(0);
  const status = page.getByRole("status", { name: "Dub updates" });
  await expect(status).toHaveText("Playing full video: Scene 6, line 4.");
  await expect(status).not.toContainText("Scene 1, line 1");
});

test("project full playback changes its active word at the authored boundary", async ({ page }) => {
  const clockStartedAt = Date.parse("2026-09-01T08:00:00.000Z");
  await page.clock.install({ time: clockStartedAt });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);
  const title = page.getByRole("heading", {
    level: 1,
    name: "Five Little Ducks",
  });
  await expect(title).toBeVisible();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
  await installControllablePlaybackFrames(page);
  await page.getByRole("button", { name: "Play full video" }).click();
  await expect(page.getByRole("button", { name: "Stop full video" })).toBeVisible();

  await expectFirstFullPlaybackWordTransition(page);
  await expect(title).toHaveAccessibleName("Five Little Ducks");
});

test("listen-only full playback changes its active word without touching private media", async ({ page }) => {
  const clockStartedAt = Date.parse("2026-09-01T08:00:00.000Z");
  await page.clock.install({ time: clockStartedAt });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=revoking");
  const title = page.getByRole("heading", {
    level: 1,
    name: "Five Little Ducks",
  });
  await expect(title).toBeVisible();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
  await installControllablePlaybackFrames(page);
  await page.getByRole("button", { name: "Play full video" }).click();
  await expect(page.getByRole("button", { name: "Stop full video" })).toBeVisible();

  await expectFirstFullPlaybackWordTransition(page);
  await expect(title).toHaveAccessibleName("Five Little Ducks");
  const snapshot = await dubStoreSnapshot(page);
  expect(snapshot.microphoneRequests).toBe(0);
  expect(snapshot.microphoneConstraints).toEqual([]);
  expect(snapshot.privateFetches).toEqual([]);
  expect(snapshot.uploads).toEqual([]);
  expect(snapshot.createdObjectUrls).toEqual([]);
  expect(snapshot.guideFetches.length).toBeGreaterThan(0);
  expect(snapshot.scheduledBacking.some(({ type }) => type === "triangle")).toBe(true);
});

test("listen-only playback keeps its guide below the stage and transport visible at 640x360", async ({ page }) => {
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=revoking");
  await installControllablePlaybackFrames(page);
  await page.getByRole("button", { name: "Play full video" }).click();

  const player = page.getByRole("region", { name: "Full video player" });
  const guide = page.getByRole("region", { name: "Karaoke guide" });
  const stop = page.getByRole("button", { name: "Stop full video" });
  await expect(stop).toBeVisible();
  await waitForQueuedPlaybackFrame(page);
  const [playerBox, guideBox, stopBox] = await Promise.all([
    boundingBoxOrThrow(player),
    boundingBoxOrThrow(guide),
    boundingBoxOrThrow(stop),
  ]);

  expect(guideBox.y).toBeGreaterThanOrEqual(playerBox.y + playerBox.height);
  expect(playerBox.x + playerBox.width).toBeLessThanOrEqual(stopBox.x);
  await expectFullyInViewport(page, stop);
  await expectTargetAtLeast48(stop);
});

test("listen-only video keeps one bounded landscape stage across desktop heights", async ({
  page,
}) => {
  const compactLayouts: Array<{
    play: Awaited<ReturnType<typeof boundingBoxOrThrow>>;
    player: Awaited<ReturnType<typeof boundingBoxOrThrow>>;
  }> = [];
  const viewports = [
    { height: 620, width: 1360 },
    { height: 621, width: 1360 },
    { height: 1080, width: 1920 },
    { height: 1440, width: 2560 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/dubs/five-little-ducks?parrotE2eDub=revoking");

    const stage = page.getByRole("region", { name: "Listen-only video" });
    const player = page.getByRole("region", { name: "Full video player" });
    const play = page.getByRole("button", { name: "Play full video" });
    const retry = page.getByRole("button", { name: "Try recording again" });
    const [stageBox, playerBox, playBox] = await Promise.all([
      boundingBoxOrThrow(stage),
      boundingBoxOrThrow(player),
      boundingBoxOrThrow(play),
    ]);

    expect(playerBox.width).toBeGreaterThanOrEqual(780);
    expect(playerBox.x + playerBox.width).toBeLessThanOrEqual(playBox.x);
    expect(stageBox.width).toBeGreaterThanOrEqual(1180);
    expect(stageBox.width).toBeLessThanOrEqual(1600);
    if (viewport.width >= 1920) {
      expect(playerBox.width).toBeGreaterThanOrEqual(1050);
      expect(stageBox.width).toBeGreaterThanOrEqual(1500);
    }
    for (const target of [stage, player, play, retry]) {
      await expectFullyInViewport(page, target);
    }
    await expect
      .poll(() =>
        page.getByRole("main").evaluate((element) =>
          element.scrollHeight <= element.clientHeight),
      )
      .toBe(true);

    if (viewport.width === 1360) {
      compactLayouts.push({ play: playBox, player: playerBox });
    }
  }

  expect(Math.abs(compactLayouts[1].player.x - compactLayouts[0].player.x))
    .toBeLessThanOrEqual(4);
  expect(
    Math.abs(compactLayouts[1].player.width - compactLayouts[0].player.width),
  ).toBeLessThanOrEqual(4);
  expect(Math.abs(compactLayouts[1].play.x - compactLayouts[0].play.x))
    .toBeLessThanOrEqual(4);
});

test("editor actions keep the complete line heading and non-live word semantics", async ({ page }) => {
  const line = DUB_DEFINITIONS[0].lines[0];
  const clockStartedAt = Date.parse("2026-09-01T08:00:00.000Z");
  await page.clock.install({ time: clockStartedAt });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
  await expectDubProject(page);
  await openScene(page, 1);
  const heading = page.getByRole("heading", { level: 2, name: line.text });
  await expect(heading).toHaveAccessibleName(line.text);
  await expect(page.getByRole("button", { name: "Hear example" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Your recording" })).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
  await installControllablePlaybackFrames(page);

  await page.getByRole("button", { name: "Hear example" }).click();
  await waitForQueuedPlaybackFrame(page);
  await flushPlaybackFrame(page);
  const activeWord = heading.locator('[aria-current="true"]');
  await expect(activeWord).toHaveText("Five");
  await expect(heading).toHaveAccessibleName(line.text);
  await expectStaticPresentationText(activeWord);
  await page.clock.runFor(
    line.durationMs / DUB_AUDIO_CLOCK_SCALE + PAGE_FRAME_SETTLE_MS,
  );
  await flushPlaybackFrame(page);
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText(
    "Line 1 selected. Recorded.",
  );
  await expect(heading.locator('[aria-current="true"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Hear example" })).toBeFocused();

  await page.getByRole("button", { name: "Play my recording" }).click();
  await expect(page.getByRole("button", { name: "Stop my recording" })).toBeVisible();
  await waitForQueuedPlaybackFrame(page);
  await flushPlaybackFrame(page);
  await expect(activeWord).toHaveText("Five");
  await expectStaticPresentationText(activeWord);
  await expect(heading).toHaveAccessibleName(line.text);
  await expect(page.getByRole("status", { name: "Dub updates" })).not.toContainText(
    line.text,
  );
});

test("Old MacDonald exposes its two- and eight-second recording windows", async ({ page }) => {
  await page.goto("/dubs/old-macdonald?parrotE2eDub=empty");
  await expectDubProject(page);
  await openScene(page, 1);
  await holdDubRecordingEnd(page);
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("progressbar", { name: "Recording time" }))
    .toHaveAttribute("aria-valuemax", "8000");
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expectSavedTake(page, 1);
  await expect.poll(async () => (await dubStoreSnapshot(page)).backingStarts.length)
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Next line" }).click();
  await page.getByRole("button", { name: "Next line" }).click();
  const backingCount = (await dubStoreSnapshot(page)).backingStarts.length;
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("progressbar", { name: "Recording time" }))
    .toHaveAttribute("aria-valuemax", "2000");
  await expect.poll(async () => (await dubStoreSnapshot(page)).backingStarts.length)
    .toBeGreaterThan(backingCount);
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expectSavedTake(page, 2);
});

for (const definition of DUB_DEFINITIONS) {
  test(`${definition.title} starts its authored backing while recording`, async ({ page }) => {
    await page.goto(`${definition.route}?parrotE2eDub=empty`);
    await page.getByRole("button", { name: "Play full video" }).waitFor();
    await openScene(page, 1);
    await page.getByRole("button", { name: "Record line" }).click();
    await expectSavedTake(page, 1);
    await expect.poll(async () => (await dubStoreSnapshot(page)).backingStarts.length)
      .toBeGreaterThan(0);
    expect((await dubStoreSnapshot(page)).scheduledBacking.some(
      ({ type }) => type === "triangle",
    )).toBe(true);
  });
}

test("held microphone readiness locks navigation but keeps cancellation available", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty&parrotE2eMicrophone=delayed");
  await expectDubProject(page);
  await openScene(page, 1);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await holdDubRecordingEnd(page);
  await page.getByRole("button", { name: "Record line" }).click();

  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("Opening microphone…");
  await expect(page.getByRole("button", { name: "Cancel microphone start" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Your recording" })
    .getByText("Opening microphone…", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to scenes" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Hear example" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Cancel microphone start" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Next line" })).toBeDisabled();

  await resolveDelayedMicrophone(page);
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText("Recording…");
  const timer = page.getByRole("timer", { name: "Recording duration" });
  await expect(timer).toContainText("Recording");
  await expect(timer).toContainText("0:04");
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
});

test("a saved-line re-record can cancel delayed microphone startup without losing focus", async ({ page }) => {
  await page.goto(
    "/dubs/five-little-ducks?parrotE2eDub=complete&parrotE2eMicrophone=delayed",
  );
  await expectDubProject(page);
  await openScene(page, 1);

  await page.getByRole("button", { name: "Record again" }).click();
  const cancel = page.getByRole("button", { name: "Cancel microphone start" });
  await expect(cancel).toBeVisible();
  await expect(cancel).toBeEnabled();
  await expect(cancel).toBeFocused();
  await expect.poll(() => microphoneSnapshot(page)).toMatchObject({ pending: 1, requests: 1 });

  await cancel.click();
  const recordAgain = page.getByRole("button", { name: "Record again" });
  await expect(recordAgain).toBeFocused();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect(page.getByRole("status", { name: "Dub updates" }))
    .toHaveText("Line 1 selected. Recorded.");

  await resolveDelayedMicrophone(page);
  await expect.poll(() => microphoneSnapshot(page)).toMatchObject({
    pending: 0,
    resolved: 1,
    stoppedTracks: 1,
  });
});

test("stops a delayed microphone stream that resolves after route exit", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty&parrotE2eMicrophone=delayed");
  await expectDubProject(page);
  await openScene(page, 1);
  await page.getByRole("button", { name: "Record line" }).click();
  await expect(page.getByRole("button", { name: "Cancel microphone start" })).toBeVisible();
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
      name: "Delete Mia's saved nursery-rhyme voice clips",
    })
    .click();

  await expect(
    page.getByRole("button", { name: "Removing voice clips…" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /Switch to .*start dubbing/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Back to guardian dashboard/i }),
  ).toBeVisible();

  await releaseDubOperation(page, "delete");
  await expect(
    page.getByRole("heading", { name: "No saved voice clips" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Allow Mia to record and save nursery-rhyme voice clips",
    }),
  ).toBeVisible();

  await page.goto("/dubs/old-macdonald?parrotE2eDub=delete-held");
  await expectDubListenOnly(page);
});

test("a failed Guardian delete stays actionable only in Guardian mode", async ({
  page,
}) => {
  await page.goto(
    "/guardian/dubbing?parrotE2eDub=delete-failed&parrotE2eGuardian=guardian",
  );
  await page
    .getByRole("button", {
      name: "Delete Mia's saved nursery-rhyme voice clips",
    })
    .click();

  await expect(
    page.getByRole("alert").filter({
      hasText: "Voice dubbing settings could not be changed.",
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

  await page.goto("/dubs/five-little-ducks?parrotE2eDub=revoking");
  await expect(
    page.getByRole("main").getByRole("paragraph"),
  ).toContainText(
    "You can watch the video while saved voice clips are being cleared.",
  );
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
  const hearLine = page.getByRole("button", { name: "Hear example" });
  await hearLine.click();
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText(
    "Playing example for Scene 1, line 1.",
  );
  await expect(page.getByRole("status", { name: "Dub updates" })).toHaveText(
    "Line 1 selected. Recorded.",
  );
  await expect(hearLine).toBeFocused();
  await expect.poll(async () => (await dubStoreSnapshot(page)).audioContextDoubleCloses).toBe(0);
});

test("reduced motion keeps timed words discrete and repeated count-in cleanup idempotent", async ({ page }) => {
  const definition = DUB_DEFINITIONS[0];
  const clockStartedAt = Date.parse("2026-09-01T08:00:00.000Z");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install({ time: clockStartedAt });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
  await expectDubProject(page);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
  await installControllablePlaybackFrames(page);

  await page.getByRole("button", { name: "Play full video" }).click();
  const guide = page.getByRole("region", { name: "Karaoke guide" });
  const activeWord = guide.locator('[aria-current="true"]');
  const line = definition.lines[0];
  const ducks = line.words[2];
  const went = line.words[3];
  await waitForQueuedPlaybackFrame(page);
  await page.clock.runFor(
    (FULL_PLAYBACK_START_LEAD_MS + line.cueMs + ducks.atMs) /
      DUB_AUDIO_CLOCK_SCALE,
  );
  await flushPlaybackFrame(page);
  await expect(activeWord).toHaveText("ducks");
  await expectStaticPresentationText(activeWord);
  await page.clock.runFor((went.atMs - ducks.atMs) / DUB_AUDIO_CLOCK_SCALE);
  await flushPlaybackFrame(page);
  await expect(activeWord).toHaveText("went");
  await expectStaticPresentationText(activeWord);
  await page.getByRole("button", { name: "Stop full video" }).click();
  await page.clock.runFor(PAGE_FRAME_SETTLE_MS);
  await expect(page.getByRole("button", { name: "Play full video" })).toBeFocused();

  await openScene(page, 1);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.getByRole("button", { name: "Record again" }).click();
    await expect(page.getByRole("region", { name: "Your recording" })
      .getByText("2", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cancel count-in" }).click();
    await page.clock.runFor(PAGE_FRAME_SETTLE_MS);
    await expect(page.getByRole("button", { name: "Record again" })).toBeFocused();
  }
  const snapshot = await dubStoreSnapshot(page);
  expect(snapshot.recorderStartCount).toBe(0);
  expect(snapshot.recorderStartWallMs).toEqual([]);
  expect(snapshot.microphoneTrackStops).toBe(2);
  expect(snapshot.audioContextCloses).toBe(3);
  expect(snapshot.audioContextDoubleCloses).toBe(0);
  expect(snapshot.uploads).toEqual([]);
  expect(snapshot.createdObjectUrls).toEqual([]);
});

for (const viewport of [
  { height: 568, width: 280 },
  { height: 480, width: 320 },
  { height: 360, width: 640 },
  { height: 900, width: 1280 },
]) {
  test(`count-in, recording, navigation, and errors remain reachable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const definition = DUB_DEFINITIONS[0];
    const clockStartedAt = Date.parse("2026-09-01T08:00:00.000Z");
    await page.setViewportSize(viewport);
    await page.goto(
      "/dubs/five-little-ducks?parrotE2eDub=complete&parrotE2eMicrophone=denied",
    );
    await expectDubProject(page);
    await openScene(page, 1);

    const lyric = page.getByRole("heading", {
      level: 2,
      name: DUB_DEFINITIONS[0].lines[0].text,
    });
    const feedback = page.getByRole("region", { name: "Your recording" });
    const record = page.getByRole("button", { name: "Record again" });
    const next = page.getByRole("button", { name: "Next line" });
    const routeNavigation = page.getByRole("navigation", {
      name: "Page navigation",
    });
    const linePosition = page.getByText("Line 1 of 4", { exact: true });
    await record.click();
    const error = page.getByRole("alert").filter({
      hasText: "The microphone is off.",
    });
    await expect(error).toBeVisible();
    for (const surface of [
      lyric,
      feedback,
      record,
      linePosition,
      next,
      routeNavigation,
      error,
    ]) {
      await surface.scrollIntoViewIfNeeded();
      await expectFullyInViewport(page, surface);
    }
    await expectNoHorizontalOverflow(page);

    await page.clock.install({ time: clockStartedAt });
    await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
    await expect(
      page.getByRole("heading", { level: 1, name: "Five Little Ducks" }),
    ).toBeVisible();
    await expectDubProject(page);
    await openScene(page, 1);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));

    await record.click();
    const countInTwo = feedback.getByText("2", { exact: true });
    const cancel = page.getByRole("button", { name: "Cancel count-in" });
    await expect(countInTwo).toBeVisible();
    await expectStaticPresentationText(countInTwo);
    for (const surface of [
      lyric,
      feedback,
      countInTwo,
      cancel,
      linePosition,
      next,
      routeNavigation,
    ]) {
      await surface.scrollIntoViewIfNeeded();
      await expectFullyInViewport(page, surface);
    }
    await expectNoHorizontalOverflow(page);

    await page.clock.runFor(
      definition.music.countInBeatMs / DUB_AUDIO_CLOCK_SCALE,
    );
    const countInOne = feedback.getByText("1", { exact: true });
    await expect(countInOne).toBeVisible();
    await expectStaticPresentationText(countInOne);
    await countInOne.scrollIntoViewIfNeeded();
    await expectFullyInViewport(page, countInOne);
    await expectFullyInViewport(page, cancel);

    await page.clock.runFor(
      (definition.music.countInDurationMs - definition.music.countInBeatMs) /
        DUB_AUDIO_CLOCK_SCALE,
    );
    const stop = page.getByRole("button", { name: "Stop recording" });
    const timer = page.getByRole("timer", { name: "Recording duration" });
    await expect(stop).toBeVisible();
    await expect(timer).toContainText("0:00 / 0:04");
    await lyric.scrollIntoViewIfNeeded();
    await lyric.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await expectFullyInViewport(page, lyric);
    for (const surface of [
      feedback,
      stop,
      timer,
      linePosition,
      next,
      routeNavigation,
    ]) {
      await surface.scrollIntoViewIfNeeded();
      await expectFullyInViewport(page, surface);
    }
    await expectNoHorizontalOverflow(page);

    if (viewport.width === 640) {
      const stage = page.getByRole("region", { name: "Full video player" });
      const controls = page.getByRole("complementary", {
        name: "Line recording controls",
      });
      await expect(stage).toBeInViewport();
      for (const surface of [lyric, feedback, stop, timer, next]) {
        await surface.scrollIntoViewIfNeeded();
        await expect(surface).toBeInViewport();
      }
      const scroll = await controls.evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }));
      expect(scroll.scrollHeight).toBeLessThanOrEqual(scroll.clientHeight + 1);
    }
  });
}

for (const definition of DUB_DEFINITIONS) {
  test(`${definition.route} aligns its persistent player and complete scene panel`, async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 1280 });
    await page.goto(`${definition.route}?parrotE2eDub=empty`);
    await expectDubProject(page);

    const player = page.getByRole("region", { name: "Full video player" });
    const scenePanel = page.getByRole("complementary", { name: "Scene selection" });
    const [playerBox, scenePanelBox] = await Promise.all([
      boundingBoxOrThrow(player),
      boundingBoxOrThrow(scenePanel),
    ]);
    expect(Math.abs(playerBox.y - scenePanelBox.y)).toBeLessThanOrEqual(2);
    expect(playerBox.x + playerBox.width).toBeLessThanOrEqual(scenePanelBox.x);
    const scenes = scenePanel.getByRole("navigation", { name: "Scenes" });
    await expect(scenes.getByRole("button"))
      .toHaveCount(definition.lines.length / definition.linesPerScene);

    const firstScene = scenes.getByRole("button", {
      name: new RegExp(`^Scene 1, ${definition.sceneTitles[0]}, Ready to start$`),
    });
    const lastSceneNumber = definition.lines.length / definition.linesPerScene;
    const lastScene = scenes.getByRole("button", {
      name: new RegExp(`^Scene ${lastSceneNumber}, ${definition.sceneTitles.at(-1)}, Ready to start$`),
    });
    await expect(firstScene).toBeVisible();
    await lastScene.scrollIntoViewIfNeeded();
    await expect(lastScene).toBeVisible();
    await firstScene.focus();
    await expect(firstScene).toBeFocused();
    await expect(scenes.locator("[aria-current]")).toHaveCount(0);
    await expect(scenePanel.getByRole("heading", { name: "Choose a scene" })).toBeVisible();
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

    for (const definition of DUB_DEFINITIONS) {
      await page.goto(`${definition.route}?parrotE2eDub=complete`);
      await expectDubProject(page);
      await expectNoHorizontalOverflow(page);

      const routeHeader = page.getByRole("navigation", { name: "Page navigation" });
      const backToRhymes = routeHeader.getByRole("link", { name: "Back to Nursery rhymes" });
      await expect(backToRhymes).toBeVisible();
      await expectSharedHeaderTarget(backToRhymes);
      await expectBelow(page.getByRole("region", { name: "Dub project workspace" }), routeHeader);

      const player = page.getByRole("region", { name: "Full video player" });
      await openScene(page, 1);
      const controls = page.getByRole("complementary", { name: "Line recording controls" });
      const backToScenes = page.getByRole("button", { name: "Back to scenes" });
      await expect(player).toBeVisible();
      await expect(controls).toBeVisible();
      await expect(backToScenes).toBeVisible();
      await expectTargetAtLeast48(backToScenes);
      for (const action of [
        page.getByRole("button", { name: "Hear example" }),
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

      await backToScenes.click();
      await expect(page.getByRole("complementary", { name: "Scene selection" })).toBeVisible();
      await expect(player).toBeVisible();
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

test("the desktop project keeps the video stable while a scene enters recording mode", async ({ page }) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await expectDubProject(page);

  const workspace = page.getByRole("region", { name: "Dub project workspace" });
  const player = page.getByRole("region", { name: "Full video player" });
  const sceneSelection = page.getByRole("complementary", { name: "Scene selection" });
  const sceneButton = sceneSelection.getByRole("button", {
    name: /^Scene 1, Five little ducks, 3 of 4 lines ready$/,
  });
  const playButton = page.getByRole("button", { name: "Play full video" });
  const workspaceBox = await boundingBoxOrThrow(workspace);
  const playerBox = await boundingBoxOrThrow(player);
  const sceneSelectionBox = await boundingBoxOrThrow(sceneSelection);
  const playBox = await boundingBoxOrThrow(playButton);

  expect(workspaceBox.width).toBeGreaterThanOrEqual(1280 * 0.9);
  expect(playerBox.width / playerBox.height).toBeGreaterThan(1.7);
  expect(playerBox.width / playerBox.height).toBeLessThan(1.8);
  expect(playerBox.width).toBeGreaterThanOrEqual(workspaceBox.width * 0.6);
  expect(playerBox.x + playerBox.width).toBeLessThanOrEqual(sceneSelectionBox.x);
  expect(playBox.y).toBeGreaterThanOrEqual(playerBox.y + playerBox.height);
  expect(boxesOverlap(playerBox, playBox)).toBe(false);
  await expect(player).toBeInViewport();
  await expect(sceneButton).toBeInViewport();
  await expect(sceneSelection.getByRole("navigation", { name: "Scenes" }).getByRole("button"))
    .toHaveCount(6);
  await sceneButton.click();
  const controls = page.getByRole("complementary", { name: "Line recording controls" });
  const editorPlayerBox = await boundingBoxOrThrow(player);
  for (const key of ["height", "width", "x", "y"] as const) {
    expect(Math.abs(editorPlayerBox[key] - playerBox[key])).toBeLessThanOrEqual(2);
  }
  await expect(controls).toBeInViewport();
  await expectNoHorizontalOverflow(page);
});

test("the narrow project keeps its full title and transport outside the scene artwork", async ({ page }) => {
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

  const stage = page.getByRole("region", { name: "Full video player" }).getByRole("img");
  await expect(stage).toHaveCount(1);
  const box = await boundingBoxOrThrow(stage);
  expect(Math.abs(box.width / box.height - 16 / 9)).toBeLessThan(0.01);
});

test("the desktop line editor keeps the full player left of its selected-line controls", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await expectDubProject(page);
  await openScene(page, 1);

  const workspace = page.getByRole("region", { name: "Dub project workspace" });
  const stage = page.getByRole("region", { name: "Full video player" });
  const controls = page.getByRole("complementary", { name: "Line recording controls" });
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

test("the narrow line editor puts its recording task before the supporting player", async ({ page }) => {
  await page.setViewportSize({ height: 568, width: 280 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await expectDubProject(page);
  await openScene(page, 1);

  const stage = page.getByRole("region", { name: "Full video player" });
  const lyric = page.getByRole("heading", { level: 2, name: DUCK_LINES[3].text });
  const controls = page.getByRole("complementary", { name: "Line recording controls" });
  const example = page.getByRole("button", { name: "Hear example" });
  const record = page.getByRole("button", { name: "Record line" });
  const finish = page.getByRole("button", { name: "Finish scene" });
  const [stageBox, lyricBox, controlsBox, exampleBox, recordBox, finishBox] = await Promise.all([
    boundingBoxOrThrow(stage),
    boundingBoxOrThrow(lyric),
    boundingBoxOrThrow(controls),
    boundingBoxOrThrow(example),
    boundingBoxOrThrow(record),
    boundingBoxOrThrow(finish),
  ]);

  expect(stageBox.y).toBeGreaterThanOrEqual(controlsBox.y + controlsBox.height);
  expect(lyricBox.y).toBeGreaterThanOrEqual(controlsBox.y);
  expect(lyricBox.y + lyricBox.height).toBeLessThanOrEqual(controlsBox.y + controlsBox.height);
  expect(recordBox.y).toBeGreaterThanOrEqual(exampleBox.y + exampleBox.height);
  expect(finishBox.y).toBeGreaterThanOrEqual(recordBox.y + recordBox.height);
  await expect(page.getByText("Line 4 of 4", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to scenes" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

for (const viewport of [
  { height: 568, width: 280 },
  { height: 844, width: 390 },
]) {
  test(`phone scene list and line controls remain reachable at ${viewport.width} by ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
    await expectDubProject(page);

    const sceneSelection = page.getByRole("complementary", { name: "Scene selection" });
    const sceneSix = sceneSelection.getByRole("button", {
      name: /^Scene 6, Sad mother duck, Ready to start$/,
    });
    await expectNoHorizontalOverflow(page);
    await sceneSix.scrollIntoViewIfNeeded();
    await expect(sceneSix).toBeInViewport();
    const [panelBox, sceneBox] = await Promise.all([
      boundingBoxOrThrow(sceneSelection),
      boundingBoxOrThrow(sceneSix),
    ]);
    expect(sceneBox.x).toBeGreaterThanOrEqual(panelBox.x);
    expect(sceneBox.x + sceneBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 1);
    await expectLearnerTargetsAtLeast48px(page);

    await sceneSix.focus();
    await page.keyboard.press("Enter");
    const lineHeading = page.getByRole("heading", {
      name: "Sad mother duck went out one day.",
    });
    await expect(lineHeading).toBeFocused();
    await expect(page.getByText("Line 1 of 4", { exact: true })).toHaveAttribute("aria-current", "step");

    for (const action of [
      page.getByRole("button", { name: "Back to scenes" }),
      page.getByRole("button", { name: "Hear example" }),
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

test("keyboard navigation focuses a selected scene and advances within it", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await expectDubProject(page);
  const scenes = page.getByRole("navigation", { name: "Scenes" });
  const sceneTwo = scenes.getByRole("button", {
    name: /^Scene 2, Four little ducks, Ready to start$/,
  });
  await expect(scenes.getByRole("button", {
    name: /^Scene 1, Five little ducks, Ready to start$/,
  })).not.toHaveAttribute("aria-current");

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
    "Line 6 selected. Not recorded.",
  );
});

test("keyboard scene selection focuses its first line heading", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await expectDubProject(page);
  const sceneButton = page.getByRole("navigation", { name: "Scenes" }).getByRole("button", {
    name: /^Scene 1, Five little ducks, 3 of 4 lines ready$/,
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
    .getByRole("button", { name: /Profile for ⁨Mia⁩, learner mode/ })
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

  await page.getByRole("button", { name: "Hear example" }).click();
  const stopExample = page.getByRole("button", { name: "Stop example" });
  await page.evaluate(() => {
    (window as typeof window & { __flushAnimationFrames(): void }).__flushAnimationFrames();
  });
  await expect(stopExample).toBeFocused();
});

test("short landscape shows the video beside a page-reachable complete scene list", async ({ page }) => {
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
  await expectDubProject(page);

  const routeHeader = page.getByRole("navigation", { name: "Page navigation" });
  const player = page.getByRole("region", { name: "Full video player" });
  const play = page.getByRole("button", { name: "Play full video" });
  const scenesPanel = page.getByRole("complementary", { name: "Scene selection" });
  const scenes = scenesPanel.getByRole("navigation", { name: "Scenes" });
  const first = scenes.getByRole("button", {
    name: /^Scene 1, Five little ducks, 3 of 4 lines ready$/,
  });
  const last = scenes.getByRole("button", {
    name: /^Scene 6, Sad mother duck, Ready to start$/,
  });
  const [headerBox, playerBox, playBox, scenesPanelBox, firstBox] = await Promise.all([
    boundingBoxOrThrow(routeHeader),
    boundingBoxOrThrow(player),
    boundingBoxOrThrow(play),
    boundingBoxOrThrow(scenesPanel),
    boundingBoxOrThrow(first),
  ]);
  for (const box of [playerBox, playBox, firstBox]) {
    expect(box.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
    expect(box.y + box.height).toBeLessThanOrEqual(360);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(640);
  }
  expect(scenesPanelBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
  expect(scenesPanelBox.x).toBeGreaterThanOrEqual(0);
  expect(scenesPanelBox.x + scenesPanelBox.width).toBeLessThanOrEqual(640);
  expect(playerBox.x + playerBox.width).toBeLessThanOrEqual(scenesPanelBox.x);
  expect(playBox.y).toBeGreaterThanOrEqual(playerBox.y + playerBox.height);
  for (const target of [play, first]) {
    await expectTargetAtLeast48(target);
  }
  await expect(scenes.getByRole("button")).toHaveCount(6);
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  await expectTargetAtLeast48(last);
  await expectNoHorizontalOverflow(page);
});

test("short landscape keeps completion feedback in the scene pane", async ({ page }) => {
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
  await expectDubProject(page);

  const scenePanel = page.getByRole("complementary", { name: "Scene selection" });
  const completionFeedback = scenePanel.getByText(
    "Your video is ready — great singing!",
    { exact: true },
  );
  await completionFeedback.scrollIntoViewIfNeeded();
  await expect(completionFeedback).toBeVisible();

  const [paneBox, feedbackBox] = await Promise.all([
    boundingBoxOrThrow(scenePanel),
    boundingBoxOrThrow(completionFeedback),
  ]);
  expect(feedbackBox.x).toBeGreaterThanOrEqual(paneBox.x);
  expect(feedbackBox.x + feedbackBox.width).toBeLessThanOrEqual(paneBox.x + paneBox.width);
  expect(feedbackBox.y).toBeGreaterThanOrEqual(paneBox.y);
  expect(feedbackBox.y + feedbackBox.height).toBeLessThanOrEqual(paneBox.y + paneBox.height);
  await expectFullyInViewport(page, completionFeedback);
});

for (const recovery of [
  { action: "Save again", microphone: "", scenario: "upload-retry-held" },
  { action: "Record again", microphone: "", scenario: "upload-rejected" },
  { action: "Record line", microphone: "&parrotE2eMicrophone=denied", scenario: "empty" },
] as const) {
  test(`short landscape keeps ${recovery.scenario} recovery beside the fixed player`, async ({ page }) => {
    await page.setViewportSize({ height: 360, width: 640 });
    await page.goto(`/dubs/five-little-ducks?parrotE2eDub=${recovery.scenario}${recovery.microphone}`);
    await expectDubProject(page);
    await openScene(page, 1);
    await holdDubRecordingEnd(page);
    await page.getByRole("button", { name: "Record line" }).click();
    if (recovery.microphone === "") {
      await page.getByRole("button", { name: "Stop recording" }).click();
    }

    const controls = page.getByRole("complementary", { name: "Line recording controls" });
    const feedback = page.getByRole("region", { name: "Your recording" });
    await expect(page.getByRole("region", { name: "Full video player" })).toBeInViewport();
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
    const feedbackMetrics = await feedback.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(feedbackMetrics.scrollHeight).toBeLessThanOrEqual(feedbackMetrics.clientHeight + 1);
    await page.getByRole("button", { name: recovery.action }).scrollIntoViewIfNeeded();
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
