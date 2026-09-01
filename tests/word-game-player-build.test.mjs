import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function findJavaScriptFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findJavaScriptFiles(entryPath));
    } else if (entry.name.endsWith(".js")) {
      files.push(entryPath);
    }
  }
  return files;
}

test("the production bundle omits word-game E2E hooks", async (t) => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "parrot-word-game-build-"));
  t.after(() => rm(outDir, { recursive: true, force: true }));

  await build({
    root: rootDir,
    mode: "production",
    logLevel: "silent",
    build: { outDir, emptyOutDir: true },
  });

  const assetFiles = await findJavaScriptFiles(outDir);
  assert.ok(assetFiles.length > 0, "expected the production build to emit JavaScript");
  const assets = await Promise.all(assetFiles.map((file) => readFile(file, "utf8")));
  assert.ok(
    assets.every((asset) =>
      !asset.includes("__parrotE2eWordGameRandom")
      && !asset.includes("__parrotE2ePlaybackLine")),
    "production JavaScript must not expose word-game E2E hooks",
  );
});
