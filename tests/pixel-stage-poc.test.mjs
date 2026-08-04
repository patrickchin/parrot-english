import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { inflateSync } from "node:zlib";

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

const paeth = (left, above, upperLeft) => {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);

  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
    return left;
  }
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
};

const readPngPixels = (path) => {
  const png = readFileSync(new URL(`../${path}`, import.meta.url));
  const chunks = [];
  let width;
  let height;
  let colorType;

  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, `${path} must use 8-bit color channels`);
      colorType = data[9];
      assert.ok(
        colorType === 2 || colorType === 6,
        `${path} must be saved as RGB or RGBA, not an indexed PNG`,
      );
      assert.equal(data[12], 0, `${path} must not be interlaced`);
    } else if (type === "IDAT") {
      chunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  const channels = colorType === 6 ? 4 : 3;
  const packed = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const decoded = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y += 1) {
    const packedRow = y * (stride + 1);
    const filter = packed[packedRow];
    const row = y * stride;

    for (let x = 0; x < stride; x += 1) {
      const raw = packed[packedRow + x + 1];
      const left = x >= channels ? decoded[row + x - channels] : 0;
      const above = y > 0 ? decoded[row + x - stride] : 0;
      const upperLeft = y > 0 && x >= channels
        ? decoded[row + x - stride - channels]
        : 0;
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? above
              : filter === 3
                ? Math.floor((left + above) / 2)
                : paeth(left, above, upperLeft);
      assert.ok(filter >= 0 && filter <= 4, `${path} uses an unknown PNG filter`);
      decoded[row + x] = (raw + predictor) & 0xff;
    }
  }

  const pixels = Buffer.alloc(width * height * 4);
  for (let source = 0, target = 0; source < decoded.length; source += channels) {
    pixels[target] = decoded[source];
    pixels[target + 1] = decoded[source + 1];
    pixels[target + 2] = decoded[source + 2];
    pixels[target + 3] = channels === 4 ? decoded[source + 3] : 255;
    target += 4;
  }

  return { height, pixels, width };
};

const PIXEL_ASSETS = [
  "public/prototypes/pixel-stage/assets/peppa-town-sheet-96.png",
  "public/prototypes/pixel-stage/assets/lesson-garden-ground.png",
  "public/prototypes/pixel-stage/assets/garden-tree-ball.png",
  "public/prototypes/pixel-stage/assets/garden-flowers.png",
  "public/prototypes/pixel-stage/assets/garden-basket.png",
  "public/prototypes/pixel-stage/assets/garden-market.png",
];

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
    assert.equal(worldConfig.ART_PIXEL_SIZE, 2);
    assert.equal(worldConfig.SPRITE_FRAME_SIZE, 96);
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
    assert.match(stage, /peppa-town-sheet-96\.png/);
    assert.doesNotMatch(stage, /\.set(?:DisplaySize|Scale)\(/);
    assert.doesNotMatch(stage, /Phaser\.Scale\.MAX_ZOOM/);
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
      { height: 192, width: 144 },
    );
    assert.deepEqual(
      pngDimensions(
        "public/prototypes/pixel-stage/assets/garden-flowers.png",
      ),
      { height: 56, width: 80 },
    );
    assert.deepEqual(
      pngDimensions(
        "public/prototypes/pixel-stage/assets/garden-basket.png",
      ),
      { height: 32, width: 48 },
    );
    assert.deepEqual(
      pngDimensions(
        "public/prototypes/pixel-stage/assets/garden-market.png",
      ),
      { height: 80, width: 120 },
    );
  });

  it("keeps every visible art pixel on one shared native grid and palette", () => {
    const palette = new Set();

    for (const path of PIXEL_ASSETS) {
      const { height, pixels, width } = readPngPixels(path);
      assert.equal(width % worldConfig.ART_PIXEL_SIZE, 0);
      assert.equal(height % worldConfig.ART_PIXEL_SIZE, 0);

      for (let y = 0; y < height; y += worldConfig.ART_PIXEL_SIZE) {
        for (let x = 0; x < width; x += worldConfig.ART_PIXEL_SIZE) {
          const first = (y * width + x) * 4;
          const expected = pixels.subarray(first, first + 4).toString("hex");

          for (let cellY = 0; cellY < worldConfig.ART_PIXEL_SIZE; cellY += 1) {
            for (let cellX = 0; cellX < worldConfig.ART_PIXEL_SIZE; cellX += 1) {
              const pixel = ((y + cellY) * width + x + cellX) * 4;
              assert.equal(
                pixels.subarray(pixel, pixel + 4).toString("hex"),
                expected,
                `${path} has a pixel outside the shared art grid at ${x + cellX},${y + cellY}`,
              );
            }
          }

          const alpha = pixels[first + 3];
          assert.ok(alpha === 0 || alpha === 255, `${path} uses soft alpha`);
          if (alpha === 255) palette.add(expected.slice(0, 6));
        }
      }
    }

    assert.ok(
      palette.size <= 64,
      `lesson assets use ${palette.size} colors instead of one 64-color palette`,
    );
  });

  it("keeps the green lawn while transparency uses a neutral backdrop", () => {
    const greenColors = (path) => {
      const { pixels } = readPngPixels(path);
      const colors = new Map();

      for (let offset = 0; offset < pixels.length; offset += 4) {
        if (pixels[offset + 3] !== 255) continue;
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        if (green < red * 1.25 || green < blue * 1.5) continue;
        colors.set(`${red},${green},${blue}`, [red, green, blue]);
      }

      return [...colors.values()];
    };
    const { pixels: groundPixels } = readPngPixels(
      "public/prototypes/pixel-stage/assets/lesson-garden-ground.png",
    );
    const groundColorCounts = new Map();

    for (let offset = 0; offset < groundPixels.length; offset += 4) {
      if (groundPixels[offset + 3] !== 255) continue;
      const color = [
        groundPixels[offset],
        groundPixels[offset + 1],
        groundPixels[offset + 2],
      ];
      const key = color.join(",");
      groundColorCounts.set(key, {
        color,
        count: (groundColorCounts.get(key)?.count ?? 0) + 1,
      });
    }

    const dominantGroundColor = [...groundColorCounts.values()].sort(
      (left, right) => right.count - left.count,
    )[0].color;
    assert.deepEqual(
      dominantGroundColor,
      [141, 206, 23],
      "the lesson grass should keep its original bright green",
    );

    assert.deepEqual(
      greenColors(
        "public/prototypes/pixel-stage/assets/garden-tree-ball.png",
      ).sort(),
      [
        [59, 165, 24],
        [97, 179, 21],
        [103, 181, 22],
      ].sort(),
      "the tree should keep its natural green palette",
    );
    assert.deepEqual(
      greenColors(
        "public/prototypes/pixel-stage/assets/garden-flowers.png",
      ).sort(),
      [
        [59, 165, 24],
        [78, 172, 24],
        [97, 179, 21],
        [103, 181, 22],
      ].sort(),
      "the flowers should keep their natural green palette",
    );

    const main = projectFile("prototypes/pixel-stage/main.ts");
    assert.match(main, /transparent:\s*true/);
    assert.doesNotMatch(main, /backgroundColor:\s*"#8ad51b"/);
  });

  it("keeps the tree's canopy gaps free of stray opaque pixels", () => {
    const { pixels, width } = readPngPixels(
      "public/prototypes/pixel-stage/assets/garden-tree-ball.png",
    );
    const clearedCanopyRegions = [
      { height: 2, width: 2, x: 102, y: 32 },
      { height: 2, width: 2, x: 100, y: 34 },
      { height: 4, width: 6, x: 42, y: 58 },
      { height: 2, width: 2, x: 32, y: 74 },
      { height: 2, width: 2, x: 66, y: 78 },
      { height: 2, width: 2, x: 36, y: 80 },
      { height: 6, width: 4, x: 96, y: 90 },
      { height: 2, width: 6, x: 38, y: 94 },
      { height: 2, width: 2, x: 92, y: 108 },
    ];

    for (const region of clearedCanopyRegions) {
      for (let y = region.y; y < region.y + region.height; y += 1) {
        for (let x = region.x; x < region.x + region.width; x += 1) {
          assert.equal(
            pixels[(y * width + x) * 4 + 3],
            0,
            `the tree has an opaque fragment at ${x},${y}`,
          );
        }
      }
    }
  });

  it("builds the prototype as a Vite HTML entry instead of an unbundled public script", () => {
    const html = projectFile("prototypes/pixel-stage/index.html");
    const viteConfig = projectFile("vite.config.ts");

    assert.match(html, /<script type="module" src="\.\/main\.ts"><\/script>/);
    assert.match(viteConfig, /pixelStage:\s*resolve\([^)]*"prototypes\/pixel-stage\/index\.html"/s);
  });
});
