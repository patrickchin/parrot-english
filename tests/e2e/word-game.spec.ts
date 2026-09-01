import { expect, test, type Locator, type Page } from "@playwright/test";

const animals = [
  ["cat", "Cat. Which is the cat?", "Great job! This is a cat."],
  ["dog", "Dog. Which is the dog?", "Great job! This is a dog."],
  ["bird", "Bird. Which is the bird?", "Great job! This is a bird."],
  ["fish", "Fish. Which is the fish?", "Great job! This is a fish."],
  ["duck", "Duck. Which is the duck?", "Great job! This is a duck."],
  ["frog", "Frog. Which is the frog?", "Great job! This is a frog."],
] as const;

const authoredChoices = [
  ["cat", "dog", "bird", "fish"],
  ["dog", "bird", "fish", "duck"],
  ["bird", "fish", "duck", "frog"],
  ["fish", "duck", "frog", "cat"],
  ["duck", "frog", "cat", "dog"],
  ["frog", "cat", "dog", "bird"],
] as const;

const responsiveViewports = [
  { columns: 2, height: 568, name: "280px", rows: 2, width: 280 },
  { columns: 2, height: 844, name: "390px", rows: 2, width: 390 },
  { columns: 2, height: 360, name: "640px", rows: 2, width: 640 },
  { columns: 4, height: 500, name: "768px", rows: 1, width: 768 },
  { columns: 4, height: 800, name: "1280px", rows: 1, width: 1280 },
] as const;

type MediaSnapshot = {
  cueCancellations: number;
  cues: Array<{ audioId?: string; kind: "device" | "static"; text: string }>;
  pendingCues: number;
};

async function mediaSnapshot(page: Page) {
  return page.evaluate(() => {
    const controller = (window as Window & {
      __parrotE2eLessonMedia?: { snapshot(): MediaSnapshot };
    }).__parrotE2eLessonMedia;
    if (!controller) throw new Error("Media controller is missing.");
    return controller.snapshot();
  });
}

async function staticRequests(page: Page) {
  return (await mediaSnapshot(page)).cues
    .filter(({ kind }) => kind === "static")
    .map(({ audioId, text: source }) => ({ audioId, source }));
}

async function hasStaticRequest(page: Page, audioId: string) {
  return (await staticRequests(page)).some((request) => request.audioId === audioId);
}

async function releaseNextCue(page: Page) {
  await page.evaluate(() => {
    const controller = (window as Window & {
      __parrotE2eLessonMedia?: { releaseNextCue(): boolean };
    }).__parrotE2eLessonMedia;
    if (!controller?.releaseNextCue()) throw new Error("No held cue to release.");
  });
}

function game(page: Page) {
  const main = page.getByRole("main");
  return {
    choices: main.getByRole("group", { name: "Picture choices" }),
    main,
    progress: main.getByRole("progressbar", { name: "Game progress" }),
  };
}

async function choiceOrder(choices: Locator) {
  return choices.getByRole("button", { name: /^Choose / }).evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute("aria-label")?.replace("Choose ", "")));
}

async function visibleBox(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function renderedRows(locator: Locator) {
  const boxes = await Promise.all((await locator.all()).map(visibleBox));
  return new Set(boxes.map(({ y }) => Math.round(y))).size;
}

async function renderedColumns(locator: Locator) {
  const boxes = await Promise.all((await locator.all()).map(visibleBox));
  const firstRow = Math.min(...boxes.map(({ y }) => y));
  return boxes.filter(({ y }) => Math.abs(y - firstRow) <= 2).length;
}

async function expectHorizontallyContained(page: Page, locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await visibleBox(locator);
  const width = page.viewportSize()!.width;
  expect(box.x).toBeGreaterThanOrEqual(-0.5);
  expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function finishCorrectFeedback(page: Page) {
  await releaseNextCue(page);
  await releaseNextCue(page);
}

test("navigates through a category and plays saved four-choice feedback in sequence", async ({ page }) => {
  await page.goto("/word-games?parrotE2eLesson=held-cue");
  await page.getByRole("navigation", { name: "Word games" })
    .getByRole("link", { name: "Animals" }).click();
  await expect(page).toHaveURL(/\/word-games\/animals/);
  await page.getByRole("link", { name: "Simple animals" }).click();
  await expect(page).toHaveURL(/\/word-games\/animals\/simple-1/);

  const { choices, main, progress } = game(page);
  await expect(main.getByRole("heading", { level: 1, name: "Simple animals" })).toBeVisible();
  await expect(main.getByRole("heading", { level: 2, name: animals[0][1] })).toBeVisible();
  await expect(main.getByRole("link", { name: "Back to Animals" }).first())
    .toHaveAttribute("href", "/word-games/animals");
  await expect(choices.getByRole("button", { name: /^Choose / })).toHaveCount(4);
  await expect(choices.getByRole("button", { name: /^Listen: / })).toHaveCount(4);
  const initialChoiceOrder = await choiceOrder(choices);
  expect(new Set(initialChoiceOrder)).toEqual(new Set(authoredChoices[0]));
  await expect(progress).toHaveAttribute("aria-valuetext", "1 of 6");
  await expect.poll(() => staticRequests(page)).toEqual([{
    audioId: "word-game-animals-cat-label",
    source: "/assets/audio/word-game-animals-cat-label.mp3",
  }]);

  const listenDog = choices.getByRole("button", { name: "Listen: dog" });
  await listenDog.click();
  await expect(listenDog).toBeFocused();
  await expect(main.getByRole("status", { name: "Answer feedback" })).toBeEmpty();
  expect(await choiceOrder(choices)).toEqual(initialChoiceOrder);
  await expect.poll(() => hasStaticRequest(page, "word-game-animals-dog-label")).toBe(true);

  await choices.getByRole("button", { name: "Choose bird" }).click();
  await expect(main.getByRole("status", { name: "Answer feedback" }))
    .toHaveText("This is a bird. Listen and try again.");
  expect(await choiceOrder(choices)).toEqual(initialChoiceOrder);
  await expect.poll(() => hasStaticRequest(page, "word-game-animals-bird-label")).toBe(true);
  await releaseNextCue(page);
  await expect.poll(() => hasStaticRequest(page, "word-game-retry")).toBe(true);

  await choices.getByRole("button", { name: "Choose cat" }).click();
  await expect(main.getByRole("status", { name: "Answer feedback" })).toHaveText(animals[0][2]);
  await expect.poll(() => hasStaticRequest(page, "narrator-feedback-success")).toBe(true);
  await releaseNextCue(page);
  await expect(progress).toHaveAttribute("aria-valuetext", "1 of 6");
  await expect.poll(() => hasStaticRequest(page, "word-game-animals-cat-label")).toBe(true);
  await releaseNextCue(page);
  await expect(progress).toHaveAttribute("aria-valuetext", "2 of 6");
  await expect(main.getByRole("heading", { level: 2, name: animals[1][1] })).toBeFocused();
});

test("keeps authored question order and deterministically reshuffles only on Play again", async ({ page }) => {
  await page.goto("/word-games/animals/simple-1?parrotE2eLesson=held-cue&parrotE2eWordGameRandom=reshuffle");
  const { choices, main, progress } = game(page);
  const firstOrder = await choiceOrder(choices);

  for (const [index, [answer, prompt, success]] of animals.entries()) {
    await expect(progress).toHaveAttribute("aria-valuetext", `${index + 1} of 6`);
    await expect(main.getByRole("heading", { level: 2, name: prompt })).toBeVisible();
    expect(new Set(await choiceOrder(choices))).toEqual(new Set(authoredChoices[index]));
    await choices.getByRole("button", { name: `Choose ${answer}` }).click();
    await expect(main.getByRole("status", { name: "Answer feedback" })).toHaveText(success);
    await finishCorrectFeedback(page);
  }

  const completion = main.getByRole("heading", { level: 2, name: "Great listening!" });
  await expect(completion).toBeFocused();
  await expect(main.getByRole("link", { name: "Back to Animals" }).last())
    .toHaveAttribute("href", "/word-games/animals");
  await expect.poll(() => hasStaticRequest(page, "word-game-complete")).toBe(true);

  await main.getByRole("button", { name: "Play again" }).click();
  await expect(main.getByRole("heading", { level: 2, name: animals[0][1] })).toBeFocused();
  const replayOrder = await choiceOrder(choices);
  expect(replayOrder).not.toEqual(firstOrder);
  expect(new Set(replayOrder)).toEqual(new Set(authoredChoices[0]));
  await expect(progress).toHaveAttribute("aria-valuetext", "1 of 6");

  const replayedPrompts: string[] = [];
  for (const [answer, prompt] of animals) {
    const heading = main.getByRole("heading", { level: 2, name: prompt });
    replayedPrompts.push(await heading.innerText());
    await choices.getByRole("button", { name: `Choose ${answer}` }).click();
    await finishCorrectFeedback(page);
  }
  expect(replayedPrompts).toEqual(animals.map(([, prompt]) => prompt));
});

test("cancels replaced and unmounted saved playback", async ({ page }) => {
  await page.goto("/word-games/animals/simple-1?parrotE2eLesson=held-cue");
  const { main } = game(page);
  await main.getByRole("button", { name: "Listen again" }).click();
  await expect.poll(async () => (await mediaSnapshot(page)).cueCancellations).toBe(1);
  await main.getByRole("link", { name: "Back to Animals" }).click();
  await expect(page).toHaveURL("/word-games/animals");
  await expect.poll(async () => (await mediaSnapshot(page)).cueCancellations).toBe(2);
});

test("keeps visual play usable with one persistent saved-sound failure", async ({ page }) => {
  await page.goto("/word-games/animals/simple-1?parrotE2eLesson=cue-failure");
  const { choices, main, progress } = game(page);
  await expect(main.getByRole("alert")).toHaveText("Sound is not available. You can still play.");
  await choices.getByRole("button", { name: "Choose bird" }).click();
  await expect(main.getByRole("status", { name: "Answer feedback" }))
    .toHaveText("This is a bird. Listen and try again.");
  await choices.getByRole("button", { name: "Choose cat" }).click();
  await expect(progress).toHaveAttribute("aria-valuetext", "2 of 6");
  await expect(choices.getByRole("button", { name: /^Choose / })).toHaveCount(4);
});

test("keeps all short-wide controls scrollable and reachable", async ({ page }) => {
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto("/word-games/animals/simple-1");
  const { choices, main } = game(page);
  await expect.poll(() => main.evaluate((element) => element.scrollHeight - element.clientHeight))
    .toBeGreaterThan(0);
  const finalListen = choices.getByRole("button", { name: /^Listen: / }).last();
  await finalListen.scrollIntoViewIfNeeded();
  await expect(finalListen).toBeInViewport();
  await expectHorizontallyContained(page, finalListen);
});

for (const viewport of responsiveViewports) {
  test(`renders four choices in ${viewport.rows} rows and ${viewport.columns} columns at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/word-games/animals/simple-1?parrotE2eLesson=held-cue");
    const { choices, main, progress } = game(page);
    const chooseButtons = choices.getByRole("button", { name: /^Choose / });
    const listenButtons = choices.getByRole("button", { name: /^Listen: / });
    await expect(chooseButtons).toHaveCount(4);
    await expect(listenButtons).toHaveCount(4);
    expect(await renderedRows(chooseButtons)).toBe(viewport.rows);
    expect(await renderedColumns(chooseButtons)).toBe(viewport.columns);
    await expectHorizontallyContained(page, progress);
    for (const control of [...await chooseButtons.all(), ...await listenButtons.all()]) {
      await expectHorizontallyContained(page, control);
    }
    await expect(main.getByRole("link", { name: "Back to Animals" }).first()).toBeVisible();
  });
}

test("keeps the round usable when the browser blocks initial autoplay", async ({ page }) => {
  await page.goto("/word-games/animals/simple-1?parrotE2eLesson=autoplay-blocked");
  const { choices, main } = game(page);
  await expect(choices.getByRole("button", { name: /^Choose / })).toHaveCount(4);
  await expect(main.getByRole("alert")).toHaveCount(0);
  await expect.poll(() => staticRequests(page)).toEqual([]);
  await main.getByRole("button", { name: "Listen again" }).click();
  await expect.poll(() => hasStaticRequest(page, "word-game-animals-cat-label")).toBe(true);
});
