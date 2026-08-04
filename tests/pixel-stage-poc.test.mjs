import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const projectFile = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const packageManifest = JSON.parse(projectFile("package.json"));
const worldConfig = await import(
  "../prototypes/pixel-stage/world-config.js"
);

describe("Phaser pixel stage", () => {
  it("uses the maintained Phaser package as its game engine", () => {
    assert.equal(packageManifest.dependencies.phaser, "4.2.1");
  });

  it("keeps project-specific world data declarative", () => {
    assert.deepEqual(worldConfig.WORLD_SIZE, { height: 160, width: 240 });
    assert.deepEqual(worldConfig.PLAYER_START, { x: 120, y: 112 });
    assert.equal(worldConfig.SPRITE_FRAME_SIZE, 64);
    assert.deepEqual(
      worldConfig.ANIMATIONS.map(({ key, start, end }) => ({ key, start, end })),
      [
        { key: "idle", start: 0, end: 3 },
        { key: "walking", start: 0, end: 3 },
        { key: "talking", start: 4, end: 7 },
        { key: "happy", start: 8, end: 11 },
        { key: "surprised", start: 12, end: 15 },
      ],
    );
    assert.deepEqual(
      worldConfig.SCENERY_COLLIDERS.map(({ name }) => name),
      ["schoolhouse", "tree", "sign", "left fence", "right fence"],
    );
  });

  it("delegates the game loop, input, animation, scaling, and collision to Phaser", () => {
    const stage = projectFile("prototypes/pixel-stage/main.ts");

    assert.match(stage, /new Phaser\.Game\(/);
    assert.match(stage, /Phaser\.Scale\.MAX_ZOOM/);
    assert.match(stage, /this\.physics\.add\.sprite\(/);
    assert.match(stage, /createCursorKeys\(\)/);
    assert.match(stage, /this\.physics\.add\.collider\(/);
    assert.match(stage, /this\.anims\.create\(/);
    assert.doesNotMatch(stage, /requestAnimationFrame|setInterval|moveActor|getSpriteFrame/);
  });

  it("builds the prototype as a Vite HTML entry instead of an unbundled public script", () => {
    const html = projectFile("prototypes/pixel-stage/index.html");
    const viteConfig = projectFile("vite.config.ts");

    assert.match(html, /<script type="module" src="\.\/main\.ts"><\/script>/);
    assert.match(viteConfig, /pixelStage:\s*resolve\([^)]*"prototypes\/pixel-stage\/index\.html"/s);
  });
});
