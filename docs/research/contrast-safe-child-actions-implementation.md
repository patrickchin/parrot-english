# Enabled Pink Action Content Contrast

Last reviewed: 2026-08-21

Branch: `codex/contrast-safe-child-actions`

Base: `codex/profile-fallback-viewport-stability` at `e2cf42a`

Research commit: `13a2bd4`

Implementation commit: `c5fa0f6`

Status: implemented and retained provisionally for enabled pink action
content; automated, production-build, and local in-app visual validation are
complete; disabled presentation, all-surface focus contrast, target devices,
assistive technology, and child/caregiver observation remain open

## Outcome

Normal-size text and required icons on Parrot's bright pink actions now use a
semantic deep-navy foreground, `#061f3b`, instead of white. The enabled pair
stays above 4.5:1 at rest, hover, active, and focus while retaining the existing
bright `#ff467b` fill, white frame, and chunky `#b92259` shadow.

The mapping reaches the shared `brand` button/link/icon primitive and the two
direct shelf cues, lesson **Play** and story **Listen**. Decorative pink,
progress fills, the authentication mark, labels, layout, action timing,
navigation, API behavior, persistence, audio, and dependencies are unchanged.

This result is deliberately narrower than “all controls are contrast-safe.”
The existing inactive opacity and the focus ring on dark surfaces remain known
follow-ups.

## Why this branch existed

The base shared action rendered white on `#ff467b`. Independent WCAG sRGB math
and the rendered browser regression agreed on **3.274:1** at rest. Most shared
labels are 14–16 CSS px, so the 3:1 large-text exception does not apply.

The same failure appeared in:

- **Set up profile** and **Next** in the form profile;
- **Create custom lesson** and other shared brand links;
- story **Listen**, which sits inside a filtered interactive card; and
- desktop lesson **Play**, which sits inside the same kind of filtered card.

Icon-only brand actions happened to clear the 3:1 graphical threshold, but a
shared treatment should not make a learner infer that the same pink surface is
readable only when it contains a picture.

The source and evidence boundary is recorded in
[Contrast-safe child actions](./contrast-safe-child-actions.md). WCAG supplies
the contrast floor; it does not prove that a five-year-old English beginner
understands **Listen**, **Next**, a microphone icon, or the color pink.

## Revised visual decision

The research hand-off initially proposed a darker semantic pink fill with
white text. Before implementation, independent inventory and visual reviews
compared three treatments against the current shadows, rose variant, and
whole-element state filters.

| Treatment | Rest | Hover | Active | Visual consequence |
| --- | ---: | ---: | ---: | --- |
| Current `#ff467b` / white | 3.274 | 3.213 | 3.224 | Fails normal text |
| Candidate `#c52765` / white | 5.451 | 5.032 | 5.295 | Passes, but nearly merges with the existing pink shadow and approaches rose |
| Existing rose `#d62f70` / white | 4.667 | 4.289 | 4.555 | Hover fails and brand/rose become indistinguishable |
| Selected `#ff467b` / `#061f3b` | 5.063 | 5.066 | 4.685 | Passes while retaining bright pink and shadow depth |

The selected pair keeps a 1.867:1 fill-to-shadow difference. By comparison,
`#c52765` is only 1.121:1 from the existing shadow and looked flatter/muddier
without a second palette change. The dark foreground also keeps brand actions
visually distinct from the existing rose treatment instead of making every
child-facing action feel darker and more serious.

The current `brand-ink` token was not reused: `#173c67` reaches only 3.414:1 on
bright pink. A dedicated action-foreground token makes the narrower purpose
explicit.

## Implementation

- `styles.css` defines `brand-action-ink: #061f3b` without changing
  `brand-pink`.
- The shared `brand` variant maps button, link, and icon content to the new
  foreground.
- The direct lesson **Play** and story **Listen** cues use the same semantic
  foreground.
- Existing whole-control `brightness(1.05)` hover and `brightness(0.95)` active
  effects remain because the selected foreground/background pair was verified
  after both effects, including ancestor filtering on interactive shelf cards.

No action dimensions, accessible names, visible words, icons, DOM order,
motion timing, or input handling changed.

## Rendered regression contract

The new Playwright file uses real routes and accessible locators. It does not
assert Tailwind classes or CSS source.

At 280×568 and 1440×900 it covers a shared text link, shared text button,
required brand icon, story **Listen**, and the opaque account-delete dialog.
Desktop also covers the visible lesson **Play** word. For every enabled visual
it reads the browser's computed foreground/background and walks the ancestor
chain to include opacity and every supported `brightness()` filter in render
order. Unknown or mixed filters and unresolvable transparent image backgrounds
fail explicitly instead of producing a guessed pass.

Enabled text must remain at least 4.5:1 in normal, hover, active, and focus
states. The required icon must remain at least 3:1. The opaque-dialog check also
requires native disabled semantics, a visually distinct enabled state, and a
keyboard-reached focus outline at least 2 CSS px wide and 3:1 against that
dialog's adjacent light surface.

On a detached copy of the base commit, seven cases failed as expected and four
passed. The failing link, button, **Listen**, and **Play** surfaces reported the
same 3.274:1 rest value and about 3.21–3.22:1 filtered values. The retained
implementation passes all 11 cases.

## Verification

| Check | Result |
| --- | --- |
| Focused rendered Chromium | 11/11 passed |
| Full unit/integration/lifecycle/safety | 679/679 passed |
| Full Chromium | 218/218 passed in 47.4 s |
| TypeScript + production build | passed |
| Production core bundle | 496.95 kB raw / 149.95 kB gzip |
| Lint | 0 errors; 2 generated-file warnings |
| Diff and local Markdown links | passed after documentation |

## Visual evidence

The [artifact manifest](../../artifacts/ux-review/contrast-safe-child-actions/manifest.md)
records thirteen genuine in-app Browser JPEGs and their exact source,
viewport, state, and limits.

Five matched before/after pairs cover:

- **Set up profile** at 280×568;
- the microphone and **Next** at 640×360;
- story **Listen** at 390×844;
- lesson **Play** at 1440×900; and
- the shared brand treatment in the 390×844 account menu.

The only intended pixel change is foreground color. The same viewports retain
the same composition, labels, target boxes, and bright-pink hierarchy. Three
additional focus-visible images show a clear ring on the profile action and
story card and preserve the known low-contrast ring against the navy account
menu as follow-up evidence.

## Explicit boundaries found during review

### Disabled presentation is not fixed

The shared disabled treatment still applies 60% opacity to the whole control.
The selected foreground/fill composite is about **2.105:1 over white**. A truly
inactive control is exempt from WCAG 1.4.3 and 1.4.11, so the regression checks
correct semantics and a distinct appearance rather than claiming 4.5:1.

Parrot's stronger research target—readable disabled words without relying on
whole-control opacity—remains valid but requires a deliberate cross-variant
disabled design. Nested disabled fieldsets can reduce effective opacity again,
so changing one brand token would not solve that system.

### Shared focus is not fixed

The existing `#173c67` focus outline is strong on white and common light-blue
surfaces. It is only **1.278:1** against the `#204c7f` account menu, where the
focus-visible screenshot shows it nearly disappear. That failure predates this
branch and is independent of label contrast.

The opaque-dialog automated focus result and the light child-surface images
must not be generalized to dark menus, artwork, or every gradient. A two-color
focus treatment is the leading candidate for the next stacked branch.

## Retain, revise, or reject

**Retain provisionally for enabled pink action content.** The change fixes a
measured normal-text failure, survives current state filters, preserves the
playful pink hierarchy, and introduces no observed layout or interaction
regression.

Revise if target browsers render the filter pipeline differently, if physical
device testing exposes insufficient legibility, or if direct learner
observation shows that dark action content weakens recognition. Do not respond
by hiding labels, treating 14–16 px text as large text, or globally darkening
decorative pink without a separate purpose.

## Limits and next evidence

- No child, caregiver, teacher, low-vision participant, color-vision-deficient
  participant, or assistive-technology user took part.
- Automated sRGB math does not measure glare, display calibration, font
  rasterization, forced colors, zoom, increased text spacing, or every image
  adjacency.
- The account menu uses primary brand styling for **Delete account** and
  **Sign out**. Literal wording and confirmation remain; a future destructive
  semantic must not rely on red/pink alone.
- Passing contrast does not prove beginner-English comprehension.

The next stacked branch is `codex/shared-focus-visibility`: make the shared
indicator visible across light, navy, and image-adjacent surfaces without
changing focus order or child-task behavior. The generated-acknowledgment
common-word/short-copy contract follows that bounded visual repair.

## Hand-off

```text
Branch: codex/contrast-safe-child-actions
Base branch / dependency: codex/profile-fallback-viewport-stability e2cf42a
Research commit: 13a2bd4
Implementation commit: c5fa0f6
Hypothesis: a deep semantic foreground can make enabled bright-pink action content readable without removing Parrot's playful primary cue
Changed: one action-foreground token; shared brand content; direct Play/Listen content; rendered state/ancestor-filter regression tests; before/after/focus evidence
Not changed: decorative/progress pink, labels, icons, target sizes, layout, navigation, timing, audio, APIs, persistence, disabled opacity, focus-ring token, dependencies, or translations
Tests: 11/11 focused Chromium; 679/679 full unit/integration/lifecycle/safety; 218/218 full Chromium; TypeScript/build passed; lint 0 errors with 2 generated warnings
Screenshots: thirteen in-app Browser JPEGs and manifest in artifacts/ux-review/contrast-safe-child-actions
Measured result: enabled pair 5.063 rest, 5.066 hover, 4.685 active; prior pair 3.274 rest and about 3.21-3.22 filtered; no observed layout shift
Known boundaries: disabled composite about 2.105 over white under inactive exception; shared focus outline only 1.278 against navy menu
Retain, revise, or reject: retain provisionally for enabled pink action content only
Next branch: codex/shared-focus-visibility stacked on this documentation hand-off
```
