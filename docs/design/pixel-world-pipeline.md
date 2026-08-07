# Pixel world art pipeline

The game does not trust generated images to satisfy pixel dimensions or pixel
style. Generated images are source concepts. The compiler creates the pixels
that ship.

## Why the old scene looked inconsistent

The Phaser renderer already disabled smoothing and rounded camera pixels. The
old Peppa, tree, flower, and market textures also reached the screen at the
same source-texel scale. The mismatch was inside the artwork: Peppa used broad
color clusters while foliage and props used much denser one-pixel texture.

A shared runtime scale was therefore necessary but not sufficient. The new
pipeline enforces both a runtime grid and an authored detail grid.

## Enforced contract

| Property | Contract |
| --- | --- |
| Logical world | `720 × 480` world pixels |
| Play plane | opaque `720 × 320` terrain beginning at world `y = 160` |
| Camera | integer `2×` zoom |
| Runtime asset scale | `1` for every asset |
| Character frame | native `160 × 160` world pixels |
| Authored art cell | `2 × 2` world pixels |
| Visible art cell | exact `4 × 4` screen pixels at `2×` camera zoom |
| Alpha | `0` or `255`; no partial alpha in compiled art |
| Palette | one shared palette, maximum 32 colors |
| Placement | integer world coordinates and bottom-center origins |
| Transforms | no fractional asset scale and no runtime sprite rotation |

The authored-cell rule is the important addition. Every source is first
sampled on a grid at half its native width and height. Each authored cell is
then expanded with nearest-neighbor replication to a `2 × 2` block. This
prevents a tree from sneaking in finer leaf pixels than the character or a
small brush.

## Source and output boundary

- Source concepts: `art-source/pixel-world/sources`
- Source policy: `art-source/pixel-world/manifest.json`
- Compiler: `scripts/generate-pixel-world-assets.mjs`
- Pure compiler functions: `scripts/lib/pixel-art-compiler.mjs`
- Runtime outputs: `public/assets/pixel-world`
- Runtime world pack: `prototypes/pixel-stage/world-pack.js`

Transparent concepts are generated on a chroma background and processed with
the image-generation skill's chroma-key helper. Opaque skies and terrain fill
their source canvases. The compiler then:

1. validates the declared native dimensions and `worldScale: 1`;
2. trims transparent object sources;
3. fits objects bottom-center on the authored-cell canvas;
4. normalizes concepts without changing their aspect ratio: cover-crop for
   opaque canvases and bottom-centered contain for transparent horizon strips;
5. downsamples normalized art to the same authored-cell grid;
6. hardens alpha at the configured threshold;
7. maps every visible cell to the shared palette;
8. expands cells by nearest-neighbor replication;
9. writes lossless local PNGs and a hash/quality manifest.

Run the complete compiler with:

```sh
npm run generate:pixel-world-assets
```

Compile selected assets while iterating with:

```sh
npm run generate:pixel-world-assets -- --only object-red-apple,object-oak-tree
```

Partial compilation merges updated entries into the existing complete
manifest in stable world-pack order. The manifest contains no wall-clock
timestamp, so unchanged full and partial compiles are byte-for-byte stable.

## Reusable world model

The pack deliberately has one `objects` collection, not separate scenery and
item engines. Capabilities describe use:

- `placeable`
- `holdable`
- `blocking`
- `occluder`

This allows an apple, basket, gift, or ball to exist in the world and also be
attached to a hand. Peppa has one named `mainHand` socket with frame-specific
anchors. The runtime composes the selected object at that socket; it does not
need a full-body Peppa sprite for every item.

The initial pack contains eight scenes, eighteen scenery objects, and sixteen
holdable objects. Scenes are recipes made from `sky`, `far`, `mid`, `play`, and
`foreground` layers plus object placements.

The opaque play plane starts at `y = 160`, leaving the upper world visible for
sky and distant layers. The physics bounds use the same playfield rectangle,
so the player cannot walk into the horizon band.

## Parallax experiment

Parallax is optional and reviewable in the World Explorer:

- **Off:** every background layer follows the world.
- **Camera:** sky, clouds, hills, and distant scenery use conservative scene
  scroll factors.
- **Ambient:** camera parallax plus art-cell-snapped cloud drift.

Reduced-motion preference forces the effective mode to off. Gameplay objects,
the character, and held items always stay on the play plane. The default mode
is camera-only so screenshot captures are deterministic. Visual A/B review
selected horizontal camera parallax: it adds depth without changing the
vertical horizon composition. Ambient drift remains an experiment rather than
a scene requirement.

## Visual review loop

For each material change:

1. compile the complete pack;
2. open `/games/worlds`;
3. capture the same scene at mobile, desktop, wide, and the original review
   viewport;
4. capture several different scene recipes and held items;
5. compare parallax off and camera modes at the same player position;
6. inspect contact sheets at nearest-neighbor magnification;
7. reject any asset that introduces smaller detail cells, soft edges,
   non-square pixels, rotation blur, or a different palette vocabulary.

The checked-in browser tests cover the review controls and runtime metadata.
The compiler tests cover palette mapping, hard alpha, native dimensions, and
the shared authored-cell expansion. The compiled-asset integration gate also
decodes all 52 runtime PNGs and verifies every aligned `2 × 2` cell directly.
Curated screenshots, contact sheets, and analysis live in
`artifacts/pixel-world`.
