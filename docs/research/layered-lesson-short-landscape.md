# Layered Lessons in Short Landscape

Last reviewed: 2026-08-21
Status: implemented on `codex/layered-lesson-short-landscape`
Implementation commit: pending final validation
Audience: young beginner English learners using generated **My Lessons** sideways

## Question and scope

Can a generated lesson keep its characters, picture context, short English line,
progress, and controls visible together on a genuinely shallow landscape screen?

This is the layered counterpart to
[Lesson speech in short landscape](./lesson-speech-short-landscape.md). It covers
generated lessons with one or two supported characters. It covers the shallow
side-by-side layout, the transition into the existing vertical layout, and the
full 560–1280 px short-landscape range exercised by the product.

## Observed problem

The baseline layered stage spread characters across the full width and centered
the learning UI over them. At 560×360, 640×360, 768×360, and 1280×360, the
characters crossed the HUD, dialogue, or control column. This weakened three
signals at once:

- the picture and character action that give beginner English meaning;
- the explicit `Listen · Dolly` / `Listen · Peppa` state; and
- the child’s next available action.

The first implementation limited the two-pane rule to 420 px tall. Independent
boundary review caught a one-pixel cliff: 844×420 was clean, but at 844×421 the
active character overlapped speech by 9.3 px and controls by 3 px. The same
failure appeared at 932×430, a real modern-phone landscape size. Static geometry
showed that the larger `md` character and control rules could collide through
629 px. The fix therefore addresses both the shallow pane and its transition;
it does not merely move an arbitrary cutoff.

The generic speech-tail pointer also became misleading in a two-pane layout. A
tail pointing toward the left visual pane cannot identify which of two
characters is speaking.

The production catalog currently supports only Peppa and Dolly. Lesson
preparation removes unknown and duplicate entries, so one and two characters
are the complete valid runtime cases today. A speculative three-character test
would assert behavior the product cannot produce.

## Evidence and product inference

[LANG-03 and LANG-04](./source-register.md) support short language paired with
meaningful visual context for beginner learners. [A11Y-02, A11Y-03, and
A11Y-05](./source-register.md) support visible state, familiar actions, and
adequately sized targets. These sources do not prescribe a 54/46 split; the
specific geometry is a Parrot design decision derived from the observed
collision and the available horizontal space.

The first reading burden should remain one literal instruction or line. A long
generated paragraph is not made pedagogically suitable merely because it can
scroll. The long-copy case in this branch is a defensive containment and access
test; the content-language checks remain responsible for warning about normal
lesson lines above the reviewed limits.

## Decision implemented

Layered stages use a side-by-side composition at 560 px and wider through
420 px tall. At the `md` breakpoint, where characters and controls both grow,
that composition continues through 480 px tall:

- the background continues to fill the stage;
- characters are distributed inside the left 54% of the viewport;
- HUD, dialogue or prompt, feedback, and controls occupy the right 46%;
- one character may use up to 26vw, while two-character scenes use 18vw per
  character, capped at 12rem and 52dvh;
- the speech tail is hidden, while the visible and accessible speaker label and
  active-character scale continue to identify the speaker;
- ordinary reviewed copy fits without an inner scrollbar; and
- exceptional long copy scrolls inside the paragraph without moving the
  controls or page.

Overflow paragraphs remain in the accessibility tree and become focusable when
their **rendered height actually exceeds their visible height**. A resize
observer rechecks the measurement as the viewport and fonts settle; short copy
does not become an unnecessary tab stop. Arrow, Page, Home, and End keys are
handled on an overflowing speech, prompt, or feedback paragraph so a sighted
keyboard user can reach the same copy as a touch user. Dark narration and
feedback surfaces use a high-contrast yellow focus outline. This is a recovery
affordance, not permission to publish long child-facing directions.

From 481 px tall at `md` widths, the original full-width vertical composition
remains, but characters begin in a compact 28dvh band 100 px above the bottom.
After 640 px the character height and bottom offset grow continuously, meeting
the ordinary 44dvh / 120 px geometry at about 807 px rather than jumping at a
single breakpoint. Dialogue is bounded above the character band and exceptional
copy scrolls inside it. The dialogue limit and character geometry share the
same CSS values, so the safe boundary follows the characters while they grow;
it is not a separate height estimate that can drift. This preserves the clearer
768×600 prompt while removing character/control collisions throughout the
transition.

## Alternatives rejected

- **Move the dialogue but leave characters full-width:** rejected because the
  rightmost character still collides with the learning pane.
- **Use one side-by-side rule through 640 px:** rejected after visual comparison;
  at 768×600 the full-width vertical prompt is clearer and gives long copy more
  room. A stabilized vertical band solves the collision without discarding that
  composition.
- **Stop the fix at 420 or 430 px:** rejected after boundary review because the
  underlying `md` collision persists above those values.
- **Keep a generic left-pointing speech tail:** rejected because it suggests a
  precise speaker relationship that the geometry does not encode.
- **Hide characters while text is shown:** rejected because their action and
  emotion are part of the beginner’s meaning context.
- **Shrink every line until it fits:** rejected because very small child-facing
  type hides a content-quality problem and reduces legibility.
- **Add a three-character layout now:** deferred until the catalog and runtime
  can actually produce a valid third character.

## Regression contract

The browser suite covers:

- one and two characters at the exact 560×360 boundary;
- two characters at 640×360, 768×360, 1280×360, 844×421, 932×430, and the
  768×480 two-pane boundary;
- a reviewed 13-word character line without inner scrolling at 768×360 and in
  the new 421–480 px range;
- collision-free vertical transitions at 768×481, 768×600, 768×640, 768×641,
  and the default-geometry match at 768×807;
- deliberately long generated learner, character, and feedback lines in the
  640×360 pane and at 768×481, 768×641, 768×720, and 768×807 vertical
  transitions;
- retained full-width vertical behavior for a long line at 768×600; and
- the existing ultra-narrow phone, portrait phone, desktop, feedback, control,
  error, and saved-art cases.

For the shallow two-pane cases, tests require every character, HUD, dialogue,
and control to remain inside the viewport; characters to stay completely left
of and separate from the learning pane; HUD before dialogue; dialogue separate
from controls; all controls at least 44×44 px; and no page overflow. Long
overflow copy must respond to keyboard End and Home, in addition to remaining
touch-scrollable.

## Measured result and visual evidence

At 640×360 the final geometry is:

| Element | Final geometry |
| --- | --- |
| HUD | x 351.6–628; y 64–122 |
| Dialogue | x 351.6–628; y 128; maximum bottom 272 |
| Playback controls | x 351.6–628; y 292–348 |
| Characters | centers at x 115.2 and 230.4; y 160.8–348 |

At 768×360, the 13-word reviewed line uses its full 72 px text area without
scrolling. The dialogue ends at y 274 and controls begin at y 280, leaving a
6 px gap. At 560×360 the smallest speaking controls measure 165.8×48 and
65.8×48 px, both above the 44×44 target. No tested state produces page overflow
or a character/learning-layer collision.

The boundary fix changes 844×421 from 9.3 px speech overlap and 3 px control
overlap to complete separation. At 768×600 the full long prompt remains visible
above both characters and the controls, while the revised character band also
keeps listening playback controls clear.

- [Before: character and speech layers collide at 560×360](../../artifacts/ux-review/layered-lesson-short-landscape/before-listening-560x360.jpg)
- [After: one stable visual pane and one learning pane at 560×360](../../artifacts/ux-review/layered-lesson-short-landscape/after-listening-560x360.jpg)
- [After: two characters at 640×360](../../artifacts/ux-review/layered-lesson-short-landscape/after-listening-640x360.jpg)
- [After: reviewed line at 768×360](../../artifacts/ux-review/layered-lesson-short-landscape/after-listening-768x360.jpg)
- [After: corrected modern-phone boundary at 844×421](../../artifacts/ux-review/layered-lesson-short-landscape/after-listening-844x421.jpg)
- [Before: exceptional long prompt at 560×360](../../artifacts/ux-review/layered-lesson-short-landscape/before-long-prompt-560x360.jpg)
- [After: exceptional long prompt contained at 640×360](../../artifacts/ux-review/layered-lesson-short-landscape/after-long-prompt-640x360.jpg)
- [After: keyboard End reveals the end of the contained prompt](../../artifacts/ux-review/layered-lesson-short-landscape/after-long-prompt-keyboard-end-640x360.jpg)
- [Stabilized vertical strategy for a long prompt at 768×600](../../artifacts/ux-review/layered-lesson-short-landscape/after-long-prompt-768x600.jpg)

Final validation results will be recorded in the hand-off commit after the
complete browser, unit, build, lint, and manual console passes.

## Measurement and rollback guardrails

Retain the layout while:

- ordinary reviewed lines fit without an inner scrollbar;
- every supported character remains recognizable and separate from learning
  controls;
- the speaker is clear without the speech tail;
- primary actions remain at least 44×44 px; and
- the 481 px and taller range keeps its comfortable full-width vertical
  composition; and
- the 480/481 boundary and continuous 640–807 px transition remain
  collision-free.

Revise the split if localization, text-size preferences, safe-area insets, or a
larger character catalog no longer fit. Roll back if direct child observation
shows that separating the speaker from the line makes speaker identification
worse; do not restore accidental overlap as the remedy.

## Open questions

- Do children correctly match `Listen · Dolly` with the active character when
  the tail is absent?
- Is an inner scroll discoverable enough as a last-resort failure state, or
  should lesson publication impose a hard maximum after the advisory lint has
  been observed in use?
- What geometry and speaker cue should ship if the character catalog grows to
  three valid simultaneous characters?
- Do localized state labels or larger text settings require a different split?
- How do real browser chrome, safe-area insets, and low-end device rendering
  affect the 360 px measurements?
