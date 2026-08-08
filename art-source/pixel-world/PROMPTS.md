# Pixel world source prompts

Mode: built-in `image_gen`, one generation call per distinct source asset.

Generated sources are deliberately requested as clean flat illustrations, not
as pixel art. The deterministic compiler creates the final pixel grid.

## Object template

> Clean flat-color children's storybook game-sprite concept of one isolated
> [OBJECT]. Centered with a simple readable silhouette, dark plum outline, and
> limited cel shading. No text, no drop shadow, no scene, and explicitly no
> pixel-art or fake-pixel texture. Exact flat [CHROMA] background.

Green subjects use `#ff00ff`; other subjects use `#00ff00`. The chroma-key
helper removes the background before compilation.

This template produced:

- scenery: oak tree, pine tree, fruit tree, round bush, hedge, flower patch,
  tall grass, rocks, fallen log, fence, signpost, bench, picnic blanket,
  market stall, pond reeds, lamp post, playground slide, and swing set;
- holdables: apple, pear, banana, carrot, paint brush, storybook, juice bottle,
  lantern, ball, flower, picnic basket, watering can, shovel, kite, teddy bear,
  and wrapped gift.

## Parallax template

> Wide 16:9 clean flat-color children's storybook [LAYER] source. A readable
> distant silhouette occupying the requested portion of the frame, limited cel
> shading, no characters, no text, and no fake pixel art.

Skies are opaque. Clouds, hills, treelines, and the distant village use chroma
backgrounds and become transparent layers.

## Ground template

> Wide 3:2 clean flat-color children's storybook walkable [THEME] terrain
> plane, top-down/three-quarter view, with an open central play area and
> thematic edge details only. No characters, no freestanding props, no text,
> no fake pixel art. Fully opaque and fill the canvas.

Themes: garden, orchard, market, pond, meadow, playground, forest, and village.

## Character source

The first character pass reuses the project-owned Peppa animation sheet as a
high-resolution source. The compiler converts its sixteen frames to native
`160 × 160` frames on the same authored-cell grid and shared palette. A future
character redraw can replace that source without changing the runtime contract.
