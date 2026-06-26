export const STATIC_AUDIO_BASE_PATH = "/assets/audio";

export const STATIC_AUDIO_LINES = {
  "instruction-peppa": {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/instruction-peppa.wav`,
    text: "先听佩奇说。",
  },
  "instruction-polly": {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/instruction-polly.wav`,
    text: "再听多莉说一遍。",
  },
  "turn-hello": {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/turn-hello.wav`,
    text: "轮到你了，请说：This is my parrot, Polly!",
  },
  "turn-cant-reach": {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/turn-cant-reach.wav`,
    text: "轮到你了，请说：Oh! I can't reach it.",
  },
  "turn-help-please": {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/turn-help-please.wav`,
    text: "轮到你了，请说：Can you help me, please?",
  },
  "turn-here-you-are": {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/turn-here-you-are.wav`,
    text: "轮到你了，请说：Here you are!",
  },
  "turn-thank-you": {
    lang: "zh-CN",
    src: `${STATIC_AUDIO_BASE_PATH}/turn-thank-you.wav`,
    text: "轮到你了，请说：Thank you!",
  },
  "host-hello": {
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/host-hello.wav`,
    style: "character",
    text: "Hi, Bella! How are you?",
  },
  "host-cant-reach": {
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/host-cant-reach.wav`,
    style: "character",
    text: "Oh! I can't reach it.",
  },
  "host-help-please": {
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/host-help-please.wav`,
    style: "character",
    text: "Can you help me, please?",
  },
  "host-here-you-are": {
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/host-here-you-are.wav`,
    style: "character",
    text: "Here you are!",
  },
  "host-thank-you": {
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/host-thank-you.wav`,
    style: "character",
    text: "Thank you!",
  },
  "parrot-hello": {
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/parrot-hello.wav`,
    style: "character",
    text: "This is my parrot, Polly!",
  },
  "parrot-cant-reach": {
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/parrot-cant-reach.wav`,
    style: "character",
    text: "Oh! I can't reach it.",
  },
  "parrot-help-please": {
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/parrot-help-please.wav`,
    style: "character",
    text: "Can you help me, please?",
  },
  "parrot-here-you-are": {
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/parrot-here-you-are.wav`,
    style: "character",
    text: "Here you are!",
  },
  "parrot-thank-you": {
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/parrot-thank-you.wav`,
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
