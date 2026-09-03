import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONVERSATION_PURPOSES } from "../lib/conversation-purpose.ts";

describe("Peppa conversation purposes", () => {
  it("defines only the current app entry points", () => {
    assert.deepEqual(CONVERSATION_PURPOSES, ["onboarding", "small-chat"]);
  });
});
