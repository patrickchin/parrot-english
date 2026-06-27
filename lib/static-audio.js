export const STATIC_AUDIO_BASE_PATH = "/assets/audio";

export const STATIC_AUDIO_LINES = {
  "turn-hello": {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/turn-hello.wav`,
    text: "轮到你了，跟着佩奇说。",
  },
  "turn-cant-reach": {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/turn-cant-reach.wav`,
    text: "轮到你了，跟着佩奇说。",
  },
  "turn-help-please": {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/turn-help-please.wav`,
    text: "轮到你了，跟着佩奇说。",
  },
  "turn-here-you-are": {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/turn-here-you-are.wav`,
    text: "轮到你了，跟着佩奇说。",
  },
  "turn-thank-you": {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/turn-thank-you.wav`,
    text: "轮到你了，跟着佩奇说。",
  },
  "example-hello": {
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/host-hello.wav`,
    style: "character",
    text: "Hi, Bella! How are you?",
  },
  "example-cant-reach": {
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/host-cant-reach.wav`,
    style: "character",
    text: "Oh! I can't reach it.",
  },
  "example-help-please": {
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/host-help-please.wav`,
    style: "character",
    text: "Can you help me, please?",
  },
  "example-here-you-are": {
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/host-here-you-are.wav`,
    style: "character",
    text: "Here you are!",
  },
  "example-thank-you": {
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/host-thank-you.wav`,
    style: "character",
    text: "Thank you!",
  },
  "feedback-success": {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/feedback-success.wav`,
    text: "太棒了！我们继续下一句。",
  },
  "feedback-retry": {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/feedback-retry.wav`,
    text: "差一点点，听多莉慢慢说，再试一次。",
  },
  "feedback-no-speech": {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/feedback-no-speech.wav`,
    text: "我没有听清楚，我们慢一点再试一次。",
  },
  "feedback-missing-target": {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/feedback-missing-target.wav`,
    text: "请先设置要练习的句子。",
  },
  finished: {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/finished.wav`,
    text: "太棒啦，今天练习完成。",
  },
};

export function getStaticAudioLine(id) {
  const line = STATIC_AUDIO_LINES[id];
  if (!line) {
    throw new Error(`Unknown static audio id: ${id}`);
  }

  return { id, ...line };
}

export function findStaticAudioLineByText(text) {
  return Object.entries(STATIC_AUDIO_LINES).find(
    ([, line]) => line.text === text
  )?.[0];
}
