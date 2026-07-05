# Peppa Sprite Normalization Design

## Goal

Normalize the six Peppa pose assets so every file has the same canvas size and
Peppa appears at a consistent scale, horizontal position, and foot baseline
during lesson playback.

## Scope

Modify only the six WebP files in `public/assets/characters/peppa` and their
focused asset regression test. Do not change CSS, lesson data, voices, audio,
playback controls, other character assets, or `.superpowers/`.

## Normalized Geometry

- Encode every sprite on a `1024 × 1024` transparent canvas.
- Scale each complete pose uniformly so Peppa's body measures `860` pixels from
  the topmost ear to the bottom of the shoes.
- Place the shoe-bottom baseline at `y = 940`.
- Center Peppa's body horizontally at `x = 512`.
- Measure body anchors per pose without detached presentation effects such as
  ground shadows or speaking rays. Transform those effects with the pose so
  their relative position remains unchanged.
- Preserve all nontransparent pose artwork inside the canvas. Do not trim
  hands, tails, shadows, speaking rays, or other visible pixels.

The shared geometry leaves 80 pixels above the normalized body and 84 pixels
below its shoe baseline. Existing shadow offsets fit inside the lower margin,
and the widest effect-heavy pose fits inside the horizontal canvas.

## Image Processing

- Perform one uniform scale and translation per source asset; do not redraw,
  regenerate, or independently move character details.
- Resample RGBA together with a high-quality filter to avoid color fringes at
  transparent edges.
- Encode the outputs as lossless WebP with alpha.
- Preserve the repaired opaque eye and shoe regions through the transform.
- Keep the exterior and unused canvas area fully transparent.

Resampling is explicitly allowed for this normalization, so decoded RGB hashes
will change from the pre-normalized assets. The output hashes will be captured
after visual approval to detect unintended future drift.

## Verification

Update the focused Peppa asset regression test to check:

- all six files are `1024 × 1024` RGBA WebPs;
- transparent exterior corners remain transparent;
- body height is `860` pixels within a one-pixel resampling tolerance;
- shoe bottoms share the `y = 940` baseline within one pixel;
- body centers share `x = 512` within one pixel;
- transformed eye and shoe interiors contain no partial alpha; and
- output RGB hashes match the visually approved normalized assets.

Render all six poses together on a colored background and inspect them at full
size. Confirm consistent character scale and cropping, aligned feet, preserved
pose details, intact eye and shoe opacity, and no clipped or newly opaque
background pixels. Run the Peppa alpha, lesson-data, and web-asset tests before
committing the focused implementation.
