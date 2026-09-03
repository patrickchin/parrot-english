export const CONVERSATION_PURPOSES = [
  "onboarding",
  "small-chat",
] as const;

export type ConversationPurpose = (typeof CONVERSATION_PURPOSES)[number];

export function isConversationPurpose(
  value: unknown,
): value is ConversationPurpose {
  return CONVERSATION_PURPOSES.some((purpose) => purpose === value);
}
