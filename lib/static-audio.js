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

/**
 * @param {string} id
 * @param {"peppa" | "dolly" | "narrator"} speaker
 * @param {string} text
 * @returns {[string, StaticAudioLine]}
 */
function createLessonAudioLine(id, speaker, text) {
  return [
    id,
    {
      speaker,
      lang: "en-US",
      src: `${STATIC_AUDIO_BASE_PATH}/${id}.mp3`,
      text,
      ...(speaker === "narrator" ? {} : { style: "character" }),
    },
  ];
}

/** @type {Record<string, StaticAudioLine>} */
const LESSON_AUDIO_LINES = Object.fromEntries([
  createLessonAudioLine(
    "garden-peppa-look-at-flowers",
    "peppa",
    "Look at the flowers!"
  ),
  createLessonAudioLine(
    "garden-dolly-so-many-colors",
    "dolly",
    "So many colors!"
  ),
  createLessonAudioLine(
    "garden-peppa-what-color",
    "peppa",
    "What color is it?"
  ),
  createLessonAudioLine(
    "garden-dolly-what-color",
    "dolly",
    "What color is it?"
  ),
  createLessonAudioLine("garden-dolly-it-is-red", "dolly", "It is red."),
  createLessonAudioLine(
    "garden-peppa-red-flower",
    "peppa",
    "A red flower!"
  ),
  createLessonAudioLine("garden-dolly-found-it", "dolly", "We found it!"),
  createLessonAudioLine(
    "garden-peppa-basket-ready",
    "peppa",
    "The basket is ready!"
  ),
  createLessonAudioLine(
    "garden-dolly-red-looks-lovely",
    "dolly",
    "Red looks lovely."
  ),
  createLessonAudioLine(
    "garden-narrator-finished-bella",
    "narrator",
    "Great job, Bella! The red flower is in the basket!"
  ),
  createLessonAudioLine("snack-dolly-time", "dolly", "It is snack time!"),
  createLessonAudioLine(
    "snack-peppa-basket-question",
    "peppa",
    "What is in the basket?"
  ),
  createLessonAudioLine(
    "snack-dolly-fruit-list",
    "dolly",
    "Apples and bananas!"
  ),
  createLessonAudioLine(
    "snack-peppa-apple-yummy",
    "peppa",
    "That apple looks yummy."
  ),
  createLessonAudioLine(
    "snack-peppa-may-i-have-apple",
    "peppa",
    "May I have an apple?"
  ),
  createLessonAudioLine(
    "snack-dolly-may-i-have-apple",
    "dolly",
    "May I have an apple?"
  ),
  createLessonAudioLine(
    "snack-peppa-thank-you-dolly",
    "peppa",
    "Thank you, Dolly!"
  ),
  createLessonAudioLine(
    "snack-dolly-enjoy-apple",
    "dolly",
    "Enjoy your apple!"
  ),
  createLessonAudioLine(
    "snack-narrator-finished-bella",
    "narrator",
    "Great job, Bella! Peppa has her apple snack!"
  ),
  createLessonAudioLine(
    "playground-peppa-swing-busy",
    "peppa",
    "The swing is busy."
  ),
  createLessonAudioLine(
    "playground-dolly-swinging",
    "dolly",
    "I am swinging!"
  ),
  createLessonAudioLine(
    "playground-peppa-want-turn",
    "peppa",
    "I want a turn."
  ),
  createLessonAudioLine(
    "playground-dolly-you-can-ask",
    "dolly",
    "You can ask me."
  ),
  createLessonAudioLine(
    "playground-peppa-can-i-turn",
    "peppa",
    "Can I have a turn?"
  ),
  createLessonAudioLine(
    "playground-dolly-can-i-turn",
    "dolly",
    "Can I have a turn?"
  ),
  createLessonAudioLine(
    "playground-dolly-turn-next",
    "dolly",
    "Yes! Your turn is next."
  ),
  createLessonAudioLine(
    "playground-peppa-play-together",
    "peppa",
    "Let's play together!"
  ),
  createLessonAudioLine(
    "playground-dolly-play-together",
    "dolly",
    "Let's play together!"
  ),
  createLessonAudioLine(
    "playground-narrator-finished-bella",
    "narrator",
    "Great job, Bella! Peppa and Dolly are playing together!"
  ),
  createLessonAudioLine(
    "market-dolly-welcome",
    "dolly",
    "Welcome to my fruit stand!"
  ),
  createLessonAudioLine(
    "market-peppa-see-apples",
    "peppa",
    "I see red apples."
  ),
  createLessonAudioLine(
    "market-peppa-how-much",
    "peppa",
    "How much is it?"
  ),
  createLessonAudioLine(
    "market-dolly-how-much",
    "dolly",
    "How much is it?"
  ),
  createLessonAudioLine(
    "market-dolly-two-coins",
    "dolly",
    "It is two coins."
  ),
  createLessonAudioLine(
    "market-peppa-two-coins",
    "peppa",
    "I have two coins."
  ),
  createLessonAudioLine(
    "market-peppa-two-apples",
    "peppa",
    "I'd like two apples, please."
  ),
  createLessonAudioLine(
    "market-dolly-two-apples",
    "dolly",
    "I'd like two apples, please."
  ),
  createLessonAudioLine(
    "market-dolly-here-two-apples",
    "dolly",
    "Here are two apples."
  ),
  createLessonAudioLine(
    "market-narrator-finished-bella",
    "narrator",
    "Great job, Bella! Peppa bought two red apples!"
  ),
  createLessonAudioLine(
    "picnic-peppa-looks-lovely",
    "peppa",
    "Our picnic looks lovely!"
  ),
  createLessonAudioLine(
    "picnic-dolly-cups-ready",
    "dolly",
    "The cups are ready."
  ),
  createLessonAudioLine(
    "picnic-dolly-would-you-like-juice",
    "dolly",
    "Would you like some juice?"
  ),
  createLessonAudioLine(
    "picnic-peppa-yes-please",
    "peppa",
    "Yes, please!"
  ),
  createLessonAudioLine(
    "picnic-dolly-yes-please",
    "dolly",
    "Yes, please!"
  ),
  createLessonAudioLine(
    "picnic-dolly-here-juice",
    "dolly",
    "Here is your juice."
  ),
  createLessonAudioLine(
    "picnic-peppa-ready",
    "peppa",
    "The picnic is ready!"
  ),
  createLessonAudioLine(
    "picnic-dolly-eat-together",
    "dolly",
    "Let's eat together!"
  ),
  createLessonAudioLine(
    "picnic-narrator-finished-bella",
    "narrator",
    "Great job, Bella! Peppa has her picnic juice!"
  ),
  createLessonAudioLine(
    "bedtime-dolly-story-finished",
    "dolly",
    "The story is finished."
  ),
  createLessonAudioLine(
    "bedtime-peppa-liked-story",
    "peppa",
    "I liked the story."
  ),
  createLessonAudioLine(
    "bedtime-dolly-moon-high",
    "dolly",
    "The moon is high."
  ),
  createLessonAudioLine(
    "bedtime-peppa-quiet",
    "peppa",
    "It is very quiet."
  ),
  createLessonAudioLine(
    "bedtime-peppa-sleepy",
    "peppa",
    "I'm sleepy."
  ),
  createLessonAudioLine(
    "bedtime-dolly-sleepy",
    "dolly",
    "I'm sleepy."
  ),
  createLessonAudioLine(
    "bedtime-peppa-blanket-ready",
    "peppa",
    "My blanket is ready."
  ),
  createLessonAudioLine(
    "bedtime-dolly-close-eyes",
    "dolly",
    "Close your eyes."
  ),
  createLessonAudioLine(
    "bedtime-peppa-good-night",
    "peppa",
    "Good night!"
  ),
  createLessonAudioLine(
    "bedtime-dolly-good-night",
    "dolly",
    "Good night!"
  ),
  createLessonAudioLine(
    "bedtime-narrator-finished-bella",
    "narrator",
    "Great job, Bella! Peppa is ready to sleep!"
  ),
]);

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
  ...LESSON_AUDIO_LINES,
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
