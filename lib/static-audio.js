// @ts-check

export const STATIC_AUDIO_BASE_PATH = "/assets/audio";

/**
 * @typedef {object} StaticAudioLine
 * @property {"peppa" | "dolly" | "narrator"} speaker
 * @property {"en-US"} lang
 * @property {string} src
 * @property {string} text
 * @property {"character"} [style]
 * @property {string} [ttsText]
 * @property {"energetic-character"} [voiceStyle]
 */

/** @type {Record<string, StaticAudioLine>} */
export const STATIC_AUDIO_LINES = {
  "onboarding-introduction": {
    speaker: "peppa",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/onboarding-introduction.mp3`,
    text: "Hi! I'm Peppa. I'd love to get to know you before we start.",
    style: "character",
    voiceStyle: "energetic-character",
    ttsText:
      "[bright and friendly] Hi! I'm Peppa. [warmly] I'd love to get to know you before we start.",
  },
  "onboarding-age": {
    speaker: "peppa",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/onboarding-age.mp3`,
    text: "How old are you?",
    style: "character",
    voiceStyle: "energetic-character",
    ttsText: "[curious and cheerful] How old are you?",
  },
  "onboarding-favourite-cartoons": {
    speaker: "peppa",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/onboarding-favourite-cartoons.mp3`,
    text: "Which cartoons do you like?",
    style: "character",
    voiceStyle: "energetic-character",
    ttsText: "[excited and curious] Which cartoons do you like?",
  },
  "onboarding-favourite-animals": {
    speaker: "peppa",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/onboarding-favourite-animals.mp3`,
    text: "Which animals do you like?",
    style: "character",
    voiceStyle: "energetic-character",
    ttsText: "[playfully curious] Which animals do you like?",
  },
  "onboarding-favourite-activities": {
    speaker: "peppa",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/onboarding-favourite-activities.mp3`,
    text: "What activities do you enjoy?",
    style: "character",
    voiceStyle: "energetic-character",
    ttsText: "[bright and interested] What activities do you enjoy?",
  },
  "onboarding-favourite-story-topics": {
    speaker: "peppa",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/onboarding-favourite-story-topics.mp3`,
    text: "What stories or topics do you like?",
    style: "character",
    voiceStyle: "energetic-character",
    ttsText: "[warm and imaginative] What stories or topics do you like?",
  },
  "peppa-look-my-ball": {
    speaker: "peppa",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/peppa-look-my-ball.mp3`,
    text: "Look! My ball!",
    style: "character",
  },
  "dolly-it-is-up-high": {
    speaker: "dolly",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/dolly-it-is-up-high.mp3`,
    text: "It is up high!",
    style: "character",
  },
  "narrator-copy-dolly": {
    speaker: "narrator",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/narrator-copy-dolly.mp3`,
    text: "Let's copy Dolly!",
  },
  "peppa-cant-reach": {
    speaker: "peppa",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/peppa-cant-reach.mp3`,
    text: "Oh! I can't reach it.",
    style: "character",
  },
  "narrator-copy-peppa": {
    speaker: "narrator",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/narrator-copy-peppa.mp3`,
    text: "Let's copy Peppa!",
  },
  "peppa-can-help": {
    speaker: "peppa",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/peppa-can-help.mp3`,
    text: "Can you help me, please?",
    style: "character",
  },
  "narrator-ask-with-dolly": {
    speaker: "narrator",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/narrator-ask-with-dolly.mp3`,
    text: "Let's ask with Dolly!",
  },
  "dolly-can-help": {
    speaker: "dolly",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/dolly-can-help.mp3`,
    text: "Can you help me, please?",
    style: "character",
  },
  "dolly-yes-i-can-help": {
    speaker: "dolly",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/dolly-yes-i-can-help.mp3`,
    text: "Yes! I can help!",
    style: "character",
  },
  "dolly-here-you-are": {
    speaker: "dolly",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/dolly-here-you-are.mp3`,
    text: "Here you are!",
    style: "character",
  },
  "peppa-thank-you": {
    speaker: "peppa",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/peppa-thank-you.mp3`,
    text: "Thank you!",
    style: "character",
  },
  "narrator-thank-dolly": {
    speaker: "narrator",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/narrator-thank-dolly.mp3`,
    text: "Let's thank Dolly!",
  },
  "dolly-thank-you": {
    speaker: "dolly",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/dolly-thank-you.mp3`,
    text: "Thank you!",
    style: "character",
  },
  "narrator-finished-bella": {
    speaker: "narrator",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/narrator-finished-bella.mp3`,
    text: "Great job, Bella! Peppa has her ball!",
  },
  "narrator-feedback-success": {
    speaker: "narrator",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/narrator-feedback-success.mp3`,
    text: "Great job!",
  },
  "narrator-feedback-retry-bella": {
    speaker: "narrator",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/narrator-retry-bella.mp3`,
    text: "Almost! Try again, Bella.",
  },
  "narrator-feedback-continue": {
    speaker: "narrator",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/narrator-feedback-continue.mp3`,
    text: "Almost! Let's keep going.",
  },
  "narrator-feedback-no-speech-bella": {
    speaker: "narrator",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/narrator-no-speech-bella.mp3`,
    text: "I couldn't hear that. Try again, Bella.",
  },
  "narrator-feedback-no-speech-continue": {
    speaker: "narrator",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/narrator-no-speech-continue.mp3`,
    text: "I couldn't hear that. Let's keep going.",
  },
};

/**
 * @param {string} speaker
 * @param {string} text
 * @returns {StaticAudioLine & { id: string }}
 */
export function getStaticAudioLineForSpeech(speaker, text) {
  const entry = Object.entries(STATIC_AUDIO_LINES).find(
    ([, line]) => line.speaker === speaker && line.text === text
  );
  if (!entry) {
    throw new Error(`Missing saved audio for ${speaker}: ${text}`);
  }

  return { id: entry[0], ...entry[1] };
}
