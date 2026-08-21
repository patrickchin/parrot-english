# Story Reader page-arrival focus evidence

Captured 2026-08-22 (Asia/Shanghai) for
`codex/story-reader-page-focus-visibility`.

## Provenance

- Every image is a genuine Codex in-app Browser JPEG whose pixel dimensions
  match its filename.
- Baseline source: `codex/shared-focus-visibility` at `0d08e63`, served from
  `http://127.0.0.1:4195` before the candidate was applied.
- Retained source: production implementation `8c300aa`, served from the same
  local origin after Vite hot reload. The only uncommitted files at final
  capture time were documentation and evidence; rendered product code matched
  `8c300aa`.
- The four `rejected-closed-outline-*` files record a transient uncommitted
  design candidate on top of research commit `749ab64`. They are intentionally
  retained as rejection evidence and must not be described as the product.
- The later inset-marker/12 px text-gutter candidate was reviewed and rejected
  after exhaustive geometry comparison. Its temporary JPEGs were superseded
  by the final files and are not retained here; the research and implementation
  memos preserve the finding.
- The app used the repository's opt-in deterministic E2E session/API fixtures.
  No production account, story, microphone, or child data was used.
- The browser viewport was explicitly overridden for every capture. Focused
  images were saved only after the labeled page paragraph was the document's
  active element. The 390×844 page-2 capture followed an automated **Next**
  activation; the separate Playwright regression covers Chromium's case where
  pointer-originated script focus does not match `:focus-visible`.
- These are normal-color Chromium captures. Forced-colors evidence is limited
  to computed-style and lossless rendered-pixel Playwright checks at 280×568
  and 640×360; no simulated or physical Windows High Contrast screenshot is
  claimed.
- JPEGs are qualitative review evidence. Quantitative changed-area and contrast
  checks used fresh lossless in-memory screenshots, not these compressed files.

## Captures

| File | Viewport | Evidence moment |
| --- | ---: | --- |
| [before-page-focus-280x568.jpg](./before-page-focus-280x568.jpg) | 280×568 | Baseline first page with the pale rounded ring |
| [before-page-focus-after-next-390x844.jpg](./before-page-focus-after-next-390x844.jpg) | 390×844 | Baseline page 2 after **Next** |
| [before-page-focus-640x360.jpg](./before-page-focus-640x360.jpg) | 640×360 | Baseline short page; side ring overflow is clipped |
| [before-long-page-focus-640x360.jpg](./before-long-page-focus-640x360.jpg) | 640×360 | Baseline three-line page; only top/bottom ring rails remain |
| [rejected-closed-outline-280x568.jpg](./rejected-closed-outline-280x568.jpg) | 280×568 | Rejected dark closed outline; prose looks field-like |
| [rejected-closed-outline-after-next-390x844.jpg](./rejected-closed-outline-after-next-390x844.jpg) | 390×844 | Rejected closed outline after **Next** |
| [rejected-closed-outline-640x360.jpg](./rejected-closed-outline-640x360.jpg) | 640×360 | Rejected closed outline on a short page |
| [rejected-closed-outline-long-640x360.jpg](./rejected-closed-outline-long-640x360.jpg) | 640×360 | Rejected closed outline around a three-line page |
| [after-reading-marker-280x568.jpg](./after-reading-marker-280x568.jpg) | 280×568 | Retained four-pixel page-arrival marker, separated from the first glyph |
| [after-reading-marker-after-next-390x844.jpg](./after-reading-marker-after-next-390x844.jpg) | 390×844 | Retained marker on page 2 after **Next** |
| [after-reading-marker-640x360.jpg](./after-reading-marker-640x360.jpg) | 640×360 | Complete marker inside the expanded short-wide clip |
| [after-reading-marker-long-640x360.jpg](./after-reading-marker-long-640x360.jpg) | 640×360 | Complete marker on the unchanged three-line stress page |
| [after-threshold-prompt-640x360.jpg](./after-threshold-prompt-640x360.jpg) | 640×360 | One-line threshold page with its full yellow prompt above controls |
| [after-listen-marker-cleared-390x844.jpg](./after-listen-marker-cleared-390x844.jpg) | 390×844 | Marker clears with no orphan gutter when **Pause story** owns focus |

## Visual decision

Retain the separated left marker. Independent review found that the baseline
and dark closed candidate both make static prose look editable or tappable.
The first open-marker revision touched the initial glyph and could be decoded
as a caret or extra character. The final rule occupies the outer half of an
eight-pixel gutter, leaving four pixels of cream before the unchanged text.

At 280×568, the paragraph remains 228×29.695 px at x=26, y=290. At 390×844,
page 2 remains 330×29.695 px at x=30, y=391.328. At 640×360, the short and
long paragraphs remain 280 px wide at x=328 and retain one and three lines.
The inner clip expands from x=328…608 to x=320…616 while its child content
keeps the baseline x position and width. The marker occupies x−8…x−4 relative
to the paragraph, leaving x−4…x as cream separation.

The long-page image still exposes a pre-existing issue: only the yellow
join-in card's top sliver is visible in the 640×360 content pane. Exhaustive
comparison found that the marker causes no line, prompt, scroll, or visibility
change, so that discoverability problem is logged for a separate branch.

## Integrity

SHA-256 digests:

```text
e346129b575f235fcd1a0ec6a79feb8acf5390853cfb7c58fb3ae1c91b08e935  after-listen-marker-cleared-390x844.jpg
2159096466df93031ca8e1712fab47d6bb19c31abf3c80de5c869e8ee9d7901f  after-reading-marker-280x568.jpg
2049d0cb65e21d46a0220b6eb59f43a84f3641abb89e4b8f4c98afcdcd4bb913  after-reading-marker-640x360.jpg
ee3b9e4b8a5c4640ef9a88d705861e86081a37b55fe6156ce78459a3bd8c63aa  after-reading-marker-after-next-390x844.jpg
837827ab161063ad5cdf466d5d6e549c0d0a7a62d17ed2bc23dff21ef9ad3f87  after-reading-marker-long-640x360.jpg
2e261b0a9a7043de9d0185284111a22add68d22f742071c83f6940fd10a1050d  after-threshold-prompt-640x360.jpg
2feeac845beeb56b3eae8a644f1c4f50bac1df5e8ac0b08e67618de3be3fbd15  before-long-page-focus-640x360.jpg
d64b6b28791a43e4a74af2c1564d668e4d38e53b766931f8396929c2cebdb1fc  before-page-focus-280x568.jpg
d2e308765b57e9358abfe6ff37844085318dbc2a62fb549297ae675abadc7535  before-page-focus-640x360.jpg
91a77a33abe8146e9ad9419b546f28d00e3dbe6f14fc8ad0facdd0a57f5c3146  before-page-focus-after-next-390x844.jpg
2c24e899bfa831737475a99b99f0eae33400058883922c28c25cadb0cd3243c5  rejected-closed-outline-280x568.jpg
fd1080b0f42cb3ab4b0095ec08cd1970ace6fff1e3b7c120cc8e88c81e1111b4  rejected-closed-outline-640x360.jpg
87152e7675266fdc6f510c86f8a1f5f67c4c53bbff43810e6b76777a8780fe65  rejected-closed-outline-after-next-390x844.jpg
f560b20dbb28c65501333edda638939c3a8b539631128026ac471f80d0cc95f8  rejected-closed-outline-long-640x360.jpg
```

## Limits

The evidence covers deterministic English left-to-right content at 280×568,
390×844, and 640×360 in one Chromium environment. It does not prove real
forced-color palettes, Safari/Firefox, RTL or longer localized text, text zoom,
physical safe areas, assistive-technology announcement order, switch behavior,
or child/caregiver comprehension. The cue is page-arrival focus feedback, not
narration tracking or a claim that the paragraph is interactive.
