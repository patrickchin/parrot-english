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
  readonly showSceneStatusText: boolean;
};

const OLD_ANIMALS = [
  { animal: "some cows", beat: "cows", sounds: ["moo-moo", "moo-moo", "moo", "moo-moo"], title: "Cows on the farm" },
  { animal: "some ducks", beat: "ducks", sounds: ["quack-quack", "quack-quack", "quack", "quack-quack"], title: "Ducks on the farm" },
  { animal: "some pigs", beat: "pigs", sounds: ["snort", "snort", "snort", "snort-snort"], title: "Pigs on the farm" },
  { animal: "a dog", beat: "dog", sounds: ["woof-woof", "woof-woof", "woof", "woof-woof"], title: "A dog on the farm" },
  { animal: "some sheep", beat: "sheep", sounds: ["baa-baa", "baa-baa", "baa", "baa-baa"], title: "Sheep on the farm" },
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
  durationMs: 150_000,
  recordingMs: 6_000,
  linesPerScene: 7,
  sceneTitles: Object.freeze(OLD_ANIMALS.map(({ title }) => title)),
  lines: oldMacDonaldLines,
  guideAudioPrefix: "old-macdonald-v1-guide-",
  sceneKind: "farm",
  showSceneStatusText: true,
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
