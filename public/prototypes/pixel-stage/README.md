# Willowbrook pixel-stage proof of concept

Open `/prototypes/pixel-stage/` from the Vite development server.

This version is built as a small game world rather than a background and a
foreground image:

- Phaser 4 owns the tilemap, Arcade Physics, input, animation, camera, and
  render ordering;
- the canvas is a GBA-sized 240 × 160 pixels, while the compact map is only
  240 × 160 world pixels (15 × 10 tiles);
- a 2× integer camera zoom makes every character, building, path, and prop
  uniformly larger without changing their proportions or collision geometry;
- every ground and scenery asset uses a 16 × 16 source-pixel grid;
- each tall object declares its visual tiles, collision footprint, and foot
  line together; and
- Peppa and scenery share the same `1000 + footY` depth rule, so Peppa passes
  behind or in front of an object according to where her feet are.

The world uses Kenney's **Tiny Town** 16 × 16 tileset under CC0. The bundled
license is in `assets/tiny-town-license.txt`. Peppa's 64 × 64 animation sheet is
rendered at 0.5 scale so her visible pixels align with the environment's scale.

This remains isolated from the lesson player. Its purpose is to validate the
gameplay and art direction before any lesson schema or runtime integration.
