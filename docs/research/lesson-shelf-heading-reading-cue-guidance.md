# Lesson shelf heading reading-position cue guidance

Status: selected for test-first implementation

Date: 2026-08-24  
Branch: `codex/lesson-shelf-heading-reading-cue`  
Base branch / dependency: `codex/profile-account-label-clearance` at `86f5f72`

## Question and scope

When Parrot moves focus to **Pick a lesson** after navigation, can the visual
arrival cue point to the words without drawing a page-wide interactive-looking
rectangle or disappearing after pointer input?

This branch owns only the lesson shelf's level-one heading presentation and
its rendered-behavior evidence. It does not change route focus timing, lesson
cards, shelf copy, account or route controls, Story Reader, profile steps,
lesson playback, audio, or application-wide heading styles.

The primary audience remains young beginners, including children who cannot
yet read English. The cue must therefore add location feedback without adding
an instruction, icon, sound, animation, delay, or new Tab stop.

## Deterministic product observation

The existing lifecycle is coherent. `RouteFocusManager` focuses the first
native `main h1` on ordinary route changes, assigns `tabIndex=-1`, and uses
`preventScroll`. The lesson shelf heading retains heading level one and stays
outside ordinary sequential focus.

Its browser-default presentation is not coherent. Fresh Chromium inspection
at base `86f5f72` found:

| Entry path | Focused target | `:focus-visible` | Rendered result |
| --- | --- | --- | --- |
| Direct `/lessons` load | **Pick a lesson** `h1` | true | Closed one-pixel blue outline around the full-width block |
| Keyboard Enter on Home's **Play a lesson** | Same `h1` | true | Same closed full-width outline |
| Pointer click on Home's **Play a lesson** | Same `h1` | false | No outline and no authored arrival cue |

The focused box measurements were:

| Viewport | Heading box | Main scroll / horizontal overflow |
| --- | --- | --- |
| 280x568 | `x=12, y=72, w=256, h=36` | origin / none |
| 390x844 | `x=12, y=84, w=366, h=36` | origin / none |
| 640x360 | `x=16, y=72, w=608, h=60` | origin / none |
| 1440x900 | `x=144, y=112, w=1152, h=72` | origin / none |

Thus the keyboard/direct cue spans nearly the complete content width, rather
than the rendered title. At desktop it makes a static heading resemble a
selected panel or input; at 280 pixels it competes with nearly the whole row.
The pointer result presents the opposite problem: focus moves correctly but
has no visible hand-off. The behavior is also reached by Talk's existing
picture-led recovery route.

The same probe found a paint-timing inconsistency rather than layout movement.
Direct-route focus occurred 2.5–9.4 ms after heading insertion and keyboard-
route focus 8.5–10.7 ms after insertion. Focus arrived 25.5–26.8 ms after the
sampled keyboard activation and 50.9–67.9 ms after the sampled pointer click.
Insert and focused rectangles were identical, and the pointer/keyboard runs
reported zero cumulative layout shift after activation. These are local
deterministic diagnostics, not field latency measurements or child-perceived
timing.

The baseline screenshots are preserved under
`artifacts/ux-review/lesson-shelf-heading-reading-cue/base/`, including an
uncropped capture from the genuine in-app Browser at 1280x720. These are
deterministic browser observations, not child-comprehension or assistive-
technology evidence.

## Evidence and limits

| Evidence | Product inference | Limit |
| --- | --- | --- |
| HTML permits a negative `tabindex` for programmatic focus without ordinary sequential inclusion, and HTML-AAM maps `h1` to a level-one heading. WAI-ARIA APG shows new-heading focus as an optional SPA navigation pattern. See [A11Y-16, A11Y-22, and A11Y-25](./source-register.md). | Preserve the native, non-sequential destination heading and existing focus hand-off. | The APG example is illustrative and requires target browser/assistive-technology testing; no source mandates this target. |
| Selectors Level 4 makes `:focus` deterministic while `:focus-visible` uses user-agent heuristics; WCAG Technique C45 notes pointer interactions generally do not trigger `:focus-visible`. See [A11Y-18 and A11Y-25](./source-register.md). | Key route-arrival paint to actual `:focus` so pointer, keyboard, direct load, and Talk recovery agree. | This is a Parrot interaction decision, not a reason to replace `:focus-visible` for ordinary controls. |
| Focus Appearance gives a useful two-pixel-perimeter and 3:1 changed-pixel reference but explicitly excludes focused non-operable headings. See [A11Y-17](./source-register.md). | Use rendered contrast and continuity as voluntary visual-QA guardrails. | Do not claim the old heading fails or the new heading satisfies WCAG 2.4.13. |
| CSS Color Adjustment maps outlines into the forced user palette and suppresses some decorative paint. See [A11Y-18](./source-register.md). | Hide the decorative blue rail in forced colors and expose a real two-pixel outline. | Chromium emulation cannot prove every Windows palette, browser, or physical display. |
| W3C COGA recommends clear steps, stable visual patterns, and restrained page structure; Google's children's-app guidance recommends simple consistent interaction, essential feedback, and important content near the top. See [A11Y-03, A11Y-18, A11Y-20, and UX-04](./source-register.md). | Reuse Parrot's established open reading marker without adding more words or attention demands. | These sources are supplemental/practitioner guidance, not trials of this marker with multilingual five-year-olds. Google's page also notes that many under-fives cannot read. |

The HTML-AAM citation in A11Y-25 was rechecked against the 2026-08-05 Working
Draft. No new source ID is needed.

## Options considered

| Option | Decision | Reason |
| --- | --- | --- |
| Keep the browser default | Reject | It is modality-dependent and draws a closed page-wide boundary when present. |
| Style only `:focus-visible` | Reject | It preserves the reproduced pointer and Talk-recovery gap. |
| Remove heading focus | Reject in this branch | It discards an existing, tested orientation hand-off rather than repairing presentation. |
| Focus the first lesson card | Defer | It skips destination context and needs target assistive-technology and learner evidence. |
| Add words, icon, pulse, sound, or delayed animation | Reject | Each adds language, sensory, timing, or attention cost without clarifying the existing heading. |
| Apply one global route-heading style | Reject for now | Other routes have different lifecycle and layout contracts; Story shelf also has a documented direct-load focus race. |
| Localized open reading marker | Select | It reuses a learned Parrot grammar, makes every input path consistent, and can be CSS-only. |

## Selected design contract

1. Keep **Pick a lesson** as a native `h1` with `tabIndex=-1`. Do not modify
   `RouteFocusManager` or add an effect.
2. Shrink-wrap the heading's focus box while keeping the title centered and
   preserving its text range, line wrapping, subtitle, first card, header, and
   scroll geometry.
3. On actual `:focus`, render a static four-pixel `brand-blue` vertical rail.
   Its outer edge starts twelve pixels before the heading box, leaving eight
   clear pixels between rail and box. Top-align it and cap it at 96 pixels.
4. In normal colors, remove the UA outline. The rail clears immediately on
   blur and has no transition or animation under either motion preference.
5. In forced colors, hide the decorative rail and restore a real two-pixel,
   two-pixel-offset outline that the user agent can map to system colors.
6. Add no text, icon, sound, timer, request, control, dependency, global token,
   shared polymorphic component, or new sequential focus stop.

The marker means only **the new page starts here**. It is not a button,
selection, progress meter, reading cursor, validation signal, or narration
tracker. Its meaning and calmness remain hypotheses for direct learner review.

## Test-first acceptance contract

Playwright must locate rendered content by accessible role and name; it must
not assert Tailwind class strings or CSS source.

1. Direct arrival at 280x568 and 640x360 focuses the exact level-one heading,
   retains `tabindex=-1`, starts both document and owned main scrollports at
   zero, and creates no horizontal overflow.
2. Direct, pointer, and keyboard entry render the same open marker even when
   Chromium reports different `:focus-visible` states.
3. Screenshot deltas show at least a three-pixel-equivalent qualifying strip
   across the expected marker height at 3:1 or better, with a clear marker-to-
   heading gap, no closed right edge, and no changed strip below the 96-pixel
   cap.
4. Focus and blur preserve title text-range, heading, subtitle, first-card,
   Account, and Back geometry. The shrink-wrapped box must contain the glyphs
   without again spanning the shelf's full content width.
5. Pressing Tab from the programmatically focused heading clears the marker,
   reaches the first lesson card in logical order, and proves the heading did
   not become a sequential stop.
6. Forced-colors emulation hides the decorative rail, reports a non-`none`
   outline of at least two CSS pixels, and renders contrasting pixels on both
   vertical outline edges.
7. Reduced-motion and ordinary-motion modes both report no marker transition
   or animation. No feedback timer or additional network boundary is added.
8. Existing Talk recovery, route lifecycle, responsive header, lesson shelf,
   shared focus, and full browser suites remain green.

## Visual review matrix

Capture uncropped focused and marker-cleared states at 280x568, 390x844,
640x360, and 1440x900, plus the genuine in-app Browser. Review the rail-to-
glyph gap, title centering, Account/Back clearance, first-card visibility,
absence of page-wide selection chrome, scroll origin, and whether the cue reads
as location rather than an operable object. Preserve viewport, browser, branch,
commit, state measurements, and SHA-256 digests in an artifact manifest.

## Timing, rollback, and unresolved evidence

The selected change is focus-dependent CSS paint on an already-focused node.
It introduces no request, timer, transition, animation, or additional frame;
the existing route manager's next-animation-frame hand-off is deliberately
unchanged. This makes screenshot settlement the relevant automated boundary,
not a new latency benchmark.

Revise or reject if the marker changes glyph/card geometry, clips or scrolls at
a target viewport, touches the first glyph, looks like a caret or quote bar,
disappears after pointer input, weakens forced-colors visibility, or changes
the next Tab target.

Residual validation includes VoiceOver, TalkBack, NVDA, switch and voice
control, Safari, Firefox, real Windows High Contrast, zoom/text spacing,
localization/RTL, physical safe areas, and direct child/caregiver comparison.
The cheapest learner study is a three-way marker/default/no-cue task: after
navigation, ask children to point to what changed and what they would do next,
without asking them to name the marker.
