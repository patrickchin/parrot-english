// @ts-check

export const STATIC_AUDIO_BASE_PATH = "/assets/audio";

/**
 * @typedef {object} StaticAudioLine
 * @property {"zh-CN" | "en-US"} lang
 * @property {string} src
 * @property {string} text
 * @property {"character"} [style]
 * @property {"pig" | "parrot"} [speaker]
 * @property {string} [ttsText]
 * @property {"energetic-character"} [voiceStyle]
 */

/** @type {Record<string, StaticAudioLine>} */
export const STATIC_AUDIO_LINES = {
  "turn-hello": {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/turn-hello.mp3`,
    text: "佩奇在和你打招呼。我们回答佩奇。",
    ttsText: "[excited][brightly] 佩奇在和你打招呼。我们回答佩奇。",
    voiceStyle: "energetic-character",
  },
  "turn-cant-reach": {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/turn-cant-reach.mp3`,
    text: "佩奇够不到。跟我说。",
    ttsText: "[encouraging][brightly] 佩奇够不到。跟我说。",
    voiceStyle: "energetic-character",
  },
  "turn-help-please": {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/turn-help-please.mp3`,
    text: "佩奇在请求帮助。跟我说。",
    ttsText: "[encouraging][brightly] 佩奇在请求帮助。跟我说。",
    voiceStyle: "energetic-character",
  },
  "turn-here-you-are": {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/turn-here-you-are.mp3`,
    text: "多莉把东西给佩奇。跟我说。",
    ttsText: "[excited][brightly] 多莉把东西给佩奇。跟我说。",
    voiceStyle: "energetic-character",
  },
  "turn-thank-you": {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/turn-thank-you.mp3`,
    text: "佩奇在说谢谢。跟我说。",
    ttsText: "[excited][brightly] 佩奇在说谢谢。跟我说。",
    voiceStyle: "energetic-character",
  },
  "example-hello": {
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/pig-hello.mp3`,
    style: "character",
    text: "Hello, Bella!",
  },
  "example-cant-reach": {
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/pig-cant-reach.mp3`,
    style: "character",
    text: "Oh! I can't reach it.",
  },
  "example-help-please": {
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/pig-help-please.mp3`,
    style: "character",
    text: "Can you help me, please?",
  },
  "example-here-you-are": {
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/pig-here-you-are.mp3`,
    style: "character",
    text: "Here you are!",
  },
  "example-thank-you": {
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/pig-thank-you.mp3`,
    style: "character",
    text: "Thank you!",
  },
  "model-hello": {
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/parrot-hello.mp3`,
    style: "character",
    speaker: "parrot",
    text: "Hello, Peppa!",
  },
  "model-cant-reach": {
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/parrot-cant-reach.mp3`,
    style: "character",
    speaker: "parrot",
    text: "Oh! I can't reach it.",
  },
  "model-help-please": {
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/parrot-help-please.mp3`,
    style: "character",
    speaker: "parrot",
    text: "Can you help me, please?",
  },
  "model-here-you-are": {
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/parrot-here-you-are.mp3`,
    style: "character",
    speaker: "parrot",
    text: "Here you are!",
  },
  "model-thank-you": {
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/parrot-thank-you.mp3`,
    style: "character",
    speaker: "parrot",
    text: "Thank you!",
  },
  "feedback-success": {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/feedback-success.mp3`,
    text: "太棒了！我们继续下一句。",
    ttsText: "[excited][cheerful] 太棒了！我们继续下一句。",
    voiceStyle: "energetic-character",
  },
  "feedback-retry": {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/feedback-retry.mp3`,
    text: "差一点点，听多莉慢慢说，再试一次。",
    ttsText: "[encouraging][upbeat] 差一点点，听多莉慢慢说，再试一次。",
    voiceStyle: "energetic-character",
  },
  "feedback-no-speech": {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/feedback-no-speech.mp3`,
    text: "我没有听清楚，我们慢一点再试一次。",
    ttsText: "[encouraging][bright] 我没有听清楚，我们慢一点再试一次。",
    voiceStyle: "energetic-character",
  },
  "feedback-missing-target": {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/feedback-missing-target.mp3`,
    text: "请先设置要练习的句子。",
    ttsText: "[friendly][clear] 请先设置要练习的句子。",
    voiceStyle: "energetic-character",
  },
  finished: {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/finished.mp3`,
    text: "太棒啦，今天练习完成。",
    ttsText: "[excited][cheerful] 太棒啦，今天练习完成。",
    voiceStyle: "energetic-character",
  },
};

/**
 * @param {string} id
 * @returns {StaticAudioLine & { id: string }}
 */
export function getStaticAudioLine(id) {
  const line = STATIC_AUDIO_LINES[id];
  if (!line) {
    throw new Error(`Unknown static audio id: ${id}`);
  }

  return { id, ...line };
}

/**
 * @param {string} text
 * @returns {string | undefined}
 */
export function findStaticAudioLineByText(text) {
  return Object.entries(STATIC_AUDIO_LINES).find(
    ([, line]) => line.text === text
  )?.[0];
}
