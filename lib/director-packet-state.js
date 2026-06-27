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

/**
 * @typedef {{ lang: string, text: string }} DirectorSpeechSegment
 * @typedef {{ speaker: string, purpose: string, visibleText: string }} DirectorTurnSummary
 * @typedef {{ targetText: string, transcript: string, passed: boolean, similarity: number, reason?: string }} DirectorChildResult
 * @typedef {{ shouldListen: boolean, targetText: string, displayText: string, recordingSeconds: number }} DirectorChildPrompt
 * @typedef {{ status: string, nextSceneId: string | null, reason: string }} DirectorLessonControl
 * @typedef {{ turnId: string, speaker: string, purpose: string, visibleText: string, speech: DirectorSpeechSegment[], pose: string }} DirectorPacketTurn
 * @typedef {{ schemaVersion: string, packetId: string, sceneId: string, background: string, characters: Record<string, { pose: string }>, turns: DirectorPacketTurn[], childPrompt: DirectorChildPrompt, lessonControl: DirectorLessonControl }} DirectorPacket
 * @typedef {{ currentSceneId: string, phase: string, attemptNumber: number, successfulRepeats: number, previousTurnSummary: DirectorTurnSummary[], lastChildResult: DirectorChildResult | null }} DirectorRuntimeState
 * @typedef {{ transcript?: string, similarity: number, passed: boolean, reason?: string }} DirectorEvaluationResult
 * @typedef {{ phase: string, currentSceneId: string, packet: DirectorPacket | null, activeTurnIndex: number, activePrompt: DirectorChildPrompt | null, attemptNumber: number, successfulRepeats: number, previousTurnSummary: DirectorTurnSummary[], runtimeState: DirectorRuntimeState }} DirectorPacketState
 * @typedef {{ type: "START" } | { type: "PACKET_LOADED", packet: DirectorPacket } | { type: "TURN_DONE" } | { type: "RECORDING_DONE" } | { type: "EVALUATED", result: DirectorEvaluationResult } | { type: "PACKET_FAILED" }} DirectorPacketEvent
 */

/**
 * @param {string} sceneId
 * @returns {DirectorRuntimeState}
 */
function createStartSceneRuntimeState(sceneId) {
  return {
    currentSceneId: sceneId,
    phase: "start_scene",
    attemptNumber: 0,
    successfulRepeats: 0,
    previousTurnSummary: [],
    lastChildResult: null,
  };
}

/**
 * @param {string} [sceneId]
 * @returns {DirectorPacketState}
 */
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
    runtimeState: createStartSceneRuntimeState(sceneId),
  };
}

/**
 * @param {DirectorPacket} packet
 * @returns {DirectorTurnSummary[]}
 */
function summarizeTurns(packet) {
  return packet.turns.map((turn) => ({
    speaker: turn.speaker,
    purpose: turn.purpose,
    visibleText: turn.visibleText,
  }));
}

/**
 * @param {DirectorEvaluationResult} result
 * @returns {string}
 */
function getEvaluationReason(result) {
  if (result.passed) return "matched_target";
  if (result.reason) return result.reason;
  if ((result.transcript ?? "").trim() === "") return "no_speech";
  return "below_threshold";
}

/**
 * @param {DirectorPacketState} state
 * @param {DirectorPacketEvent} event
 * @returns {DirectorPacketState}
 */
export function reduceDirectorPacketState(state, event) {
  switch (event.type) {
    case "START":
      return { ...state, phase: DirectorPacketPhase.LoadingPacket };
    case "PACKET_LOADED": {
      if (
        event.packet.turns.length === 0 &&
        event.packet.lessonControl.status === "advance_scene"
      ) {
        const nextSceneId = event.packet.lessonControl.nextSceneId ?? state.currentSceneId;
        return {
          ...state,
          phase: DirectorPacketPhase.NeedsPacket,
          packet: event.packet,
          currentSceneId: nextSceneId,
          activeTurnIndex: -1,
          activePrompt: event.packet.childPrompt,
          attemptNumber: 0,
          successfulRepeats: 0,
          previousTurnSummary: summarizeTurns(event.packet),
          runtimeState: createStartSceneRuntimeState(nextSceneId),
        };
      }
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
    }
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
          runtimeState: createStartSceneRuntimeState(nextSceneId),
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
      const transcript = event.result.transcript ?? "";
      const evaluatedSuccessRepeat =
        state.packet?.lessonControl.reason === "success_repeat_required";
      const successfulRepeats =
        passed && evaluatedSuccessRepeat
          ? state.successfulRepeats + 1
          : state.successfulRepeats;
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
            transcript,
            passed,
            similarity: event.result.similarity,
            reason: getEvaluationReason(event.result),
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
