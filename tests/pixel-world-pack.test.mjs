import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

const requireCharacters = () => {
  assert.ok(
    Array.isArray(PIXEL_WORLD_PACK.characters),
    "The world pack must expose its playable cast as characters[]",
  );
  return PIXEL_WORLD_PACK.characters;
};

const requirePlacementSlots = () => {
  assert.ok(
    Array.isArray(PIXEL_WORLD_PACK.placementSlots),
    "The world pack must expose semantic placementSlots[]",
  );
  return PIXEL_WORLD_PACK.placementSlots;
};

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
    assert.deepEqual(PIXEL_WORLD_PACK.renderProfile.playfield, {
      bottom: 480,
      left: 0,
      right: 720,
      top: 160,
    });
    assert.ok(PIXEL_WORLD_PACK.renderProfile.palette.length >= 24);
    assert.ok(PIXEL_WORLD_PACK.renderProfile.palette.length <= 48);
  });

  it("defines exactly Peppa and Polly as overlay-capable characters", () => {
    const characters = requireCharacters();
    assert.equal("player" in PIXEL_WORLD_PACK, false);
    assert.deepEqual(
      characters.map(({ id }) => id).sort(),
      ["peppa", "polly"],
    );

    const expectedFrameSize = { peppa: 160, polly: 128 };
    for (const character of characters) {
      assert.ok(character.name.length > 0);
      assert.ok(character.body);
      assert.ok(character.spriteSheet);
      assert.ok(character.overlays?.mainHandFront);
      assert.ok(character.sockets?.mainHand);

      const bodySheet = character.spriteSheet;
      const handOverlaySheet = character.overlays.mainHandFront;
      assert.equal(bodySheet.frameWidth, expectedFrameSize[character.id]);
      assert.equal(bodySheet.frameHeight, expectedFrameSize[character.id]);
      for (const key of ["columns", "frameHeight", "frameWidth", "rows"]) {
        assert.equal(
          handOverlaySheet[key],
          bodySheet[key],
          `${character.id} body and hand overlay must share ${key}`,
        );
      }

      for (const sheet of [bodySheet, handOverlaySheet]) {
        const asset = PIXEL_WORLD_PACK.assets[sheet.assetId];
        assert.ok(asset, `Missing ${character.id} sheet asset ${sheet.assetId}`);
        assert.equal(asset.nativeWidth, sheet.frameWidth * sheet.columns);
        assert.equal(asset.nativeHeight, sheet.frameHeight * sheet.rows);
      }
    }
  });

  it("defines nine unique semantic placement slots", () => {
    const slots = requirePlacementSlots();
    assert.equal(slots.length, 9);
    assert.equal(new Set(slots.map(({ id }) => id)).size, slots.length);
    assert.ok(slots.some(({ id }) => id === "back-left"));
    assert.ok(slots.some(({ id }) => id === "center"));
    assert.ok(slots.some(({ id }) => id === "front-right"));

    for (const slot of slots) {
      assert.ok(slot.id.length > 0);
      assert.ok(slot.label.length > 0);
      assert.equal(Number.isInteger(slot.x), true);
      assert.equal(Number.isInteger(slot.y), true);
    }
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

  it("builds a sourced twenty-scene composer library from deterministic depth layers", () => {
    assert.equal(PIXEL_WORLD_PACK.id, "storybook-meadows");
    assert.ok(Array.isArray(PIXEL_WORLD_PACK.scenes));
    assert.ok(PIXEL_WORLD_PACK.scenes.length >= 20);

    const objectIds = new Set(PIXEL_WORLD_PACK.objects.map(({ id }) => id));
    const holdableIds = new Set(
      PIXEL_WORLD_PACK.objects
        .filter(({ capabilities }) => capabilities.includes("holdable"))
        .map(({ id }) => id),
    );
    const characterIds = new Set(requireCharacters().map(({ id }) => id));
    const slotIds = new Set(requirePlacementSlots().map(({ id }) => id));
    const sourceCounts = { lesson: 0, story: 0, world: 0 };
    const sourceIds = new Set();
    for (const scene of PIXEL_WORLD_PACK.scenes) {
      assert.ok(scene.id.length > 0);
      assert.ok(scene.name.length > 0);
      assert.match(scene.source?.kind ?? "", /^(lesson|story|world)$/);
      assert.ok(scene.source.id.length > 0);
      sourceCounts[scene.source.kind] += 1;
      sourceIds.add(`${scene.source.kind}:${scene.source.id}`);
      assert.deepEqual(
        scene.cast.map(({ characterId }) => characterId).sort(),
        ["peppa", "polly"],
      );
      assert.equal(scene.cast.length, characterIds.size);
      for (const castMember of scene.cast) {
        assert.equal(characterIds.has(castMember.characterId), true);
        assert.equal(slotIds.has(castMember.slotId), true);
        assert.ok(castMember.emote.length > 0);
        assert.equal(
          Object.hasOwn(castMember, "heldItemId"),
          true,
          `${scene.id}/${castMember.characterId} must declare heldItemId`,
        );
        if (castMember.heldItemId !== null) {
          assert.equal(holdableIds.has(castMember.heldItemId), true);
        }
      }
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
      assert.equal(scene.layers.play.length, 1);
      assert.equal(scene.layers.play[0].y, 160);
      assert.equal(
        PIXEL_WORLD_PACK.assets[scene.layers.play[0].assetId].nativeHeight,
        320,
      );
      assert.ok(scene.placements.length >= 6);
      assert.equal(Number.isInteger(scene.start.x), true);
      assert.equal(Number.isInteger(scene.start.y), true);

      for (const layer of layerEntries(scene)) {
        assert.ok(layer.assetId.length > 0);
        assert.ok(layer.scrollFactorX >= 0 && layer.scrollFactorX <= 1);
        assert.ok(layer.scrollFactorY >= 0 && layer.scrollFactorY <= 1);
        assert.equal(layer.scrollFactorY, 1);
        assert.equal(Number.isInteger(layer.x), true);
        assert.equal(Number.isInteger(layer.y), true);
      }
      for (const placement of scene.placements) {
        assert.equal(objectIds.has(placement.objectId), true);
        assert.equal(Number.isInteger(placement.x), true);
        assert.equal(Number.isInteger(placement.y), true);
      }
    }
    assert.equal(sourceCounts.world, 8);
    assert.equal(sourceCounts.lesson, 7);
    assert.ok(sourceCounts.story >= 5);
    assert.equal(sourceIds.size, PIXEL_WORLD_PACK.scenes.length);
  });

  it("maps lesson and story scene sources to real catalog entries", () => {
    const lessonIds = new Set(
      readdirSync(new URL("../content/lessons/", import.meta.url))
        .filter((fileName) => fileName.endsWith(".json"))
        .map((fileName) => path.basename(fileName, ".json")),
    );
    const storyCatalogSource = projectFile(
      "src/stories/story-script-candidates.ts",
    );
    const storyIds = new Set(
      [...storyCatalogSource.matchAll(
        /^  makePrototypeStory\(\{\n    id: "([^"]+)",/gm,
      )].map((match) => match[1]),
    );

    assert.equal(lessonIds.size, 7);
    assert.ok(storyIds.size >= 20);
    for (const scene of PIXEL_WORLD_PACK.scenes) {
      if (scene.source.kind === "lesson") {
        assert.equal(
          lessonIds.has(scene.source.id),
          true,
          `${scene.id} must map to a content/lessons JSON file`,
        );
      }
      if (scene.source.kind === "story") {
        assert.equal(
          storyIds.has(scene.source.id),
          true,
          `${scene.id} must map to a top-level story candidate`,
        );
      }
    }
  });

  it("defines frame-stable named sockets that select the front-hand overlay", () => {
    for (const character of requireCharacters()) {
      const mainHand = character.sockets.mainHand;
      assert.ok(mainHand);
      assert.deepEqual(Object.keys(mainHand.byPose), [
        "idle",
        "walking",
        "talking",
        "happy",
        "surprised",
      ]);

      let frontAnchorCount = 0;
      for (const [pose, anchors] of Object.entries(mainHand.byPose)) {
        assert.ok(Array.isArray(anchors));
        assert.ok(anchors.length >= 1);
        if (pose === "walking") assert.equal(anchors.length, 4);
        for (const anchor of anchors) {
          assert.equal(Number.isInteger(anchor.x), true);
          assert.equal(Number.isInteger(anchor.y), true);
          assert.match(anchor.depth, /^(back|front)$/);
          if (anchor.depth === "front") {
            frontAnchorCount += 1;
            assert.equal(anchor.overlayRole, "mainHandFront");
          }
        }
      }
      assert.ok(frontAnchorCount > 0);
    }

    const holdProfiles = PIXEL_WORLD_PACK.objects
      .filter(({ capabilities }) => capabilities.includes("holdable"))
      .map(({ hold }) => JSON.stringify(hold));
    assert.ok(new Set(holdProfiles).size >= 6);
    assert.equal(holdProfiles.some((profile) => profile.includes("rotation")), false);
  });

  it("ships only local, compiler-owned assets with declared native dimensions", () => {
    const referencedAssetIds = new Set([
      ...PIXEL_WORLD_PACK.objects.map(({ assetId }) => assetId),
      ...PIXEL_WORLD_PACK.scenes.flatMap((scene) =>
        layerEntries(scene).map(({ assetId }) => assetId),
      ),
      ...requireCharacters().flatMap((character) => [
        character.spriteSheet.assetId,
        character.overlays.mainHandFront.assetId,
      ]),
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
      packageManifest.scripts["capture:pixel-world"],
      "node scripts/capture-pixel-world-screenshots.mjs",
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
