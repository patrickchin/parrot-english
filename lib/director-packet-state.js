// @ts-check

export const DirectorPacketPhase = {
  Idle: "idle",
  LoadingPacket: "loading-packet",
  PlayingTurn: "playing-turn",
  Listening: "listening",
  Evaluating: "evaluating",
  NeedsPacket: "needs-packet",
  Finished: "finished",
  Error: "error",
};

export function createInitialDirectorPacketState(sceneId = "greeting") {
  return {
    phase: DirectorPacketPhase.Idle,
    currentSceneId: sceneId,
    packet: null,
    activeTurnIndex: -1,
    activePrompt: null,
    attemptNumber: 0,
    successfulRepeats: 0,
    previousTurnSummary: [],
    runtimeState: {
      currentSceneId: sceneId,
      phase: "start_scene",
      attemptNumber: 0,
      successfulRepeats: 0,
      previousTurnSummary: [],
      lastChildResult: null,
    },
  };
}

function summarizeTurns(packet) {
  return packet.turns.map((turn) => ({
    speaker: turn.speaker,
    purpose: turn.purpose,
    visibleText: turn.visibleText,
  }));
}

export function reduceDirectorPacketState(state, event) {
  switch (event.type) {
    case "START":
      return { ...state, phase: DirectorPacketPhase.LoadingPacket };
    case "PACKET_LOADED":
      return {
        ...state,
        phase:
          event.packet.turns.length > 0
            ? DirectorPacketPhase.PlayingTurn
            : event.packet.lessonControl.status === "finish_lesson"
              ? DirectorPacketPhase.Finished
              : DirectorPacketPhase.NeedsPacket,
        packet: event.packet,
        currentSceneId: event.packet.sceneId,
        activeTurnIndex: event.packet.turns.length > 0 ? 0 : -1,
        activePrompt: event.packet.childPrompt,
        previousTurnSummary: summarizeTurns(event.packet),
      };
    case "TURN_DONE": {
      if (!state.packet) return state;
      const nextIndex = state.activeTurnIndex + 1;
      if (nextIndex < state.packet.turns.length) {
        return { ...state, activeTurnIndex: nextIndex };
      }
      if (state.packet.childPrompt.shouldListen) {
        return { ...state, phase: DirectorPacketPhase.Listening };
      }
      if (state.packet.lessonControl.status === "finish_lesson") {
        return { ...state, phase: DirectorPacketPhase.Finished };
      }
      if (state.packet.lessonControl.status === "advance_scene") {
        const nextSceneId = state.packet.lessonControl.nextSceneId ?? state.currentSceneId;
        return {
          ...state,
          phase: DirectorPacketPhase.NeedsPacket,
          currentSceneId: nextSceneId,
          attemptNumber: 0,
          successfulRepeats: 0,
          runtimeState: {
            currentSceneId: nextSceneId,
            phase: "start_scene",
            attemptNumber: 0,
            successfulRepeats: 0,
            previousTurnSummary: [],
            lastChildResult: null,
          },
        };
      }
      return {
        ...state,
        phase: DirectorPacketPhase.NeedsPacket,
        currentSceneId: state.packet.lessonControl.nextSceneId ?? state.currentSceneId,
      };
    }
    case "RECORDING_DONE":
      return { ...state, phase: DirectorPacketPhase.Evaluating };
    case "EVALUATED": {
      const passed = event.result.passed;
      const successfulRepeats = passed ? state.successfulRepeats + 1 : state.successfulRepeats;
      const attemptNumber = state.attemptNumber + 1;
      return {
        ...state,
        phase: DirectorPacketPhase.NeedsPacket,
        attemptNumber,
        successfulRepeats,
        runtimeState: {
          currentSceneId: state.currentSceneId,
          phase: "after_child_answer",
          attemptNumber,
          successfulRepeats,
          previousTurnSummary: state.previousTurnSummary,
          lastChildResult: {
            targetText: state.activePrompt?.targetText ?? "",
            transcript: event.result.transcript,
            passed,
            similarity: event.result.similarity,
            reason: passed ? "matched_target" : "below_threshold",
          },
        },
      };
    }
    case "PACKET_FAILED":
      return { ...state, phase: DirectorPacketPhase.Error };
    default:
      return state;
  }
}
