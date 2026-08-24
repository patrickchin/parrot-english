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
    description: "Peppa says just a few words. You get lots of time.",
    id: "tiny-turns",
    label: "Tiny turns",
  },
  {
    description: "Peppa helps you say one easy sentence.",
    id: "gentle-guide",
    label: "Gentle guide",
  },
  {
    description: "Peppa is silly. Her words stay easy.",
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
