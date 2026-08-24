import { expect, type Page } from "@playwright/test";

const incompleteProfile = {
  canBypass: false,
  experienceMode: "realtime",
  mode: "full",
  profile: {
    age: null,
    answers: {
      legacyAnswers: null,
      questionnaireVersion: 2,
      responses: {},
      schemaVersion: 2,
    },
    completedAt: null,
    currentQuestionKey: "name",
    name: null,
    profileStatus: "not_started",
    questionnaireVersion: 2,
  },
  progress: { answered: 0, current: 1, total: 6 },
  question: {
    answerKey: "name",
    audio: null,
    maxLength: 120,
    position: 1,
    promptEn: "What is your name?",
    promptZh: "你叫什么名字？",
    required: true,
  },
  questionnaire: { version: 2 },
};

export async function useIncompleteProfile(page: Page) {
  await page.route("**/api/learner-profile", async (route) => {
    await route.fulfill({ json: incompleteProfile, status: 200 });
  });
}

export async function startSmallChat(
  page: Page,
  promptStyle?: "tiny-turns" | "gentle-guide" | "playful-pal",
) {
  const start = page.getByRole("button", { name: "Start chat" });
  await expect(start).toBeVisible();
  if (promptStyle) {
    await page
      .getByLabel(/^Grown-up chat style:/)
      .click();
    await page
      .getByRole("combobox", { name: "Chat style" })
      .selectOption(promptStyle);
  }
  await start.click();
}
