import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initializeLogger, llm } from "@livekit/agents";
import { createLearnerProfileConversationState } from "../lib/conversation-scenario.js";
import {
  CONVERSATION_SYSTEM_PROMPTS,
  createGettingToKnowYouTask,
  createPeppaConversationTask,
} from "../agent/peppa-conversation.ts";

initializeLogger({ level: "silent", pretty: false });

function ingest(overrides = {}) {
  return {
    async appendTurn() {},
    async endConversation() {},
    async updateState() {},
    ...overrides,
  };
}

describe("Peppa profile-edit tool", () => {
  it("persists the complete name, age, and About profile before acknowledging it", async () => {
    const stateUpdates = [];
    let completed;
    const task = createGettingToKnowYouTask({
      conversationId: "conversation-1",
      ingest: ingest({
        async updateState(...args) {
          stateUpdates.push(args);
        },
      }),
      purpose: "profile-edit",
      initialState: createLearnerProfileConversationState({
        profileAge: 30,
        profileName: "Mia",
        profileSummary: "Mia is thirty and loves fast red cars.",
      }),
    });

    await task.hookAdapter.hooks.onEnter({
      complete(result) {
        completed = result;
      },
      session: {
        generateReply() {},
      },
    });

    assert.deepEqual(Object.keys(task.toolCtx.functionTools), [
      "updateLearnerProfile",
      "endConversation",
    ]);
    const updateTool = task.toolCtx.functionTools.updateLearnerProfile;
    const schema = llm.toJsonSchema(updateTool.parameters, true, true);
    assert.deepEqual(Object.keys(schema.properties ?? {}).sort(), [
      "about",
      "age",
      "name",
    ]);

    assert.deepEqual(
      await updateTool.execute(
        {
          about: "Maya is nine and loves drawing dragons.",
          age: 9,
          name: "Maya",
        },
        {},
      ),
      { ending: true, saved: true },
    );
    assert.deepEqual(completed, { finishReason: "conversation_complete" });
    assert.equal(stateUpdates.length, 1);
    assert.equal(stateUpdates[0][0], "conversation-1");
    assert.equal(stateUpdates[0][1].profileName, "Maya");
    assert.equal(stateUpdates[0][1].profileAge, 9);
    assert.equal(
      stateUpdates[0][1].profileSummary,
      "Maya is nine and loves drawing dragons.",
    );
    assert.equal(stateUpdates[0][1].learnedName, true);
    assert.equal(stateUpdates[0][1].learnedAge, true);
    assert.match(
      CONVERSATION_SYSTEM_PROMPTS["profile-edit"],
      /updateLearnerProfile[\s\S]*name[\s\S]*age[\s\S]*about/i,
    );
  });

  it("keeps profile writing out of onboarding and ordinary chat", () => {
    assert.deepEqual(
      Object.keys(createGettingToKnowYouTask().toolCtx.functionTools),
      ["endConversation"],
    );
    assert.deepEqual(
      Object.keys(
        createPeppaConversationTask({
          conversationId: "conversation-1",
          ingest: ingest(),
          purpose: "small-chat",
        }).toolCtx.functionTools,
      ),
      ["endConversation"],
    );
    assert.throws(
      () => createGettingToKnowYouTask({ purpose: "profile-edit" }),
      /requires conversation persistence/i,
    );
  });

  it("does not report success before the profile write finishes", async () => {
    const calls = [];
    let completed;
    let releaseWrite;
    const pendingWrite = new Promise((resolve) => {
      releaseWrite = resolve;
    });
    const task = createGettingToKnowYouTask({
      conversationId: "conversation-1",
      ingest: ingest({
        async updateState() {
          calls.push("write-started");
          await pendingWrite;
          calls.push("write-finished");
        },
      }),
      purpose: "profile-edit",
      initialState: createLearnerProfileConversationState({
        profileAge: 8,
        profileName: "Mia",
        profileSummary: "Mia is eight and likes pandas.",
      }),
    });

    await task.hookAdapter.hooks.onEnter({
      complete(result) {
        completed = result;
        calls.push("conversation-completed");
      },
      session: {
        generateReply() {},
      },
    });

    const execution =
      task.toolCtx.functionTools.updateLearnerProfile.execute(
        {
          about: "Mia is nine and likes pandas.",
          age: 9,
          name: "Mia",
        },
        {},
      );
    const beforeWrite = await Promise.race([
      execution.then(() => "saved"),
      new Promise((resolve) => setTimeout(() => resolve("pending"), 20)),
    ]);

    assert.equal(beforeWrite, "pending");
    assert.equal(completed, undefined);
    releaseWrite();
    assert.deepEqual(await execution, { ending: true, saved: true });
    assert.deepEqual(completed, { finishReason: "conversation_complete" });
    assert.deepEqual(calls, [
      "write-started",
      "write-finished",
      "conversation-completed",
    ]);
  });
});
