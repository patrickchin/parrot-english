# Character Sprite Opacity and Feathering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild all six Peppa and six Dolly sprites with solid interior color, white Peppa sclera, smooth outer antialiasing, and consistent normalized framing.

**Architecture:** Decode the twelve source WebPs from commit `f5db001`, convert every nonzero-alpha source pixel to solid artwork support, and explicitly repair Peppa's transparent sclera with white RGB. Transform each complete pose to a shared canvas using character-specific body heights, render through a four-times supersampled intermediate, then constrain partial alpha to the final two-pixel artwork boundary.

**Tech Stack:** Node.js test runner, ImageMagick 7, libwebp `dwebp`/`cwebp`, lossless WebP with alpha.

---

### Task 1: Add failing solid-interior and Dolly-normalization checks

**Files:**
- Rename: `tests/peppa-alpha.test.mjs` → `tests/character-sprites.test.mjs`

- [ ] **Step 1: Expand the expected asset table to both characters**

Keep Peppa's existing source geometry and add these Dolly source anchors from
the largest connected bird support and green torso component:

```js
const targetGeometry = {
  peppa: { width: 1024, height: 1024, bodyTop: 80, bodyHeight: 860, centerX: 512, baseline: 940 },
  dolly: { width: 1024, height: 1024, bodyTop: 220, bodyHeight: 720, centerX: 512, baseline: 940 },
};

const dollySources = {
  "dolly-happy.webp": { width: 777, height: 1024, top: 283, bottom: 777, centerX: 418 },
  "dolly-idle.webp": { width: 1092, height: 1441, top: 360, bottom: 1102, centerX: 525.5 },
  "dolly-listening.webp": { width: 1086, height: 1448, top: 357, bottom: 1113, centerX: 535 },
  "dolly-sad.webp": { width: 1054, height: 1492, top: 315, bottom: 1177, centerX: 491 },
  "dolly-surprised.webp": { width: 1086, height: 1448, top: 353, bottom: 1118, centerX: 519.5 },
  "dolly-talking.webp": { width: 1088, height: 1445, top: 358, bottom: 1118, centerX: 469 },
};
```

Use `public/assets/characters/{character}` as the decoded asset directory and
retain the existing transform calculation with each character's target body
height and top.

- [ ] **Step 2: Add boundary-distance alpha assertions**

For every decoded output pixel, search a Chebyshev radius of two pixels for
alpha `0`. Assert:

```js
if (pixel.a > 0 && !hasTransparentNeighborWithinTwoPixels) {
  assert.equal(pixel.a, 255, `${fileName} translucent interior at ${x},${y}`);
}

if (pixel.a > 0 && pixel.a < 255) {
  assert.ok(
    hasTransparentNeighborWithinTwoPixels,
    `${fileName} partial alpha outside feather boundary at ${x},${y}`
  );
}
```

This permits antialiasing only at artwork/negative-space boundaries and rejects
the broad translucency currently present in Dolly happy, tail feathers, Peppa
fills, and linework.

- [ ] **Step 3: Add Peppa sclera color assertions**

Map the four existing source eye rectangles through Peppa's transform. Require
all non-pupil pixels inside those masks to be opaque near-white and require each
mask to retain at least one dark opaque pupil pixel:

```js
const pupilPixels = pixels.filter(({ r, g, b, a }) =>
  a === 255 && Math.max(r, g, b) < 80
);
const scleraPixels = pixels.filter(({ r, g, b }) =>
  Math.max(r, g, b) >= 80 && Math.max(r, g, b) - Math.min(r, g, b) <= 20
);

assert.ok(pupilPixels.length > 0, `${fileName} pupil`);
assert.ok(
  scleraPixels.every(({ r, g, b, a }) =>
    a === 255 && r >= 245 && g >= 245 && b >= 245
  ),
  `${fileName} sclera`
);
```

- [ ] **Step 4: Run the test and verify RED**

Run:

```bash
node --test tests/character-sprites.test.mjs
```

Expected: FAIL because Dolly canvases are not normalized, Dolly happy and
multiple effects contain translucent interiors, and Peppa sclera RGB is dark.

### Task 2: Rebuild the twelve normalized sprites

**Files:**
- Modify: `public/assets/characters/peppa/*.webp`
- Modify: `public/assets/characters/dolly/*.webp`

- [ ] **Step 1: Decode reproducible sources**

For each expected filename, read the binary source with:

```js
const sourceWebp = execFileSync("git", [
  "show",
  `f5db001:public/assets/characters/${character}/${fileName}`,
]);
```

Write sources only to a temporary directory. Decode each to PAM with `dwebp` and
verify its dimensions against the source geometry table before processing.

- [ ] **Step 2: Create solid source artwork**

Copy decoded RGBA and set alpha to `255` for every pixel whose source alpha is
greater than zero. Leave source alpha-zero negative space at zero.

For Peppa's four affected poses, use the source eye rectangles, source alpha,
and neutral-channel RGB to repair sclera without touching pupils or pink
outlines:

```js
const channelSpread = Math.max(r, g, b) - Math.min(r, g, b);
if (insideEyeMask && (sourceAlpha === 0 || (sourceAlpha < 255 && channelSpread <= 25))) {
  r = 255;
  g = 255;
  b = 255;
  a = 255;
}
```

The eye rectangles lie inside the pink eye outlines, so alpha-zero pixels in
those masks are sclera. Pink outline and face pixels have full source alpha or
non-neutral RGB and remain unchanged.

- [ ] **Step 3: Normalize through a supersampled canvas**

For each pose calculate the same uniform transform used by the tests:

```js
const scale = target.bodyHeight / (source.bottom - source.top);
const outputScale = scale * 4;
const scaledWidth = Math.round(source.width * outputScale);
const scaledHeight = Math.round(source.height * outputScale);
const offsetX = Math.round((target.centerX - source.centerX * scale) * 4);
const offsetY = Math.round((target.bodyTop - source.top * scale) * 4);
```

Composite the complete solid-source pose onto a `4096 × 4096` transparent
canvas, then downsample exactly once to `1024 × 1024` with Lanczos RGBA filtering.
Do not independently move wings, tails, effects, shadows, eyes, or linework.

- [ ] **Step 4: Constrain final alpha to the two-pixel boundary**

Decode the final-size temporary output. For each nonzero-alpha pixel with no
alpha-zero neighbor in a Chebyshev radius of two, set alpha to `255`. Preserve
partial alpha for pixels within that boundary distance and preserve all
alpha-zero pixels.

Re-encode as lossless exact WebP:

```bash
cwebp -quiet -lossless -exact -m 6 -q 100 repaired.pam -o normalized.webp
```

Verify all twelve temporary outputs are `1024 × 1024`, have alpha-zero corners,
and contain no clipped support at a canvas boundary before replacing sources.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
node --test tests/character-sprites.test.mjs
```

Expected: PASS for both character geometries, solid interiors, two-pixel edge
feathering, white Peppa sclera, preserved pupils, and transparent exteriors.

### Task 3: Inspect, lock, and commit the approved assets

**Files:**
- Modify: `tests/character-sprites.test.mjs`

- [ ] **Step 1: Render visual contact sheets**

Render all twelve sprites at full normalized size on cyan, white, and black
backgrounds plus alpha-only sheets. Inspect each Peppa and Dolly pose for solid
fills and lines, white Peppa sclera, smooth boundaries, intact gradients,
consistent scale/crop, shared baseline, preserved details, and no clipping.

- [ ] **Step 2: Lock approved decoded RGB hashes**

Compute SHA-256 over decoded RGB bytes for every asset and add the twelve exact
hashes to the expected asset table. Re-run the character asset test so the new
hash assertions execute rather than skip.

- [ ] **Step 3: Run focused verification**

Run:

```bash
node --test tests/character-sprites.test.mjs tests/lesson-data.test.mjs tests/web-assets.test.mjs
file public/assets/characters/{peppa,dolly}/*.webp
magick identify -format '%f %wx%h %[channels]\n' public/assets/characters/{peppa,dolly}/*.webp
git diff --check
```

Expected: all tests pass; all twelve files report `1024x1024` with alpha; no
text whitespace errors occur.

- [ ] **Step 4: Review and commit the focused implementation**

Confirm the diff contains only the twelve character WebPs and the renamed
focused test; `.superpowers/`, UI, audio, and lesson content remain untouched.

```bash
git add public/assets/characters/peppa/*.webp \
  public/assets/characters/dolly/*.webp \
  tests/peppa-alpha.test.mjs tests/character-sprites.test.mjs
git commit -m "fix: solidify character sprite artwork"
```
