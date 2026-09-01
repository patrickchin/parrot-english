import { expect, test, type Locator, type Page } from "@playwright/test";

const animals = [
  ["cat", "Which is the cat?", "Correct!"],
  ["dog", "Which is the dog?", "Correct!"],
  ["bird", "Which is the bird?", "Correct!"],
  ["fish", "Which is the fish?", "Correct!"],
  ["duck", "Which is the duck?", "Correct!"],
  ["frog", "Which is the frog?", "Correct!"],
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
  { columns: 4, height: 900, name: "768px", rows: 1, width: 768 },
  { columns: 4, height: 900, name: "1280px", rows: 1, width: 1280 },
] as const;

const promptParityCases = [
  ["animals", "Which is the cat?", "word-game-animals-cat-prompt"],
  ["colors", "Which color is red?", "word-game-colors-red-prompt"],
  ["body-parts", "Which picture shows the eyes?", "word-game-body-parts-eyes-prompt"],
  ["feelings", "Which face looks happy?", "word-game-feelings-happy-prompt"],
] as const;

type MediaSnapshot = {
  cueCancellations: number;
  cues: Array<{ audioId?: string; kind: "device" | "static"; source?: string; text: string }>;
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
    .map(({ audioId, source }) => ({ audioId, source }));
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
  const box = await visibleBox(locator);
  const width = page.viewportSize()!.width;
  expect(box.x).toBeGreaterThanOrEqual(-0.5);
  expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function expectNextTabReaches(page: Page, locator: Locator) {
  await page.keyboard.press("Tab");
  await expect(locator).toBeFocused();
  await expect(locator).toBeInViewport();
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
  await page.getByRole("link", { name: "Simple Animals: First look" }).click();
  await expect(page).toHaveURL(/\/word-games\/animals\/simple-1/);

  const { choices, main, progress } = game(page);
  await expect(main.getByRole("heading", { level: 1, name: "Simple Animals: First look" })).toBeVisible();
  await expect(main.getByRole("heading", { level: 2, name: animals[0][1] })).toBeVisible();
  await expect(main.getByRole("link", { name: "Back to Animals" }).first())
    .toHaveAttribute("href", "/word-games/animals");
  await expect(choices.getByRole("button", { name: /^Choose / })).toHaveCount(4);
  await expect(choices.getByRole("button", { name: /^Listen: / })).toHaveCount(4);
  const initialChoiceOrder = await choiceOrder(choices);
  expect(new Set(initialChoiceOrder)).toEqual(new Set(authoredChoices[0]));
  await expect(progress).toHaveAttribute("aria-valuetext", "1 of 6");
  await expect.poll(() => staticRequests(page)).toEqual([{
    audioId: "word-game-animals-cat-prompt",
    source: "/assets/audio/word-game-animals-cat-prompt.mp3",
  }]);

  const beforeListenAgainCount = (await staticRequests(page)).length;
  await main.getByRole("button", { name: "Listen again" }).click();
  await expect.poll(async () => {
    const requests = await staticRequests(page);
    return { count: requests.length, tail: requests.at(-1) };
  }).toEqual({
    count: beforeListenAgainCount + 1,
    tail: {
      audioId: "word-game-animals-cat-prompt",
      source: "/assets/audio/word-game-animals-cat-prompt.mp3",
    },
  });

  const listenDog = choices.getByRole("button", { name: "Listen: dog" });
  await listenDog.click();
  await expect(listenDog).toBeFocused();
  await expect(main.getByRole("status", { name: "Answer feedback" })).toBeEmpty();
  expect(await choiceOrder(choices)).toEqual(initialChoiceOrder);
  await expect.poll(() => hasStaticRequest(page, "word-game-animals-dog-label")).toBe(true);

  await choices.getByRole("button", { name: "Choose bird" }).click();
  await expect(main.getByRole("status", { name: "Answer feedback" }))
    .toHaveText("bird");
  expect(await choiceOrder(choices)).toEqual(initialChoiceOrder);
  await expect.poll(() => hasStaticRequest(page, "word-game-animals-bird-label")).toBe(true);
  await releaseNextCue(page);
  await expect.poll(async () => (await mediaSnapshot(page)).pendingCues).toBe(0);
  expect(await hasStaticRequest(page, "word-game-retry")).toBe(false);

  await choices.getByRole("button", { name: "Choose cat" }).click();
  await expect(main.getByRole("status", { name: "Answer feedback" })).toHaveText(animals[0][2]);
  await expect.poll(async () => (await staticRequests(page)).at(-1)?.audioId)
    .toBe("word-game-animals-cat-label");
  await releaseNextCue(page);
  await expect(progress).toHaveAttribute("aria-valuetext", "1 of 6");
  await expect.poll(async () => (await staticRequests(page)).at(-1)?.audioId)
    .toBe("word-game-correct");
  await releaseNextCue(page);
  await expect(progress).toHaveAttribute("aria-valuetext", "2 of 6");
  await expect(main.getByRole("heading", { level: 2, name: animals[1][1] })).toBeFocused();
  await expect.poll(() => hasStaticRequest(page, "word-game-animals-dog-prompt")).toBe(true);
});

test("renders Listen again as an icon-only accessible control", async ({ page }) => {
  await page.goto("/word-games/animals/simple-1?parrotE2eLesson=held-cue");

  const listenAgain = game(page).main.getByRole("button", { name: "Listen again" });
  await expect(listenAgain).toBeVisible();
  await expect(listenAgain).toHaveText("");
});

test("aligns Listen again on the question line", async ({ page }) => {
  await page.goto("/word-games/animals/simple-1?parrotE2eLesson=held-cue");

  const { main } = game(page);
  const questionBox = await visibleBox(
    main.getByRole("heading", { level: 2, name: animals[0][1] }),
  );
  const listenAgainBox = await visibleBox(
    main.getByRole("button", { name: "Listen again" }),
  );

  expect(listenAgainBox.y).toBeLessThan(questionBox.y + questionBox.height);
  expect(listenAgainBox.y + listenAgainBox.height).toBeGreaterThan(questionBox.y);
});

test("keeps authored question order and deterministically reshuffles only on Play again", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__wordGameUnrelatedRandom", {
      configurable: true,
      value: Math.random,
    });
  });
  await page.goto("/word-games/animals/simple-1?parrotE2eLesson=held-cue&parrotE2eWordGameRandom=reshuffle");
  const { choices, main, progress } = game(page);
  await expect.poll(() => page.evaluate(() => Math.random === (
    window as Window & { __wordGameUnrelatedRandom?: typeof Math.random }
  ).__wordGameUnrelatedRandom)).toBe(true);
  const firstOrder = await choiceOrder(choices);

  for (const [index, [answer, prompt, success]] of animals.entries()) {
    await expect(progress).toHaveAttribute("aria-valuetext", `${index + 1} of 6`);
    await expect(main.getByRole("heading", { level: 2, name: prompt })).toBeVisible();
    expect(new Set(await choiceOrder(choices))).toEqual(new Set(authoredChoices[index]));
    await choices.getByRole("button", { name: `Choose ${answer}` }).click();
    await expect(main.getByRole("status", { name: "Answer feedback" })).toHaveText(success);
    await finishCorrectFeedback(page);
  }

  const completion = main.getByRole("heading", {
    level: 2,
    name: "Great listening! You finished the game.",
  });
  await expect(completion).toBeFocused();
  await expect(main.getByRole("link", { name: "Back to Animals" }).last())
    .toHaveAttribute("href", "/word-games/animals");
  await expect.poll(() => hasStaticRequest(page, "word-game-complete")).toBe(true);

  const beforePlayAgainCount = (await staticRequests(page)).length;
  await main.getByRole("button", { name: "Play again" }).click();
  await expect(main.getByRole("heading", { level: 2, name: animals[0][1] })).toBeFocused();
  await expect.poll(async () => {
    const requests = await staticRequests(page);
    return { count: requests.length, tail: requests.at(-1) };
  }).toEqual({
    count: beforePlayAgainCount + 1,
    tail: {
      audioId: "word-game-animals-cat-prompt",
      source: "/assets/audio/word-game-animals-cat-prompt.mp3",
    },
  });
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
    .toHaveText("bird");
  await choices.getByRole("button", { name: "Choose cat" }).click();
  await expect(progress).toHaveAttribute("aria-valuetext", "2 of 6");
  await expect(choices.getByRole("button", { name: /^Choose / })).toHaveCount(4);
});

test("uses the rendered saved prompt cue for animal, color, body-part, and feeling questions", async ({ page }) => {
  for (const [categoryId, prompt, audioId] of promptParityCases) {
    await page.goto(`/word-games/${categoryId}/simple-1?parrotE2eLesson=held-cue`);
    const { main } = game(page);
    const heading = main.getByRole("heading", { level: 2, name: prompt });
    await expect(heading).toBeVisible();
    const text = await heading.innerText();
    await expect.poll(async () => {
      const cue = (await mediaSnapshot(page)).cues
        .filter(({ kind }) => kind === "static")
        .at(-1);
      return { audioId: cue?.audioId, source: cue?.source, text: cue?.text };
    }).toEqual({
      audioId,
      source: `/assets/audio/${audioId}.mp3`,
      text,
    });
  }
});

test("keeps all short-wide controls scrollable and reachable", async ({ page }) => {
  await page.setViewportSize({ height: 360, width: 640 });
  await page.goto("/word-games/animals/simple-1?parrotE2eLesson=held-cue");
  const { choices, main } = game(page);
  await expect.poll(() => main.evaluate((element) => element.scrollHeight - element.clientHeight))
    .toBeGreaterThan(0);
  const headerBack = main.getByRole("link", { name: "Back to Animals" });
  await page.keyboard.press("Shift+Tab");
  await expect(headerBack).toBeFocused();
  await expect(headerBack).toBeInViewport();
  const targetListen = main.getByRole("button", { name: "Listen again" });
  await expectNextTabReaches(page, targetListen);
  const chooseButtons = choices.getByRole("button", { name: /^Choose / });
  const listenButtons = choices.getByRole("button", { name: /^Listen: / });
  for (let index = 0; index < 4; index += 1) {
    await expectNextTabReaches(page, chooseButtons.nth(index));
    await expectNextTabReaches(page, listenButtons.nth(index));
  }

  for (const [answer] of animals) {
    await choices.getByRole("button", { name: `Choose ${answer}` }).click();
    await finishCorrectFeedback(page);
  }
  const replay = main.getByRole("button", { name: "Play again" });
  const completionBack = main.getByRole("link", { name: "Back to Animals" }).last();
  await expectNextTabReaches(page, replay);
  await expectNextTabReaches(page, completionBack);
});

test("routes every malformed word-game URL back to the word-game shelf", async ({ page }) => {
  for (const path of [
    "/word-games/animals/simple-1/extra",
    "/word-games/animals/simple-1/extra/more",
    "/word-games/%61nimals",
    "/word-games/animals/%73imple-1",
    "/word-games/missing",
    "/word-games/animals/missing",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL("/word-games");
    await expect(page.getByRole("heading", { level: 1, name: "Pick a word game" }))
      .toBeVisible();
  }
});

test("renders the generated hierarchy, Fluent covers, and native color swatches", async ({ page }) => {
  const covers = [
    ["Animals", "A friendly cat.", "/assets/word-games/fluent-3d/1f431.png"],
    ["Colors", "The color red.", "rgb(239, 68, 68)"],
    ["Body Parts", "A pair of eyes.", "/assets/word-games/fluent-3d/1f440.png"],
    ["Food", "An apple.", "/assets/word-games/fluent-3d/1f34e.png"],
    ["Toys", "A ball.", "/assets/word-games/fluent-3d/26bd.png"],
    ["Feelings", "A happy face.", "/assets/word-games/fluent-3d/1f604.png"],
    ["Home", "A house.", "/assets/word-games/fluent-3d/1f3e0.png"],
    ["Clothes", "A shirt.", "/assets/word-games/fluent-3d/1f455.png"],
    ["Transport", "A car.", "/assets/word-games/fluent-3d/1f697.png"],
  ] as const;

  await page.goto("/word-games");
  const shelf = page.getByRole("main");
  await expect(shelf.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(shelf.getByRole("link", { name: "Back to home" }))
    .toHaveAttribute("href", "/");
  const categoryNav = shelf.getByRole("navigation", { name: "Word games" });
  await expect(categoryNav.getByRole("link")).toHaveCount(9);
  for (const [title, alt, presentation] of covers) {
    const visual = categoryNav.getByRole("link", { name: title })
      .getByRole("img", { name: alt });
    if (presentation.startsWith("/")) {
      await expect(visual).toHaveAttribute("src", presentation);
    } else {
      await expect.poll(() => visual.evaluate((element) =>
        getComputedStyle(element).backgroundColor)).toBe(presentation);
    }
  }

  await categoryNav.getByRole("link", { name: "Animals" }).click();
  const category = page.getByRole("main");
  await expect(category.getByRole("heading", { level: 1, name: "Animals" }))
    .toHaveCount(1);
  await expect(category.getByRole("link", { name: "Back to word games" }))
    .toHaveAttribute("href", "/word-games");
  await expect(category.getByRole("heading", { level: 2 }).allTextContents())
    .resolves.toEqual(["Simple", "Intermediate", "Advanced"]);
  await expect(category.getByRole("link", { name: /^(?:Simple|Intermediate|Advanced) Animals:/ })).toHaveCount(9);
  for (const alt of [
    "A friendly cat.", "A friendly bird.", "A friendly duck.",
    "A friendly cow.", "A friendly pig.", "A friendly horse.", "A friendly elephant.",
  ]) await expect(category.getByRole("img", { name: alt }).first()).toBeVisible();

  await category.getByRole("link", { name: "Simple Animals: First look" }).click();
  const player = page.getByRole("main");
  await expect(player.getByRole("heading", { level: 1, name: "Simple Animals: First look" }))
    .toHaveCount(1);
  await expect(player.getByRole("link", { name: "Back to Animals" }))
    .toHaveAttribute("href", "/word-games/animals");
  for (const [alt, src] of [
    ["A friendly cat.", "/assets/word-games/fluent-3d/1f431.png"],
    ["A friendly dog.", "/assets/word-games/fluent-3d/1f415.png"],
    ["A friendly bird.", "/assets/word-games/fluent-3d/1f426.png"],
    ["A friendly fish.", "/assets/word-games/fluent-3d/1f41f.png"],
  ]) {
    await expect(player.getByRole("img", { name: alt })).toHaveAttribute("src", src);
  }

  await page.goto("/word-games/colors/simple-1");
  const swatches = page.getByRole("group", { name: "Picture choices" });
  for (const [alt, color] of [
    ["The color red.", "rgb(239, 68, 68)"],
    ["The color blue.", "rgb(59, 130, 246)"],
    ["The color yellow.", "rgb(234, 179, 8)"],
    ["The color green.", "rgb(34, 197, 94)"],
  ]) {
    const swatch = swatches.getByRole("img", { name: alt });
    await expect.poll(() => swatch.evaluate((element) =>
      getComputedStyle(element).backgroundColor)).toBe(color);
  }
});

test("renders plural artwork as one named composition with two decorative copies", async ({ page }) => {
  await page.goto("/word-games/body-parts/simple-1?parrotE2eLesson=held-cue");
  const bodyPartChoices = page.getByRole("group", { name: "Picture choices" });
  const earsChoice = bodyPartChoices.getByRole("button", { name: "Choose ears" });
  await expect(earsChoice.getByRole("img", { name: "A pair of ears." })).toHaveCount(1);
  await expect(earsChoice.locator("img")).toHaveCount(2);
  await expect(earsChoice.locator("img").nth(0)).toHaveAttribute("alt", "");
  await expect(earsChoice.locator("img").nth(1)).toHaveAttribute("alt", "");

  await page.goto("/word-games/animals/simple-1?parrotE2eLesson=held-cue");
  const animalChoices = page.getByRole("group", { name: "Picture choices" });
  const catChoice = animalChoices.getByRole("button", { name: "Choose cat" });
  await expect(catChoice.getByRole("img", { name: "A friendly cat." })).toHaveCount(1);
  await expect(catChoice.locator("img")).toHaveCount(1);
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
  await expect.poll(() => hasStaticRequest(page, "word-game-animals-cat-prompt")).toBe(true);
});

test("keeps all tier headings and quiz cards reachable across required category viewports", async ({ page }) => {
  const smallWidths = new Set([280, 390, 640, 768]);
  for (const viewport of responsiveViewports) {
    await page.setViewportSize(viewport);
    await page.goto("/word-games/animals");
    const main = page.getByRole("main");
    const headings = main.getByRole("heading", { level: 2 });
    const cards = main.getByRole("link", { name: /^(?:Simple|Intermediate|Advanced) Animals:/ });
    await expect(headings).toHaveCount(3);
    await expect(cards).toHaveCount(9);

    for (const locator of [...await headings.all(), ...await cards.all()]) {
      await locator.scrollIntoViewIfNeeded();
      await expect(locator).toBeInViewport();
      await expectHorizontallyContained(page, locator);
    }

    const headingBoxes = await Promise.all((await headings.all()).map(visibleBox));
    const cardBoxes = await Promise.all((await cards.all()).slice(0, 3).map(visibleBox));
    if (smallWidths.has(viewport.width)) {
      expect(new Set(headingBoxes.map(({ y }) => Math.round(y))).size).toBe(3);
      expect(cardBoxes.every(({ width }) => width > 0)).toBe(true);
    } else {
      expect(new Set(headingBoxes.map(({ x }) => Math.round(x))).size).toBe(3);
      expect(new Set(headingBoxes.map(({ y }) => Math.round(y))).size).toBe(1);
      expect(new Set(cardBoxes.map(({ y }) => Math.round(y))).size).toBe(3);
    }
  }
});
