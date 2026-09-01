import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const categoryRoot = path.join(repositoryRoot, "content", "word-games", "categories");
const manifestPath = path.join(repositoryRoot, "content", "word-games", "illustrated-assets.json");
const assetRoot = path.join(repositoryRoot, "public", "assets", "word-games", "illustrated");

async function readAuthoredIllustrationIds() {
  const categories = await Promise.all(
    (await readdir(categoryRoot)).sort().map(async (filename) =>
      JSON.parse(await readFile(path.join(categoryRoot, filename), "utf8"))),
  );
  return categories
    .filter(({ id }) => id !== "colors")
    .flatMap(({ items }) => items.map(({ visual }) => visual.assetId))
    .sort();
}

describe("illustrated word-game artwork", () => {
  it("matches every authored non-color item with a pinned 512px WebP file", async () => {
    const expectedIds = await readAuthoredIllustrationIds();
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

    assert.equal(expectedIds.length, 96);
    assert.equal(new Set(expectedIds).size, 96);
    assert.equal(manifest.schemaVersion, 1);
    assert.deepEqual(manifest.assets.map(({ id }) => id).sort(), expectedIds);
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(Object.groupBy(manifest.assets, ({ source }) => source))
          .map(([source, assets]) => [source, assets.length]),
      ),
      { generated: 66, "original-v8": 30 },
    );

    const expectedFiles = [];
    for (const asset of manifest.assets) {
      const filename = `${asset.id}.webp`;
      expectedFiles.push(filename);
      assert.equal(asset.publicPath, `/assets/word-games/illustrated/${filename}`);
      assert.match(asset.sha256, /^[a-f0-9]{64}$/u, filename);
      assert.ok(["generated", "original-v8"].includes(asset.source), filename);
      const bytes = await readFile(path.join(assetRoot, filename));
      const metadata = await sharp(bytes).metadata();
      assert.equal(metadata.format, "webp", filename);
      assert.equal(metadata.width, 512, filename);
      assert.equal(metadata.height, 512, filename);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256, filename);
    }

    assert.deepEqual((await readdir(assetRoot)).sort(), expectedFiles.sort());
  });
});
