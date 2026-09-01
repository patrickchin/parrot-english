export const englishGuardianMessages = {
  language: {
    controlLabel: "Guardian guidance language",
    englishOption: "English",
    chineseOption: "中文",
  },
  common: {
    cancel: "Cancel",
    retry: "Try again",
    back: "Back",
    save: "Save",
    saving: "Saving…",
  },
  learnerBoundary: {
    grownUpAccessHelper: "",
    guardianAccessErrorHelper: "",
    switchToLearnerHelper: "",
    chooseLearnerTitleHelper: "",
    chooseLearnerBodyHelper: "",
    savedAnswersHelper: "",
    recordingPermissionHelper: "",
    recordingCautionHelper: "",
  },
} as const;

type WidenMessages<T> = T extends (...args: infer Args) => string
  ? (...args: Args) => string
  : T extends string
    ? string
    : { readonly [Key in keyof T]: WidenMessages<T[Key]> };

export type GuardianMessages = WidenMessages<typeof englishGuardianMessages>;
