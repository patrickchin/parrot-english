export type DubMelodyNote = Readonly<{
  atMs: number;
  durationMs: number;
  midi: number;
}>;

export type DubMelodyPhrase = Readonly<{
  bassMidi: number;
  durationMs: number;
  notes: readonly DubMelodyNote[];
}>;

export type DubMusicScore = Readonly<{
  countIn: readonly DubMelodyNote[];
  linePhrases: readonly DubMelodyPhrase[];
  outroMidi: readonly [number, number];
  volume: number;
}>;

type NoteTuple = readonly [midi: number, atMs: number, durationMs: number];

function note([midi, atMs, durationMs]: NoteTuple): DubMelodyNote {
  return Object.freeze({ atMs, durationMs, midi });
}

function phrase(
  durationMs: number,
  bassMidi: number,
  noteTuples: readonly NoteTuple[],
): DubMelodyPhrase {
  return Object.freeze({
    bassMidi,
    durationMs,
    notes: Object.freeze(noteTuples.map(note)),
  });
}

function score(
  countInTuples: readonly NoteTuple[],
  linePhrases: readonly DubMelodyPhrase[],
): DubMusicScore {
  return Object.freeze({
    countIn: Object.freeze(countInTuples.map(note)),
    linePhrases: Object.freeze(linePhrases),
    outroMidi: Object.freeze([48, 55] as const),
    volume: 0.12,
  });
}

// Traditional C-major notation: https://en.wikipedia.org/wiki/Five_Little_Ducks#Music
// Slowed to 120 BPM so each lyric gets one clear phrase for a young learner.
export const FIVE_LITTLE_DUCKS_MUSIC = score(
  [[72, 0, 200], [72, 400, 200]],
  [
    phrase(4_000, 48, [
      [64, 0, 500], [62, 500, 250], [62, 750, 250], [60, 1_000, 500],
      [72, 1_500, 500], [71, 2_000, 500], [69, 2_500, 500], [67, 3_000, 1_000],
    ]),
    phrase(4_000, 48, [
      [67, 0, 500], [60, 500, 250], [60, 750, 250], [65, 1_000, 500],
      [64, 1_500, 500], [64, 2_000, 500], [62, 2_500, 500], [62, 3_000, 1_000],
    ]),
    phrase(4_000, 48, [
      [64, 0, 250], [64, 250, 250], [62, 500, 500], [60, 1_000, 500],
      [72, 1_500, 500], [71, 2_000, 500], [69, 2_500, 500],
      [67, 3_000, 750], [67, 3_750, 250],
    ]),
    phrase(4_000, 43, [
      [67, 0, 500], [60, 500, 500], [65, 1_000, 500],
      [64, 1_500, 250], [64, 1_750, 250], [62, 2_000, 500],
      [62, 2_500, 500], [60, 3_000, 1_000],
    ]),
  ],
);

const OLD_MACDONALD_LONG_PHRASE = [
  [72, 0, 500], [72, 500, 500], [72, 1_000, 500], [67, 1_500, 500],
  [69, 2_000, 500], [69, 2_500, 500], [67, 3_000, 1_000],
  [76, 4_000, 500], [76, 4_500, 500], [74, 5_000, 500],
  [74, 5_500, 500], [72, 6_000, 1_500],
] as const satisfies readonly NoteTuple[];

// Public-domain score: https://commons.wikimedia.org/wiki/File:Old_MacDonad_Had_a_Farm.pdf
// Cross-check: https://tunvox.com/music-sheet/old-macdonald-had-a-farm
// The melody is raised one octave so it remains clear behind spoken voices.
export const OLD_MACDONALD_MUSIC = score(
  [[72, 0, 200], [72, 400, 200]],
  [
    phrase(8_000, 48, OLD_MACDONALD_LONG_PHRASE),
    phrase(8_000, 48, OLD_MACDONALD_LONG_PHRASE),
    phrase(2_000, 48, [[72, 0, 500], [72, 500, 500], [72, 1_000, 500]]),
    phrase(2_000, 48, [[72, 0, 500], [72, 500, 500], [72, 1_000, 500]]),
    phrase(2_000, 48, [
      [72, 0, 250], [72, 250, 250], [72, 500, 500],
      [72, 1_000, 250], [72, 1_250, 250], [72, 1_500, 500],
    ]),
    phrase(2_000, 43, [
      [72, 0, 250], [72, 250, 250], [72, 500, 250], [72, 750, 250],
      [72, 1_000, 500], [72, 1_500, 500],
    ]),
    phrase(8_000, 48, OLD_MACDONALD_LONG_PHRASE),
  ],
);

// Traditional C-major notation:
// https://en.wikipedia.org/wiki/Twinkle,_Twinkle,_Little_Star#Melody
export const TWINKLE_TWINKLE_MUSIC = score(
  [[72, 0, 200], [72, 400, 200]],
  [
    phrase(4_000, 48, [
      [72, 0, 500], [72, 500, 500], [79, 1_000, 500], [79, 1_500, 500],
      [81, 2_000, 500], [81, 2_500, 500], [79, 3_000, 1_000],
    ]),
    phrase(4_000, 48, [
      [77, 0, 500], [77, 500, 500], [76, 1_000, 500], [76, 1_500, 500],
      [74, 2_000, 500], [74, 2_500, 500], [72, 3_000, 1_000],
    ]),
    phrase(4_000, 43, [
      [79, 0, 500], [79, 500, 500], [77, 1_000, 500], [77, 1_500, 500],
      [76, 2_000, 500], [76, 2_500, 500], [74, 3_000, 1_000],
    ]),
    phrase(4_000, 43, [
      [79, 0, 500], [79, 500, 500], [77, 1_000, 500], [77, 1_500, 500],
      [76, 2_000, 500], [76, 2_500, 500], [74, 3_000, 1_000],
    ]),
    phrase(4_000, 48, [
      [72, 0, 500], [72, 500, 500], [79, 1_000, 500], [79, 1_500, 500],
      [81, 2_000, 500], [81, 2_500, 500], [79, 3_000, 1_000],
    ]),
    phrase(4_000, 48, [
      [77, 0, 500], [77, 500, 500], [76, 1_000, 500], [76, 1_500, 500],
      [74, 2_000, 500], [74, 2_500, 500], [72, 3_000, 1_000],
    ]),
  ],
);

// Traditional 6/8 notation:
// https://en.wikipedia.org/wiki/Row,_Row,_Row_Your_Boat#Music
export const ROW_ROW_ROW_YOUR_BOAT_MUSIC = score(
  [[60, 0, 200], [60, 400, 200]],
  [
    phrase(4_000, 48, [
      [60, 0, 1_000], [60, 1_000, 1_000], [60, 2_000, 667],
      [62, 2_667, 333], [64, 3_000, 1_000],
    ]),
    phrase(4_000, 48, [
      [64, 0, 667], [62, 667, 333], [64, 1_000, 667],
      [65, 1_667, 333], [67, 2_000, 2_000],
    ]),
    phrase(4_000, 48, [
      [72, 0, 333], [72, 333, 334], [72, 667, 333],
      [67, 1_000, 333], [67, 1_333, 334], [67, 1_667, 333],
      [64, 2_000, 333], [64, 2_333, 334], [64, 2_667, 333],
      [60, 3_000, 333], [60, 3_333, 334], [60, 3_667, 333],
    ]),
    phrase(4_000, 43, [
      [79, 0, 667], [77, 667, 333], [76, 1_000, 667],
      [74, 1_667, 333], [72, 2_000, 2_000],
    ]),
  ],
);

// Traditional G-major notation:
// https://en.wikipedia.org/wiki/Mary_Had_a_Little_Lamb#Musical_settings
export const MARY_HAD_A_LITTLE_LAMB_MUSIC = score(
  [[67, 0, 200], [67, 400, 200]],
  [
    phrase(4_000, 43, [
      [71, 0, 500], [69, 500, 500], [67, 1_000, 500], [69, 1_500, 500],
      [71, 2_000, 500], [71, 2_500, 500], [71, 3_000, 1_000],
    ]),
    phrase(4_000, 43, [
      [69, 0, 500], [69, 500, 500], [69, 1_000, 1_000],
      [71, 2_000, 500], [74, 2_500, 500], [74, 3_000, 1_000],
    ]),
    phrase(4_000, 43, [
      [71, 0, 500], [69, 500, 500], [67, 1_000, 500], [69, 1_500, 500],
      [71, 2_000, 500], [71, 2_500, 500], [71, 3_000, 1_000],
    ]),
    phrase(4_000, 43, [
      [69, 0, 500], [69, 500, 500], [71, 1_000, 500],
      [69, 1_500, 500], [67, 2_000, 2_000],
    ]),
  ],
);

// Traditional B-flat-major 6/8 notation, raised one octave:
// https://en.wikipedia.org/wiki/Humpty_Dumpty#Melody_and_variations
export const HUMPTY_DUMPTY_MUSIC = score(
  [[70, 0, 200], [70, 400, 200]],
  [
    phrase(4_000, 46, [
      [74, 0, 667], [77, 667, 333], [75, 1_000, 667], [79, 1_667, 333],
      [77, 2_000, 333], [79, 2_333, 334], [81, 2_667, 333], [82, 3_000, 1_000],
    ]),
    phrase(4_000, 46, [
      [74, 0, 667], [77, 667, 333], [75, 1_000, 667], [79, 1_667, 333],
      [77, 2_000, 333], [74, 2_333, 334], [70, 2_667, 333], [72, 3_000, 1_000],
    ]),
    phrase(4_000, 51, [
      [74, 0, 333], [74, 333, 334], [77, 667, 333],
      [75, 1_000, 333], [75, 1_333, 334], [79, 1_667, 333],
      [77, 2_000, 333], [79, 2_333, 334], [81, 2_667, 333], [82, 3_000, 1_000],
    ]),
    phrase(4_000, 46, [
      [74, 0, 333], [74, 333, 334], [70, 667, 333],
      [75, 1_000, 333], [75, 1_333, 334], [74, 1_667, 333],
      [72, 2_000, 333], [70, 2_333, 334], [69, 2_667, 333], [70, 3_000, 1_000],
    ]),
  ],
);
