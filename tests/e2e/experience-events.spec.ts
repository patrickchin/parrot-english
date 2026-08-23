import { expect, test, type Page } from "@playwright/test";
import { startSmallChat } from "./conversation-helpers";

type CapturedExperienceEvent = Record<string, unknown>;

async function installPageLocalExperienceTrace(page: Page) {
  await page.evaluate(async () => {
    const modulePath = "/src/experience/experience-events.ts";
    const { experienceEvents } = await import(/* @vite-ignore */ modulePath);
    const testWindow = window as Window & {
      __parrotExperienceTrace?: CapturedExperienceEvent[];
    };
    testWindow.__parrotExperienceTrace = [];
    experienceEvents.installSink((event: CapturedExperienceEvent) => {
      testWindow.__parrotExperienceTrace?.push(event);
      throw new Error("Synthetic sink failure");
    });
  });
}

async function readPageLocalExperienceTrace(page: Page) {
  return page.evaluate(() => {
    const testWindow = window as Window & {
      __parrotExperienceTrace?: CapturedExperienceEvent[];
    };
    return testWindow.__parrotExperienceTrace ?? [];
  });
}

async function installFastLessonAudio(page: Page) {
  await page.evaluate(() => {
    class FastAudio {
      onended: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      pause() {}

      async play() {
        window.setTimeout(() => this.onended?.(new Event("ended")), 5);
      }
    }
    Object.defineProperty(window, "Audio", {
      configurable: true,
      value: FastAudio,
    });
  });
}

test("the privacy-safe trace preserves startup order without child content or system identifiers", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/talk-to-peppa");
  await installPageLocalExperienceTrace(page);
  await startSmallChat(page);
  await expect(
    page.getByRole("button", { name: "Tap, then talk" }),
  ).toBeVisible();

  await expect
    .poll(() => readPageLocalExperienceTrace(page))
    .toHaveLength(2);
  const [audioPlayback, startup] = await readPageLocalExperienceTrace(page);

  expect(audioPlayback).toMatchObject({
    name: "conversation_audio_playback",
    outcome: "ready",
    schemaVersion: 1,
    surface: "talk",
  });
  expect(audioPlayback.durationMs).toEqual(expect.any(Number));
  expect(Object.keys(audioPlayback).sort()).toEqual([
    "durationMs",
    "name",
    "outcome",
    "schemaVersion",
    "surface",
  ]);

  expect(startup).toMatchObject({
    name: "conversation_start",
    outcome: "ready",
    schemaVersion: 1,
    surface: "talk",
  });
  expect(startup.apiReadyMs).toEqual(expect.any(Number));
  expect(startup.roomReadyMs).toEqual(expect.any(Number));
  expect(startup.microphoneMutedMs).toEqual(expect.any(Number));
  expect(startup.learnerTurnReadyMs).toEqual(expect.any(Number));
  expect(startup.apiReadyMs as number).toBeLessThanOrEqual(
    startup.roomReadyMs as number,
  );
  expect(startup.roomReadyMs as number).toBeLessThanOrEqual(
    startup.microphoneMutedMs as number,
  );
  expect(startup.microphoneMutedMs as number).toBeLessThanOrEqual(
    startup.learnerTurnReadyMs as number,
  );
  expect(Object.keys(startup).sort()).toEqual([
    "apiReadyMs",
    "learnerTurnReadyMs",
    "microphoneMutedMs",
    "name",
    "outcome",
    "roomReadyMs",
    "schemaVersion",
    "surface",
  ]);
  expect(JSON.stringify([audioPlayback, startup])).not.toMatch(
    /Mia|e2e-|participant-token|wss:\/\/|Hello again|example\.test/i,
  );
  expect(pageErrors).toEqual([]);
});

test("lesson success events keep exact identifier-free keys", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(
    "/lessons/parrot/01-peppas-high-ball/scenes/1?parrotE2eMicrophone=delayed",
  );
  await installPageLocalExperienceTrace(page);
  await installFastLessonAudio(page);

  await page.getByRole("button", { name: "Start lesson" }).click();
  const controls = page.getByRole("navigation", {
    name: "Speaking controls",
  });
  const microphone = controls.getByRole("button").first();
  await expect(microphone).toBeVisible({ timeout: 8_000 });
  await expect(microphone).toHaveAccessibleName("Tap to talk");

  await controls.getByRole("button").evaluateAll((buttons) => {
    const [microphoneButton, skipButton] = buttons as HTMLButtonElement[];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      microphoneButton.click();
    }
    skipButton.click();
  });
  await expect(microphone).toHaveAccessibleName("Opening mic…");
  await expect(
    page.evaluate(() => {
      const controller = (
        window as Window & {
          __parrotE2eLessonMicrophone?: {
            pending: number;
            requests: number;
            resolveNext: () => boolean;
          };
        }
      ).__parrotE2eLessonMicrophone;
      if (!controller) throw new Error("Microphone controller is missing.");
      return {
        pending: controller.pending,
        requests: controller.requests,
      };
    }),
  ).resolves.toEqual({ pending: 1, requests: 1 });
  await page.evaluate(() => {
    const controller = (
      window as Window & {
        __parrotE2eLessonMicrophone?: { resolveNext: () => boolean };
      }
    ).__parrotE2eLessonMicrophone;
    if (!controller?.resolveNext()) {
      throw new Error("Pending microphone request is missing.");
    }
  });
  await expect(microphone).toHaveAccessibleName("Tap when done");
  await expect(microphone).not.toHaveAttribute("aria-pressed", /.+/);
  await microphone.click();

  await expect
    .poll(() => readPageLocalExperienceTrace(page))
    .toHaveLength(2);
  const [microphoneEvent, speechCheckEvent] =
    await readPageLocalExperienceTrace(page);
  expect(microphoneEvent).toMatchObject({
    name: "lesson_microphone",
    outcome: "ready",
    schemaVersion: 1,
  });
  expect(speechCheckEvent).toMatchObject({
    name: "lesson_speech_check",
    outcome: "completed",
    schemaVersion: 1,
  });
  for (const event of [microphoneEvent, speechCheckEvent]) {
    expect(event.durationMs).toEqual(expect.any(Number));
    expect(Object.keys(event).sort()).toEqual([
      "durationMs",
      "name",
      "outcome",
      "schemaVersion",
    ]);
  }
  expect(JSON.stringify([microphoneEvent, speechCheckEvent])).not.toMatch(
    /Mia|high-ball|It is up high|parrot-e2e-audio|correct/i,
  );
  await expect(
    page.evaluate(() => {
      const controller = (
        window as Window & {
          __parrotE2eLessonMicrophone?: {
            requests: number;
            resolved: number;
            stoppedTracks: number;
          };
        }
      ).__parrotE2eLessonMicrophone;
      if (!controller) throw new Error("Microphone controller is missing.");
      return {
        requests: controller.requests,
        resolved: controller.resolved,
        stoppedTracks: controller.stoppedTracks,
      };
    }),
  ).resolves.toEqual({ requests: 1, resolved: 1, stoppedTracks: 1 });
  expect(pageErrors).toEqual([]);
});

test("a failed measurement sink cannot break microphone recovery", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(
    "/lessons/parrot/01-peppas-high-ball/scenes/1?parrotE2eMicrophone=denied",
  );
  await installPageLocalExperienceTrace(page);
  await installFastLessonAudio(page);

  await page.getByRole("button", { name: "Start lesson" }).click();
  const microphone = page
    .getByRole("navigation", { name: "Speaking controls" })
    .getByRole("button")
    .first();
  await expect(microphone).toBeVisible({ timeout: 8_000 });
  await expect(microphone).toHaveAccessibleName("Tap to talk");
  await microphone.click();
  await expect(
    page.getByRole("region", { name: "Speaking help" }),
  ).toContainText("The mic is off. Say the words. Then tap Done.");

  await expect
    .poll(() => readPageLocalExperienceTrace(page))
    .toHaveLength(1);
  const [microphoneEvent] = await readPageLocalExperienceTrace(page);
  expect(microphoneEvent).toMatchObject({
    name: "lesson_microphone",
    outcome: "access_failed",
    schemaVersion: 1,
  });
  expect(Object.keys(microphoneEvent).sort()).toEqual([
    "durationMs",
    "name",
    "outcome",
    "schemaVersion",
  ]);
  expect(JSON.stringify(microphoneEvent)).not.toMatch(
    /NotAllowed|permission|microphone access|Mia|high-ball/i,
  );
  expect(pageErrors).toEqual([]);
});
