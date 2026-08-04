# Pixel stage proof of concept

Open `/prototypes/pixel-stage/` from the Vite development server.

The revised prototype deliberately uses one real virtual resolution:

- one original 240 × 160 game world with a 24-color palette;
- one 256 × 256 sprite sheet with sixteen 64 × 64 frames;
- one foreground occlusion layer extracted from the same world art;
- Phaser 4 sprite animation and Arcade Physics; and
- Phaser's integer-only `MAX_ZOOM` scaling with pixel-art rendering.

The browser never stretches a source pixel by a fractional amount. On a
390-pixel-wide phone, for example, the whole world renders at exactly 1×:
240 × 160 screen pixels. Wider displays use the largest whole-number scale that
fits, such as 4× for a 960 × 640 world.

Peppa is a `Phaser.Physics.Arcade.Sprite` and can move with arrow keys, WASD, or
the on-screen direction pad. Phaser owns velocity, world bounds, collision
bodies, sprite-sheet animation, and render ordering. The only local game data
is the world size, character start point, animation ranges, and scenery shapes
in `prototypes/pixel-stage/world-config.js`.

It is isolated from the lesson player. The purpose is to judge the visual
direction and the asset-production consistency before changing lesson data or
runtime code.
