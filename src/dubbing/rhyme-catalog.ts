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
  readonly recordingMs: number;
  readonly linesPerScene: number;
  readonly sceneTitles: readonly string[];
  readonly lines: readonly DubLine[];
  readonly guideAudioPrefix: string;
  readonly sceneKind: string;
};

const OLD_ANIMALS = [
  ["cows", "some cows", "moo-moo", "Cows on the farm"],
  ["ducks", "some ducks", "quack-quack", "Ducks on the farm"],
  ["pigs", "some pigs", "oink-oink", "Pigs on the farm"],
  ["dog", "a dog", "woof-woof", "A dog on the farm"],
  ["sheep", "some sheep", "baa-baa", "Sheep on the farm"],
] as const;

const createOldLine = (
  index: number,
  text: string,
  visualBeat: DubVisualBeat,
): DubLine => Object.freeze({
  cueMs: 800 + index * 4_000,
  id: `old-macdonald-v1-line-${index + 1}`,
  text,
  visualBeat,
});

const oldMacDonaldLines = Object.freeze(
  OLD_ANIMALS.flatMap(([beat, animal, sound], sceneIndex) => {
    const start = sceneIndex * 7;
    return [
      createOldLine(start, "Old MacDonald had a farm, E-I-E-I-O!", "intro"),
      createOldLine(start + 1, `And on his farm he had ${animal}, E-I-E-I-O!`, beat),
      createOldLine(start + 2, `With a ${sound} here`, beat),
      createOldLine(start + 3, `And a ${sound} there`, beat),
      createOldLine(start + 4, `Here a ${sound.split("-")[0]}, there a ${sound.split("-")[0]}`, beat),
      createOldLine(start + 5, `Everywhere a ${sound}`, beat),
      createOldLine(start + 6, "Old MacDonald had a farm, E-I-E-I-O!", "intro"),
    ];
  }),
);

export const OLD_MACDONALD_DUB: DubDefinition = Object.freeze({
  id: "old-macdonald-v1",
  route: "/dubs/old-macdonald",
  title: "Old MacDonald Had a Farm",
  durationMs: 150_000,
  recordingMs: 6_000,
  linesPerScene: 7,
  sceneTitles: Object.freeze(OLD_ANIMALS.map(([, , , title]) => title)),
  lines: oldMacDonaldLines,
  guideAudioPrefix: "old-macdonald-v1-guide-",
  sceneKind: "farm",
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
