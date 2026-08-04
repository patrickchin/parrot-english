# Pixel stage proof of concept

Open `/prototypes/pixel-stage/` from the Vite development server.

The revised prototype deliberately uses one real virtual resolution:

- one original 240 × 160 game world with a 24-color palette;
- one 256 × 256 sprite sheet with sixteen 64 × 64 frames;
- a small frame resolver; and
- integer-only scaling with nearest-neighbor rendering.

The browser never stretches a source pixel by a fractional amount. On a
390-pixel-wide phone, for example, the whole world renders at exactly 1×:
240 × 160 screen pixels. Wider displays use the largest whole-number scale that
fits, such as 4× for a 960 × 640 world.

It is isolated from the lesson player. The purpose is to judge the visual
direction and the asset-production consistency before changing lesson data or
runtime code.
