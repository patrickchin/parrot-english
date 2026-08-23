# Profile answer separate-labels visual evidence

Captured: 2026-08-24

Branch: `codex/profile-answer-separate-labels`

Stacked base: `codex/profile-replay-account-clearance` at `4e3f9b8`

Candidate inspected: `fbf7ef2`

## Provenance and method

These are genuine full-viewport screenshots from the Codex in-app Browser,
using its Chromium 149.0.7827.55 runtime and the deterministic
`parrotE2eProfile=viewport-stability` production-copy fixture. The base ran
from its separate clean worktree on `127.0.0.1:4213`; the candidate ran from
the current stacked worktree on `127.0.0.1:4212`.

The same route, first question, account name, fixture data, viewport, and focus
state were used for each paired comparison. The 280px and short-landscape
focused captures use the native answer-field focus paint. Idle short-landscape,
regular-phone, and desktop captures retain the programmatically focused
question heading. No image was rescaled after capture.

The Peppa art has an intentional 2.8-second float animation. Its instantaneous
paint phase can differ between separate captures; the element's reserved box
and every field/control box were therefore measured independently. The branch
does not change the image or animation.

## Files and integrity

| File | State | SHA-256 |
| --- | --- | --- |
| [before-280x568-answer-focused.jpg](./before-280x568-answer-focused.jpg) | Base, 280x568, answer focused | `3d3d8d46da1a6f6c054fe5058af6587d4d50f017f56e573ae2cd5fca9ecafbb0` |
| [after-280x568-answer-focused.jpg](./after-280x568-answer-focused.jpg) | Candidate, 280x568, answer focused | `a7a7ae88bb55db6eaa8cac8a3df271fc51af752dbd31f0a7e16e468faca84f75` |
| [before-640x360-idle.jpg](./before-640x360-idle.jpg) | Base, 640x360, heading focused | `7eb7dad4a4f5dc71af54ce1800fa288fa98d00ddc9091ff1678204191e2a1789` |
| [after-640x360-idle.jpg](./after-640x360-idle.jpg) | Candidate, 640x360, heading focused | `a2a580c66f86fbbc9de984399258f5d4233e1d55f8a130b039f3eae0177c46a1` |
| [before-640x360-answer-focused.jpg](./before-640x360-answer-focused.jpg) | Base, 640x360, answer focused and main scrolled 13px | `01a51130e8c102f6e5c92e8ff01b34358e967e59a8f0ea9ab39d922bd5e98442` |
| [after-640x360-answer-focused.jpg](./after-640x360-answer-focused.jpg) | Candidate, 640x360, answer focused and main scrolled 13px | `81d7ca0c88024bcc1c5badeddf91646f2feb68f9730b5dc79c174da6dace9afd` |
| [after-390x844-idle.jpg](./after-390x844-idle.jpg) | Candidate regular-phone guard | `6c9f36d73f952a1203cfc14904111cd4b3b414801a4ea06a8901c4bc4f346d6d` |
| [after-1440x900-idle.jpg](./after-1440x900-idle.jpg) | Candidate desktop guard | `fb0edecb07bdacd4f924675b285d249ce6b8569d431e78e8fe5aba78c46dcee8` |

`file` identified all eight artifacts as baseline JPEG/JFIF with the dimensions
encoded in their filenames.

## Paired visual result

The selected production change does not introduce a visible redesign. At both
paired sizes:

- **Your answer** remains in the same position, weight, color, and size;
- the textarea, microphone, eight-pixel control gap, and four-pixel short
  label-to-row gap remain unchanged;
- the answer and microphone focus treatments remain complete;
- the heading, Chinese prompt, art, Replay, Account, Skip, and Next composition
  remains unchanged; and
- horizontal overflow remains zero.

The decoded 640px before/after image comparisons have mean absolute channel
deltas of `0.0621` in idle state and `0.0857` with the answer focused. Those
small raster differences are JPEG/animated-paint timing, not component movement.
The 280px separate-time comparison has a larger `0.7264` mean channel delta
because its floating art was captured at a different animation phase; measured
control geometry is still identical.

## Geometry evidence

| Viewport/state | Base answer row | Candidate answer row | Base/candidate textarea | Base/candidate microphone | Result |
| --- | --- | --- | --- | --- | --- |
| 280x568, answer focused | x=30, y=391.25, 220x80 | x=30, y=391.25, 220x80 | x=30, 160x80 | x=198, 52x80 | 0px delta |
| 640x360, idle at origin | x=158, y=211, 420x80 | x=158, y=211, 420x80 | x=158, 360x80 | x=526, 52x80 | 0px delta |
| 640x360, answer focused | x=158, y=198, 420x80 | x=158, y=198, 420x80 | x=158, 360x80 | x=526, 52x80 | 0px delta after the same native 13px scroll |

The base's 108px outer label box becomes a 108px neutral wrapper. Its visible
24px text child becomes the dedicated native label in the same box. The 280px
wrapper remains x=30, y=363.25, 220x108; the 640px origin wrapper remains
x=158, y=183, 420x108. A separate DOM-only probe found zero-pixel box deltas at
280x568, 360x640, 390x844, 640x360, and 1440x900.

Candidate guard measurements also match the recorded base values:

| Viewport | Label | Row | Textarea | Microphone |
| --- | --- | --- | --- | --- |
| 390x844 | x=42, y=457.5, 306x24 | x=42, y=489.5, 306x130 | 246x130 | x=296, 52x130 |
| 1440x900 | x=428, y=437, 584x24 | x=428, y=469, 584x130 | 524x130 | x=960, 52x130 |

## Programmatic exposure paired with the screenshots

The base accessibility snapshot exposes:

```text
textbox "Your answer Speak your answer" [active]
button "Speak your answer"
```

The candidate exposes:

```text
textbox "Your answer" [active]
button "Speak your answer"
```

In ordinary Playwright DOM inspection, the candidate textarea has one explicit
label, that label's control is the textarea, the label has zero labelable
descendants, and the microphone has zero associated HTML labels. The candidate
keeps the visible-label click, textarea → microphone Tab order, native button
activation, and fieldset-disabled behavior.

## Evidence limits

Screenshots do not establish accessible names, exact screen-reader speech,
keyboard behavior, microphone permission behavior, physical capture, or child
comprehension. The paired browser snapshots and rendered tests establish
Chromium exposure only. Testing remains local, deterministic, English LTR, and
without Safari, Firefox, target assistive technologies, physical devices,
safe-area insets, zoom/text-spacing overrides, localization/RTL, or direct
young-learner observation.
