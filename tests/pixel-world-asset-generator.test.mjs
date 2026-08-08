import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL("..", import.meta.url));

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function createGeneratorFixture(t) {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), "parrot-pixel-world-generator-"),
  );
  t.after(() => rm(fixtureRoot, { force: true, recursive: true }));

  await mkdir(path.join(fixtureRoot, "scripts", "lib"), { recursive: true });
  await mkdir(path.join(fixtureRoot, "prototypes", "pixel-stage"), {
    recursive: true,
  });
  await mkdir(
    path.join(fixtureRoot, "art-source", "pixel-world", "sources"),
    { recursive: true },
  );
  await mkdir(path.join(fixtureRoot, "public", "assets", "pixel-world"), {
    recursive: true,
  });
  await cp(
    path.join(projectRoot, "scripts", "generate-pixel-world-assets.mjs"),
    path.join(fixtureRoot, "scripts", "generate-pixel-world-assets.mjs"),
  );
  await cp(
    path.join(projectRoot, "package.json"),
    path.join(fixtureRoot, "package.json"),
  );
  await cp(
    path.join(projectRoot, "scripts", "lib", "pixel-art-compiler.mjs"),
    path.join(fixtureRoot, "scripts", "lib", "pixel-art-compiler.mjs"),
  );
  await cp(
    path.join(projectRoot, "prototypes", "pixel-stage", "world-pack.js"),
    path.join(fixtureRoot, "prototypes", "pixel-stage", "world-pack.js"),
  );
  await cp(
    path.join(
      projectRoot,
      "art-source",
      "pixel-world",
      "sources",
      "characters",
    ),
    path.join(
      fixtureRoot,
      "art-source",
      "pixel-world",
      "sources",
      "characters",
    ),
    { recursive: true },
  );
  await cp(
    path.join(projectRoot, "public", "assets", "pixel-world", "characters"),
    path.join(fixtureRoot, "public", "assets", "pixel-world", "characters"),
    { recursive: true },
  );
  await cp(
    path.join(projectRoot, "public", "assets", "pixel-world", "manifest.json"),
    path.join(fixtureRoot, "public", "assets", "pixel-world", "manifest.json"),
  );
  await symlink(
    path.join(projectRoot, "node_modules"),
    path.join(fixtureRoot, "node_modules"),
    "dir",
  );

  return fixtureRoot;
}

const characterCases = [
  {
    bodyAssetId: "player-peppa-sheet",
    bodySource: "peppa-world-sheet.png",
    height: 640,
    name: "Peppa",
    overlayAssetId: "player-peppa-main-hand-front-sheet",
    overlayOutput: "peppa-main-hand-front-sheet.png",
    width: 640,
  },
  {
    bodyAssetId: "player-polly-sheet",
    bodySource: "polly-world-sheet.png",
    height: 512,
    name: "Polly",
    overlayAssetId: "player-polly-main-hand-front-sheet",
    overlayOutput: "polly-main-hand-front-sheet.png",
    width: 512,
  },
];

describe("pixel-world asset generator", () => {
  for (const character of characterCases) {
    it(`rebuilds ${character.name}'s derived hand overlay during a body-only compilation`, async (t) => {
      const fixtureRoot = await createGeneratorFixture(t);
      const sourcePath = path.join(
        fixtureRoot,
        "art-source",
        "pixel-world",
        "sources",
        "characters",
        character.bodySource,
      );
      const overlayOutputPath = path.join(
        fixtureRoot,
        "public",
        "assets",
        "pixel-world",
        "characters",
        character.overlayOutput,
      );
      const baselineOverlayHash = sha256(await readFile(overlayOutputPath));

      await sharp({
        create: {
          background: "#ff4b4b",
          channels: 4,
          height: character.height,
          width: character.width,
        },
      })
        .png({ compressionLevel: 9, palette: false })
        .toFile(sourcePath);

      const { stdout } = await execFileAsync(
        process.execPath,
        [
          path.join(fixtureRoot, "scripts", "generate-pixel-world-assets.mjs"),
          "--only",
          character.bodyAssetId,
        ],
        { cwd: fixtureRoot },
      );

      assert.match(stdout, /Compiled 2 pixel-world assets/);
      const rebuiltOverlayHash = sha256(await readFile(overlayOutputPath));
      assert.notEqual(rebuiltOverlayHash, baselineOverlayHash);

      const manifest = JSON.parse(
        await readFile(
          path.join(
            fixtureRoot,
            "public",
            "assets",
            "pixel-world",
            "manifest.json",
          ),
          "utf8",
        ),
      );
      const overlayEntry = manifest.assets.find(
        (asset) => asset.id === character.overlayAssetId,
      );
      assert.equal(overlayEntry?.sha256, rebuiltOverlayHash);
    });
  }
});
