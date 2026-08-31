import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import {
  parseRhymeManifest,
  resolvePackageAsset,
} from "../scripts/nursery-rhyme/manifest.mjs";

const sourcePath = "/content/twinkle-twinkle/rhyme.json";
const packageDir = path.dirname(sourcePath);

function validManifest(overrides = {}) {
  const scene = (number) => ({
    artwork: {
      alt: "A little star shines in the evening sky.",
      height: 864,
      src: `https://media.parrotbook.com/assets/v8/dubbing/twinkle-twinkle/scene-${number}.webp`,
      width: 1536,
    },
    id: `scene-${number}`,
    lines: [
      {
        guide: "guides/twinkle-twinkle-v1-guide-line-1.mp3",
        id: `twinkle-twinkle-v1-line-${number}-1`,
        text: "Twinkle, twinkle, little star,",
      },
      {
        guide: "guides/twinkle-twinkle-v1-guide-line-2.mp3",
        id: `twinkle-twinkle-v1-line-${number}-2`,
        text: "How I wonder what you are!",
      },
    ],
    title: "A little star",
  });

  return {
    countInBeats: 2,
    countInMidi: 72,
    id: "twinkle-twinkle-v1",
    order: 30,
    scenes: [scene(1), scene(2)],
    schemaVersion: 1,
    score: {
      melodyPart: "P1",
      playbackParts: ["P1", "P2"],
      src: "score.musicxml",
      volume: 0.12,
    },
    slug: "twinkle-twinkle",
    title: "Twinkle Twinkle Little Star",
    ...overrides,
  };
}

describe("nursery rhyme manifests", () => {
  it("accepts a complete schema-version-1 manifest", () => {
    assert.equal(
      parseRhymeManifest(validManifest(), sourcePath).slug,
      "twinkle-twinkle",
    );
  });

  it("rejects unknown manifest fields", () => {
    assert.throws(
      () => parseRhymeManifest({ ...validManifest(), surprise: true }, sourcePath),
      /rhyme\.json.*surprise.*unrecognized/i,
    );
  });

  it("rejects duplicate scene IDs", () => {
    const manifest = validManifest();
    manifest.scenes[1].id = manifest.scenes[0].id;

    assert.throws(
      () => parseRhymeManifest(manifest, sourcePath),
      /rhyme\.json.*scenes\[1\]\.id.*duplicate scene id/i,
    );
  });

  it("rejects duplicate line IDs", () => {
    const manifest = validManifest();
    manifest.scenes[1].lines[1].id = manifest.scenes[0].lines[0].id;

    assert.throws(
      () => parseRhymeManifest(manifest, sourcePath),
      /rhyme\.json.*scenes\[1\]\.lines\[1\]\.id.*duplicate line id/i,
    );
  });

  it("rejects unsafe IDs and slugs", () => {
    assert.throws(
      () => parseRhymeManifest(validManifest({ id: "Twinkle" }), sourcePath),
      /rhyme\.json.*id.*lowercase kebab-case/i,
    );
    assert.throws(
      () => parseRhymeManifest(validManifest({ slug: "twinkle/../star" }), sourcePath),
      /rhyme\.json.*slug.*lowercase kebab-case/i,
    );
  });

  it("requires equal non-zero scene line counts", () => {
    const manifest = validManifest();
    manifest.scenes[1].lines.pop();

    assert.throws(
      () => parseRhymeManifest(manifest, sourcePath),
      /rhyme\.json.*equal non-zero line count/i,
    );
  });

  it("requires exactly two count-in beats", () => {
    assert.throws(
      () => parseRhymeManifest(validManifest({ countInBeats: 3 }), sourcePath),
      /rhyme\.json.*countInBeats.*2/i,
    );
  });

  it("requires a MIDI count-in pitch from 0 through 127", () => {
    for (const countInMidi of [-1, 128]) {
      assert.throws(
        () => parseRhymeManifest(validManifest({ countInMidi }), sourcePath),
        /rhyme\.json.*countInMidi.*0.*127/i,
      );
    }
  });

  it("requires versioned artwork from the immutable media origin", () => {
    const unversioned = validManifest();
    unversioned.scenes[0].artwork.src =
      "https://media.parrotbook.com/assets/dubbing/twinkle-twinkle/scene-1.webp";
    assert.throws(
      () => parseRhymeManifest(unversioned, sourcePath),
      /rhyme\.json.*scenes\.0\.artwork\.src.*versioned/i,
    );

    const wrongOrigin = validManifest();
    wrongOrigin.scenes[0].artwork.src =
      "https://images.example.com/assets/v8/scene-1.webp";
    assert.throws(
      () => parseRhymeManifest(wrongOrigin, sourcePath),
      /rhyme\.json.*scenes\.0\.artwork\.src.*media\.parrotbook\.com/i,
    );
  });

  it("rejects unsafe score and guide asset paths while parsing", () => {
    const guideTraversal = validManifest();
    guideTraversal.scenes[0].lines[0].guide = "../guide.mp3";
    assert.throws(
      () => parseRhymeManifest(guideTraversal, sourcePath),
      /rhyme\.json.*scenes\[0\]\.lines\[0\]\.guide.*inside its package/i,
    );

    const absoluteScore = validManifest();
    absoluteScore.score.src = "/scores/score.musicxml";
    assert.throws(
      () => parseRhymeManifest(absoluteScore, sourcePath),
      /rhyme\.json.*score\.src.*inside its package/i,
    );

    const guideOutsideGuides = validManifest();
    guideOutsideGuides.scenes[0].lines[0].guide = "audio/guide.mp3";
    assert.throws(
      () => parseRhymeManifest(guideOutsideGuides, sourcePath),
      /rhyme\.json.*scenes\[0\]\.lines\[0\]\.guide.*guides/i,
    );
  });
});

describe("package asset resolution", () => {
  it("resolves valid score and guide paths inside the package", () => {
    assert.equal(
      resolvePackageAsset(packageDir, "score.musicxml", "score.src"),
      path.join(packageDir, "score.musicxml"),
    );
    assert.equal(
      resolvePackageAsset(
        packageDir,
        "guides/twinkle-twinkle-v1-guide-line-1.mp3",
        "scenes[0].lines[0].guide",
      ),
      path.join(packageDir, "guides/twinkle-twinkle-v1-guide-line-1.mp3"),
    );
  });

  it("rejects traversal before resolving outside the package", () => {
    assert.throws(
      () =>
        resolvePackageAsset(
          packageDir,
          "../audio.mp3",
          "scenes[0].lines[0].guide",
        ),
      /scenes\[0\]\.lines\[0\]\.guide.*inside its package/i,
    );
  });

  it("rejects empty, absolute, backslash, query, fragment, and wrong-extension paths", () => {
    for (const relativePath of [
      "",
      "/score.musicxml",
      "guides\\guide.mp3",
      "guides/guide.mp3?download=1",
      "guides/guide.mp3#clip",
      "guides/guide.wav",
    ]) {
      assert.throws(
        () =>
          resolvePackageAsset(
            packageDir,
            relativePath,
            "scenes[0].lines[0].guide",
          ),
        /scenes\[0\]\.lines\[0\]\.guide/i,
      );
    }
  });
});
