// @ts-check

import { DUB_DEFINITIONS } from "../src/dubbing/rhyme-catalog.ts";
import {
  WORD_GAME_CATEGORIES,
  WORD_GAME_COMPLETE_AUDIO,
  WORD_GAME_CORRECT_AUDIO,
  WORD_GAME_RETRY_AUDIO,
} from "../src/games/word-game-catalog.ts";
import { STORIES } from "../src/stories/story-catalog.ts";

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

const DUB_GUIDE_AUDIO_LINES = Object.fromEntries(
  DUB_DEFINITIONS.flatMap(({ guides }) =>
    guides.map(({ id, src, text }) => [id, {
        speaker: "narrator",
        lang: "en-US",
        src,
        text,
        ttsText: `[warm, rhythmic nursery-rhyme delivery] ${text}`,
      }]),
  ),
);

/**
 * @param {{ id: string, source: string, text: string }} line
 * @param {string} direction
 * @returns {[string, StaticAudioLine]}
 */
function createWordGameAudioLine({ id, source, text }, direction) {
  return [id, {
    speaker: "narrator",
    lang: "en-US",
    src: source,
    text,
    ttsText: `[${direction}] ${text}`,
    voiceStyle: "energetic-character",
  }];
}

/** @param {readonly { items: readonly { labelAudio: { id: string, source: string, text: string }, promptAudio: { id: string, source: string, text: string } }[] }[]} categories @param {{ successAudio: { id: string, source: string, text: string }, retryAudio: { id: string, source: string, text: string }, completeAudio: { id: string, source: string, text: string } }} player */
export function createWordGameAudioLines(categories, player) {
  const wordGameAudioById = new Map();
  for (const { items } of categories) {
    for (const item of items) {
      for (const audio of [item.labelAudio, item.promptAudio]) {
        const existing = wordGameAudioById.get(audio.id);
        if (existing) {
          if (existing.text !== audio.text) {
            throw new Error(`Conflicting word-game audio text for ID: ${audio.id}`);
          }
          continue;
        }
        wordGameAudioById.set(
          audio.id,
          createWordGameAudioLine(
            audio,
            "bright, playful teaching delivery for a young child",
          )[1],
        );
      }
    }
  }
  wordGameAudioById.set(
    player.successAudio.id,
    createWordGameAudioLine(
      player.successAudio,
      "short nonverbal correct-answer ding",
    )[1],
  );
  wordGameAudioById.set(
    player.retryAudio.id,
    createWordGameAudioLine(
      player.retryAudio,
      "gentle, upbeat encouragement for a young child",
    )[1],
  );
  wordGameAudioById.set(
    player.completeAudio.id,
    createWordGameAudioLine(
      player.completeAudio,
      "happy, excited, not-loud celebration for a young child",
    )[1],
  );
  return Object.fromEntries(wordGameAudioById);
}

const WORD_GAME_AUDIO_LINES = createWordGameAudioLines(WORD_GAME_CATEGORIES, {
  successAudio: WORD_GAME_CORRECT_AUDIO,
  retryAudio: WORD_GAME_RETRY_AUDIO,
  completeAudio: WORD_GAME_COMPLETE_AUDIO,
});

/**
 * @param {...Record<string, StaticAudioLine>} groups
 * @returns {Record<string, StaticAudioLine>}
 */
export function mergeStaticAudioLineGroups(...groups) {
  /** @type {Record<string, StaticAudioLine>} */
  const merged = {};
  for (const group of groups) {
    for (const [id, line] of Object.entries(group)) {
      if (merged[id]) throw new Error(`Duplicate static audio ID: ${id}`);
      merged[id] = line;
    }
  }
  return merged;
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
]);

/** @type {Record<string, StaticAudioLine>} */
const STORY_AUDIO_LINES = {};

for (const story of STORIES) {
  for (const page of story.pages) {
    for (const { id, text } of [
      { id: page.narrationAudioId, text: page.text },
      { id: page.joinInAudioId, text: page.joinIn },
    ]) {
      if (!id) continue;
      const existing = STORY_AUDIO_LINES[id];
      if (existing && existing.text !== text) {
        throw new Error(`Story audio ID ${id} maps to more than one line.`);
      }
      STORY_AUDIO_LINES[id] = {
        speaker: "narrator",
        lang: "en-US",
        src: `${STATIC_AUDIO_BASE_PATH}/${id}.mp3`,
        text,
      };
    }
  }
}

export const LESSON_JOIN_IN_AUDIO_LINES = Object.fromEntries([
  ["lesson-join-in-dolly-it-is-up-high", "dolly-it-is-up-high", "It is up high!"],
  ["lesson-join-in-peppa-cant-reach", "peppa-cant-reach", "Oh! I can't reach it."],
  ["lesson-join-in-dolly-can-help", "dolly-can-help", "Can you help me, please?"],
  ["lesson-join-in-dolly-yes-i-can-help", "dolly-yes-i-can-help", "Yes! I can help!"],
  ["lesson-join-in-dolly-here-you-are", "dolly-here-you-are", "Here you are!"],
  ["lesson-join-in-dolly-thank-you", "dolly-thank-you", "Thank you!"],
  ["lesson-join-in-garden-dolly-what-color", "garden-dolly-what-color", "What color is it?"],
  ["lesson-join-in-garden-dolly-it-is-red", "garden-dolly-it-is-red", "It is red."],
  ["lesson-join-in-snack-dolly-may-i-have-apple", "snack-dolly-may-i-have-apple", "May I have an apple?"],
  ["lesson-join-in-playground-dolly-can-i-turn", "playground-dolly-can-i-turn", "Can I have a turn?"],
  ["lesson-join-in-playground-dolly-play-together", "playground-dolly-play-together", "Let's play together!"],
  ["lesson-join-in-market-dolly-how-much", "market-dolly-how-much", "How much is it?"],
  ["lesson-join-in-market-dolly-two-apples", "market-dolly-two-apples", "I'd like two apples, please."],
  ["lesson-join-in-picnic-dolly-would-you-like-juice", "picnic-dolly-would-you-like-juice", "Would you like some juice?"],
  ["lesson-join-in-picnic-dolly-yes-please", "picnic-dolly-yes-please", "Yes, please!"],
  ["lesson-join-in-bedtime-dolly-sleepy", "bedtime-dolly-sleepy", "I'm sleepy."],
  ["lesson-join-in-bedtime-dolly-good-night", "bedtime-dolly-good-night", "Good night!"],
].map(([id, sourceAudioId, text]) => [text, { id, sourceAudioId, text }]));

/** @type {Record<string, StaticAudioLine>} */
const EXISTING_STATIC_AUDIO_LINES = {
  "learner-profile-v2-name": {
    speaker: "peppa",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/learner-profile-v2-name.mp3`,
    text: "Hi! I'm Peppa. What's your name?",
    style: "character",
    voiceStyle: "energetic-character",
    ttsText: "[bright and friendly] Hi! I'm Peppa. What's your name?",
  },
  "learner-profile-v2-age": {
    speaker: "peppa",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/learner-profile-v2-age.mp3`,
    text: "How old are you?",
    style: "character",
    voiceStyle: "energetic-character",
    ttsText: "[curious and cheerful] How old are you?",
  },
  "learner-profile-v2-cartoons": {
    speaker: "peppa",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/learner-profile-v2-cartoons.mp3`,
    text: "What cartoons do you like?",
    style: "character",
    voiceStyle: "energetic-character",
    ttsText: "[excited and curious] What cartoons do you like?",
  },
  "learner-profile-v2-animals": {
    speaker: "peppa",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/learner-profile-v2-animals.mp3`,
    text: "What animals do you like?",
    style: "character",
    voiceStyle: "energetic-character",
    ttsText: "[playfully curious] What animals do you like?",
  },
  "learner-profile-v2-fun": {
    speaker: "peppa",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/learner-profile-v2-fun.mp3`,
    text: "What do you like doing for fun?",
    style: "character",
    voiceStyle: "energetic-character",
    ttsText: "[bright and interested] What do you like doing for fun?",
  },
  "learner-profile-v2-stories": {
    speaker: "peppa",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/learner-profile-v2-stories.mp3`,
    text: "What kind of stories do you like?",
    style: "character",
    voiceStyle: "energetic-character",
    ttsText: "[warm and imaginative] What kind of stories do you like?",
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
  "narrator-feedback-success": {
    speaker: "narrator",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/narrator-feedback-success.mp3`,
    text: "Great job!",
  },
  "narrator-feedback-retry": {
    speaker: "narrator",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/narrator-feedback-retry.mp3`,
    text: "Almost! Try again.",
  },
  "narrator-feedback-continue": {
    speaker: "narrator",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/narrator-feedback-continue.mp3`,
    text: "Almost! Let's keep going.",
  },
  "narrator-feedback-no-speech-continue": {
    speaker: "narrator",
    lang: "en-US",
    src: `${STATIC_AUDIO_BASE_PATH}/narrator-no-speech-continue.mp3`,
    text: "I couldn't hear that. Let's keep going.",
  },
  ...DUB_GUIDE_AUDIO_LINES,
  ...LESSON_AUDIO_LINES,
  ...STORY_AUDIO_LINES,
};

export const STATIC_AUDIO_LINES = mergeStaticAudioLineGroups(
  EXISTING_STATIC_AUDIO_LINES,
  WORD_GAME_AUDIO_LINES,
);

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

/**
 * @param {string} id
 * @returns {StaticAudioLine & { id: string }}
 */
export function getStaticAudioLineById(id) {
  const line = STATIC_AUDIO_LINES[id];
  if (!line) throw new Error(`Missing saved audio ID: ${id}`);
  return { id, ...line };
}
