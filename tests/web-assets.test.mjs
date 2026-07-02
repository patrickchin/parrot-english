import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const publicAssetsDir = fileURLToPath(new URL("../public/assets", import.meta.url));
const webAssetExtensions = new Set([".mp3", ".svg", ".webp"]);

async function listAssetFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const filePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listAssetFiles(filePath)));
      continue;
    }

    files.push(filePath);
  }

  return files;
}

describe("web asset formats", () => {
  it("keeps public lesson assets in browser-friendly formats", async () => {
    const files = await listAssetFiles(publicAssetsDir);
    const unsupportedFiles = files
      .map((filePath) => relative(publicAssetsDir, filePath))
      .filter((filePath) => !webAssetExtensions.has(extname(filePath)));

    assert.deepEqual(unsupportedFiles, []);
  });
});
