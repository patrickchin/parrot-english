# Peppa lesson-garden proof of concept

Open `/prototypes/pixel-stage/` from the Vite development server.

This is a small Phaser game space built around the environments the current
lessons actually use. The first vertical slice is the daytime garden shared by
the ball, flower, and market lessons. It contains only a path, open lawn, a
tree with the lesson ball, flowers, a basket, and a small apple counter.

The art is project-owned and generated for this prototype:

- `lesson-garden-ground.png` is an opaque 720 × 480 walkable garden map;
- the four `garden-*.png` files are transparent, bottom-anchored lesson props;
- `peppa-town-sheet-96.png` is a 4 × 4 animation sheet with 96 × 96 frames.

The game uses a three-times-finer render grid than the earlier 16/32-pixel
prototype. A logical tile is now 48 source pixels and Peppa remains at her
native 96-pixel frame size. Phaser renders a 360 × 240 canvas without
fractionally shrinking sprites; the framed stage displays that canvas at 1× or
2× integer scale. Idle is one stable frame, while movement and emotes use their
own centered, foot-aligned cycles.

Phaser owns movement, Arcade Physics, camera following, animation, and render
ordering. Each prop declares one collision footprint and foot line, and both
Peppa and the props use `1000 + footY` depth. That keeps real behind/in-front
movement without a monolithic foreground overlay.

The next two reusable environment families, if the POC direction holds, are a
daytime meadow for snack/playground/picnic lessons and an evening palette of
that meadow for the bedtime lesson. This prototype remains isolated from the
lesson player until the gameplay and art direction are approved.
