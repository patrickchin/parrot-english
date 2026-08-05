import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const projectFile = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const PIXEL_ASSET_FILENAMES = [
  "peppa-town-sheet-320.png",
  "lesson-garden-ground.png",
  "garden-tree-ball.png",
  "garden-flowers.png",
  "garden-basket.png",
  "garden-market.png",
];

const packageManifest = JSON.parse(projectFile("package.json"));
const pixelAssetCatalog = JSON.parse(
  projectFile("prototypes/pixel-stage/assets.json"),
);
const pixelAsset = (filename) =>
  pixelAssetCatalog.assets.find((asset) => asset.filename === filename);
const worldConfig = await import(
  "../prototypes/pixel-stage/world-config.js"
);

describe("Phaser pixel stage", () => {
  it("uses the maintained Phaser package as its game engine", () => {
    assert.equal(packageManifest.dependencies.phaser, "4.2.1");
  });

  it("catalogs only the assets used by the current proof of concept", () => {
    assert.deepEqual(
      pixelAssetCatalog.assets.map(({ filename }) => filename).sort(),
      PIXEL_ASSET_FILENAMES.toSorted(),
    );
  });

  it("loads immutable game art from R2 without bundling image files", () => {
    const stage = projectFile("prototypes/pixel-stage/main.ts");

    assert.match(
      stage,
      /const ASSET_ROOT = "https:\/\/media\.parrotbook\.com\/prototypes\/pixel-stage\/v1";/,
    );
    assert.throws(
      () =>
        readdirSync(
          new URL(
            "../public/prototypes/pixel-stage/assets/",
            import.meta.url,
          ),
        ),
      { code: "ENOENT" },
    );
  });

  it("builds a compact lesson garden with detailed sprites and a two-times camera presentation", () => {
    assert.equal(worldConfig.RENDER_SCALE, 3);
    assert.equal(worldConfig.TILE_SIZE, 48);
    assert.equal(worldConfig.CAMERA_ZOOM, 2);
    assert.deepEqual(worldConfig.VIEWPORT_SIZE, { height: 240, width: 360 });
    assert.deepEqual(worldConfig.VISIBLE_WORLD_SIZE, { height: 120, width: 180 });
    assert.deepEqual(worldConfig.WORLD_GRID, { columns: 15, rows: 10 });
    assert.deepEqual(worldConfig.WORLD_SIZE, { height: 480, width: 720 });
    assert.deepEqual(worldConfig.PLAYER_START, { x: 450, y: 192 });
    assert.equal(worldConfig.ART_PIXEL_SIZE, 1);
    assert.equal(worldConfig.GROUND_SOURCE_SCALE, 2);
    assert.equal(worldConfig.TEXTURE_TO_WORLD_SCALE, 0.5);
    assert.equal(worldConfig.SPRITE_FRAME_SIZE, 320);
    assert.equal(worldConfig.SPRITE_WORLD_FRAME_SIZE, 160);
    assert.equal(worldConfig.SPRITE_SCREEN_FRAME_SIZE, 320);
    assert.equal(
      worldConfig.SPRITE_SCREEN_FRAME_SIZE,
      worldConfig.SPRITE_WORLD_FRAME_SIZE * worldConfig.CAMERA_ZOOM,
    );
    assert.equal(worldConfig.PLAYER_SPEED, 144);
    assert.deepEqual(worldConfig.PLAYER_BODY, {
      height: 24,
      offsetX: 56,
      offsetY: 136,
      width: 48,
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
    assert.equal(tree.y, 300);
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
    assert.match(stage, /antialias:\s*false/);
    assert.match(stage, /pixelArt:\s*true/);
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
    assert.match(stage, /peppa-town-sheet-320\.png/);
    assert.match(
      stage,
      /ART_CACHE_QUERY = "\?art-revision=20260806-detailed-redraw"/,
    );
    assert.match(
      stage,
      /this\.load\.image\(\s*"lesson-garden-ground",\s*assetSource\("lesson-garden-ground\.png"\)/,
    );
    assert.match(stage, /\.setScale\(TEXTURE_TO_WORLD_SCALE\)/);
    assert.doesNotMatch(stage, /\.setDisplaySize\(/);
    assert.doesNotMatch(stage, /Phaser\.Scale\.MAX_ZOOM/);
    assert.doesNotMatch(stage, /tiny-town\.png|peppa-sheet\.png/);
    assert.doesNotMatch(stage, /foreground\.png|SCENERY_COLLIDERS|FOREGROUND_DEPTH|make\.tilemap/);
    assert.doesNotMatch(stage, /requestAnimationFrame|setInterval|moveActor|getSpriteFrame/);
  });

  it("uses genuine detailed redraws while preserving the 720x480 world", () => {
    assert.deepEqual(pixelAsset("peppa-town-sheet-320.png"), {
      bytes: 524100,
      filename: "peppa-town-sheet-320.png",
      height: 1280,
      sha256: "b2ac4824a83c5172e0501d415b9fda559dcf2b4ebc133676734bf80502d8dbb2",
      width: 1280,
    });
    assert.deepEqual(pixelAsset("lesson-garden-ground.png"), {
      bytes: 23342,
      filename: "lesson-garden-ground.png",
      height: 960,
      sha256: "6cc2414da7e96e63ab7562675073d94e8f6f4f5045be0a5558c1ed66b0a020e6",
      width: 1440,
    });
    assert.deepEqual(
      pixelAssetCatalog.assets
        .filter(({ filename }) => filename.startsWith("garden-"))
        .map(({ filename, height, width }) => ({ filename, height, width })),
      [
        { filename: "garden-tree-ball.png", height: 576, width: 432 },
        { filename: "garden-flowers.png", height: 168, width: 240 },
        { filename: "garden-basket.png", height: 96, width: 144 },
        { filename: "garden-market.png", height: 240, width: 360 },
      ],
    );
  });

  it("records the authored detail grid, screen mapping, palette, and hashes", () => {
    assert.deepEqual(pixelAssetCatalog.quality, {
      alpha: "hard",
      groundSourceScale: worldConfig.GROUND_SOURCE_SCALE,
      paletteColors: 141,
      spriteDetailPixelSize: worldConfig.ART_PIXEL_SIZE,
      spriteFrameScreenSize: worldConfig.SPRITE_SCREEN_FRAME_SIZE,
      spriteFrameSourceSize: worldConfig.SPRITE_FRAME_SIZE,
      spriteRenderScale: worldConfig.TEXTURE_TO_WORLD_SCALE,
      spriteScreenTexelScale:
        worldConfig.TEXTURE_TO_WORLD_SCALE * worldConfig.CAMERA_ZOOM,
    });
    assert.ok(pixelAssetCatalog.quality.paletteColors <= 160);
    assert.ok(
      pixelAssetCatalog.assets.every(
        ({ height, sha256, width }) =>
          height % worldConfig.ART_PIXEL_SIZE === 0 &&
          width % worldConfig.ART_PIXEL_SIZE === 0 &&
          /^[a-f0-9]{64}$/.test(sha256),
      ),
    );
  });

  it("keeps the green lawn while transparency uses a neutral backdrop", () => {
    const main = projectFile("prototypes/pixel-stage/main.ts");
    assert.match(main, /GRASS_BACKGROUND_COLOR = 0x8dce17/);
    assert.match(main, /transparent:\s*true/);
    assert.doesNotMatch(main, /backgroundColor:\s*"#8ad51b"/);
  });

  it("pins the redrawn tree bytes that preserve its authored canopy gaps", () => {
    assert.equal(
      pixelAsset("garden-tree-ball.png").sha256,
      "25bb33fd5829ea6a1f6ade658a176d42d7f5a1d75c641e902e337b65673139db",
    );
  });

  it("builds the prototype as a Vite HTML entry instead of an unbundled public script", () => {
    const html = projectFile("prototypes/pixel-stage/index.html");
    const viteConfig = projectFile("vite.config.ts");

    assert.match(html, /<script type="module" src="\.\/main\.ts"><\/script>/);
    assert.match(viteConfig, /pixelStage:\s*resolve\([^)]*"prototypes\/pixel-stage\/index\.html"/s);
  });
});
