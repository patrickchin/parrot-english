import assert from "node:assert/strict";
import { describe, it } from "node:test";
import snapshot from "./fixtures/nursery-rhyme-runtime-snapshot.json" with { type: "json" };
import {
  DUB_DEFINITIONS,
  HUMPTY_DUMPTY_DUB,
  MARY_HAD_A_LITTLE_LAMB_DUB,
  OLD_MACDONALD_DUB,
  ROW_ROW_ROW_YOUR_BOAT_DUB,
  TWINKLE_TWINKLE_DUB,
  getDubLineMusicPhrase,
  getDubDefinition,
} from "../src/dubbing/rhyme-catalog.ts";
import { FIVE_LITTLE_DUCKS_DUB } from "../src/dubbing/dub-script.ts";
import {
  FIVE_LITTLE_DUCKS_SCENE_ARTWORK,
  HUMPTY_DUMPTY_LINE_ARTWORK,
  HUMPTY_DUMPTY_SCENE_ARTWORK,
  MARY_HAD_A_LITTLE_LAMB_SCENE_ARTWORK,
  NURSERY_RHYMES_COVER_ARTWORK,
  OLD_MACDONALD_SCENE_ARTWORK,
  ROW_ROW_ROW_YOUR_BOAT_LINE_ARTWORK,
  ROW_ROW_ROW_YOUR_BOAT_SCENE_ARTWORK,
  TWINKLE_TWINKLE_SCENE_ARTWORK,
} from "../src/dubbing/dub-artwork.ts";

function normalizeLegacyScore(definition) {
  const firstCueMs = definition.lines[0].cueMs;
  const events = definition.lines.flatMap((line) => {
    const phrase = getDubLineMusicPhrase(definition, line);
    const phraseAtMs = line.cueMs - firstCueMs;
    return [
      {
        role: "accompaniment",
        midi: phrase.bassMidi,
        atMs: phraseAtMs,
        durationMs: Math.min(1_600, phrase.durationMs),
      },
      ...phrase.notes.map(({ midi, atMs, durationMs }) => ({
        role: "melody",
        midi,
        atMs: phraseAtMs + atMs,
        durationMs,
      })),
    ];
  });
  const finalLine = definition.lines.at(-1);
  const finalPhrase = getDubLineMusicPhrase(definition, finalLine);
  const outroAtMs = finalLine.cueMs - firstCueMs + finalPhrase.durationMs;
  const outroDurationMs = definition.durationMs - firstCueMs - outroAtMs;
  if (outroDurationMs > 0) {
    events.push(...definition.music.outroMidi.map((midi) => ({
      role: "accompaniment",
      midi,
      atMs: outroAtMs,
      durationMs: outroDurationMs,
    })));
  }
  return events.sort((left, right) =>
    left.atMs - right.atMs
    || left.role.localeCompare(right.role)
    || left.midi - right.midi
    || left.durationMs - right.durationMs);
}

function catalogContract(definitions) {
  return definitions.map((definition) => ({
    id: definition.id,
    route: definition.route,
    title: definition.title,
    countInMidi: definition.countInMidi ?? definition.music.countIn[0].midi,
    musicVolume: definition.music.volume,
    phraseDurationsMs: definition.music.linePhrases.map(({ durationMs }) => durationMs),
    linesPerScene: definition.linesPerScene,
    sceneTitles: definition.sceneTitles,
    sceneArtwork: definition.sceneArtwork,
    lineArtwork: definition.lineArtwork ?? null,
    lines: definition.lines.map(({ id, text }) => ({ id, text })),
    relativeCuesMs: definition.lines.map(({ cueMs }) => cueMs - definition.lines[0].cueMs),
    durationAfterLeadInMs: definition.durationMs - definition.lines[0].cueMs,
    normalizedScore: normalizeLegacyScore(definition),
  }));
}

const NEW_RHYMES = [
  {
    definition: TWINKLE_TWINKLE_DUB,
    durationMs: 26_000,
    id: "twinkle-twinkle-v1",
    linesPerScene: 2,
    route: "/dubs/twinkle-twinkle",
    sceneCount: 3,
    texts: [
      "Twinkle, twinkle, little star,",
      "How I wonder what you are!",
      "Up above the world so high,",
      "Like a diamond in the sky.",
      "Twinkle, twinkle, little star,",
      "How I wonder what you are!",
    ],
    title: "Twinkle Twinkle Little Star",
  },
  {
    definition: ROW_ROW_ROW_YOUR_BOAT_DUB,
    durationMs: 18_000,
    id: "row-row-row-your-boat-v1",
    linesPerScene: 4,
    route: "/dubs/row-row-row-your-boat",
    sceneCount: 1,
    texts: [
      "Row, row, row your boat,",
      "Gently down the stream.",
      "Merrily, merrily, merrily, merrily,",
      "Life is but a dream.",
    ],
    title: "Row Row Row Your Boat",
  },
  {
    definition: MARY_HAD_A_LITTLE_LAMB_DUB,
    durationMs: 34_000,
    id: "mary-had-a-little-lamb-v1",
    linesPerScene: 4,
    route: "/dubs/mary-had-a-little-lamb",
    sceneCount: 2,
    texts: [
      "Mary had a little lamb,",
      "Little lamb, little lamb,",
      "Mary had a little lamb,",
      "Its fleece was white as snow.",
      "Everywhere that Mary went,",
      "Mary went, Mary went,",
      "Everywhere that Mary went,",
      "The lamb was sure to go.",
    ],
    title: "Mary Had a Little Lamb",
  },
  {
    definition: HUMPTY_DUMPTY_DUB,
    durationMs: 18_000,
    id: "humpty-dumpty-v1",
    linesPerScene: 4,
    route: "/dubs/humpty-dumpty",
    sceneCount: 1,
    texts: [
      "Humpty Dumpty sat on a wall,",
      "Humpty Dumpty had a great fall.",
      "All the king’s horses and all the king’s men",
      "Couldn’t put Humpty together again.",
    ],
    title: "Humpty Dumpty",
  },
];

describe("rhyme catalog", () => {
  it("preserves the deployed nursery-rhyme runtime contract", () => {
    assert.deepEqual(catalogContract(DUB_DEFINITIONS), snapshot.catalog);
  });

  it("contains the traditional five-scene Old MacDonald definition", () => {
    assert.equal(getDubDefinition("old-macdonald-v1"), OLD_MACDONALD_DUB);
    assert.equal(OLD_MACDONALD_DUB.route, "/dubs/old-macdonald");
    assert.equal(OLD_MACDONALD_DUB.lines.length, 35);
    assert.equal(OLD_MACDONALD_DUB.linesPerScene, 7);
    assert.deepEqual(OLD_MACDONALD_DUB.sceneTitles, [
      "Cows on the farm",
      "Ducks on the farm",
      "Pigs on the farm",
      "A dog on the farm",
      "Sheep on the farm",
    ]);
    assert.deepEqual(
      Array.from({ length: 5 }, (_, sceneIndex) =>
        OLD_MACDONALD_DUB.lines
          .slice(sceneIndex * 7, sceneIndex * 7 + 7)
          .map(({ text }) => text),
      ),
      [
        [
          "Old MacDonald had a farm, E-I-E-I-O!",
          "And on his farm he had some cows, E-I-E-I-O!",
          "With a moo-moo here",
          "And a moo-moo there",
          "Here a moo, there a moo",
          "Everywhere a moo-moo",
          "Old MacDonald had a farm, E-I-E-I-O!",
        ],
        [
          "Old MacDonald had a farm, E-I-E-I-O!",
          "And on his farm he had some ducks, E-I-E-I-O!",
          "With a quack-quack here",
          "And a quack-quack there",
          "Here a quack, there a quack",
          "Everywhere a quack-quack",
          "Old MacDonald had a farm, E-I-E-I-O!",
        ],
        [
          "Old MacDonald had a farm, E-I-E-I-O!",
          "And on his farm he had some pigs, E-I-E-I-O!",
          "With a snort here",
          "And a snort there",
          "Here a snort, there a snort",
          "Everywhere a snort-snort",
          "Old MacDonald had a farm, E-I-E-I-O!",
        ],
        [
          "Old MacDonald had a farm, E-I-E-I-O!",
          "And on his farm he had a dog, E-I-E-I-O!",
          "With a woof-woof here",
          "And a woof-woof there",
          "Here a woof, there a woof",
          "Everywhere a woof-woof",
          "Old MacDonald had a farm, E-I-E-I-O!",
        ],
        [
          "Old MacDonald had a farm, E-I-E-I-O!",
          "And on his farm he had some sheep, E-I-E-I-O!",
          "With a baa-baa here",
          "And a baa-baa there",
          "Here a baa, there a baa",
          "Everywhere a baa-baa",
          "Old MacDonald had a farm, E-I-E-I-O!",
        ],
      ],
    );
  });

  it("freezes definitions and rejects unknown IDs", () => {
    assert.equal(Object.isFrozen(OLD_MACDONALD_DUB.lines), true);
    assert.equal(Object.isFrozen(OLD_MACDONALD_DUB.lines[0]), true);
    assert.throws(() => getDubDefinition("missing"), /Unknown dub/);
    assert.equal(DUB_DEFINITIONS.length, 6);
  });

  it("contains four additional famous public-domain rhymes", () => {
    for (const expected of NEW_RHYMES) {
      const { definition } = expected;
      assert.equal(getDubDefinition(expected.id), definition);
      assert.equal(definition.id, expected.id);
      assert.equal(definition.route, expected.route);
      assert.equal(definition.title, expected.title);
      assert.equal(definition.durationMs, expected.durationMs);
      assert.equal(definition.finalCueTailMs, 5_200);
      assert.equal(definition.linesPerScene, expected.linesPerScene);
      assert.equal(definition.sceneArtwork.length, expected.sceneCount);
      assert.equal(definition.sceneTitles.length, expected.sceneCount);
      assert.deepEqual(definition.lines.map(({ text }) => text), expected.texts);
      assert.deepEqual(
        definition.lines.map(({ cueMs }) => cueMs),
        expected.texts.map((_, index) => 800 + index * 4_000),
      );
      assert.ok(definition.lines.every(({ id }, index) =>
        id === `${expected.id}-line-${index + 1}`));
      assert.equal(Object.isFrozen(definition), true);
      assert.equal(Object.isFrozen(definition.lines), true);
      assert.ok(definition.lines.every(Object.isFrozen));
    }
  });

  it("keeps short-rhyme recording scenes independent from line artwork", () => {
    for (const definition of [
      ROW_ROW_ROW_YOUR_BOAT_DUB,
      HUMPTY_DUMPTY_DUB,
    ]) {
      assert.equal(definition.linesPerScene, 4);
      assert.equal(definition.sceneArtwork.length, 1);
      assert.equal(definition.sceneTitles.length, 1);
      assert.equal(definition.lineArtwork?.length, 4);
      assert.equal(
        new Set(definition.lineArtwork.map(({ src }) => src)).size,
        4,
      );
    }
  });

  it("aligns every Old MacDonald scene to its traditional musical phrases", () => {
    assert.equal(OLD_MACDONALD_DUB.durationMs, 162_000);
    assert.equal(OLD_MACDONALD_DUB.finalCueTailMs, 9_200);
    assert.deepEqual(
      OLD_MACDONALD_DUB.lines.slice(0, 7).map(({ cueMs }) => cueMs - 800),
      [0, 8_000, 16_000, 18_000, 20_000, 22_000, 24_000],
    );
    assert.deepEqual(
      Array.from({ length: 5 }, (_, sceneIndex) =>
        OLD_MACDONALD_DUB.lines[sceneIndex * 7].cueMs),
      [800, 32_800, 64_800, 96_800, 128_800],
    );
  });

  it("resolves every canonical line to its one authored recording phrase", () => {
    assert.deepEqual(
      OLD_MACDONALD_DUB.lines.map((line) =>
        getDubLineMusicPhrase(OLD_MACDONALD_DUB, line).durationMs),
      [
        8_000, 8_000, 2_000, 2_000, 2_000, 2_000, 8_000,
        8_000, 8_000, 2_000, 2_000, 2_000, 2_000, 8_000,
        8_000, 8_000, 2_000, 2_000, 2_000, 2_000, 8_000,
        8_000, 8_000, 2_000, 2_000, 2_000, 2_000, 8_000,
        8_000, 8_000, 2_000, 2_000, 2_000, 2_000, 8_000,
      ],
    );

    for (const definition of DUB_DEFINITIONS) {
      assert.equal("recordingMs" in definition, false);
      for (const line of definition.lines) {
        const phrase = getDubLineMusicPhrase(definition, line);
        assert.ok(definition.music.linePhrases.includes(phrase));
      }
    }

    assert.throws(
      () => getDubLineMusicPhrase(TWINKLE_TWINKLE_DUB, { ...TWINKLE_TWINKLE_DUB.lines[0] }),
      /canonical dub line/,
    );
    assert.throws(
      () => getDubLineMusicPhrase({
        ...TWINKLE_TWINKLE_DUB,
        music: {
          ...TWINKLE_TWINKLE_DUB.music,
          linePhrases: TWINKLE_TWINKLE_DUB.music.linePhrases.slice(0, 1),
        },
      }, TWINKLE_TWINKLE_DUB.lines[0]),
      /one phrase per line or scene line/,
    );
  });

  it("owns one deeply immutable, bounded repeating or whole-song score", () => {
    for (const definition of DUB_DEFINITIONS) {
      assert.ok(
        definition.music.linePhrases.length === definition.linesPerScene
          || definition.music.linePhrases.length === definition.lines.length,
      );
      assert.equal(Object.isFrozen(definition.music), true);
      assert.equal(Object.isFrozen(definition.music.countIn), true);
      assert.equal(Object.isFrozen(definition.music.linePhrases), true);
      assert.equal(Object.isFrozen(definition.music.outroMidi), true);
      assert.ok(definition.music.volume > 0 && definition.music.volume < 1);

      for (const phrase of definition.music.linePhrases) {
        assert.equal(Object.isFrozen(phrase), true);
        assert.equal(Object.isFrozen(phrase.notes), true);
        assert.ok(phrase.durationMs > 0);
        assert.ok(phrase.notes.length > 0);
        for (const note of phrase.notes) {
          assert.equal(Object.isFrozen(note), true);
          assert.ok(note.atMs >= 0);
          assert.ok(note.durationMs > 0);
          assert.ok(note.atMs + note.durationMs <= phrase.durationMs);
          assert.ok(Number.isInteger(note.midi));
        }
      }
    }

    assert.deepEqual(
      FIVE_LITTLE_DUCKS_DUB.music.linePhrases.map(({ durationMs }) => durationMs),
      [4_000, 4_000, 4_000, 4_000],
    );
    assert.deepEqual(
      OLD_MACDONALD_DUB.music.linePhrases.map(({ durationMs }) => durationMs),
      [8_000, 8_000, 2_000, 2_000, 2_000, 2_000, 8_000],
    );
    assert.deepEqual(
      TWINKLE_TWINKLE_DUB.music.linePhrases.map(({ durationMs }) => durationMs),
      [4_000, 4_000, 4_000, 4_000, 4_000, 4_000],
    );
    assert.deepEqual(
      ROW_ROW_ROW_YOUR_BOAT_DUB.music.linePhrases.map(({ durationMs }) => durationMs),
      [4_000, 4_000, 4_000, 4_000],
    );
    assert.deepEqual(
      MARY_HAD_A_LITTLE_LAMB_DUB.music.linePhrases.map(({ durationMs }) => durationMs),
      [4_000, 4_000, 4_000, 4_000],
    );
    assert.deepEqual(
      HUMPTY_DUMPTY_DUB.music.linePhrases.map(({ durationMs }) => durationMs),
      [4_000, 4_000, 4_000, 4_000],
    );
  });

  it("pins every new rhyme to its complete traditional melody", () => {
    const pitches = (definition) => definition.music.linePhrases.map(
      ({ notes }) => notes.map(({ midi }) => midi),
    );

    assert.deepEqual(pitches(TWINKLE_TWINKLE_DUB), [
      [72, 72, 79, 79, 81, 81, 79],
      [77, 77, 76, 76, 74, 74, 72],
      [79, 79, 77, 77, 76, 76, 74],
      [79, 79, 77, 77, 76, 76, 74],
      [72, 72, 79, 79, 81, 81, 79],
      [77, 77, 76, 76, 74, 74, 72],
    ]);
    assert.deepEqual(pitches(ROW_ROW_ROW_YOUR_BOAT_DUB), [
      [60, 60, 60, 62, 64],
      [64, 62, 64, 65, 67],
      [72, 72, 72, 67, 67, 67, 64, 64, 64, 60, 60, 60],
      [67, 65, 64, 62, 60],
    ]);
    assert.deepEqual(pitches(MARY_HAD_A_LITTLE_LAMB_DUB), [
      [71, 69, 67, 69, 71, 71, 71],
      [69, 69, 69, 71, 74, 74],
      [71, 69, 67, 69, 71, 71, 71],
      [69, 69, 71, 69, 67],
    ]);
    assert.deepEqual(pitches(HUMPTY_DUMPTY_DUB), [
      [74, 77, 75, 79, 77, 79, 81, 82],
      [74, 77, 75, 79, 77, 74, 70, 72],
      [74, 74, 77, 75, 75, 79, 77, 79, 81, 82],
      [74, 74, 70, 75, 75, 74, 72, 70, 69, 70],
    ]);
  });

  it("defines complete immutable generated artwork for all six rhymes", () => {
    assert.equal(FIVE_LITTLE_DUCKS_DUB.sceneArtwork, FIVE_LITTLE_DUCKS_SCENE_ARTWORK);
    assert.equal(OLD_MACDONALD_DUB.sceneArtwork, OLD_MACDONALD_SCENE_ARTWORK);
    assert.equal(TWINKLE_TWINKLE_DUB.sceneArtwork, TWINKLE_TWINKLE_SCENE_ARTWORK);
    assert.equal(ROW_ROW_ROW_YOUR_BOAT_DUB.sceneArtwork, ROW_ROW_ROW_YOUR_BOAT_SCENE_ARTWORK);
    assert.equal(ROW_ROW_ROW_YOUR_BOAT_DUB.lineArtwork, ROW_ROW_ROW_YOUR_BOAT_LINE_ARTWORK);
    assert.equal(MARY_HAD_A_LITTLE_LAMB_DUB.sceneArtwork, MARY_HAD_A_LITTLE_LAMB_SCENE_ARTWORK);
    assert.equal(HUMPTY_DUMPTY_DUB.sceneArtwork, HUMPTY_DUMPTY_SCENE_ARTWORK);
    assert.equal(HUMPTY_DUMPTY_DUB.lineArtwork, HUMPTY_DUMPTY_LINE_ARTWORK);
    assert.equal(FIVE_LITTLE_DUCKS_SCENE_ARTWORK.length, 6);
    assert.equal(OLD_MACDONALD_SCENE_ARTWORK.length, 5);
    assert.equal(TWINKLE_TWINKLE_SCENE_ARTWORK.length, 3);
    assert.equal(ROW_ROW_ROW_YOUR_BOAT_SCENE_ARTWORK.length, 1);
    assert.equal(ROW_ROW_ROW_YOUR_BOAT_LINE_ARTWORK.length, 4);
    assert.equal(MARY_HAD_A_LITTLE_LAMB_SCENE_ARTWORK.length, 2);
    assert.equal(HUMPTY_DUMPTY_SCENE_ARTWORK.length, 1);
    assert.equal(HUMPTY_DUMPTY_LINE_ARTWORK.length, 4);

    const artwork = [
      NURSERY_RHYMES_COVER_ARTWORK,
      ...FIVE_LITTLE_DUCKS_SCENE_ARTWORK,
      ...OLD_MACDONALD_SCENE_ARTWORK,
      ...TWINKLE_TWINKLE_SCENE_ARTWORK,
      ...ROW_ROW_ROW_YOUR_BOAT_LINE_ARTWORK,
      ...MARY_HAD_A_LITTLE_LAMB_SCENE_ARTWORK,
      ...HUMPTY_DUMPTY_LINE_ARTWORK,
    ];
    assert.equal(artwork.length, 25);
    assert.equal(new Set(artwork.map(({ src }) => src)).size, 25);
    for (const image of artwork) {
      assert.match(image.src, /^https:\/\/media\.parrotbook\.com\/assets\/v[67]\/dubbing\/.+\.webp$/);
      assert.equal(image.width, 1536);
      assert.equal(image.height, 864);
      assert.ok(image.alt.length >= 20);
      assert.equal(Object.isFrozen(image), true);
    }
    assert.equal(Object.isFrozen(FIVE_LITTLE_DUCKS_SCENE_ARTWORK), true);
    assert.equal(Object.isFrozen(OLD_MACDONALD_SCENE_ARTWORK), true);
    assert.equal(Object.isFrozen(TWINKLE_TWINKLE_SCENE_ARTWORK), true);
    assert.equal(Object.isFrozen(ROW_ROW_ROW_YOUR_BOAT_SCENE_ARTWORK), true);
    assert.equal(Object.isFrozen(ROW_ROW_ROW_YOUR_BOAT_LINE_ARTWORK), true);
    assert.equal(Object.isFrozen(MARY_HAD_A_LITTLE_LAMB_SCENE_ARTWORK), true);
    assert.equal(Object.isFrozen(HUMPTY_DUMPTY_SCENE_ARTWORK), true);
    assert.equal(Object.isFrozen(HUMPTY_DUMPTY_LINE_ARTWORK), true);
  });
});
