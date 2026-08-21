# First-Use UX Audit Synthesis

Last reviewed: 2026-08-21

Branch: `codex/first-use-ux-audit`

Base: `codex/talk-direct-action-feedback` documentation hand-off `7e3bf1d`

Audience: primarily five-to-seven-year-old beginning English learners,
including children who cannot yet read English independently; seven-to-ten is
a comparison cohort, not an assumed proficiency level

## Decision

The next implementation should make learner-profile acknowledgments
**child-paced**. The following stacked implementation should make the
form-profile fallback **viewport-stable**.

The branch order is:

1. `codex/profile-acknowledgment-control`, based on this audit hand-off;
2. `codex/profile-fallback-viewport-stability`, based on the completed
   acknowledgment branch; and
3. a separately researched contrast-safe child-action branch, only after the
   first two are validated.

This order intentionally resolves a difference between the parallel audits.
The visual audit ranked the hidden and moving profile action first. The timing
and language audits ranked media-controlled acknowledgment navigation first.
Both findings are high confidence, but navigation ownership goes first because:

- every implemented media outcome can remove the acknowledgment without a
  learner choice: audio end, audio error, rejected playback, or a fixed no-audio
  timer;
- a rejected playback promise can navigate immediately, while no audio always
  navigates after 1,800 ms;
- the mounted acknowledgment leaves focus on `BODY`, so the visible **Next**
  action is not introduced programmatically;
- the behavior change is small, reversible, and independently testable; and
- a stable, explicit acknowledgment boundary makes the following geometry and
  focus tests deterministic instead of racing an automatic transition.

The visual branch remains the next stack layer rather than being demoted. Its
640×360 hidden action, 208 px cold-image movement, retained scroll position,
and 280 px below-fold controls are reproducible task-boundary failures.

## Parallel evidence

| Audit | Highest-ranked finding | Direct evidence | Decision contribution |
| --- | --- | --- | --- |
| [Child-facing interface language](./child-interface-language-audit.md) | Keep each acknowledgment until explicit **Next** | Source branches, generated-text contract up to 160 characters, and external timing/user-control guidance | Establishes language and learner-agency risk without inventing a reading-speed threshold. |
| [First-use timing and state stability](./first-use-timing-stability-audit.md) | Remove media- and timer-driven navigation; focus the acknowledgment heading | Injected no-audio, ended, error, and rejected-play branches; mounted no-audio flow; focused test review | Establishes deterministic behavior, same-route focus loss, and a complete acceptance contract. |
| [First-use visual hierarchy](./first-use-visual-hierarchy-audit.md) | Stabilize the form-profile fallback at four target viewports | Rendered geometry, delayed-image probe, current-source review, and declared-color calculation | Establishes the next layout branch and identifies contrast and voice hierarchy as later work. |

No audit included a child, caregiver, assistive-technology user, or real target
device. The chosen fixes address source-proven loss of agency and rendered
geometry; they do not prove comprehension or learning benefit.

## Improvement 1: child-paced acknowledgments

### Product boundary

Retain the current acknowledgment text, Peppa image, polite live-region
semantics, audio attempt, visible **Next** action, and media cleanup. Change
only navigation and focus ownership:

- audio `ended`, `error`, rejected `play()`, missing audio, and audio setup or
  decode failure never call `onNext`;
- remove the 1,800 ms navigation timer;
- only activation of the visible **Next** action advances;
- focus the acknowledgment heading once when it replaces the submitted
  question on the same route; and
- keep **Next** as the next sequential action.

Do not add replay, new copy, generated-output constraints, telemetry,
dependencies, timeouts, persistence changes, or profile API changes.

### Acceptance contract

1. With no audio, advancing fake time well beyond 1,800 ms leaves the
   acknowledgment and **Next** visible and does not call `onNext`.
2. Audio end, audio error, and rejected playback do not call `onNext`; rejected
   playback is handled without an unhandled rejection.
3. Cleanup still pauses media, removes listeners, revokes its object URL, and
   makes later stale media events inert.
4. Activating **Next** calls `onNext` exactly once.
5. In the mounted final-answer path, the acknowledgment heading receives focus,
   remains after more than two seconds with no audio, and advances only after
   **Next**.
6. In a multi-acknowledgment profile-edit path, each **Next** reveals one item;
   media failure cannot skip an item or close the route.

## Improvement 2: profile fallback viewport stability

Stack this branch on the completed child-paced acknowledgment branch. Preserve
the behavior and content contracts from improvement 1.

### Product boundary

- reserve the 1024×1024 Peppa image geometry on setup, question,
  acknowledgment, and editor instances;
- add compact short and short-wide compositions using the existing shared
  components and Tailwind utilities;
- reduce empty space and illustration size before reducing child text;
- reset the profile-owned scroll position at step boundaries; and
- focus each newly visible step heading without relying on a pathname change.

Do not change profile data, question order, bilingual prompts, saved audio,
speech transcription, skip behavior, API contracts, or copy.

### Acceptance contract

At 280×568, 390×844, 640×360, and 1440×900:

- delayed Peppa decoding changes heading and action geometry by no more than
  1 CSS px;
- **Set up profile** and **Skip for now** are wholly visible at scroll position
  zero;
- setup can be activated without a test helper scrolling it into view;
- the new question heading and complete answer entry are visible, the heading
  owns focus, and profile scroll begins at zero;
- acknowledgment → next question reveals and focuses the new heading;
- actions retain at least a 44×44 CSS px target;
- document-level horizontal overflow and account-header overlap remain zero;
  and
- assertions use accessible locators and rendered boxes, not source classes.

## Later branches kept separate

1. **Contrast-safe child actions.** White on the default `#ff467b` action token
   calculates to 3.27:1 for normal-size text. Research and replace the
   text-bearing treatment with a tested ≥4.5:1 state without conflating it with
   profile flow changes.
2. **Visible voice-first answer path.** Prototype a literal visible speech cue
   while keeping editable typing available; do not infer typing ability from
   age.
3. **Profile setup copy and motion.** Test shorter literal setup language,
   clearer saved-data framing, and a static character with intended learners
   and caregivers.
4. **Generated acknowledgment language.** Evaluate a short common-word output
   contract separately from pacing so effects remain attributable.
5. **Direct route-reveal focus.** Re-trigger destination focus when a cold lazy
   route replaces its loading heading; verify across every lazy route before a
   shared fix.
6. **Profile-service latency.** Measure content-free phase distributions before
   changing the current serial enrichment, persistence, and speech work.

## Evidence and limits

The relevant source register entries are [A11Y-04, A11Y-05, A11Y-11,
A11Y-14, LANG-03, LANG-05, WELL-01, PERF-01, and PERF-02](./source-register.md).
They support user-controlled change, stable presentation, short supported
instructions, child agency, and timing/layout performance boundaries. They do
not establish a universal reading time, validate the exact English, or prove
that either branch improves learning.

Retain either implementation only if its deterministic behavior and rendered
contract pass without introducing a new hidden action, automatic transition,
or content loss. Revise after representative child/caregiver and target-AT
observation; do not restore forced pacing merely because a learner fails to
notice **Next** in an untested design.

## Hand-off

```text
Audit branch: codex/first-use-ux-audit
Base: codex/talk-direct-action-feedback documentation hand-off 7e3bf1d
Research commits: b570605, 29d66b0, 691afeb
Visual-evidence follow-up: fc09750
Selected next branch: codex/profile-acknowledgment-control
Next stacked branch: codex/profile-fallback-viewport-stability
Primary reason: optional media currently owns navigation and can remove visible content immediately or after 1.8 seconds
Do not bundle: layout, copy, replay, generated-output constraints, API, persistence, telemetry, or dependency changes
After implementation: validate focused component/lifecycle/browser behavior, full regression suites, build, lint, Markdown links, screenshots where deterministic state access is available, and record retain/revise/reject
```
