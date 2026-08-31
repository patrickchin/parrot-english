import { expect, test, type Locator, type Page } from "@playwright/test";

const quizRounds = [
  {
    answer: "Cat",
    artworkName: /Bob.+friendly cat/i,
    artworkPath: "hello-cat-cat-hello.webp",
  },
  {
    answer: "Dog",
    artworkName: /Bob.+friendly dog/i,
    artworkPath: "hello-cat-dog-hello.webp",
  },
  {
    answer: "Bird",
    artworkName: /Bob.+friendly bird/i,
    artworkPath: "hello-cat-bird-hello.webp",
  },
  {
    answer: "Eyes",
    artworkName: /Mary.+eyes/i,
    artworkPath: "marys-face-eyes.webp",
  },
  {
    answer: "Soap",
    artworkName: /Sam.+soap.+hands/i,
    artworkPath: "wash-sam-wash-soap-on-hands.webp",
  },
  {
    answer: "Clean",
    artworkName: /Sam.+clean hands/i,
    artworkPath: "wash-sam-wash-clean-hands.webp",
  },
] as const;

type QuizSpeechSnapshot = {
  cueCancellations: number;
  cues: Array<{ kind: "device" | "static"; text: string }>;
};

async function quizSpeechSnapshot(page: Page) {
  return page.evaluate(() => {
    const controller = (
      window as Window & {
        __parrotE2eLessonMedia?: { snapshot(): QuizSpeechSnapshot };
      }
    ).__parrotE2eLessonMedia;
    if (!controller) throw new Error("Speech controller is missing.");
    return controller.snapshot();
  });
}

async function spokenQuizText(page: Page) {
  return (await quizSpeechSnapshot(page)).cues
    .filter(({ kind }) => kind === "device")
    .map(({ text }) => text);
}

async function expectArtworkLoaded(
  main: Locator,
  round: (typeof quizRounds)[number],
) {
  const picture = main.getByRole("img", { name: round.artworkName });
  await expect(picture).toBeVisible();
  await expect
    .poll(() =>
      picture.evaluate((image) =>
        image instanceof HTMLImageElement ? image.currentSrc : "",
      ),
    )
    .toContain(round.artworkPath);
  await expect
    .poll(() =>
      picture.evaluate((image) =>
        image instanceof HTMLImageElement && image.complete
          ? image.naturalWidth
          : 0,
      ),
    )
    .toBeGreaterThan(0);
  return picture;
}

async function expectInsideViewportHorizontally(locator: Locator, page: Page) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
  const [box, viewport] = await Promise.all([
    locator.boundingBox(),
    Promise.resolve(page.viewportSize()),
  ]);
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
}

test("answers six first-word questions, retries mistakes, and plays again", async ({
  page,
}) => {
  await page.goto("/word-game");

  const main = page.getByRole("main");
  const progress = main.getByRole("progressbar", {
    name: "Question progress",
  });
  const answers = main.getByRole("group", {
    name: "Choose the right answer",
  });

  await expect(
    main.getByRole("heading", { level: 1, name: "Word game" }),
  ).toBeVisible();
  await expect(progress).toHaveAttribute("aria-valuemin", "1");
  await expect(progress).toHaveAttribute("aria-valuemax", "6");
  await expect(progress).toHaveAttribute("aria-valuenow", "1");
  await expect(progress).toHaveAttribute("aria-valuetext", "Question 1 of 6");
  await expect(answers).toHaveCount(0);
  await main.getByRole("button", { name: "Start listening" }).click();
  await expect(answers.getByRole("button")).toHaveCount(3);

  await answers.getByRole("button", { name: "Dog" }).click();
  await expect(main.getByRole("status", { name: "Answer feedback" })).toHaveText(
    "Try again.",
  );
  await expect(progress).toHaveAttribute("aria-valuenow", "1");
  await expect(main.getByRole("button", { name: "Next" })).toHaveCount(0);

  for (const [index, round] of quizRounds.entries()) {
    await expectArtworkLoaded(main, round);
    const { answer } = round;
    await answers.getByRole("button", { name: answer, exact: true }).click();
    await expect(main.getByRole("status", { name: "Answer feedback" })).toContainText(
      `Yes! ${answer}.`,
    );

    const nextLabel = index === quizRounds.length - 1 ? "Finish" : "Next";
    await main.getByRole("button", { name: nextLabel }).click();

    if (index < quizRounds.length - 1) {
      await expect(progress).toHaveAttribute(
        "aria-valuenow",
        String(index + 2),
      );
      await expect(progress).toHaveAttribute(
        "aria-valuetext",
        `Question ${index + 2} of 6`,
      );
      await expect(main.getByRole("heading", { level: 2 })).toBeFocused();
    }
  }

  const completionHeading = main.getByRole("heading", {
    level: 2,
    name: "Great job!",
  });
  await expect(completionHeading).toBeVisible();
  await expect(completionHeading).toBeFocused();
  await expect(main.getByText("You got all six right.")).toBeVisible();

  await main.getByRole("button", { name: "Play again" }).click();
  await expect(progress).toHaveAttribute("aria-valuenow", "1");
  await expect(progress).toHaveAttribute("aria-valuetext", "Question 1 of 6");
  await expect(answers.getByRole("button", { name: "Cat" })).toBeVisible();
  await expect(
    main.getByRole("heading", { level: 2, name: "What is it?" }),
  ).toBeFocused();
});

test("reads each prompt and speaks the selected answer with feedback", async ({
  page,
}) => {
  await page.goto("/word-game?parrotE2eLesson=held-cue");

  const main = page.getByRole("main");
  await main.getByRole("button", { name: "Start listening" }).click();
  await expect
    .poll(() => spokenQuizText(page))
    .toEqual(["What is it? Cat. Dog. Bird."]);

  await main.getByRole("button", { name: "Listen again" }).click();
  await expect
    .poll(() => spokenQuizText(page))
    .toEqual([
      "What is it? Cat. Dog. Bird.",
      "What is it? Cat. Dog. Bird.",
    ]);

  const answers = main.getByRole("group", {
    name: "Choose the right answer",
  });
  await answers.getByRole("button", { exact: true, name: "Dog" }).click();
  await expect(main.getByRole("status", { name: "Answer feedback" })).toHaveText(
    "Try again.",
  );
  await expect
    .poll(() => spokenQuizText(page))
    .toEqual([
      "What is it? Cat. Dog. Bird.",
      "What is it? Cat. Dog. Bird.",
      "Dog. Try again.",
    ]);

  await answers.getByRole("button", { exact: true, name: "Cat" }).click();
  await expect
    .poll(() => spokenQuizText(page))
    .toEqual([
      "What is it? Cat. Dog. Bird.",
      "What is it? Cat. Dog. Bird.",
      "Dog. Try again.",
      "Cat. Yes!",
    ]);

  await main.getByRole("button", { name: "Next" }).click();
  await expect
    .poll(() => spokenQuizText(page))
    .toEqual([
      "What is it? Cat. Dog. Bird.",
      "What is it? Cat. Dog. Bird.",
      "Dog. Try again.",
      "Cat. Yes!",
      "What is it? Bird. Cat. Dog.",
    ]);
  await expect
    .poll(async () => (await quizSpeechSnapshot(page)).cueCancellations)
    .toBe(4);
});

test("stops a spoken prompt when the child leaves the game", async ({ page }) => {
  await page.goto("/word-game?parrotE2eLesson=held-cue");
  await page.getByRole("button", { name: "Start listening" }).click();

  await page.getByRole("link", { name: "Back to home" }).click();

  await expect(page).toHaveURL("/");
  await expect
    .poll(async () => (await quizSpeechSnapshot(page)).cueCancellations)
    .toBe(1);
});

test("uses most of the desktop workspace for the active game", async ({ page }) => {
  await page.setViewportSize({ height: 800, width: 1280 });
  await page.goto("/word-game");

  const game = page.getByRole("region", { name: "Word game round" });
  await expect(game).toBeVisible();
  const box = await game.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(1100);
  expect(box!.height).toBeGreaterThanOrEqual(500);
});

for (const viewport of [
  { height: 568, name: "ultra-narrow phone", width: 280 },
  { height: 360, name: "short landscape", width: 640 },
  { height: 800, name: "desktop", width: 1280 },
]) {
  test(`keeps the word game contained on a ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/word-game");

    const main = page.getByRole("main");
    const answers = main.getByRole("group", {
      name: "Choose the right answer",
    });
    await main.getByRole("button", { name: "Start listening" }).click();
    const picture = await expectArtworkLoaded(main, quizRounds[0]);
    await expectInsideViewportHorizontally(picture, page);
    for (const button of await answers.getByRole("button").all()) {
      await expectInsideViewportHorizontally(button, page);
    }
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
  });
}
