# Child-First UX Integration Audit

Last reviewed: 2026-08-21
Status: implemented on `codex/child-first-ux-integration`
Implementation commit: `4ef7886`
Audience: young beginner English learners, including children who cannot yet
read much English, and the grown-ups who help them

## Question and scope

Can the independently researched improvements work as one product without
silently undoing each other at their shared UI and test boundaries?

This branch begins at `dc65b5c`, the hand-off for the stacked visual lesson
work. It integrates the following independently reviewable branches and keeps
their original commits and memos intact:

| Improvement | Source implementation / hand-off |
| --- | --- |
| Age-adaptive guidance without age-as-ability inference | `0850f26`, `c1a0cf7` |
| Child-perceived performance baseline | `a02a78a` |
| Bounded conversation safety evaluation | `5e7b705` |
| Advisory child-language lesson checks | `6f0392d`, `b51ab2c` |
| Literal voice-state feedback | `af311a7` |
| Name-safe ready-made lesson feedback and audio | `e4f6176`, `1c6e34d` |
| Responsive shelf artwork | `1cc6b27`, `0e71375` |
| Child-friendly Talk error recovery | `1613ba1`, `f28b9d0` |
| Picture-led first use | `a256a4a`, `9b8ef19` |
| Unscored voice fallback practice | `2a7fd71`, `3d0a664` |

The base already contains the child-first foundation, research program,
caregiver AI/data explanation, first-tap lesson stability, story controls, and
boxed and layered lesson responsive work. This memo records integration
decisions rather than rewriting the evidence in those source memos.

## Conflict decisions

### Literal voice states and child-friendly errors

Both changes are retained. Stable states such as **Getting ready**, **Your
turn**, **Thinking**, and **Trying again** describe what is happening. Failure
copy separately names the next visible action, for example **The chat stopped.
Tap Try again.** Technical request, provider, configuration, and transport text
remain internal.

### Layered lessons and no-microphone practice

The first automatic merge was functionally correct but visually wrong in two
combined states:

- at 640×360, the new help card overlapped the long generated phrase by 59 px;
- at 768×600, the centered help card crossed both character bodies by about
  52 px.

The final layout gives the help message a place in the composition:

- in a shallow two-pane lesson, help uses the open top of the left visual pane,
  above the characters, while prompt and actions stay in the right learning
  pane;
- in portrait and taller vertical layouts, one or two characters move to the
  outside positions and the compact help card occupies the center;
- **Done** still dispatches the existing unscored skip transition; it creates no
  transcript, attempt, assessment result, or success feedback;
- **Try mic** retries recording from the same learner turn.

Browser contracts cover generated long-copy fallback at 390×844, 640×360, and
768×600, including viewport containment and prompt/help/character/control
non-overlap.

### Picture-led home and responsive shelf images

The new home preview initially bypassed the responsive assets integrated from
the shelf branch. A 390 px phone displayed the image at 80×80 px but downloaded
the 104,134-byte 1024 px original. The home card now uses the same native
384/768/1024 `srcset`; Chromium selects the 17,202-byte 384 px candidate at the
reviewed phone size. That removes 86,932 bytes (about 83.5%) from this preview
request without changing the crop, accessible name, or navigation.

## Visual evidence

- [Integrated picture-led home at 640×360](../../artifacts/ux-review/child-first-ux-integration/home-640x360.jpg)
- [Integrated responsive lesson shelf at 640×360](../../artifacts/ux-review/child-first-ux-integration/lesson-shelf-640x360.jpg)
- [Generated fallback after the shallow-pane fix at 640×360](../../artifacts/ux-review/child-first-ux-integration/generated-fallback-640x360.jpg)
- [Before: help crosses both characters at 768×600](../../artifacts/ux-review/child-first-ux-integration/generated-fallback-before-768x600.jpg)
- [After: help and both characters have distinct space at 768×600](../../artifacts/ux-review/child-first-ux-integration/generated-fallback-after-768x600.jpg)

The manual in-app browser review confirmed that all three home choices fit at
640×360, the lesson shelf remains picture-led, and the browser console contains
no warning or error. The E2E mock does not implement the My Lessons listing
endpoint; that manual path exposed raw data-shape text in the grown-up tools
error. This is recorded as a separate recovery-copy follow-up rather than
silently treated as an integration failure.

## Validation results

- All 622 unit, lifecycle, safety-evaluation, language, and asset tests passed.
- All 159 Chromium tests passed in 43.8 seconds with four workers.
- The production type-check and build passed across 1,884 modules.
- Lint passed with zero errors and the two existing generated-file warnings.
- The production responsive-art benchmark passed. The lesson shelf loaded its
  17,202-byte 384 px candidates in 95, 83, and 87 ms (87 ms median); the story
  shelf loaded 11,490-byte candidates in 585, 585, and 620 ms (585 ms median).
- Independent re-review found no actionable regression. It also manually
  exercised the one-character fallback at eight portrait, landscape,
  transition, and desktop sizes; prompt, help, character, and controls stayed
  contained and pairwise non-overlapping.

## Retain, revise, or reject

Retain the integrated direction if the final suite remains green and direct
child/caregiver observation supports the picture meanings and fallback action.
Revise rather than hide content if localization, larger text, safe areas, or a
larger valid character set breaks the measured compositions.

## Open questions

- Can a non-reading beginner identify **Done** from its placement and arrow
  without adult translation?
- Do children still connect the centered help message with the spoken practice
  while the characters sit at the outside edges?
- Does the 384 px home preview remain sharp enough on the target high-density
  low-end devices?
- Should malformed My Lessons responses use one calm grown-up recovery message
  while retaining diagnostics only for logs?
- Which remaining improvement should follow integration: privacy-safe timing
  events, skill-first learner modes, or calm finish controls?
