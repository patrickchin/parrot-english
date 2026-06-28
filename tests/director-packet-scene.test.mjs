import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AI_LESSON } from "../lib/ai-lesson-data.js";
import { getMockDirectorPacket } from "../lib/mock-lesson-director.js";
import {
  DirectorPacketPhase,
  createInitialDirectorPacketState,
  reduceDirectorPacketState,
} from "../lib/director-packet-state.js";
import { getDirectorPacketScenePresentation } from "../lib/director-packet-scene.js";

const packet = getMockDirectorPacket(AI_LESSON, {
  currentSceneId: "greeting",
  phase: "start_scene",
  attemptNumber: 0,
  successfulRepeats: 0,
  previousTurnSummary: [],
  lastChildResult: null,
});

function createStateWithRetainedPromptTurn(phase) {
  return {
    ...createInitialDirectorPacketState("greeting"),
    phase,
    packet,
    activePrompt: packet.childPrompt,
    activeTurnIndex: packet.turns.length - 1,
  };
}

describe("director packet scene presentation", () => {
  it("shows the active packet turn in the correct character bubble", () => {
    const state = reduceDirectorPacketState(createInitialDirectorPacketState("greeting"), {
      type: "PACKET_LOADED",
      packet,
    });

    const scene = getDirectorPacketScenePresentation(AI_LESSON, state);

    assert.equal(scene.activeSpeaker, "peppa");
    assert.equal(scene.peppaBubble.text, "Hello, Bella!");
    assert.equal(scene.peppaBubble.isActive, true);
    assert.equal(scene.pollyBubble.isActive, false);
  });

  it("shows the child prompt while listening", () => {
    const state = createStateWithRetainedPromptTurn(DirectorPacketPhase.Listening);

    const scene = getDirectorPacketScenePresentation(AI_LESSON, state);

    assert.equal(scene.activeSpeaker, "child");
    assert.equal(scene.pollyBubble.text, "轮到你说：Hello, Peppa!");
    assert.equal(scene.statusText, "麦克风正在听，请开口说");
  });

  it("shows the finished reward scene with the stage-compatible bubble tone", () => {
    const state = createStateWithRetainedPromptTurn(DirectorPacketPhase.Finished);

    const scene = getDirectorPacketScenePresentation(AI_LESSON, state);

    assert.equal(scene.backgroundAsset.id, "reward_bg");
    assert.equal(scene.peppaAsset.id, "peppa_clap");
    assert.equal(scene.pollyAsset.id, "polly_laugh");
    assert.equal(scene.activeSpeaker, "polly");
    assert.equal(scene.pollyBubble.text, "太棒啦，今天练习完成。");
    assert.equal(scene.pollyBubble.tone, "finished");
  });

  it("does not keep the retained prompt turn active while evaluating", () => {
    const state = createStateWithRetainedPromptTurn(DirectorPacketPhase.Evaluating);

    const scene = getDirectorPacketScenePresentation(AI_LESSON, state);

    assert.notEqual(scene.activeSpeaker, "polly");
    assert.equal(scene.pollyBubble.isActive, false);
  });

  it("does not keep the retained prompt turn active while waiting for a packet", () => {
    const state = createStateWithRetainedPromptTurn(DirectorPacketPhase.NeedsPacket);

    const scene = getDirectorPacketScenePresentation(AI_LESSON, state);

    assert.notEqual(scene.activeSpeaker, "polly");
    assert.equal(scene.pollyBubble.isActive, false);
  });
});
