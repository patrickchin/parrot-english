# Peppa lesson-garden proof of concept

Open `/prototypes/pixel-stage/` from the Vite development server.

This is a small Phaser game space built around the environments the current
lessons actually use. The first vertical slice is the daytime garden shared by
the ball, flower, and market lessons. It contains only a path, open lawn, a
tree with the lesson ball, flowers, a basket, and a small apple counter.

The art is project-owned and generated for this prototype. Every live asset is
normalized to the same 2 × 2 art-cell grid, hard alpha, and shared 64-color
palette:

- `lesson-garden-ground.png` is an opaque 720 × 480 walkable garden map;
- the four `garden-*.png` files are transparent, bottom-anchored lesson props
  sized relative to Peppa: 144 × 192 tree, 80 × 56 flowers, 48 × 32 basket,
  and 120 × 80 market counter;
- `peppa-town-sheet-96.png` is a 4 × 4 animation sheet with 96 × 96 frames.

The game uses a three-times-finer render grid than the earlier 16/32-pixel
prototype. A logical tile is now 48 source pixels and Peppa remains at her
native 96-pixel frame size. No world image calls `setScale` or `setDisplaySize`:
Phaser renders each source pixel to exactly one intrinsic canvas pixel at camera
zoom 1. The camera viewport adapts to the browser pane on the same 2-pixel art
grid, then Phaser magnifies the complete canvas at an integer 1×, 2×, or 3×.
For example, a 672 × 966 split pane gets a 334 × 450 intrinsic viewport shown
at exactly 668 × 900, while a 1280 × 720 window gets a 426 × 240 viewport shown
at 1278 × 720. Every asset is magnified together, pointer coordinates stay in
sync with Phaser, and the game fills the window without fractional pixels. Idle
is one stable frame, while movement and emotes use centered, foot-aligned cycles.

Phaser owns movement, Arcade Physics, camera following, animation, and render
ordering. Each prop declares one collision footprint and foot line, and both
Peppa and the props use `1000 + footY` depth. That keeps real behind/in-front
movement without a monolithic foreground overlay.

The next two reusable environment families, if the POC direction holds, are a
daytime meadow for snack/playground/picnic lessons and an evening palette of
that meadow for the bedtime lesson. This prototype remains isolated from the
lesson player until the gameplay and art direction are approved.
