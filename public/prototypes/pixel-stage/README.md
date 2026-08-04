# Pixel stage proof of concept

Open `/prototypes/pixel-stage/` from the Vite development server.

The revised prototype deliberately uses one real virtual resolution:

- one original 120 × 80 game world with a 24-color palette;
- one 128 × 128 sprite sheet with sixteen 32 × 32 frames;
- a small frame resolver; and
- integer-only scaling with nearest-neighbor rendering.

The browser never stretches a source pixel by a fractional amount. On a
390-pixel-wide phone, for example, the whole world renders at exactly 3×:
360 × 240 screen pixels.

It is isolated from the lesson player. The purpose is to judge the visual
direction and the asset-production consistency before changing lesson data or
runtime code.
