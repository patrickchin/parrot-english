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

  it("builds a compact lesson garden on a three-times-finer render grid", () => {
    assert.equal(worldConfig.RENDER_SCALE, 3);
    assert.equal(worldConfig.TILE_SIZE, 48);
    assert.equal(worldConfig.CAMERA_ZOOM, 1);
    assert.deepEqual(worldConfig.VIEWPORT_SIZE, { height: 240, width: 360 });
    assert.deepEqual(worldConfig.VISIBLE_WORLD_SIZE, { height: 240, width: 360 });
    assert.deepEqual(worldConfig.WORLD_GRID, { columns: 15, rows: 10 });
    assert.deepEqual(worldConfig.WORLD_SIZE, { height: 480, width: 720 });
    assert.deepEqual(worldConfig.PLAYER_START, { x: 450, y: 192 });
    assert.equal(worldConfig.SPRITE_FRAME_SIZE, 96);
    assert.equal(worldConfig.PLAYER_SCALE, 1);
    assert.equal(worldConfig.PLAYER_SPEED, 144);
    assert.deepEqual(worldConfig.PLAYER_BODY, {
      height: 18,
      offsetX: 30,
      offsetY: 78,
      width: 36,
    });
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
  });

  it("authors collision and occlusion from the same world objects", () => {
    const tree = worldConfig.WORLD_OBJECTS.find(
      ({ id }) => id === "lesson-tree",
    );

    assert.deepEqual(
      worldConfig.WORLD_OBJECTS.map(({ id }) => id),
      ["lesson-tree", "flower-patch", "lesson-basket", "apple-counter"],
    );
    assert.ok(tree);
    assert.equal(tree.footY, tree.y);
    assert.equal(tree.asset, "garden-tree-ball");
    assert.ok(tree.collision.width > 0);
    assert.ok(tree.collision.height > 0);
    assert.ok(
      worldConfig.WORLD_OBJECTS.every(
        ({ asset, collision, footY }) =>
          Number.isFinite(footY) && asset.length > 0 && collision,
      ),
    );
    assert.equal(worldConfig.getDepthForFootY(480), 1_480);
    assert.ok(
      worldConfig.getDepthForFootY(528) >
        worldConfig.getDepthForFootY(480),
    );
  });

  it("delegates rendering, camera, input, animation, and collision to Phaser", () => {
    const stage = projectFile("prototypes/pixel-stage/main.ts");

    assert.match(stage, /new Phaser\.Game\(/);
    assert.match(stage, /Phaser\.Scale\.MAX_ZOOM/);
    assert.match(stage, /lesson-garden-ground\.png/);
    assert.match(stage, /garden-tree-ball\.png/);
    assert.match(stage, /garden-flowers\.png/);
    assert.match(stage, /garden-basket\.png/);
    assert.match(stage, /garden-market\.png/);
    assert.match(stage, /this\.physics\.add\.sprite\(/);
    assert.match(stage, /createCursorKeys\(\)/);
    assert.match(stage, /this\.physics\.add\.collider\(/);
    assert.match(stage, /this\.anims\.create\(/);
    assert.match(stage, /startFollow\(/);
    assert.match(stage, /setDeadzone\(/);
    assert.match(stage, /setZoom\(CAMERA_ZOOM\)/);
    assert.match(stage, /peppa-town-sheet-96\.png/);
    assert.doesNotMatch(stage, /tiny-town\.png|peppa-sheet\.png/);
    assert.doesNotMatch(stage, /foreground\.png|SCENERY_COLLIDERS|FOREGROUND_DEPTH|make\.tilemap/);
    assert.doesNotMatch(stage, /requestAnimationFrame|setInterval|moveActor|getSpriteFrame/);
  });

  it("uses generated lesson assets at the native high-resolution game grid", () => {
    assert.deepEqual(
      pngDimensions(
        "public/prototypes/pixel-stage/assets/peppa-town-sheet-96.png",
      ),
      { height: 384, width: 384 },
    );
    assert.deepEqual(
      pngDimensions(
        "public/prototypes/pixel-stage/assets/lesson-garden-ground.png",
      ),
      { height: 480, width: 720 },
    );
    assert.deepEqual(
      pngDimensions(
        "public/prototypes/pixel-stage/assets/garden-tree-ball.png",
      ),
      { height: 192, width: 168 },
    );
  });

  it("builds the prototype as a Vite HTML entry instead of an unbundled public script", () => {
    const html = projectFile("prototypes/pixel-stage/index.html");
    const viteConfig = projectFile("vite.config.ts");

    assert.match(html, /<script type="module" src="\.\/main\.ts"><\/script>/);
    assert.match(viteConfig, /pixelStage:\s*resolve\([^)]*"prototypes\/pixel-stage\/index\.html"/s);
  });
});
