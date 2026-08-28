import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DUB_DEFINITIONS,
  OLD_MACDONALD_DUB,
  getDubDefinition,
} from "../src/dubbing/rhyme-catalog.ts";

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
      OLD_MACDONALD_DUB.lines.slice(0, 7).map(({ text }) => text),
      [
        "Old MacDonald had a farm, E-I-E-I-O!",
        "And on his farm he had some cows, E-I-E-I-O!",
        "With a moo-moo here",
        "And a moo-moo there",
        "Here a moo, there a moo",
        "Everywhere a moo-moo",
        "Old MacDonald had a farm, E-I-E-I-O!",
      ],
    );
  });

  it("freezes definitions and rejects unknown IDs", () => {
    assert.equal(Object.isFrozen(OLD_MACDONALD_DUB.lines), true);
    assert.equal(Object.isFrozen(OLD_MACDONALD_DUB.lines[0]), true);
    assert.throws(() => getDubDefinition("missing"), /Unknown dub/);
    assert.equal(DUB_DEFINITIONS.length, 2);
  });
});
