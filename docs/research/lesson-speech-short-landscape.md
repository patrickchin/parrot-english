# Lesson Speech in Short Landscape

Last reviewed: 2026-08-21
Status: implemented on `codex/lesson-speech-short-landscape`
Implementation commit: pending hand-off commit
Audience: young beginner English learners using ready-made lessons sideways

## Question and scope

Can a child see the picture that gives a spoken English line meaning while also
seeing the words, speaker, lesson progress, and controls on a short landscape
screen?

This branch covers the boxed full-scene presentation used by ready-made Parrot
lessons. It validates 560–1280 px wide screens up to 620 px tall, including
640×360 phone landscape. Generated **My Lessons** use layered character art;
their separate geometry and speech-tail semantics remain a stacked follow-up.

## Observed problem

The first visual pass opened a ready-made lesson without scrolling and measured
the complete rendered rectangles. The artwork and dialogue were both centered,
but dialogue had a higher stacking layer and nearly full viewport width.

| Viewport | Artwork | Dialogue | Artwork area covered |
| --- | --- | --- | ---: |
| 640×360 | 331×186 px | 616×99 px | 53.2% |
| 768×360 | 331×186 px | 672×110 px | 58.8% |
| 1280×360 | 331×186 px | 672×110 px | 58.8% |
| 768×600 | 552×311 px | 672×110 px | 23.4% |

At 768×600 the percentage understated the learning loss: the panel crossed the
red ball named by the line. At 1280×360, unused horizontal space existed on both
sides while the center overlay still covered most of the illustration.

The existing browser case called 768×600 “short landscape.” It proved that the
art, HUD, and dialogue were each inside the viewport and vertically ordered,
but never compared their rectangles. A completely obscured picture could pass.

## Evidence and product inference

[LANG-03 and LANG-04](./source-register.md) support pairing short beginner
language with meaningful pictures. The sources do not prescribe this exact
layout; keeping the picture unobscured is Parrot's design inference from that
learning role. [A11Y-02, A11Y-03, and A11Y-05](./source-register.md) support
visible familiar actions, stable progress/feedback, and adequately sized
targets.

This means the picture is not decorative space to sacrifice first. For this
activity, the child needs four concurrent signals:

1. picture context for meaning;
2. the short English line and who says it;
3. the current Listen / Your turn / feedback state; and
4. visible playback or speaking controls.

The design may compact framing and typography at 360 px height, but it should
not remove the literal words, speaker, progress, or actions.

## Decision implemented

At the existing `short-wide` boundary (at least 560 px wide and at most 620 px
tall), boxed lessons now use a stable two-pane composition:

- the scene artwork occupies 54% of the stage on the left;
- an 18 px minimum gutter separates it from the right learning pane;
- the HUD, speech/prompt/feedback, and controls share the right 46%;
- route controls remain in their established top corners;
- artwork grows with available width and height instead of remaining the same
  331 px wide in every 360 px-tall viewport; and
- unusually long dialogue scrolls inside its text region rather than moving or
  covering the controls.

At heights up to 420 px, framing becomes more compact and learning text is
20 px with a 1.2 line height. This is still larger than surrounding state
labels. A saved storybook portrait moves beside the prompt copy and remains
56×56 px, preserving both the child cue and the spoken words without making the
entire prompt taller.

The stage exposes its existing `boxed` / `layered` presentation as a data
attribute. The override is deliberately boxed-only: moving every dialogue panel
would leave layered characters distributed across both panes and make the
speech-tail pointer identify the wrong speaker.

## Alternatives rejected

- **Only reduce overlay opacity:** rejected because the line and focal object
  would still compete in the same place; translucent obstruction is still
  obstruction.
- **Hide the written line:** rejected because visible words, audio, and image
  reinforce one another and some children need repeatable visual support.
- **Shrink the centered panel:** rejected because it would still cross the
  focal center of many authored scenes and would not use available width.
- **Move dialogue to the bottom over the art:** rejected because controls and
  characters already use the lower stage, and scene focal points vary.
- **Apply the same right-pane rule to generated lessons:** deferred rather than
  guessed. Layered characters and their tail require a coordinated placement
  change and their own visual tests.
- **Treat 768×600 containment as sufficient:** rejected because semantic focal
  coverage matters even when every rectangle is technically in the viewport.

## Regression contract

The browser suite now checks real boxed-lesson first-use geometry at 640×360,
768×360, 1280×360, and 768×600. Without scrolling or moving an element first,
it requires:

- artwork at least 300×165 px at the tested sizes;
- art completely left of HUD, dialogue, and controls;
- no pairwise art overlap with those learning layers;
- HUD before dialogue and dialogue separate from controls;
- every element completely inside the viewport; and
- no page-level horizontal or vertical overflow.

Two additional risks have dedicated cases:

- the longest built-in line, **“Great job, Bella! Peppa and Dolly are playing
  together!”**, fits without an inner scrollbar at both 640×360 and 768×360;
  and
- a saved learner portrait stays at least 44×44 px, contained by the prompt,
  and separate from art and speaking controls at 640×360.

Portrait phones, normal desktop, the original 768×600 test, long generated
dialogue, feedback timing, microphone setup, and error recovery remain in the
same lesson-player suite.

## Measured result and visual evidence

At 640×360 after the fix:

| Element | Final geometry |
| --- | --- |
| Artwork | x 12–333.6; y 109.6–290.4; 321.6×180.9 px |
| HUD | x 351.6–628; y 64–122 |
| Listening panel | x 351.6–628; y 128–196 |
| Playback controls | x 351.6–628; y 292–348 |
| Horizontal gap | 18 px between art and learning pane |

Artwork coverage by HUD, dialogue, and controls changed from 53.2% to 0%. At
1280×360 the artwork grew from 331×186 to 482×271 px while remaining fully
separate. The 560×360 breakpoint boundary retained a 278×157 px complete scene
and 56 px playback targets.

- [Before: centered speech covers the artwork](../../artifacts/ux-review/lesson-speech-short-landscape/before-640x360.jpg)
- [After: listening and picture have stable panes](../../artifacts/ux-review/lesson-speech-short-landscape/after-listening-640x360.jpg)
- [After: learner prompt and speaking controls](../../artifacts/ux-review/lesson-speech-short-landscape/after-learner-turn-640x360.jpg)
- [Breakpoint boundary at 560×360](../../artifacts/ux-review/lesson-speech-short-landscape/after-boundary-560x360.jpg)
- [Large phone landscape at 768×360](../../artifacts/ux-review/lesson-speech-short-landscape/after-listening-768x360.jpg)
- [Wide short window at 1280×360](../../artifacts/ux-review/lesson-speech-short-landscape/after-listening-1280x360.jpg)
- [Short tablet at 768×600](../../artifacts/ux-review/lesson-speech-short-landscape/after-listening-768x600.jpg)

Validation completed with:

- all 23 focused lesson-player Chromium cases passed;
- all 610 unit and mounted-lifecycle tests passed;
- all 118 Chromium browser cases passed with four workers in 36.9 seconds;
- TypeScript and the production Vite build passed; and
- lint reported zero errors and the two pre-existing unused-disable warnings in
  generated `worker-configuration.d.ts`.

The clean manual visual-review tab logged no warnings or errors.

## Measurement and rollback guardrails

Retain the two-pane layout while all of these remain true:

- art, current line, progress, and controls are simultaneously visible;
- the focal scene is not covered by a higher learning layer;
- primary controls remain at least 44×44 px;
- ordinary built-in lines do not require scrolling;
- saved portraits do not displace the prompt or controls; and
- normal-height portrait/desktop layouts do not regress.

Revise the split if child observation finds the right pane too visually dense,
if localized labels no longer fit, or if device safe-area insets reduce the
measured gutter. Do not roll back to centered overlap merely to make the picture
larger.

## Open questions

- How should layered generated lessons place two or three characters while
  keeping the current speaker relationship clear?
- Should a short-wide character bubble point left toward the visual pane, or
  should it omit the tail and rely on the visible speaker label?
- Does the 54/46 split remain balanced with future localization and larger text
  preferences?
- Do young learners notice and use an inner text scroll when generated copy is
  much longer than the ready-made content limit?
- Does real browser chrome or a display cutout change the 360 px safe geometry?
