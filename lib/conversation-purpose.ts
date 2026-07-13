export const CONVERSATION_PURPOSES = [
  "onboarding",
  "profile-edit",
  "small-chat",
] as const;

export type ConversationPurpose = (typeof CONVERSATION_PURPOSES)[number];

export function isConversationPurpose(
  value: unknown,
): value is ConversationPurpose {
  return CONVERSATION_PURPOSES.some((purpose) => purpose === value);
}

export function updatesLearnerProfile(purpose: ConversationPurpose) {
  return purpose === "onboarding" || purpose === "profile-edit";
}

export function selectConversationPurpose({
  isProfileEdit,
  isSmallChatRoute,
}: {
  isProfileEdit: boolean;
  isSmallChatRoute: boolean;
}): ConversationPurpose {
  if (isSmallChatRoute) return "small-chat";
  return isProfileEdit ? "profile-edit" : "onboarding";
}
