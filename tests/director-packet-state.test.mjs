import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AI_LESSON } from "../lib/ai-lesson-data.js";
import { getMockDirectorPacket } from "../lib/mock-lesson-director.js";
import {
  DirectorPacketPhase,
  createInitialDirectorPacketState,
  reduceDirectorPacketState,
} from "../lib/director-packet-state.js";

const packet = getMockDirectorPacket(AI_LESSON, {
  currentSceneId: "greeting",
  phase: "start_scene",
  attemptNumber: 0,
  successfulRepeats: 0,
  previousTurnSummary: [],
  lastChildResult: null,
});

function advancePacketToListening(state, loadedPacket) {
  let nextState = reduceDirectorPacketState(state, {
    type: "PACKET_LOADED",
    packet: loadedPacket,
  });
  for (let index = 0; index < loadedPacket.turns.length; index += 1) {
    nextState = reduceDirectorPacketState(nextState, { type: "TURN_DONE" });
  }
  return nextState;
}

function evaluatePassedGreeting(state) {
  const recordingDone = reduceDirectorPacketState(state, { type: "RECORDING_DONE" });
  return reduceDirectorPacketState(recordingDone, {
    type: "EVALUATED",
    result: {
      transcript: "hello peppa",
      similarity: 0.92,
      passed: true,
    },
  });
}

describe("director packet state", () => {
  it("starts idle on the first scene", () => {
    const state = createInitialDirectorPacketState("greeting");

    assert.equal(state.phase, DirectorPacketPhase.Idle);
    assert.equal(state.currentSceneId, "greeting");
    assert.equal(state.activeTurnIndex, -1);
  });

  it("loads a packet and starts the first turn", () => {
    const state = reduceDirectorPacketState(
      createInitialDirectorPacketState("greeting"),
      { type: "PACKET_LOADED", packet }
    );

    assert.equal(state.phase, DirectorPacketPhase.PlayingTurn);
    assert.equal(state.activeTurnIndex, 0);
    assert.equal(state.packet.packetId, packet.packetId);
  });

  it("advances through turns and enters listening after the packet prompt", () => {
    let state = reduceDirectorPacketState(createInitialDirectorPacketState("greeting"), {
      type: "PACKET_LOADED",
      packet,
    });

    for (let index = 0; index < packet.turns.length; index += 1) {
      state = reduceDirectorPacketState(state, { type: "TURN_DONE" });
    }

    assert.equal(state.phase, DirectorPacketPhase.Listening);
    assert.equal(state.activeTurnIndex, packet.turns.length - 1);
    assert.equal(state.activePrompt.targetText, "Hello, Peppa!");
  });

  it("tracks evaluation result for the next director request", () => {
    const state = reduceDirectorPacketState(
      { ...createInitialDirectorPacketState("greeting"), phase: DirectorPacketPhase.Evaluating },
      {
        type: "EVALUATED",
        result: {
          transcript: "hello peppa",
          similarity: 0.92,
          passed: true,
          feedbackText: "Great.",
          retryAllowed: true,
        },
      }
    );

    assert.equal(state.phase, DirectorPacketPhase.NeedsPacket);
    assert.equal(state.runtimeState.phase, "after_child_answer");
    assert.equal(state.runtimeState.lastChildResult.passed, true);
    assert.equal(state.runtimeState.lastChildResult.reason, "matched_target");
    assert.equal(state.runtimeState.successfulRepeats, 0);
  });

  it("requests the required success repeat after the first passing answer", () => {
    const listening = advancePacketToListening(
      createInitialDirectorPacketState("greeting"),
      packet
    );

    const evaluated = evaluatePassedGreeting(listening);
    const nextPacket = getMockDirectorPacket(AI_LESSON, evaluated.runtimeState);

    assert.equal(listening.phase, DirectorPacketPhase.Listening);
    assert.equal(evaluated.runtimeState.successfulRepeats, 0);
    assert.equal(nextPacket.lessonControl.reason, "success_repeat_required");
    assert.equal(nextPacket.childPrompt.shouldListen, true);
  });

  it("advances after the success repeat prompt is answered successfully", () => {
    const firstListening = advancePacketToListening(
      createInitialDirectorPacketState("greeting"),
      packet
    );
    const firstEvaluated = evaluatePassedGreeting(firstListening);
    const repeatPacket = getMockDirectorPacket(AI_LESSON, firstEvaluated.runtimeState);
    const repeatListening = advancePacketToListening(firstEvaluated, repeatPacket);

    const repeatEvaluated = evaluatePassedGreeting(repeatListening);
    const nextPacket = getMockDirectorPacket(AI_LESSON, repeatEvaluated.runtimeState);

    assert.equal(repeatPacket.lessonControl.reason, "success_repeat_required");
    assert.equal(repeatListening.phase, DirectorPacketPhase.Listening);
    assert.equal(repeatEvaluated.runtimeState.successfulRepeats, 1);
    assert.equal(nextPacket.lessonControl.status, "advance_scene");
    assert.equal(nextPacket.lessonControl.nextSceneId, "cant-reach");
    assert.equal(nextPacket.childPrompt.shouldListen, false);
  });

  it("marks blank child transcripts as no speech", () => {
    const state = reduceDirectorPacketState(
      {
        ...createInitialDirectorPacketState("greeting"),
        phase: DirectorPacketPhase.Evaluating,
        activePrompt: { targetText: "Hello, Peppa!" },
      },
      {
        type: "EVALUATED",
        result: {
          transcript: "   ",
          similarity: 0,
          passed: false,
          feedbackText: "Try again.",
          retryAllowed: true,
        },
      }
    );

    assert.equal(state.runtimeState.lastChildResult.reason, "no_speech");
  });

  it("preserves an evaluation result reason when provided", () => {
    const state = reduceDirectorPacketState(
      { ...createInitialDirectorPacketState("greeting"), phase: DirectorPacketPhase.Evaluating },
      {
        type: "EVALUATED",
        result: {
          transcript: "hello",
          similarity: 0.1,
          passed: false,
          reason: "no_speech",
          feedbackText: "Try again.",
          retryAllowed: true,
        },
      }
    );

    assert.equal(state.runtimeState.lastChildResult.reason, "no_speech");
  });

  it("prepares a new scene request after an advance packet finishes", () => {
    const advancePacket = getMockDirectorPacket(AI_LESSON, {
      currentSceneId: "greeting",
      phase: "after_child_answer",
      attemptNumber: 2,
      successfulRepeats: 1,
      previousTurnSummary: [],
      lastChildResult: {
        targetText: "Hello, Peppa!",
        transcript: "hello peppa",
        passed: true,
        similarity: 0.92,
        reason: "matched_target",
      },
    });
    const loaded = reduceDirectorPacketState(createInitialDirectorPacketState("greeting"), {
      type: "PACKET_LOADED",
      packet: advancePacket,
    });

    const state = reduceDirectorPacketState(
      {
        ...loaded,
        attemptNumber: 2,
        successfulRepeats: 1,
        runtimeState: {
          currentSceneId: "greeting",
          phase: "after_child_answer",
          attemptNumber: 2,
          successfulRepeats: 1,
          previousTurnSummary: [],
          lastChildResult: {
            targetText: "Hello, Peppa!",
            transcript: "hello peppa",
            passed: true,
            similarity: 0.92,
            reason: "matched_target",
          },
        },
      },
      { type: "TURN_DONE" }
    );

    assert.equal(state.phase, DirectorPacketPhase.NeedsPacket);
    assert.equal(state.currentSceneId, "cant-reach");
    assert.equal(state.attemptNumber, 0);
    assert.equal(state.successfulRepeats, 0);
    assert.equal(state.runtimeState.currentSceneId, "cant-reach");
    assert.equal(state.runtimeState.phase, "start_scene");
    assert.equal(state.runtimeState.attemptNumber, 0);
    assert.equal(state.runtimeState.successfulRepeats, 0);
    assert.equal(state.runtimeState.lastChildResult, null);
  });

  it("prepares a new scene request when a zero-turn advance packet loads", () => {
    const zeroTurnAdvancePacket = {
      ...packet,
      packetId: "greeting-zero-turn-advance",
      turns: [],
      childPrompt: {
        shouldListen: false,
        targetText: "",
        displayText: "",
        recordingSeconds: 0,
      },
      lessonControl: {
        status: "advance_scene",
        nextSceneId: "cant-reach",
        reason: "target_completed",
      },
    };

    const state = reduceDirectorPacketState(
      {
        ...createInitialDirectorPacketState("greeting"),
        attemptNumber: 2,
        successfulRepeats: 1,
      },
      { type: "PACKET_LOADED", packet: zeroTurnAdvancePacket }
    );

    assert.equal(state.phase, DirectorPacketPhase.NeedsPacket);
    assert.equal(state.currentSceneId, "cant-reach");
    assert.equal(state.activeTurnIndex, -1);
    assert.equal(state.attemptNumber, 0);
    assert.equal(state.successfulRepeats, 0);
    assert.equal(state.runtimeState.currentSceneId, "cant-reach");
    assert.equal(state.runtimeState.phase, "start_scene");
    assert.equal(state.runtimeState.attemptNumber, 0);
    assert.equal(state.runtimeState.successfulRepeats, 0);
    assert.equal(state.runtimeState.lastChildResult, null);
  });

  it("handles simple phase events", () => {
    const idle = createInitialDirectorPacketState("greeting");
    const loading = reduceDirectorPacketState(idle, { type: "START" });
    const evaluating = reduceDirectorPacketState(loading, { type: "RECORDING_DONE" });
    const error = reduceDirectorPacketState(evaluating, { type: "PACKET_FAILED" });

    assert.equal(loading.phase, DirectorPacketPhase.LoadingPacket);
    assert.equal(evaluating.phase, DirectorPacketPhase.Evaluating);
    assert.equal(error.phase, DirectorPacketPhase.Error);
  });

  it("retries from error without resetting the current scene context", () => {
    const state = reduceDirectorPacketState(
      {
        ...createInitialDirectorPacketState("cant-reach"),
        phase: DirectorPacketPhase.Error,
        runtimeState: {
          currentSceneId: "cant-reach",
          phase: "start_scene",
          attemptNumber: 0,
          successfulRepeats: 0,
          previousTurnSummary: [],
          lastChildResult: null,
        },
      },
      { type: "START" }
    );

    assert.equal(state.phase, DirectorPacketPhase.LoadingPacket);
    assert.equal(state.currentSceneId, "cant-reach");
    assert.equal(state.runtimeState.currentSceneId, "cant-reach");
  });

  it("returns the same state for unknown events", () => {
    const state = createInitialDirectorPacketState("greeting");

    assert.equal(reduceDirectorPacketState(state, { type: "UNKNOWN" }), state);
  });
});
