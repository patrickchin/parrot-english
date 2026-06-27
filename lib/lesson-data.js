// @ts-check

/**
 * @typedef {object} LessonStep
 * @property {string} id
 * @property {string} sceneTitleZh
 * @property {string} exampleLine
 * @property {string} parrotPromptZh
 * @property {string} childTarget
 * @property {string} tipZh
 * @property {number} durationHintSeconds
 */

/** @type {LessonStep[]} */
export const LESSON_STEPS = [
  {
    id: "hello",
    sceneTitleZh: "多莉打招呼",
    exampleLine: "Hi, Bella! How are you?",
    parrotPromptZh: "轮到你了，跟着佩奇说。",
    childTarget: "Hi, Bella! How are you?",
    tipZh: "先听佩奇打招呼，再跟着说。",
    durationHintSeconds: 30,
  },
  {
    id: "cant-reach",
    sceneTitleZh: "佩奇需要帮助",
    exampleLine: "Oh! I can't reach it.",
    parrotPromptZh: "轮到你了，跟着佩奇说。",
    childTarget: "Oh! I can't reach it.",
    tipZh: "遇到困难时，可以请求别人帮忙，就像佩奇一样。",
    durationHintSeconds: 60,
  },
  {
    id: "help-please",
    sceneTitleZh: "请求帮助",
    exampleLine: "Can you help me, please?",
    parrotPromptZh: "轮到你了，跟着佩奇说。",
    childTarget: "Can you help me, please?",
    tipZh: "说这句话时，用温柔的声音，别人更愿意帮助你。",
    durationHintSeconds: 60,
  },
  {
    id: "here-you-are",
    sceneTitleZh: "多莉来帮忙",
    exampleLine: "Here you are!",
    parrotPromptZh: "轮到你了，跟着佩奇说。",
    childTarget: "Here you are!",
    tipZh: "帮助别人后，可以这样把东西递过去。",
    durationHintSeconds: 40,
  },
  {
    id: "thank-you",
    sceneTitleZh: "说谢谢",
    exampleLine: "Thank you!",
    parrotPromptZh: "轮到你了，跟着佩奇说。",
    childTarget: "Thank you!",
    tipZh: "有礼貌的小朋友，大家都喜欢！",
    durationHintSeconds: 60,
  },
];

/**
 * @param {number} index
 * @returns {LessonStep}
 */
export function getLessonStep(index) {
  return LESSON_STEPS[Math.max(0, Math.min(index, LESSON_STEPS.length - 1))];
}
