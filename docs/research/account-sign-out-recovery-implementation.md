# Account sign-out recovery implementation

Status: implemented and provisionally retained

Date: 2026-08-24

Branch: `codex/account-sign-out-recovery`

Base branch / dependency: `codex/account-sign-out-feedback` at `1de1f6d`

Research and baseline: `374b34b`

Initial rendered and lifecycle contracts: `c521ab8`, `895f992`

Core implementation: `fdd5897`

Review regressions: `ac270ce`

Evidence harness: `fbe9422`

Independent-review hardening: `eca3c0b`

Capture-readiness fixes: `a19b499`, `687f59d`

Keyboard evidence stabilization: `42dc21b`

Full-suite menu-focus synchronization: `050713b`

Research contract:
[`account-sign-out-recovery-guidance.md`](./account-sign-out-recovery-guidance.md)

Visual evidence:
[`account-sign-out-recovery/manifest.md`](../../artifacts/ux-review/account-sign-out-recovery/manifest.md)

## Outcome

After a failed **Sign out**, Parrot now keeps the familiar Account control and
adds one compact adjacent **Sign out again** action. The action includes a
yellow warning triangle, is at least 44 CSS pixels in both dimensions, and is
one Tab after the still-focused Account control. It does not cover the route
heading, lesson shelf, Lesson Player HUD, or speech.

The first production layout met that boundary at the authored text settings
but failed the exact WCAG text-spacing override: the expanded retry overlapped
the route heading at 280, 390, and 640 CSS pixels. Independent review caught
the gap before sealing. The retained wider recovery reservation keeps the full
one-line action and focus paint separate under line height 1.5, paragraph
spacing 2em, letter spacing 0.12em, and word spacing 0.16em.

One empty atomic `alert` is mounted before the request. Failure fills it with
the literal sentence **Sign out did not finish.** The sentence is available to
assistive technology without adding another visual paragraph to the child's
already dense header. The retry is programmatically described by that same
alert, so a keyboard or screen-reader user can revisit the reason when the
action receives focus. Opening Account does not move or remount the alert.

The visible interface does not say **You are still signed in**. A failed or
lost response does not prove the server outcome. It also avoids **Oops**,
**Something went wrong**, **session**, status codes, automatic retry, a timer,
and a modal.

## Copy decision after rendering

Research began with **Try sign out again** as the action candidate. The real
280x568 implementation put that label into the same horizontal space as Back
and Account and its focus paint overlapped Back by about six CSS pixels. The
generic alternative **Try again** fit but removed the operation name and made
the control ambiguous outside visual context.

The retained label is **Sign out again**. It keeps the established operation,
starts with a verb, removes only the generic word **Try**, and fits with a
complete focus outline at 280px under both authored and standard text-spacing
settings. This is a rendering-informed refinement, not evidence that the
phrase is understood by a young learner or limited-English caregiver. **Sign
out** remains a documented phrasal-verb exception because it is already the
Account menu's term; translation and task testing remain necessary.

## Selected and rejected designs

Two functional prototypes were built from the research commit in isolated Git
worktrees and exercised at four shelf viewports plus the short Lesson Player.

| Pattern | Branch / commit | Result |
| --- | --- | --- |
| Account becomes the retry | `codex/prototype-sign-out-recovery-locus` at `5cefe19` | Rejected. The focused locus was compact and clear, but Account utilities disappeared until retry succeeded or the session changed. A recoverable error should not remove the user's other account path. |
| Account plus adjacent retry | `codex/prototype-sign-out-recovery-split` at `8dff319`, reviewed at `ba65985` | Selected. It preserves Account, makes recovery immediate, keeps retry next in DOM/tab order, and fits every sampled viewport. Review corrected a desktop pending-width regression and made retry close an already-open menu synchronously. |
| Existing absolute alert | Base `1de1f6d` | Rejected. It covered 100% of the sampled heading at 280px, 84.8% at 390px, and about 64.7% of the short Lesson Player HUD while requiring menu rediscovery. |
| Sentence plus button below Account | Research-only candidate | Rejected before implementation because it retains the baseline's vertical collision. |
| Toast, global banner, modal, or automatic retry | Research-only candidates | Rejected because they detach recovery from Account, interrupt the child activity, or perform an account action without deliberate intent. |

The selected prototype initially applied `wide:w-auto` to both failure and
pending states. That shrank the established desktop pending frame from 180px
to 173.2px. Production applies flexible wide sizing only to the failure state,
and a browser regression keeps pending at exactly 180px.

## Implemented boundary

`src/auth/AuthGate.tsx` now owns pending/error state separately from sign-in and
profile errors and keys it to the authenticated account ID, falling back to a
normalized email only when no ID exists. A new attempt clears its sign-out
error while retaining the existing independent `formError` clear, a failed
current attempt writes **Sign out did not finish.**, and confirmed session
absence or a direct identity change hides and clears the old owner's state. A
matching-owner attempt guard coalesces same-task activation while a new
identity can start its own attempt; late earlier results are ignored.

`src/app/AppHeader.tsx` now:

- keeps the ordinary Account button mounted and focused after failure;
- renders the shared compact `ActionButton` immediately after Account in DOM
  order while `flex-row-reverse` places the retry visually to its left;
- gives the retry a visible yellow `TriangleAlert` in addition to words;
- points `aria-describedby` at the persistent failure alert;
- calls the existing menu selection boundary, which closes any open menu,
  focuses Account synchronously, and invokes guarded sign-out;
- uses the same 152px short, 164px regular, and 180px wide reservation while
  pending; reserves 206px at 280, 214px from 360, and 222px from the medium
  breakpoint for failure, then allows natural wide sizing; and
- retains the old generic profile/account error presentation for errors that
  are not owned by sign-out.

No server endpoint, authentication library, successful sign-out navigation,
ordinary direct-exit policy, deletion flow, lesson content, child audio,
persistence model, dependency, or global CSS rule changed.

## Test-first and review evidence

The first unit, lifecycle, and browser contracts were run before production
edits. Four focused component/lifecycle assertions and the initial Chromium
contract failed because the baseline had no pre-mounted sign-out alert,
dedicated recovery action, or retry description.

The retained contracts cover:

- an empty alert existing in server-rendered and mounted ready states;
- the same alert node surviving failure, Account-menu open/close, retry, and a
  second failure;
- failure copy, dedicated current-identity ownership, direct identity changes,
  and clearing on retry/session exit;
- Account focus after failure and after retry activation;
- retry following Account in DOM/tab order while appearing to its left;
- a 44px minimum action and complete focus paint inside each viewport;
- exactly one new request from two same-task retry activations;
- native Enter and Space retry activation while the pending Account owner
  absorbs another key press;
- retry closing an already-open Account menu before pending begins;
- Account utilities remaining navigable after failure;
- stable route heading, Lesson Player HUD, and speech rectangles;
- no overlap with Back, Account, heading, HUD, or speech and no horizontal
  overflow at 280x568, 390x844, 640x360, and 1440x900;
- a static warning cue plus visible focus under emulated forced colors and
  reduced motion;
- preservation of the 180px desktop pending frame;
- the exact WCAG text-spacing override at 280, 390, and 640 CSS pixels plus the
  dense 640x360 Lesson Player; and
- page-scoped conversation alert locators, so the new persistent account alert
  does not weaken unrelated conversation-state assertions.

Review also found that a second failed request was not held long enough to prove
the alert's empty-to-identical-text transition, and Enter/Space were not
exercised directly. The retained browser contracts now hold request two, prove
the same node empties and refills, and count keyboard activation exactly.

A review-only test initially used the browser `Node` global in the Node/jsdom
lifecycle file. Full lint correctly rejected that environment mismatch. The
test now reads `DOCUMENT_POSITION_FOLLOWING` from the element's owning window.

## Rendered and timing result

At 280x568 the retry is 150x44 at `x=64`, Account is 44x44 at `x=226`, and Back
is 44x44 at `x=10`. The retry's complete 166x60 focus paint stays inside the
viewport from `x=56` and does not touch Back, Account, or the heading. At
390x844 the retry is 150x48; at 640x360 it is 158x44. On desktop it expands to
148.3x48 while Account keeps its full visible label. Document width equals
viewport width at every sampled size, and the heading rectangle is unchanged.

Twenty fresh local Chromium document loads, five per viewport, measured from
the menu-item click event to the failure alert's DOM mutation and the next
`requestAnimationFrame` callback. The final retained run measured an 8.3ms
nearest-rank alert-mutation median and 8.9ms p95; the next-frame callback was
14.9ms median and 15.5ms p95.
The request was aborted immediately, the callback precedes paint, and this is
a local implementation diagnostic—not physical input latency, production
network time, assistive-technology speech latency, or child-perceived speed.
Raw samples and geometry are preserved in
[`capture-metrics.json`](../../artifacts/ux-review/account-sign-out-recovery/capture-metrics.json).

## Verification

Final verification passed:

- 691/691 unit and mounted lifecycle tests;
- 9/9 serial Chromium evidence cases on each of the two final capture runs;
- 40/40 repeated Enter/Space retry checks after explicitly awaiting the first
  failed state;
- 40/40 concurrent repetitions of the existing account-action menu contract
  after explicitly awaiting its asynchronous first-item focus;
- seven focused responsive-header recovery cases, including three text-spacing
  viewports and Enter/Space activation;
- eight ordinary sign-out-feedback Chromium cases, including two text-spacing
  captures;
- 343/343 Chromium tests in the complete responsive browser suite;
- the production build and ESLint with zero errors plus two generated
  declaration-file warnings; and
- repository-local Markdown-link, JSON, PNG-dimension, and SHA-256 integrity
  checks.

## Evidence and review boundary

The retained bundle contains four ordinary failure captures, a 280px keyboard
focus capture, a short Lesson Player failure and focus pair, one emulated
forced-colors/reduced-motion capture, two exact text-spacing focus captures,
exact rectangles, and 20 local timing samples. Prototype source remains in
isolated worktrees, while exact prototype captures are copied into the retained
bundle and indexed by branch, commit, path, and hash in the manifest.

Automated Chromium and DOM checks do not establish what VoiceOver, NVDA, or
TalkBack announces. In particular, the alert is screen-reader-only while the
visible action is described by it; exact announcement order and whether a
repeated identical sentence is re-announced need manual target-AT checks.
Safari, Firefox, speech control, switch control, physical forced colors, 200%
zoom, real touch, low-end devices, production latency, professional
translation, and child/caregiver comprehension remain untested. Text spacing is
now covered for this English LTR recovery boundary, not every route or script.

USWDS also advises leading alert text with its type and not visually hiding the
message. Parrot borrows its concise human-readable and easy-next-step
principles, but deliberately does not claim the full pattern: the sentence
omits **Error** and is screen-reader-only. The visible action remains specific
without relying on color or the triangle. This tradeoff stays open until target
assistive-technology and limited-English task testing.

The warning triangle and specific action deliberately prioritize a compact
non-obscuring recovery. A future comprehension comparison may find that the
full sentence must also be visible. That would require a different layout
that still proves no collision with the child task; it should not restore the
old absolute alert.

## Hand-off record

```text
Branch: codex/account-sign-out-recovery
Base branch / dependency: codex/account-sign-out-feedback at 1de1f6d
Commits: 374b34b, c521ab8, 895f992, fdd5897, ac270ce, fbe9422, eca3c0b, a19b499, 687f59d, 42dc21b, 050713b
Hypothesis: a compact explicit retry beside the persistent Account control can make failed sign-out recoverable without covering the child's task or weakening exactly-once behavior
Changed: identity-owned sign-out pending/error state; persistent atomic alert; literal failure sentence; visible operation-specific retry; warning cue; retry description; stable Account focus/access; text-spacing-safe narrow/short/desktop evidence
Not changed: successful sign-out focus, direct-exit policy, dirty-edit handling, server endpoint, deletion, lessons, audio, persistence, dependencies
Measured result: 8.9ms local alert-mutation p95; 15.5ms next-frame-callback p95; 150x44 retry at 280px; complete default/text-spacing focus paint; zero sampled heading/HUD/speech overlap or horizontal overflow
Tests: 691 unit/lifecycle and 343 Chromium passed; production build passed; lint reported 0 errors and 2 generated declaration-file warnings
Evidence integrity: 558 local Markdown links and 20 indexed PNG hashes/dimensions passed; metrics JSON parsed and matched its indexed SHA-256
Screenshots / traces: artifacts/ux-review/account-sign-out-recovery/manifest.md
Risks / limitations: target AT speech, visible-sentence comprehension, localization/RTL/zoom, target browsers/devices, field latency, and child/caregiver testing remain open
Retain, revise, or reject: retain provisionally after selecting the split pattern and correcting its pending-width and open-menu retry regressions
Next question: can successful sign-out establish one useful Welcome back reading/focus position without stealing focus on ordinary login arrival?
```
