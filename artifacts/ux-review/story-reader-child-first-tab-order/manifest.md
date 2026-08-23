# Story Reader child-first control-order evidence

Captured 2026-08-24 (Asia/Shanghai) for
`codex/story-reader-child-first-tab-order`.

## Provenance

- Every image is a genuine Codex in-app Browser JPEG whose pixel dimensions
  match its filename.
- Baseline source: `codex/story-reader-completion-focus` documentation hand-off
  `c2a0a24`, served locally from `http://127.0.0.1:4220`.
- The app used the repository's opt-in deterministic E2E session/API fixture.
  No production account, photo, story, microphone, or child data was used.
- The Browser viewport was explicitly overridden before every capture. The Red
  Ball page 1 was loaded directly and allowed to finish its local initialization.
- Arrival captures preserve the reader's authored sentence focus.
- Focused-summary captures opened and closed the native disclosure through two
  pointer activations, leaving its summary focused. This recreates the same
  focused, closed visual target and browser-owned scroll adjustment as the
  independently reproduced first Tab, but not its input mechanism. Automated
  Playwright owns the actual keyboard-order evidence.
- Candidate files will be added only after implementation and visual review.

## Baseline captures

| File | Viewport | Evidence moment |
| --- | ---: | --- |
| [before-sentence-to-grown-up-280x568.jpg](./before-sentence-to-grown-up-280x568.jpg) | 280x568 | Page arrival: sentence has the open reading marker; adult disclosure sits between the child prompt and fixed controls |
| [before-focused-grown-up-280x568.jpg](./before-focused-grown-up-280x568.jpg) | 280x568 | Closed adult summary focused; reader moved about 24.5 px and sentence marker disappeared |
| [before-sentence-to-grown-up-640x360.jpg](./before-sentence-to-grown-up-640x360.jpg) | 640x360 | Page arrival: title, sentence, prompt, and fixed controls are visible; adult summary is below the reading-pane clip |
| [before-focused-grown-up-640x360.jpg](./before-focused-grown-up-640x360.jpg) | 640x360 | Closed adult summary focused after about 49.5 px pane movement; title is gone before Listen is reached |

## Baseline geometry

| Viewport | Sentence box | Adult summary box | Reading pane | Child controls | Adult visibility at origin |
| --- | --- | --- | --- | --- | --- |
| 280x568 | y 290...319.695 | y 416.445...460.445 | y 64...536 | y 490...560 | Complete |
| 390x844 | y 391.328...421.023 | y 517.773...561.773 | y 80...828 | y 766...836 | Complete |
| 640x360 | y 130...163 | y 246.5...290.5 | y 80...241 | y 249...312 | 0 of 44 px |
| 1280x800 | y 202...243.25 | y 358.75...402.75 | y 96...800 | y 697...764 | Complete |

At every size, the sentence was active, all observed scroll owners were at
zero, and the adult summary preceded the story-control navigation in tree
order. The 640x360 pane had 50 pixels of available scroll at origin, matching
the displacement needed to expose the closed summary.

## Expected candidate evidence

- `after-child-only-reader-280x568.jpg`
- `after-child-only-reader-640x360.jpg`

Candidate review should confirm that removing the adult disclosure adds calm
space without moving the story title, sentence, prompt, artwork, or controls;
that no unexplained visual hole appears; and that page-one sequential focus
reaches the already-visible **Listen** action without reader movement.

## Integrity

SHA-256 digests:

```text
705e1afb7210b6cf79f3de5c84abbeefb64cc999e839e147d0db7619e49fb07a  before-focused-grown-up-280x568.jpg
ae254cb6ba50abc2e63f276cb15f5f8c634ff08b536746bcc67e9310f3a21ab1  before-focused-grown-up-640x360.jpg
b4316be7af8cedfa0163dd25cfab1fadf12363268a246da47f85dd4a23afda9e  before-sentence-to-grown-up-280x568.jpg
2049d0cb65e21d46a0220b6eb59f43a84f3641abb89e4b8f4c98afcdcd4bb913  before-sentence-to-grown-up-640x360.jpg
```

## Limits

The captures cover deterministic English left-to-right content in one local
Chromium environment. They do not establish target screen-reader speech,
switch scanning, physical keyboard or touch behavior, caregiver discovery,
child comprehension, zoom/text spacing, localization, or other browsers. They
document the visual state and movement that motivated a bounded product
boundary decision.
