import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const projectFile = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const pngDimensions = (path) => {
  const png = readFileSync(new URL(`../${path}`, import.meta.url));
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  return {
    height: png.readUInt32BE(20),
    width: png.readUInt32BE(16),
  };
};

const packageManifest = JSON.parse(projectFile("package.json"));
const worldConfig = await import(
  "../prototypes/pixel-stage/world-config.js"
);

describe("Phaser pixel stage", () => {
  it("uses the maintained Phaser package as its game engine", () => {
    assert.equal(packageManifest.dependencies.phaser, "4.2.1");
  });

  it("builds a compact village and magnifies every world pixel uniformly", () => {
    assert.equal(worldConfig.TILE_SIZE, 16);
    assert.equal(worldConfig.CAMERA_ZOOM, 2);
    assert.deepEqual(worldConfig.VIEWPORT_SIZE, { height: 160, width: 240 });
    assert.deepEqual(worldConfig.VISIBLE_WORLD_SIZE, { height: 80, width: 120 });
    assert.deepEqual(worldConfig.WORLD_GRID, { columns: 15, rows: 10 });
    assert.deepEqual(worldConfig.WORLD_SIZE, { height: 160, width: 240 });
    assert.deepEqual(worldConfig.PLAYER_START, { x: 128, y: 64 });
    assert.equal(worldConfig.SPRITE_FRAME_SIZE, 32);
    assert.equal(worldConfig.PLAYER_SCALE, 1);
    assert.equal(
      worldConfig.WORLD_SIZE.width,
      worldConfig.WORLD_GRID.columns * worldConfig.TILE_SIZE,
    );
    assert.equal(
      worldConfig.WORLD_SIZE.height,
      worldConfig.WORLD_GRID.rows * worldConfig.TILE_SIZE,
    );
    assert.deepEqual(
      worldConfig.ANIMATIONS.map(({ key, start, end }) => ({ key, start, end })),
      [
        { key: "idle", start: 0, end: 0 },
        { key: "walking", start: 0, end: 3 },
        { key: "talking", start: 4, end: 7 },
        { key: "happy", start: 8, end: 11 },
        { key: "surprised", start: 12, end: 15 },
      ],
    );
    assert.ok(worldConfig.PATH_AREAS.length >= 3);
    assert.ok(worldConfig.GROUND_DETAILS.length >= 12);
  });

  it("authors collision and occlusion from the same world objects", () => {
    const maple = worldConfig.WORLD_OBJECTS.find(
      ({ id }) => id === "village-maple",
    );
    const schoolhouse = worldConfig.WORLD_OBJECTS.find(
      ({ id }) => id === "schoolhouse",
    );

    assert.ok(maple);
    assert.ok(schoolhouse);
    assert.equal(maple.footY, maple.y);
    assert.ok(maple.tiles.length >= 9);
    assert.ok(maple.collision.width > 0);
    assert.ok(maple.collision.height > 0);
    assert.ok(schoolhouse.tiles.length >= 12);
    assert.ok(
      worldConfig.WORLD_OBJECTS.every(
        ({ collision, footY, tiles }) =>
          Number.isFinite(footY) && tiles.length > 0 && collision,
      ),
    );
    assert.equal(worldConfig.getDepthForFootY(160), 1_160);
    assert.ok(
      worldConfig.getDepthForFootY(176) >
        worldConfig.getDepthForFootY(160),
    );
  });

  it("delegates its tilemap, camera, input, animation, and collision to Phaser", () => {
    const stage = projectFile("prototypes/pixel-stage/main.ts");

    assert.match(stage, /new Phaser\.Game\(/);
    assert.match(stage, /Phaser\.Scale\.MAX_ZOOM/);
    assert.match(stage, /this\.make\.tilemap\(/);
    assert.match(stage, /createBlankLayer\(/);
    assert.match(stage, /this\.physics\.add\.sprite\(/);
    assert.match(stage, /createCursorKeys\(\)/);
    assert.match(stage, /this\.physics\.add\.collider\(/);
    assert.match(stage, /this\.anims\.create\(/);
    assert.match(stage, /startFollow\(/);
    assert.match(stage, /setDeadzone\(/);
    assert.match(stage, /setZoom\(CAMERA_ZOOM\)/);
    assert.match(stage, /tiny-town\.png/);
    assert.match(stage, /peppa-town-sheet\.png/);
    assert.doesNotMatch(stage, /peppa-sheet\.png/);
    assert.doesNotMatch(stage, /foreground\.png|SCENERY_COLLIDERS|FOREGROUND_DEPTH/);
    assert.doesNotMatch(stage, /requestAnimationFrame|setInterval|moveActor|getSpriteFrame/);
  });

  it("uses a compact four-by-four character sheet on the town art grid", () => {
    assert.deepEqual(
      pngDimensions(
        "public/prototypes/pixel-stage/assets/peppa-town-sheet.png",
      ),
      { height: 128, width: 128 },
    );
  });

  it("builds the prototype as a Vite HTML entry instead of an unbundled public script", () => {
    const html = projectFile("prototypes/pixel-stage/index.html");
    const viteConfig = projectFile("vite.config.ts");

    assert.match(html, /<script type="module" src="\.\/main\.ts"><\/script>/);
    assert.match(viteConfig, /pixelStage:\s*resolve\([^)]*"prototypes\/pixel-stage\/index\.html"/s);
  });
});
