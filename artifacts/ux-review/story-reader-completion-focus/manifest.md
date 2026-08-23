# Story Reader completion-focus evidence

Captured 2026-08-24 (Asia/Shanghai) for
`codex/story-reader-completion-focus`.

## Provenance

- Every image is a genuine Codex in-app Browser JPEG whose pixel dimensions
  match its filename.
- Baseline source: `codex/story-reader-join-in-visibility` documentation
  hand-off `9d891a7`, served locally from `http://127.0.0.1:4210`.
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

Candidate images and the final visual decision will be added only after the
implementation is exercised in the in-app Browser. Expected filenames:

- `after-completion-heading-focus-280x568.jpg`
- `after-completion-heading-focus-640x360.jpg`

## Integrity

SHA-256 digests for the baseline evidence:

```text
a3cf1b4b41bbc76d376690f8bcf22ae1a6b353eec81e012a0f2a0980e10ac025  before-completion-body-focus-280x568.jpg
6207083350633a79e079126315659a16b97b45e50842dfd4ff797d1683670b5d  before-completion-body-focus-640x360.jpg
```

## Limits

The baseline covers deterministic English left-to-right content in one local
Chromium environment. The retained screenshots do not prove announcement
order, switch scanning, physical touch behavior, real forced-color palettes,
Safari/Firefox, zoom, text spacing, safe areas, localization, or child and
caregiver comprehension. They document the product state that motivated a
bounded focus transition.
