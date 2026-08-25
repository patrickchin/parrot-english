import { expect, test, type Locator, type Page } from "@playwright/test";

const acknowledgmentPath =
  "/profile/setup?parrotE2eProfile=acknowledgment";
const longAcknowledgmentPath =
  "/profile/setup?parrotE2eProfile=long-acknowledgment";
const longAcknowledgment =
  "Mia, that is a lovely answer! Peppa is happy to know you, and she cannot wait to hear about your favourite games, animals, stories, songs, and silly dances too!";

const responsiveViewports = [
  { height: 568, width: 280 },
  { height: 844, width: 390 },
  { height: 360, width: 640 },
  { height: 900, width: 1440 },
] as const;

async function openAcknowledgment(
  page: Page,
  {
    path = acknowledgmentPath,
    text = "Thank you!",
  }: { path?: string; text?: string } = {},
) {
  await page.goto(path);
  await page
    .getByRole("button", { name: "Start questions" })
    .click();
  await page
    .getByRole("textbox", { exact: true, name: "Your answer" })
    .fill("Mia");
  await page.getByRole("button", { exact: true, name: "Next" }).click();

  const heading = page.getByRole("heading", {
    name: text,
  });
  await expect(heading).toBeVisible();
  return heading;
}

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  return value!;
}

function boxesOverlap(
  first: { height: number; width: number; x: number; y: number },
  second: { height: number; width: number; x: number; y: number },
) {
  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}

async function expectInsideViewport(
  locator: Locator,
  viewport: (typeof responsiveViewports)[number],
) {
  await expect(locator).toBeVisible();
  const value = await box(locator);
  expect(value.x).toBeGreaterThanOrEqual(0);
  expect(value.y).toBeGreaterThanOrEqual(0);
  expect(value.x + value.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(value.y + value.height).toBeLessThanOrEqual(viewport.height + 1);
  return value;
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        document: document.documentElement.scrollWidth - window.innerWidth,
        main:
          document.querySelector("main")!.scrollWidth -
          document.querySelector("main")!.clientWidth,
      })),
    )
    .toEqual({ document: 0, main: 0 });
}

test("profile acknowledgment stays until its explicit Next action", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  const heading = await openAcknowledgment(page);
  const next = page.getByRole("button", { exact: true, name: "Next" });

  await expect(heading).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(next).toBeFocused();

  await page.waitForTimeout(2_200);
  await expect(page).toHaveURL(acknowledgmentPath);
  await expect(heading).toBeVisible();
  await expect(next).toBeVisible();
  await expect(next).toBeFocused();

  await next.click();
  await expect(page).toHaveURL("/");
  await expect(heading).toHaveCount(0);
});

test("saved acknowledgment audio cannot block its visible Next action", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto(acknowledgmentPath);
  await page.getByRole("button", { name: "Start questions" }).click();

  await page.evaluate(() => {
    const evidence = {
      atobCalls: 0,
      objectUrlCalls: 0,
      pauseCalls: 0,
      playCalls: 0,
      sources: [] as string[],
    };
    Object.assign(window, { __parrotAcknowledgmentAudioEvidence: evidence });
    window.atob = () => {
      evidence.atobCalls += 1;
      throw new Error("Inline acknowledgment audio is forbidden.");
    };
    URL.createObjectURL = () => {
      evidence.objectUrlCalls += 1;
      throw new Error("Acknowledgment object URLs are forbidden.");
    };
    class PendingAudio {
      onended: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor(readonly src: string) {
        evidence.sources.push(src);
      }

      pause() {
        evidence.pauseCalls += 1;
      }

      async play() {
        evidence.playCalls += 1;
      }
    }
    Object.defineProperty(window, "Audio", {
      configurable: true,
      value: PendingAudio,
    });
  });

  await page
    .getByRole("textbox", { exact: true, name: "Your answer" })
    .fill("Mia");
  await page.getByRole("button", { exact: true, name: "Next" }).click();

  const heading = page.getByRole("heading", { name: "Thank you!" });
  const next = page.getByRole("button", { exact: true, name: "Next" });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(next).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as typeof window & {
          __parrotAcknowledgmentAudioEvidence: {
            atobCalls: number;
            objectUrlCalls: number;
            pauseCalls: number;
            playCalls: number;
            sources: string[];
          };
        }).__parrotAcknowledgmentAudioEvidence.playCalls,
      ),
    )
    .toBeGreaterThanOrEqual(1);
  const playbackEvidence = await page.evaluate(
    () =>
      (window as typeof window & {
        __parrotAcknowledgmentAudioEvidence: {
          atobCalls: number;
          objectUrlCalls: number;
          pauseCalls: number;
          playCalls: number;
          sources: string[];
        };
      }).__parrotAcknowledgmentAudioEvidence,
  );
  expect(playbackEvidence.atobCalls).toBe(0);
  expect(playbackEvidence.objectUrlCalls).toBe(0);
  expect(playbackEvidence.pauseCalls).toBe(playbackEvidence.playCalls - 1);
  expect(playbackEvidence.sources).toHaveLength(playbackEvidence.playCalls);
  expect(
    playbackEvidence.sources.every(
      (source) => source === "/assets/audio/peppa-thank-you.mp3",
    ),
  ).toBe(true);

  await next.click();
  await expect(page).toHaveURL("/");
  await expect
    .poll(() =>
      page.evaluate(
        () => {
          const evidence = (
            window as typeof window & {
              __parrotAcknowledgmentAudioEvidence: {
                pauseCalls: number;
                playCalls: number;
              };
            }
          ).__parrotAcknowledgmentAudioEvidence;
          return evidence.pauseCalls - evidence.playCalls;
        },
      ),
    )
    .toBe(0);
});

test("saved acknowledgment audio reaches browser media metadata", async ({
  page,
}) => {
  const mediaResponses: Array<{
    contentType: string;
    status: number;
    url: string;
  }> = [];
  page.on("response", (response) => {
    if (response.url().endsWith("/assets/audio/peppa-thank-you.mp3")) {
      mediaResponses.push({
        contentType: response.headers()["content-type"] ?? "",
        status: response.status(),
        url: response.url(),
      });
    }
  });
  await page.goto("/");

  const media = await page.evaluate(async () => {
    const audio = document.createElement("audio");
    const events: string[] = [];
    for (const event of ["loadstart", "loadedmetadata", "canplay", "error"]) {
      audio.addEventListener(event, () => events.push(event));
    }
    audio.preload = "metadata";
    audio.src = "/assets/audio/peppa-thank-you.mp3";
    document.body.appendChild(audio);
    const outcome = await new Promise<"loadedmetadata" | "error" | "timeout">(
      (resolve) => {
        const timeout = window.setTimeout(() => resolve("timeout"), 5_000);
        const finish = (result: "loadedmetadata" | "error") => {
          window.clearTimeout(timeout);
          resolve(result);
        };
        audio.addEventListener("loadedmetadata", () => finish("loadedmetadata"), {
          once: true,
        });
        audio.addEventListener("error", () => finish("error"), { once: true });
        audio.load();
      },
    );
    const result = {
      currentSrc: audio.currentSrc,
      duration: audio.duration,
      errorCode: audio.error?.code ?? null,
      events,
      outcome,
      readyState: audio.readyState,
    };
    audio.remove();
    return result;
  });

  expect(media.outcome).toBe("loadedmetadata");
  expect(media.errorCode).toBeNull();
  expect(media.currentSrc).toBe(
    `${new URL("/", page.url()).origin}/assets/audio/peppa-thank-you.mp3`,
  );
  expect(media.duration).toBeGreaterThan(1);
  expect(media.duration).toBeLessThan(1.2);
  expect(media.readyState).toBeGreaterThanOrEqual(1);
  expect(media.events).toContain("loadedmetadata");
  expect(mediaResponses.length).toBeGreaterThanOrEqual(1);
  expect(
    mediaResponses.every(
      (response) =>
        response.contentType === "audio/mpeg" &&
        [200, 206].includes(response.status),
    ),
  ).toBe(true);
});

test("profile acknowledgment keeps one ordered action at responsive targets", async ({
  page,
}) => {
  for (const viewport of responsiveViewports) {
    await page.setViewportSize(viewport);
    const heading = await openAcknowledgment(page);
    const image = page.getByRole("img", { name: "Peppa smiling" });
    const next = page.getByRole("button", { exact: true, name: "Next" });
    const main = page.getByRole("main");

    const [imageBox, headingBox, nextBox] = await Promise.all([
      expectInsideViewport(image, viewport),
      expectInsideViewport(heading, viewport),
      expectInsideViewport(next, viewport),
    ]);

    if (viewport.width === 640 && viewport.height === 360) {
      expect(imageBox.x + imageBox.width).toBeLessThanOrEqual(headingBox.x + 1);
      expect(imageBox.x + imageBox.width).toBeLessThanOrEqual(nextBox.x + 1);
    } else {
      expect(imageBox.y + imageBox.height).toBeLessThanOrEqual(
        headingBox.y + 1,
      );
    }
    expect(headingBox.y + headingBox.height).toBeLessThanOrEqual(nextBox.y + 1);
    expect(nextBox.height).toBeGreaterThanOrEqual(44);
    expect(nextBox.width).toBeGreaterThanOrEqual(44);
    await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBe(0);
    await expect
      .poll(() =>
        page.evaluate(() => ({
          document: document.documentElement.scrollWidth - window.innerWidth,
          main:
            document.querySelector("main")!.scrollWidth -
            document.querySelector("main")!.clientWidth,
        })),
      )
      .toEqual({ document: 0, main: 0 });
    await expect(main).toContainText("Thank you!");
  }
});

for (const viewport of responsiveViewports) {
  test(`a 160-character acknowledgment stays fully usable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const heading = await openAcknowledgment(page, {
      path: longAcknowledgmentPath,
      text: longAcknowledgment,
    });
    const image = page.getByRole("img", { name: "Peppa smiling" });
    const next = page.getByRole("button", { exact: true, name: "Next" });
    const account = page.getByRole("button", { name: /^Profile for / });
    const main = page.getByRole("main");

    await expect(heading).toHaveText(longAcknowledgment);
    await expect(heading).toBeFocused();
    await expect
      .poll(() =>
        heading.evaluate((element) => ({
          horizontal: element.scrollWidth - element.clientWidth,
          vertical: element.scrollHeight - element.clientHeight,
        })),
      )
      .toEqual({ horizontal: 0, vertical: 0 });
    await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBe(0);
    await expect(image).toBeVisible();
    const [imageBox, headingBox, nextBox, accountBox] = await Promise.all([
      box(image),
      expectInsideViewport(heading, viewport),
      expectInsideViewport(next, viewport),
      expectInsideViewport(account, viewport),
    ]);
    expect(nextBox.height).toBeGreaterThanOrEqual(44);
    expect(nextBox.width).toBeGreaterThanOrEqual(44);
    for (const contentBox of [imageBox, headingBox, nextBox]) {
      expect(boxesOverlap(accountBox, contentBox)).toBe(false);
    }
    await expectNoHorizontalOverflow(page);

    await page.waitForTimeout(2_200);
    await expect(page).toHaveURL(longAcknowledgmentPath);
    await expect(heading).toHaveText(longAcknowledgment);
    await expect(next).toBeVisible();
    await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBe(0);

    await next.click();
    await expect(page).toHaveURL("/");
    await expect(heading).toHaveCount(0);
  });
}
