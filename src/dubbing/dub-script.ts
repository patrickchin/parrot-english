export const DUB_ID = "five-little-ducks-v1" as const;
export const DUB_ROUTE = "/dubs/five-little-ducks" as const;
export const DUB_DURATION_MS = 56_000;
export const DUB_RECORDING_MS = 6_000;

export type DubVisualBeat =
  | "five-enter" | "hill" | "frog" | "four-splash" | "reeds"
  | "lily-circle" | "one-calls" | "mama-calls" | "five-return";

export type DubLine = {
  cueMs: number;
  duckCount: number;
  id: `line-${number}`;
  text: string;
  visualBeat: DubVisualBeat;
};

const texts = [
  "Five little ducks went out to play.",
  "Over the hill and far away.",
  "One found a frog and stopped to say, “Hello!”",
  "Four little ducks came splashing back.",
  "Three little ducks raced through the reeds.",
  "Two little ducks twirled round and round.",
  "One little duck called, “Quack, quack, quack!”",
  "Mama duck called, “Come home, my friends!”",
  "Five happy ducks came swimming back.",
] as const;
const beats: DubVisualBeat[] = ["five-enter", "hill", "frog", "four-splash", "reeds", "lily-circle", "one-calls", "mama-calls", "five-return"];
const counts = [5, 5, 4, 4, 3, 2, 1, 1, 5];

export const DUB_LINES: readonly DubLine[] = texts.map((text, index) => ({
  cueMs: 800 + index * 6_000,
  duckCount: counts[index],
  id: `line-${index + 1}`,
  text,
  visualBeat: beats[index],
}));

export function getDubLineAtElapsed(elapsedMs: number): DubLine {
  return [...DUB_LINES].reverse().find(({ cueMs }) => elapsedMs >= cueMs) ?? DUB_LINES[0];
}
