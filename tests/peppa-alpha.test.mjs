import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const peppaDir = fileURLToPath(
  new URL("../public/assets/characters/peppa", import.meta.url)
);
const dwebpAvailable = spawnSync("dwebp", ["-version"], {
  stdio: "ignore",
}).status === 0;
const normalizedGeometry = {
  width: 1024,
  height: 1024,
  bodyTop: 80,
  bodyHeight: 860,
  bodyCenterX: 512,
  shoeBottom: 940,
  tolerance: 1,
};

const expectedSprites = {
  "peppa-happy.webp": {
    rgbSha256: "2094ffa8986e06e50deb7f2af436a2685d532b7520e29e698df4e958a9adcd9f",
    source: {
      width: 775,
      height: 910,
      top: 226,
      bottom: 732,
      centerX: 355.5,
    },
    sourceEyes: [
      { x: 314, y: 304, width: 34, height: 34 },
      { x: 362, y: 279, width: 31, height: 31 },
    ],
    sourceShoes: [
      { x: 274, y: 712, width: 69, height: 20 },
      { x: 391, y: 712, width: 68, height: 20 },
    ],
  },
  "peppa-idle.webp": {
    rgbSha256: "ce99aeecce738334d15343d582d85899d3ca8bf9559ee92b299476e4046b470e",
    source: {
      width: 1157,
      height: 1359,
      top: 282,
      bottom: 1051,
      centerX: 557,
    },
    sourceShoes: [
      { x: 438, y: 1019, width: 103, height: 32 },
      { x: 610, y: 1019, width: 103, height: 32 },
    ],
  },
  "peppa-listening.webp": {
    rgbSha256: "0ea7d988f74802abea55166bd4c6aba7a14bac8f4ba90495a9514ba0b22f3486",
    source: {
      width: 910,
      height: 809,
      top: 92,
      bottom: 707,
      centerX: 478,
    },
    sourceEyes: [
      { x: 396, y: 173, width: 34, height: 39 },
      { x: 458, y: 199, width: 36, height: 41 },
    ],
    sourceShoes: [
      { x: 356, y: 683, width: 76, height: 24 },
      { x: 479, y: 684, width: 74, height: 23 },
    ],
  },
  "peppa-sad.webp": {
    rgbSha256: "cba5d3b98bdcb57e7f54a2cb75fbc180c381870fa25fe266a884bbec4210e7d8",
    source: {
      width: 1170,
      height: 1344,
      top: 223,
      bottom: 1059,
      centerX: 556,
    },
    sourceShoes: [
      { x: 450, y: 1026, width: 102, height: 33 },
      { x: 619, y: 1026, width: 102, height: 33 },
    ],
  },
  "peppa-surprised.webp": {
    rgbSha256: "374d388a4f23250661a3f78f3d4bf9b71dce42083c8c4659f27c20f2d215f2fb",
    source: {
      width: 910,
      height: 829,
      top: 18,
      bottom: 796,
      centerX: 345.5,
    },
    sourceEyes: [
      { x: 308, y: 159, width: 59, height: 63 },
      { x: 393, y: 118, width: 55, height: 59 },
    ],
    sourceShoes: [
      { x: 232, y: 759, width: 103, height: 37 },
      { x: 408, y: 756, width: 103, height: 38 },
    ],
  },
  "peppa-talking.webp": {
    rgbSha256: "13f95b4aa22e9b8718caa161b857fed7746aed2f4d5e9726d6c4b1514c6a7e04",
    source: {
      width: 910,
      height: 809,
      top: 88,
      bottom: 722,
      centerX: 442,
    },
    sourceEyes: [
      { x: 391, y: 196, width: 41, height: 46 },
      { x: 462, y: 166, width: 38, height: 41 },
    ],
    sourceShoes: [
      { x: 345, y: 696, width: 83, height: 26 },
      { x: 483, y: 695, width: 83, height: 26 },
    ],
  },
};

function decodePam(fileName) {
  const pam = execFileSync(
    "dwebp",
    [join(peppaDir, fileName), "-pam", "-o", "-"],
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

function normalizationTransform(source) {
  const scale =
    normalizedGeometry.bodyHeight / (source.bottom - source.top);
  const scaledWidth = Math.round(source.width * scale);
  const scaledHeight = Math.round(source.height * scale);
  const scaleX = scaledWidth / source.width;
  const scaleY = scaledHeight / source.height;

  return {
    scaleX,
    scaleY,
    scaledWidth,
    scaledHeight,
    offsetX: Math.round(normalizedGeometry.bodyCenterX - source.centerX * scaleX),
    offsetY: Math.round(normalizedGeometry.bodyTop - source.top * scaleY),
  };
}

function transformRegion(source, region) {
  const transform = normalizationTransform(source);
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

      for (let neighborY = Math.max(0, y - 1); neighborY <= Math.min(height - 1, y + 1); neighborY += 1) {
        for (let neighborX = Math.max(0, x - 1); neighborX <= Math.min(width - 1, x + 1); neighborX += 1) {
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

function measureBodyGeometry(decoded) {
  const { width, height, rgba } = decoded;
  let bodyTop = height;

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    if (rgba[pixel * 4 + 3] >= 128) {
      bodyTop = Math.min(bodyTop, Math.floor(pixel / width));
    }
  }

  const dress = connectedComponents(
    decoded,
    ({ r, g, b, a, y }) =>
      a >= 200 && y > 300 && r > 180 && g < 130 && b < 130 && r > g + 70
  )[0];
  const shoes = connectedComponents(
    decoded,
    ({ r, g, b, a, y }) =>
      a >= 128 && y >= 860 && Math.max(r, g, b) < 100
  ).slice(0, 2);

  return {
    bodyTop,
    bodyCenterX: (dress.minX + dress.maxX + 1) / 2,
    shoeBottom: Math.max(...shoes.map((shoe) => shoe.maxY + 1)),
  };
}

describe("Peppa sprite normalization", { skip: !dwebpAvailable }, () => {
  it("uses one canvas and keeps its exterior transparent", () => {
    for (const fileName of Object.keys(expectedSprites)) {
      const decoded = decodePam(fileName);
      const cornerAlphas = [
        decoded.rgba[3],
        decoded.rgba[(decoded.width - 1) * 4 + 3],
        decoded.rgba[(decoded.height - 1) * decoded.width * 4 + 3],
        decoded.rgba[(decoded.width * decoded.height - 1) * 4 + 3],
      ];

      assert.equal(decoded.width, normalizedGeometry.width, `${fileName} width`);
      assert.equal(decoded.height, normalizedGeometry.height, `${fileName} height`);
      assert.deepEqual(cornerAlphas, [0, 0, 0, 0], `${fileName} exterior`);
    }
  });

  it("normalizes every pose to one body scale, center, and baseline", () => {
    for (const fileName of Object.keys(expectedSprites)) {
      const decoded = decodePam(fileName);
      const measured = measureBodyGeometry(decoded);
      const bodyHeight = measured.shoeBottom - measured.bodyTop;
      const tolerance = normalizedGeometry.tolerance;

      assert.ok(
        Math.abs(measured.bodyTop - normalizedGeometry.bodyTop) <= tolerance,
        `${fileName} body top`
      );
      assert.ok(
        Math.abs(bodyHeight - normalizedGeometry.bodyHeight) <= tolerance,
        `${fileName} body height`
      );
      assert.ok(
        Math.abs(measured.bodyCenterX - normalizedGeometry.bodyCenterX) <= tolerance,
        `${fileName} body center`
      );
      assert.ok(
        Math.abs(measured.shoeBottom - normalizedGeometry.shoeBottom) <= tolerance,
        `${fileName} shoe baseline`
      );
    }
  });

  it("keeps every internal eye pixel fully opaque", () => {
    for (const [fileName, expected] of Object.entries(expectedSprites)) {
      if (!expected.sourceEyes) continue;

      const decoded = decodePam(fileName);
      for (const sourceEye of expected.sourceEyes) {
        const eye = transformRegion(expected.source, sourceEye);
        assert.ok(
          pixelsInRegion(decoded, eye).every(({ a }) => a === 255),
          `${fileName} has transparent pixels inside an eye`
        );
      }
    }
  });

  it("keeps visible shoe pixels fully opaque", () => {
    for (const [fileName, expected] of Object.entries(expectedSprites)) {
      const decoded = decodePam(fileName);
      for (const sourceShoe of expected.sourceShoes) {
        const shoe = transformRegion(expected.source, sourceShoe);
        const visibleShoePixels = pixelsInRegion(decoded, shoe).filter(
          ({ r, g, b, a }) => a > 0 && Math.max(r, g, b) < 160
        );

        assert.ok(visibleShoePixels.length > 0, `${fileName} shoe mask`);
        assert.ok(
          visibleShoePixels.every(({ a }) => a === 255),
          `${fileName} has partially transparent pixels inside a shoe`
        );
      }
    }
  });

  it("matches the approved normalized RGB artwork", () => {
    for (const [fileName, expected] of Object.entries(expectedSprites)) {
      if (!expected.rgbSha256) continue;
      assert.equal(rgbSha256(decodePam(fileName).rgba), expected.rgbSha256);
    }
  });
});
