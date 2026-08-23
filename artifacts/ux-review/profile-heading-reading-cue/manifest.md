# Profile heading reading-cue visual evidence

Captured: 2026-08-24

Routes:

- `/profile/setup?parrotE2eProfile=viewport-stability`
- `/profile/setup?parrotE2eProfile=long-acknowledgment`

## Provenance

All thirteen images are full-viewport, uncropped JPEG captures from the genuine
in-app Chromium Browser. The Browser viewport was read back before every final
capture so the CSS viewport and filename agree. The files were also checked
with `file` and `sips`; an initial `.png` suffix was corrected before the
artifacts entered Git because the Browser had emitted JPEG/JFIF bytes.

The **before** server ran the predecessor worktree at `9739789` on local port
4249. The **after** server ran `codex/profile-heading-reading-cue` on local port
4248 with implementation `0cd03f6` and retained review hardening `3d28aec`.
All ten after images were recaptured after the spacing revision. Both servers
used the repository's deterministic profile E2E states. The routes, fixtures,
learner copy, artwork, Browser session/profile, and capture procedure stayed
constant within each comparison.

The in-app Browser's synthetic click path classified the captured headings as
`:focus-visible`, so the three before images show Chromium's tight one-pixel
closed outline. Separate deterministic Playwright pointer contracts reproduced
the other baseline outcome—focused heading, `:focus-visible=false`, and no
outline—and prove that the retained `:focus`-keyed marker appears in that path.
The screenshots therefore establish visual form and responsive composition;
the fresh rendered-delta tests own modality parity.

## Before and after

| State | Browser default before | Retained open cue after |
| --- | --- | --- |
| Setup, 280x568 | [before](./before-setup-280x568.jpg) | [after](./after-setup-280x568.jpg) |
| Question, 390x844 | [before](./before-question-390x844.jpg) | [after pointer transition](./after-pointer-question-390x844.jpg) |
| 160-character acknowledgment, 280x568 | [before](./before-long-acknowledgment-280x568.jpg) | [after](./after-long-acknowledgment-280x568.jpg) |

The baseline cue forms a closed rectangle around static words and is directly
above a genuinely outlined answer field on the question. The retained cue is
an open four-pixel blue rail alongside the focused heading. Moving focus into
the answer field clears it, as shown in
[the marker-cleared question](./after-question-answer-focus-390x844.jpg).

## Responsive candidate matrix

| State | 280x568 | 390x844 | 640x360 | 1440x900 |
| --- | --- | --- | --- | --- |
| Setup | [focused](./after-setup-280x568.jpg) | — | — | [focused](./after-setup-1440x900.jpg) |
| Question | [focused](./after-question-280x568.jpg) | [pointer transition](./after-pointer-question-390x844.jpg), [answer focused](./after-question-answer-focus-390x844.jpg) | [focused](./after-question-640x360.jpg) | — |
| Acknowledgment | [focused](./after-acknowledgment-280x568.jpg) | — | [focused](./after-acknowledgment-640x360.jpg) | — |
| 160-character acknowledgment | [focused](./after-long-acknowledgment-280x568.jpg) | — | [focused](./after-long-acknowledgment-640x360.jpg) | — |

## Measured result

All after states kept the document and owned `main` free of horizontal
overflow and left the main scroll origin at zero.

| State | Card / heading geometry | Marker geometry | Review result |
| --- | --- | --- | --- |
| Setup, 280x568 | card x=14; inner edge x=18; heading 212x90 at x=34 | x=22…26, 4x90 | Four pixels from card inner edge; eight pixels before heading box |
| Question, 280x568 | card inner edge x=18; heading 220x75 at x=30 | x=22…26, 4x75 | Four pixels clear of card border and four pixels clear of heading box |
| Question, 390x844 | heading 306x37.5 at x=42 | x=30…34, 4x37.5 | Eight-pixel heading gap above the real textarea; clears on answer focus |
| Question, 640x360 | card x=14…626; heading 452x37.5 at x=158 | x=146…150, 4x37.5 | Eight-pixel text gap in the short-landscape column |
| Acknowledgment, 280x568 | heading 127.375x30 at x=76.3125 | x=64.3125…68.3125, 4x30 | Eight-pixel text gap removes the interim caret effect |
| Acknowledgment, 640x360 | heading 127.375x30 at x=265.5 | x=253.5…257.5, 4x30 | Eight-pixel text gap; balanced with picture and Next action |
| Long acknowledgment, 280x568 | card height=488; heading 212x300 at x=34 | x=22…26, 4x96, top-aligned | Cap reduces the 300-pixel quotation-bar effect |
| Long acknowledgment, 640x360 | card 612x280; heading 332.5x180 at x=265.5 | x=253.5…257.5, 4x96, top-aligned | Eight-pixel gap and cap avoid dominating the copy |
| Setup, 1440x900 | card x=384…1056; heading 568x96 at x=436 | x=424…428, 4x96 | Proportional at desktop scale |

The first uniform twelve-pixel offset touched the question card's inner border
at 280 pixels. A uniform eight-pixel revision fixed containment but placed the
rail only four pixels from shrink-wrapped/left-aligned glyphs, visually joining
`Thank you!` and `What's your name?` like a caret or stray letter. The retained
rule uses the twelve-pixel offset by default and keeps the eight-pixel offset
only on the compact portrait question. The earlier full-height long-copy rail
was 300 pixels tall and occupied 61.5% of the 488-pixel card; the retained
96-pixel cap occupies 19.7% and reduces that full-height quotation-rail effect.

The images cannot prove that blur leaves no residual perimeter at every pixel
or that forced colors maps to a particular system color. The automated checks
compare fresh focused and blurred screenshots, require the exact responsive
marker strip with qualifying width across every row except a one-pixel raster
tolerance, require an empty marker-to-heading gap and right perimeter, require
zero marker pixels below the 96-pixel cap, compare heading text/card/art/field/
action rectangles, require no transition or animation, and require a real
outline on both vertical edges in forced-colors emulation.

## Integrity

| File | Pixels | SHA-256 |
| --- | ---: | --- |
| `after-acknowledgment-280x568.jpg` | 280x568 | `f1b08f76470f7021490a3118eb1a118ce6028c5f168856866749d1cb235a6c37` |
| `after-acknowledgment-640x360.jpg` | 640x360 | `d38412afff268d26160e44b79c744b934e156e9d5e2984d19b088b7d60e0468f` |
| `after-long-acknowledgment-280x568.jpg` | 280x568 | `b13141dabe455aa26bf179f15778e9411d1554cfe01b66a34449306946b07073` |
| `after-long-acknowledgment-640x360.jpg` | 640x360 | `e0509e6b4e9a2c3ccb7e142c0b88151a48156e09431cc1dadcd087f721dc1c59` |
| `after-pointer-question-390x844.jpg` | 390x844 | `90b6274e074b0af7394e279de1cdd8e8569344b1dfa7c75173108cf734f1c7af` |
| `after-question-280x568.jpg` | 280x568 | `3a49db2e82aba239bb4129fb91a20fccfcc2ac170b0ec19b31ade4f157c499ac` |
| `after-question-640x360.jpg` | 640x360 | `dbcff22cd727a2c8c922c4ab3cc21259d8f83789bd29c1c3acf8078b63a53de3` |
| `after-question-answer-focus-390x844.jpg` | 390x844 | `b34e411ddca9cca85c7eb455fab34d03bda609c70fc110635cefcc3db827baed` |
| `after-setup-1440x900.jpg` | 1440x900 | `6811d19353d99a789fb2c3f61c792cfcd6a45b9a5acfd714ecc040af95cad4a1` |
| `after-setup-280x568.jpg` | 280x568 | `f3eb92c85e60705a8a34b78ebad1bd6efea85fee60241d73ac7ebebe24edc75c` |
| `before-long-acknowledgment-280x568.jpg` | 280x568 | `e71da219b8bc28efee8cad149f5369dfbf4cf9d53b221a98f5c81eec96b2dd5a` |
| `before-question-390x844.jpg` | 390x844 | `8f8f9e7bf9f4101325965cd35900c76541190412f8458e3272ac2d1d979b940a` |
| `before-setup-280x568.jpg` | 280x568 | `bdc2040bb54b3047715e30c1daf9f08f1a205e9c6e99a51d9f64b962ec019cbb` |

## Evidence boundary

These captures establish local Chromium pixels and composition in English
left-to-right. They do not establish child comprehension, a particular screen-
reader announcement, real Windows High Contrast colors, target device/browser
behavior, safe-area insets, zoom or text-spacing resilience, localization, or
right-to-left placement. Those remain explicit formative and platform tests.
