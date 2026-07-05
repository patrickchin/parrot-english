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

const expectedSprites = {
  "peppa-happy.webp": {
    width: 775,
    height: 910,
    rgbSha256: "ed3a99f03e2ee7dd773c6bc8430f52e526a9c3bbb19908558a6b78c93c1e49c9",
    eyes: [
      { x: 314, y: 304, width: 34, height: 34 },
      { x: 362, y: 279, width: 31, height: 31 },
    ],
  },
  "peppa-idle.webp": {
    width: 1157,
    height: 1359,
    rgbSha256: "1378e5b53c570dba1f2273fe7e9cfd6d17af15fd39aa0ca8a797b9faf5c91695",
    shoes: [
      { x: 438, y: 1010, width: 103, height: 49 },
      { x: 610, y: 1010, width: 103, height: 49 },
    ],
  },
  "peppa-listening.webp": {
    width: 910,
    height: 809,
    rgbSha256: "867a9b5b8596f8e73876198f77ef1c7febe1c1876085151244ae855b0127cd18",
    eyes: [
      { x: 396, y: 173, width: 34, height: 39 },
      { x: 458, y: 199, width: 36, height: 41 },
    ],
  },
  "peppa-sad.webp": {
    width: 1170,
    height: 1344,
    rgbSha256: "96afceee9e68b63767f70d2a30d7a3316f11f8fb88076c56b0b97c45610f0421",
    shoes: [
      { x: 450, y: 1015, width: 102, height: 44 },
      { x: 619, y: 1015, width: 102, height: 44 },
    ],
  },
  "peppa-surprised.webp": {
    width: 910,
    height: 829,
    rgbSha256: "b6d6e92959930c1f0e45747c01f5ef62282fcf43c9c75346d1f85f5d9412dfb2",
    eyes: [
      { x: 308, y: 159, width: 59, height: 63 },
      { x: 393, y: 118, width: 55, height: 59 },
    ],
  },
  "peppa-talking.webp": {
    width: 910,
    height: 809,
    rgbSha256: "36f4cd5be9f397d89de568ad20c33f0b3da27843564a47e4436a46a253a27006",
    eyes: [
      { x: 391, y: 196, width: 41, height: 46 },
      { x: 462, y: 166, width: 38, height: 41 },
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

function alphasInRegion({ width, rgba }, region) {
  const alphas = [];

  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      alphas.push(rgba[(y * width + x) * 4 + 3]);
    }
  }

  return alphas;
}

describe("Peppa sprite alpha", { skip: !dwebpAvailable }, () => {
  it("preserves the exact RGB artwork, dimensions, and transparent exterior", () => {
    for (const [fileName, expected] of Object.entries(expectedSprites)) {
      const decoded = decodePam(fileName);
      const cornerAlphas = [
        decoded.rgba[3],
        decoded.rgba[(decoded.width - 1) * 4 + 3],
        decoded.rgba[(decoded.height - 1) * decoded.width * 4 + 3],
        decoded.rgba[(decoded.width * decoded.height - 1) * 4 + 3],
      ];

      assert.equal(decoded.width, expected.width, `${fileName} width`);
      assert.equal(decoded.height, expected.height, `${fileName} height`);
      assert.equal(rgbSha256(decoded.rgba), expected.rgbSha256, `${fileName} RGB`);
      assert.deepEqual(cornerAlphas, [0, 0, 0, 0], `${fileName} exterior`);
    }
  });

  it("keeps every internal eye pixel fully opaque", () => {
    for (const [fileName, expected] of Object.entries(expectedSprites)) {
      if (!expected.eyes) continue;

      const decoded = decodePam(fileName);
      for (const eye of expected.eyes) {
        assert.ok(
          alphasInRegion(decoded, eye).every((alpha) => alpha === 255),
          `${fileName} has transparent pixels inside an eye`
        );
      }
    }
  });

  it("keeps visible shoe pixels fully opaque", () => {
    for (const [fileName, expected] of Object.entries(expectedSprites)) {
      if (!expected.shoes) continue;

      const decoded = decodePam(fileName);
      for (const shoe of expected.shoes) {
        assert.ok(
          alphasInRegion(decoded, shoe).every(
            (alpha) => alpha === 0 || alpha === 255
          ),
          `${fileName} has partially transparent pixels inside a shoe`
        );
      }
    }
  });
});
