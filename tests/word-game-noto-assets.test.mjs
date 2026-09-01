import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parseNotoAssetManifest } from "../scripts/word-game/manifest.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const manifestPath = path.join(repositoryRoot, "content", "word-games", "noto-assets.json");
const assetRoot = path.join(repositoryRoot, "public", "assets", "word-games", "noto");
const licensePath = path.join(repositoryRoot, "third_party", "noto-emoji-svg-LICENSE");
const expectedIds = [
  "1f431", "1f415", "1f426", "1f41f", "1f986", "1f438", "1f437", "1f404",
  "1f40e", "1f40a", "1f418", "1f992", "1f440", "1f442", "1f443", "1f444",
  "270b", "1f9b6", "1f4aa", "1f9b5", "1f9b7", "1f445", "1f9e0", "2764",
  "1f34e", "1f34c", "1f955", "1f34a", "1f35e", "1f9c0", "1f35a", "1f95a",
  "1f95b", "1f345", "1f954", "1f96a", "26bd", "1f697", "1fa86", "1fa81",
  "1f9f1", "1f9f8", "1f686", "1f941", "1f9e9", "1f916", "1fa80", "1f6f9",
  "1f604", "1f622", "1f620", "1f634", "1f62e", "1f92a", "1f628", "1f929",
  "1f60c", "1f61f", "1f615", "1f611", "1f6cf", "1fa91", "1f6aa", "1fa9f",
  "1f3e0", "1f511", "1f6cb", "1f6c1", "1f6bd", "1f6bf", "1fa9e", "1f9f9",
  "1f455", "1f45f", "1f9e2", "1f9e6", "1f9e5", "1f456", "1f457", "1fa73",
  "1f9e3", "1f462", "1f9e4", "1fa71", "1f68c", "1f6b2", "1f6a4", "2708",
  "1f695", "1f69a", "1f6f4", "1f681", "1f3cd", "1f680",
];

async function readManifest() {
  const value = JSON.parse(await readFile(manifestPath, "utf8"));
  return parseNotoAssetManifest(value, manifestPath);
}

describe("pinned Noto word-game artwork", () => {
  it("pins the official revision and complete deduplicated inventory", async () => {
    const manifest = await readManifest();

    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.revision, "8998f5dd683424a73e2314a8c1f1e359c19e8742");
    assert.equal(manifest.repository, "https://github.com/googlefonts/noto-emoji");
    assert.equal(manifest.license, "Apache-2.0");
    assert.equal(manifest.licensePath, "svg/LICENSE");
    assert.deepEqual(manifest.assets.map(({ id }) => id), expectedIds);
    assert.equal(new Set(manifest.assets.map(({ publicPath }) => publicPath)).size, 94);
  });

  it("uses strict official paths and hashes every exact vendored SVG", async () => {
    const manifest = await readManifest();
    const expectedFiles = [];

    for (const asset of manifest.assets) {
      const filename = `emoji_u${asset.id}.svg`;
      expectedFiles.push(filename);
      assert.equal(asset.upstreamPath, `svg/${filename}`);
      assert.equal(asset.publicPath, `/assets/word-games/noto/${filename}`);
      assert.equal(path.basename(asset.publicPath), filename);
      const bytes = await readFile(path.join(assetRoot, filename));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256, filename);
    }

    assert.deepEqual((await readdir(assetRoot)).sort(), expectedFiles.sort());
  });

  it("retains the exact nested SVG license bytes", async () => {
    const bytes = await readFile(licensePath);

    assert.equal(bytes.length, 574);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      "611ceab36dae96644ca84e8ace6873821790192bf6f73b0d0624a21b24b4b332",
    );
  });
});
