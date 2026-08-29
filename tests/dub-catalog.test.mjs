import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DUB_DEFINITIONS,
  OLD_MACDONALD_DUB,
  getDubDefinition,
} from "../src/dubbing/rhyme-catalog.ts";
import { FIVE_LITTLE_DUCKS_DUB } from "../src/dubbing/dub-script.ts";
import {
  FIVE_LITTLE_DUCKS_SCENE_ARTWORK,
  NURSERY_RHYMES_COVER_ARTWORK,
  OLD_MACDONALD_SCENE_ARTWORK,
} from "../src/dubbing/dub-artwork.ts";

describe("rhyme catalog", () => {
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
    assert.equal(DUB_DEFINITIONS.length, 2);
  });

  it("defines complete immutable generated artwork for both rhymes", () => {
    assert.equal(FIVE_LITTLE_DUCKS_DUB.sceneArtwork, FIVE_LITTLE_DUCKS_SCENE_ARTWORK);
    assert.equal(OLD_MACDONALD_DUB.sceneArtwork, OLD_MACDONALD_SCENE_ARTWORK);
    assert.equal(FIVE_LITTLE_DUCKS_SCENE_ARTWORK.length, 6);
    assert.equal(OLD_MACDONALD_SCENE_ARTWORK.length, 5);

    const artwork = [
      NURSERY_RHYMES_COVER_ARTWORK,
      ...FIVE_LITTLE_DUCKS_SCENE_ARTWORK,
      ...OLD_MACDONALD_SCENE_ARTWORK,
    ];
    assert.equal(new Set(artwork.map(({ src }) => src)).size, 12);
    for (const image of artwork) {
      assert.match(image.src, /^https:\/\/media\.parrotbook\.com\/assets\/v5\/dubbing\/.+\.webp$/);
      assert.equal(image.width, 1536);
      assert.equal(image.height, 864);
      assert.ok(image.alt.length >= 20);
      assert.equal(Object.isFrozen(image), true);
    }
    assert.equal(Object.isFrozen(FIVE_LITTLE_DUCKS_SCENE_ARTWORK), true);
    assert.equal(Object.isFrozen(OLD_MACDONALD_SCENE_ARTWORK), true);
  });
});
