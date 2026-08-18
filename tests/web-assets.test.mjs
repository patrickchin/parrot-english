import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const publicAssetsDir = fileURLToPath(new URL("../public/assets", import.meta.url));
const backgroundCatalogFile = fileURLToPath(
  new URL("../content/catalogs/backgrounds.json", import.meta.url),
);
const webAssetExtensions = new Set([".mp3", ".svg", ".webp"]);

function isSupportedAsset(filePath) {
  return webAssetExtensions.has(extname(filePath));
}

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
      .filter((filePath) => !isSupportedAsset(filePath));

    assert.deepEqual(unsupportedFiles, []);
  });

  it("delivers every lesson background from immutable R2 media URLs", async () => {
    const backgrounds = JSON.parse(await readFile(backgroundCatalogFile, "utf8"));

    for (const background of backgrounds) {
      assert.match(
        background.src,
        new RegExp(
          `^https://media\\.parrotbook\\.com/backgrounds/${background.id}/v[1-9]\\d*/landscape\\.webp$`,
        ),
      );
    }

    await assert.rejects(access(join(publicAssetsDir, "backgrounds")), {
      code: "ENOENT",
    });
  });
});
