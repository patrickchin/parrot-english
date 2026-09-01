import type { GuardianMessages } from "./en";

export const chineseGuardianMessages = {
  language: {
    controlLabel: "家长指导语言",
    englishOption: "English",
    chineseOption: "中文",
  },
  common: {
    cancel: "取消",
    retry: "重试",
    back: "返回",
    save: "保存",
    saving: "正在保存…",
  },
  learnerBoundary: {
    grownUpAccessHelper: "家长入口",
    guardianAccessErrorHelper: "请让家长重试。",
    switchToLearnerHelper: "请家长切换到学习模式后继续。",
    chooseLearnerTitleHelper: "请家长先选择一位孩子",
    chooseLearnerBodyHelper: "家长可以进入家长模式，选择正在学习的孩子后再返回。",
    savedAnswersHelper: "我们会保存你的回答，家长可以修改你的姓名和年龄。",
    recordingPermissionHelper: "请让家长开启麦克风权限，然后重试。",
    recordingCautionHelper: "录音前请先征得家长同意。",
  },
} as const satisfies GuardianMessages;
