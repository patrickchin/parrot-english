# Picture-Led First Use

Last reviewed: 2026-08-21  
Status: implemented on `codex/nonreading-first-use`  
Implementation commit: pending first reviewable commit  
Audience: young beginner English learners who may not read English independently

## Question and scope

Can the home screen show what **lesson**, **Talk to Peppa**, and **story** mean
with less reading, without surprise sound, extra setup, or decorative clutter?

This branch changes only the learner home. It audits the first destination of
all three paths, then reuses those destinations' real art as the route preview.
It does not add onboarding, automatic narration, translation, a learner mode,
or a claim that a child can use the product independently.

## Observed first-use problem

The destination screens were already more concrete than their home links:

| Path | Home before | First destination | Audit finding |
| --- | --- | --- | --- |
| Lesson | abstract play icon plus seven words | full-card lesson cover showing Peppa, Dolly, and the red ball | Home explained in text what the shelf immediately showed. |
| Talk to Peppa | generic speech-bubble icon plus eight words | large Peppa character and one pink start action | The character identity was absent until after navigation. |
| Story | generic book icon plus seven words | illustrated story covers with a visible Listen action | Home described listening but did not show a story. |

Excluding the product name, choosing a path required 30 visible English words:
the six-word heading, two-word hint, three eyebrow labels, three route labels,
and three helper sentences. The lesson and story icons were also close in
meaning for a learner who cannot read their labels.

The reading burden also became a geometry problem. Before implementation:

| Viewport | Home scroll height | Last card / card-row bottom | First-use result |
| --- | ---: | ---: | --- |
| 280×568 | 603 px | 587.25 px | The story card was clipped. |
| 320×480 | 521 px | 505.25 px | The story card was below the viewport. |
| 390×844 | 844 px | 709 px | All three fit. |
| 560×360 | 514 px | 497.5 px | Only the first card fit completely. |
| 640×360 | 535 px | 519 px | Only the first card fit completely. |
| 1280×360 | 463 px | 446.75 px | The complete three-card row was below the viewport. |

The old page could scroll correctly, so this was not an unreachable-content
bug. It was a first-use comprehension and discoverability cost: a child had to
read or scroll before seeing the complete choice set.

## Evidence and product inference

[LANG-03](./source-register.md) shows picture-supported Pre-A1 listening tasks
with short language, while [LANG-05](./source-register.md) supports short,
graded, demonstrated instructions. These are assessment and practitioner
sources, not a navigation experiment with five-year-olds.

[A11Y-01, A11Y-02, and A11Y-06](./source-register.md) support common literal
words, visible labels, and familiar images or symbols next to the content they
identify. A11Y-06 also warns that dense fields of icons can confuse. Parrot's
inference is therefore narrow: use one real content preview and one familiar
action symbol per route, retain the visible route label, and remove prose that
only restates them.

[A11Y-04](./source-register.md) supports a short path and user-controlled
interruptions. That weighs against an automatic spoken tour. Audio may later be
useful as an explicit replayable action, but it should not begin because the
home route mounted.

## Decision implemented

- Replace **What do you want to do?** and **Tap one.** with the literal
  three-word direction **Tap a picture.**
- Show the actual first ready-made lesson cover, the existing Peppa talking
  pose, and the first story's opening picture.
- Keep the existing full-card links and their visible labels: **Play a
  lesson**, **Talk to Peppa**, and **Story time**.
- Put one play, speech, or headphones symbol on its related picture. The symbol
  communicates activity type; the arrow continues to communicate navigation.
- Remove eyebrow labels and helper sentences rather than adding a tutorial.
- Place all three cards in one row on short-wide screens, while retaining the
  existing stacked phone and larger desktop compositions.
- Keep preview images presentational to assistive technology. Each enclosing
  link already has a concise accessible name, so repeating a long image
  description would make the control noisier rather than clearer.
- Give every image intrinsic dimensions and a fixed preview container to avoid
  image-load layout movement.

The choice layer now contains 11 visible words instead of 30, a reduction of
19 words (63%). This is a count, not proof of comprehension.

No sound plays, no new animation runs, no nested preview button was added, and
no new image was generated. The three existing WebP files total 156,838 bytes:

| Preview | Existing asset bytes |
| --- | ---: |
| First lesson cover | 104,134 |
| Peppa talking at 384 px | 12,634 |
| First story page | 40,070 |

Those requests are a deliberate comprehension cost and may be reused from the
browser cache after navigation. They still need low-end-device and cold-network
measurement; cache reuse must not be assumed in the product claim.

## Alternatives rejected

- **Automatic spoken walkthrough:** rejected because it surprises the learner,
  competes with caregivers or screen readers, and adds timing/state work before
  the child chooses anything.
- **A new animated demonstration:** rejected because movement would add
  attention and performance cost without evidence that it explains the routes
  better than their real first content.
- **Icon-only cards:** rejected because familiar visible labels remain
  important for emerging readers, caregivers, translation tools, and assistive
  technology.
- **More explanatory copy:** rejected because each destination already provides
  the detailed next step after one tap.
- **A language picker on the learner home:** deferred. Home-language support may
  help, but choosing languages is a separate caregiver/configuration question
  and would lengthen this path.
- **New bespoke illustrations:** rejected for this experiment. Existing route
  art is more literal, costs no new content pipeline, and previews what the next
  screen actually contains.

## Regression contract

The accessible Chromium cases retain the three link names and destinations and
now also require:

- three loaded preview images inside the labelled links;
- no separate image roles in the accessibility tree, avoiding repeated control
  announcements;
- no old helper sentences or secondary **Tap one.** direction;
- complete cards at 280×568, 320×480, and 390×844;
- all three cards simultaneously inside 560×360, 640×360, and 1280×360 without
  scrolling;
- card heights of at least 96 px on phones and 128 px in short landscape; and
- no document-level horizontal overflow.

## Measured result and visual evidence

After implementation:

| Viewport | Home scroll height | Last card / card-row bottom | Change |
| --- | ---: | ---: | --- |
| 280×568 | 568 px | 452 px | All three fit; 35 px of scrolling removed. |
| 320×480 | 480 px | 452 px | All three fit; 41 px of scrolling removed. |
| 390×844 | 844 px | 670 px | Existing no-scroll behavior retained. |
| 560×360 | 360 px | 314 px | All three fit in one row; 154 px of scrolling removed. |
| 640×360 | 360 px | 330 px | All three fit in one row; 175 px of scrolling removed. |
| 1280×360 | 360 px | 342 px | The complete row moved inside the viewport; 103 px of scrolling removed. |

- [Before at 280×568](../../artifacts/ux-review/nonreading-first-use/before-home-280x568.jpg)
- [After at 280×568](../../artifacts/ux-review/nonreading-first-use/after-home-280x568.jpg)
- [After at 320×480](../../artifacts/ux-review/nonreading-first-use/after-home-320x480.jpg)
- [After at 390×844](../../artifacts/ux-review/nonreading-first-use/after-home-390x844.jpg)
- [Before at 640×360](../../artifacts/ux-review/nonreading-first-use/before-home-640x360.jpg)
- [After at 560×360](../../artifacts/ux-review/nonreading-first-use/after-home-560x360.jpg)
- [After at 640×360](../../artifacts/ux-review/nonreading-first-use/after-home-640x360.jpg)
- [After at 1280×360](../../artifacts/ux-review/nonreading-first-use/after-home-1280x360.jpg)
- [After at 1280×900](../../artifacts/ux-review/nonreading-first-use/after-home-1280x900.jpg)

Final validation before the implementation commit:

- all 10 focused home-menu Chromium cases passed;
- all 610 unit and mounted-lifecycle tests passed;
- all 122 Chromium browser cases passed with four workers in 36.9 seconds;
- TypeScript and the production Vite build passed;
- lint reported zero errors and the two pre-existing unused-disable warnings in
  generated `worker-configuration.d.ts`; and
- the clean manual browser pass logged no warnings or errors.

## Measurement, safety, and rollback guardrails

Retain this change only while:

- each picture remains visibly and semantically tied to one route label;
- the full set remains available without a surprise sound or timed advance;
- the accessible link names and keyboard behavior remain intact;
- the extra image work does not materially delay first usable choice on target
  devices; and
- direct observation suggests children distinguish the three activities more
  easily than before.

Revise or roll back if pictures are mistaken for controls inside the card, if
lesson and story remain indistinguishable without reading, if larger text or
localization clips a label, or if cold-load measurement finds an unacceptable
delay. Do not optimize for taps or session length; measure unprompted route
choice and recovery from a wrong choice.

## Limits and open questions

- No child or caregiver has tested this branch. Browser geometry and source
  guidance cannot establish comprehension.
- Do children recognize that the lesson picture means listening *and* speaking,
  rather than another story?
- Does one familiar action symbol help, or do learners attend only to the
  character/object in the picture?
- How should a future older-beginner mode remain age-respectful while keeping
  the same low-reading interaction grammar?
- Which home languages merit optional caregiver-configured audio or translated
  labels, and how should language choice avoid becoming a learner setup task?
- What are cold first-paint and first-choice timings on low-memory devices and
  slow networks after adding the three image requests?
