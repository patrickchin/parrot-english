import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initializeLogger, llm } from "@livekit/agents";
import { createLearnerProfileConversationState } from "../lib/conversation-scenario.js";
import {
  AGENT_ROOM_LIFECYCLE_OPTIONS,
  CONVERSATION_END_REASONS,
  CONVERSATION_SYSTEM_PROMPTS,
  conversationEndStatus,
  createPeppaConversationTask,
  getConversationSystemPrompt,
  playConversationGoodbyeAndClose,
} from "../agent/peppa-conversation.ts";

initializeLogger({ level: "silent", pretty: false });

function taskOptions(purpose, promptStyle) {
  return {
    initialState: createLearnerProfileConversationState(),
    ...(promptStyle ? { promptStyle } : {}),
    purpose,
  };
}

describe("Peppa conversation ending", () => {
  it("ends the LiveKit room when the conversation task closes", () => {
    assert.deepEqual(AGENT_ROOM_LIFECYCLE_OPTIONS, {
      closeOnDisconnect: true,
      deleteRoomOnClose: true,
    });
  });

  it("gives every conversation mode one bounded endConversation tool", () => {
    const tasks = [
      ["onboarding", createPeppaConversationTask(taskOptions("onboarding"))],
      [
        "small-chat",
        createPeppaConversationTask(taskOptions("small-chat", "tiny-turns")),
      ],
    ];
    for (const [, task] of tasks) {
      assert.deepEqual(Object.keys(task.toolCtx.functionTools), ["endConversation"]);
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

  it("completes the active task when Peppa calls endConversation", async () => {
    const task = createPeppaConversationTask(
      taskOptions("small-chat", "tiny-turns"),
    );
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
    for (const prompt of [
      ...Object.values(CONVERSATION_SYSTEM_PROMPTS),
      getConversationSystemPrompt("small-chat", "tiny-turns"),
    ]) {
      assert.match(prompt, /endConversation/);
      assert.match(prompt, /child.*(?:stop|goodbye)/is);
      assert.match(prompt, /conversation_complete/);
      assert.doesNotMatch(prompt, /markObjectiveUnanswered|requestGentleRephrase/);
      assert.doesNotMatch(prompt, /updateLearnerProfile/);
    }
  });
});
