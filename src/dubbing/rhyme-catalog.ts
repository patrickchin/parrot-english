import {
  HUMPTY_DUMPTY_LINE_ARTWORK,
  HUMPTY_DUMPTY_SCENE_ARTWORK,
  MARY_HAD_A_LITTLE_LAMB_SCENE_ARTWORK,
  OLD_MACDONALD_SCENE_ARTWORK,
  ROW_ROW_ROW_YOUR_BOAT_LINE_ARTWORK,
  ROW_ROW_ROW_YOUR_BOAT_SCENE_ARTWORK,
  TWINKLE_TWINKLE_SCENE_ARTWORK,
  type DubArtwork,
} from "./dub-artwork.ts";
import {
  HUMPTY_DUMPTY_MUSIC,
  MARY_HAD_A_LITTLE_LAMB_MUSIC,
  OLD_MACDONALD_MUSIC,
  ROW_ROW_ROW_YOUR_BOAT_MUSIC,
  TWINKLE_TWINKLE_MUSIC,
  type DubMelodyPhrase,
  type DubMusicScore,
} from "./dub-melodies.ts";

export type DubVisualBeat =
  | "depart" | "hill" | "mother-calls" | "return" | "none-return"
  | "sad-mother-depart" | "sad-mother-hill" | "sad-mother-calls" | "five-return"
  | "intro" | "cows" | "ducks" | "pigs" | "dog" | "sheep"
  | "twinkle" | "wonder" | "high" | "diamond"
  | "row" | "stream" | "merrily" | "dream"
  | "mary-lamb" | "snow" | "mary-walks" | "lamb-follows"
  | "humpty-wall" | "humpty-fall" | "royal-help" | "together-again";

export type DubLine = {
  readonly cueMs: number;
  readonly id: string;
  readonly text: string;
  readonly visualBeat: DubVisualBeat;
};

export type DubDefinition = {
  readonly id: string;
  readonly route: string;
  readonly title: string;
  readonly durationMs: number;
  readonly finalCueTailMs: number;
  readonly lineArtwork?: readonly DubArtwork[];
  readonly linesPerScene: number;
  readonly music: DubMusicScore;
  readonly sceneArtwork: readonly DubArtwork[];
  readonly sceneTitles: readonly string[];
  readonly lines: readonly DubLine[];
};

export function getDubLineMusicPhrase(
  definition: DubDefinition,
  line: DubLine,
): DubMelodyPhrase {
  const lineIndex = definition.lines.indexOf(line);
  if (lineIndex < 0) throw new TypeError("Dub music requires one canonical dub line.");

  const phraseCount = definition.music.linePhrases.length;
  const phraseIndex = phraseCount === definition.lines.length
    ? lineIndex
    : phraseCount === definition.linesPerScene
      ? lineIndex % definition.linesPerScene
      : -1;
  if (phraseIndex < 0) {
    throw new TypeError("Dub music must define one phrase per line or scene line.");
  }

  const phrase = definition.music.linePhrases[phraseIndex];
  if (!phrase) {
    throw new TypeError("Dub music must define one phrase per line or scene line.");
  }
  return phrase;
}

const OLD_ANIMALS = [
  { animal: "some cows", beat: "cows", sounds: ["moo-moo", "moo-moo", "moo", "moo-moo"], title: "Cows on the farm" },
  { animal: "some ducks", beat: "ducks", sounds: ["quack-quack", "quack-quack", "quack", "quack-quack"], title: "Ducks on the farm" },
  { animal: "some pigs", beat: "pigs", sounds: ["snort", "snort", "snort", "snort-snort"], title: "Pigs on the farm" },
  { animal: "a dog", beat: "dog", sounds: ["woof-woof", "woof-woof", "woof", "woof-woof"], title: "A dog on the farm" },
  { animal: "some sheep", beat: "sheep", sounds: ["baa-baa", "baa-baa", "baa", "baa-baa"], title: "Sheep on the farm" },
] as const;
const OLD_MACDONALD_CUE_OFFSETS = Object.freeze([
  0, 8_000, 16_000, 18_000, 20_000, 22_000, 24_000,
] as const);

const createOldLine = (
  index: number,
  text: string,
  visualBeat: DubVisualBeat,
): DubLine => Object.freeze({
  cueMs: 800
    + Math.floor(index / OLD_MACDONALD_CUE_OFFSETS.length) * 32_000
    + OLD_MACDONALD_CUE_OFFSETS[index % OLD_MACDONALD_CUE_OFFSETS.length],
  id: `old-macdonald-v1-line-${index + 1}`,
  text,
  visualBeat,
});

const oldMacDonaldLines = Object.freeze(
  OLD_ANIMALS.flatMap(({ animal, beat, sounds }, sceneIndex) => {
    const start = sceneIndex * 7;
    return [
      createOldLine(start, "Old MacDonald had a farm, E-I-E-I-O!", "intro"),
      createOldLine(start + 1, `And on his farm he had ${animal}, E-I-E-I-O!`, beat),
      createOldLine(start + 2, `With a ${sounds[0]} here`, beat),
      createOldLine(start + 3, `And a ${sounds[1]} there`, beat),
      createOldLine(start + 4, `Here a ${sounds[2]}, there a ${sounds[2]}`, beat),
      createOldLine(start + 5, `Everywhere a ${sounds[3]}`, beat),
      createOldLine(start + 6, "Old MacDonald had a farm, E-I-E-I-O!", "intro"),
    ];
  }),
);

export const OLD_MACDONALD_DUB: DubDefinition = Object.freeze({
  id: "old-macdonald-v1",
  route: "/dubs/old-macdonald",
  title: "Old MacDonald Had a Farm",
  durationMs: 162_000,
  finalCueTailMs: 9_200,
  linesPerScene: 7,
  music: OLD_MACDONALD_MUSIC,
  sceneArtwork: OLD_MACDONALD_SCENE_ARTWORK,
  sceneTitles: Object.freeze(OLD_ANIMALS.map(({ title }) => title)),
  lines: oldMacDonaldLines,
});

function createTimedLines(
  id: string,
  intervalMs: number,
  texts: readonly string[],
  beats: readonly DubVisualBeat[],
) {
  return Object.freeze(texts.map((text, index): DubLine => Object.freeze({
    cueMs: 800 + index * intervalMs,
    id: `${id}-line-${index + 1}`,
    text,
    visualBeat: beats[index],
  })));
}

const twinkleLines = createTimedLines(
  "twinkle-twinkle-v1",
  4_000,
  [
    "Twinkle, twinkle, little star,",
    "How I wonder what you are!",
    "Up above the world so high,",
    "Like a diamond in the sky.",
    "Twinkle, twinkle, little star,",
    "How I wonder what you are!",
  ],
  ["twinkle", "wonder", "high", "diamond", "twinkle", "wonder"],
);

export const TWINKLE_TWINKLE_DUB: DubDefinition = Object.freeze({
  id: "twinkle-twinkle-v1",
  route: "/dubs/twinkle-twinkle",
  title: "Twinkle Twinkle Little Star",
  durationMs: 26_000,
  finalCueTailMs: 5_200,
  linesPerScene: 2,
  music: TWINKLE_TWINKLE_MUSIC,
  sceneArtwork: TWINKLE_TWINKLE_SCENE_ARTWORK,
  sceneTitles: Object.freeze(["A little star", "High above the world", "A diamond in the sky"]),
  lines: twinkleLines,
});

const rowLines = createTimedLines(
  "row-row-row-your-boat-v1",
  4_000,
  [
    "Row, row, row your boat,",
    "Gently down the stream.",
    "Merrily, merrily, merrily, merrily,",
    "Life is but a dream.",
  ],
  ["row", "stream", "merrily", "dream"],
);

export const ROW_ROW_ROW_YOUR_BOAT_DUB: DubDefinition = Object.freeze({
  id: "row-row-row-your-boat-v1",
  route: "/dubs/row-row-row-your-boat",
  title: "Row Row Row Your Boat",
  durationMs: 18_000,
  finalCueTailMs: 5_200,
  lineArtwork: ROW_ROW_ROW_YOUR_BOAT_LINE_ARTWORK,
  linesPerScene: 4,
  music: ROW_ROW_ROW_YOUR_BOAT_MUSIC,
  sceneArtwork: ROW_ROW_ROW_YOUR_BOAT_SCENE_ARTWORK,
  sceneTitles: Object.freeze(["Row the boat"]),
  lines: rowLines,
});

const maryLines = createTimedLines(
  "mary-had-a-little-lamb-v1",
  4_000,
  [
    "Mary had a little lamb,",
    "Little lamb, little lamb,",
    "Mary had a little lamb,",
    "Its fleece was white as snow.",
    "Everywhere that Mary went,",
    "Mary went, Mary went,",
    "Everywhere that Mary went,",
    "The lamb was sure to go.",
  ],
  [
    "mary-lamb", "mary-lamb", "mary-lamb", "snow",
    "mary-walks", "mary-walks", "mary-walks", "lamb-follows",
  ],
);

export const MARY_HAD_A_LITTLE_LAMB_DUB: DubDefinition = Object.freeze({
  id: "mary-had-a-little-lamb-v1",
  route: "/dubs/mary-had-a-little-lamb",
  title: "Mary Had a Little Lamb",
  durationMs: 34_000,
  finalCueTailMs: 5_200,
  linesPerScene: 4,
  music: MARY_HAD_A_LITTLE_LAMB_MUSIC,
  sceneArtwork: MARY_HAD_A_LITTLE_LAMB_SCENE_ARTWORK,
  sceneTitles: Object.freeze(["Mary and her lamb", "The lamb follows Mary"]),
  lines: maryLines,
});

const humptyLines = createTimedLines(
  "humpty-dumpty-v1",
  4_000,
  [
    "Humpty Dumpty sat on a wall,",
    "Humpty Dumpty had a great fall.",
    "All the king’s horses and all the king’s men",
    "Couldn’t put Humpty together again.",
  ],
  ["humpty-wall", "humpty-fall", "royal-help", "together-again"],
);

export const HUMPTY_DUMPTY_DUB: DubDefinition = Object.freeze({
  id: "humpty-dumpty-v1",
  route: "/dubs/humpty-dumpty",
  title: "Humpty Dumpty",
  durationMs: 18_000,
  finalCueTailMs: 5_200,
  lineArtwork: HUMPTY_DUMPTY_LINE_ARTWORK,
  linesPerScene: 4,
  music: HUMPTY_DUMPTY_MUSIC,
  sceneArtwork: HUMPTY_DUMPTY_SCENE_ARTWORK,
  sceneTitles: Object.freeze(["Humpty Dumpty"]),
  lines: humptyLines,
});

import { FIVE_LITTLE_DUCKS_DUB } from "./dub-script.ts";

export const DUB_DEFINITIONS = Object.freeze([
  FIVE_LITTLE_DUCKS_DUB,
  OLD_MACDONALD_DUB,
  TWINKLE_TWINKLE_DUB,
  ROW_ROW_ROW_YOUR_BOAT_DUB,
  MARY_HAD_A_LITTLE_LAMB_DUB,
  HUMPTY_DUMPTY_DUB,
]);

export function getDubDefinition(dubId: string): DubDefinition {
  const definition = DUB_DEFINITIONS.find(({ id }) => id === dubId);
  if (!definition) throw new RangeError(`Unknown dub: ${dubId}`);
  return definition;
}
