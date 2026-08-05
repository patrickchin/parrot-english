# Peppa lesson-garden proof of concept

Open `/prototypes/pixel-stage/` from the Vite development server.

This is a small Phaser game space built around the environments the current
lessons actually use. The first vertical slice is the daytime garden shared by
the ball, flower, and market lessons. It contains only a path, open lawn, a
tree with the lesson ball, flowers, a basket, and a small apple counter.

The art is project-owned and generated for this prototype. Approved PNGs are
served from the versioned R2 root
`https://media.parrotbook.com/prototypes/pixel-stage/v1`; their dimensions and
SHA-256 hashes are recorded in `prototypes/pixel-stage/assets.json`. Private
source copies and provenance stay in `parrot-english-art-source`. Every live
transparent sprite uses hard alpha and newly authored one-pixel detail rather
than duplicated pixels:

- `lesson-garden-ground.png` is an opaque 1440 × 960 source for the 720 × 480
  walkable garden map;
- the four `garden-*.png` files are newly redrawn, transparent, bottom-anchored
  lesson props: 432 × 576 tree, 240 × 168 flowers, 144 × 96 basket, and
  360 × 240 market counter;
- `peppa-town-sheet-320.png` is a newly redrawn 1280 × 1280, 4 × 4 animation
  sheet with 320 × 320 authored frames and substantially denser facial,
  clothing, limb, and expression detail.

The game uses a three-times-finer render grid than the earlier 16/32-pixel
prototype. A logical tile remains 48 world pixels. The ground's independent 2×
source scale still maps its 1440 × 960 texture onto the 720 × 480 world. Phaser
renders the newly authored sprites at 0.5 world scale, while the camera presents
the world at 2×. That maps each authored sprite texel one-for-one to the screen
without pretending duplicated pixels are additional detail. Peppa now occupies
a 320 × 320 screen frame and the visible character is about 300 pixels tall,
nearly twice the previous visible height. The props are also 50% larger than
their previous on-screen footprints. Their collision footprints grow with the
art. The canvas and its backing buffer fill the viewport without CSS resampling.
The HUD, speech, movement buttons, and emote buttons remain compact overlays on
the canvas, so no separate controls panel reduces the playable area. Idle is one
stable frame, while movement and emotes use centered, foot-aligned cycles.

Phaser owns movement, Arcade Physics, camera following, animation, and render
ordering. Each prop declares one collision footprint and foot line, and both
Peppa and the props use `1000 + footY` depth. That keeps real behind/in-front
movement without a monolithic foreground overlay.

The next two reusable environment families, if the POC direction holds, are a
daytime meadow for snack/playground/picnic lessons and an evening palette of
that meadow for the bedtime lesson. The standalone page remains the fixed
regression harness for this proof of concept. The authenticated `/games` Pixel
Lesson Lab uses the same approved garden configuration and art in a separate
React-owned Phaser runtime, where generated mission text and allowlisted target
IDs can be investigated without allowing generation to control assets,
coordinates, or physics.
