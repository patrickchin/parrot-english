import { expect, test, type Locator, type Page } from "@playwright/test";

const animals = [
  ["cat", "Which is the cat?", "A friendly cat."],
  ["dog", "Which is the dog?", "A friendly dog."],
  ["bird", "Which is the bird?", "A friendly bird."],
  ["fish", "Which is the fish?", "A friendly fish."],
  ["duck", "Which is the duck?", "A friendly duck."],
  ["frog", "Which is the frog?", "A friendly frog."],
] as const;

const responsiveViewports = [
  { choiceRows: 3, columns: 1, height: 568, name: "280px", width: 280 },
  { choiceRows: 2, columns: 2, height: 844, name: "390px", width: 390 },
  { choiceRows: 2, columns: 2, height: 360, name: "640px", width: 640 },
  { choiceRows: 1, columns: 3, height: 360, name: "768px", width: 768 },
  { choiceRows: 1, columns: 3, height: 800, name: "1280px", width: 1280 },
] as const;

type MediaSnapshot = {
  cueCancellations: number;
  cues: Array<{
    audioId?: string;
    kind: "device" | "static";
    text: string;
  }>;
  pendingCues: number;
};

async function mediaSnapshot(page: Page) {
  return page.evaluate(() => {
    const controller = (
      window as Window & {
        __parrotE2eLessonMedia?: { snapshot(): MediaSnapshot };
      }
    ).__parrotE2eLessonMedia;
    if (!controller) throw new Error("Media controller is missing.");
    return controller.snapshot();
  });
}

async function staticRequests(page: Page) {
  return (await mediaSnapshot(page)).cues
    .filter(({ kind }) => kind === "static")
    .map(({ audioId, text: source }) => ({ audioId, source }));
}

async function hasStaticRequest(
  page: Page,
  expected: { audioId: string; source: string },
) {
  return (await staticRequests(page)).some(
    ({ audioId, source }) =>
      audioId === expected.audioId && source === expected.source,
  );
}

async function releaseNextCue(page: Page) {
  await page.evaluate(() => {
    const controller = (
      window as Window & {
        __parrotE2eLessonMedia?: { releaseNextCue(): boolean };
      }
    ).__parrotE2eLessonMedia;
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

async function visibleBox(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function expectHorizontallyContained(
  page: Page,
  locator: Locator,
  viewport: (typeof responsiveViewports)[number],
) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeInViewport();
  const box = await visibleBox(locator);
  expect(box.x).toBeGreaterThanOrEqual(-0.5);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
}

async function expectKeyboardReachable(page: Page, locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  if (await locator.evaluate((element) => element === document.activeElement)) {
    return;
  }

  for (let index = 0; index < 40; index += 1) {
    await page.keyboard.press("Tab");
    if (await locator.evaluate((element) => element === document.activeElement)) {
      return;
    }
  }

  expect(
    await locator.evaluate((element) => element === document.activeElement),
  ).toBe(true);
}

async function expectSquare(locator: Locator) {
  const box = await visibleBox(locator);
  expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(2);
}

async function renderedRows(locator: Locator) {
  const positions = (await Promise.all(
    (await locator.all()).map(async (item) => (await visibleBox(item)).y),
  )).sort((first, second) => first - second);
  const rows: number[] = [];
  for (const position of positions) {
    if (rows.every((row) => Math.abs(row - position) > 2)) rows.push(position);
  }
  return rows.length;
}

async function renderedColumns(locator: Locator) {
  const positions = await Promise.all(
    (await locator.all()).map(async (item) => await visibleBox(item)),
  );
  const firstRow = Math.min(...positions.map(({ y }) => y));
  return positions.filter(({ y }) => Math.abs(y - firstRow) <= 2).length;
}

async function expectChoicePictures(choices: Locator, roundIndex: number) {
  const ids = [roundIndex, (roundIndex + 1) % 6, (roundIndex + 2) % 6];
  for (const id of ids) {
    const [label, , alt] = animals[id];
    const image = choices.getByRole("img", { name: alt });
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute(
      "src",
      `https://media.parrotbook.com/assets/v8/word-games/animals/${label}.webp`,
    );
  }
}

test("keeps picture exploration separate from choosing and uses saved audio", async ({
  page,
}) => {
  await page.goto("/word-games/animals?parrotE2eLesson=held-cue");
  const { choices, main, progress } = game(page);

  await expect(main.getByRole("heading", { level: 1, name: "Animals" })).toBeVisible();
  await expect(main.getByRole("heading", { level: 2, name: "Which is the cat?" })).toBeVisible();
  await expect(main.getByRole("link", { name: "Back to games" }).last()).toHaveAttribute("href", "/word-games");
  await expect(progress).toHaveAttribute("aria-valuemin", "1");
  await expect(progress).toHaveAttribute("aria-valuemax", "6");
  await expect(progress).toHaveAttribute("aria-valuenow", "1");
  await expect(progress).toHaveAttribute("aria-valuetext", "1 of 6");
  await expect(choices).toHaveCount(0);

  await main.getByRole("button", { name: "Start listening" }).click();
  await expect(choices.getByRole("button", { name: /^Choose / })).toHaveCount(3);
  await expect(choices.getByRole("button", { name: /^Listen: / })).toHaveCount(3);
  await expect(choices.getByText("Listen", { exact: true })).toHaveCount(3);
  await expectChoicePictures(choices, 0);
  await expect.poll(() => staticRequests(page)).toEqual([
    {
      audioId: "word-game-animals-cat-prompt",
      source: "/assets/audio/word-game-animals-cat-prompt.mp3",
    },
  ]);

  await main.getByRole("button", { name: "Listen again" }).click();
  await expect.poll(() => staticRequests(page)).toEqual([
    {
      audioId: "word-game-animals-cat-prompt",
      source: "/assets/audio/word-game-animals-cat-prompt.mp3",
    },
    {
      audioId: "word-game-animals-cat-prompt",
      source: "/assets/audio/word-game-animals-cat-prompt.mp3",
    },
  ]);

  const listenDog = choices.getByRole("button", { name: "Listen: dog" });
  await listenDog.click();
  await expect(listenDog).toBeFocused();
  await expect(main.getByRole("status", { name: "Answer feedback" })).toBeEmpty();
  await expect(progress).toHaveAttribute("aria-valuenow", "1");
  await expect(main.getByRole("button", { name: "Next" })).toHaveCount(0);
  for (const choose of await choices.getByRole("button", { name: /^Choose / }).all()) {
    await expect(choose).toBeEnabled();
    await expect(choose).toHaveAttribute("aria-pressed", "false");
  }
  await expect.poll(() => staticRequests(page)).toEqual([
    {
      audioId: "word-game-animals-cat-prompt",
      source: "/assets/audio/word-game-animals-cat-prompt.mp3",
    },
    {
      audioId: "word-game-animals-cat-prompt",
      source: "/assets/audio/word-game-animals-cat-prompt.mp3",
    },
    {
      audioId: "word-game-animals-dog-label",
      source: "/assets/audio/word-game-animals-dog-label.mp3",
    },
  ]);

  await choices.getByRole("button", { name: "Choose bird" }).click();
  await expect(main.getByRole("status", { name: "Answer feedback" })).toHaveText(
    "This is a bird. Listen and try again.",
  );
  for (const choose of await choices.getByRole("button", { name: /^Choose / }).all()) {
    await expect(choose).toBeEnabled();
  }
  await expect(progress).toHaveAttribute("aria-valuetext", "1 of 6");
  await expect(main.getByRole("button", { name: "Next" })).toHaveCount(0);
  await expect
    .poll(() =>
      hasStaticRequest(page, {
        audioId: "word-game-animals-bird-label",
        source: "/assets/audio/word-game-animals-bird-label.mp3",
      }),
    )
    .toBe(true);
  await releaseNextCue(page);
  await expect
    .poll(() =>
      hasStaticRequest(page, {
        audioId: "word-game-retry",
        source: "/assets/audio/word-game-retry.mp3",
      }),
    )
    .toBe(true);

  await choices.getByRole("button", { name: "Choose cat" }).click();
  await expect(main.getByRole("status", { name: "Answer feedback" })).toHaveText(
    "Yes, this is a cat.",
  );
  for (const choose of await choices.getByRole("button", { name: /^Choose / }).all()) {
    await expect(choose).toBeDisabled();
  }
  await expect(main.getByRole("button", { name: "Next" })).toBeVisible();
  await expect
    .poll(() =>
      hasStaticRequest(page, {
        audioId: "word-game-animals-cat-correct",
        source: "/assets/audio/word-game-animals-cat-correct.mp3",
      }),
    )
    .toBe(true);
  await expect(main.getByText(/quiz|score|question 1 of/i)).toHaveCount(0);
});

test("completes all six Animals rounds, focuses transitions, and plays again", async ({
  page,
}) => {
  await page.goto("/word-games/animals?parrotE2eLesson=held-cue");
  const { choices, main, progress } = game(page);
  await main.getByRole("button", { name: "Start listening" }).click();

  for (const [index, [answer, prompt]] of animals.entries()) {
    await expect(progress).toHaveAttribute("aria-valuetext", `${index + 1} of 6`);
    await expect(main.getByRole("heading", { level: 2, name: prompt })).toBeVisible();
    await expectChoicePictures(choices, index);
    await expect(choices.getByText(answer, { exact: true })).toHaveCount(0);
    await choices.getByRole("button", { name: `Choose ${answer}` }).click();
    await expect(main.getByRole("status", { name: "Answer feedback" })).toHaveText(
      `Yes, this is a ${answer}.`,
    );
    await main
      .getByRole("button", { name: index === animals.length - 1 ? "Finish" : "Next" })
      .click();
    if (index < animals.length - 1) {
      await expect(main.getByRole("heading", { level: 2, name: animals[index + 1][1] })).toBeFocused();
      const nextPromptId = `word-game-animals-${animals[index + 1][0]}-prompt`;
      await expect
        .poll(() =>
          hasStaticRequest(page, {
            audioId: nextPromptId,
            source: `/assets/audio/${nextPromptId}.mp3`,
          }),
        )
        .toBe(true);
    }
  }

  const completion = main.getByRole("heading", {
    level: 2,
    name: "Great listening!",
  });
  await expect(completion).toBeVisible();
  await expect(completion).toBeFocused();
  await expect(main.getByText("You finished the game.")).toBeVisible();
  await expect(main.getByRole("link", { name: "Back to games" }).last()).toHaveAttribute("href", "/word-games");
  await expect
    .poll(() =>
      hasStaticRequest(page, {
        audioId: "word-game-complete",
        source: "/assets/audio/word-game-complete.mp3",
      }),
    )
    .toBe(true);

  await main.getByRole("button", { name: "Play again" }).click();
  await expect(progress).toHaveAttribute("aria-valuetext", "1 of 6");
  await expect(main.getByRole("heading", { level: 2, name: "Which is the cat?" })).toBeFocused();
  await expect(choices.getByRole("button", { name: "Choose cat" })).toBeVisible();
  await expect
    .poll(() =>
      hasStaticRequest(page, {
        audioId: "word-game-animals-cat-prompt",
        source: "/assets/audio/word-game-animals-cat-prompt.mp3",
      }),
    )
    .toBe(true);
});

test("cancels replaced and unmounted saved playback", async ({ page }) => {
  await page.goto("/word-games/animals?parrotE2eLesson=held-cue");
  const { main } = game(page);
  await main.getByRole("button", { name: "Start listening" }).click();
  await main.getByRole("button", { name: "Listen again" }).click();
  await expect.poll(async () => (await mediaSnapshot(page)).cueCancellations).toBe(1);

  await main.getByRole("link", { name: "Back to games" }).click();
  await expect(page).toHaveURL("/word-games");
  await expect.poll(async () => (await mediaSnapshot(page)).cueCancellations).toBe(2);
});

test("keeps visual play usable with one persistent saved-sound failure", async ({
  page,
}) => {
  await page.goto("/word-games/animals?parrotE2eLesson=cue-failure");
  const { choices, main, progress } = game(page);
  await main.getByRole("button", { name: "Start listening" }).click();
  const alert = main.getByRole("alert");
  await expect(alert).toHaveText("Sound is not available. You can still play.");

  await choices.getByRole("button", { name: "Choose dog" }).click();
  await expect(main.getByRole("status", { name: "Answer feedback" })).toHaveText(
    "This is a dog. Listen and try again.",
  );
  await expect(alert).toBeVisible();
  await choices.getByRole("button", { name: "Choose cat" }).click();
  await main.getByRole("button", { name: "Next" }).click();
  await expect(progress).toHaveAttribute("aria-valuetext", "2 of 6");
  await expect(choices.getByRole("button", { name: /^Choose / })).toHaveCount(3);
  await expect(alert).toBeVisible();
  await expect((await mediaSnapshot(page)).cues.every(({ kind }) => kind === "static")).toBe(true);
});

test("uses a large scrollable game surface", async ({ page }) => {
  await page.setViewportSize({ height: 800, width: 1280 });
  await page.goto("/word-games/animals");
  const { main, progress } = game(page);
  const gameSurface = main.getByRole("region", { name: "Listening picture game" });
  await main.getByRole("button", { name: "Start listening" }).click();
  await expect(gameSurface).toBeVisible();
  expect((await gameSurface.boundingBox())?.width).toBeGreaterThanOrEqual(1100);
  expect((await gameSurface.boundingBox())?.height).toBeGreaterThanOrEqual(600);
  await expect(progress).toBeInViewport();

  await page.setViewportSize({ height: 360, width: 640 });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect(main.getByRole("button", { name: "Listen: bird" })).toBeInViewport();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const viewport of responsiveViewports) {
  test(`word-game library keeps square picture cards, ${viewport.columns} columns, and focusable controls at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/word-games");
    const main = page.getByRole("main");
    const header = main.getByRole("link", { name: "Back to home" });
    const library = main.getByRole("navigation", { name: "Word games" });
    const topicLinks = library.getByRole("link");
    const pictures = library.getByRole("img");

    await expect(topicLinks).toHaveCount(6);
    expect(await renderedColumns(topicLinks)).toBe(viewport.columns);
    for (const picture of await pictures.all()) {
      await expectSquare(picture);
      await expectHorizontallyContained(page, picture, viewport);
    }
    await expectHorizontallyContained(page, header, viewport);
    await expectKeyboardReachable(page, header);
    for (const topicLink of await topicLinks.all()) {
      await expectHorizontallyContained(page, topicLink, viewport);
      await expectKeyboardReachable(page, topicLink);
    }
  });
}

for (const viewport of responsiveViewports) {
  test(`word-game player keeps ${viewport.choiceRows} choice rows, contained picture controls, and keyboard navigation at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/word-games/animals?parrotE2eLesson=held-cue");
    const { choices, main, progress } = game(page);
    const header = main.getByRole("link", { name: "Back to games" }).first();

    await expectHorizontallyContained(page, header, viewport);
    await expectKeyboardReachable(page, header);
    await main.getByRole("button", { name: "Start listening" }).click();

    const chooseButtons = choices.getByRole("button", { name: /^Choose / });
    const listenButtons = choices.getByRole("button", { name: /^Listen: / });
    const pictures = choices.getByRole("img");
    await expect(chooseButtons).toHaveCount(3);
    await expect(listenButtons).toHaveCount(3);
    expect(await renderedRows(chooseButtons)).toBe(viewport.choiceRows);
    await expectHorizontallyContained(page, progress, viewport);
    for (const picture of await pictures.all()) {
      await expectHorizontallyContained(page, picture, viewport);
    }
    for (const chooseButton of await chooseButtons.all()) {
      await expectSquare(chooseButton);
      await expectHorizontallyContained(page, chooseButton, viewport);
      await expectKeyboardReachable(page, chooseButton);
    }
    for (const listenButton of await listenButtons.all()) {
      await expectHorizontallyContained(page, listenButton, viewport);
      await expectKeyboardReachable(page, listenButton);
    }

    await choices.getByRole("button", { name: "Choose cat" }).click();
    const next = main.getByRole("button", { name: "Next" });
    await expectHorizontallyContained(page, next, viewport);
    await expectKeyboardReachable(page, next);
  });
}
