import { Buffer } from "node:buffer";
import { expect, test, type Locator, type Page } from "@playwright/test";

const parrotLessonPath = "/lessons/parrot/01-peppas-high-ball/scenes/1";
const tinySceneWebp = Buffer.from(
  "UklGRh4AAABXRUJQVlA4TBEAAAAvDwACAAfQ5sp1vf+BiOh/AAA=",
  "base64",
);

type LessonMediaSnapshot = {
  consentRequests: number;
  cueCancellations: number;
  cues: Array<{
    endedAt: number | null;
    kind: "device" | "static";
    startedAt: number;
    text: string;
    volume: number;
  }>;
  evaluateRequests: number;
  getUserMediaCalls: number;
  pendingCues: number;
  pendingUploads: number;
  recorderStarts: Array<{ id: number; startedAt: number }>;
  recorderStops: Array<{ id: number; stoppedAt: number }>;
  stoppedTracks: number;
  uploads: Array<{
    attempt: number;
    lessonId: string;
    outcome: "failed" | "held" | "recording_disabled" | "saved";
    sceneIndex: number;
    size: number;
    source: "my" | "parrot";
    stepIndex: number;
    type: string;
  }>;
};

type LessonMediaController = {
  failNextCue(): boolean;
  rejectNextUpload(): boolean;
  releaseNextCue(): boolean;
  resolveNextUpload(): boolean;
  snapshot(): LessonMediaSnapshot;
};

const myLesson = {
  childName: "Mia",
  detailedSummary: "Mia joins Peppa for one bright kite line.",
  goalPhrases: ["Red kite!"],
  location: {
    description: "A sunny garden with one red kite.",
    name: "The garden",
  },
  scenes: [
    {
      background: "episode-garden",
      characters: ["peppa"],
      settingDescription: "Peppa looks at a red kite in the garden.",
      steps: [
        {
          dialogue: "Red kite!",
          emotes: { peppa: "listening" },
          speaker: "user",
        },
      ],
      title: "The Red Kite",
    },
  ],
  summary: "Mia joins in with a kite story.",
  title: "The Red Kite",
};

async function mockSceneArtwork(page: Page) {
  await page.route("https://media.parrotbook.com/**", async (route) => {
    await route.fulfill({ body: tinySceneWebp, contentType: "image/webp" });
  });
}

async function openParrotLesson(page: Page, scenario: string) {
  await mockSceneArtwork(page);
  await page.goto(`${parrotLessonPath}?parrotE2eLesson=${scenario}`);
  await expect(
    page.getByRole("button", { exact: true, name: "Let's go" }),
  ).toBeVisible();
}

async function openMyLesson(page: Page, scenario: string) {
  await page.route("**/api/lessons/my/device-guide", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        lesson: {
          id: "device-guide",
          lesson: myLesson,
          source: "generated",
        },
      }),
    });
  });
  await page.goto(
    `/lessons/my/device-guide/scenes/1?parrotE2eLesson=${scenario}`,
  );
  await expect(
    page.getByRole("button", { exact: true, name: "Let's go" }),
  ).toBeVisible();
}

async function startLesson(page: Page) {
  await page.getByRole("button", { exact: true, name: "Let's go" }).click();
}

function joinInPrompt(page: Page, phrase?: string) {
  const prompt = page.getByRole("region", { name: "Join in" });
  return phrase ? prompt.filter({ hasText: phrase }) : prompt;
}

async function mediaSnapshot(page: Page) {
  return page.evaluate(() => {
    const controller = (
      window as Window & {
        __parrotE2eLessonMedia?: LessonMediaController;
      }
    ).__parrotE2eLessonMedia;
    if (!controller) throw new Error("Lesson media controller is missing.");
    return controller.snapshot();
  });
}

async function controlLessonMedia(
  page: Page,
  action:
    | "failNextCue"
    | "rejectNextUpload"
    | "releaseNextCue"
    | "resolveNextUpload",
) {
  const acted = await page.evaluate((nextAction) => {
    const controller = (
      window as Window & {
        __parrotE2eLessonMedia?: LessonMediaController;
      }
    ).__parrotE2eLessonMedia;
    if (!controller) throw new Error("Lesson media controller is missing.");
    return controller[nextAction]();
  }, action);
  expect(acted).toBe(true);
}

async function visibleBox(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function expectInsideViewport(
  locator: Locator,
  viewport: { height: number; width: number },
) {
  const box = await visibleBox(locator);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  return box;
}

async function expectNoOverlap(first: Locator, second: Locator) {
  const firstBox = await visibleBox(first);
  const secondBox = await visibleBox(second);
  const horizontal =
    Math.min(firstBox.x + firstBox.width, secondBox.x + secondBox.width) -
    Math.max(firstBox.x, secondBox.x);
  const vertical =
    Math.min(firstBox.y + firstBox.height, secondBox.y + secondBox.height) -
    Math.max(firstBox.y, secondBox.y);
  expect(horizontal > 0 && vertical > 0).toBe(false);
}

test("the decoded artwork gates the focused start action", async ({ page }) => {
  let releaseArtwork!: () => void;
  const artworkReady = new Promise<void>((resolve) => {
    releaseArtwork = resolve;
  });
  await page.route("https://media.parrotbook.com/**", async (route) => {
    await artworkReady;
    await route.fulfill({ body: tinySceneWebp, contentType: "image/webp" });
  });
  await page.goto(`${parrotLessonPath}?parrotE2eLesson=no-consent`, {
    waitUntil: "domcontentloaded",
  });

  const loading = page.getByRole("button", { name: "Loading picture…" });
  await expect(loading).toBeDisabled();
  await expect(page.getByRole("region", { name: "Lesson progress" })).toHaveCount(0);
  releaseArtwork();
  const start = page.getByRole("button", { exact: true, name: "Let's go" });
  await expect(start).toBeVisible();
  await expect(start).toBeFocused();
});

test("failed artwork can be retried before the story begins", async ({ page }) => {
  let requests = 0;
  await page.route("https://media.parrotbook.com/**", async (route) => {
    requests += 1;
    if (requests === 1) {
      await route.abort("failed");
      return;
    }
    await route.fulfill({ body: tinySceneWebp, contentType: "image/webp" });
  });
  await page.goto(`${parrotLessonPath}?parrotE2eLesson=no-consent`);

  await expect(page.getByText("No picture yet.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Try loading picture again" }).click();
  await expect(
    page.getByRole("button", { exact: true, name: "Let's go" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Lesson progress" })).toHaveCount(0);
});

test("stalled artwork becomes retryable without exposing scene controls", async ({
  page,
}) => {
  let releaseArtwork!: () => void;
  const artworkReady = new Promise<void>((resolve) => {
    releaseArtwork = resolve;
  });
  await page.clock.install();
  await page.route("https://media.parrotbook.com/**", async (route) => {
    await artworkReady;
    await route.fulfill({ body: tinySceneWebp, contentType: "image/webp" });
  });
  await page.goto(`${parrotLessonPath}?parrotE2eLesson=no-consent`, {
    waitUntil: "domcontentloaded",
  });

  await expect(page.getByRole("button", { name: "Loading picture…" })).toBeDisabled();
  await page.clock.fastForward(8_001);
  await expect(
    page.getByRole("alert").filter({ hasText: "No picture yet." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try loading picture again" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Lesson playback controls" }),
  ).toHaveCount(0);

  releaseArtwork();
});

test("narration remains distinct from character speech", async ({ page }) => {
  const narrationLesson = structuredClone(myLesson);
  narrationLesson.scenes[0].steps.unshift({
    dialogue: "The kite dances in the wind.",
    emotes: { peppa: "listening" },
    speaker: "narrator",
  });
  await page.route("**/api/lessons/my/narration-guide", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        lesson: {
          id: "narration-guide",
          lesson: narrationLesson,
          source: "generated",
        },
      }),
    });
  });
  await page.goto(
    "/lessons/my/narration-guide/scenes/1?parrotE2eLesson=device-no-consent",
  );
  await startLesson(page);

  await expect(page.getByRole("status", { name: "Lesson narration" })).toBeVisible();
  await expect(page.getByText("Story", { exact: true })).toBeVisible();
  await expect(page.getByText(/Listen · Narrator/)).toHaveCount(0);
});

test("ordinary sound failure keeps its existing retry and skip recovery", async ({
  page,
}) => {
  await openParrotLesson(page, "story-failure");
  await startLesson(page);
  await expect(
    page
      .getByRole("alert")
      .getByText("The sound stopped. Try it again or skip this sound.", {
        exact: true,
      }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try sound" })).toBeVisible();
  await page.getByRole("button", { name: "Skip sound" }).click();
  await expect(page.getByRole("status", { name: "Dolly is speaking" })).toBeVisible();
});

test("consent preflight leads to a fresh capture for every automatic beat", async ({
  page,
}) => {
  await openParrotLesson(page, "recording");
  await expect.poll(async () => (await mediaSnapshot(page)).consentRequests).toBe(1);

  await startLesson(page);
  await expect(joinInPrompt(page, "It is up high!")).toBeVisible();
  await expect
    .poll(async () => (await mediaSnapshot(page)).uploads.length)
    .toBeGreaterThanOrEqual(1);
  await expect(joinInPrompt(page, "Oh! I can't reach it.")).toBeVisible();
  await expect
    .poll(async () => (await mediaSnapshot(page)).uploads.length)
    .toBeGreaterThanOrEqual(2);

  const snapshot = await mediaSnapshot(page);
  expect(snapshot.consentRequests).toBe(1);
  expect(snapshot.recorderStarts.length).toBeGreaterThanOrEqual(2);
  expect(snapshot.getUserMediaCalls).toBe(snapshot.recorderStarts.length + 1);
  expect(new Set(snapshot.recorderStarts.map(({ id }) => id)).size).toBe(
    snapshot.recorderStarts.length,
  );
  expect(snapshot.cues.slice(0, 2).map(({ kind, volume }) => ({ kind, volume }))).toEqual([
    { kind: "static", volume: 0.28 },
    { kind: "static", volume: 0.28 },
  ]);
  expect(snapshot.recorderStarts[0].startedAt).toBeLessThanOrEqual(
    snapshot.cues[0].startedAt,
  );
  expect(snapshot.recorderStops[0].stoppedAt - snapshot.cues[0].endedAt!).toBeGreaterThanOrEqual(
    240,
  );
  expect(snapshot.uploads.slice(0, 2)).toMatchObject([
    {
      lessonId: "01-peppas-high-ball",
      sceneIndex: 0,
      size: expect.any(Number),
      source: "parrot",
      stepIndex: 2,
      type: "audio/webm",
    },
    {
      lessonId: "01-peppas-high-ball",
      sceneIndex: 1,
      size: expect.any(Number),
      source: "parrot",
      stepIndex: 1,
      type: "audio/webm",
    },
  ]);
  expect(snapshot.uploads.every(({ size }) => size > 0)).toBe(true);
  expect(snapshot.evaluateRequests).toBe(0);
  await expect(
    page.getByText(/checking your words|tap to talk|skip speaking|great job/i),
  ).toHaveCount(0);
});

test("missing consent makes no microphone request and keeps the same cue", async ({
  page,
}) => {
  await openParrotLesson(page, "held-cue-no-consent");
  await startLesson(page);

  const prompt = joinInPrompt(page, "It is up high!");
  await expect(prompt).toBeVisible();
  await expect(prompt.getByText("Voices are joining in", { exact: true })).toBeVisible();
  const snapshot = await mediaSnapshot(page);
  expect(snapshot.getUserMediaCalls).toBe(0);
  expect(snapshot.recorderStarts).toHaveLength(0);
  expect(snapshot.cues[0]).toMatchObject({ kind: "static", volume: 0.28 });
});

test("an unreadable consent state fails closed without touching the microphone", async ({
  page,
}) => {
  await openParrotLesson(page, "consent-error");
  await startLesson(page);
  await expect(joinInPrompt(page, "It is up high!")).toBeVisible();
  expect((await mediaSnapshot(page)).getUserMediaCalls).toBe(0);
});

test("denied preflight shows one calm note and continues cue-only", async ({
  page,
}) => {
  await openParrotLesson(page, "denied-preflight");
  await startLesson(page);

  await expect(joinInPrompt(page, "It is up high!")).toBeVisible();
  await expect(
    page.getByText("The microphone is unavailable, but the story will keep going."),
  ).toBeVisible();
  await expect(joinInPrompt(page, "Oh! I can't reach it.")).toBeVisible();
  const snapshot = await mediaSnapshot(page);
  expect(snapshot.getUserMediaCalls).toBe(1);
  expect(snapshot.recorderStarts).toHaveLength(0);
  expect(snapshot.uploads).toHaveLength(0);
});

test("a later beat microphone failure disables only future captures", async ({
  page,
}) => {
  await openParrotLesson(page, "later-mic-failure");
  await startLesson(page);
  await expect
    .poll(async () => (await mediaSnapshot(page)).uploads.length)
    .toBe(1);
  await expect(joinInPrompt(page, "Oh! I can't reach it.")).toBeVisible();
  await expect(
    page.getByText("The microphone is unavailable, but the story will keep going."),
  ).toBeVisible();
  await expect(joinInPrompt(page, "Can you help me, please?")).toBeVisible();

  const snapshot = await mediaSnapshot(page);
  expect(snapshot.getUserMediaCalls).toBe(3);
  expect(snapshot.recorderStarts).toHaveLength(1);
  expect(snapshot.uploads).toHaveLength(1);
});

test("My Lessons use the exact on-device guide at quiet volume", async ({ page }) => {
  await openMyLesson(page, "device-no-consent");
  await startLesson(page);
  await expect(joinInPrompt(page, "Red kite!")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();

  const snapshot = await mediaSnapshot(page);
  expect(snapshot.getUserMediaCalls).toBe(0);
  expect(snapshot.cues).toMatchObject([
    { kind: "device", text: "Red kite!", volume: 0.28 },
  ]);
});

test("cue failure discards partial capture, holds the phrase briefly, and advances", async ({
  page,
}) => {
  await openParrotLesson(page, "cue-failure");
  await startLesson(page);
  const prompt = joinInPrompt(page, "It is up high!");
  await expect(prompt).toBeVisible();
  await page.waitForTimeout(250);
  await expect(prompt).toBeVisible();
  await expect(page).toHaveURL(/\/scenes\/2/);

  const snapshot = await mediaSnapshot(page);
  expect(snapshot.recorderStarts).toHaveLength(1);
  expect(snapshot.uploads).toHaveLength(0);
});

test("pausing a join-in cancels it and resume starts the same beat cleanly", async ({
  page,
}) => {
  await openParrotLesson(page, "held-cue");
  await startLesson(page);
  await expect(joinInPrompt(page, "It is up high!")).toBeVisible();
  await expect.poll(async () => (await mediaSnapshot(page)).pendingCues).toBe(1);

  await page.getByRole("button", { name: "Pause lesson" }).click();
  await expect(page.getByRole("button", { name: "Resume lesson" })).toBeVisible();
  await expect.poll(async () => (await mediaSnapshot(page)).cueCancellations).toBe(1);
  expect((await mediaSnapshot(page)).uploads).toHaveLength(0);

  await page.getByRole("button", { name: "Resume lesson" }).click();
  await expect
    .poll(async () => (await mediaSnapshot(page)).recorderStarts.length)
    .toBe(2);
  await controlLessonMedia(page, "releaseNextCue");
  await expect.poll(async () => (await mediaSnapshot(page)).uploads.length).toBe(1);
  expect((await mediaSnapshot(page)).uploads[0]).toMatchObject({
    sceneIndex: 0,
    stepIndex: 2,
  });
});

test("next and previous navigation cancel only the unfinished visible capture", async ({
  page,
}) => {
  await openParrotLesson(page, "held-cue");
  await startLesson(page);
  await expect(joinInPrompt(page, "It is up high!")).toBeVisible();
  await expect.poll(async () => (await mediaSnapshot(page)).pendingCues).toBe(1);

  await page.getByRole("button", { name: "Next scene" }).click();
  await expect(page).toHaveURL(/\/scenes\/2/);
  await expect.poll(async () => (await mediaSnapshot(page)).cueCancellations).toBe(1);
  await expect(joinInPrompt(page, "Oh! I can't reach it.")).toBeVisible();
  await expect.poll(async () => (await mediaSnapshot(page)).pendingCues).toBe(1);

  await page.getByRole("button", { name: "Previous scene" }).click();
  await expect(page).toHaveURL(/\/scenes\/1/);
  await expect.poll(async () => (await mediaSnapshot(page)).cueCancellations).toBe(2);
  expect((await mediaSnapshot(page)).uploads).toHaveLength(0);
});

test("Back cancels an unfinished cue without creating a recording", async ({
  page,
}) => {
  await openParrotLesson(page, "held-cue");
  await startLesson(page);
  await expect(joinInPrompt(page, "It is up high!")).toBeVisible();
  await expect.poll(async () => (await mediaSnapshot(page)).pendingCues).toBe(1);

  await page.getByRole("button", { name: "Back to lesson list" }).click();
  await expect(page).toHaveURL(/\/lessons$/);
  await expect.poll(async () => (await mediaSnapshot(page)).cueCancellations).toBe(1);
  expect((await mediaSnapshot(page)).uploads).toHaveLength(0);
});

test("history POP cancels the current beat and restores an idle routed scene", async ({
  page,
}) => {
  await openParrotLesson(page, "held-cue-no-consent");
  await startLesson(page);
  await expect(joinInPrompt(page, "It is up high!")).toBeVisible();
  await page.getByRole("button", { name: "Next scene" }).click();
  await expect(page).toHaveURL(/\/scenes\/2/);
  await expect(joinInPrompt(page, "Oh! I can't reach it.")).toBeVisible();
  await expect.poll(async () => (await mediaSnapshot(page)).pendingCues).toBe(1);

  await page.goBack();
  await expect(page).toHaveURL(/\/scenes\/1/);
  await expect(
    page.getByRole("button", { exact: true, name: "Let's go" }),
  ).toBeFocused();
  await expect.poll(async () => (await mediaSnapshot(page)).cueCancellations).toBe(2);
});

test("ordinary story audio still pauses and resumes in place", async ({ page }) => {
  await openParrotLesson(page, "held-story");
  await startLesson(page);
  await expect(page.getByRole("status", { name: "Peppa is speaking" })).toBeVisible();
  await page.getByRole("button", { name: "Pause lesson" }).click();
  await expect(page.getByRole("button", { name: "Resume lesson" })).toBeVisible();
  await page.getByRole("button", { name: "Resume lesson" }).click();
  await controlLessonMedia(page, "releaseNextCue");
  await expect(page.getByRole("status", { name: "Dolly is speaking" })).toBeVisible();
});

test("a held upload never blocks completion and reports neutral saving", async ({
  page,
}) => {
  await openMyLesson(page, "upload-held");
  await startLesson(page);
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();
  await expect(page.getByText("Saving your voices…", { exact: true })).toBeVisible();
  expect((await mediaSnapshot(page)).pendingUploads).toBe(1);

  await controlLessonMedia(page, "resolveNextUpload");
  await expect(page.getByText("Saving your voices…", { exact: true })).toHaveCount(0);
});

test("completion focuses Replay and restarts without reloading consent", async ({
  page,
}) => {
  await openMyLesson(page, "device-no-consent");
  await startLesson(page);
  const replay = page.getByRole("button", { name: "Replay lesson" });
  await expect(replay).toBeFocused();
  await replay.click();
  await expect(joinInPrompt(page, "Red kite!")).toBeVisible();
  const snapshot = await mediaSnapshot(page);
  expect(snapshot.consentRequests).toBe(1);
  expect(snapshot.getUserMediaCalls).toBe(0);
});

test("failed background saving can be retried without repeating the line", async ({
  page,
}) => {
  await openMyLesson(page, "upload-failed");
  await startLesson(page);
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();
  const retry = page.getByRole("button", { name: "Try saving again" });
  await expect(retry).toBeVisible();
  expect((await mediaSnapshot(page)).uploads[0].outcome).toBe("failed");

  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect.poll(async () => (await mediaSnapshot(page)).uploads.length).toBe(2);
  expect((await mediaSnapshot(page)).uploads[1].outcome).toBe("saved");
  await expect(page.getByText(/say it again|try the words again/i)).toHaveCount(0);
});

test("a completed blob keeps uploading after the lesson route exits", async ({
  page,
}) => {
  await openMyLesson(page, "upload-held");
  await startLesson(page);
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();
  await expect.poll(async () => (await mediaSnapshot(page)).pendingUploads).toBe(1);

  await page.getByRole("button", { name: "Back to lesson list" }).click();
  await expect(page).toHaveURL(/\/lessons$/);
  await controlLessonMedia(page, "resolveNextUpload");
  await expect.poll(async () => (await mediaSnapshot(page)).pendingUploads).toBe(0);
  expect((await mediaSnapshot(page)).uploads[0].outcome).toBe("saved");
});

test("a server recording-disabled result prevents later microphone capture", async ({
  page,
}) => {
  await openParrotLesson(page, "recording-disabled");
  await startLesson(page);
  await expect
    .poll(async () => (await mediaSnapshot(page)).uploads[0]?.outcome)
    .toBe("recording_disabled");
  await expect(joinInPrompt(page, "Oh! I can't reach it.")).toBeVisible();

  const snapshot = await mediaSnapshot(page);
  expect(snapshot.getUserMediaCalls).toBe(2);
  expect(snapshot.recorderStarts).toHaveLength(1);
});

test("a recording stop failure discards only that clip and continues", async ({
  page,
}) => {
  await openMyLesson(page, "stop-failure");
  await startLesson(page);
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();
  expect((await mediaSnapshot(page)).uploads).toHaveLength(0);
});

for (const viewport of [
  { name: "ultra-narrow", width: 280, height: 568 },
  { name: "short landscape", width: 640, height: 360 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test(`join-in words and playback controls stay contained on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openParrotLesson(page, "held-cue-no-consent");
    const intro = page.getByRole("region", { name: "Lesson introduction" });
    await expectInsideViewport(intro, viewport);
    await startLesson(page);

    const prompt = joinInPrompt(page, "It is up high!");
    const controls = page.getByRole("navigation", {
      name: "Lesson playback controls",
    });
    await expectInsideViewport(
      page.getByRole("region", { name: "Lesson artwork" }),
      viewport,
    );
    await expectInsideViewport(
      page.getByRole("region", { name: "Lesson progress" }),
      viewport,
    );
    await expectInsideViewport(prompt, viewport);
    await expectInsideViewport(controls, viewport);
    await expectNoOverlap(prompt, controls);
    await expect(
      page.getByRole("button", { name: "Back to lesson list" }),
    ).toBeVisible();
    await expectNoOverlap(
      page.getByRole("button", { name: "Back to lesson list" }),
      prompt,
    );
  });
}
