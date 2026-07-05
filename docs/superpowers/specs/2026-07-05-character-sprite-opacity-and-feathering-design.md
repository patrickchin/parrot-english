# Character Sprite Opacity and Feathering Design

## Goal

Repair all Peppa and Dolly pose sprites so their colored fills and linework are
solid, their outer edges are smoothly antialiased, and their normalized framing
is consistent without changing the illustrated poses.

## Scope

Modify the six Peppa WebPs and six Dolly WebPs in
`public/assets/characters/{peppa,dolly}` plus focused asset regression checks.
Do not change CSS, playback controls, lesson JSON, voices, audio, other
characters, or `.superpowers/`.

## Source Selection

- Rebuild Peppa from the six source blobs at commit `f5db001`, before the
  incorrect eye-hole alpha repair and before canvas normalization.
- Rebuild Dolly from the current six Dolly source files, which have not been
  modified by the Peppa repairs.
- Apply one transform to each complete pose. Do not independently move, redraw,
  regenerate, or restyle character details.

## Normalized Geometry

Every output uses a `1024 × 1024` transparent canvas and a common foot baseline
at `y = 940`.

- Peppa: `860` pixels from the topmost ear to the shoe-bottom baseline.
- Dolly: `720` pixels from the topmost crest feather to the foot-bottom
  baseline.
- Center each character's torso at `x = 512`.
- Exclude detached effects such as stars and speaking rays when measuring the
  body anchor, but transform them with the complete pose.
- Preserve every visible hand, wing, tail, feather, shadow, ray, and star inside
  the canvas.

Dolly remains smaller than Peppa while every pose within each character set
uses the same scale, crop, center, and baseline.

## Solid Interior Color

- Treat every source pixel with nonzero alpha as visible artwork support.
- Make fills, outlines, facial details, tail feathers, shadows, rays, and stars
  fully opaque inside their support regions.
- Keep true negative-space holes and the unused canvas transparent.
- Restore Peppa's eye sclera to solid white RGB with full alpha, using the
  pre-repair eye alpha to distinguish sclera from pupils and pink outlines.
- Preserve decoded RGB for existing nonzero-alpha artwork. When an enclosed
  required detail has zero-alpha RGB with checkerboard contamination, replace
  it with the local intended solid color rather than exposing hidden RGB.
- Do not flatten intentional RGB shading or gradients; “solid” refers to alpha,
  not converting the artwork to a limited color palette.

These rules remove background-colored checker patterns from linework and fills
without altering the illustrated style.

## Edge Feathering

Build a full-opacity support mask before resizing. Render each normalized pose
at four times the final dimensions, then downsample once to `1024 × 1024` with
premultiplied-alpha Lanczos filtering.

- Pixels at least two final pixels inside a colored region remain alpha `255`.
- Partial alpha is allowed only within the outermost one-to-two-pixel boundary
  between artwork and transparent negative space.
- Do not run a Gaussian blur over the complete sprite; it would soften linework
  and create halos.
- Do not post-threshold the final outer edge; shoes, feathers, and outlines need
  the same smooth antialiasing as the rest of the silhouette.

## Verification

Focused regression checks will verify:

- all twelve assets are `1024 × 1024` RGBA WebPs;
- transparent canvas corners remain alpha `0`;
- Peppa and Dolly match their respective body heights, shared center, and
  baseline within one pixel;
- every pixel more than two pixels inside artwork support is alpha `255`;
- every partial-alpha pixel lies within two pixels of transparent background;
- Peppa eye sclera pixels are opaque white while pupils and outlines remain;
- approved decoded RGB hashes lock the repaired artwork; and
- no visible artwork is clipped by the normalized canvas.

Render Peppa and Dolly contact sheets on cyan, white, and black backgrounds plus
alpha-only sheets. Inspect all twelve poses at full size for consistent framing,
solid colors and lines, white Peppa eyes, smooth boundaries, preserved pose
details, and absence of checkerboard contamination. Run the focused character
asset, lesson-data, and web-asset tests before committing the implementation.
