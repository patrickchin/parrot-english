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
    .toHaveLength(1);
  const [startup] = await readPageLocalExperienceTrace(page);

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
  expect(JSON.stringify(startup)).not.toMatch(
    /Mia|e2e-|participant-token|wss:\/\/|Hello again|example\.test/i,
  );
  expect(pageErrors).toEqual([]);
});

test("lesson success events keep exact identifier-free keys", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/lessons/parrot/01-peppas-high-ball/scenes/1");
  await installPageLocalExperienceTrace(page);
  await installFastLessonAudio(page);

  await page.getByRole("button", { name: "Start lesson" }).click();
  const microphone = page.getByRole("button", { name: "Microphone" });
  await expect(microphone).toBeVisible({ timeout: 8_000 });
  await microphone.click();
  await expect(microphone).toHaveAttribute("aria-pressed", "true");
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
  const microphone = page.getByRole("button", { name: "Microphone" });
  await expect(microphone).toBeVisible({ timeout: 8_000 });
  await microphone.click();
  await expect(
    page.getByRole("status", { name: "Speaking help" }),
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
