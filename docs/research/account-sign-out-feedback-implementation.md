# Account sign-out feedback implementation

Status: implemented and provisionally retained

Date: 2026-08-24

Branch: `codex/account-sign-out-feedback`

Base branch / dependency: `codex/account-action-hierarchy` at `5dce79a`

Research and baseline: `553d1c2`

Rendered behavior contract: `3fb69ba`

Core implementation: `735aa45`

Browser status ownership: `0209750`

Accessible-name refinement: `7733c9d`

Unit contract: `0fe7a63`

Capture harness: `7be6b86`

Final review refinement: `0dd76c4`

Research contract:
[`account-sign-out-feedback-guidance.md`](./account-sign-out-feedback-guidance.md)

Visual evidence:
[`account-sign-out-feedback/manifest.md`](../../artifacts/ux-review/account-sign-out-feedback/manifest.md)

## Outcome

Selecting **Sign out** now closes the menu and immediately replaces the
top-right Account presentation with one spinner and the literal words
**Signing out…**. The same Account button retains focus; its pending accessible
name becomes **Signing out… Account for Mia**, placing the complete visible
label first while retaining the Account identity. It reports
`aria-disabled=true`, absorbs pointer hit-testing, uses a wait cursor, and
rejects another activation. The sampled shelf heading and dense lesson
HUD/speech anchors do not move.

One pre-mounted polite atomic `status` owns both the visible pending words and
their programmatic status semantics. It is a sibling visually aligned over the
button rather than text inside the button. Because close visual proximity can
still make those words the button's visible label, the pending button name
starts with the exact same words. The sibling structure preserves one compact
inline visual and one live-status owner without inserting visible status text
as a button descendant.

The copy is intentionally one short action phrase. There is no confirmation,
**Please wait**, countdown, minimum display duration, toast, modal, or reopened
menu. This remains a caregiver account operation inside a child product, but
the words avoid technical **session** language and are short enough for a
small control, which keeps reading burden low. Comprehension by a weak-English
reader remains untested.

## Selected and rejected designs

The branch compared two isolated real-code prototypes across 280x568,
390x844, 640x360, and 1440x900:

- The selected inline visual consumed 151–180px and read as one action changing
  state. At 280px it left 65px in the prototype between Back and the pending
  control.
- The rejected adjacent pill consumed about 195px at 280px and about 324px on
  desktop. It left only 21px at 280px, resembled a second button or tooltip,
  and left the ordinary Account icon and chevron looking available.

Independent visual review selected inline at every viewport. Independent
accessibility review correctly rejected transplanting the first prototype
unchanged because it replaced the focused menu button's Account identity with
only **Signing out** and returned focus only in an effect. The final
implementation instead borrows the adjacent prototype's synchronous focus
transfer, overlays a semantic sibling status inside the same pixels, and names
the pending button **Signing out… Account for Mia**.

This hybrid also fixes two subtler issues found during review:

- the ready-state `title="Account"` is omitted while pending, so it cannot add
  a redundant Account description or stale hover tooltip; and
- the pending accessible name starts with the exact visible **Signing out…**
  label, addressing WCAG 2.5.3's literal text-containment requirement while
  preserving the Account identity after it. This does not by itself prove
  complete conformance, speech-input behavior, or announcement order.

## Implemented boundary

`src/app/AppHeader.tsx` now:

- synchronously focuses Account before the selected menu item unmounts;
- keeps the menu closed and the Account menu relationship stable, omits the
  ready-state title, and gives the focused pending button a
  visible-label-first name;
- uses the shared `ActionButton` rather than a page-specific control;
- holds the visual status in a 152px short, 164px regular, or 180px wide frame;
- keeps one empty `role=status` mounted before activation;
- removes the former `aria-busy` Account ancestor so the ready status update is
  not deferred;
- retains literal words under reduced motion while stopping spinner animation;
  and
- overrides the shared pointer-transparent authored-disabled default only for
  this focused operation owner, then guards the click and arrow-key paths.

`src/auth/AuthGate.tsx` now owns sign-out with an attempt-identity ref rather
than render state alone. The identity blocks two calls in the same React task,
keeps pending after the action promise succeeds, resets only when the reactive
session is confirmed `null` or the current attempt fails, and ignores a late
result from a superseded pre-sign-in attempt.

`signOutSession` no longer calls `refetch()` after `authClient.signOut()`.
Better Auth's official [Basic Usage](https://better-auth.com/docs/basic-usage)
states that `useSession` is reactive and that changes such as signing out are
reflected in the UI. The installed 1.6.23 client also schedules its
`$sessionSignal` after a successful `/sign-out`; the earlier explicit refetch
created a second session read and an abort/order race. Sign-in and
account-deletion refresh boundaries were not changed.

No route, server sign-out endpoint, confirmation policy, child lesson content,
error sentence, Account failure-alert placement, login focus behavior, audio,
timer, dependency, global CSS rule, or persistence boundary changed.

## Test-first and race evidence

Before production edits, the new component/lifecycle contracts failed because
the baseline exposed no status, visible pending words, focused persistent
owner, or authored disabled state. The initial 280px browser contract also
failed waiting for the absent status after the menu disappeared.

Review-driven tests were then observed failing against the first implementation:

- the sign-out action still received and called explicit `refetch`;
- a late failure from attempt A cleared newer pending attempt B after
  sign-out, signed-out rendering, and same-SPA sign-in re-entry;
- the first inline markup put visible **Signing out…** inside a differently
  titled Account button; and
- the semantic sibling initially inherited dark page text instead of the
  button's white foreground. An exact computed-foreground contract failed
  `rgb(36, 29, 43)` versus `rgb(255, 255, 255)` before the fix.

The retained contracts cover:

- two same-task menu-item clicks invoking one action;
- pointer reactivation hitting Account rather than falling through and issuing
  no second request;
- returned and thrown failure recovery, retained focus, one alert, and a
  deliberate retry;
- action success remaining pending until session disappearance;
- session-null reset, same-SPA session re-entry, and a new sign-out attempt;
- attempt A becoming stale while attempt B remains pending;
- pending Account name beginning with the visible label, retained Account
  identity, no redundant title description, and one visible sibling status;
- no busy ancestor, no menu reopen, no heading movement, no horizontal
  overflow, and unchanged dense lesson anchors;
- 44px minimum target size, literal compact copy, white foreground parity,
  wait cursor, and no hover lift while pending; and
- keyboard focus in forced colors and a static icon plus words under reduced
  motion.

## Rendered and timing result

The retained status/button frame is 152x44 at 280x568 and 640x360, 164x52 at
390x844, and 180x64 at 1440x900. It leaves 64px between the compact Back and
pending frames at the smallest viewport, versus the rejected adjacent
prototype's 21px. The status and button rectangles are identical; the heading
rectangle and document width do not change.

Twenty fresh local Chromium pages measured complete pending DOM mutation at
1.4ms nearest-rank p50 and 1.5ms p95. The next animation-frame callback was
18.5ms p50 and 20.1ms p95. The callback precedes paint, and the sample is a local
candidate diagnostic—not field latency or an accessibility/child-perception
claim. Every raw sample is in the visual bundle's
[`capture-metrics.json`](../../artifacts/ux-review/account-sign-out-feedback/capture-metrics.json).

The evidence bundle contains four ordinary shelf captures, one keyboard
forced-colors/reduced-motion capture, one active lesson-player capture, exact
geometry, 20 timing samples, and SHA-256 integrity. Prototype captures remain
on their isolated named branches and are indexed by commit and hash in the
manifest.

## Independent review

Three independent agents reviewed the competing visuals, accessibility model,
and request/session lifecycle.

Visual review selected inline because it is one coherent state transition,
keeps stronger white-on-navy contrast, preserves more narrow-screen air, and
does not leave a false Account affordance beside a tooltip-like pill.

Accessibility review first preferred adjacent semantics, then re-reviewed the
hybrid production markup. Synchronous focus, visible status ownership, pointer
hit-testing, and full-opacity focus paint resolved its initial focus and
fallthrough objections. A final source audit correctly noted that exact visual
overlay can still make sibling text the button label under WCAG 2.5.3. The
pending name now begins **Signing out…** and retains **Account for Mia** after
it. `aria-live=polite` remains redundant with `role=status` but is on the same
element and not a second region. Final code review also found that the
ready-state title became a redundant pending description and that the first
browser timing assertion bounded request dispatch rather than visible
feedback. The title is now absent only while pending, and every shelf contract
requires the actual status text and visibility within 500ms.

Lifecycle review reproduced two prototype defects: the first inline ref could
stay locked after same-SPA re-entry, while the adjacent boolean ref allowed an
old result to cancel a newer attempt. The final attempt identity and re-entry
test resolve both. The same review identified Better Auth's duplicate reactive
refresh, which the installed-source audit and official documentation supported
removing.

## Verification

The first full Chromium run passed 301/335 cases. All 34 failures were the same
strict-locator ambiguity: older conversation and profile tests asked the whole
page for a single `status`, while the new pre-mounted Account status correctly
created a second region. Seven affected specs now scope those assertions
through their owning `main`; their combined rerun passed 70/70 without
positional, CSS, class, or text-filter selectors. The final full run passed
335/335.

Final non-browser verification passed 688/688 component, integration,
lifecycle, and safety tests. TypeScript and the production Vite build passed
after transforming 1,888 modules; the existing 502.04 kB chunk advisory
remains. Full ESLint passed with zero errors and two unused-disable warnings in
generated `worker-configuration.d.ts`. `git diff --check` passed.

The six sign-out Chromium cases passed both with serial evidence capture and
without the capture flag. The latter run left every evidence hash unchanged.
All six PNGs have their declared dimensions and SHA-256 values, the metrics
JSON parses, and all 100 local links across the six touched research/evidence
documents resolve.

## Limits and follow-up

Automated DOM and Chromium checks do not prove the actual speech sequence.
The focused accessible-name change and live status could be announced twice by
some browser/assistive-technology combinations. Before treating announcement
behavior as verified, manually check pending and failure with VoiceOver/Safari
and NVDA/Chrome or Firefox. Firefox, TalkBack, switch control, speech control,
200% zoom, translated/RTL copy, physical forced colors, real touch, low-end
devices, real network latency, and field Better Auth behavior remain untested.

No evidence here establishes that a five-year-old or weak-English caregiver
understands **Signing out…**. A later preferred-language task study should
measure action recognition and recovery, not preference or engagement.

Three adjacent problems remain deliberately separate: successful sign-out
lands on login with body focus; dirty lesson creation/editing needs a scoped
exit-loss audit; and failed sign-out covers narrow headings and lacks a direct
retry action. The next stacked branch should address the visible failure and
retry path without obscuring this pending-state boundary.

## Hand-off record

```text
Branch: codex/account-sign-out-feedback
Base branch / dependency: codex/account-action-hierarchy at 5dce79a
Commits: 553d1c2, 3fb69ba, 735aa45, 0209750, 7733c9d, 0fe7a63, 7be6b86, 0dd76c4
Hypothesis: immediate literal feedback at the persistent Account locus can make slow sign-out understandable without reopening the menu, moving child content, or permitting duplicate work
Changed: inline visible status; persistent Account focus/identity; state-aware visible-label-first name; pending-title removal; authored unavailable state and hit target; attempt-identity lifecycle; Better Auth reactive refresh ownership; rendered/timing/race evidence
Not changed: direct-exit policy, server endpoint, route destinations, failure wording/placement, login focus, dirty-edit handling, lessons, audio, persistence, dependencies
Measured result: 1.5ms local pending-mutation p95; 20.1ms next-frame-callback p95; 152x44 minimum frame; 64px minimum sampled route gap; zero sampled horizontal overflow or movement in the shelf heading and dense lesson HUD/speech anchors
Screenshots / traces: artifacts/ux-review/account-sign-out-feedback/manifest.md
Risks / limitations: target AT speech, localization/RTL/zoom, target browsers/devices, field latency, and child/caregiver comprehension remain untested
Retain, revise, or reject: retain provisionally after selecting inline pixels and replacing both prototypes' lifecycle/semantic weaknesses
Next question: can failed sign-out expose one compact, non-obscuring explanation and literal retry while keeping Account focus and exactly-once behavior?
```
