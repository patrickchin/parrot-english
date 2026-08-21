import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

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

  it("ships responsive conversation character images for small screens", async () => {
    const peppaDir = join(publicAssetsDir, "characters", "peppa");

    for (const pose of ["happy", "listening", "sad", "surprised", "talking"]) {
      for (const width of [384, 768, 1024]) {
        const filePath = join(peppaDir, `peppa-${pose}-${width}.webp`);
        const [metadata, file] = await Promise.all([
          sharp(filePath).metadata(),
          stat(filePath),
        ]);
        assert.equal(metadata.width, width);
        assert.equal(metadata.height, width);
        assert.ok(file.size < 64 * 1024, `${filePath} is unexpectedly large`);
      }
    }
  });

  it("ships crop-safe responsive shelf art within the 768px byte budget", async () => {
    const shelves = [
      { directory: "lesson-covers", expectedCount: 7 },
      { directory: "stories", expectedCount: 20 },
    ];

    for (const shelf of shelves) {
      const directory = join(publicAssetsDir, shelf.directory);
      const sources = (await readdir(directory))
        .filter((file) => file.endsWith(".webp") && !/-\d+\.webp$/.test(file))
        .sort();
      assert.equal(sources.length, shelf.expectedCount);

      for (const source of sources) {
        const sourcePath = join(directory, source);
        const sourceMetadata = await sharp(sourcePath).metadata();

        for (const width of [384, 768]) {
          const candidatePath = join(
            directory,
            source.replace(/\.webp$/, `-${width}.webp`),
          );
          const [candidateMetadata, candidateFile] = await Promise.all([
            sharp(candidatePath).metadata(),
            stat(candidatePath),
          ]);
          assert.equal(candidateMetadata.format, "webp");
          assert.equal(candidateMetadata.width, width);
          assert.equal(
            candidateMetadata.height,
            Math.round((sourceMetadata.height * width) / sourceMetadata.width),
            `${candidatePath} preserves the source crop`,
          );
          if (width === 768) {
            assert.ok(
              candidateFile.size <= 50 * 1024,
              `${candidatePath} exceeds the 50 kB shelf-art budget`,
            );
          }
        }
      }
    }
  });
});
