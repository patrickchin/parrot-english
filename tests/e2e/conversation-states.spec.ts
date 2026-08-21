import { expect, test, type Page } from "@playwright/test";
import { startSmallChat } from "./conversation-helpers";

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

async function useIncompleteProfile(page: Page) {
  await page.route("**/api/learner-profile", async (route) => {
    await route.fulfill({ json: incompleteProfile, status: 200 });
  });
}

test("each purpose has its own framing and only profile flows offer save completion", async ({
  page,
}) => {
  await page.setViewportSize({ height: 568, width: 280 });
  await page.goto("/talk-to-peppa");
  await expect(
    page.getByRole("heading", { name: "Chat with Peppa" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Save and finish|Save changes/ }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Chat style")).toBeHidden();
  await page.getByText("Grown-up: chat style", { exact: true }).click();
  await expect(page.getByLabel("Chat style")).toHaveValue("tiny-turns");

  await useIncompleteProfile(page);
  await page.goto("/profile/setup");
  await expect(
    page.getByRole("heading", { name: "Help Peppa know you" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save and finish" }),
  ).toBeVisible();

  await page.unroute("**/api/learner-profile");
  await page.goto("/profile/setup?redo=1");
  await expect(
    page.getByRole("heading", { name: "Update my profile" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeVisible();
});

test("the cold-start state gives an honest wait without showing turn controls", async ({
  page,
}) => {
  await page.goto("/talk-to-peppa?parrotE2eConversation=connecting");
  await startSmallChat(page);

  await expect(page.getByRole("status")).toContainText(
    "Waking up Peppa",
  );
  await expect(
    page.getByRole("region", { name: "Conversation captions" }),
  ).toContainText("Peppa is waking up");
  await expect(
    page.getByRole("button", { name: /Tap, then talk|I’m done/ }),
  ).toHaveCount(0);
});

test("opening audio keeps the learner waiting until Peppa finishes", async ({
  page,
}) => {
  await page.goto("/talk-to-peppa?parrotE2eConversation=opening-speaking");
  await startSmallChat(page);

  await expect(page.getByRole("status")).toContainText("Peppa’s turn");
  await expect(
    page.getByRole("button", { name: "Listen to Peppa" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Tap, then talk" }),
  ).toHaveCount(0);
});

test("reconnecting and error states keep recovery language in the same stage", async ({
  page,
}) => {
  await page.goto("/talk-to-peppa?parrotE2eConversation=reconnecting");
  await startSmallChat(page);
  await expect(page.getByRole("status")).toContainText("Connecting again");
  await expect(
    page.getByRole("region", { name: "Conversation captions" }),
  ).toContainText("Your words are safe");

  await page.goto("/talk-to-peppa?parrotE2eConversation=error");
  await startSmallChat(page);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Tap, then talk|I’m done/ }),
  ).toHaveCount(0);
});

test("profile completion uses the stable saving stage", async ({ page }) => {
  await useIncompleteProfile(page);
  await page.goto("/profile/setup?parrotE2eConversation=saving");

  await expect(page.getByRole("status")).toContainText("Saving your answers");
  await expect(
    page.getByRole("region", { name: "Conversation captions" }),
  ).toContainText("Saving your answers");
  await expect(
    page.getByRole("button", { name: /Tap, then talk|I’m done/ }),
  ).toHaveCount(0);
});
