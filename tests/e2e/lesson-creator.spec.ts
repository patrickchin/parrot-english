import { expect, test, type Locator, type Page } from "@playwright/test";
import { createLessonScript } from "../fixtures/lesson-script.mjs";

const shortPhone = { width: 320, height: 568 };
const lessonRevision = "a".repeat(64);

function guardianPath(path: string) {
  return `${path}${path.includes("?") ? "&" : "?"}parrotE2eGuardian=guardian`;
}

async function expectMainScrollsTo(page: Page, target: Locator) {
  const main = page.getByRole("main");
  const scrollRange = await main.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(scrollRange.scrollHeight).toBeGreaterThan(scrollRange.clientHeight);

  await main.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect
    .poll(() => main.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);

  await target.scrollIntoViewIfNeeded();
  const targetBox = await target.boundingBox();
  expect(targetBox).not.toBeNull();
  expect(targetBox!.y).toBeGreaterThanOrEqual(0);
  expect(targetBox!.y + targetBox!.height).toBeLessThanOrEqual(
    shortPhone.height,
  );
}

async function expectMainHasNoHorizontalOverflow(page: Page) {
  const main = page.getByRole("main");
  const width = await main.evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
}

test("lesson creator scrolls to its review controls on a short phone", async ({
  page,
}) => {
  await page.setViewportSize(shortPhone);
  await page.goto(guardianPath("/lessons/my/create"));

  await expect(
    page.getByRole("heading", { name: "Create a custom lesson" }),
  ).toBeVisible();

  const makeLessonButton = page.getByRole("button", {
    exact: true,
    name: "Make lesson",
  });
  await expectMainScrollsTo(page, makeLessonButton);
});

test("AI lesson creation opens the GUI and saves visual edits", async ({
  page,
}) => {
  const generatedLesson = createLessonScript({ title: "AI Garden Lesson" });
  generatedLesson.scenes = generatedLesson.scenes.slice(0, 1);
  generatedLesson.scenes[0].steps[0].dialogue =
    "Can you please point to the little red flower beside Peppa?";
  let savedLesson = generatedLesson;

  await page.route(/\/api\/lessons\/my\/generate(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      body: JSON.stringify({ lesson: generatedLesson, warnings: [] }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route(/\/api\/lessons\/my(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    const body = route.request().postDataJSON() as {
      lesson: typeof generatedLesson;
      source: string;
    };
    savedLesson = body.lesson;
    await route.fulfill({
      body: JSON.stringify({
        lesson: {
          id: "ai-gui-lesson",
          lesson: savedLesson,
          revision: lessonRevision,
          source: body.source,
        },
        warnings: [],
      }),
      contentType: "application/json",
      status: 201,
    });
  });
  await page.route(/\/api\/lessons\/my\/ai-gui-lesson(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        lesson: {
          id: "ai-gui-lesson",
          lesson: savedLesson,
          revision: lessonRevision,
          source: "generated",
        },
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto(guardianPath("/lessons/my/create"));
  await page
    .getByLabel("What should this lesson be about?")
    .fill("asking for help in a garden");
  await page.getByRole("button", { exact: true, name: "Make lesson" }).click();

  const titleField = page.getByLabel("Lesson title");
  await expect(titleField).toBeHidden();
  await expect(
    page.getByLabel("What should this lesson be about?"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(
    page.getByLabel("What should this lesson be about?"),
  ).toBeVisible();
  await expect(titleField).toHaveCount(0);
  await page
    .getByLabel("What should this lesson be about?")
    .fill("asking for help in a garden");
  await page.getByRole("button", { exact: true, name: "Make lesson" }).click();
  await expect(page.getByRole("button", { name: "Start over" })).toBeVisible();
  const languageNotes = page.getByLabel("Draft warnings");
  await expect(languageNotes).toContainText("question has 11 words");
  await expect(languageNotes).not.toHaveAttribute("role", "status");
  await expect(
    page.getByRole("button", { exact: true, name: "Save lesson" }),
  ).toBeEnabled();
  await page
    .getByRole("group", { name: "Dialogue 1" })
    .getByRole("textbox", { name: "Dialogue", exact: true })
    .fill("Can you help me?");
  await expect(languageNotes).toHaveCount(0);
  await page.getByText("Lesson setup and goals", { exact: true }).click();
  await expect(titleField).toHaveValue("AI Garden Lesson");
  await expect(
    page.getByRole("region", { name: "Scene preview: Scene 1" }),
  ).toBeVisible();
  await expect(page.locator("#lesson-script-editor")).toHaveCount(0);
  await titleField.fill("My Visual Garden Lesson");

  const saveRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/lessons/my",
  );
  await page.getByRole("button", { exact: true, name: "Save lesson" }).click();
  const saveRequest = await saveRequestPromise;
  const payload = saveRequest.postDataJSON() as {
    lesson: typeof generatedLesson;
    source: string;
  };

  expect(payload.source).toBe("generated");
  expect(payload.lesson.title).toBe("My Visual Garden Lesson");
  await expect(page).toHaveURL(
    "/guardian/lessons?learnerProfileId=e2e-learner",
  );
});

test("lesson editor leads with a visual storyboard and progressively reveals fields", async ({
  page,
}) => {
  await page.route(/\/api\/lessons\/my\/visual-first-test(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        lesson: {
          id: "visual-first-test",
          lesson: createLessonScript(),
          revision: lessonRevision,
          source: "generated",
        },
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto(guardianPath("/lessons/my/visual-first-test/edit"));

  const storyboard = page.getByRole("navigation", {
    name: "Lesson storyboard",
  });
  const firstScene = storyboard.getByRole("button", {
    name: "Edit Scene 1: Scene 1",
  });
  const secondScene = storyboard.getByRole("button", {
    name: "Edit Scene 2: Scene 2",
  });
  await expect(firstScene).toHaveAttribute("aria-pressed", "true");
  await expect(secondScene).toHaveAttribute("aria-pressed", "false");

  let preview = page.getByRole("region", {
    name: "Scene preview: Scene 1",
  });
  await expect(
    preview.getByRole("img", {
      name: "A sunny garden with flowers and a tall tree",
    }),
  ).toBeVisible();
  await expect(
    preview.getByRole("img", { name: "Peppa listening" }),
  ).toBeVisible();
  await expect(
    preview.getByRole("img", { name: "Dolly talking" }),
  ).toBeVisible();
  await expect(preview.getByLabel("Dolly dialogue preview")).toContainText(
    "Can you help me?",
  );

  const timeline = preview.getByRole("group", { name: "Dialogue timeline" });
  const firstLine = timeline.getByRole("button", {
    name: "Preview dialogue 1: Dolly",
  });
  const learnerLine = timeline.getByRole("button", {
    name: "Preview dialogue 2: Learner",
  });
  await expect(firstLine).toHaveAttribute("aria-pressed", "true");
  await learnerLine.click();
  await expect(learnerLine).toHaveAttribute("aria-pressed", "true");
  await expect(preview.getByLabel("Learner dialogue preview")).toContainText(
    "Can you help me?",
  );

  const selectedDialogue = page.getByRole("group", { name: "Dialogue 2" });
  const speakerChoices = selectedDialogue.getByRole("group", {
    name: "Who says this line?",
  });
  await expect(
    speakerChoices.getByRole("radio", { name: "Learner" }),
  ).toBeChecked();

  const backgroundChoices = page.getByRole("group", {
    name: "Choose a background",
  });
  await expect(
    backgroundChoices.getByRole("img", {
      name: "A sunny meadow during the day",
    }),
  ).toBeVisible();
  const meadowBackground = backgroundChoices.getByRole("radio", {
    name: "Use background: A sunny meadow during the day",
  });
  await meadowBackground.focus();
  await meadowBackground.press("Space");
  await expect(meadowBackground).toBeChecked();
  await expect(
    preview.getByRole("img", { name: "A sunny meadow during the day" }),
  ).toBeVisible();

  const characterChoices = page.getByRole("group", {
    name: "Characters on screen",
  });
  await expect(
    characterChoices.getByRole("checkbox", { name: "Peppa" }),
  ).toBeChecked();
  await expect(
    characterChoices.getByRole("img", { name: "Peppa waiting" }),
  ).toBeVisible();
  await expect(
    characterChoices.getByRole("img", { name: "Dolly waiting" }),
  ).toBeVisible();

  const lessonTitle = page.getByLabel("Lesson title");
  const sceneTitle = page.getByLabel("Scene title");
  await expect(lessonTitle).toBeHidden();
  await expect(sceneTitle).toBeHidden();
  await page.getByText("Lesson setup and goals", { exact: true }).click();
  await page.getByText("Scene title and notes", { exact: true }).click();
  await expect(lessonTitle).toBeVisible();
  await expect(sceneTitle).toBeVisible();

  await secondScene.click();
  await expect(secondScene).toHaveAttribute("aria-pressed", "true");
  preview = page.getByRole("region", { name: "Scene preview: Scene 2" });
  await expect(preview).toBeVisible();
});

test("lesson creator tabs expose selection and support arrow keys", async ({
  page,
}) => {
  await page.goto(guardianPath("/lessons/my/create"));

  const makeWithAi = page.getByRole("tab", { name: "Make with AI" });
  const importJson = page.getByRole("tab", { name: "Import JSON" });

  await expect(makeWithAi).toHaveAttribute("aria-selected", "true");
  await expect(makeWithAi).toHaveAttribute(
    "aria-controls",
    "lesson-creator-panel",
  );
  await expect(makeWithAi).toHaveAttribute("tabindex", "0");
  await expect(importJson).toHaveAttribute("aria-selected", "false");
  await expect(importJson).toHaveAttribute(
    "aria-controls",
    "lesson-creator-panel",
  );
  await expect(importJson).toHaveAttribute("tabindex", "-1");
  await expect(page.locator("#lesson-creator-panel")).toHaveCount(1);

  await makeWithAi.focus();
  await page.keyboard.press("ArrowRight");

  await expect(importJson).toBeFocused();
  await expect(importJson).toHaveAttribute("aria-selected", "true");
  await expect(importJson).toHaveAttribute("tabindex", "0");
  await expect(makeWithAi).toHaveAttribute("aria-selected", "false");
  await expect(makeWithAi).toHaveAttribute("tabindex", "-1");
  await expect(page.locator("#lesson-creator-panel")).toHaveCount(1);
  await expect(page.getByRole("tabpanel")).toHaveAccessibleName("Import JSON");
});

test("lesson editor scrolls to its GUI save control on a short phone", async ({
  page,
}) => {
  await page.route(/\/api\/lessons\/my\/scroll-test(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        lesson: {
          id: "scroll-test",
          lesson: createLessonScript(),
          revision: lessonRevision,
          source: "generated",
        },
      }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.setViewportSize(shortPhone);
  await page.goto(guardianPath("/lessons/my/scroll-test/edit"));

  await expect(
    page.getByRole("heading", { name: "Edit Lesson" }),
  ).toBeVisible();
  await page.getByText("Lesson setup and goals", { exact: true }).click();
  await expect(page.getByLabel("Lesson title")).toHaveValue("Garden Help");
  await expect(page.getByLabel("Learner's name")).toHaveValue("Mia");
  await expect(page.getByLabel("Short summary")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Scenes" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Lesson storyboard" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Scene preview: Scene 1" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add scene" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add dialogue" }),
  ).toBeVisible();
  await expect(page.locator("#lesson-script-editor")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review script" })).toHaveCount(
    0,
  );
  await expectMainHasNoHorizontalOverflow(page);

  const saveButton = page.getByRole("button", {
    exact: true,
    name: "Save changes",
  });
  await expect(saveButton).toBeEnabled();
  await expectMainScrollsTo(page, saveButton);
});

test("lesson editor saves GUI changes to nested lesson data", async ({
  page,
}) => {
  const originalLesson = createLessonScript();
  let savedLesson = originalLesson;

  await page.route(/\/api\/lessons\/my\/gui-edit-test(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as {
        lesson: typeof originalLesson;
      };
      savedLesson = body.lesson;
      await route.fulfill({
        body: JSON.stringify({
          lesson: {
            id: "gui-edit-test",
            lesson: savedLesson,
            revision: lessonRevision,
            source: "generated",
          },
          warnings: [],
        }),
        contentType: "application/json",
        status: 200,
      });
      return;
    }

    await route.fulfill({
      body: JSON.stringify({
        lesson: {
          id: "gui-edit-test",
          lesson: savedLesson,
          revision: lessonRevision,
          source: "generated",
        },
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto(guardianPath("/lessons/my/gui-edit-test/edit"));

  await page.getByText("Lesson setup and goals", { exact: true }).click();
  await page.getByLabel("Lesson title").fill("GUI Garden Adventure");
  await page.getByLabel("Learner's name").fill("Noah");
  await page
    .getByLabel("Short summary")
    .fill("Noah and Dolly practise asking for garden help.");

  await page.getByText("Scene title and notes", { exact: true }).click();
  await page.getByLabel("Scene title").fill("A New Garden Scene");
  const firstDialogue = page.getByRole("group", { name: "Dialogue 1" });
  await firstDialogue
    .getByRole("textbox", { name: "Dialogue", exact: true })
    .fill("Could you help me water the flowers?");

  await page.getByRole("button", { name: "Add dialogue" }).click();
  const addedDialogue = page.getByRole("group", { name: "Dialogue 3" });
  await expect(addedDialogue).toBeVisible();
  await addedDialogue
    .getByRole("textbox", { name: "Dialogue", exact: true })
    .fill("The flowers have all the water they need.");

  const saveRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "PUT" &&
      new URL(request.url()).pathname === "/api/lessons/my/gui-edit-test",
  );
  await page.getByRole("button", { exact: true, name: "Save changes" }).click();
  const saveRequest = await saveRequestPromise;
  const payload = saveRequest.postDataJSON() as {
    lesson: typeof originalLesson;
  };

  expect(payload.lesson.title).toBe("GUI Garden Adventure");
  expect(payload.lesson.childName).toBe("Noah");
  expect(payload.lesson.summary).toBe(
    "Noah and Dolly practise asking for garden help.",
  );
  expect(payload.lesson.scenes[0].title).toBe("A New Garden Scene");
  expect(payload.lesson.scenes[0].steps[0].dialogue).toBe(
    "Could you help me water the flowers?",
  );
  expect(payload.lesson.scenes[0].steps.at(-1)).toMatchObject({
    dialogue: "The flowers have all the water they need.",
    speaker: "peppa",
  });
  await expect(page).toHaveURL(
    "/guardian/lessons?learnerProfileId=e2e-learner",
  );
});
