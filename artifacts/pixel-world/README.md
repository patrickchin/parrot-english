# Pixel world visual review

This folder records the baseline, calibration, and final visual evidence for
the deterministic pixel-world pipeline.

## Outcome

- Every shipped texture uses exact `2 × 2` world-pixel authored cells. At the
  runtime's integer `2×` camera zoom, those become exact `4 × 4` screen-pixel
  squares.
- The compiler gate verifies declared dimensions, the shared 32-color palette,
  binary alpha, opaque terrain, and identical RGBA values inside every aligned
  `2 × 2` cell for all 52 assets.
- The final pack contains eight scene recipes, eighteen scenery objects, and
  sixteen objects that are both placeable and holdable.
- One `mainHand` character socket plus frame-specific anchors and per-item grip
  pivots handles apples, brushes, books, baskets, tools, toys, and other item
  shapes without generating a full character sheet per item.

## Most useful evidence

- `final/scene-library-contact-sheet.png`: all eight scene recipes.
- `final/scenery-library-contact-sheet.png`: all eighteen scenery sprites at
  nearest-neighbor `2×` review scale.
- `final/holdable-library-contact-sheet.png`: all sixteen holdable sprites at
  nearest-neighbor `4×` review scale.
- `final/parallax-comparison-contact-sheet.png`: matched horizontal-movement
  captures with parallax off and camera parallax on.
- `baseline/`: the old garden at the original, mobile, desktop, and wide
  review sizes.
- `contact-sheets/pixel-pitch-calibration-01.png`: same runtime texel pitch but
  inconsistent authored detail density.
- `contact-sheets/pixel-pitch-calibration-02-cell2.png`: the selected shared
  authored-cell rule.

The `final/` directory also contains the full-page and isolated-stage source
captures used to build the contact sheets. They cover 390×844 mobile,
1024×822 original-review, 1280×720/900 desktop, and 1920×1080 wide viewports.

## Screenshot analysis

1. The original problem was not primarily Phaser scaling. Peppa and nearby
   textures reached the screen at the same source-texel pitch, but Peppa used
   broad clusters while foliage and the brush contained much denser details.
2. A native grid alone did not solve the mismatch. Enforcing a shared authored
   cell before nearest-neighbor expansion did: Peppa, trees, ground, props,
   and small items now expose the same smallest visible square.
3. Aspect-preserving normalization matters. The compiler cover-crops opaque
   canvases and bottom-centers transparent horizon strips instead of stretching
   generated concepts into their target rectangles.
4. The camera follows Peppa's visual center rather than her feet, preventing
   her ears from being cropped while retaining integer zoom.
5. Mobile intentionally shows a closer crop because fractional downscaling
   would reintroduce uneven pixels. The controls and page remain usable without
   horizontal overflow.
6. Horizontal camera parallax adds readable separation among clouds, hills,
   and treelines while preserving the play plane. It is the recommended
   default. Vertical parallax is disabled because it changed the scene
   composition rather than its depth. Ambient cloud drift remains an optional
   experiment, and reduced-motion preference forces parallax off.

## Known boundary

Tall scenery currently uses whole-sprite foot-depth ordering. A later art pass
can split tree canopies or stall awnings into explicit foreground overlays when
the game needs Peppa to walk partly behind them. That extension does not change
the pixel, palette, scene, or item-socket contracts.

## Reproduce

Start the local Vite app with its normal E2E mock API, then run:

```sh
PIXEL_WORLD_CAPTURE_URL=http://127.0.0.1:4174 \
  npm run capture:pixel-world
```

The capture script disables CSS animation, uses device scale factor 1, waits
for the exact scene/parallax/item state, and writes the review matrix under
`artifacts/pixel-world/final`.
