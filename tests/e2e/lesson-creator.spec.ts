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

test("lesson creator scrolls to its review controls on a short phone", async ({
  page,
}) => {
  await page.setViewportSize(shortPhone);
  await page.goto(guardianPath("/lessons/my/create"));

  await expect(
    page.getByRole("heading", { name: "Create a custom lesson" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Grown-up tools: start with AI or import a lesson, then shape every detail in the visual editor.",
      { exact: true },
    ),
  ).toHaveCount(0);

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
