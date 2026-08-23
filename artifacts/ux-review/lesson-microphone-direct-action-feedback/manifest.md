# Lesson microphone direct-action visual evidence

Captured: 2026-08-24

Route:
`/lessons/parrot/01-peppas-high-ball/scenes/1?parrotE2eMicrophone=delayed`

## Provenance

All eight JPEGs are full-viewport, uncropped, quality-90 captures from the
genuine in-app Chromium Browser after **Start lesson** reached the first learner
turn and the microphone action entered a deliberately held permission request.
The same persistent in-app Browser session/profile and capture procedure,
lesson, artwork, query fixture, activation method, and CSS viewport were used
for each pair.

The **before** server used detached worktree
`parrot-english-lesson-microphone-baseline-capture` at `04f3c1e`. That commit
adds only the deterministic delayed microphone fixture on top of the unchanged
product at `1957e6d`; it contains none of the candidate presentation or handler
changes. The **after** server used
`codex/lesson-microphone-direct-action-feedback` with the rendered candidate
later committed at `be8692d`. Review hardening at `a541fdf` changes only
screen-reader-only waiting text and therefore does not alter these pixels.

The Browser inspection recorded active element, rendered accessibility
attributes, pending text owners, running animation count, button
rectangle, document dimensions, and scroll origin. The raw values and a
separate 20-sample local Chromium timing run are in
[capture-metrics.json](./capture-metrics.json). Independent baseline automation
also covered success, failure, reduced motion, and rapid input across both
boxed and layered lessons; those findings are summarized in the research memo.

## Before and after

| Viewport | Before: duplicated pending feedback | After: one focused pending action |
| --- | --- | --- |
| 280x568 | [before](./before-duplicate-opening-mic-280x568.jpg) | [after](./after-focused-opening-mic-280x568.jpg) |
| 390x844 | [before](./before-duplicate-opening-mic-390x844.jpg) | [after](./after-focused-opening-mic-390x844.jpg) |
| 640x360 | [before](./before-duplicate-opening-mic-640x360.jpg) | [after](./after-focused-opening-mic-640x360.jpg) |
| 1440x900 | [before](./before-duplicate-opening-mic-1440x900.jpg) | [after](./after-focused-opening-mic-1440x900.jpg) |

## Measured result

At all four viewport sizes:

- before, focus moved from the microphone button to `BODY`, the prompt and
  button both said **Opening mic**, two spinners ran, and the button exposed
  fixed accessible name **Microphone**, native `disabled`, `aria-busy=true`,
  and `aria-pressed=false`;
- after, focus remained on the same button, the prompt stayed **Your turn**,
  only the button said **Opening mic…**, one spinner ran, and the button's
  visible text was its accessible name with `aria-disabled=true` and no native
  disabled, busy, or pressed state;
- after review, the pending action remains fully opaque rather than inheriting
  the shared unavailable-state fade; white against the rendered deep-green
  background is 5.789:1, compared with the faded baseline's approximately
  2.7–2.8:1 effective contrast over the variable scene background;
- the button x/y/width/height was numerically identical before and after;
- document width and height exactly matched the viewport, scroll stayed at
  zero, and no product-owned shift or overflow appeared; and
- the rendered four-pixel outline plus four-pixel offset stayed inside every
  viewport; it reached, but did not cover, the neighboring Skip control in the
  compact eight-pixel gap at 280, 390, and 640 pixels, while the desktop's
  ten-pixel gap retained about two pixels of separation.

The after images make the visual hierarchy calmer without weakening the
practice cue: the white prompt retains the microphone icon, **Your turn**, and
the phrase; pending setup status is represented only at the green action. The focus
indicator is visible in all four after captures and absent after the baseline
button disables itself.

The candidate's 20 local acknowledgement samples measured 1.6–3.3 ms from
activation to the complete pending DOM mutation and 4.1–8.8 ms to the next
animation frame. The summaries use nearest-rank order statistics: next-frame
p50 was 5.6 ms and p95 was 7.8 ms. These numbers exclude the human permission
interval and are local diagnostic evidence, not production latency or a
developmental threshold.

Spinner rotation is nondeterministic, so pixel differences in the spinner arc
must not be interpreted as layout movement. The stable button rectangles and
explicit rendered geometry checks own that conclusion.

## Integrity

| File | Pixels | SHA-256 |
| --- | ---: | --- |
| `after-focused-opening-mic-1440x900.jpg` | 1440x900 | `5589c2fc583a447c25dfa093ed3c19dbb17bb6c570be3298f8ab265dd4e49cba` |
| `after-focused-opening-mic-280x568.jpg` | 280x568 | `b98b31d6c31ec66e608b26b7f7d4c1171f7af7a18d1ab1fcd25d7c4a32f6abae` |
| `after-focused-opening-mic-390x844.jpg` | 390x844 | `9ba2a5a02f88fdd722fb5e14b38f7c55f56552f1747c3bade94fedd729024280` |
| `after-focused-opening-mic-640x360.jpg` | 640x360 | `d37a83a811c6819f0416c7d8ddeabf28989813a3d56a09c27c6e63f939cf13bc` |
| `before-duplicate-opening-mic-1440x900.jpg` | 1440x900 | `cdecf19d16bdfed8b7e298ae78fc8f78576000214d6091a05e8351e22a8287d7` |
| `before-duplicate-opening-mic-280x568.jpg` | 280x568 | `eb9aa718cfe514a603d9ed4882f86a16e88ac87a4b79117671d6a807e97ca102` |
| `before-duplicate-opening-mic-390x844.jpg` | 390x844 | `b51831ff788166da349c325d2044f7224b8e242d4e3c633905cf04f12cbb2338` |
| `before-duplicate-opening-mic-640x360.jpg` | 640x360 | `c0e449cd069b8a64482984c1e5c2ea54a9c5fdfd900d1583b03d369bfcc9be81` |

## Evidence boundary

These captures establish local Chromium pixels and rendered DOM state. They do
not establish how a real browser or operating-system permission sheet moves
focus, what VoiceOver, TalkBack, or NVDA announces, how a switch or voice-control
user activates the action, or whether a young learner understands **mic** or
**Opening**. Those remain explicit device, assistive-technology, and learner
research tasks.
