import { Buffer } from "node:buffer";
import { expect, test, type Locator, type Page } from "@playwright/test";

const parrotLessonPath = "/lessons/parrot/01-peppas-high-ball/scenes/1";
const tinySceneWebp = Buffer.from(
  "UklGRh4AAABXRUJQVlA4TBEAAAAvDwACAAfQ5sp1vf+BiOh/AAA=",
  "base64",
);
const longDialogue =
  "Can you help me carry the bright yellow picnic basket to the big tree, please? I want to share apples, sandwiches, and juice with all our friends.";
const myLessonRevision = "a".repeat(64);

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
    outcome:
      | "failed"
      | "held"
      | "lesson_changed"
      | "recording_disabled"
      | "saved";
    revision: string | null;
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

type LessonMicrophoneController = {
  pending: number;
  rejected: number;
  rejectNext(): boolean;
  requests: number;
  resolved: number;
  resolveNext(): boolean;
  stoppedTracks: number;
};

type ArtworkDecodeController = {
  holdConnectedDecodes: boolean;
  pendingDetachedDecodes: number;
  releaseDetachedDecodes(): number;
  resolvedDetachedDecodes: number;
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

const longDialogueLesson = {
  ...myLesson,
  detailedSummary: "Mia helps Peppa and Dolly carry a picnic basket.",
  goalPhrases: [longDialogue],
  scenes: [
    {
      background: "episode-garden",
      characters: ["peppa", "dolly"],
      settingDescription: "Peppa and Dolly wait beside a full picnic basket.",
      steps: [
        {
          dialogue: longDialogue,
          emotes: { dolly: "listening", peppa: "listening" },
          speaker: "user",
        },
      ],
      title: "Packing the Picnic",
    },
  ],
  summary: "Mia joins Peppa and Dolly for a picnic.",
  title: "The Big Picnic",
};

async function mockSceneArtwork(page: Page) {
  await page.route("https://media.parrotbook.com/**", async (route) => {
    await route.fulfill({ body: tinySceneWebp, contentType: "image/webp" });
  });
}

async function openParrotLesson(
  page: Page,
  scenario: string,
  microphoneScenario?: "denied",
) {
  await mockSceneArtwork(page);
  await page.goto(
    `${parrotLessonPath}?parrotE2eLesson=${scenario}` +
      (microphoneScenario
        ? `&parrotE2eMicrophone=${microphoneScenario}`
        : ""),
  );
  await expect(
    page.getByRole("button", { exact: true, name: "Let's go" }),
  ).toBeVisible();
}

async function openMyLesson(
  page: Page,
  scenario: string,
  { id = "device-guide", lesson = myLesson }: { id?: string; lesson?: unknown } = {},
) {
  await page.route(`**/api/lessons/my/${id}`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        lesson: {
          id,
          lesson,
          revision: myLessonRevision,
          source: "generated",
        },
      }),
    });
  });
  await page.goto(`/lessons/my/${id}/scenes/1?parrotE2eLesson=${scenario}`);
  await expect(
    page.getByRole("button", { exact: true, name: "Let's go" }),
  ).toBeVisible();
}

async function openSceneOneWithSceneTwoBehind(page: Page, scenario: string) {
  await mockSceneArtwork(page);
  const query = `?parrotE2eLesson=${scenario}`;
  await page.goto(
    `/lessons/parrot/01-peppas-high-ball/scenes/2${query}`,
  );
  await expect(
    page.getByRole("button", { exact: true, name: "Let's go" }),
  ).toBeVisible();
  await page.evaluate(
    ({ sceneOne }) => {
      const current = window.history.state ?? {};
      window.history.pushState(
        {
          ...current,
          idx: Number(current.idx ?? 0) + 1,
          key: "held-preflight-scene-1",
        },
        "",
        sceneOne,
      );
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: window.history.state }),
      );
    },
    { sceneOne: `${parrotLessonPath}${query}` },
  );
  await expect(page).toHaveURL(/\/scenes\/1/);
  await expect(
    page.getByRole("button", { exact: true, name: "Let's go" }),
  ).toBeFocused();
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

async function microphoneSnapshot(page: Page) {
  return page.evaluate(() => {
    const controller = (
      window as Window & {
        __parrotE2eLessonMicrophone?: LessonMicrophoneController;
      }
    ).__parrotE2eLessonMicrophone;
    if (!controller) throw new Error("Lesson microphone controller is missing.");
    return {
      pending: controller.pending,
      rejected: controller.rejected,
      requests: controller.requests,
      resolved: controller.resolved,
      stoppedTracks: controller.stoppedTracks,
    };
  });
}

async function controlLessonMicrophone(
  page: Page,
  action: "rejectNext" | "resolveNext",
) {
  const acted = await page.evaluate((nextAction) => {
    const controller = (
      window as Window & {
        __parrotE2eLessonMicrophone?: LessonMicrophoneController;
      }
    ).__parrotE2eLessonMicrophone;
    if (!controller) throw new Error("Lesson microphone controller is missing.");
    return controller[nextAction]();
  }, action);
  expect(acted).toBe(true);
}

async function installArtworkDecodeController(page: Page) {
  await page.addInitScript(() => {
    const nativeDecode = HTMLImageElement.prototype.decode;
    const detachedDecodes: Array<() => void> = [];
    const controller = {
      holdConnectedDecodes: false,
      get pendingDetachedDecodes() {
        return detachedDecodes.length;
      },
      releaseDetachedDecodes() {
        const pending = detachedDecodes.splice(0);
        for (const decode of pending) decode();
        return pending.length;
      },
      resolvedDetachedDecodes: 0,
    };
    (
      window as Window & {
        __parrotE2eArtworkDecode?: ArtworkDecodeController;
      }
    ).__parrotE2eArtworkDecode = controller;
    HTMLImageElement.prototype.decode = function () {
      if (!this.isConnected) {
        return new Promise((resolve, reject) => {
          detachedDecodes.push(() => {
            nativeDecode.call(this).then((value) => {
              controller.resolvedDetachedDecodes += 1;
              resolve(value);
            }, reject);
          });
        });
      }
      if (controller.holdConnectedDecodes) return new Promise(() => {});
      return nativeDecode.call(this);
    };
  });
}

async function artworkDecodeSnapshot(page: Page) {
  return page.evaluate(() => {
    const controller = (
      window as Window & {
        __parrotE2eArtworkDecode?: ArtworkDecodeController;
      }
    ).__parrotE2eArtworkDecode;
    if (!controller) throw new Error("Artwork decode controller is missing.");
    return {
      pendingDetachedDecodes: controller.pendingDetachedDecodes,
      resolvedDetachedDecodes: controller.resolvedDetachedDecodes,
    };
  });
}

async function releaseDetachedArtworkDecodes(page: Page) {
  const released = await page.evaluate(() => {
    const controller = (
      window as Window & {
        __parrotE2eArtworkDecode?: ArtworkDecodeController;
      }
    ).__parrotE2eArtworkDecode;
    if (!controller) throw new Error("Artwork decode controller is missing.");
    return controller.releaseDetachedDecodes();
  });
  expect(released).toBeGreaterThan(0);
  await expect
    .poll(async () => (await artworkDecodeSnapshot(page)).resolvedDetachedDecodes)
    .toBeGreaterThanOrEqual(released);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
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

async function expectContainedBy(child: Locator, parent: Locator) {
  const childBox = await visibleBox(child);
  const parentBox = await visibleBox(parent);
  expect(childBox.x).toBeGreaterThanOrEqual(parentBox.x);
  expect(childBox.y).toBeGreaterThanOrEqual(parentBox.y);
  expect(childBox.x + childBox.width).toBeLessThanOrEqual(
    parentBox.x + parentBox.width,
  );
  expect(childBox.y + childBox.height).toBeLessThanOrEqual(
    parentBox.y + parentBox.height,
  );
}

async function expectLongTextReachable(locator: Locator) {
  const metrics = await locator.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  if (metrics.scrollHeight > metrics.clientHeight) {
    await expect(locator).toHaveAttribute("tabindex", "0");
    await locator.focus();
    await locator.press("End");
    await expect
      .poll(() => locator.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await locator.press("Home");
    await expect
      .poll(() => locator.evaluate((element) => element.scrollTop))
      .toBe(0);
  } else {
    await expect(locator).not.toHaveAttribute("tabindex", "0");
  }
}

async function expectNoPageOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    height: window.innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.height);
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
  await expect(page.getByRole("status", { name: "Lesson updates" })).toHaveText(
    "Press Let's go to begin",
  );
});

test("decoded artwork does not steal focus from an open account menu", async ({
  page,
}) => {
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

  await expect(
    page.getByRole("button", { name: "Loading picture…" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: /^Profile for .+, learner mode$/ })
    .click();
  const grownUpAccess = page.getByRole("menuitem", {
    name: /Grown-up access/,
  });
  await expect(grownUpAccess).toBeFocused();

  releaseArtwork();
  await expect(
    page.getByRole("button", { exact: true, name: "Let's go" }),
  ).toBeVisible();
  await expect(grownUpAccess).toBeFocused();
});

// Catches watching unrelated preloaded artwork when focusing the current start action.
test("finishing a next-scene preload does not steal focus from lesson navigation", async ({
  page,
}) => {
  await installArtworkDecodeController(page);
  await openParrotLesson(page, "no-consent");
  await expect
    .poll(async () => (await artworkDecodeSnapshot(page)).pendingDetachedDecodes)
    .toBeGreaterThan(0);

  const back = page.getByRole("button", { name: "Back to lesson list" });
  await back.focus();
  await expect(back).toBeFocused();
  await releaseDetachedArtworkDecodes(page);

  await expect(back).toBeFocused();
});

// Catches restarting current story playback when unrelated preloaded artwork becomes ready.
test("finishing a next-scene preload does not restart active story audio", async ({
  page,
}) => {
  await installArtworkDecodeController(page);
  await openParrotLesson(page, "held-story");
  await expect
    .poll(async () => (await artworkDecodeSnapshot(page)).pendingDetachedDecodes)
    .toBeGreaterThan(0);
  await startLesson(page);
  await expect(page.getByRole("status", { name: "Peppa is speaking" })).toBeVisible();
  await expect.poll(async () => (await mediaSnapshot(page)).pendingCues).toBe(1);
  const before = await mediaSnapshot(page);

  await releaseDetachedArtworkDecodes(page);

  const after = await mediaSnapshot(page);
  expect(after.cueCancellations).toBe(before.cueCancellations);
  expect(after.cues).toHaveLength(before.cues.length);
  expect(after.pendingCues).toBe(1);
});

// Catches restarting the current join-in cue when unrelated preloaded artwork becomes ready.
test("finishing a next-scene preload does not restart an active join-in cue", async ({
  page,
}) => {
  await installArtworkDecodeController(page);
  await openParrotLesson(page, "held-cue-no-consent");
  await expect
    .poll(async () => (await artworkDecodeSnapshot(page)).pendingDetachedDecodes)
    .toBeGreaterThan(0);
  await startLesson(page);
  await expect(joinInPrompt(page, "It is up high!")).toBeVisible();
  await expect.poll(async () => (await mediaSnapshot(page)).pendingCues).toBe(1);
  const before = await mediaSnapshot(page);

  await releaseDetachedArtworkDecodes(page);

  const after = await mediaSnapshot(page);
  expect(after.cueCancellations).toBe(before.cueCancellations);
  expect(after.cues).toHaveLength(before.cues.length);
  expect(after.pendingCues).toBe(1);
});

// Catches removing the successful-preload handleArtworkDecoded call in LessonPlayer.
test("a decoded next-scene preload never shows the loading picture layer during automatic transition", async ({
  page,
}) => {
  await installArtworkDecodeController(page);
  await openParrotLesson(page, "held-cue-no-consent");
  await expect
    .poll(async () => (await artworkDecodeSnapshot(page)).pendingDetachedDecodes)
    .toBeGreaterThan(0);
  await releaseDetachedArtworkDecodes(page);
  await page.evaluate(() => {
    const controller = (
      window as Window & {
        __parrotE2eArtworkDecode?: ArtworkDecodeController;
      }
    ).__parrotE2eArtworkDecode;
    if (!controller) throw new Error("Artwork decode controller is missing.");
    controller.holdConnectedDecodes = true;
  });

  await startLesson(page);
  await expect(joinInPrompt(page, "It is up high!")).toBeVisible();
  await controlLessonMedia(page, "releaseNextCue");

  await expect(page).toHaveURL(/\/scenes\/2/);
  await expect(
    page.getByRole("status").filter({ hasText: "Loading picture…" }),
  ).toHaveCount(0);
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
          revision: myLessonRevision,
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

test("a malformed successful consent response still fails closed", async ({ page }) => {
  await openParrotLesson(page, "malformed-consent");
  await startLesson(page);

  const prompt = joinInPrompt(page, "It is up high!");
  await expect(prompt).toBeVisible();
  await expect(prompt.getByText("Voices are joining in", { exact: true })).toBeVisible();
  const snapshot = await mediaSnapshot(page);
  expect(snapshot.getUserMediaCalls).toBe(0);
  expect(snapshot.recorderStarts).toHaveLength(0);
});

test("denied preflight shows one calm note and continues cue-only", async ({
  page,
}) => {
  await openParrotLesson(page, "held-cue", "denied");
  await startLesson(page);

  await expect(joinInPrompt(page, "It is up high!")).toBeVisible();
  const help = page.getByRole("status", { name: "Speaking help" });
  await expect(
    help.getByText("The microphone is unavailable, but the story will keep going."),
  ).toBeVisible();
  await expect(
    page
      .getByRole("alert")
      .getByText("The microphone is unavailable, but the story will keep going."),
  ).toHaveCount(0);
  await controlLessonMedia(page, "releaseNextCue");
  await expect(joinInPrompt(page, "Oh! I can't reach it.")).toBeVisible();
  const snapshot = await mediaSnapshot(page);
  expect(snapshot.getUserMediaCalls).toBe(1);
  expect(snapshot.recorderStarts).toHaveLength(0);
  expect(snapshot.uploads).toHaveLength(0);
});

test("a later beat microphone failure disables only future captures", async ({
  page,
}) => {
  await openParrotLesson(page, "held-later-mic-failure");
  await startLesson(page);
  await expect
    .poll(async () => (await mediaSnapshot(page)).uploads.length)
    .toBe(1);
  await expect(joinInPrompt(page, "Oh! I can't reach it.")).toBeVisible();
  await expect.poll(async () => (await microphoneSnapshot(page)).pending).toBe(1);
  const back = page.getByRole("button", { name: "Back to lesson list" });
  await back.focus();
  await controlLessonMicrophone(page, "rejectNext");
  await expect(
    page
      .getByRole("status", { name: "Speaking help" })
      .getByText("The microphone is unavailable, but the story will keep going."),
  ).toBeVisible();
  await expect(back).toBeFocused();
  await expect(joinInPrompt(page, "Can you help me, please?")).toBeVisible();

  const snapshot = await mediaSnapshot(page);
  expect(snapshot.getUserMediaCalls).toBe(3);
  expect(snapshot.recorderStarts).toHaveLength(1);
  expect(snapshot.uploads).toHaveLength(1);
});

for (const outcome of ["rejectNext", "resolveNext"] as const) {
  test(`a ${outcome === "rejectNext" ? "rejected" : "resolved"} cancelled preflight cannot affect the routed scene`, async ({
    page,
  }) => {
    await openSceneOneWithSceneTwoBehind(page, "held-preflight");
    await startLesson(page);
    await expect.poll(async () => (await microphoneSnapshot(page)).pending).toBe(1);

    await page.goBack();
    await expect(page).toHaveURL(/\/scenes\/2/);
    const nextStart = page.getByRole("button", { exact: true, name: "Let's go" });
    await expect(nextStart).toBeFocused();
    await nextStart.click();
    await expect.poll(async () => (await mediaSnapshot(page)).getUserMediaCalls).toBe(2);
    await expect.poll(async () => (await mediaSnapshot(page)).pendingCues).toBe(1);
    await controlLessonMicrophone(page, outcome);
    await expect.poll(async () => (await microphoneSnapshot(page)).pending).toBe(0);

    await expect(page.getByRole("status", { name: "Speaking help" })).toHaveCount(0);
    await expect(page).toHaveURL(/\/scenes\/2/);
    await controlLessonMedia(page, "releaseNextCue");
    await expect
      .poll(async () => (await mediaSnapshot(page)).uploads[0]?.sceneIndex)
      .toBe(1);
    const microphone = await microphoneSnapshot(page);
    expect(microphone.requests).toBe(1);
    if (outcome === "resolveNext") {
      expect(microphone.stoppedTracks).toBe(1);
    }
  });
}

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

test("cue failure discards partial capture, holds the phrase for 700ms, and advances", async ({
  page,
}) => {
  const clockStartedAt = Date.parse("2026-08-26T08:00:00.000Z");
  await page.clock.install({ time: clockStartedAt });
  await openParrotLesson(page, "held-cue");
  await startLesson(page);
  await page.clock.runFor(450);
  const prompt = joinInPrompt(page, "It is up high!");
  await expect(prompt).toBeVisible();
  await expect.poll(async () => (await mediaSnapshot(page)).pendingCues).toBe(1);

  await page.clock.pauseAt(clockStartedAt + 10_000);
  await controlLessonMedia(page, "failNextCue");
  await page.clock.runFor(699);
  await expect(prompt).toBeVisible();
  await expect(page).toHaveURL(/\/scenes\/1/);

  await page.clock.runFor(1);
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
  await openMyLesson(page, "upload-retry-held");
  await startLesson(page);
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();
  const retry = page.getByRole("button", { name: "Try saving again" });
  await expect(retry).toBeVisible();
  expect((await mediaSnapshot(page)).uploads[0].outcome).toBe("failed");

  await retry.click();
  await expect(retry).toHaveCount(0);
  const replay = page.getByRole("button", { name: "Replay lesson" });
  await expect(page.getByText("Saving your voices…", { exact: true })).toBeVisible();
  await expect(replay).toBeFocused();
  await expect.poll(async () => (await mediaSnapshot(page)).pendingUploads).toBe(1);
  await controlLessonMedia(page, "resolveNextUpload");
  await expect(page.getByText("Saving your voices…", { exact: true })).toHaveCount(0);
  await expect(replay).toBeFocused();
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

test("pending account deletion settles saving and disables later captures", async ({
  page,
}) => {
  const twoBeatLesson = structuredClone(myLesson);
  twoBeatLesson.scenes[0].steps.push(
    {
      dialogue: "The kite turns.",
      emotes: { peppa: "listening" },
      speaker: "narrator",
    },
    {
      dialogue: "Green kite!",
      emotes: { peppa: "listening" },
      speaker: "user",
    },
  );
  await openMyLesson(page, "account-deletion-pending", {
    id: "deletion-guide",
    lesson: twoBeatLesson,
  });
  await startLesson(page);
  await expect.poll(async () => (await mediaSnapshot(page)).pendingCues).toBe(1);
  await expect.poll(async () => (await mediaSnapshot(page)).pendingUploads).toBe(0);
  expect((await mediaSnapshot(page)).uploads[0]?.outcome).toBe(
    "recording_disabled",
  );
  await controlLessonMedia(page, "releaseNextCue");
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();

  const snapshot = await mediaSnapshot(page);
  expect(snapshot.uploads).toMatchObject([
    {
      lessonId: "deletion-guide",
      outcome: "recording_disabled",
      sceneIndex: 0,
      source: "my",
      stepIndex: 0,
    },
  ]);
  expect(snapshot.getUserMediaCalls).toBe(2);
  expect(snapshot.recorderStarts).toHaveLength(1);
  expect(snapshot.cues.map(({ text }) => text)).toEqual([
    "Red kite!",
    "The kite turns.",
    "Green kite!",
  ]);
  await expect(page.getByRole("button", { name: "Try saving again" })).toHaveCount(0);
  await expect(page.getByText("Saving your voices…", { exact: true })).toHaveCount(0);
});

test("a stale open My Lesson sends its loaded revision once and stops future capture", async ({
  page,
}) => {
  const twoBeatLesson = structuredClone(myLesson);
  twoBeatLesson.scenes[0].steps.push(
    {
      dialogue: "The kite turns.",
      emotes: { peppa: "listening" },
      speaker: "narrator",
    },
    {
      dialogue: "Green kite!",
      emotes: { peppa: "listening" },
      speaker: "user",
    },
  );
  await openMyLesson(page, "lesson-changed", {
    id: "stale-guide",
    lesson: twoBeatLesson,
  });
  await startLesson(page);
  await expect.poll(async () => (await mediaSnapshot(page)).pendingCues).toBe(1);
  const afterConflict = await mediaSnapshot(page);
  expect(afterConflict.uploads).toMatchObject([
    {
      lessonId: "stale-guide",
      outcome: "lesson_changed",
      revision: myLessonRevision,
      sceneIndex: 0,
      source: "my",
      stepIndex: 0,
    },
  ]);

  await controlLessonMedia(page, "releaseNextCue");
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();
  const completed = await mediaSnapshot(page);
  expect(completed.recorderStarts).toHaveLength(1);
  expect(completed.getUserMediaCalls).toBe(2);
  expect(completed.uploads).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Try saving again" })).toHaveCount(0);
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
  { name: "280x653 boundary", width: 280, height: 653 },
  { name: "390x844 phone", width: 390, height: 844 },
  { name: "667x375 short-wide", width: 667, height: 375 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test(`lesson intro, join-in, and completion stay contained on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openParrotLesson(page, "held-cue-no-consent");
    const intro = page.getByRole("region", { name: "Lesson introduction" });
    const introHeading = intro.getByRole("heading", {
      exact: true,
      level: 1,
      name: "Watch and join in",
    });
    const start = intro.getByRole("button", { exact: true, name: "Let's go" });
    const account = page.getByRole("button", {
      name: "Profile for Mia, learner mode",
    });
    const routeBack = page.getByRole("button", {
      name: "Back to lesson list",
    });
    await expectInsideViewport(introHeading, viewport);
    await expectInsideViewport(start, viewport);
    await expect(start).toHaveAccessibleName("Let's go");
    await expectInsideViewport(account, viewport);
    await expectInsideViewport(routeBack, viewport);
    await expectNoOverlap(introHeading, account);
    await expectNoOverlap(introHeading, routeBack);
    await expectNoOverlap(start, account);
    await expectNoOverlap(start, routeBack);
    await expectNoOverlap(account, routeBack);
    await expectNoPageOverflow(page);
    await startLesson(page);

    const prompt = joinInPrompt(page, "It is up high!");
    const joinInHeading = prompt.getByRole("heading", {
      exact: true,
      name: "Join in",
    });
    const phrase = prompt.getByText("It is up high!", { exact: true });
    const status = prompt.getByRole("status");
    const controls = page.getByRole("navigation", {
      name: "Lesson playback controls",
    });
    const artwork = page.getByRole("region", { name: "Lesson artwork" });
    const hud = page.getByRole("region", { name: "Lesson progress" });
    await expect(joinInHeading).toBeVisible();
    await expect(phrase).toBeVisible();
    await expect(status).toHaveText("Voices are joining in");
    await expectInsideViewport(artwork, viewport);
    await expectInsideViewport(hud, viewport);
    await expectInsideViewport(prompt, viewport);
    await expectInsideViewport(controls, viewport);
    await expectNoOverlap(prompt, controls);
    await expectNoOverlap(prompt, hud);
    await expectNoOverlap(prompt, routeBack);
    await expectNoOverlap(prompt, account);
    await expectNoOverlap(artwork, routeBack);
    await expectNoOverlap(artwork, account);
    await expectNoOverlap(hud, routeBack);
    await expectNoOverlap(hud, account);
    await expectNoOverlap(controls, routeBack);
    await expectNoOverlap(controls, account);
    await expectNoPageOverflow(page);

    await openMyLesson(page, "device-no-consent", {
      id: `responsive-completion-${viewport.width}-${viewport.height}`,
    });
    await startLesson(page);

    const completion = page.getByRole("region", { name: "Lesson completion" });
    const completionHeading = completion.getByRole("heading", {
      exact: true,
      level: 1,
      name: "Lesson complete!",
    });
    const replay = completion.getByRole("button", { name: "Replay lesson" });
    const completionBack = completion.getByRole("button", {
      exact: true,
      name: "Back to lessons",
    });
    const completionStatus = page.getByRole("status", {
      name: "Lesson updates",
    });
    await expectInsideViewport(completionHeading, viewport);
    await expectInsideViewport(replay, viewport);
    await expectInsideViewport(completionBack, viewport);
    await expect(replay).toHaveAccessibleName("Replay lesson");
    await expect(completionBack).toHaveAccessibleName("Back to lessons");
    await expect(completionStatus).toHaveText("Lesson complete");
    await expectNoOverlap(replay, completionBack);
    await expectNoOverlap(replay, routeBack);
    await expectNoOverlap(replay, account);
    await expectNoOverlap(completionBack, routeBack);
    await expectNoOverlap(completionBack, account);
    await expectNoOverlap(account, routeBack);
    await expectNoPageOverflow(page);
  });
}

for (const viewport of [
  { name: "ultra-narrow", width: 280, height: 568 },
  { name: "short landscape", width: 640, height: 360 },
  { name: "compact landscape", width: 768, height: 481 },
  { name: "compact", width: 768, height: 600 },
  { name: "compact tall", width: 768, height: 807 },
]) {
  test(`long generated join-in stays reachable and layered at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openMyLesson(page, "held-cue-no-consent", {
      id: `long-guide-${viewport.width}-${viewport.height}`,
      lesson: longDialogueLesson,
    });
    await startLesson(page);

    const prompt = joinInPrompt(page, longDialogue);
    const heading = prompt.getByRole("heading", { exact: true, name: "Join in" });
    const phrase = prompt.getByText(longDialogue, { exact: true });
    const status = prompt.getByRole("status");
    const controls = page.getByRole("navigation", {
      name: "Lesson playback controls",
    });
    const hud = page.getByRole("region", { name: "Lesson progress" });
    const back = page.getByRole("button", { name: "Back to lesson list" });
    const peppa = page.getByRole("img", { name: "Peppa" });
    const dolly = page.getByRole("img", { name: "Dolly" });

    await expect(heading).toBeVisible();
    await expect(phrase).toBeVisible();
    await expect(status).toHaveText("Voices are joining in");
    await expectInsideViewport(prompt, viewport);
    await expectInsideViewport(controls, viewport);
    await expectInsideViewport(hud, viewport);
    await expectInsideViewport(back, viewport);
    await expectContainedBy(heading, prompt);
    await expectContainedBy(phrase, prompt);
    await expectContainedBy(status, prompt);
    await expectLongTextReachable(phrase);

    if (viewport.name === "compact") {
      const centers = await heading.evaluate((element) => {
        const promptRect = element.parentElement!.getBoundingClientRect();
        const iconRect = element.querySelector("svg")!.getBoundingClientRect();
        const textNode = [...element.childNodes].find(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        )!;
        const textRange = document.createRange();
        textRange.selectNodeContents(textNode);
        const textRect = textRange.getBoundingClientRect();
        return {
          content: (Math.min(iconRect.left, textRect.left) +
            Math.max(iconRect.right, textRect.right)) / 2,
          prompt: promptRect.left + promptRect.width / 2,
        };
      });
      expect(Math.abs(centers.content - centers.prompt)).toBeLessThanOrEqual(2);
    }

    const promptMetrics = await prompt.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(promptMetrics.scrollHeight).toBeLessThanOrEqual(
      promptMetrics.clientHeight + 1,
    );
    for (const fixedPart of [heading, status]) {
      const metrics = await fixedPart.evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }));
      expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 1);
      await expect(fixedPart).not.toHaveAttribute("tabindex", "0");
    }

    await expectNoOverlap(prompt, controls);
    await expectNoOverlap(prompt, hud);
    await expectNoOverlap(prompt, back);
    await expectNoOverlap(prompt, peppa);
    await expectNoOverlap(prompt, dolly);
    await expectNoOverlap(controls, peppa);
    await expectNoOverlap(controls, dolly);
    await expectNoPageOverflow(page);
  });
}
