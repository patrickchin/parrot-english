# Pixel stage proof of concept

Open `/prototypes/pixel-stage/` from the Vite development server.

The prototype deliberately uses only:

- one 832 × 468 pixel-art background;
- one 256 × 256 sprite sheet with sixteen 64 × 64 frames;
- a 20-line frame resolver; and
- CSS background positioning with nearest-neighbor rendering.

It is isolated from the lesson player. The purpose is to judge the visual
direction and the asset-production consistency before changing lesson data or
runtime code.
