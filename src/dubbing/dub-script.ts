import { FIVE_LITTLE_DUCKS_SCENE_ARTWORK } from "./dub-artwork.ts";

export const DUB_ID = "five-little-ducks-v2" as const;
export const DUB_ROUTE = "/dubs/five-little-ducks" as const;
export const DUB_DURATION_MS = 98_000;
export const DUB_LINES_PER_VERSE = 4;
export const DUB_RECORDING_MS = 6_000;

export type DubVisualBeat =
  | "depart" | "hill" | "mother-calls" | "return" | "none-return"
  | "sad-mother-depart" | "sad-mother-hill" | "sad-mother-calls" | "five-return";

export type DubLine = {
  readonly cueMs: number;
  readonly duckCount: number;
  readonly id: `line-${number}`;
  readonly text: string;
  readonly visualBeat: DubVisualBeat;
};

const texts = [
  "Five little ducks went out one day.",
  "Over the hill and far away.",
  "Mother duck said, “Quack, quack, quack, quack.”",
  "But only four little ducks came back.",
  "Four little ducks went out one day.",
  "Over the hill and far away.",
  "Mother duck said, “Quack, quack, quack, quack.”",
  "But only three little ducks came back.",
  "Three little ducks went out one day.",
  "Over the hill and far away.",
  "Mother duck said, “Quack, quack, quack, quack.”",
  "But only two little ducks came back.",
  "Two little ducks went out one day.",
  "Over the hill and far away.",
  "Mother duck said, “Quack, quack, quack, quack.”",
  "But only one little duck came back.",
  "One little duck went out one day.",
  "Over the hill and far away.",
  "Mother duck said, “Quack, quack, quack, quack.”",
  "But none of the five little ducks came back.",
  "Sad mother duck went out one day.",
  "Over the hill and far away.",
  "Sad mother duck said, “Quack, quack, quack, quack.”",
  "And all of the five little ducks came back.",
] as const;
const beats: readonly DubVisualBeat[] = [
  "depart", "hill", "mother-calls", "return",
  "depart", "hill", "mother-calls", "return",
  "depart", "hill", "mother-calls", "return",
  "depart", "hill", "mother-calls", "return",
  "depart", "hill", "mother-calls", "none-return",
  "sad-mother-depart", "sad-mother-hill", "sad-mother-calls", "five-return",
];
const counts = [5, 5, 0, 4, 4, 4, 0, 3, 3, 3, 0, 2, 2, 2, 0, 1, 1, 1, 0, 0, 0, 0, 0, 5];

export const DUB_LINES: readonly DubLine[] = Object.freeze(texts.map((text, index) => Object.freeze({
  cueMs: 800 + index * 4_000,
  duckCount: counts[index],
  id: `line-${index + 1}` as `line-${number}`,
  text,
  visualBeat: beats[index],
})));

export const DUB_VERSES: readonly (readonly DubLine[])[] = Object.freeze(
  Array.from(
    { length: DUB_LINES.length / DUB_LINES_PER_VERSE },
    (_, index) => Object.freeze(DUB_LINES.slice(
      index * DUB_LINES_PER_VERSE,
      (index + 1) * DUB_LINES_PER_VERSE,
    )),
  ),
);

export const DUB_SCENE_TITLES = Object.freeze([
  "Five little ducks",
  "Four little ducks",
  "Three little ducks",
  "Two little ducks",
  "One little duck",
  "Sad mother duck",
] as const);

export const FIVE_LITTLE_DUCKS_DUB = Object.freeze({
  id: DUB_ID,
  route: DUB_ROUTE,
  title: "Five Little Ducks",
  durationMs: DUB_DURATION_MS,
  finalCueTailMs: 5_200,
  recordingMs: DUB_RECORDING_MS,
  linesPerScene: DUB_LINES_PER_VERSE,
  sceneArtwork: FIVE_LITTLE_DUCKS_SCENE_ARTWORK,
  sceneTitles: DUB_SCENE_TITLES,
  lines: DUB_LINES,
  guideAudioPrefix: "five-little-ducks-v2-guide-",
  sceneKind: "ducks",
  showSceneStatusText: false,
});

export function getDubVerseLineAtElapsed(verseIndex: number, elapsedMs: number): DubLine {
  const verse = DUB_VERSES[verseIndex];
  if (!verse) throw new RangeError("Unknown dub verse.");
  const cueOffsetMs = verse[0].cueMs;
  return [...verse].reverse().find(
    ({ cueMs }) => elapsedMs >= cueMs - cueOffsetMs,
  ) ?? verse[0];
}

export function getDubLineAtElapsed(elapsedMs: number): DubLine {
  return [...DUB_LINES].reverse().find(({ cueMs }) => elapsedMs >= cueMs) ?? DUB_LINES[0];
}
