import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const projectFile = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const { PIXEL_WORLD_PACK } = await import(
  "../prototypes/pixel-stage/world-pack.js"
);

const layerEntries = (scene) => Object.values(scene.layers).flat();

describe("pixel world pack", () => {
  it("defines one native logical-pixel contract for every asset", () => {
    assert.deepEqual(PIXEL_WORLD_PACK.renderProfile.worldSize, {
      height: 480,
      width: 720,
    });
    assert.equal(PIXEL_WORLD_PACK.renderProfile.cameraZoom, 2);
    assert.equal(PIXEL_WORLD_PACK.renderProfile.artCellWorldPixels, 2);
    assert.equal(PIXEL_WORLD_PACK.renderProfile.sourcePixelsPerWorldPixel, 1);
    assert.equal(PIXEL_WORLD_PACK.renderProfile.textureToWorldScale, 1);
    assert.equal(PIXEL_WORLD_PACK.renderProfile.screenPixelsPerArtPixel, 4);
    assert.equal(PIXEL_WORLD_PACK.renderProfile.alpha, "binary");
    assert.ok(PIXEL_WORLD_PACK.renderProfile.palette.length >= 24);
    assert.ok(PIXEL_WORLD_PACK.renderProfile.palette.length <= 48);

    assert.equal(PIXEL_WORLD_PACK.player.spriteSheet.frameWidth, 160);
    assert.equal(PIXEL_WORLD_PACK.player.spriteSheet.frameHeight, 160);
    assert.equal(PIXEL_WORLD_PACK.player.spriteSheet.columns, 4);
    assert.equal(PIXEL_WORLD_PACK.player.spriteSheet.rows, 4);
  });

  it("provides a large reusable prop superset instead of separate item and scenery systems", () => {
    assert.ok(Array.isArray(PIXEL_WORLD_PACK.objects));
    assert.ok(PIXEL_WORLD_PACK.objects.length >= 32);
    assert.equal("items" in PIXEL_WORLD_PACK, false);
    assert.equal("scenery" in PIXEL_WORLD_PACK, false);

    const ids = new Set(PIXEL_WORLD_PACK.objects.map(({ id }) => id));
    assert.equal(ids.size, PIXEL_WORLD_PACK.objects.length);
    assert.ok(
      PIXEL_WORLD_PACK.objects.filter(({ capabilities }) =>
        capabilities.includes("holdable"),
      ).length >= 16,
    );
    assert.ok(
      PIXEL_WORLD_PACK.objects.some(({ capabilities }) =>
        capabilities.includes("holdable") &&
        capabilities.includes("placeable"),
      ),
    );

    for (const object of PIXEL_WORLD_PACK.objects) {
      assert.ok(object.category.length > 0);
      assert.ok(Array.isArray(object.capabilities));
      assert.ok(object.capabilities.includes("placeable"));
      if (object.capabilities.includes("blocking")) {
        assert.ok(object.collision, `${object.id} requires a collision box`);
      }
      if (object.capabilities.includes("holdable")) {
        assert.ok(object.hold, `${object.id} requires hold metadata`);
        assert.equal(Number.isInteger(object.hold.offsetX), true);
        assert.equal(Number.isInteger(object.hold.offsetY), true);
      }
    }
  });

  it("builds eight composable scenes from deterministic depth layers", () => {
    assert.equal(PIXEL_WORLD_PACK.id, "storybook-meadows");
    assert.ok(Array.isArray(PIXEL_WORLD_PACK.scenes));
    assert.ok(PIXEL_WORLD_PACK.scenes.length >= 8);

    const objectIds = new Set(PIXEL_WORLD_PACK.objects.map(({ id }) => id));
    for (const scene of PIXEL_WORLD_PACK.scenes) {
      assert.ok(scene.id.length > 0);
      assert.ok(scene.name.length > 0);
      assert.deepEqual(Object.keys(scene.layers), [
        "sky",
        "far",
        "mid",
        "play",
        "foreground",
      ]);
      assert.ok(scene.layers.sky.length >= 1);
      assert.ok(scene.layers.far.length >= 1);
      assert.ok(scene.layers.mid.length >= 1);
      assert.ok(scene.layers.play.length >= 1);
      assert.ok(scene.placements.length >= 6);
      assert.equal(Number.isInteger(scene.start.x), true);
      assert.equal(Number.isInteger(scene.start.y), true);

      for (const layer of layerEntries(scene)) {
        assert.ok(layer.assetId.length > 0);
        assert.ok(layer.scrollFactorX >= 0 && layer.scrollFactorX <= 1);
        assert.ok(layer.scrollFactorY >= 0 && layer.scrollFactorY <= 1);
        assert.equal(Number.isInteger(layer.x), true);
        assert.equal(Number.isInteger(layer.y), true);
      }
      for (const placement of scene.placements) {
        assert.equal(objectIds.has(placement.objectId), true);
        assert.equal(Number.isInteger(placement.x), true);
        assert.equal(Number.isInteger(placement.y), true);
      }
    }
  });

  it("defines frame-stable named sockets for generic held-item attachment", () => {
    const mainHand = PIXEL_WORLD_PACK.player.sockets.mainHand;
    assert.ok(mainHand);
    assert.deepEqual(Object.keys(mainHand.byPose), [
      "idle",
      "walking",
      "talking",
      "happy",
      "surprised",
    ]);

    for (const [pose, anchors] of Object.entries(mainHand.byPose)) {
      assert.ok(Array.isArray(anchors));
      assert.ok(anchors.length >= 1);
      if (pose === "walking") assert.equal(anchors.length, 4);
      for (const anchor of anchors) {
        assert.equal(Number.isInteger(anchor.x), true);
        assert.equal(Number.isInteger(anchor.y), true);
        assert.match(anchor.depth, /^(back|front)$/);
      }
    }
  });

  it("ships only local, compiler-owned assets with declared native dimensions", () => {
    const referencedAssetIds = new Set([
      ...PIXEL_WORLD_PACK.objects.map(({ assetId }) => assetId),
      ...PIXEL_WORLD_PACK.scenes.flatMap((scene) =>
        layerEntries(scene).map(({ assetId }) => assetId),
      ),
      PIXEL_WORLD_PACK.player.spriteSheet.assetId,
    ]);

    for (const assetId of referencedAssetIds) {
      const asset = PIXEL_WORLD_PACK.assets[assetId];
      assert.ok(asset, `Missing asset metadata for ${assetId}`);
      assert.match(asset.src, /^\/assets\/pixel-world\/.+\.png$/);
      assert.equal(asset.worldScale, 1);
      assert.equal(asset.alpha, asset.kind === "ground" ? "opaque" : "binary");
      assert.equal(Number.isInteger(asset.nativeWidth), true);
      assert.equal(Number.isInteger(asset.nativeHeight), true);
      assert.ok(asset.nativeWidth > 0 && asset.nativeHeight > 0);
      assert.equal(
        existsSync(path.join(projectRoot, "public", asset.src)),
        true,
        `Expected local compiled asset for ${assetId}: ${asset.src}`,
      );
    }
  });

  it("exposes a review lab and a deterministic compiler entrypoint", () => {
    const appSource = projectFile("src/app/App.tsx");
    const packageManifest = JSON.parse(projectFile("package.json"));

    assert.match(appSource, /path="\/games\/worlds"/);
    assert.equal(
      packageManifest.scripts["generate:pixel-world-assets"],
      "node scripts/generate-pixel-world-assets.mjs",
    );
    assert.equal(
      existsSync(path.join(projectRoot, "scripts", "generate-pixel-world-assets.mjs")),
      true,
    );
    assert.equal(
      existsSync(path.join(projectRoot, "art-source", "pixel-world", "manifest.json")),
      true,
    );
  });
});
