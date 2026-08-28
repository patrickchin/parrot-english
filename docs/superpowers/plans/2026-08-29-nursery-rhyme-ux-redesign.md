# Nursery Rhyme UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragmented nursery-rhyme entry points and shape-built scenes with one polished, illustrated, directly usable nursery-rhyme experience, then ship it through a reviewed and merged pull request.

**Architecture:** Keep the existing dubbing clock, private audio API, consent boundary, recording lifecycle, and authored scripts intact. Add one immutable artwork catalog consumed by thin scene renderers, a focused `/dubs` picker, and presentation-only project/editor updates; `DubStudio` remains the owner of state transitions, contextual navigation, media cancellation, and private saved-take playback.

**Tech Stack:** React, TypeScript, React Router, Tailwind CSS 4, shared Parrot UI/header controls, Node test runner with Vite SSR, Playwright, Sharp, built-in ImageGen, Cloudflare R2/Wrangler, GitHub CLI.

**Spec:** `docs/superpowers/specs/2026-08-29-nursery-rhyme-ux-redesign-design.md`

## Global Constraints

- Desktop at `md` and wider shows exactly four equal homepage cards in one row: **Lessons**, **Talk to Peppa**, **Story time**, and **Nursery rhymes**; phones show two columns.
- The new authenticated picker route is exactly `/dubs`; direct routes `/dubs/five-little-ducks` and `/dubs/old-macdonald` remain valid safe return targets.
- Generate exactly twelve text-free picture-book images with the built-in ImageGen tool: one cover, six Five Little Ducks scenes, and five Old MacDonald scenes. Do not request or use an API key.
- Normalize every delivery image to exactly `1536×864` WebP and publish only under new immutable `https://media.parrotbook.com/assets/v5/dubbing/...` keys with `Content-Type: image/webp` and `Cache-Control: public, max-age=31536000, immutable`.
- Never overwrite an existing immutable R2 object. Every target must return `404` during preflight; any other result stops publication.
- Keep generated source files under ignored `content/local-dubbing/`; do not place runtime images in `public` or commit raster assets.
- Do not change lyrics, cue times, recording limits, guide audio, API versions, private R2 recording keys, consent, deletion behavior, or full-playback scheduling.
- Enabled rhyme routes go from loading directly to the project. Disabled/revoking routes remain locked, and microphone access begins only after an explicit **Record** press.
- Scene cards always show illustration, scene number, authored title, and status text/icon. Desktop uses a roomy two-column scene grid aligned to the top of the 16:9 player.
- Scene view uses the shared header button **Back to full video**; project/locked views use the shared header link **Back to home**. Do not add page-specific header or button styling.
- The editor exposes **Previous** and **Next** with targets at least `48px`; Previous is disabled on the first line and Next returns to the project after the final line in a scene.
- A saved line exposes **Play my recording** and **Record again**. Pending in-memory audio wins; otherwise playback must fetch the exact private line endpoint and must never substitute guide audio.
- Use Tailwind 4 utilities directly in components, `src/shared/ui.tsx` controls, and `src/app/AppHeader.tsx` headers. Do not add page-specific CSS or expand `src/styles.css`/`src/lesson.css`.
- Test rendered behavior with accessible locators, never CSS source or class-name assertions. Cover `280–390px` phones, `640×360` short landscape, and `1280×900` desktop with no overlap or horizontal overflow.
- Before completion run `npm test`, `npm run lint`, `npm run build`, and `npm run test:browser`, and verify every remote WebP's body, MIME type, cache policy, dimensions, and decode.

---

## File Map

### New files

- `src/dubbing/dub-artwork.ts` — immutable cover and ordered scene-artwork metadata only.
- `src/dubbing/IllustratedDubScene.tsx` — maps a definition/line to the shared generated image while preserving the scene component contract.
- `src/dubbing/NurseryRhymeList.tsx` — `/dubs` picker with two illustrated song links.
- `tests/e2e/nursery-rhymes.spec.ts` — picker navigation, image-loading, and responsive containment coverage.

### Existing files with focused changes

- `.gitignore` — ignore project-bound generated source/delivery images.
- `src/dubbing/dub-script.ts`, `src/dubbing/rhyme-catalog.ts` — attach ordered immutable art to each definition.
- `src/dubbing/DuckScene.tsx`, `src/dubbing/FarmScene.tsx` — replace compositors and CSS farm shapes with thin generated-image wrappers.
- `src/dubbing/DubProjectHome.tsx` — aligned player/scene workspace with larger two-column scene cards and no Continue action.
- `src/app/app-routes.ts`, `src/app/App.tsx`, `src/app/HomeMenu.tsx` — add `/dubs`, register it, and reduce the homepage to four image-dominant cards.
- `src/dubbing/dub-state.ts`, `src/dubbing/DubStudio.tsx` — direct enabled entry, contextual header, previous navigation, and saved-take playback orchestration.
- `src/dubbing/DubSceneEditor.tsx`, `src/dubbing/dub-api.ts` — presentation contract and authenticated private audio loading.
- `tests/dub-catalog.test.mjs`, `tests/farm-scene.test.mjs`, `tests/app-routes.test.mjs`, `tests/app-shell-ui.test.mjs`, `tests/product-streamline.test.mjs`, `tests/dub-state.test.mjs`, `tests/dub-ui.test.mjs`, `tests/dub-api.test.mjs` — unit/SSR behavior.
- `tests/e2e/home-menu.spec.ts`, `tests/e2e/dubbing.spec.ts` — responsive and end-to-end behavior.

## Task 1: Generate, publish, and catalog the immutable artwork

**Files:**
- Modify: `.gitignore`
- Create: `src/dubbing/dub-artwork.ts`
- Modify: `src/dubbing/dub-script.ts`
- Modify: `src/dubbing/rhyme-catalog.ts`
- Test: `tests/dub-catalog.test.mjs`

**Interfaces:**
- Consumes: built-in `image_gen` results and the existing `DubDefinition`/`FIVE_LITTLE_DUCKS_DUB`/`OLD_MACDONALD_DUB` catalogs.
- Produces: `DubArtwork = Readonly<{ alt: string; height: number; src: string; width: number }>`; `NURSERY_RHYMES_COVER_ARTWORK`; `FIVE_LITTLE_DUCKS_SCENE_ARTWORK`; `OLD_MACDONALD_SCENE_ARTWORK`; and required `DubDefinition.sceneArtwork: readonly DubArtwork[]`.

- [ ] **Step 1: Attach the detached worktree to the feature branch**

Run:

```bash
git status --short
git branch --show-current
git switch -c codex/nursery-rhyme-ux-redesign
```

Expected: the status output is empty, the initial branch-name output is empty, and the final command creates `codex/nursery-rhyme-ux-redesign` at the committed spec/plan history.

- [ ] **Step 2: Write the failing artwork-catalog test**

Extend `tests/dub-catalog.test.mjs` with these imports and assertions:

```js
import { FIVE_LITTLE_DUCKS_DUB } from "../src/dubbing/dub-script.ts";
import {
  FIVE_LITTLE_DUCKS_SCENE_ARTWORK,
  NURSERY_RHYMES_COVER_ARTWORK,
  OLD_MACDONALD_SCENE_ARTWORK,
} from "../src/dubbing/dub-artwork.ts";

it("defines complete immutable generated artwork for both rhymes", () => {
  assert.equal(FIVE_LITTLE_DUCKS_DUB.sceneArtwork, FIVE_LITTLE_DUCKS_SCENE_ARTWORK);
  assert.equal(OLD_MACDONALD_DUB.sceneArtwork, OLD_MACDONALD_SCENE_ARTWORK);
  assert.equal(FIVE_LITTLE_DUCKS_SCENE_ARTWORK.length, 6);
  assert.equal(OLD_MACDONALD_SCENE_ARTWORK.length, 5);

  const artwork = [
    NURSERY_RHYMES_COVER_ARTWORK,
    ...FIVE_LITTLE_DUCKS_SCENE_ARTWORK,
    ...OLD_MACDONALD_SCENE_ARTWORK,
  ];
  assert.equal(new Set(artwork.map(({ src }) => src)).size, 12);
  for (const image of artwork) {
    assert.match(image.src, /^https:\/\/media\.parrotbook\.com\/assets\/v5\/dubbing\/.+\.webp$/);
    assert.equal(image.width, 1536);
    assert.equal(image.height, 864);
    assert.ok(image.alt.length >= 20);
    assert.equal(Object.isFrozen(image), true);
  }
  assert.equal(Object.isFrozen(FIVE_LITTLE_DUCKS_SCENE_ARTWORK), true);
  assert.equal(Object.isFrozen(OLD_MACDONALD_SCENE_ARTWORK), true);
});
```

- [ ] **Step 3: Run the catalog test and confirm the red state**

Run: `node --test tests/dub-catalog.test.mjs`

Expected: FAIL because `src/dubbing/dub-artwork.ts` and `sceneArtwork` do not exist.

- [ ] **Step 4: Add the ignored source location and exact artwork metadata**

Add this entry to `.gitignore`:

```gitignore
/content/local-dubbing/
```

Create `src/dubbing/dub-artwork.ts` with this complete manifest:

```ts
const MEDIA_BASE = "https://media.parrotbook.com/assets/v5/dubbing";

export type DubArtwork = Readonly<{
  alt: string;
  height: number;
  src: string;
  width: number;
}>;

function artwork(path: string, alt: string): DubArtwork {
  return Object.freeze({
    alt,
    height: 864,
    src: `${MEDIA_BASE}/${path}`,
    width: 1536,
  });
}

export const NURSERY_RHYMES_COVER_ARTWORK = artwork(
  "nursery-rhymes-cover.webp",
  "Mother duck and five ducklings visit a cheerful farm full of friendly animals.",
);

export const FIVE_LITTLE_DUCKS_SCENE_ARTWORK = Object.freeze([
  artwork("five-little-ducks/scene-1-five-ducklings.webp", "Five yellow ducklings leave their mother beside a bright spring pond."),
  artwork("five-little-ducks/scene-2-four-ducklings.webp", "Four yellow ducklings return across a flower-lined footbridge in the afternoon."),
  artwork("five-little-ducks/scene-3-three-ducklings.webp", "Three yellow ducklings travel over a broad green hill beneath a clear sky."),
  artwork("five-little-ducks/scene-4-two-ducklings.webp", "Two yellow ducklings return through tall pond reeds during a gentle rain."),
  artwork("five-little-ducks/scene-5-one-duckling.webp", "One yellow duckling returns to mother duck beside the pond at sunset."),
  artwork("five-little-ducks/scene-6-family-reunion.webp", "Mother duck joyfully reunites with all five yellow ducklings beneath a rainbow."),
]);

export const OLD_MACDONALD_SCENE_ARTWORK = Object.freeze([
  artwork("old-macdonald/scene-1-cows.webp", "Old MacDonald greets three friendly cows in the pasture beside his red barn."),
  artwork("old-macdonald/scene-2-ducks.webp", "Old MacDonald watches four white ducks splash in the farm pond."),
  artwork("old-macdonald/scene-3-pigs.webp", "Old MacDonald laughs with three pink pigs playing in a sunny mud patch."),
  artwork("old-macdonald/scene-4-dog.webp", "Old MacDonald's brown farm dog waits proudly by the barnyard fence."),
  artwork("old-macdonald/scene-5-sheep.webp", "Old MacDonald walks with five fluffy sheep in the meadow beyond the red barn."),
]);
```

Add `readonly sceneArtwork: readonly DubArtwork[]` to `DubDefinition`, import `DubArtwork` as a type in `src/dubbing/rhyme-catalog.ts`, import the matching arrays in both definition files, and assign:

```ts
sceneArtwork: FIVE_LITTLE_DUCKS_SCENE_ARTWORK,
```

and:

```ts
sceneArtwork: OLD_MACDONALD_SCENE_ARTWORK,
```

- [ ] **Step 5: Generate and inspect the two visual anchors with built-in ImageGen**

Create the ignored project-bound directories first:

```bash
mkdir -p content/local-dubbing/2026-08-29/source/five-little-ducks
mkdir -p content/local-dubbing/2026-08-29/source/old-macdonald
mkdir -p content/local-dubbing/2026-08-29/webp/five-little-ducks
mkdir -p content/local-dubbing/2026-08-29/webp/old-macdonald
```

Invoke built-in ImageGen once for each prompt; the calls may run in parallel. Save the selected outputs as `content/local-dubbing/2026-08-29/source/five-little-ducks/scene-1-five-ducklings.png` and `content/local-dubbing/2026-08-29/source/old-macdonald/scene-1-cows.png`, then inspect both with `view_image`.

Duck anchor prompt:

```text
Use case: illustration-story
Asset type: wide 16:9 nursery-rhyme website scene and thumbnail
Primary request: exactly five small yellow ducklings, no more and no fewer, waddle away from their mother beside a bright spring pond
Scene/backdrop: green rolling hill, blue pond, soft wildflowers, distant trees
Subject: one consistent mother duck and exactly five consistent ducklings, all fully visible with clear separated silhouettes
Style/medium: warm hand-painted gouache and watercolor children's picture-book illustration, polished but tactile
Composition/framing: wide landscape composition, characters large enough to read in a small thumbnail, no important subject at the extreme edges
Lighting/mood: clear spring morning, gentle and cheerful
Color palette: bright natural greens, sky blue, warm yellow ducks
Constraints: exactly one mother duck and exactly five ducklings; anatomically friendly storybook birds; no other birds or animals; no text, letters, numbers, logo, border, or watermark
Avoid: collage, vector shapes, photorealism, 3D render, repeated or partially hidden ducklings
```

Farm anchor prompt:

```text
Use case: illustration-story
Asset type: wide 16:9 nursery-rhyme website scene and thumbnail
Primary request: a friendly older farmer in blue overalls and a straw hat greets exactly three gentle cows in a pasture
Scene/backdrop: consistent red barn with white trim, green pasture, wooden fence, distant orchard and low hills
Subject: one farmer and exactly three cows, all fully visible with clear separated silhouettes
Style/medium: warm hand-painted gouache and watercolor children's picture-book illustration, polished but tactile
Composition/framing: wide landscape composition, animals large enough to read in a small thumbnail, barn clearly visible without crowding the subjects
Lighting/mood: fresh golden morning, welcoming and playful
Color palette: barn red, grass green, warm cream and brown animals, soft blue sky
Constraints: exactly one farmer and exactly three cows; no other farm animals; no text, letters, numbers, speech bubbles, logo, border, or watermark
Avoid: collage, geometric vector shapes, photorealism, 3D render, partially hidden animals
```

Reject either output if the count is wrong, silhouettes merge, text appears, or the crop is not usable at 16:9. For a count-only failure, edit that generated image with: `Change only the animal count to exactly the requested count. Keep the character design, painted style, background, lighting, framing, and every other element unchanged. Keep every animal fully visible. No text or watermark.` Reinspect before continuing.

- [ ] **Step 6: Generate and inspect the remaining five duck scenes from the duck anchor**

Issue one built-in ImageGen call per prompt below with `scene-1-five-ducklings.png` supplied as a reference image. In every call, label it as a character/style reference rather than an edit target. Preserve the mother-duck and duckling designs exactly, use wide `16:9` framing, warm gouache/watercolor brushwork, thumbnail-readable silhouettes, and no text, letters, numbers, logos, borders, watermarks, extra birds, photorealism, 3D rendering, or geometric vector shapes.

Save and inspect these exact outputs:

```text
content/local-dubbing/2026-08-29/source/five-little-ducks/scene-2-four-ducklings.png
Primary request: exactly four yellow ducklings, no more and no fewer, return toward mother duck across a small wooden footbridge lined with wildflowers in warm afternoon light; one mother and all four ducklings fully visible.

content/local-dubbing/2026-08-29/source/five-little-ducks/scene-3-three-ducklings.png
Primary request: exactly three yellow ducklings, no more and no fewer, travel over a broad green hill while mother duck calls from far below beside the pond; use a noticeably elevated wide composition and clear blue midday sky; one mother and all three ducklings fully visible.

content/local-dubbing/2026-08-29/source/five-little-ducks/scene-4-two-ducklings.png
Primary request: exactly two yellow ducklings, no more and no fewer, return through tall pond reeds during a gentle silver rain while mother duck waits on the bank; use a closer low pond-level composition; one mother and both ducklings fully visible.

content/local-dubbing/2026-08-29/source/five-little-ducks/scene-5-one-duckling.png
Primary request: exactly one yellow duckling returns alone toward mother duck beside the pond at orange sunset; use a wide side-on composition with long reflections; exactly one mother and one duckling fully visible.

content/local-dubbing/2026-08-29/source/five-little-ducks/scene-6-family-reunion.png
Primary request: mother duck joyfully reunites with exactly five yellow ducklings, no more and no fewer, beside the pond after rain; use a celebratory semicircle composition with a soft rainbow and sparkling puddles; exactly one mother and all five ducklings fully visible.
```

For any wrong count, use the count-only corrective edit from Step 5 and inspect the replacement before accepting it.

- [ ] **Step 7: Generate and inspect the remaining four farm scenes from the farm anchor**

Issue one built-in ImageGen call per prompt below with `scene-1-cows.png` supplied as a farmer/barn/style reference. Preserve the same farmer, straw hat, blue overalls, red barn, landscape, gouache/watercolor medium, and warm storybook finish. Every output is wide `16:9`, thumbnail-readable, and contains no text, letters, numbers, speech bubbles, logos, borders, watermarks, extra animal species, photorealism, 3D rendering, or geometric vector shapes.

Save and inspect these exact outputs:

```text
content/local-dubbing/2026-08-29/source/old-macdonald/scene-2-ducks.png
Primary request: the same farmer watches exactly four white ducks, no more and no fewer, splash in a farm pond beside the same red barn; all four ducks and the farmer fully visible; use a water-level afternoon composition with bright ripples.

content/local-dubbing/2026-08-29/source/old-macdonald/scene-3-pigs.png
Primary request: the same farmer laughs with exactly three pink pigs, no more and no fewer, playing in a sunny mud patch beside the same red barn; all three pigs and the farmer fully visible; use a close playful ground-level composition.

content/local-dubbing/2026-08-29/source/old-macdonald/scene-4-dog.png
Primary request: the same farmer's single brown farm dog waits proudly by a wooden barnyard fence with the same red barn behind it; exactly one dog and one farmer fully visible; use a lively diagonal late-afternoon composition.

content/local-dubbing/2026-08-29/source/old-macdonald/scene-5-sheep.png
Primary request: the same farmer walks with exactly five fluffy sheep, no more and no fewer, through a meadow beyond the same red barn; all five sheep and the farmer fully visible; use a broad breezy early-evening composition.
```

For any wrong count, use the count-only corrective edit from Step 5 and inspect the replacement before accepting it.

- [ ] **Step 8: Generate and inspect the shared Nursery Rhymes cover**

Supply the accepted duck and farm anchors as reference images and save the selected output as `content/local-dubbing/2026-08-29/source/nursery-rhymes-cover.png`.

```text
Use case: illustration-story
Asset type: 3:2-friendly homepage activity cover delivered on a wide 16:9 canvas
Input images: Image 1 is the duck character/style reference; Image 2 is the farmer, barn, landscape, and style reference
Primary request: one mother duck with exactly five yellow ducklings visits the cheerful farm while the same farmer waves near the same red barn
Scene/backdrop: pond and wildflowers in the foreground, red barn and soft pasture in the background
Subject: one mother duck, exactly five ducklings, and one farmer; a few cows, sheep, and one pig may appear only in the distant background
Style/medium: preserve the warm hand-painted gouache and watercolor children's picture-book style of both references
Composition/framing: strong centered family grouping, useful crop in both 16:9 and 3:2, clear silhouettes at homepage-card size
Lighting/mood: sunny, musical, welcoming, and calm
Constraints: preserve the reference character designs; no text, letters, numbers, musical notation, logos, borders, or watermarks
Avoid: collage seams, geometric vector shapes, photorealism, 3D render, duplicated or partially hidden ducklings
```

Inspect the result and apply the Step 5 count-only correction if it does not contain one mother and exactly five ducklings.

- [ ] **Step 9: Normalize all twelve accepted sources to exact delivery files**

Run this mechanical Sharp conversion from the repository root:

```bash
node --input-type=module <<'NODE'
import sharp from "sharp";

const root = "content/local-dubbing/2026-08-29";
const files = [
  "nursery-rhymes-cover",
  "five-little-ducks/scene-1-five-ducklings",
  "five-little-ducks/scene-2-four-ducklings",
  "five-little-ducks/scene-3-three-ducklings",
  "five-little-ducks/scene-4-two-ducklings",
  "five-little-ducks/scene-5-one-duckling",
  "five-little-ducks/scene-6-family-reunion",
  "old-macdonald/scene-1-cows",
  "old-macdonald/scene-2-ducks",
  "old-macdonald/scene-3-pigs",
  "old-macdonald/scene-4-dog",
  "old-macdonald/scene-5-sheep",
];

for (const file of files) {
  const output = `${root}/webp/${file}.webp`;
  await sharp(`${root}/source/${file}.png`, { failOn: "error" })
    .resize(1536, 864, { fit: "cover", position: "attention" })
    .webp({ effort: 6, quality: 90 })
    .toFile(output);
  const metadata = await sharp(output, { failOn: "error" }).metadata();
  if (metadata.format !== "webp" || metadata.width !== 1536 || metadata.height !== 864) {
    throw new Error(`${file} did not normalize to 1536x864 WebP`);
  }
}
NODE
```

Expected: exit `0`; twelve files exist below `content/local-dubbing/2026-08-29/webp/` and every metadata check passes.

Inspect each of those twelve WebPs with `view_image`. Confirm that the `16:9` crop preserves every required animal, no subject is cut off, adjacent scenes remain visually distinct, and no text or watermark was introduced. Regenerate the source and rerun this conversion before publication when a normalized crop fails any of those concrete checks.

- [ ] **Step 10: Preflight all immutable public URLs**

Run:

```bash
node --input-type=module <<'NODE'
const urls = [
  "https://media.parrotbook.com/assets/v5/dubbing/nursery-rhymes-cover.webp",
  "https://media.parrotbook.com/assets/v5/dubbing/five-little-ducks/scene-1-five-ducklings.webp",
  "https://media.parrotbook.com/assets/v5/dubbing/five-little-ducks/scene-2-four-ducklings.webp",
  "https://media.parrotbook.com/assets/v5/dubbing/five-little-ducks/scene-3-three-ducklings.webp",
  "https://media.parrotbook.com/assets/v5/dubbing/five-little-ducks/scene-4-two-ducklings.webp",
  "https://media.parrotbook.com/assets/v5/dubbing/five-little-ducks/scene-5-one-duckling.webp",
  "https://media.parrotbook.com/assets/v5/dubbing/five-little-ducks/scene-6-family-reunion.webp",
  "https://media.parrotbook.com/assets/v5/dubbing/old-macdonald/scene-1-cows.webp",
  "https://media.parrotbook.com/assets/v5/dubbing/old-macdonald/scene-2-ducks.webp",
  "https://media.parrotbook.com/assets/v5/dubbing/old-macdonald/scene-3-pigs.webp",
  "https://media.parrotbook.com/assets/v5/dubbing/old-macdonald/scene-4-dog.webp",
  "https://media.parrotbook.com/assets/v5/dubbing/old-macdonald/scene-5-sheep.webp",
];
for (const url of urls) {
  const response = await fetch(`${url}?preflight=${crypto.randomUUID()}`, {
    cache: "no-store",
    method: "HEAD",
  });
  if (response.status !== 404) {
    throw new Error(`Refusing to overwrite immutable media: ${url} returned ${response.status}`);
  }
}
console.log(`Preflight passed for ${urls.length} new objects.`);
NODE
```

Expected: `Preflight passed for 12 new objects.` If any URL is not `404`, stop this task without uploading.

- [ ] **Step 11: Upload each normalized file with immutable metadata**

Run these exact commands only after Step 10 passes:

```bash
npm exec --offline -- wrangler r2 object put parrot-english-media/assets/v5/dubbing/nursery-rhymes-cover.webp --file content/local-dubbing/2026-08-29/webp/nursery-rhymes-cover.webp --remote --content-type image/webp --cache-control "public, max-age=31536000, immutable"
npm exec --offline -- wrangler r2 object put parrot-english-media/assets/v5/dubbing/five-little-ducks/scene-1-five-ducklings.webp --file content/local-dubbing/2026-08-29/webp/five-little-ducks/scene-1-five-ducklings.webp --remote --content-type image/webp --cache-control "public, max-age=31536000, immutable"
npm exec --offline -- wrangler r2 object put parrot-english-media/assets/v5/dubbing/five-little-ducks/scene-2-four-ducklings.webp --file content/local-dubbing/2026-08-29/webp/five-little-ducks/scene-2-four-ducklings.webp --remote --content-type image/webp --cache-control "public, max-age=31536000, immutable"
npm exec --offline -- wrangler r2 object put parrot-english-media/assets/v5/dubbing/five-little-ducks/scene-3-three-ducklings.webp --file content/local-dubbing/2026-08-29/webp/five-little-ducks/scene-3-three-ducklings.webp --remote --content-type image/webp --cache-control "public, max-age=31536000, immutable"
npm exec --offline -- wrangler r2 object put parrot-english-media/assets/v5/dubbing/five-little-ducks/scene-4-two-ducklings.webp --file content/local-dubbing/2026-08-29/webp/five-little-ducks/scene-4-two-ducklings.webp --remote --content-type image/webp --cache-control "public, max-age=31536000, immutable"
npm exec --offline -- wrangler r2 object put parrot-english-media/assets/v5/dubbing/five-little-ducks/scene-5-one-duckling.webp --file content/local-dubbing/2026-08-29/webp/five-little-ducks/scene-5-one-duckling.webp --remote --content-type image/webp --cache-control "public, max-age=31536000, immutable"
npm exec --offline -- wrangler r2 object put parrot-english-media/assets/v5/dubbing/five-little-ducks/scene-6-family-reunion.webp --file content/local-dubbing/2026-08-29/webp/five-little-ducks/scene-6-family-reunion.webp --remote --content-type image/webp --cache-control "public, max-age=31536000, immutable"
npm exec --offline -- wrangler r2 object put parrot-english-media/assets/v5/dubbing/old-macdonald/scene-1-cows.webp --file content/local-dubbing/2026-08-29/webp/old-macdonald/scene-1-cows.webp --remote --content-type image/webp --cache-control "public, max-age=31536000, immutable"
npm exec --offline -- wrangler r2 object put parrot-english-media/assets/v5/dubbing/old-macdonald/scene-2-ducks.webp --file content/local-dubbing/2026-08-29/webp/old-macdonald/scene-2-ducks.webp --remote --content-type image/webp --cache-control "public, max-age=31536000, immutable"
npm exec --offline -- wrangler r2 object put parrot-english-media/assets/v5/dubbing/old-macdonald/scene-3-pigs.webp --file content/local-dubbing/2026-08-29/webp/old-macdonald/scene-3-pigs.webp --remote --content-type image/webp --cache-control "public, max-age=31536000, immutable"
npm exec --offline -- wrangler r2 object put parrot-english-media/assets/v5/dubbing/old-macdonald/scene-4-dog.webp --file content/local-dubbing/2026-08-29/webp/old-macdonald/scene-4-dog.webp --remote --content-type image/webp --cache-control "public, max-age=31536000, immutable"
npm exec --offline -- wrangler r2 object put parrot-english-media/assets/v5/dubbing/old-macdonald/scene-5-sheep.webp --file content/local-dubbing/2026-08-29/webp/old-macdonald/scene-5-sheep.webp --remote --content-type image/webp --cache-control "public, max-age=31536000, immutable"
```

Expected: every Wrangler command exits `0` and reports one object uploaded.

- [ ] **Step 12: Verify all delivered objects by GET, headers, bytes, dimensions, and decode**

Run:

```bash
node --input-type=module <<'NODE'
import sharp from "sharp";

const urls = [
  "https://media.parrotbook.com/assets/v5/dubbing/nursery-rhymes-cover.webp",
  ...["scene-1-five-ducklings", "scene-2-four-ducklings", "scene-3-three-ducklings", "scene-4-two-ducklings", "scene-5-one-duckling", "scene-6-family-reunion"].map((name) => `https://media.parrotbook.com/assets/v5/dubbing/five-little-ducks/${name}.webp`),
  ...["scene-1-cows", "scene-2-ducks", "scene-3-pigs", "scene-4-dog", "scene-5-sheep"].map((name) => `https://media.parrotbook.com/assets/v5/dubbing/old-macdonald/${name}.webp`),
];
for (const url of urls) {
  const response = await fetch(`${url}?verify=${crypto.randomUUID()}`, { cache: "no-store" });
  if (response.status !== 200) throw new Error(`${url} returned ${response.status}`);
  if ((response.headers.get("content-type") ?? "").split(";", 1)[0] !== "image/webp") {
    throw new Error(`${url} has the wrong content type`);
  }
  if (response.headers.get("cache-control") !== "public, max-age=31536000, immutable") {
    throw new Error(`${url} has the wrong cache policy`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error(`${url} has an empty body`);
  const metadata = await sharp(bytes, { failOn: "error" }).metadata();
  if (metadata.format !== "webp" || metadata.width !== 1536 || metadata.height !== 864) {
    throw new Error(`${url} is not a decodable 1536x864 WebP`);
  }
}
console.log(`Verified ${urls.length} nursery-rhyme images.`);
NODE
```

Expected: `Verified 12 nursery-rhyme images.`

- [ ] **Step 13: Run the catalog test and commit the artwork contract**

Run: `node --test tests/dub-catalog.test.mjs`

Expected: PASS.

```bash
git add .gitignore src/dubbing/dub-artwork.ts src/dubbing/dub-script.ts src/dubbing/rhyme-catalog.ts tests/dub-catalog.test.mjs
git commit -m "feat: catalog nursery rhyme artwork"
```

## Task 2: Replace shape scenes and rebuild the project workspace

**Files:**
- Create: `src/dubbing/IllustratedDubScene.tsx`
- Modify: `src/dubbing/DuckScene.tsx`
- Modify: `src/dubbing/FarmScene.tsx`
- Modify: `src/dubbing/DubProjectHome.tsx`
- Test: `tests/farm-scene.test.mjs`
- Test: `tests/dub-ui.test.mjs`

**Interfaces:**
- Consumes: `DubDefinition.sceneArtwork`, `DubSceneProps`, `DubSceneComponent`, and existing `getDubSceneStatus`.
- Produces: `IllustratedDubScene(props: DubSceneProps & { definition: DubDefinition }): JSX.Element`; unchanged `DuckScene`/`FarmScene` component signatures; `DubProjectHomeProps` without `onContinue`.

- [ ] **Step 1: Rewrite the renderer/project tests for distinct generated images and visible scene metadata**

Replace the shape assertions in `tests/farm-scene.test.mjs` with:

```js
it("renders the generated illustration for the active farm scene", () => {
  const pigs = renderToStaticMarkup(createElement(FarmScene, {
    line: OLD_MACDONALD_DUB.lines[14],
    thumbnail: true,
  }));
  const cows = renderToStaticMarkup(createElement(FarmScene, {
    line: OLD_MACDONALD_DUB.lines[0],
    thumbnail: true,
  }));

  assert.match(pigs, /old-macdonald\/scene-3-pigs\.webp/);
  assert.match(pigs, /alt="Old MacDonald laughs with three pink pigs/);
  assert.match(cows, /old-macdonald\/scene-1-cows\.webp/);
  assert.notEqual(pigs, cows);
  assert.equal((pigs.match(/<img/g) ?? []).length, 1);
  assert.doesNotMatch(pigs, /data-farm-animal|snort-snort/);
});
```

Update `renderProjectHome` in `tests/dub-ui.test.mjs` to remove `onContinue`, then add:

```js
it("maps every line in a verse to that verse's generated scene", () => {
  const first = renderToStaticMarkup(createElement(DuckScene, {
    line: DUB_LINES[0],
    thumbnail: true,
  }));
  const second = renderToStaticMarkup(createElement(DuckScene, {
    line: DUB_LINES[4],
    thumbnail: true,
  }));
  assert.match(first, /five-little-ducks\/scene-1-five-ducklings\.webp/);
  assert.match(second, /five-little-ducks\/scene-2-four-ducklings\.webp/);
  assert.notEqual(first, second);
});

it("shows large direct scene choices with title and status and no continue action", () => {
  const html = renderProjectHome();
  assert.doesNotMatch(html, /Continue Scene|>Continue</);
  for (const [index, title] of [
    "Five little ducks",
    "Four little ducks",
    "Three little ducks",
    "Two little ducks",
    "One little duck",
    "Sad mother duck",
  ].entries()) {
    assert.match(html, new RegExp(`aria-label="Scene ${index + 1}, ${title}, Not started"`));
    assert.match(html, new RegExp(`>${title}<`));
  }
  assert.equal((html.match(/five-little-ducks\/scene-[^\"]+\.webp/g) ?? []).length, 7);
});
```

The expected image count is seven because the active scene appears once in the player and six scene cards each use one ordered illustration.

- [ ] **Step 2: Run the focused renderer tests and confirm the red state**

Run: `node --test tests/farm-scene.test.mjs tests/dub-ui.test.mjs`

Expected: FAIL because the old scene compositors render many layers/shapes and `DubProjectHome` still renders Continue without titles.

- [ ] **Step 3: Add the shared generated-image scene renderer**

Create `src/dubbing/IllustratedDubScene.tsx`:

```tsx
import type { DubSceneProps } from "./DubSceneTypes";
import type { DubDefinition } from "./rhyme-catalog";

export function IllustratedDubScene({
  compact = false,
  definition,
  line = definition.lines[0],
  playing = false,
  thumbnail = false,
}: DubSceneProps & { definition: DubDefinition }) {
  const lineIndex = Math.max(0, definition.lines.findIndex(({ id }) => id === line.id));
  const sceneIndex = Math.floor(lineIndex / definition.linesPerScene);
  const image = definition.sceneArtwork[sceneIndex] ?? definition.sceneArtwork[0];
  const art = (
    <img
      alt={image.alt}
      className="block size-full select-none object-cover"
      data-playing={playing ? "true" : undefined}
      decoding="async"
      draggable="false"
      height={image.height}
      loading={thumbnail ? "lazy" : "eager"}
      src={image.src}
      width={image.width}
    />
  );

  if (thumbnail) return art;

  return (
    <figure
      className={compact
        ? "m-0 grid size-full min-h-0 overflow-hidden"
        : "m-0 grid min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden rounded-3xl border-4 border-white bg-sky-100 shadow-card"}
    >
      {art}
      <figcaption
        aria-hidden="true"
        className={compact ? "sr-only" : "bg-white/90 px-4 py-2 text-center text-sm font-black text-brand-navy"}
      >
        {image.alt}
      </figcaption>
    </figure>
  );
}
```

- [ ] **Step 4: Reduce both legacy scene files to thin wrappers**

Replace `src/dubbing/DuckScene.tsx` with:

```tsx
import type { DubSceneProps } from "./DubSceneTypes";
import { IllustratedDubScene } from "./IllustratedDubScene";
import { FIVE_LITTLE_DUCKS_DUB } from "./dub-script";

export function DuckScene(props: DubSceneProps) {
  return <IllustratedDubScene definition={FIVE_LITTLE_DUCKS_DUB} {...props} />;
}
```

Replace `src/dubbing/FarmScene.tsx` with:

```tsx
import type { DubSceneProps } from "./DubSceneTypes";
import { IllustratedDubScene } from "./IllustratedDubScene";
import { OLD_MACDONALD_DUB } from "./rhyme-catalog";

export function FarmScene(props: DubSceneProps) {
  return <IllustratedDubScene definition={OLD_MACDONALD_DUB} {...props} />;
}
```

- [ ] **Step 5: Rebuild `DubProjectHome` as one aligned player-and-panel row**

Remove `onContinue`, `allSaved`, `firstMissingLineIndex`, and `continueSceneIndex`. Keep the spanning title/progress header. Put the player/action column and a bordered scene `<aside>` in one desktop grid with `items-start`; the aside owns a two-column `<nav aria-label="Scenes">`.

Use this scene-card structure inside the existing status loop:

```tsx
const artwork = definition.sceneArtwork[sceneIndex];
const title = definition.sceneTitles[sceneIndex];
const statusText = sceneStatusText(status, definition.linesPerScene);

<ActionButton
  aria-current={selected ? "page" : undefined}
  aria-label={`Scene ${sceneIndex + 1}, ${title}, ${sceneStatusLabel(status, definition.linesPerScene)}`}
  className="relative min-h-36 min-w-0 flex-col items-stretch gap-2 overflow-hidden rounded-2xl p-2 text-left short-wide:min-h-28"
  disabled={locked}
  key={sceneIndex}
  onClick={() => onOpenScene(sceneIndex)}
  shape="rounded"
  size="none"
  variant={selected ? "navy" : "surface"}
>
  <img
    alt=""
    className="aspect-video w-full rounded-xl object-cover"
    decoding="async"
    height={artwork.height}
    loading="lazy"
    src={artwork.src}
    width={artwork.width}
  />
  <span className="grid min-w-0 gap-0.5 px-1">
    <span className="text-xs font-black uppercase tracking-wide opacity-75">Scene {sceneIndex + 1}</span>
    <strong className="truncate text-base leading-tight">{title}</strong>
    <span className="text-sm font-black">{statusIcon} {statusText}</span>
  </span>
</ActionButton>
```

Set the content row class to `grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(24rem,0.8fr)]`. Its first child is the existing player/action column with class `grid min-w-0 gap-3`. Its second child is `<aside aria-label="Scene selection">` with class `grid min-w-0 content-start gap-3 rounded-3xl border-4 border-white bg-white/90 p-3 shadow-card md:p-4`; give it `<h2 className="m-0 text-xl text-brand-ink">Choose a scene</h2>` and the existing status loop inside `<nav aria-label="Scenes" className="grid min-w-0 grid-cols-2 gap-3">`.

On narrow screens this grid naturally stacks. Keep the full-playback `ActionButton`, existing playback states, refs, focus behavior, errors, and status calculations unchanged.

- [ ] **Step 6: Run focused tests and commit the illustrated workspace**

Run:

```bash
node --test tests/farm-scene.test.mjs tests/dub-ui.test.mjs
npm run build
```

Expected: both test files PASS and TypeScript/Vite build succeeds.

```bash
git add src/dubbing/IllustratedDubScene.tsx src/dubbing/DuckScene.tsx src/dubbing/FarmScene.tsx src/dubbing/DubProjectHome.tsx tests/farm-scene.test.mjs tests/dub-ui.test.mjs
git commit -m "feat: illustrate nursery rhyme workspaces"
```

## Task 3: Add the Nursery Rhymes hub and four-card homepage

**Files:**
- Create: `src/dubbing/NurseryRhymeList.tsx`
- Modify: `src/app/app-routes.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/HomeMenu.tsx`
- Test: `tests/app-routes.test.mjs`
- Test: `tests/app-shell-ui.test.mjs`
- Test: `tests/product-streamline.test.mjs`
- Test: `tests/e2e/home-menu.spec.ts`
- Create: `tests/e2e/nursery-rhymes.spec.ts`

**Interfaces:**
- Consumes: `NURSERY_RHYMES_COVER_ARTWORK`, both `DubDefinition`s, `InteractiveCardLink`, `RouteHeader`, and `HeaderLink`.
- Produces: `getNurseryRhymesPath(): "/dubs"`; `NurseryRhymeList(): JSX.Element`; one registered `/dubs` route; exactly four `HomeMenu` links.

- [ ] **Step 1: Write failing route, shell, and homepage tests**

Add to `tests/app-routes.test.mjs`:

```js
assert.equal(routes.getNurseryRhymesPath(), "/dubs");
assert.equal(routes.getSafeReturnTo(returnToSearch("/dubs")), "/dubs");
assert.equal(routes.getSafeReturnTo(returnToSearch("/dubs/extra")), "/");
```

Update the homepage expectations in `tests/app-shell-ui.test.mjs` and `tests/product-streamline.test.mjs` to assert these exact hrefs and no direct rhyme hrefs:

```js
assert.deepEqual(hrefs, ["/lessons", "/talk-to-peppa", "/stories", "/dubs"]);
assert.doesNotMatch(homeHtml, /href="\/dubs\/(?:five-little-ducks|old-macdonald)"/);
```

Add an SSR route assertion to `tests/app-shell-ui.test.mjs`:

```js
const nursery = renderApplicationRoute("/dubs");
assert.match(nursery, />Nursery rhymes</);
assert.match(nursery, /href="\/dubs\/five-little-ducks"/);
assert.match(nursery, /href="\/dubs\/old-macdonald"/);
```

- [ ] **Step 2: Run the route/shell tests and confirm the red state**

Run: `node --test tests/app-routes.test.mjs tests/app-shell-ui.test.mjs tests/product-streamline.test.mjs`

Expected: FAIL because `/dubs` and the four-card homepage do not exist.

- [ ] **Step 3: Add and register the `/dubs` route**

In `src/app/app-routes.ts`, add:

```ts
export function getNurseryRhymesPath() {
  return "/dubs" as const;
}
```

Add `/^\/dubs\/*$/i` to `SAFE_RETURN_PATHS` before the two direct rhyme patterns. In `src/app/App.tsx`, import `getNurseryRhymesPath` and `NurseryRhymeList`, add `/^\/dubs\/*$/i` to `APPLICATION_ROUTE_PATTERNS`, and register:

```tsx
<Route element={<NurseryRhymeList />} path={getNurseryRhymesPath()} />
```

Keep both direct rhyme routes unchanged.

- [ ] **Step 4: Build the focused Nursery Rhymes picker**

Create `src/dubbing/NurseryRhymeList.tsx` with one shared header and two data-driven links:

```tsx
import { ChevronLeft, Mic2 } from "lucide-react";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import { InteractiveCardLink } from "../shared/ui";
import { FIVE_LITTLE_DUCKS_DUB } from "./dub-script";
import { OLD_MACDONALD_DUB } from "./rhyme-catalog";

const RHYMES = [FIVE_LITTLE_DUCKS_DUB, OLD_MACDONALD_DUB] as const;

export function NurseryRhymeList() {
  return (
    <>
      <RouteHeader>
        <HeaderLink aria-label="Back to home" icon={<ChevronLeft strokeWidth={3.2} />} to="/">
          Back home
        </HeaderLink>
      </RouteHeader>
      <main className="min-h-dvh w-screen overflow-x-hidden bg-story-shelf px-4 pb-8 pt-20 md:px-8 md:pt-24">
        <section aria-labelledby="nursery-rhymes-title" className="mx-auto grid w-full max-w-6xl gap-5 md:gap-8">
          <header className="grid gap-2 text-center">
            <p className="m-0 text-sm font-black uppercase tracking-[0.18em] text-brand-blue">Sing and record</p>
            <h1 className="m-0 text-4xl text-brand-ink md:text-6xl" id="nursery-rhymes-title">Nursery rhymes</h1>
          </header>
          <nav aria-label="Nursery rhymes" className="grid gap-4 md:grid-cols-2 md:gap-6">
            {RHYMES.map((definition) => {
              const image = definition.sceneArtwork[0];
              return (
                <InteractiveCardLink aria-label={definition.title} className="grid min-w-0 gap-3 overflow-hidden p-3 text-left md:p-5" key={definition.id} to={definition.route}>
                  <img alt="" className="aspect-video w-full rounded-2xl object-cover" decoding="async" height={image.height} src={image.src} width={image.width} />
                  <span className="flex min-w-0 items-center justify-between gap-3">
                    <strong className="min-w-0 text-xl leading-tight text-brand-navy md:text-3xl">{definition.title}</strong>
                    <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-rose text-white"><Mic2 /></span>
                  </span>
                </InteractiveCardLink>
              );
            })}
          </nav>
        </section>
      </main>
    </>
  );
}
```

- [ ] **Step 5: Reduce `HomeMenu` to four image-only top-level choices**

Remove imports and flags for `DuckScene`, `FarmScene`, and `OLD_MACDONALD_DUB`. Import `NURSERY_RHYMES_COVER_ARTWORK` and `getNurseryRhymesPath`. Change the path type to carry a short visible `label` and separate `accessibleLabel`, then use this four-entry catalog:

```ts
const LEARNING_PATHS: readonly LearningPath[] = [
  {
    accessibleLabel: LESSON_LEARNING_PATH.label,
    icon: Play,
    ...LESSON_LEARNING_PATH,
    label: "Lessons",
    tone: "rose",
  },
  {
    accessibleLabel: "Talk to Peppa",
    icon: MessageCircle,
    imageClassName: "object-contain p-1.5",
    imageHeight: 384,
    imageSrc: "https://media.parrotbook.com/assets/v3/characters/peppa/peppa-talking-384.webp",
    imageWidth: 384,
    label: "Talk to Peppa",
    tone: "navy",
    to: "/talk-to-peppa",
  },
  {
    accessibleLabel: "Story time",
    icon: Headphones,
    imageClassName: "object-cover",
    imageHeight: 512,
    imageSrc: "https://media.parrotbook.com/assets/v3/story-pages/the-red-ball-my-red-ball.webp",
    imageWidth: 768,
    label: "Story time",
    tone: "blue",
    to: "/stories",
  },
  {
    accessibleLabel: "Nursery rhymes",
    icon: Mic2,
    imageClassName: "object-cover",
    imageHeight: NURSERY_RHYMES_COVER_ARTWORK.height,
    imageSrc: NURSERY_RHYMES_COVER_ARTWORK.src,
    imageWidth: NURSERY_RHYMES_COVER_ARTWORK.width,
    label: "Nursery rhymes",
    tone: "rose",
    to: getNurseryRhymesPath(),
  },
];
```

Render all four visuals through the existing `<img alt="">` branch. Set the content wrapper to `max-w-7xl`, the navigation to `grid-cols-2 short-wide:grid-cols-4 md:grid-cols-4`, and desktop cards to at least `md:min-h-72` with an `md:aspect-[3/2]` image area. Keep short-landscape cards compact enough to fit one row, and use `whitespace-nowrap` only at `md` and wider so ordinary desktop labels stay on one line without causing phone overflow.

The rendered card contract is:

```tsx
<InteractiveCardLink
  aria-label={accessibleLabel}
  className="grid min-h-40 grid-cols-1 content-stretch items-center gap-2 overflow-hidden p-2 text-center short:min-h-24 short:gap-1.5 short:p-1.5 short-wide:min-h-24 short-wide:gap-1.5 short-wide:p-1.5 md:min-h-72 md:gap-4 md:p-4"
  to={to}
>
  <div className="relative h-28 w-full overflow-hidden rounded-2xl md:aspect-[3/2] md:h-auto">
    <img alt="" className={cx("size-full", imageClassName)} height={imageHeight} src={imageSrc} width={imageWidth} />
    <span aria-hidden="true" className={cx("absolute bottom-1 right-1 grid size-8 place-items-center rounded-full border-2 border-white text-white shadow-sm md:size-11", tone === "navy" && "bg-brand-navy", tone === "rose" && "bg-brand-rose", tone === "blue" && "bg-brand-blue")}>
      <Icon className="size-4 md:size-5" />
    </span>
  </div>
  <span className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
    <strong className="min-w-0 text-lg leading-tight md:whitespace-nowrap md:text-2xl lg:text-3xl">{label}</strong>
    <ArrowRight aria-hidden="true" className={cx("size-9 shrink-0 rounded-full p-2 text-white md:size-11", tone === "navy" && "bg-brand-navy", tone === "rose" && "bg-brand-rose", tone === "blue" && "bg-brand-blue")} />
  </span>
</InteractiveCardLink>
```

- [ ] **Step 6: Update Playwright coverage for four cards and add picker coverage**

In `tests/e2e/home-menu.spec.ts`, make `expectActivityPicturesLoaded` require four `<img>` elements with positive natural dimensions and four links. At `1280×900`, assert all four link boxes share the same `y` coordinate within one pixel and each is wider than `240px`; at `280–390px`, assert links 1/2 share row one and links 3/4 share row two; at `640×360`, assert all four share one row and remain inside the viewport. Assert hrefs `/lessons`, `/talk-to-peppa`, `/stories`, `/dubs` and no horizontal overflow.

Create `tests/e2e/nursery-rhymes.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("nursery rhyme picker links to both illustrated projects", async ({ page }) => {
  await page.goto("/dubs");
  await expect(page.getByRole("heading", { name: "Nursery rhymes" })).toBeVisible();
  const picker = page.getByRole("navigation", { name: "Nursery rhymes" });
  await expect(picker.getByRole("link")).toHaveCount(2);
  await expect(picker.getByRole("link", { name: "Five Little Ducks" })).toHaveAttribute("href", "/dubs/five-little-ducks");
  await expect(picker.getByRole("link", { name: "Old MacDonald Had a Farm" })).toHaveAttribute("href", "/dubs/old-macdonald");
  await expect.poll(() => picker.locator("img").evaluateAll((images) => images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true);
});

for (const viewport of [
  { width: 280, height: 568 },
  { width: 390, height: 844 },
  { width: 640, height: 360 },
  { width: 1280, height: 900 },
]) {
  test(`nursery picker stays contained at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/dubs");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("link", { name: "Five Little Ducks" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Old MacDonald Had a Farm" })).toBeVisible();
  });
}
```

- [ ] **Step 7: Run route, shell, and browser tests and commit the information architecture**

Run:

```bash
node --test tests/app-routes.test.mjs tests/app-shell-ui.test.mjs tests/product-streamline.test.mjs
npx playwright test tests/e2e/home-menu.spec.ts tests/e2e/nursery-rhymes.spec.ts
npm run build
```

Expected: all focused tests PASS and the build succeeds.

```bash
git add src/app/app-routes.ts src/app/App.tsx src/app/HomeMenu.tsx src/dubbing/NurseryRhymeList.tsx tests/app-routes.test.mjs tests/app-shell-ui.test.mjs tests/product-streamline.test.mjs tests/e2e/home-menu.spec.ts tests/e2e/nursery-rhymes.spec.ts
git commit -m "feat: group nursery rhymes under one hub"
```

## Task 4: Open enabled rhymes directly on the project

**Files:**
- Modify: `src/dubbing/dub-state.ts`
- Modify: `src/dubbing/DubStudio.tsx`
- Test: `tests/dub-state.test.mjs`
- Test: `tests/dub-ui.test.mjs`
- Test: `tests/e2e/dubbing.spec.ts`

**Interfaces:**
- Consumes: `loadDubStatus().recordingEnabled`, saved line IDs, and existing locked/load-error presentation.
- Produces: `DubView = "loading" | "locked" | "project" | "scene"`; `LOADED { recordingEnabled: boolean; savedLineIds: string[] }`; no `STARTED` or `CONTINUE` events.

- [ ] **Step 1: Write failing direct-entry reducer and mounted-component tests**

Replace intro/start/continue assertions in `tests/dub-state.test.mjs` with:

```js
it("loads enabled status directly into the project", () => {
  const state = reduceDubState(createInitialDubState(), {
    type: "LOADED",
    recordingEnabled: true,
    savedLineIds: ["line-1"],
  });
  assert.equal(state.view, "project");
  assert.equal(Object.hasOwn(state.saved, "line-1"), true);
});

it("keeps disabled status in the locked view", () => {
  const state = reduceDubState(createInitialDubState(), {
    type: "LOADED",
    recordingEnabled: false,
    savedLineIds: [],
  });
  assert.equal(state.view, "locked");
});
```

In the enabled mounted route test in `tests/dub-ui.test.mjs`, wait directly for `Play full video` and assert there is no button matching `/Start dubbing|Continue dubbing|Continue Scene/`. Keep the disabled-status and retry-on-load-error tests, but make the disabled test expect the grown-up message immediately after loading.

- [ ] **Step 2: Run state/UI tests and confirm the red state**

Run: `node --test tests/dub-state.test.mjs tests/dub-ui.test.mjs`

Expected: FAIL because `LOADED` still selects `intro` and the enabled route still exposes an entry button.

- [ ] **Step 3: Simplify the reducer to loading, locked, project, and scene**

Change the reducer types to:

```ts
export type DubView = "loading" | "locked" | "project" | "scene";

export type DubEvent =
  | { type: "LOADED"; recordingEnabled: boolean; savedLineIds: string[] }
  | { type: "OPEN_SCENE"; sceneIndex: number }
  | { type: "SELECT_LINE"; lineId: string }
  | { type: "BACK_TO_PROJECT" }
  | { type: "OPERATION_STARTED"; operation: DubOperation; playbackScope?: DubPlaybackScope }
  | { type: "OPERATION_FINISHED" }
  | { type: "SAVE_FAILED"; message: string; recovery: DubSaveRecovery }
  | { type: "SAVE_SUCCEEDED"; lineId: string; recordedAt: string }
  | { type: "MARK_NEEDS_RETAKE"; lineId: string }
  | { type: "CLEAR_NEEDS_RETAKE"; lineId: string }
  | { type: "SET_ERROR"; message: string };
```

Make `LOADED` end with:

```ts
return {
  ...createInitialDubState(definition),
  saved,
  selectedLineIndex,
  selectedSceneIndex: getSceneIndexForLine(selectedLineIndex, definition),
  view: event.recordingEnabled ? "project" : "locked",
};
```

Delete the `STARTED` and `CONTINUE` branches. Preserve all safety guards for scene selection, recording, saving, and back navigation.

- [ ] **Step 4: Remove the enabled entry action from `DubStudio`**

Dispatch complete status information:

```ts
dispatch({
  type: "LOADED",
  recordingEnabled: status.recordingEnabled,
  savedLineIds: status.recordingEnabled
    ? status.lines.filter(({ saved }) => saved).map(({ id }) => id)
    : [],
});
```

On consent loss dispatch:

```ts
dispatch({ type: "LOADED", recordingEnabled: false, savedLineIds: [] });
```

Delete `handleContinue`, every `STARTED`/`CONTINUE` dispatch, and the `onContinue` prop. Reduce `DubEntry` to locked/error rendering only:

```tsx
export function DubEntry({ error, onRetryLoad, title = FIVE_LITTLE_DUCKS_DUB.title }: {
  error: string;
  onRetryLoad(): void;
  title?: string;
}) {
  return (
    <main className="h-dvh w-screen overflow-x-hidden overflow-y-auto bg-story-shelf px-3 pb-6 pt-20 md:px-6 md:pt-24">
      <section className="mx-auto grid w-full max-w-2xl gap-4 rounded-3xl border-4 border-white bg-white/90 p-5 shadow-card">
        <h1 className="m-0 text-3xl text-brand-ink md:text-4xl">{title}</h1>
        {error ? (
          <>
            <p className="m-0 rounded-2xl bg-rose-50 p-3 font-bold text-red-800" role="alert">{error}</p>
            <ActionButton onClick={onRetryLoad}>Try loading again</ActionButton>
          </>
        ) : (
          <p className="m-0 rounded-2xl bg-sky-50 p-3 font-bold leading-snug text-brand-ink">
            Ask a grown-up to turn on voice dubbing in Guardian mode.
          </p>
        )}
      </section>
    </main>
  );
}
```

Render it only for `state.view === "locked"`; enabled status now reaches `DubProjectHome` directly. Update `DubLoading` to call `DubEntry` with only `error`, `onRetryLoad`, and `title`. The `DuckDub.tsx` re-export remains valid because the exported component name does not change.

- [ ] **Step 5: Update the Playwright route helper to expect the project directly**

Delete `confirmDub` from `tests/e2e/dubbing.spec.ts` and add:

```ts
async function expectDubProject(page: Page) {
  await expect(page.getByRole("button", { name: "Play full video" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Start dubbing|Continue dubbing|Continue Scene/ })).toHaveCount(0);
}
```

After each enabled `page.goto()` or reload, call `expectDubProject(page)` instead of clicking Start/Continue. Replace each `Continue Scene N` click with the existing `openScene(page, N)` helper or the scene button whose accessible name starts with `Scene N,`. Preserve disabled/revoking tests and assert they never expose `Play full video` or recording controls.

- [ ] **Step 6: Run direct-entry tests and commit**

Run:

```bash
node --test tests/dub-state.test.mjs tests/dub-ui.test.mjs
npx playwright test tests/e2e/dubbing.spec.ts --grep "direct|enabled|disabled|revoking|load"
npm run build
```

Expected: focused tests PASS and build succeeds.

```bash
git add src/dubbing/dub-state.ts src/dubbing/DubStudio.tsx tests/dub-state.test.mjs tests/dub-ui.test.mjs tests/e2e/dubbing.spec.ts
git commit -m "feat: open dubbing projects directly"
```

## Task 5: Move back navigation into the header and add Previous

**Files:**
- Modify: `src/dubbing/DubSceneEditor.tsx`
- Modify: `src/dubbing/DubStudio.tsx`
- Test: `tests/dub-ui.test.mjs`
- Test: `tests/e2e/dubbing.spec.ts`

**Interfaces:**
- Consumes: existing `SELECT_LINE`, `BACK_TO_PROJECT`, media cancellation, `HeaderButton`, and `HeaderLink`.
- Produces: `DubSceneEditorProps.onPrevious(): void`; no `onBack`; scene header button `Back to full video`; two-button Previous/Next row.

- [ ] **Step 1: Write failing editor and contextual-header tests**

Update the `renderSceneEditor` helper in `tests/dub-ui.test.mjs` to provide `onPrevious() {}` and remove `onBack`. Add:

```js
it("renders previous and next navigation without a content-level back control", () => {
  const first = renderSceneEditor({ activeLine: DUB_LINES[0] });
  assert.match(first, /<button(?=[^>]*aria-label="Previous line")(?=[^>]*disabled)[^>]*>/);
  assert.match(first, /aria-label="Next line"/);
  assert.doesNotMatch(first, /aria-label="Back to full video"/);

  const middle = renderSceneEditor({ activeLine: DUB_LINES[1] });
  assert.match(middle, /aria-label="Previous line"/);
  assert.doesNotMatch(middle, /<button(?=[^>]*aria-label="Previous line")(?=[^>]*disabled)[^>]*>/);

  const final = renderSceneEditor({ activeLine: DUB_LINES[3] });
  assert.match(final, /aria-label="Next, finish scene"/);
  assert.doesNotMatch(final, /<button(?=[^>]*aria-label="Previous line")(?=[^>]*disabled)[^>]*>/);
});

it("locks both directions during unsafe and unsaved operations", () => {
  for (const props of [
    { locked: true, operation: "mic-opening" },
    { locked: false, operation: "recording" },
    { locked: true, operation: "saving" },
    { locked: false, operation: "idle", saveRecovery: "save" },
  ]) {
    const html = renderSceneEditor({ activeLine: DUB_LINES[1], ...props });
    assert.match(html, /<button(?=[^>]*aria-label="Previous line")(?=[^>]*disabled)[^>]*>/);
    assert.match(html, /<button(?=[^>]*aria-label="Next line")(?=[^>]*disabled)[^>]*>/);
  }
});
```

Add a mounted test that loads enabled status, opens Scene 1, finds exactly one `Back to full video` button in `Page navigation`, clicks it, and then finds `Back to home` as a link to `/` on the project.

- [ ] **Step 2: Run the UI tests and confirm the red state**

Run: `node --test tests/dub-ui.test.mjs`

Expected: FAIL because Previous does not exist and the back control still lives inside the editor content.

- [ ] **Step 3: Change the presentation-only editor contract**

In `DubSceneEditorProps`, delete `onBack` and add `onPrevious`. Import `ArrowLeft` next to `ArrowRight`. Remove the content-level `TextButton` named `Back to full video` and remove its extra grid row. Add:

```tsx
const firstLineInScene = lineNumber === 1;

<div className="grid grid-cols-2 gap-2">
  <ActionButton
    aria-label="Previous line"
    disabled={navigationLocked || firstLineInScene}
    fullWidth
    onClick={onPrevious}
    size="large"
    variant="surface"
  >
    <ArrowLeft aria-hidden="true" /> Previous
  </ActionButton>
  <ActionButton
    aria-label={lastLineInScene ? "Next, finish scene" : "Next line"}
    disabled={navigationLocked}
    fullWidth
    onClick={onNext}
    ref={nextButtonRef}
    size="large"
    variant="navy"
  >
    Next <ArrowRight aria-hidden="true" />
  </ActionButton>
</div>
```

Keep both actions at least `48px` tall through the shared `size="large"` control.

- [ ] **Step 4: Add previous behavior and contextual route headers in `DubStudio`**

Import `HeaderButton` with `HeaderLink`. Add:

```ts
function handlePrevious() {
  if (isUnsafeOperation(state.operation) || state.saveRecovery === "save") return;
  const sceneLineIndex = state.selectedLineIndex % definition.linesPerScene;
  if (sceneLineIndex === 0) return;
  handleSelectLine(definition.lines[state.selectedLineIndex - 1].id);
}
```

Pass `onPrevious={handlePrevious}` and remove `onBack` from `DubSceneEditor`. Render the shared header conditionally:

```tsx
<RouteHeader>
  {state.view === "scene" ? (
    <HeaderButton
      aria-label="Back to full video"
      disabled={isUnsafeOperation(state.operation) || state.saveRecovery === "save"}
      icon={<ChevronLeft strokeWidth={3.2} />}
      onClick={handleBack}
    >
      Full video
    </HeaderButton>
  ) : (
    <HeaderLink aria-label="Back to home" icon={<ChevronLeft strokeWidth={3.2} />} to="/">
      Back home
    </HeaderLink>
  )}
</RouteHeader>
```

The first press keeps the rhyme URL and returns in memory to the project; the project link then navigates to `/`.

- [ ] **Step 5: Add Playwright coverage for Previous/Next and two-step back**

Add this source-of-truth import to the top of `tests/e2e/dubbing.spec.ts`:

```ts
import { DUB_LINES } from "../../src/dubbing/dub-script";
```

In `tests/e2e/dubbing.spec.ts`, add or update a focused test:

```ts
test("scene navigation has previous and uses the shared header to return", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks");
  await expectDubProject(page);
  await openScene(page, 1);

  const previous = page.getByRole("button", { name: "Previous line" });
  await expect(previous).toBeDisabled();
  await page.getByRole("button", { name: "Next line" }).click();
  await expect(page.getByRole("heading", { name: DUB_LINES[1].text })).toBeVisible();
  await expect(previous).toBeEnabled();
  await previous.click();
  await expect(page.getByRole("heading", { name: DUB_LINES[0].text })).toBeVisible();

  await page.getByRole("navigation", { name: "Page navigation" }).getByRole("button", { name: "Back to full video" }).click();
  await expect(page.getByRole("button", { name: "Play full video" })).toBeVisible();
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL("/");
});

test("next returns to the project after the final line in a scene", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks");
  await expectDubProject(page);
  await openScene(page, 1);
  for (const line of DUB_LINES.slice(1, 4)) {
    await page.getByRole("button", { name: "Next line" }).click();
    await expect(page.getByRole("heading", { name: line.text })).toBeVisible();
  }
  await page.getByRole("button", { name: "Next, finish scene" }).click();
  await expect(page.getByRole("button", { name: "Play full video" })).toBeVisible();
});
```

- [ ] **Step 6: Run navigation tests and commit**

Run:

```bash
node --test tests/dub-ui.test.mjs
npx playwright test tests/e2e/dubbing.spec.ts --grep "previous|shared header|finish scene"
npm run build
```

Expected: focused tests PASS and build succeeds.

```bash
git add src/dubbing/DubSceneEditor.tsx src/dubbing/DubStudio.tsx tests/dub-ui.test.mjs tests/e2e/dubbing.spec.ts
git commit -m "feat: improve dubbing scene navigation"
```

## Task 6: Replay recordings that were already saved

**Files:**
- Modify: `src/dubbing/dub-api.ts`
- Modify: `src/dubbing/DubSceneEditor.tsx`
- Modify: `src/dubbing/DubStudio.tsx`
- Test: `tests/dub-api.test.mjs`
- Test: `tests/dub-ui.test.mjs`
- Test: `tests/e2e/dubbing.spec.ts`

**Interfaces:**
- Consumes: `getDubLineAudioUrl`, `DubNotEnabledError`, `playAudioLine`, `state.saved`, pending `TakePreview`, and existing abort/media-generation guards.
- Produces: `loadDubLineAudio(lineId: string, options?: DubRequestOptions): Promise<Blob>`; `DubSceneEditorProps.hasSavedTake: boolean`; **Play my recording**/**Stop my recording** control.

- [ ] **Step 1: Write failing private-audio API tests**

Extend `tests/dub-api.test.mjs` to import `loadDubLineAudio` and add:

```js
it("loads one saved line as a private same-origin blob", async () => {
  const calls = [];
  const clip = new Blob(["learner voice"], { type: "audio/webm" });
  const result = await loadDubLineAudio("line/1", {
    dubId: "five-little-ducks-v2",
    fetch: async (...args) => {
      calls.push(args);
      return new Response(clip, { status: 200 });
    },
  });
  assert.equal(await result.text(), "learner voice");
  assert.equal(calls[0][0], "/api/dubs/five-little-ducks-v2/lines/line%2F1/audio");
  assert.equal(calls[0][1].credentials, "same-origin");
});

it("maps consent loss and other saved-take failures", async () => {
  await assert.rejects(
    loadDubLineAudio("line-1", {
      fetch: async () => new Response(JSON.stringify({ error: "dubbing_not_enabled" }), {
        headers: { "Content-Type": "application/json" },
        status: 403,
      }),
    }),
    DubNotEnabledError,
  );
  await assert.rejects(
    loadDubLineAudio("line-1", { fetch: async () => new Response("", { status: 500 }) }),
    /Your recording could not be played\. Record the line again\./,
  );
  await assert.rejects(
    loadDubLineAudio("line-1", { fetch: async () => new Response(new Blob([]), { status: 200 }) }),
    /Your recording could not be played\. Record the line again\./,
  );
});
```

- [ ] **Step 2: Run API tests and confirm the red state**

Run: `node --test tests/dub-api.test.mjs`

Expected: FAIL because `loadDubLineAudio` is not exported.

- [ ] **Step 3: Implement the exact private-blob loader**

Add to `src/dubbing/dub-api.ts`:

```ts
const PLAYBACK_FAILURE = "Your recording could not be played. Record the line again.";

export async function loadDubLineAudio(
  lineId: string,
  options: DubRequestOptions = {},
): Promise<Blob> {
  const dubId = options.dubId ?? DUB_ID;
  getDubDefinition(dubId);
  const response = await requestResponse(
    options.fetch ?? globalThis.fetch,
    getDubLineAudioUrl(lineId, {
      dubId,
      learnerProfileId: options.learnerProfileId,
    }),
    {
      credentials: "same-origin",
      signal: options.signal,
    },
    PLAYBACK_FAILURE,
  );
  await notifyGuardianAccessRequiredForResponse(response);
  if (!response.ok) {
    const consentLoss = await dubConsentLossError(response);
    if (consentLoss) throw consentLoss;
    throw new Error(PLAYBACK_FAILURE);
  }
  let blob: Blob;
  try {
    blob = await response.blob();
  } catch (error) {
    friendlyFailure(error, PLAYBACK_FAILURE);
  }
  if (blob.size === 0) throw new Error(PLAYBACK_FAILURE);
  return blob;
}
```

Keep `getDubLineAudioUrl` as the sole URL constructor so learner-profile targeting and encoding stay identical to full playback.

- [ ] **Step 4: Write failing editor-state and mounted playback tests**

Update `renderSceneEditor` to default `hasSavedTake: false`. Add:

```js
it("offers replay and record-again for a previously saved line", () => {
  const html = renderSceneEditor({ hasSavedTake: true });
  assert.match(html, /aria-label="Play my recording"/);
  assert.match(html, />Record again</);
});
```

Add a mounted route test with status `line-1.saved = true`; open Scene 1, click **Play my recording**, and assert the fetch path is `/api/dubs/five-little-ducks-v2/lines/line-1/audio`, `URL.createObjectURL` receives the returned private blob, and the guide resolver is not used for the take control. Add one consent-loss response case that returns to the locked message, and one `500` case that keeps the editor open, announces the playback message, and exposes **Record again**.

Add a pending-preview case that records and saves `line-1`, clicks **Play my recording**, and asserts no private GET occurs because the in-memory preview URL is used. Stop that playback and assert the fetched-object URL revocation list is unchanged, proving the pending preview retains its separate lifetime.

- [ ] **Step 5: Run UI tests and confirm the red state**

Run: `node --test tests/dub-ui.test.mjs`

Expected: FAIL because only a pending in-memory Blob exposes the current **Hear my voice** control.

- [ ] **Step 6: Update `DubSceneEditor` labels and saved-state presentation**

Add `hasSavedTake: boolean` to props. Use:

```ts
const recordAgain = pendingTake !== null || hasSavedTake || saveRecovery !== null;
const hasPlayableTake = pendingTake !== null || hasSavedTake;
const takeLabel = operation === "take-playing"
  ? "Stop my recording"
  : "Play my recording";
```

Render the take `TextButton` whenever `hasPlayableTake`, give it `aria-label={takeLabel}`, and display **Play**/**Stop** only when the compact recovery layout needs shorter visible copy. Make idle feedback choose `Recorded ✓` when `hasPlayableTake`, while preserving `Not saved`, loading, recording, and error feedback precedence. Keep **Save again** restricted to `pendingTake && saveRecovery === "save"`.

- [ ] **Step 7: Load, play, abort, and revoke remote take blobs in `DubStudio`**

Import `loadDubLineAudio`. Add a separate fetched-object URL ref so pending preview URLs keep their current lifetime:

```ts
const fetchedTakeUrlRef = useRef<string | null>(null);

const clearFetchedTakeUrl = useCallback(() => {
  const url = fetchedTakeUrlRef.current;
  fetchedTakeUrlRef.current = null;
  if (url) URL.revokeObjectURL(url);
}, []);
```

Call `clearFetchedTakeUrl()` inside `cancelMedia`, add it to that callback's dependency list, and replace `handleHearTake` with this flow:

```ts
function handleHearTake() {
  if (state.operation === "take-playing") {
    cancelMedia(false);
    dispatch({ type: "OPERATION_FINISHED" });
    return;
  }
  if (isUnsafeOperation(state.operation)) return;

  const line = definition.lines[state.selectedLineIndex];
  const preview = takePreviewRef.current?.lineId === line.id
    ? takePreviewRef.current
    : null;
  if (!preview && !Object.hasOwn(state.saved, line.id)) return;

  const generation = cancelMedia(false);
  const controller = new AbortController();
  takeControllerRef.current = controller;
  dispatch({ type: "OPERATION_STARTED", operation: "take-playing" });

  void (async () => {
    try {
      let audioSrc = preview?.url;
      if (!audioSrc) {
        const blob = await loadDubLineAudio(line.id, {
          dubId: definition.id,
          signal: controller.signal,
        });
        if (!mountedRef.current || generation !== mediaGenerationRef.current) return;
        audioSrc = URL.createObjectURL(blob);
        fetchedTakeUrlRef.current = audioSrc;
      }
      await playAudioLine({ audioSrc, signal: controller.signal, text: line.text });
    } catch (error) {
      if (controller.signal.aborted || generation !== mediaGenerationRef.current || isAbortError(error)) return;
      if (error instanceof DubNotEnabledError) {
        handleConsentLoss();
        return;
      }
      dispatch({ type: "MARK_NEEDS_RETAKE", lineId: line.id });
      dispatch({ type: "SET_ERROR", message: "Your recording could not be played. Record the line again." });
    } finally {
      if (takeControllerRef.current === controller) takeControllerRef.current = null;
      clearFetchedTakeUrl();
      if (generation === mediaGenerationRef.current) dispatch({ type: "OPERATION_FINISHED" });
    }
  })();
}
```

Pass `hasSavedTake={Object.hasOwn(state.saved, selectedLine.id)}` to the editor. Pending preview remains first choice; remote playback never calls `resolveDubLineAudioSource` and therefore cannot fall back to a guide.

- [ ] **Step 8: Add Playwright saved-take replay coverage**

Use the existing dubbing route mock's `privateFetches` and `playedAudioSources` arrays. Start with `line-1` already saved, open Scene 1, click **Play my recording**, and assert:

```ts
await expect.poll(async () => (await dubStoreSnapshot(page)).privateFetches).toContain(
  "/api/dubs/five-little-ducks-v2/lines/line-1/audio",
);
await expect.poll(async () => (await dubStoreSnapshot(page)).playedAudioSources.some((source) => source.startsWith("blob:"))).toBe(true);
await expect(page.getByRole("button", { name: "Record again" })).toBeVisible();
await expect(page.getByRole("button", { name: "Stop my recording" })).toBeVisible();
await page.getByRole("button", { name: "Stop my recording" }).click();
await expect.poll(async () => (await dubStoreSnapshot(page)).revokedObjectUrls.length).toBeGreaterThan(0);
```

Add one mocked `403 { error: "dubbing_not_enabled" }` assertion for the locked screen. Add one mocked `500` assertion for the retained editor, alert text, and **Record again**; press **Back to full video** after that failure and assert Scene 1's accessible name contains **Needs retake**. Add a pending-preview test that records `line-1`, clicks **Play my recording**, and asserts `privateFetches` stays empty.

- [ ] **Step 9: Run saved-playback tests and commit**

Run:

```bash
node --test tests/dub-api.test.mjs tests/dub-ui.test.mjs
npx playwright test tests/e2e/dubbing.spec.ts --grep "saved recording|consent loss|record again"
npm run build
```

Expected: all focused tests PASS and build succeeds.

```bash
git add src/dubbing/dub-api.ts src/dubbing/DubSceneEditor.tsx src/dubbing/DubStudio.tsx tests/dub-api.test.mjs tests/dub-ui.test.mjs tests/e2e/dubbing.spec.ts
git commit -m "feat: replay saved dubbing takes"
```

## Task 7: Complete responsive interaction coverage and visual QA

**Files:**
- Modify: `tests/e2e/home-menu.spec.ts`
- Modify: `tests/e2e/nursery-rhymes.spec.ts`
- Modify: `tests/e2e/dubbing.spec.ts`
- Modify: `src/app/HomeMenu.tsx`
- Modify: `src/dubbing/NurseryRhymeList.tsx`
- Modify: `src/dubbing/DubProjectHome.tsx`
- Modify: `src/dubbing/DubSceneEditor.tsx`

**Interfaces:**
- Consumes: the completed rendered routes and existing Playwright auth/media harness.
- Produces: accessible, viewport-based regression tests for layout, image distinctness, alignment, controls, focus/hover, and overflow.

- [ ] **Step 1: Add the final geometry and interaction assertions before changing layout values**

In accessible Playwright terms, cover all of these exact behaviors:

```ts
// Home at 1280x900: exactly four equal-weight cards in one row.
const activityBoxes = await page.getByRole("navigation", { name: "Learning activities" }).getByRole("link").evaluateAll((links) => links.map((link) => link.getBoundingClientRect().toJSON()));
expect(activityBoxes).toHaveLength(4);
expect(Math.max(...activityBoxes.map(({ y }) => y)) - Math.min(...activityBoxes.map(({ y }) => y))).toBeLessThanOrEqual(1);
expect(Math.min(...activityBoxes.map(({ width }) => width))).toBeGreaterThan(240);

// The image dominates each desktop activity card.
for (const link of await page.getByRole("navigation", { name: "Learning activities" }).getByRole("link").all()) {
  const card = await link.boundingBox();
  const picture = await link.locator("img").boundingBox();
  expect(card).not.toBeNull();
  expect(picture).not.toBeNull();
  expect(picture!.height / card!.height).toBeGreaterThan(0.55);
}

// Project at 1280x900: player and scene panel top edges align.
const player = await page.getByRole("region", { name: "Full video player" }).boundingBox();
const scenePanel = await page.getByRole("complementary", { name: "Scene selection" }).boundingBox();
expect(player).not.toBeNull();
expect(scenePanel).not.toBeNull();
expect(Math.abs(player!.y - scenePanel!.y)).toBeLessThanOrEqual(2);

// Every selector uses a distinct generated source.
const sceneSources = await page.getByRole("navigation", { name: "Scenes" }).locator("img").evaluateAll((images) => images.map((image) => (image as HTMLImageElement).currentSrc));
expect(new Set(sceneSources).size).toBe(sceneSources.length);
```

For Five Little Ducks expect six scene cards; for Old MacDonald expect five. Assert every scene accessible name contains `Scene N`, the authored title, and a status. Hover one homepage card and one scene card, keyboard-focus each, assert each remains visible and focused, and do not inspect class strings.

- [ ] **Step 2: Run the focused browser tests and observe the red state**

Run:

```bash
npx playwright test tests/e2e/home-menu.spec.ts tests/e2e/nursery-rhymes.spec.ts tests/e2e/dubbing.spec.ts
```

Expected: any stale assumptions from the former five-card, interstitial, Continue, or one-way editor flow fail and identify exact rendered gaps.

- [ ] **Step 3: Remove every stale E2E assumption and make only test-proven layout adjustments**

Remove all positive expectations/clicks for `Start dubbing`, `Continue dubbing`, `Continue Scene`, and content-level back controls. Keep explicit absence assertions. Make every enabled route wait for `Play full video`, every scene entry select its named scene card, and every compact control-containment assertion include **Previous**, **Next**, **Record/Record again**, **Hear line**, and **Play my recording** when saved.

For each viewport below, assert document width containment, header non-overlap, visible recording action, and target sizes of at least `48×48` for header/action controls:

```ts
const requiredViewports = [
  { width: 280, height: 568 },
  { width: 320, height: 480 },
  { width: 390, height: 844 },
  { width: 640, height: 360 },
  { width: 1280, height: 900 },
];
```

Use the failing geometry assertions to tune only Tailwind utilities in the owning component named in this task. Do not edit `src/styles.css` or `src/lesson.css`, and do not weaken the geometry/accessibility assertion.

Delete the compositor-only Playwright cases named **full playback animates the story actors when motion is allowed**, **stopping playback stops visible actor motion immediately**, **stopping after a cue change cancels both pose motion and actor transitions**, and **a failed painted pose uses a safe fallback without broken-image UI**. Static generated scenes intentionally have no DOM actors, pose sprites, or animation runtime. Rewrite **reduced motion disables playing duck animation and playback cleanup stays idempotent** to retain only the playback stop, guide focus, status, and `audioContextDoubleCloses === 0` assertions.

Replace every `[data-story-stage]`, `[data-duck-actor]`, and painted-pose locator with the named player/editor region's single `img`. Replace every short-landscape `Continue Scene` geometry assertion with both first-row scene buttons from `Scenes`; each must remain at least `48×48`, below the route header, and disjoint from the player. These changes keep the media lifecycle coverage while removing assertions for the explicitly deleted compositor.

- [ ] **Step 4: Run all browser tests and commit responsive coverage**

Run: `npm run test:browser`

Expected: every Playwright test PASS.

```bash
git add tests/e2e/home-menu.spec.ts tests/e2e/nursery-rhymes.spec.ts tests/e2e/dubbing.spec.ts src/app/HomeMenu.tsx src/dubbing/NurseryRhymeList.tsx src/dubbing/DubProjectHome.tsx src/dubbing/DubSceneEditor.tsx
git commit -m "test: cover nursery rhyme responsive flows"
```

- [ ] **Step 5: Run the complete local verification suite from a clean committed tree**

Run each command separately:

```bash
npm test
npm run lint
npm run build
npm run test:browser
git diff --check
git status --short
```

Expected: all tests PASS, lint has no errors, build succeeds, `git diff --check` is silent, and `git status --short` is empty.

- [ ] **Step 6: Re-run immutable media delivery verification**

Run:

```bash
node --input-type=module <<'NODE'
import sharp from "sharp";

const urls = [
  "https://media.parrotbook.com/assets/v5/dubbing/nursery-rhymes-cover.webp",
  ...["scene-1-five-ducklings", "scene-2-four-ducklings", "scene-3-three-ducklings", "scene-4-two-ducklings", "scene-5-one-duckling", "scene-6-family-reunion"].map((name) => `https://media.parrotbook.com/assets/v5/dubbing/five-little-ducks/${name}.webp`),
  ...["scene-1-cows", "scene-2-ducks", "scene-3-pigs", "scene-4-dog", "scene-5-sheep"].map((name) => `https://media.parrotbook.com/assets/v5/dubbing/old-macdonald/${name}.webp`),
];
for (const url of urls) {
  const response = await fetch(`${url}?verify=${crypto.randomUUID()}`, { cache: "no-store" });
  if (response.status !== 200) throw new Error(`${url} returned ${response.status}`);
  if ((response.headers.get("content-type") ?? "").split(";", 1)[0] !== "image/webp") {
    throw new Error(`${url} has the wrong content type`);
  }
  if (response.headers.get("cache-control") !== "public, max-age=31536000, immutable") {
    throw new Error(`${url} has the wrong cache policy`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error(`${url} has an empty body`);
  const metadata = await sharp(bytes, { failOn: "error" }).metadata();
  if (metadata.format !== "webp" || metadata.width !== 1536 || metadata.height !== 864) {
    throw new Error(`${url} is not a decodable 1536x864 WebP`);
  }
}
console.log(`Verified ${urls.length} nursery-rhyme images.`);
NODE
```

Expected: `Verified 12 nursery-rhyme images.`

- [ ] **Step 7: Perform a final source-contract scan**

Run:

```bash
rg -n "Start dubbing|Continue dubbing|Continue Scene|Hear my voice|Stop my voice" src tests
rg -n "originalDuckScene|originalFarmScene|data-farm-animal|data-story-layer" src
git diff origin/main -- src/styles.css src/lesson.css public
```

Expected: the first two commands return no production matches; absence assertions in tests are acceptable. The final diff is empty, proving there are no page-specific CSS changes and no committed public raster assets.

## Task 8: Review, open the pull request, pass checks, and merge

**Files:**
- Review: all changes from `origin/main...HEAD`
- External state: GitHub branch and pull request

**Interfaces:**
- Consumes: a clean feature branch, complete local verification evidence, and twelve verified immutable media objects.
- Produces: one merged GitHub pull request and its merge commit on `main`.

- [ ] **Step 1: Request a fresh code review against the approved spec**

Invoke `superpowers:requesting-code-review` with the range `origin/main...HEAD` and ask the reviewer to check spec coverage, consent/privacy regressions, media/object-URL cleanup, responsive accessibility, and generated-art consistency. Resolve every valid blocker with a focused test-first commit, then run:

```bash
npm test
npm run lint
npm run build
npm run test:browser
git diff --check
git status --short
```

Expected: no unresolved blocking review findings and a clean worktree.

- [ ] **Step 2: Push the branch and open the pull request**

Run:

```bash
git push -u origin codex/nursery-rhyme-ux-redesign
gh pr create --base main --head codex/nursery-rhyme-ux-redesign --title "Redesign the nursery rhyme experience" --body "Groups both songs under one Nursery Rhymes hub, replaces shape-built/repeated scenes with twelve generated storybook illustrations, removes redundant entry and Continue actions, aligns and enlarges the project UI, adds contextual back and Previous navigation, and restores private saved-recording playback. Verified with unit, lint, build, full Playwright, and remote immutable-media checks."
```

Expected: push succeeds and `gh pr create` returns the new pull-request URL.

- [ ] **Step 3: Wait for every required GitHub check**

Run:

```bash
gh pr checks --watch
gh pr view --json url,state,mergeable,reviewDecision,statusCheckRollup
```

Expected: all required checks are successful, the PR is open and mergeable, and there are no blocking review requests. If a check fails, inspect that check's log, reproduce its exact command locally, use `superpowers:systematic-debugging`, push the focused correction, and repeat this step; do not merge a failing PR.

- [ ] **Step 4: Squash-merge and verify the merged state**

Run:

```bash
gh pr merge --squash --delete-branch
gh pr view --json url,state,mergedAt,mergeCommit
```

Expected: `state` is `MERGED`, `mergedAt` is non-null, and `mergeCommit` identifies the commit now on `main`.
