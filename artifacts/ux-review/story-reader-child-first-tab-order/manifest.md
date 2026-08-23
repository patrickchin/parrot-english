# Story Reader child-first control-order evidence

Captured 2026-08-24 (Asia/Shanghai) for
`codex/story-reader-child-first-tab-order`.

## Provenance

- Baseline and child-only arrival images are genuine Codex in-app Browser
  JPEGs. Three focused-action images come from the repository's Playwright
  Chromium: two after an actual `page.keyboard.press("Tab")`, and the cleanup
  confirmation after keyboard **Enter** and the completed request. This
  preserves keyboard transitions that the in-app Browser's screenshot driver
  cannot reproduce. Every pixel dimension matches its filename.
- Baseline source: `codex/story-reader-completion-focus` documentation hand-off
  `c2a0a24`, served locally from `http://127.0.0.1:4220`.
- Candidate source: child-first implementation `9f74815`, served from the same
  local origin after Vite hot reload.
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

## Candidate captures

| File | Viewport | Evidence moment |
| --- | ---: | --- |
| [after-child-only-reader-280x568.jpg](./after-child-only-reader-280x568.jpg) | 280x568 | Page arrival after removal; the child sentence, prompt, and fixed controls keep their baseline positions |
| [after-child-only-reader-390x844.jpg](./after-child-only-reader-390x844.jpg) | 390x844 | Regular-phone arrival; the learning task remains grouped at the top and the child controls remain fixed at the bottom |
| [after-child-only-reader-640x360.jpg](./after-child-only-reader-640x360.jpg) | 640x360 | Short-wide arrival; all learning content and controls fit without a hidden secondary target or pane overflow |
| [after-child-only-reader-1280x800.jpg](./after-child-only-reader-1280x800.jpg) | 1280x800 | Desktop arrival; the large illustration remains dominant and the right column contains only the active child task |
| [after-tab-focused-listen-280x568.jpg](./after-tab-focused-listen-280x568.jpg) | 280x568 | Actual first Tab after sentence arrival; Listen has the rendered keyboard ring and all scroll owners remain at zero |
| [after-tab-focused-listen-640x360.jpg](./after-tab-focused-listen-640x360.jpg) | 640x360 | Actual first Tab after sentence arrival; Listen is focused without moving or clipping the title, sentence, or prompt |
| [after-cleanup-confirmation-280x568.jpg](./after-cleanup-confirmation-280x568.jpg) | 280x568 | Shelf-only, generation-disabled privacy deletion; the visible success status owns a complete keyboard ring after the pending action finishes |

## Candidate geometry and review

| Viewport | Sentence box | Prompt box | Child controls | Reader scroll | Reading-pane scroll | Adult targets |
| --- | --- | --- | --- | ---: | ---: | ---: |
| 280x568 | y 290...319.695 | y 331.695...404.445 | y 490...560 | 0 / 464...464 | 0 / 164...164 | 0 |
| 390x844 | y 391.328...421.023 | y 433.023...505.773 | y 766...836 | 0 / 740...740 | 0 / 164...164 | 0 |
| 640x360 | y 130.828...164.664 | y 172.664...241 | y 249...312 | 0 / 256...256 | 0 / 161...161 | 0 |
| 1280x800 | y 202...243.25 | y 259.25...342.75 | y 697...764 | 0 / 696...696 | 0 / 211...211 | 0 |

Scroll values use `scrollTop / clientHeight...scrollHeight`. The focused page
sentence and every observed scroll owner were at origin. In particular, the
640x360 reading pane changed from `161...211` at baseline to `161...161`, so
there is no longer hidden content for focus to reveal before **Listen**.

Visual review passes all four sizes. The title, sentence, prompt, illustration,
and child controls retain their authored positions. Portrait layouts have more
unused space between the single learning task and the fixed controls; this is
the direct, expected result of removing a 44-pixel adult action rather than an
unexplained alignment break. The calm space does not split related content,
obscure a control, or compete with the page task. The 640x360 and desktop
columns similarly read as intentionally sparse, with the illustration carrying
the visual weight.

The focused captures make the transition visible without activating narration:
the sentence's arrival marker yields to the complete high-contrast ring around
**Listen**, while the inner pane, outer reader, and window remain at zero.
The cleanup capture separately verifies that removing the reader duplicate did
not weaken the shelf's sole privacy path: the status is compact, readable, and
visibly focused rather than disappearing with its completed button.

## Integrity

SHA-256 digests:

```text
b62519a815e3cbda806ec8f39e4ed4c121e23109d80b7cf36057fa557bd8539a  after-cleanup-confirmation-280x568.jpg
342142685b5349808b0356cc992133ea9ff123af5ed00d55e05e213646233b2b  after-tab-focused-listen-640x360.jpg
d54fd7e3dcd46d750d39f5cc984c2a4e7374a316cfe3ff969ed2ee2e864e3e9a  after-tab-focused-listen-280x568.jpg
13811fcf49eaf6cbfffbb1797dc0434a2fa719dc9bbe6cc912e4c9defbb56ae0  after-child-only-reader-1280x800.jpg
8f5648bd3737a225305fa7c418458f4ddd487341426d75de4b7062ccce218923  after-child-only-reader-280x568.jpg
1a148199e75b66e69d12864384cc9b314e17a5935800a84a09238f0515d1bb22  after-child-only-reader-390x844.jpg
1722022f9909f4e3517324343f9e3b989f2aa71b4d7e1e220d01eab26920f00f  after-child-only-reader-640x360.jpg
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
