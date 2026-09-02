import { Buffer } from "node:buffer";
import { expect, test, type Locator, type Page } from "@playwright/test";

const parrotLessonPath = "/lessons/parrot/01-peppas-high-ball/scenes/1";
const parrotLessonFinalScenePath =
  "/lessons/parrot/01-peppas-high-ball/scenes/5";
const tinySceneWebp = Buffer.from(
  "UklGRh4AAABXRUJQVlA4TBEAAAAvDwACAAfQ5sp1vf+BiOh/AAA=",
  "base64",
);
type LessonMediaSnapshot = {
  consentRequests: number;
  cueCancellations: number;
  cues: Array<{
    endedAt: number | null;
    kind: "static";
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
    source: "parrot";
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

async function mockSceneArtwork(page: Page) {
  await page.route("https://media.parrotbook.com/**", async (route) => {
    await route.fulfill({ body: tinySceneWebp, contentType: "image/webp" });
  });
}

async function openParrotLesson(
  page: Page,
  scenario: string,
  microphoneScenario?: "denied",
  lessonPath = parrotLessonPath,
) {
  await mockSceneArtwork(page);
  await page.goto(
    `${lessonPath}?parrotE2eLesson=${scenario}` +
      (microphoneScenario ? `&parrotE2eMicrophone=${microphoneScenario}` : ""),
  );
  await expect(
    page.getByRole("button", { exact: true, name: "Let's go" }),
  ).toBeVisible();
}

async function openSceneOneWithSceneTwoBehind(page: Page, scenario: string) {
  await mockSceneArtwork(page);
  const query = `?parrotE2eLesson=${scenario}`;
  await page.goto(`/lessons/parrot/01-peppas-high-ball/scenes/2${query}`);
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
    "failNextCue" | "rejectNextUpload" | "releaseNextCue" | "resolveNextUpload",
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
    if (!controller)
      throw new Error("Lesson microphone controller is missing.");
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
    if (!controller)
      throw new Error("Lesson microphone controller is missing.");
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
    .poll(
      async () => (await artworkDecodeSnapshot(page)).resolvedDetachedDecodes,
    )
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
  await expect(
    page.getByRole("region", { name: "Lesson progress" }),
  ).toHaveCount(0);
  releaseArtwork();
  const start = page.getByRole("button", { exact: true, name: "Let's go" });
  await expect(start).toBeVisible();
  await expect(start).toBeFocused();
  await expect(page.getByRole("status", { name: "Lesson updates" })).toHaveText(
    "Press Let's go to begin",
  );
});

test("phone artwork and its next-scene preload use compact image candidates", async ({
  page,
}) => {
  const requestedArtwork: string[] = [];
  await page.setViewportSize({ height: 844, width: 390 });
  await page.route("https://media.parrotbook.com/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.includes("/full-scenes/")) requestedArtwork.push(pathname);
    await route.fulfill({ body: tinySceneWebp, contentType: "image/webp" });
  });
  await page.goto(`${parrotLessonPath}?parrotE2eLesson=no-consent`);

  await expect(
    page.getByRole("button", { exact: true, name: "Let's go" }),
  ).toBeVisible();
  await expect.poll(() => requestedArtwork.some((pathname) =>
    pathname.endsWith("/02-cannot-reach-384.webp"),
  )).toBe(true);
  expect(requestedArtwork).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/\/01-ball-up-high-384\.webp$/),
      expect.stringMatching(/\/02-cannot-reach-384\.webp$/),
    ]),
  );
  expect(
    requestedArtwork.some((pathname) =>
      /\/(?:01-ball-up-high|02-cannot-reach)\.webp$/.test(pathname),
    ),
  ).toBe(false);
});

test("lesson artwork retries its original when a responsive candidate is unavailable", async ({
  page,
}) => {
  const requestedArtwork: string[] = [];
  await page.setViewportSize({ height: 844, width: 390 });
  await page.route("https://media.parrotbook.com/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.includes("/full-scenes/")) requestedArtwork.push(pathname);
    if (/-\d+\.webp$/.test(pathname)) {
      await route.fulfill({ status: 404 });
      return;
    }
    await route.fulfill({ body: tinySceneWebp, contentType: "image/webp" });
  });
  await page.goto(`${parrotLessonPath}?parrotE2eLesson=no-consent`);

  await expect(
    page.getByRole("button", { exact: true, name: "Let's go" }),
  ).toBeVisible();
  expect(requestedArtwork).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/\/01-ball-up-high-384\.webp$/),
      expect.stringMatching(/\/01-ball-up-high\.webp$/),
    ]),
  );
});

test("a phone preload does not unlock a larger candidate after resizing", async ({
  page,
}) => {
  await installArtworkDecodeController(page);
  await page.setViewportSize({ height: 844, width: 390 });
  let releaseLargeArtwork!: () => void;
  const largeArtworkReady = new Promise<void>((resolve) => {
    releaseLargeArtwork = resolve;
  });
  await page.route("https://media.parrotbook.com/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (/\/02-cannot-reach\.webp$/.test(pathname)) await largeArtworkReady;
    await route.fulfill({ body: tinySceneWebp, contentType: "image/webp" });
  });
  await page.goto(`${parrotLessonPath}?parrotE2eLesson=held-cue-no-consent`);
  await expect(
    page.getByRole("button", { exact: true, name: "Let's go" }),
  ).toBeVisible();
  await expect
    .poll(
      async () => (await artworkDecodeSnapshot(page)).pendingDetachedDecodes,
    )
    .toBeGreaterThan(0);
  await releaseDetachedArtworkDecodes(page);
  await page.setViewportSize({ height: 900, width: 1000 });
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
  ).toBeVisible();

  releaseLargeArtwork();
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
  const panel = page.getByRole("dialog", { name: "Account menu" });
  const english = panel.getByRole("button", {
    exact: true,
    name: "English",
  });
  const chinese = panel.getByRole("button", {
    exact: true,
    name: "中文",
  });
  const switchLearner = panel.getByRole("menuitem", {
    name: "Switch learner",
  });
  await expect(english).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(chinese).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(switchLearner).toBeFocused();

  releaseArtwork();
  await expect(
    page.getByRole("button", { exact: true, name: "Let's go" }),
  ).toBeVisible();
  await expect(switchLearner).toBeFocused();
});

// Catches watching unrelated preloaded artwork when focusing the current start action.
test("finishing a next-scene preload does not steal focus from lesson navigation", async ({
  page,
}) => {
  await installArtworkDecodeController(page);
  await openParrotLesson(page, "no-consent");
  await expect
    .poll(
      async () => (await artworkDecodeSnapshot(page)).pendingDetachedDecodes,
    )
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
    .poll(
      async () => (await artworkDecodeSnapshot(page)).pendingDetachedDecodes,
    )
    .toBeGreaterThan(0);
  await startLesson(page);
  await expect(
    page.getByRole("status", { name: "Peppa is speaking" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await mediaSnapshot(page)).pendingCues)
    .toBe(1);
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
    .poll(
      async () => (await artworkDecodeSnapshot(page)).pendingDetachedDecodes,
    )
    .toBeGreaterThan(0);
  await startLesson(page);
  await expect(joinInPrompt(page, "It is up high!")).toBeVisible();
  await expect
    .poll(async () => (await mediaSnapshot(page)).pendingCues)
    .toBe(1);
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
    .poll(
      async () => (await artworkDecodeSnapshot(page)).pendingDetachedDecodes,
    )
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

test("failed artwork can be retried before the story begins", async ({
  page,
}) => {
  let initialArtworkFailures = 0;
  await page.route("https://media.parrotbook.com/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (
      /\/01-ball-up-high(?:-\d+)?\.webp$/.test(pathname) &&
      initialArtworkFailures < 2
    ) {
      initialArtworkFailures += 1;
      await route.abort("failed");
      return;
    }
    await route.fulfill({ body: tinySceneWebp, contentType: "image/webp" });
  });
  await page.goto(`${parrotLessonPath}?parrotE2eLesson=no-consent`);

  await expect(
    page.getByText("No picture yet.", { exact: true }),
  ).toBeVisible();
  expect(initialArtworkFailures).toBe(2);
  await page.getByRole("button", { name: "Try loading picture again" }).click();
  await expect(
    page.getByRole("button", { exact: true, name: "Let's go" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Lesson progress" }),
  ).toHaveCount(0);
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

  await expect(
    page.getByRole("button", { name: "Loading picture…" }),
  ).toBeDisabled();
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
  await expect(
    page.getByRole("status", { name: "Dolly is speaking" }),
  ).toBeVisible();
});

test("consent preflight leads to a fresh capture for every automatic beat", async ({
  page,
}) => {
  await openParrotLesson(page, "held-cue");
  await expect.poll(async () => (await mediaSnapshot(page)).consentRequests).toBe(1);

  await startLesson(page);
  const firstPrompt = joinInPrompt(page, "It is up high!");
  await expect(firstPrompt).toBeVisible();
  await expect(firstPrompt.getByRole("status")).toHaveText(
    "Your microphone is joining in too",
  );
  await expect.poll(async () => (await mediaSnapshot(page)).pendingCues).toBe(1);
  await controlLessonMedia(page, "releaseNextCue");
  await expect
    .poll(async () => (await mediaSnapshot(page)).uploads.length)
    .toBeGreaterThanOrEqual(1);
  const secondPrompt = joinInPrompt(page, "Oh! I can't reach it.");
  await expect(secondPrompt).toBeVisible();
  await expect(secondPrompt.getByRole("status")).toHaveText(
    "Your microphone is joining in too",
  );
  await expect.poll(async () => (await mediaSnapshot(page)).pendingCues).toBe(1);
  await controlLessonMedia(page, "releaseNextCue");
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
  expect(
    snapshot.cues.slice(0, 2).map(({ kind, volume }) => ({ kind, volume })),
  ).toEqual([
    { kind: "static", volume: 0.28 },
    { kind: "static", volume: 0.28 },
  ]);
  expect(snapshot.recorderStarts[0].startedAt).toBeLessThanOrEqual(
    snapshot.cues[0].startedAt,
  );
  expect(
    snapshot.recorderStops[0].stoppedAt - snapshot.cues[0].endedAt!,
  ).toBeGreaterThanOrEqual(240);
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

test("recording fixture uses the fixed built-in source without a revision", async ({
  page,
}) => {
  await page.goto(`${parrotLessonPath}?parrotE2eLesson=recording`);
  await expect(
    page.getByRole("button", { exact: true, name: "Let's go" }),
  ).toBeVisible();

  const result = await page.evaluate(async () => {
    const response = await fetch(
      "/api/lesson-recordings/parrot/01-peppas-high-ball/scenes/0/steps/2",
      {
        body: new Blob(["fixture"], { type: "audio/webm" }),
        headers: {
          "Content-Type": "audio/webm",
          "X-Parrot-Expected-Learner-Profile": "e2e-learner",
        },
        method: "PUT",
      },
    );
    const media = (
      window as Window & {
        __parrotE2eLessonMedia?: LessonMediaController;
      }
    ).__parrotE2eLessonMedia;
    if (!media) throw new Error("Lesson media controller is missing.");
    const upload = media.snapshot().uploads.at(-1);
    return {
      body: await response.json(),
      hasRevision: upload ? Object.hasOwn(upload, "revision") : null,
      source: upload?.source ?? null,
      status: response.status,
    };
  });

  expect(result).toEqual({
    body: { recordedAt: "2026-08-26T08:00:00.000Z" },
    hasRevision: false,
    source: "parrot",
    status: 201,
  });
});

test("missing consent makes no microphone request and keeps the same cue", async ({
  page,
}) => {
  await openParrotLesson(page, "held-cue-no-consent");
  await startLesson(page);

  const prompt = joinInPrompt(page, "It is up high!");
  await expect(prompt).toBeVisible();
  await expect(prompt.getByRole("status")).toHaveCount(0);
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

test("a malformed successful consent response still fails closed", async ({
  page,
}) => {
  await openParrotLesson(page, "malformed-consent");
  await startLesson(page);

  const prompt = joinInPrompt(page, "It is up high!");
  await expect(prompt).toBeVisible();
  await expect(prompt.getByRole("status")).toHaveCount(0);
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
    help.getByText(
      "The microphone is unavailable, but the story will keep going.",
    ),
  ).toBeVisible();
  await expect(
    page
      .getByRole("alert")
      .getByText(
        "The microphone is unavailable, but the story will keep going.",
      ),
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
  await expect
    .poll(async () => (await microphoneSnapshot(page)).pending)
    .toBe(1);
  const back = page.getByRole("button", { name: "Back to lesson list" });
  await back.focus();
  await controlLessonMicrophone(page, "rejectNext");
  await expect(
    page
      .getByRole("status", { name: "Speaking help" })
      .getByText(
        "The microphone is unavailable, but the story will keep going.",
      ),
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
    await expect
      .poll(async () => (await microphoneSnapshot(page)).pending)
      .toBe(1);

    await page.goBack();
    await expect(page).toHaveURL(/\/scenes\/2/);
    const nextStart = page.getByRole("button", {
      exact: true,
      name: "Let's go",
    });
    await expect(nextStart).toBeFocused();
    await nextStart.click();
    await expect
      .poll(async () => (await mediaSnapshot(page)).getUserMediaCalls)
      .toBe(2);
    await expect
      .poll(async () => (await mediaSnapshot(page)).pendingCues)
      .toBe(1);
    await controlLessonMicrophone(page, outcome);
    await expect
      .poll(async () => (await microphoneSnapshot(page)).pending)
      .toBe(0);

    await expect(
      page.getByRole("status", { name: "Speaking help" }),
    ).toHaveCount(0);
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
  await expect
    .poll(async () => (await mediaSnapshot(page)).pendingCues)
    .toBe(1);

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
  await expect
    .poll(async () => (await mediaSnapshot(page)).pendingCues)
    .toBe(1);

  await page.getByRole("button", { name: "Pause lesson" }).click();
  await expect(
    page.getByRole("button", { name: "Resume lesson" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await mediaSnapshot(page)).cueCancellations)
    .toBe(1);
  expect((await mediaSnapshot(page)).uploads).toHaveLength(0);

  await page.getByRole("button", { name: "Resume lesson" }).click();
  await expect
    .poll(async () => (await mediaSnapshot(page)).recorderStarts.length)
    .toBe(2);
  await controlLessonMedia(page, "releaseNextCue");
  await expect
    .poll(async () => (await mediaSnapshot(page)).uploads.length)
    .toBe(1);
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
  await expect
    .poll(async () => (await mediaSnapshot(page)).pendingCues)
    .toBe(1);

  await page.getByRole("button", { name: "Next scene" }).click();
  await expect(page).toHaveURL(/\/scenes\/2/);
  await expect
    .poll(async () => (await mediaSnapshot(page)).cueCancellations)
    .toBe(1);
  await expect(joinInPrompt(page, "Oh! I can't reach it.")).toBeVisible();
  await expect
    .poll(async () => (await mediaSnapshot(page)).pendingCues)
    .toBe(1);

  await page.getByRole("button", { name: "Previous scene" }).click();
  await expect(page).toHaveURL(/\/scenes\/1/);
  await expect
    .poll(async () => (await mediaSnapshot(page)).cueCancellations)
    .toBe(2);
  expect((await mediaSnapshot(page)).uploads).toHaveLength(0);
});

test("Back cancels an unfinished cue without creating a recording", async ({
  page,
}) => {
  await openParrotLesson(page, "held-cue");
  await startLesson(page);
  await expect(joinInPrompt(page, "It is up high!")).toBeVisible();
  await expect
    .poll(async () => (await mediaSnapshot(page)).pendingCues)
    .toBe(1);

  await page.getByRole("button", { name: "Back to lesson list" }).click();
  await expect(page).toHaveURL(/\/lessons$/);
  await expect
    .poll(async () => (await mediaSnapshot(page)).cueCancellations)
    .toBe(1);
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
  await expect
    .poll(async () => (await mediaSnapshot(page)).pendingCues)
    .toBe(1);

  await page.goBack();
  await expect(page).toHaveURL(/\/scenes\/1/);
  await expect(
    page.getByRole("button", { exact: true, name: "Let's go" }),
  ).toBeFocused();
  await expect
    .poll(async () => (await mediaSnapshot(page)).cueCancellations)
    .toBe(2);
});

test("ordinary story audio still pauses and resumes in place", async ({
  page,
}) => {
  await openParrotLesson(page, "held-story");
  await startLesson(page);
  await expect(
    page.getByRole("status", { name: "Peppa is speaking" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause lesson" }).click();
  await expect(
    page.getByRole("button", { name: "Resume lesson" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume lesson" }).click();
  await controlLessonMedia(page, "releaseNextCue");
  await expect(
    page.getByRole("status", { name: "Dolly is speaking" }),
  ).toBeVisible();
});

test("held built-in recordings do not block completion", async ({ page }) => {
  await openParrotLesson(
    page,
    "upload-held",
    undefined,
    parrotLessonFinalScenePath,
  );
  await startLesson(page);

  const completion = page.getByRole("region", { name: "Lesson completion" });
  await expect(
    completion.getByRole("heading", {
      name: "You finished Peppa's High Ball!",
    }),
  ).toBeVisible();
  await expect(completion.getByText("Saving your voices…", { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await mediaSnapshot(page)).pendingUploads)
    .toBe(2);

  await controlLessonMedia(page, "resolveNextUpload");
  await controlLessonMedia(page, "resolveNextUpload");
  await expect(
    completion.getByText("Saving your voices…", { exact: true }),
  ).toHaveCount(0);
});

test("built-in completion focuses Replay and restarts without another consent request", async ({
  page,
}) => {
  await openParrotLesson(
    page,
    "device-no-consent",
    undefined,
    parrotLessonFinalScenePath,
  );
  await startLesson(page);

  const replay = page.getByRole("button", { name: "Replay lesson" });
  await expect(replay).toBeFocused();
  await replay.click();
  await expect(joinInPrompt(page, "Here you are!")).toBeVisible();

  const snapshot = await mediaSnapshot(page);
  expect(snapshot.consentRequests).toBe(1);
  expect(snapshot.getUserMediaCalls).toBe(0);
});

test("failed built-in recording saves retry without repeating the lesson", async ({
  page,
}) => {
  await openParrotLesson(
    page,
    "upload-retry-held",
    undefined,
    parrotLessonFinalScenePath,
  );
  await startLesson(page);

  const completion = page.getByRole("region", { name: "Lesson completion" });
  const retry = completion.getByRole("button", { name: "Try saving again" });
  await expect(retry).toBeVisible();
  expect((await mediaSnapshot(page)).uploads).toHaveLength(2);
  expect((await mediaSnapshot(page)).uploads.every(({ outcome }) => outcome === "failed")).toBe(
    true,
  );

  await retry.click();
  await expect(retry).toHaveCount(0);
  const replay = completion.getByRole("button", { name: "Replay lesson" });
  await expect(replay).toBeFocused();
  await expect(
    completion.getByText("Saving your voices…", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await mediaSnapshot(page)).pendingUploads)
    .toBe(2);
  await controlLessonMedia(page, "resolveNextUpload");
  await controlLessonMedia(page, "resolveNextUpload");
  await expect(
    completion.getByText("Saving your voices…", { exact: true }),
  ).toHaveCount(0);
  await expect(replay).toBeFocused();
  expect(
    (await mediaSnapshot(page)).uploads.slice(-2).map(({ outcome }) => outcome),
  ).toEqual(["saved", "saved"]);
});

test("completed built-in recordings keep uploading after the lesson route exits", async ({
  page,
}) => {
  await openParrotLesson(
    page,
    "upload-held",
    undefined,
    parrotLessonFinalScenePath,
  );
  await startLesson(page);
  await expect(
    page.getByRole("region", { name: "Lesson completion" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await mediaSnapshot(page)).pendingUploads)
    .toBe(2);

  await page.getByRole("button", { name: "Back to lesson list" }).click();
  await expect(page).toHaveURL(/\/lessons$/);
  await controlLessonMedia(page, "resolveNextUpload");
  await controlLessonMedia(page, "resolveNextUpload");
  await expect
    .poll(async () => (await mediaSnapshot(page)).pendingUploads)
    .toBe(0);
  expect((await mediaSnapshot(page)).uploads.map(({ outcome }) => outcome)).toEqual([
    "saved",
    "saved",
  ]);
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

test("lesson intro and start action stay contained at exactly 667x280", async ({
  page,
}) => {
  const viewport = { width: 667, height: 280 };
  await page.setViewportSize(viewport);
  await openParrotLesson(page, "held-cue-no-consent");

  const intro = page.getByRole("region", { name: "Lesson introduction" });
  const heading = intro.getByRole("heading", {
    exact: true,
    level: 1,
    name: "Peppa's High Ball",
  });
  const start = intro.getByRole("button", { exact: true, name: "Let's go" });
  const account = page.getByRole("button", {
    name: "Profile for ⁨Mia⁩, learner mode",
  });
  const routeBack = page.getByRole("button", { name: "Back to lesson list" });

  await expectInsideViewport(heading, viewport);
  await expectInsideViewport(start, viewport);
  await expectInsideViewport(account, viewport);
  await expectInsideViewport(routeBack, viewport);
  await expect(start).toHaveAccessibleName("Let's go");
  await expectNoOverlap(heading, account);
  await expectNoOverlap(heading, routeBack);
  await expectNoOverlap(start, account);
  await expectNoOverlap(start, routeBack);
  await expectNoPageOverflow(page);
});

for (const viewport of [
  { name: "280x653 boundary", width: 280, height: 653 },
  { name: "390x844 phone", width: 390, height: 844 },
  { name: "667x375 short-wide", width: 667, height: 375 },
  { name: "desktop", width: 1280, height: 800 },
]) {
  test(`lesson intro and join-in stay contained on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openParrotLesson(page, "held-cue", "denied");
    const intro = page.getByRole("region", { name: "Lesson introduction" });
    const introHeading = intro.getByRole("heading", {
      exact: true,
      level: 1,
      name: "Peppa's High Ball",
    });
    const start = intro.getByRole("button", { exact: true, name: "Let's go" });
    const account = page.getByRole("button", {
      name: "Profile for ⁨Mia⁩, learner mode",
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
    const idleStatus = prompt.getByRole("status");
    const controls = page.getByRole("navigation", {
      name: "Lesson playback controls",
    });
    const artwork = page.getByRole("region", { name: "Lesson artwork" });
    const hud = page.getByRole("region", { name: "Lesson progress" });
    const help = page.getByRole("status", { name: "Speaking help" });
    const peppa = page.getByRole("img", { name: "Peppa" });
    const dolly = page.getByRole("img", { name: "Dolly" });
    await expect(joinInHeading).toBeVisible();
    await expect(phrase).toBeVisible();
    await expect(idleStatus).toHaveCount(0);
    await expectInsideViewport(artwork, viewport);
    await expectInsideViewport(hud, viewport);
    await expectInsideViewport(prompt, viewport);
    await expectInsideViewport(controls, viewport);
    await expectInsideViewport(help, viewport);
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
    await expectNoOverlap(help, prompt);
    await expectNoOverlap(help, controls);
    await expectNoOverlap(help, peppa);
    await expectNoOverlap(help, dolly);
    await expectNoPageOverflow(page);
  });
}
