import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initializeLogger, llm } from "@livekit/agents";
import {
  CONVERSATION_END_REASONS,
  CONVERSATION_SYSTEM_PROMPTS,
  conversationEndStatus,
  createGettingToKnowYouTask,
  createSmallChatTask,
  playConversationGoodbyeAndClose,
} from "../agent/peppa-conversation.ts";

initializeLogger({ level: "silent", pretty: false });

describe("Peppa conversation ending", () => {
  it("gives every conversation mode one bounded endConversation tool", () => {
    const tasks = [
      ["onboarding", createGettingToKnowYouTask()],
      [
        "profile-edit",
        createGettingToKnowYouTask({
          conversationId: "conversation-1",
          ingest: {
            async appendTurn() {},
            async endConversation() {},
            async updateState() {},
          },
          purpose: "profile-edit",
        }),
      ],
      ["small-chat", createSmallChatTask()],
    ];
    for (const [purpose, task] of tasks) {
      assert.deepEqual(Object.keys(task.toolCtx.functionTools), [
        ...(purpose === "profile-edit" ? ["updateLearnerProfile"] : []),
        "endConversation",
      ]);
      const schema = llm.toJsonSchema(
        task.toolCtx.functionTools.endConversation.parameters,
        true,
        true,
      );
      assert.deepEqual(schema.properties.reason.enum, [
        ...CONVERSATION_END_REASONS,
      ]);
    }
  });

  it("does not expose profile writing outside profile editing", () => {
    for (const task of [
      createGettingToKnowYouTask(),
      createSmallChatTask(),
    ]) {
      assert.equal(
        Object.hasOwn(task.toolCtx.functionTools, "updateLearnerProfile"),
        false,
      );
    }
  });

  it("completes the active task when Peppa calls endConversation", async () => {
    const task = createSmallChatTask();
    let completed;
    let opening;

    await task.hookAdapter.hooks.onEnter({
      complete(result) {
        completed = result;
      },
      session: {
        generateReply(options) {
          opening = options;
        },
      },
    });
    const result = await task.toolCtx.functionTools.endConversation.execute(
      { reason: "child_requested" },
      {},
    );

    assert.deepEqual(opening, { allowInterruptions: false });
    assert.deepEqual(completed, { finishReason: "child_requested" });
    assert.deepEqual(result, { ending: true });
  });

  it("maps child requests to stopped and natural endings to completed", () => {
    assert.equal(conversationEndStatus("child_requested"), "stopped");
    assert.equal(conversationEndStatus("conversation_complete"), "completed");
  });

  it("persists the ending after the goodbye and before closing the room", async () => {
    const calls = [];
    const session = {
      async close() {
        calls.push("close");
      },
      generateReply() {
        calls.push("goodbye");
        return {
          async waitForPlayout() {
            calls.push("goodbye-played");
          },
        };
      },
    };

    await playConversationGoodbyeAndClose(session, async () => {
      calls.push("persist-ending");
    });

    assert.deepEqual(calls, [
      "goodbye",
      "goodbye-played",
      "persist-ending",
      "close",
    ]);
  });

  it("tells Peppa exactly when the ending tool is appropriate", () => {
    for (const prompt of Object.values(CONVERSATION_SYSTEM_PROMPTS)) {
      assert.match(prompt, /endConversation/);
      assert.match(prompt, /child.*(?:stop|goodbye)/is);
      assert.match(prompt, /conversation_complete/);
      assert.doesNotMatch(prompt, /markObjectiveUnanswered|requestGentleRephrase/);
    }
    assert.match(
      CONVERSATION_SYSTEM_PROMPTS["profile-edit"],
      /updateLearnerProfile/,
    );
    assert.doesNotMatch(
      CONVERSATION_SYSTEM_PROMPTS.onboarding,
      /updateLearnerProfile/,
    );
    assert.doesNotMatch(
      CONVERSATION_SYSTEM_PROMPTS["small-chat"],
      /updateLearnerProfile/,
    );
  });
});
