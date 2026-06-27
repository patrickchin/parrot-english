// @ts-check

export const STATIC_AUDIO_BASE_PATH = "/assets/audio";

/**
 * @typedef {object} StaticAudioLine
 * @property {"zh-CN" | "en-US"} lang
 * @property {"peppa" | "polly"} speaker
 * @property {string} src
 * @property {string} text
 * @property {"character"} [style]
 * @property {string} [ttsText]
 * @property {"energetic-character"} [voiceStyle]
 */

/** @type {Record<string, StaticAudioLine>} */
export const STATIC_AUDIO_LINES = {
  "turn-hello": {
    lang: "zh-CN",
    speaker: "polly",
    src: `${STATIC_AUDIO_BASE_PATH}/turn-hello.wav`,
    text: "轮到你了，跟着佩奇说。",
    ttsText: "[excited][brightly] 轮到你了，跟着佩奇说。",
    voiceStyle: "energetic-character",
  },
  "turn-cant-reach": {
    lang: "zh-CN",
    speaker: "polly",
    src: `${STATIC_AUDIO_BASE_PATH}/turn-cant-reach.wav`,
    text: "轮到你了，跟着佩奇说。",
    ttsText: "[excited][brightly] 轮到你了，跟着佩奇说。",
    voiceStyle: "energetic-character",
  },
  "turn-help-please": {
    lang: "zh-CN",
    speaker: "polly",
    src: `${STATIC_AUDIO_BASE_PATH}/turn-help-please.wav`,
    text: "轮到你了，跟着佩奇说。",
    ttsText: "[excited][brightly] 轮到你了，跟着佩奇说。",
    voiceStyle: "energetic-character",
  },
  "turn-here-you-are": {
    lang: "zh-CN",
    speaker: "polly",
    src: `${STATIC_AUDIO_BASE_PATH}/turn-here-you-are.wav`,
    text: "轮到你了，跟着佩奇说。",
    ttsText: "[excited][brightly] 轮到你了，跟着佩奇说。",
    voiceStyle: "energetic-character",
  },
  "turn-thank-you": {
    lang: "zh-CN",
    speaker: "polly",
    src: `${STATIC_AUDIO_BASE_PATH}/turn-thank-you.wav`,
    text: "轮到你了，跟着佩奇说。",
    ttsText: "[excited][brightly] 轮到你了，跟着佩奇说。",
    voiceStyle: "energetic-character",
  },
  "example-hello": {
    lang: "en-US",
    speaker: "peppa",
    src: `${STATIC_AUDIO_BASE_PATH}/pig-hello.wav`,
    style: "character",
    text: "Hi, Bella! How are you?",
  },
  "example-cant-reach": {
    lang: "en-US",
    speaker: "peppa",
    src: `${STATIC_AUDIO_BASE_PATH}/pig-cant-reach.wav`,
    style: "character",
    text: "Oh! I can't reach it.",
  },
  "example-help-please": {
    lang: "en-US",
    speaker: "peppa",
    src: `${STATIC_AUDIO_BASE_PATH}/pig-help-please.wav`,
    style: "character",
    text: "Can you help me, please?",
  },
  "example-here-you-are": {
    lang: "en-US",
    speaker: "peppa",
    src: `${STATIC_AUDIO_BASE_PATH}/pig-here-you-are.wav`,
    style: "character",
    text: "Here you are!",
  },
  "example-thank-you": {
    lang: "en-US",
    speaker: "peppa",
    src: `${STATIC_AUDIO_BASE_PATH}/pig-thank-you.wav`,
    style: "character",
    text: "Thank you!",
  },
  "feedback-success": {
    lang: "zh-CN",
    speaker: "polly",
    src: `${STATIC_AUDIO_BASE_PATH}/feedback-success.wav`,
    text: "太棒了！我们继续下一句。",
    ttsText: "[excited][cheerful] 太棒了！我们继续下一句。",
    voiceStyle: "energetic-character",
  },
  "feedback-retry": {
    lang: "zh-CN",
    speaker: "polly",
    src: `${STATIC_AUDIO_BASE_PATH}/feedback-retry.wav`,
    text: "差一点点，听多莉慢慢说，再试一次。",
    ttsText: "[encouraging][upbeat] 差一点点，听多莉慢慢说，再试一次。",
    voiceStyle: "energetic-character",
  },
  "feedback-no-speech": {
    lang: "zh-CN",
    speaker: "polly",
    src: `${STATIC_AUDIO_BASE_PATH}/feedback-no-speech.wav`,
    text: "我没有听清楚，我们慢一点再试一次。",
    ttsText: "[encouraging][bright] 我没有听清楚，我们慢一点再试一次。",
    voiceStyle: "energetic-character",
  },
  "feedback-missing-target": {
    lang: "zh-CN",
    speaker: "polly",
    src: `${STATIC_AUDIO_BASE_PATH}/feedback-missing-target.wav`,
    text: "请先设置要练习的句子。",
    ttsText: "[friendly][clear] 请先设置要练习的句子。",
    voiceStyle: "energetic-character",
  },
  finished: {
    lang: "zh-CN",
    speaker: "polly",
    src: `${STATIC_AUDIO_BASE_PATH}/finished.wav`,
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

/**
 * @param {string} text
 * @param {string} speaker
 * @returns {string | undefined}
 */
export function findStaticAudioLineByTextForSpeaker(text, speaker) {
  return Object.entries(STATIC_AUDIO_LINES).find(
    ([, line]) => line.text === text && line.speaker === speaker
  )?.[0];
}
