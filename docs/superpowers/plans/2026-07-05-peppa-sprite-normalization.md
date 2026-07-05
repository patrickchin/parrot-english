# Peppa Sprite Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize all six Peppa pose WebPs onto identical transparent canvases with consistent body scale, dress center, and shoe baseline.

**Architecture:** Measure stable body anchors from the existing decoded artwork: the first half-opaque ear row, the largest red dress component, and the two dark shoe components. Apply one uniform Lanczos scale and translation to the complete pose, including shadows and speaking rays, then restore full alpha to resampled shoe pixels without changing the exterior shadow. Update the focused asset test to verify normalized geometry, transparency, eye/shoe opacity, and approved output hashes.

**Tech Stack:** Node.js test runner, ImageMagick 7, libwebp `dwebp`/`cwebp`, lossless WebP with alpha.

---

### Task 1: Add failing normalized-geometry checks

**Files:**
- Modify: `tests/peppa-alpha.test.mjs`

- [ ] **Step 1: Replace the old per-file dimensions with the shared target**

Set every expected width and height to `1024` and remove the pre-resampling RGB
hashes. Rename the existing regions to `sourceEyes` and `sourceShoes`, add the
source anchors from Task 2, and calculate normalized regions with the same
scale and offsets used by the asset transform. Add source shoe bounds for all
six poses so resampling cannot reintroduce partial shoe alpha.

Add these target constants:

```js
const normalizedGeometry = {
  width: 1024,
  height: 1024,
  bodyTop: 80,
  bodyHeight: 860,
  bodyCenterX: 512,
  shoeBottom: 940,
  tolerance: 1,
};
```

- [ ] **Step 2: Add deterministic body-component helpers**

Add a connected-component helper that accepts a pixel predicate and returns
component bounds sorted by pixel count. Use it to measure:

```js
function measureBodyGeometry(decoded) {
  const { width, height, rgba } = decoded;
  let bodyTop = height;

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    if (rgba[pixel * 4 + 3] >= 128) {
      bodyTop = Math.min(bodyTop, Math.floor(pixel / width));
    }
  }

  const dress = connectedComponents(decoded, ({ r, g, b, a, y }) =>
    a >= 200 && y > 300 && r > 180 && g < 130 && b < 130 && r > g + 70
  )[0];
  const shoes = connectedComponents(decoded, ({ r, g, b, a, y }) =>
    a >= 128 && y >= 860 && Math.max(r, g, b) < 100
  ).slice(0, 2);

  return {
    bodyTop,
    bodyCenterX: (dress.minX + dress.maxX + 1) / 2,
    shoeBottom: Math.max(...shoes.map((shoe) => shoe.maxY + 1)),
  };
}
```

The `connectedComponents` callback receives `{ r, g, b, a, x, y }`; components
smaller than 50 pixels are discarded before sorting.

- [ ] **Step 3: Add the geometry assertion**

```js
it("normalizes every pose to one body scale, center, and baseline", () => {
  for (const fileName of Object.keys(expectedSprites)) {
    const decoded = decodePam(fileName);
    const measured = measureBodyGeometry(decoded);
    const bodyHeight = measured.shoeBottom - measured.bodyTop;

    assert.ok(
      Math.abs(measured.bodyTop - normalizedGeometry.bodyTop) <= 1,
      `${fileName} body top`
    );
    assert.ok(
      Math.abs(bodyHeight - normalizedGeometry.bodyHeight) <= 1,
      `${fileName} body height`
    );
    assert.ok(
      Math.abs(measured.bodyCenterX - normalizedGeometry.bodyCenterX) <= 1,
      `${fileName} body center`
    );
    assert.ok(
      Math.abs(measured.shoeBottom - normalizedGeometry.shoeBottom) <= 1,
      `${fileName} shoe baseline`
    );
  }
});
```

- [ ] **Step 4: Run the test and verify RED**

Run:

```bash
node --test tests/peppa-alpha.test.mjs
```

Expected: FAIL because the current canvases have six different dimensions and
the current body heights and centers are not normalized.

### Task 2: Normalize all six source assets

**Files:**
- Modify: `public/assets/characters/peppa/peppa-happy.webp`
- Modify: `public/assets/characters/peppa/peppa-idle.webp`
- Modify: `public/assets/characters/peppa/peppa-listening.webp`
- Modify: `public/assets/characters/peppa/peppa-sad.webp`
- Modify: `public/assets/characters/peppa/peppa-surprised.webp`
- Modify: `public/assets/characters/peppa/peppa-talking.webp`

- [ ] **Step 1: Use the measured source anchors**

Use this exact source geometry in a one-off Node transform command:

```js
const poses = {
  "peppa-happy.webp": {
    width: 775, height: 910, top: 226, bottom: 732, centerX: 355.5,
    shoes: [[274, 712, 69, 20], [391, 712, 68, 20]],
  },
  "peppa-idle.webp": {
    width: 1157, height: 1359, top: 282, bottom: 1051, centerX: 557,
    shoes: [[438, 1019, 103, 32], [610, 1019, 103, 32]],
  },
  "peppa-listening.webp": {
    width: 910, height: 809, top: 92, bottom: 707, centerX: 478,
    shoes: [[356, 683, 76, 24], [479, 684, 74, 23]],
  },
  "peppa-sad.webp": {
    width: 1170, height: 1344, top: 223, bottom: 1059, centerX: 556,
    shoes: [[450, 1026, 102, 33], [619, 1026, 102, 33]],
  },
  "peppa-surprised.webp": {
    width: 910, height: 829, top: 18, bottom: 796, centerX: 345.5,
    shoes: [[232, 759, 103, 37], [408, 756, 103, 38]],
  },
  "peppa-talking.webp": {
    width: 910, height: 809, top: 88, bottom: 722, centerX: 442,
    shoes: [[345, 696, 83, 26], [483, 695, 83, 26]],
  },
};
```

- [ ] **Step 2: Apply one uniform transform per complete pose**

For each pose calculate:

```js
const scale = 860 / (pose.bottom - pose.top);
const scaledWidth = Math.round(pose.width * scale);
const scaledHeight = Math.round(pose.height * scale);
const scaleX = scaledWidth / pose.width;
const scaleY = scaledHeight / pose.height;
const offsetX = Math.round(512 - pose.centerX * scaleX);
const offsetY = Math.round(80 - pose.top * scaleY);
```

Then run ImageMagick with the source image as a single layer:

```js
execFileSync("magick", [
  "-size", "1024x1024", "canvas:none",
  "(", sourcePath, "-alpha", "set", "-filter", "Lanczos",
  "-resize", `${scaledWidth}x${scaledHeight}!`, ")",
  "-geometry", `${signed(offsetX)}${signed(offsetY)}`,
  "-compose", "over", "-composite",
  "-define", "webp:lossless=true",
  "-define", "webp:exact=true",
  temporaryWebp,
]);
```

Write to temporary files first; do not replace any source until all six outputs
decode as `1024 × 1024` RGBA and have transparent corners.

- [ ] **Step 3: Restore shoe opacity after resampling**

Decode each temporary WebP to PAM with `dwebp`. Map each source shoe rectangle
through `scaleX`, `scaleY`, `offsetX`, and `offsetY`. Inside those mapped bounds,
set alpha to 255 only when the current alpha is nonzero and
`Math.max(r, g, b) < 160`. This selects black shoe artwork while leaving the
gray ground shadows partially transparent.

Re-encode the repaired PAM with:

```bash
cwebp -quiet -lossless -exact -m 6 -q 100 repaired.pam -o normalized.webp
```

Verify that the second encode changes alpha only inside the mapped shoe masks,
then atomically replace the six source WebPs.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test tests/peppa-alpha.test.mjs
```

Expected: PASS for the shared canvas, geometry, transparent exterior, and the
dynamically transformed eye/shoe opacity checks.

### Task 3: Approve and lock the normalized outputs

**Files:**
- Modify: `tests/peppa-alpha.test.mjs`

- [ ] **Step 1: Render visual inspection sheets**

Render all six normalized poses in filename order on both a cyan background and
as alpha-only images. Inspect at full size and confirm equal body scale, common
baseline, centered dresses, preserved effects, no clipping, opaque eyes and
shoes, and transparent unused canvas.

- [ ] **Step 2: Record the approved RGB hashes**

Use `dwebp -pam` and SHA-256 over decoded RGB bytes to capture one approved hash
per file. Replace the old hash values in `expectedSprites` with the six emitted
hashes. Keep the eye and shoe opacity assertions based on the source rectangles
and the shared transform calculation so their geometry cannot drift separately.

- [ ] **Step 3: Run focused verification**

Run:

```bash
node --test tests/peppa-alpha.test.mjs tests/lesson-data.test.mjs tests/web-assets.test.mjs
file public/assets/characters/peppa/*.webp
magick identify -format '%f %wx%h %[channels]\n' public/assets/characters/peppa/*.webp
git diff --check
```

Expected: 13 tests pass; every image reports `1024x1024` with alpha; no text
whitespace errors occur.

- [ ] **Step 4: Review and commit the focused implementation**

Confirm `git status --short` lists only the six Peppa WebPs and
`tests/peppa-alpha.test.mjs`; `.superpowers/` remains untouched.

```bash
git add public/assets/characters/peppa/*.webp tests/peppa-alpha.test.mjs
git commit -m "fix: normalize Peppa sprite framing"
```
