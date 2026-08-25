export const TALK_TO_PEPPA_PROMPT_STYLES = [
  "tiny-turns",
  "gentle-guide",
  "playful-pal",
] as const;

export type TalkToPeppaPromptStyle =
  (typeof TALK_TO_PEPPA_PROMPT_STYLES)[number];

export const DEFAULT_TALK_TO_PEPPA_PROMPT_STYLE: TalkToPeppaPromptStyle =
  "tiny-turns";

export function isTalkToPeppaPromptStyle(
  value: unknown,
): value is TalkToPeppaPromptStyle {
  return TALK_TO_PEPPA_PROMPT_STYLES.some((style) => style === value);
}
