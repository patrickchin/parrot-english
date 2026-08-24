import { expect, test, type Page } from "@playwright/test";
import {
  startSmallChat,
  useIncompleteProfile,
} from "./conversation-helpers";

async function expectAnimationCount(
  page: Page,
  count: number,
  locator = page.getByRole("main"),
) {
  await expect
    .poll(() =>
      locator.evaluate(
        (element) =>
          element
            .getAnimations({ subtree: true })
            .filter((animation) => animation.playState === "running").length,
      ),
    )
    .toBe(count);
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
  const chatStyle = page.getByRole("combobox", { name: "Chat style" });
  await expect(chatStyle).toBeHidden();
  await page.getByLabel(/^Grown-up chat style:/).click();
  await expect(chatStyle).toHaveValue("tiny-turns");

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

test("the start tap immediately gives a literal wait without showing turn controls", async ({
  page,
}) => {
  await page.goto("/talk-to-peppa?parrotE2eConversation=connecting");
  await startSmallChat(page);

  await expect(
    page.getByRole("main").getByRole("status"),
  ).toContainText("Getting ready");
  const captions = page.getByRole("region", {
    name: "Conversation captions",
  });
  await expect(captions).toContainText("Starting the voice chat");
  await expect(captions).not.toContainText("Getting ready");
  await expect(page.getByText("Getting ready", { exact: true })).toHaveCount(1);
  await expect(
    page.getByRole("group", { name: "Conversation controls" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Tap, then talk|I’m done/ }),
  ).toHaveCount(0);
  await expectAnimationCount(
    page,
    0,
    page.getByRole("img", { exact: true, name: "Peppa" }),
  );
  await expectAnimationCount(page, 1);
});

test("opening audio keeps the learner waiting until Peppa finishes", async ({
  page,
}) => {
  await page.goto("/talk-to-peppa?parrotE2eConversation=opening-speaking");
  await startSmallChat(page);

  await expect(
    page.getByRole("main").getByRole("status"),
  ).toContainText("Peppa’s turn");
  await expect(
    page.getByRole("button", { name: "Listen to Peppa" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Conversation captions" }),
  ).toContainText("Hello again!");
  await expect(
    page.getByRole("button", { name: "Tap, then talk" }),
  ).toHaveCount(0);
});

test("reconnecting and error states keep recovery language in the same stage", async ({
  page,
}) => {
  await page.goto("/talk-to-peppa?parrotE2eConversation=reconnecting");
  await startSmallChat(page);
  await expect(
    page.getByRole("main").getByRole("status"),
  ).toContainText("Trying again");
  const reconnectingCaptions = page.getByRole("region", {
    name: "Conversation captions",
  });
  await expect(reconnectingCaptions).toContainText("The chat stopped");
  await expect(reconnectingCaptions).not.toContainText("Trying again");
  await expect(
    page.getByRole("button", { name: "Trying again" }),
  ).toHaveCount(0);
  await expectAnimationCount(
    page,
    0,
    page.getByRole("img", { exact: true, name: "Peppa" }),
  );
  await expectAnimationCount(page, 1);

  await page.goto("/talk-to-peppa?parrotE2eConversation=error");
  await startSmallChat(page);
  await expect(page.getByRole("alert")).toHaveText(
    "Peppa cannot talk now. Tap Try again.",
  );
  await expect(page.getByText(/voice room/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Tap, then talk|I’m done/ }),
  ).toHaveCount(0);
});

test("a technical start response becomes one literal child recovery step", async ({
  page,
}) => {
  await page.setViewportSize({ height: 568, width: 280 });
  await page.route("**/api/conversations", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      json: {
        error: "conversation_unavailable",
        message: "LIVEKIT_URL is not configured.",
      },
      status: 503,
    });
  });
  await page.goto("/talk-to-peppa");
  await startSmallChat(page);

  const alert = page.getByRole("alert");
  await expect(alert).toHaveText("Peppa cannot talk now. Tap Try again.");
  await expect(page.getByText(/LIVEKIT_URL|conversation request/i)).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("a technical finish response names the control that retries the save", async ({
  page,
}) => {
  await page.route("**/api/conversations/e2e-conversation/finish", async (route) => {
    await route.fulfill({
      json: {
        error: "conversation_unavailable",
        message: "D1 transaction failed while ending session.",
      },
      status: 503,
    });
  });
  await page.goto("/talk-to-peppa");
  await startSmallChat(page);
  await page.getByRole("button", { name: "Finish chat" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "The chat did not finish. Tap Finish chat again.",
  );
  await expect(page.getByText(/D1 transaction|conversation request/i)).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Finish chat again", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toHaveCount(0);
});

test("profile completion uses the stable saving stage", async ({ page }) => {
  await useIncompleteProfile(page);
  await page.goto("/profile/setup?parrotE2eConversation=saving");

  await expect(
    page.getByRole("main").getByRole("status"),
  ).toContainText("Saving your answers");
  const captions = page.getByRole("region", {
    name: "Conversation captions",
  });
  await expect(captions).toContainText("Lovely chat!");
  await expect(captions).not.toContainText("Saving your answers");
  await expectAnimationCount(
    page,
    0,
    page.getByRole("img", { exact: true, name: "Peppa" }),
  );
  await expectAnimationCount(page, 1);
  await expect(
    page.getByRole("button", { name: /Tap, then talk|I’m done/ }),
  ).toHaveCount(0);
});
