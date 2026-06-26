export const LESSON_STEPS = [
  {
    id: "hello",
    sceneTitleZh: "多莉打招呼",
    hostLine: "Hi, Bella! How are you?",
    parrotLine: "This is my parrot, Polly!",
    childTarget: "This is my parrot, Polly!",
    tipZh: "多莉最爱模仿佩奇，她学得有模有样，真有趣！",
    durationHintSeconds: 30,
  },
  {
    id: "cant-reach",
    sceneTitleZh: "佩奇需要帮助",
    hostLine: "Oh! I can't reach it.",
    parrotLine: "Oh! I can't reach it.",
    childTarget: "Oh! I can't reach it.",
    tipZh: "遇到困难时，可以请求别人帮忙，就像佩奇一样。",
    durationHintSeconds: 60,
  },
  {
    id: "help-please",
    sceneTitleZh: "请求帮助",
    hostLine: "Can you help me, please?",
    parrotLine: "Can you help me, please?",
    childTarget: "Can you help me, please?",
    tipZh: "说这句话时，用温柔的声音，别人更愿意帮助你。",
    durationHintSeconds: 60,
  },
  {
    id: "here-you-are",
    sceneTitleZh: "多莉来帮忙",
    hostLine: "Here you are!",
    parrotLine: "Here you are!",
    childTarget: "Here you are!",
    tipZh: "帮助别人后，可以这样把东西递过去。",
    durationHintSeconds: 40,
  },
  {
    id: "thank-you",
    sceneTitleZh: "说谢谢",
    hostLine: "Thank you!",
    parrotLine: "Thank you!",
    childTarget: "Thank you!",
    tipZh: "有礼貌的小朋友，大家都喜欢！",
    durationHintSeconds: 60,
  },
];

export function getLessonStep(index) {
  return LESSON_STEPS[Math.max(0, Math.min(index, LESSON_STEPS.length - 1))];
}
