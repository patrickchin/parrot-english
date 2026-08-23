# Story Reader completion-focus evidence

Captured 2026-08-24 (Asia/Shanghai) for
`codex/story-reader-completion-focus`.

## Provenance

- Every image is a genuine Codex in-app Browser JPEG whose pixel dimensions
  match its filename.
- Baseline source: `codex/story-reader-join-in-visibility` documentation
  hand-off `9d891a7`, served locally from `http://127.0.0.1:4210`.
- Rejected-candidate source: an uncommitted first visual candidate on top of
  research commit `bbf68ce`. It focused the correct heading but copied the
  page-text marker's four-pixel gap. These files are retained as decision
  evidence and must not be described as the product.
- Retained source: production and test commit `cedd6c8`, served from the same
  local origin after Vite hot reload. The only uncommitted product-adjacent
  files at retained capture time were this evidence and documentation; rendered
  production code matched `cedd6c8`.
- The app used the repository's opt-in deterministic E2E session/API fixtures.
  No production account, story, microphone, or child data was used.
- The Browser viewport was explicitly overridden before every capture. The Red
  Ball's last page was loaded directly, **Finish story** was activated, and the
  image was saved only after the **Story finished** region was visible.
- DOM inspection after each baseline capture verified that
  `document.activeElement === document.body`; window, document, body, and main
  scroll positions were zero.
- JPEGs are qualitative review evidence. Candidate pixel/contrast and geometry
  assertions will use fresh lossless browser screenshots and DOM rectangles,
  not these compressed files.

## Baseline captures

| File | Viewport | Evidence moment |
| --- | ---: | --- |
| [before-completion-body-focus-280x568.jpg](./before-completion-body-focus-280x568.jpg) | 280×568 | Completion after pointer Finish; no visible product focus location |
| [before-completion-body-focus-640x360.jpg](./before-completion-body-focus-640x360.jpg) | 640×360 | Short-landscape completion; primary replay action remains fully visible, with no focus location |

## Baseline observation

The completion design itself remains visually clear: artwork, icon, **The
end!**, **Great job!**, one story-specific sentence, and one primary action form
a readable hierarchy. The issue is absence rather than clutter—when the
focused Finish control disappears, nothing in the new state shows where the
interaction or reading position moved.

At 280×568, **Listen again** occupies y 453.328…505.328 and is fully visible.
At 640×360 it occupies y 302…354 and remains complete at the lower edge.
**Pick another story** begins below the short-landscape fold, while the
completion main remains vertically scrollable. The selected candidate should
therefore focus the already-visible heading with `preventScroll`, not scroll
directly to the secondary action.

## Candidate captures

| File | Viewport | Evidence moment |
| --- | ---: | --- |
| [rejected-close-marker-280x568.jpg](./rejected-close-marker-280x568.jpg) | 280×568 | Rejected four-pixel-gap focus marker; optically joins the heading |
| [rejected-close-marker-640x360.jpg](./rejected-close-marker-640x360.jpg) | 640×360 | Rejected four-pixel-gap marker in the short-wide composition |
| [after-completion-heading-focus-280x568.jpg](./after-completion-heading-focus-280x568.jpg) | 280×568 | Retained heading focus with eight-pixel cream separation |
| [after-completion-heading-focus-640x360.jpg](./after-completion-heading-focus-640x360.jpg) | 640×360 | Retained short-wide heading focus with primary action complete |

## Visual decision

The first four-pixel-gap candidate was functionally correct and had no closed
shape, but independent review found that the full-height rule could be read as
`|Great job!`—a capital **I**, caret, or stray glyph. Moving only the rule four
pixels farther left leaves an eight-pixel cream gap. Independent re-review
retained that revision: the rule reads as an external location/accent marker,
while the hierarchy and open reading-marker convention remain intact. Further
shortening or rounding was rejected as unnecessary.

At 280×568, the retained heading remains at x 67.914, y 369.328 with a
144.172×30 px box. The marker occupies x 55.914…59.914 and leaves eight pixels
before the title. **Listen again** remains at x 40, y 453.328 with its original
200×52 px box. At 640×360, the heading remains at x 381.492, y 212 with a
173.008×36 px box; the marker occupies x 369.492…373.492; and **Listen again**
remains at x 356, y 302 with its original 224×52 px box. Completion entry keeps
window, document, body, and main scroll at zero at both sizes.

A decoded baseline/retained JPEG comparison using a per-channel difference
threshold of 24 found every strong changed pixel inside the marker: 124 pixels
at x 56…59, y 369…399 on the phone and 180 pixels at x 369…373, y 212…247 in
short landscape. JPEG comparison is qualitative evidence that no visible
content moved; the browser suite separately owns live DOM geometry, overflow,
focus, contrast, and forced-colors assertions.

## Integrity

SHA-256 digests:

```text
6696cc8f201c46b9707d19389e91c76c1b2a00d85792ae5255d623dce1f0f865  after-completion-heading-focus-280x568.jpg
13d0e913352d14c1accc8cd045306b5cb5119c14b2ce4bb63a6eaa06b585f114  after-completion-heading-focus-640x360.jpg
a3cf1b4b41bbc76d376690f8bcf22ae1a6b353eec81e012a0f2a0980e10ac025  before-completion-body-focus-280x568.jpg
6207083350633a79e079126315659a16b97b45e50842dfd4ff797d1683670b5d  before-completion-body-focus-640x360.jpg
0bf7317b990819a34a8e3e46082c0ee3ec14ad4cd35e67ed9a674d4d1bae0d6b  rejected-close-marker-280x568.jpg
1fe24822d23ae254e56259e797007e4ee3bc5e635fdcd8bd17d76ffe64a41f32  rejected-close-marker-640x360.jpg
```

## Limits

The evidence covers deterministic English left-to-right content in one local
Chromium environment. The retained screenshots do not prove announcement
order, switch scanning, physical touch behavior, real forced-color palettes,
Safari/Firefox, zoom, text spacing, safe areas, localization, or child and
caregiver comprehension. They document the product state that motivated a
bounded focus transition.
