import type { DubArtwork } from "./dub-artwork.ts";
import type { DubMelodyNote } from "./dub-melodies.ts";
import { GENERATED_DUB_DEFINITIONS } from "./generated-rhyme-catalog.ts";

export type DubWordCue = Readonly<{
  startOffset: number;
  endOffset: number;
  atMs: number;
  durationMs: number;
}>;

export type DubPlaybackNote = DubMelodyNote & Readonly<{
  role: "melody" | "accompaniment";
}>;

export type DubMelodyPhrase = Readonly<{
  durationMs: number;
  notes: readonly DubMelodyNote[];
  playbackNotes: readonly DubPlaybackNote[];
}>;

export type DubMusicScore = Readonly<{
  countInBeatMs: number;
  countInDurationMs: number;
  linePhrases: readonly DubMelodyPhrase[];
  outroNotes: readonly DubPlaybackNote[];
  volume: number;
}>;

export type DubLine = Readonly<{
  cueMs: number;
  durationMs: number;
  guideAudioId: string;
  guideAudioSrc: string;
  guidePeakBars: readonly number[];
  id: string;
  text: string;
  words: readonly DubWordCue[];
}>;

export type DubGuide = Readonly<{
  id: string;
  src: string;
  text: string;
  durationMs: number;
}>;

export type DubDefinition = Readonly<{
  countInBeats: number;
  countInMidi: number;
  durationMs: number;
  finalCueTailMs: number;
  guides: readonly DubGuide[];
  id: string;
  lineArtwork?: readonly DubArtwork[];
  lines: readonly DubLine[];
  linesPerScene: number;
  music: DubMusicScore;
  route: string;
  sceneArtwork: readonly DubArtwork[];
  sceneTitles: readonly string[];
  title: string;
}>;

function cloneAndFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(cloneAndFreeze)) as T;
  }
  if (value !== null && typeof value === "object") {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, cloneAndFreeze(nested)]),
    )) as T;
  }
  return value;
}

function normalizeDefinition(
  generated: (typeof GENERATED_DUB_DEFINITIONS)[number],
): DubDefinition {
  const { lineArtwork, ...definition } = generated;
  return cloneAndFreeze({
    ...definition,
    ...(lineArtwork === null ? {} : { lineArtwork }),
  }) as unknown as DubDefinition;
}

export const DUB_DEFINITIONS: readonly DubDefinition[] = Object.freeze(
  GENERATED_DUB_DEFINITIONS.map(normalizeDefinition),
);

export const FIVE_LITTLE_DUCKS_DUB = DUB_DEFINITIONS[0];
export const OLD_MACDONALD_DUB = DUB_DEFINITIONS[1];
export const TWINKLE_TWINKLE_DUB = DUB_DEFINITIONS[2];
export const ROW_ROW_ROW_YOUR_BOAT_DUB = DUB_DEFINITIONS[3];
export const MARY_HAD_A_LITTLE_LAMB_DUB = DUB_DEFINITIONS[4];
export const HUMPTY_DUMPTY_DUB = DUB_DEFINITIONS[5];

export const DUB_ID = FIVE_LITTLE_DUCKS_DUB.id;
export const DUB_ROUTE = FIVE_LITTLE_DUCKS_DUB.route;
export const DUB_DURATION_MS = FIVE_LITTLE_DUCKS_DUB.durationMs;
export const DUB_LINES_PER_VERSE = FIVE_LITTLE_DUCKS_DUB.linesPerScene;
export const DUB_LINES = FIVE_LITTLE_DUCKS_DUB.lines;
export const DUB_SCENE_TITLES = FIVE_LITTLE_DUCKS_DUB.sceneTitles;

export function getDubLineMusicPhrase(
  definition: DubDefinition,
  line: DubLine,
): DubMelodyPhrase {
  const lineIndex = definition.lines.indexOf(line);
  if (lineIndex < 0) throw new TypeError("Dub music requires one canonical dub line.");
  if (definition.music.linePhrases.length !== definition.lines.length) {
    throw new TypeError("Dub music must define one phrase per line.");
  }
  return definition.music.linePhrases[lineIndex];
}

export function getDubDefinition(dubId: string): DubDefinition {
  const definition = DUB_DEFINITIONS.find(({ id }) => id === dubId);
  if (!definition) throw new RangeError(`Unknown dub: ${dubId}`);
  return definition;
}
