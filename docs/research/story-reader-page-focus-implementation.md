# Story Reader page-arrival focus implementation

Status: implemented and provisionally retained

Branch: `codex/story-reader-page-focus-visibility`

Base: `codex/shared-focus-visibility` at `0d08e63`

Research commit: `749ab64`

Implementation commit: `8c300aa`

Review date: 2026-08-22

## Outcome

When Story Reader routes focus to a newly displayed sentence, the sentence now
gets a clear, word-free page-arrival marker instead of a pale rounded field-like
ring. The normal-color cue is a four-pixel brand-blue vertical rule in the page
margin, separated from the first glyph by four pixels of cream. It is attached
to focus rather than `:focus-visible`, so it remains after a pointer or touch-
like **Next** action as well as on direct route load.

The marker is deliberately not persistent selection or read-along state. It
clears when focus moves to **Listen**, **Back**, **Next**, or another real
control. The paragraph remains `tabIndex={-1}`, so the cue does not add a static
sentence to sequential Tab navigation.

## Problem and hypothesis

The prior `sky-300` ring was 1.603:1 against the cream reader surface, vanished
when forced colors suppressed its shadow, and lost both vertical sides inside
the short-wide overflow clip. Its large closed rounded shape also made static
story prose look editable or tappable.

The retained hypothesis is narrower than a general accessibility claim: a
separated left rule can make the newly arrived reading position easy to find
without extra English, false action affordance, motion, or changed wrapping.
A real system-mapped outline can provide the forced-colors fallback.

## Implementation decisions

- The focused paragraph owns a positioned four-pixel pseudo-element from
  x−8…x−4. The x−4…x space remains cream, which prevents the rule from reading
  as `|Here` or another character to a beginning reader.
- The paragraph itself keeps the baseline x position, width, padding, font,
  line height, and margins. Focus adds no layout geometry.
- At the short-wide breakpoint, the inner scroll viewport uses equal eight-
  pixel negative horizontal margins and padding. Its clip expands from
  x=328…608 to x=320…616 at 640×360 while every child stays at its original
  x position and width.
- Forced colors hide the decorative pseudo-element and use a real two-pixel
  outline with a two-pixel positive offset. Both vertical edges fit within the
  containment gutter and are measured independently.
- The normal cue uses the existing semantic brand-blue token (`#315f89`), which
  is 6.451:1 against the declared cream surface (`#fffaf0`). No token,
  dependency, transition, label, audio, route, or data contract was added.
- `:focus` is intentional. A script-focused `tabIndex=-1` paragraph can fail
  `:focus-visible` after pointer input in Chromium. Because a pointer cannot
  directly focus this static paragraph, the broader selector represents the
  route's page-arrival event rather than a hover/click affordance.

## Candidate revisions

Visual and code review materially changed the result:

1. A dark compact closed outline passed the first rendered-area checks but was
   rejected because it still enclosed prose like an input and competed with
   the yellow join-in card.
2. An inset left rule removed the false affordance, but its permanent 12 px text
   gutter changed line wrapping on 10 of 122 pages at 280×568 and six at
   640×360. Robo Tries page 6 changed from one line to two and left only 37 of
   about 68 px of its prompt visible.
3. Moving the rule outside the unchanged paragraph restored every baseline
   line and prompt, but the first version touched the initial glyph. Final
   visual review requested and retained the four-pixel cream separation.

The rejected closed candidate remains in the artifact set. The transient inset
candidate is documented but not represented as a retained product state.

## Automated evidence

The behavior-based Playwright coverage uses accessible labels and fresh
lossless screenshots. It measures same-position pixel changes and requires:

- at least a three-pixel-equivalent full-height area at 3:1 or better overall
  and inside the exact normal marker strip;
- focused page feedback after direct load and after pointer **Next**;
- unchanged one-line and at-most-three-line responsive cases;
- complete prompt intersection for the threshold Robo page;
- no document horizontal overflow; and
- a computed real outline at least two pixels wide in forced colors, plus
  qualifying rendered pixels on both the left and right vertical edges at
  280×568 and 640×360.

Five of the six new focus/forced-color cases fail against the unchanged base;
the Robo geometry guard correctly passes because it protects the baseline from
candidate regressions. The retained implementation passes all 18 focused-file
tests.

An independent exhaustive direct-load comparison covered all 122 story pages
at 280×568, 390×844, and 640×360. Relative to `0d08e63`, it found:

- zero line-count, text-box, prompt-box, prompt-visibility, or scroll-height
  differences;
- zero document or inner-scroller overflow;
- zero clipped retained markers; and
- zero lost programmatic focus.

Final validation at `8c300aa`:

| Check | Result |
| --- | --- |
| Focus regression | 18/18 passed in 3.9 seconds |
| Unit/integration/lifecycle/safety | 679/679 passed in 90 suites |
| Full Chromium browser suite | 236/236 passed in 47.2 seconds |
| Production build | Passed; Story Reader 10.78 kB raw / 3.50 kB gzip; CSS 87.48 kB raw / 15.26 kB gzip; core 496.98 kB raw / 149.97 kB gzip |
| Lint | 0 errors; 2 pre-existing generated-file warnings |
| Patch integrity | `git diff --check` passed |

## Visual evidence

The [artifact manifest](../../artifacts/ux-review/story-reader-page-focus-visibility/manifest.md)
records 14 genuine in-app Browser JPEGs with provenance and SHA-256 digests:
four matched baseline views, four rejected closed-outline views, four retained
focus views, one threshold prompt, and one clean marker-cleared Listen state.

Independent visual review retained the final treatment. It reads as a location
or margin rule, remains subordinate to the title, prompt, and primary action,
does not create another boxed region, and stays complete at 280×568, 390×844,
and 640×360. The marker-cleared view verifies that ordinary prose returns to
its original alignment without an orphan gutter.

## Interpretation and limits

Retain the implementation provisionally. It repairs the measured normal-color
and forced-color visibility problems, survives pointer page changes, removes
the closed false affordance, and produces no content-geometry change across the
complete current story catalog.

The evidence must not be overstated:

- the paragraph is static content, so the product's 3:1 changed-area threshold
  is not presented as a WCAG 1.4.11 or 2.4.13 conformance determination;
- browser forced-colors emulation does not prove real Windows High Contrast
  palettes, system colors, physical displays, or every browser;
- the exact marker test verifies its current rendered shape but is not an
  exhaustive adjacent-pixel audit;
- Safari, Firefox, RTL, localization, zoom, text spacing, physical safe areas,
  VoiceOver, TalkBack, NVDA, switch input, and real touch devices remain
  untested; and
- no child or caregiver has yet shown whether the marker improves reading
  orientation or is understood without prompting.

## Follow-up

The focus lifecycle remains a separate question. A bounded
`codex/story-reader-page-focus-flow` study should compare moving focus to the
sentence with retaining the activated page control plus a concise live
announcement on target screen readers and switch input.

The long 640×360 capture also exposes a separate pre-existing discoverability
problem: a three-line page can leave only the yellow join-in card's top sliver
visible, with no obvious scroll cue. The marker does not cause that geometry.
Test a short-wide prompt affordance separately without shrinking story text or
silently scrolling the focused sentence away.

The next stacked implementation remains the generated profile-feedback
language contract: replace child-visible free-form acknowledgment prose with
short deterministic beginner-safe phrases while preserving server-side profile
summary and canonical data work.
