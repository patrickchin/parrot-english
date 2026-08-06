export const TALK_TO_PEPPA_PROMPT_STYLES = [
  "tiny-turns",
  "gentle-guide",
  "playful-pal",
] as const;

export type TalkToPeppaPromptStyle =
  (typeof TALK_TO_PEPPA_PROMPT_STYLES)[number];

export const DEFAULT_TALK_TO_PEPPA_PROMPT_STYLE: TalkToPeppaPromptStyle =
  "tiny-turns";

export const TALK_TO_PEPPA_PROMPT_STYLE_OPTIONS = [
  {
    description: "The fewest words, with lots of time for you.",
    id: "tiny-turns",
    label: "Tiny turns",
  },
  {
    description: "Simple sentence help and two easy choices.",
    id: "gentle-guide",
    label: "Gentle guide",
  },
  {
    description: "Silly reactions that stay short and easy.",
    id: "playful-pal",
    label: "Playful pal",
  },
] as const satisfies readonly {
  description: string;
  id: TalkToPeppaPromptStyle;
  label: string;
}[];

export function isTalkToPeppaPromptStyle(
  value: unknown,
): value is TalkToPeppaPromptStyle {
  return TALK_TO_PEPPA_PROMPT_STYLES.some((style) => style === value);
}

export function talkToPeppaPromptStyleOption(
  style: TalkToPeppaPromptStyle,
) {
  return TALK_TO_PEPPA_PROMPT_STYLE_OPTIONS.find(
    (option) => option.id === style,
  )!;
}
