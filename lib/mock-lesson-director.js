// @ts-check

/**
 * @typedef {{ lang: string, text: string }} DirectorSpeechSegment
 * @typedef {{ speaker: string, purpose: string, visibleText: string }} DirectorTurnSummary
 * @typedef {{ targetText: string, transcript: string, passed: boolean, similarity: number, reason?: string }} DirectorChildResult
 * @typedef {{ shouldListen: boolean, targetText: string, displayText: string, recordingSeconds: number }} DirectorChildPrompt
 * @typedef {{ status: string, nextSceneId: string | null, reason: string }} DirectorLessonControl
 * @typedef {{ turnId: string, speaker: string, purpose: string, visibleText: string, speech: DirectorSpeechSegment[], pose: string }} DirectorPacketTurn
 * @typedef {{ schemaVersion: string, packetId: string, sceneId: string, background: string, characters: Record<string, { pose: string }>, turns: DirectorPacketTurn[], childPrompt: DirectorChildPrompt, lessonControl: DirectorLessonControl }} DirectorPacket
 * @typedef {{ id: string, backgroundPreference: string, sceneLine: DirectorSpeechSegment & { speaker: string }, tutorCueZh: string, modelLine: DirectorSpeechSegment & { speaker: string }, childTarget: string }} DirectorScene
 * @typedef {{ scenes: DirectorScene[], teachingPolicy: { maxRetriesPerScene?: number, successRequiresRepeat: boolean } }} DirectorLesson
 * @typedef {{ currentSceneId: string, phase: string, attemptNumber: number, successfulRepeats: number, previousTurnSummary: DirectorTurnSummary[], lastChildResult: DirectorChildResult | null }} DirectorRuntimeState
 */

/**
 * @param {DirectorLesson} lesson
 * @param {string} sceneId
 * @returns {DirectorScene}
 */
function getScene(lesson, sceneId) {
  const scene = lesson.scenes.find((candidate) => candidate.id === sceneId);
  if (!scene) throw new Error(`Unknown scene: ${sceneId}`);
  return scene;
}

/**
 * @param {DirectorLesson} lesson
 * @param {string} sceneId
 * @returns {string | null}
 */
function getNextSceneId(lesson, sceneId) {
  const index = lesson.scenes.findIndex((scene) => scene.id === sceneId);
  return lesson.scenes[index + 1]?.id ?? null;
}

/**
 * @param {string} packetId
 * @param {number} index
 * @param {string} speaker
 * @param {string} purpose
 * @param {string} visibleText
 * @param {DirectorSpeechSegment[]} speech
 * @param {string} pose
 * @returns {DirectorPacketTurn}
 */
function createTurn(packetId, index, speaker, purpose, visibleText, speech, pose) {
  return {
    turnId: `${packetId}-t${index}`,
    speaker,
    purpose,
    visibleText,
    speech,
    pose,
  };
}

/**
 * @param {string} packetId
 * @param {number} index
 * @param {DirectorScene} scene
 * @returns {DirectorPacketTurn}
 */
function createPromptTurn(packetId, index, scene) {
  return createTurn(
    packetId,
    index,
    "polly",
    "prompt_repeat",
    `轮到你说：${scene.childTarget}`,
    [
      { lang: "zh-CN", text: "轮到你说：" },
      { lang: "en-US", text: scene.childTarget },
    ],
    "flap"
  );
}

/**
 * @param {DirectorScene} scene
 * @returns {DirectorPacket}
 */
function createStartPacket(scene) {
  const packetId = `${scene.id}-start-001`;
  return {
    schemaVersion: "lesson-director.response.v1",
    packetId,
    sceneId: scene.id,
    background: scene.backgroundPreference,
    characters: {
      peppa: { pose: "listen" },
      polly: { pose: "flap" },
    },
    turns: [
      createTurn(
        packetId,
        1,
        "peppa",
        "scene_dialogue",
        scene.sceneLine.text,
        [{ lang: scene.sceneLine.lang, text: scene.sceneLine.text }],
        "talk"
      ),
      createTurn(
        packetId,
        2,
        "polly",
        "context_explain",
        scene.tutorCueZh,
        [{ lang: "zh-CN", text: scene.tutorCueZh }],
        "talk"
      ),
      createTurn(
        packetId,
        3,
        "polly",
        "model_phrase",
        scene.modelLine.text,
        [{ lang: scene.modelLine.lang, text: scene.modelLine.text }],
        "talk"
      ),
      createPromptTurn(packetId, 4, scene),
    ],
    childPrompt: {
      shouldListen: true,
      targetText: scene.childTarget,
      displayText: `轮到你说：${scene.childTarget}`,
      recordingSeconds: 4.2,
    },
    lessonControl: {
      status: "prompt_child",
      nextSceneId: null,
      reason: "waiting_for_first_attempt",
    },
  };
}

/**
 * @param {DirectorLesson} lesson
 * @param {DirectorScene} scene
 * @param {DirectorRuntimeState} runtimeState
 * @returns {DirectorPacket}
 */
function createSuccessPacket(lesson, scene, runtimeState) {
  const nextSceneId = getNextSceneId(lesson, scene.id);
  const needsRepeat =
    lesson.teachingPolicy.successRequiresRepeat &&
    runtimeState.successfulRepeats < 1;

  if (!needsRepeat) {
    const packetId = `${scene.id}-advance-001`;
    return {
      schemaVersion: "lesson-director.response.v1",
      packetId,
      sceneId: scene.id,
      background: scene.backgroundPreference,
      characters: {
        peppa: { pose: "clap" },
        polly: { pose: "laugh" },
      },
      turns: [
        createTurn(
          packetId,
          1,
          "polly",
          "feedback_success",
          "太棒啦，我们继续。",
          [{ lang: "zh-CN", text: "太棒啦，我们继续。" }],
          "laugh"
        ),
      ],
      childPrompt: {
        shouldListen: false,
        targetText: "",
        displayText: "",
        recordingSeconds: 0,
      },
      lessonControl: {
        status: nextSceneId ? "advance_scene" : "finish_lesson",
        nextSceneId,
        reason: nextSceneId ? "target_completed" : "lesson_completed",
      },
    };
  }

  const packetId = `${scene.id}-success-repeat-001`;
  return {
    schemaVersion: "lesson-director.response.v1",
    packetId,
    sceneId: scene.id,
    background: scene.backgroundPreference,
    characters: {
      peppa: { pose: "clap" },
      polly: { pose: "flap" },
    },
    turns: [
      createTurn(
        packetId,
        1,
        "polly",
        "feedback_success",
        "太棒了！你说对了。",
        [{ lang: "zh-CN", text: "太棒了！你说对了。" }],
        "laugh"
      ),
      createTurn(
        packetId,
        2,
        "polly",
        "prompt_repeat",
        `再说一遍：${scene.childTarget}`,
        [
          { lang: "zh-CN", text: "再说一遍：" },
          { lang: "en-US", text: scene.childTarget },
        ],
        "talk"
      ),
    ],
    childPrompt: {
      shouldListen: true,
      targetText: scene.childTarget,
      displayText: `再说一遍：${scene.childTarget}`,
      recordingSeconds: 4.2,
    },
    lessonControl: {
      status: "prompt_child",
      nextSceneId: null,
      reason: "success_repeat_required",
    },
  };
}

/**
 * @param {DirectorScene} scene
 * @param {string | undefined} reason
 * @returns {DirectorPacket}
 */
function createRetryPacket(scene, reason) {
  const packetId = `${scene.id}-retry-001`;
  const feedbackText =
    reason === "no_speech" ? "我没有听清楚，我们再试一次。" : "差一点点，我们慢慢再来。";
  return {
    schemaVersion: "lesson-director.response.v1",
    packetId,
    sceneId: scene.id,
    background: scene.backgroundPreference,
    characters: {
      peppa: { pose: "listen" },
      polly: { pose: "flap" },
    },
    turns: [
      createTurn(
        packetId,
        1,
        "polly",
        reason === "no_speech" ? "feedback_no_speech" : "feedback_retry",
        feedbackText,
        [{ lang: "zh-CN", text: feedbackText }],
        "talk"
      ),
      createTurn(
        packetId,
        2,
        "polly",
        "slow_model",
        scene.childTarget,
        [{ lang: "en-US", text: scene.childTarget }],
        "talk"
      ),
      createPromptTurn(packetId, 3, scene),
    ],
    childPrompt: {
      shouldListen: true,
      targetText: scene.childTarget,
      displayText: `轮到你说：${scene.childTarget}`,
      recordingSeconds: 4.2,
    },
    lessonControl: {
      status: "prompt_child",
      nextSceneId: null,
      reason: "retry_current_target",
    },
  };
}

/**
 * @param {DirectorLesson} lesson
 * @param {DirectorScene} scene
 * @returns {DirectorPacket}
 */
function createRetryLimitPacket(lesson, scene) {
  const nextSceneId = getNextSceneId(lesson, scene.id);
  const isFinalScene = nextSceneId === null;
  const packetId = `${scene.id}-${isFinalScene ? "retry-finish" : "retry-advance"}-001`;
  const feedbackText = isFinalScene
    ? "没关系，你已经努力完成了。"
    : "没关系，我们先往前走。";
  return {
    schemaVersion: "lesson-director.response.v1",
    packetId,
    sceneId: scene.id,
    background: scene.backgroundPreference,
    characters: {
      peppa: { pose: isFinalScene ? "clap" : "listen" },
      polly: { pose: "talk" },
    },
    turns: [
      createTurn(
        packetId,
        1,
        "polly",
        isFinalScene ? "completion" : "transition",
        feedbackText,
        [{ lang: "zh-CN", text: feedbackText }],
        "talk"
      ),
    ],
    childPrompt: {
      shouldListen: false,
      targetText: "",
      displayText: "",
      recordingSeconds: 0,
    },
    lessonControl: {
      status: isFinalScene ? "finish_lesson" : "advance_scene",
      nextSceneId,
      reason: "max_retries_reached",
    },
  };
}

/**
 * @param {DirectorLesson} lesson
 * @param {DirectorRuntimeState} runtimeState
 * @returns {DirectorPacket}
 */
export function getMockDirectorPacket(lesson, runtimeState) {
  const scene = getScene(lesson, runtimeState.currentSceneId);
  if (runtimeState.phase !== "after_child_answer") {
    return createStartPacket(scene);
  }
  if (runtimeState.lastChildResult?.passed) {
    return createSuccessPacket(lesson, scene, runtimeState);
  }
  if (
    runtimeState.attemptNumber >=
    (lesson.teachingPolicy.maxRetriesPerScene ?? Number.POSITIVE_INFINITY)
  ) {
    return createRetryLimitPacket(lesson, scene);
  }
  return createRetryPacket(scene, runtimeState.lastChildResult?.reason);
}
