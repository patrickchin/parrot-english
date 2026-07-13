import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  selectConversationPurpose,
  updatesLearnerProfile,
} from "../lib/conversation-purpose.ts";

describe("Peppa conversation purposes", () => {
  it("maps each app entry point to its own agent contract", () => {
    assert.equal(
      selectConversationPurpose({
        isProfileEdit: false,
        isSmallChatRoute: false,
      }),
      "onboarding",
    );
    assert.equal(
      selectConversationPurpose({
        isProfileEdit: true,
        isSmallChatRoute: false,
      }),
      "profile-edit",
    );
    assert.equal(
      selectConversationPurpose({
        isProfileEdit: false,
        isSmallChatRoute: true,
      }),
      "small-chat",
    );
  });

  it("keeps ordinary small chat out of profile persistence", () => {
    assert.equal(updatesLearnerProfile("onboarding"), true);
    assert.equal(updatesLearnerProfile("profile-edit"), true);
    assert.equal(updatesLearnerProfile("small-chat"), false);
  });
});
