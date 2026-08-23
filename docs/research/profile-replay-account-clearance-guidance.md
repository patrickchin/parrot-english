# Profile replay and account clearance guidance

Last reviewed: 2026-08-24

Branch: `codex/profile-replay-account-clearance`

Base: `codex/profile-setup-plain-language` documentation hand-off at `22cbc9b`

Status: researched implementation contract; it does not claim an implemented
result, WCAG conformance, or child comprehension

## Question and boundary

How should the learner-profile question keep **Replay question** fully visible
and operable when the fixed account control occupies the same compact top-right
space?

This branch is deliberately local. It may change the question utility-row
composition and the deterministic viewport fixture and tests. It must not hide
or shrink either action, change the account menu, question copy, progress
meaning, answer flow, audio behavior, focus hand-off, route, API, persistence,
art, or child-paced timing.

The target audience makes the obstruction more important than its pixel area
suggests. A young learner with little English may rely on the familiar speaker
symbol to hear the bilingual prompt again. The fixed account button currently
paints and hit-tests above that symbol. The control therefore looks incomplete
and part of its target performs a different action.

## Reproduced baseline

The production-copy deterministic profile fixture was inspected in the genuine
in-app Chromium Browser at the stacked base `22cbc9b`.

| Viewport | Account border box | Replay border box | Exact intersection |
| --- | --- | --- | --- |
| 280x568 | x=196.21875…270, y=10…54 | x=206…250, y=44.75…88.75 | 44x9.25 CSS px |
| 360x640 | x=260.828125…346, y=14…66 | x=270…318, y=46.5…94.5 | 48x19.5 CSS px |
| 640x360 | x=556.21875…630, y=10…54 | x=534…578, y=30…74 | 21.78125x24 CSS px |

At an intersection point, `elementsFromPoint` returns the account button before
Replay because `AccountHeader` is fixed at `z-40`. Raising Replay would only
reverse which action is blocked.

The failure comes from two independent layouts:

- `AuthGate` owns a fixed top-right `AccountHeader` outside route content;
- `/profile/setup` has no `RouteHeader` and reserves no header rail;
- `LearnerProfileScreen` centers the profile card independently; and
- the question utility row uses `justify-between`, placing Replay at the card's
  right edge below the account.

The current viewport test checks account clearance for the prompt, art, field,
speech action, and navigation actions but omits Replay. Its fixture also gives
every question `audio: null`, so the overlapped control is disabled and cannot
prove focus or pointer operation.

## What authoritative sources support

| Topic | Supported claim | Parrot implication | Limit |
| --- | --- | --- | --- |
| Focus obstruction | WCAG 2.2 SC 2.4.11 Level AA requires a focused component not to be entirely hidden by author-created content. Its Understanding page recommends reducing partial obstruction and identifies fixed headers as a common cause. SC 2.4.12 Level AAA requires no part of the focused component to be hidden. See [A11Y-26](./source-register.md). | Use the stricter complete-clearance outcome for this small child action: keep the Replay component and its authored focus paint away from the fixed account layer. | Complete clearance is the AAA condition and a Parrot product goal, not an AA conformance claim. The criterion does not prove comprehension or prescribe this flex layout. |
| Pointer target | WCAG 2.2 SC 2.5.8 Level AA uses a 24x24 CSS-pixel minimum with exceptions. SC 2.5.5 Level AAA uses 44x44 and notes extra value for sequential or edge-positioned controls. See [A11Y-05 and A11Y-26](./source-register.md). | Preserve Parrot's existing 44x44 floor for Replay and Account. Do not count an area captured by the other action as usable target area. | CSS pixels are not physical millimetres, and 44px is not direct evidence of the optimal target for every child or device. |
| Reflow | WCAG 2.2 SC 1.4.10 requires ordinary horizontal-language content to retain information and function without two-dimensional scrolling at a width equivalent to 320 CSS px. See [A11Y-15](./source-register.md). | Recompose the local row at compact widths; keep both actions and all question content without horizontal overflow. | WCAG permits vertical scrolling. Parrot's 280px check is stricter, and 640x360 already has a 13px main scroll extent while all content border boxes remain visible. |
| Important actions and labels | W3C COGA recommends making important actions easy to find, using clear visible labels, and pairing recognizable icons with their affected content. See [A11Y-02, A11Y-06, and A11Y-20](./source-register.md). | Keep one unclipped speaker symbol in the question context and preserve the full progress text and Replay accessible name. Do not solve the collision by removing the action or its context. | These are supplemental patterns, not conformance criteria or young-multilingual-learner trials. A familiar-looking icon still needs direct comprehension testing. |

Primary pages checked for this decision:

- W3C WAI, [Focus Not Obscured (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html), updated 2026-06-15;
- W3C WAI, [Focus Not Obscured (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-enhanced.html), updated 2026-06-15;
- W3C WAI, [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), updated 2026-06-12;
- W3C WAI, [Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), updated 2026-05-11; and
- W3C WAI, [Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html), accessed 2026-08-24.

## Options considered

### 1. Start-pack the existing progress and Replay items locally — selected

At compact portrait and short-wide sizes, keep the source and visible sequence
**Question _n_ of _n_** then **Replay**, but place the two items together at the
start of the card. At narrow widths, remove only the decorative letter spacing
from the uppercase progress label and use a four-pixel gap. At short-wide sizes,
the full tracked label and eight-pixel gap already fit.

This keeps the complete wording, DOM/reading order, 44/48-pixel button, card
height, prompt, input, actions, and desktop/tall composition. Calculating from
the rendered 280px label shows the compact group leaves the Replay focus paint
clear of the current account border box rather than merely moving the component
by one overlap width.

The letter-spacing reduction is a visual-density tradeoff, not a language or
font-size reduction. The progress label remains uppercase, bold, rose, and on
one line.

### 2. Put Replay visually before progress — rejected for now

This creates abundant clearance without changing height, and independent
visual review considered it viable. With the current markup, however, a
responsive flex reversal would disagree with source/reading order. Reordering
the markup globally would alter the established tall/desktop composition. The
selected option gets the same clearance while preserving both orders.

### 3. Reserve a shared top rail — rejected for this bounded defect

A global `LearnerProfileScreen` or `AccountHeader` exclusion zone could handle
arbitrarily long account names, but it affects every profile state and route.
At 640x360 the existing card already creates a 13px vertical scroll extent; a
24px downward reservation would push the visible Next action below the
viewport unless the whole question layout were recomposed.

Long account names remain a shared-header follow-up. This branch protects the
current tested account contract rather than pretending to solve an unbounded
label width locally.

### 4. Raise z-index, hide, shrink, or disable — rejected

Changing stacking merely decides which action receives the collision. Hiding
the account or Replay removes useful access. Shrinking either target conflicts
with Parrot's 44px child baseline. Leaving fixture audio null would preserve an
untestable disabled state rather than the product interaction.

## Exact acceptance contract

### Product behavior

1. The compact question utility row keeps **Question _n_ of _n_** before Replay
   in DOM and visible order.
2. At widths below `sm`, the row is start-packed, uses a four-pixel gap, and
   removes only the progress label's decorative tracking.
3. In `short-wide`, the row is start-packed with its current compact eight-pixel
   gap. Tall `sm` and desktop placement remains unchanged.
4. Replay and Account each remain at least 44x44 CSS pixels, visible, named,
   enabled when saved question audio exists, and independently operable.
5. Replay's border box expanded by the shared four-pixel outline plus four-pixel
   offset is disjoint from the higher-layer account border box at 280x568,
   320x640, 360x640, 390x844, 640x360, and 1440x900. Normal and forced-colors
   focus treatments remain visible; Account's own focus treatment remains
   intact when it is the active control.
6. Pointer samples at Replay's center and inset corners resolve to Replay or one
   of its descendants, never Account.
7. The new step heading keeps initial programmatic focus. Tab from that heading
   still reaches the answer field; Shift+Tab reaches Replay and exposes the
   shared visible focus treatment. Native keyboard and one pointer activation
   each initiate one replay; Account still opens and returns focus on Escape.
8. Progress remains one rendered line. Prompt, translation, art, answer field,
   microphone, Skip, and Next remain in the viewport with no horizontal
   overflow. The short-landscape main scroll extent must not exceed its 13px
   baseline.

### Fixture and evidence boundary

The viewport fixture should derive each saved question-audio object from the
versioned questionnaire's `audioId` and `promptEn`, pointing to the checked-in
`/assets/audio/{audioId}.mp3`. This makes Replay truthful and testable without a
network service, copied Mandarin, or a generated asset.

It remains a deterministic local fixture: passing playback checks will not
establish physical-device audio, browser autoplay behavior outside a user
gesture, target assistive-technology output, or child understanding of the
speaker symbol.

## Implementation sequence

The detailed test-first steps and verification commands are in the
[implementation plan](../plans/2026-08-24-profile-replay-account-clearance.md).
In summary: make the current overlap fail as an enabled rendered contract,
apply the local row reflow, verify all breakpoint/focus/pointer invariants, then
capture genuine before/after and focused screenshots before a retain/revise
decision.

## Remaining questions

- How far left can a real account label extend before shared header arbitration
  is required across routes?
- Do young Pre-A1 learners recognize the speaker symbol as “hear this again,”
  or should a later comprehension-tested design add a visible label?
- Does VoiceOver/TalkBack expose the progress, Replay action, focused question,
  and answer field in a useful order on target devices?
- Should the existing 13px short-landscape scroll extent be removed in a
  separate spacing branch, even though all content border boxes are initially
  visible?
