import { OLD_MACDONALD_SCENE_ARTWORK, type DubArtwork } from "./dub-artwork.ts";
import { OLD_MACDONALD_MUSIC, type DubMusicScore } from "./dub-melodies.ts";

export type DubVisualBeat =
  | "depart" | "hill" | "mother-calls" | "return" | "none-return"
  | "sad-mother-depart" | "sad-mother-hill" | "sad-mother-calls" | "five-return"
  | "intro" | "cows" | "ducks" | "pigs" | "dog" | "sheep";

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
  readonly recordingMs: number;
  readonly linesPerScene: number;
  readonly music: DubMusicScore;
  readonly sceneArtwork: readonly DubArtwork[];
  readonly sceneTitles: readonly string[];
  readonly lines: readonly DubLine[];
  readonly guideAudioPrefix: string;
};

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
  recordingMs: 6_000,
  linesPerScene: 7,
  music: OLD_MACDONALD_MUSIC,
  sceneArtwork: OLD_MACDONALD_SCENE_ARTWORK,
  sceneTitles: Object.freeze(OLD_ANIMALS.map(({ title }) => title)),
  lines: oldMacDonaldLines,
  guideAudioPrefix: "old-macdonald-v1-guide-",
});

import { FIVE_LITTLE_DUCKS_DUB } from "./dub-script.ts";

export const DUB_DEFINITIONS = Object.freeze([
  FIVE_LITTLE_DUCKS_DUB,
  OLD_MACDONALD_DUB,
]);

export function getDubDefinition(dubId: string): DubDefinition {
  const definition = DUB_DEFINITIONS.find(({ id }) => id === dubId);
  if (!definition) throw new RangeError(`Unknown dub: ${dubId}`);
  return definition;
}
