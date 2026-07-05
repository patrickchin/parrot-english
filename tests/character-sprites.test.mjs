import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const charactersDir = fileURLToPath(
  new URL("../public/assets/characters", import.meta.url)
);
const dwebpAvailable = spawnSync("dwebp", ["-version"], {
  stdio: "ignore",
}).status === 0;
const targetGeometry = {
  peppa: {
    width: 1024,
    height: 1024,
    bodyTop: 80,
    bodyHeight: 860,
    centerX: 512,
    baseline: 940,
    tolerance: 1,
  },
  dolly: {
    width: 1024,
    height: 1024,
    bodyTop: 220,
    bodyHeight: 720,
    centerX: 512,
    baseline: 940,
    tolerance: 1,
  },
};

const expectedAssets = {
  "peppa-happy.webp": {
    character: "peppa",
    rgbSha256: "abbeb803a5cda0cb74eb7e2b38333a9309292b2ac4d19b0125e096c9e12f6b38",
    source: { width: 775, height: 910, top: 226, bottom: 732, centerX: 355.5 },
    sourceEyes: [
      { x: 314, y: 304, width: 34, height: 34 },
      { x: 362, y: 279, width: 31, height: 31 },
    ],
    sourceEyeSamples: [{ x: 321, y: 320 }, { x: 367, y: 292 }],
  },
  "peppa-idle.webp": {
    character: "peppa",
    rgbSha256: "eefc9d259520a47ac2ae74f099256e2914c7d4dd9d295759b7f663026a6bdc68",
    source: { width: 1157, height: 1359, top: 281, bottom: 1051, centerX: 557 },
  },
  "peppa-listening.webp": {
    character: "peppa",
    rgbSha256: "c9745b287e1de39230926cb002e97dbfd06bb419e6f4b81e4dfd68bfe15210a4",
    source: { width: 910, height: 809, top: 91, bottom: 707, centerX: 478 },
    sourceEyes: [
      { x: 396, y: 173, width: 34, height: 39 },
      { x: 458, y: 199, width: 36, height: 41 },
    ],
    sourceEyeSamples: [{ x: 425, y: 192 }, { x: 486, y: 222 }],
  },
  "peppa-sad.webp": {
    character: "peppa",
    rgbSha256: "1ad4959fa22c8a0d54429494ea4481cc483bbfda2c6ddc16a3d47ab7adc79170",
    source: { width: 1170, height: 1344, top: 222, bottom: 1059, centerX: 556 },
  },
  "peppa-surprised.webp": {
    character: "peppa",
    rgbSha256: "c932e4bfb5ed6e204e12bfb8790adeef514b64c233c28e1063171088ad3e9fd5",
    source: { width: 910, height: 829, top: 18, bottom: 796, centerX: 345.5 },
    sourceEyes: [
      { x: 308, y: 159, width: 59, height: 63 },
      { x: 393, y: 118, width: 55, height: 59 },
    ],
    sourceEyeSamples: [{ x: 320, y: 190 }, { x: 403, y: 146 }],
  },
  "peppa-talking.webp": {
    character: "peppa",
    rgbSha256: "c2353c0f64de27efff3daccc3055d5b88443f9bf01ddfdc229af31a1f02fdf37",
    source: { width: 910, height: 809, top: 87, bottom: 722, centerX: 442 },
    sourceEyes: [
      { x: 391, y: 196, width: 41, height: 46 },
      { x: 462, y: 166, width: 38, height: 41 },
    ],
    sourceEyeSamples: [{ x: 399, y: 220 }, { x: 469, y: 186 }],
  },
  "dolly-happy.webp": {
    character: "dolly",
    rgbSha256: "ecf5d16adf5966fbb44c8842e8ce114ecdf79faae4c8ff1c0d7a8bc41177bd56",
    source: { width: 777, height: 1024, top: 283, bottom: 777, centerX: 418 },
    sourceEyes: [{ x: 404, y: 358, width: 65, height: 65 }],
    sourceEyeSamples: [{ x: 450, y: 375 }],
    sourceExteriorSamples: [{ x: 450, y: 283, maxAlpha: 32 }],
  },
  "dolly-idle.webp": {
    character: "dolly",
    rgbSha256: "9f91ae0dfef586b50f6bbb343058d1723316ea94a22ad5d822e046420bd4ae15",
    source: { width: 1092, height: 1441, top: 360, bottom: 1102, centerX: 525.5 },
    sourceGrayTail: { x: 600, y: 600, width: 492, height: 500 },
  },
  "dolly-listening.webp": {
    character: "dolly",
    rgbSha256: "3465d3e7f51d7c6f9eac3ece93f48c285046ce05befa8142ac34f923a3964106",
    source: { width: 1086, height: 1448, top: 357, bottom: 1113, centerX: 535 },
    sourceGrayTail: { x: 600, y: 600, width: 486, height: 500 },
  },
  "dolly-sad.webp": {
    character: "dolly",
    rgbSha256: "bd9c157c7cabb5b86b7dd0f18f7535cca377450fdcc31d8cacfb63f5b1080560",
    source: { width: 1054, height: 1492, top: 315, bottom: 1177, centerX: 491 },
    sourceGrayTail: { x: 580, y: 600, width: 474, height: 550 },
  },
  "dolly-surprised.webp": {
    character: "dolly",
    rgbSha256: "41d336ff4cfb0770b0aeac7e959e99c0781ea9fff1e3c697594d8dd8040530a8",
    source: { width: 1086, height: 1448, top: 353, bottom: 1118, centerX: 519.5 },
    sourceGrayTail: { x: 600, y: 600, width: 486, height: 500 },
  },
  "dolly-talking.webp": {
    character: "dolly",
    rgbSha256: "68703519db3f6686068dea24e7f74b27d735a145578b92b54ae1dda4fd5490e1",
    source: { width: 1088, height: 1445, top: 358, bottom: 1118, centerX: 469 },
    sourceGrayTail: { x: 600, y: 600, width: 488, height: 500 },
  },
};

function assetPath(fileName, character) {
  return join(charactersDir, character, fileName);
}

function decodePam(fileName, expected) {
  const pam = execFileSync(
    "dwebp",
    [assetPath(fileName, expected.character), "-pam", "-o", "-"],
    { maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }
  );
  const headerEnd = pam.indexOf(Buffer.from("ENDHDR\n")) + "ENDHDR\n".length;
  const header = pam.subarray(0, headerEnd).toString();
  const width = Number(header.match(/WIDTH (\d+)/)?.[1]);
  const height = Number(header.match(/HEIGHT (\d+)/)?.[1]);

  assert.match(header, /DEPTH 4/);
  assert.match(header, /TUPLTYPE RGB_ALPHA/);

  return { width, height, rgba: pam.subarray(headerEnd) };
}

function rgbSha256(rgba) {
  const rgb = Buffer.allocUnsafe((rgba.length / 4) * 3);

  for (let source = 0, target = 0; source < rgba.length; source += 4) {
    rgb[target++] = rgba[source];
    rgb[target++] = rgba[source + 1];
    rgb[target++] = rgba[source + 2];
  }

  return createHash("sha256").update(rgb).digest("hex");
}

function normalizationTransform(expected) {
  const target = targetGeometry[expected.character];
  const scale = target.bodyHeight / (expected.source.bottom - expected.source.top);
  const scaledWidth = Math.round(expected.source.width * scale);
  const scaledHeight = Math.round(expected.source.height * scale);
  const scaleX = scaledWidth / expected.source.width;
  const scaleY = scaledHeight / expected.source.height;

  return {
    scaleX,
    scaleY,
    offsetX: Math.round(target.centerX - expected.source.centerX * scaleX),
    offsetY: Math.round(target.bodyTop - expected.source.top * scaleY),
  };
}

function transformRegion(expected, region) {
  const transform = normalizationTransform(expected);
  const minX = Math.floor(region.x * transform.scaleX + transform.offsetX);
  const minY = Math.floor(region.y * transform.scaleY + transform.offsetY);
  const maxX = Math.ceil(
    (region.x + region.width) * transform.scaleX + transform.offsetX
  );
  const maxY = Math.ceil(
    (region.y + region.height) * transform.scaleY + transform.offsetY
  );

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function pixelsInRegion({ width, rgba }, region) {
  const pixels = [];

  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const offset = (y * width + x) * 4;
      pixels.push({
        r: rgba[offset],
        g: rgba[offset + 1],
        b: rgba[offset + 2],
        a: rgba[offset + 3],
        x,
        y,
      });
    }
  }

  return pixels;
}

function connectedComponents(decoded, predicate) {
  const { width, height, rgba } = decoded;
  const candidates = new Uint8Array(width * height);
  const seen = new Uint8Array(width * height);
  const components = [];

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (
      predicate({
        r: rgba[offset],
        g: rgba[offset + 1],
        b: rgba[offset + 2],
        a: rgba[offset + 3],
        x,
        y,
      })
    ) {
      candidates[pixel] = 1;
    }
  }

  for (let pixel = 0; pixel < candidates.length; pixel += 1) {
    if (!candidates[pixel] || seen[pixel]) continue;

    const stack = [pixel];
    const component = {
      count: 0,
      minX: width,
      maxX: 0,
      minY: height,
      maxY: 0,
    };
    seen[pixel] = 1;

    while (stack.length > 0) {
      const current = stack.pop();
      const x = current % width;
      const y = Math.floor(current / width);
      component.count += 1;
      component.minX = Math.min(component.minX, x);
      component.maxX = Math.max(component.maxX, x);
      component.minY = Math.min(component.minY, y);
      component.maxY = Math.max(component.maxY, y);

      for (
        let neighborY = Math.max(0, y - 1);
        neighborY <= Math.min(height - 1, y + 1);
        neighborY += 1
      ) {
        for (
          let neighborX = Math.max(0, x - 1);
          neighborX <= Math.min(width - 1, x + 1);
          neighborX += 1
        ) {
          const neighbor = neighborY * width + neighborX;
          if (candidates[neighbor] && !seen[neighbor]) {
            seen[neighbor] = 1;
            stack.push(neighbor);
          }
        }
      }
    }

    if (component.count >= 50) components.push(component);
  }

  return components.sort((left, right) => right.count - left.count);
}

function measureBodyGeometry(decoded, character) {
  const mainSupport = connectedComponents(decoded, ({ a }) => a >= 128)[0];
  const torso = connectedComponents(decoded, ({ r, g, b, a, y }) => {
    if (a < 200 || y < 250) return false;
    if (character === "peppa") {
      return r > 180 && g < 130 && b < 130 && r > g + 70;
    }
    return g > 100 && g > r * 1.1 && g > b * 1.1;
  })[0];
  let baseline = mainSupport.maxY + 1;

  if (character === "peppa") {
    const shoes = connectedComponents(
      decoded,
      ({ r, g, b, a, y }) =>
        a >= 128 && y >= 860 && Math.max(r, g, b) < 100
    ).slice(0, 2);
    baseline = Math.max(...shoes.map((shoe) => shoe.maxY + 1));
  }

  return {
    bodyTop: mainSupport.minY,
    centerX: (torso.minX + torso.maxX + 1) / 2,
    baseline,
  };
}

function hasTransparentNeighbor(decoded, x, y, radius = 2) {
  const { width, height, rgba } = decoded;
  for (let neighborY = Math.max(0, y - radius); neighborY <= Math.min(height - 1, y + radius); neighborY += 1) {
    for (let neighborX = Math.max(0, x - radius); neighborX <= Math.min(width - 1, x + radius); neighborX += 1) {
      if (rgba[(neighborY * width + neighborX) * 4 + 3] === 0) return true;
    }
  }
  return false;
}

describe("character sprite artwork", { skip: !dwebpAvailable }, () => {
  it("normalizes every asset to one transparent canvas", () => {
    for (const [fileName, expected] of Object.entries(expectedAssets)) {
      const decoded = decodePam(fileName, expected);
      const target = targetGeometry[expected.character];
      const cornerAlphas = [
        decoded.rgba[3],
        decoded.rgba[(decoded.width - 1) * 4 + 3],
        decoded.rgba[(decoded.height - 1) * decoded.width * 4 + 3],
        decoded.rgba[(decoded.width * decoded.height - 1) * 4 + 3],
      ];

      assert.equal(decoded.width, target.width, `${fileName} width`);
      assert.equal(decoded.height, target.height, `${fileName} height`);
      assert.deepEqual(cornerAlphas, [0, 0, 0, 0], `${fileName} corners`);
    }
  });

  it("uses a consistent scale, center, and baseline for each character", () => {
    for (const [fileName, expected] of Object.entries(expectedAssets)) {
      const decoded = decodePam(fileName, expected);
      const target = targetGeometry[expected.character];
      const measured = measureBodyGeometry(decoded, expected.character);
      const tolerance = target.tolerance;

      assert.ok(
        Math.abs(measured.bodyTop - target.bodyTop) <= tolerance,
        `${fileName} body top`
      );
      assert.ok(
        Math.abs(measured.baseline - measured.bodyTop - target.bodyHeight) <= tolerance,
        `${fileName} body height`
      );
      assert.ok(
        Math.abs(measured.centerX - target.centerX) <= tolerance,
        `${fileName} center`
      );
      assert.ok(
        Math.abs(measured.baseline - target.baseline) <= tolerance,
        `${fileName} baseline`
      );
    }
  });

  it("confines partial alpha to a two-pixel artwork boundary", () => {
    for (const [fileName, expected] of Object.entries(expectedAssets)) {
      const decoded = decodePam(fileName, expected);
      for (let y = 0; y < decoded.height; y += 1) {
        for (let x = 0; x < decoded.width; x += 1) {
          const alpha = decoded.rgba[(y * decoded.width + x) * 4 + 3];
          if (alpha === 0 || alpha === 255) continue;
          assert.ok(
            hasTransparentNeighbor(decoded, x, y),
            `${fileName} translucent interior at ${x},${y}`
          );
        }
      }
    }
  });

  it("renders repaired sclera as opaque white while preserving pupils", () => {
    for (const [fileName, expected] of Object.entries(expectedAssets)) {
      if (!expected.sourceEyes) continue;
      const decoded = decodePam(fileName, expected);

      for (const [eyeIndex, sourceEye] of expected.sourceEyes.entries()) {
        const eyePixels = pixelsInRegion(
          decoded,
          transformRegion(expected, sourceEye)
        );
        const pupilPixels = eyePixels.filter(
          ({ r, g, b, a }) => a === 255 && Math.max(r, g, b) < 80
        );
        const transform = normalizationTransform(expected);
        const sample = expected.sourceEyeSamples[eyeIndex];
        const sampleX = Math.round(sample.x * transform.scaleX + transform.offsetX);
        const sampleY = Math.round(sample.y * transform.scaleY + transform.offsetY);
        const sampleOffset = (sampleY * decoded.width + sampleX) * 4;
        const scleraPixel = decoded.rgba.subarray(sampleOffset, sampleOffset + 4);

        assert.ok(pupilPixels.length > 0, `${fileName} pupil`);
        assert.ok(
          scleraPixel[0] >= 245 &&
            scleraPixel[1] >= 245 &&
            scleraPixel[2] >= 245 &&
            scleraPixel[3] === 255,
          `${fileName} sclera color at ${sampleX},${sampleY}`
        );
      }
    }
  });

  it("does not promote low-alpha checkerboard fringe into artwork", () => {
    for (const [fileName, expected] of Object.entries(expectedAssets)) {
      if (!expected.sourceExteriorSamples) continue;
      const decoded = decodePam(fileName, expected);
      const transform = normalizationTransform(expected);

      for (const sample of expected.sourceExteriorSamples) {
        const x = Math.round(sample.x * transform.scaleX + transform.offsetX);
        const y = Math.round(sample.y * transform.scaleY + transform.offsetY);
        const alpha = decoded.rgba[(y * decoded.width + x) * 4 + 3];

        assert.ok(
          alpha <= sample.maxAlpha,
          `${fileName} checkerboard fringe at ${x},${y}: alpha ${alpha}`
        );
      }
    }
  });

  it("keeps gray Dolly tails free of warm line contamination", () => {
    for (const [fileName, expected] of Object.entries(expectedAssets)) {
      if (!expected.sourceGrayTail) continue;
      const decoded = decodePam(fileName, expected);
      const tailPixels = pixelsInRegion(
        decoded,
        transformRegion(expected, expected.sourceGrayTail)
      );
      const warmPixels = tailPixels.filter(
        ({ r, g, a }) => a > 0 && r > g + 8
      );

      assert.equal(
        warmPixels.length,
        0,
        `${fileName} warm tail pixels`
      );
    }
  });

  it("matches the approved decoded RGB artwork", () => {
    for (const [fileName, expected] of Object.entries(expectedAssets)) {
      if (!expected.rgbSha256) continue;
      assert.equal(
        rgbSha256(decodePam(fileName, expected).rgba),
        expected.rgbSha256,
        `${fileName} RGB`
      );
    }
  });
});
