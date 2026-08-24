# Account sign-out recovery guidance

Date: 2026-08-24

Status: research complete; real-code visual comparison in progress

Baseline branch: `codex/account-sign-out-feedback`

Baseline commit: `1de1f6d`

## Question

After **Sign out** fails, how should Parrot explain the failure and offer a
deliberate retry without covering the child's activity, moving focus, repeating
an assertive announcement, or assuming fluent English?

This is a caregiver-oriented Account action inside a product for young English
learners. A child may still encounter it. The recovery therefore needs the
same literal language, stable geometry, large targets, and low reading load as
the child-facing surface.

## Observed baseline

The current request lifecycle is guarded well: selecting **Sign out** closes
the menu, synchronously focuses Account, exposes **Signing out…**, and blocks
duplicate activation. On failure, however, the fixed header renders an
absolute red alert below Account. It has no action. The words **Please try
again** require the user to infer that they must reopen Account, move through
the menu, and select **Sign out** again.

A local Chromium reproduction used the signed-in `/lessons` route and a failed
`/api/auth/sign-out` request at device-pixel ratio 1.

| Viewport | Existing alert | Sampled heading covered |
| --- | --- | ---: |
| 280×568 | 256×57 | 100% |
| 390×844 | 256×57 | 84.8% |
| 640×360 | 320×39.5 | 25.9% |
| 1440×900 | 320×39.5 | 0% |

On the dense 640×360 Lesson Player, the alert covers about 64.7% of the HUD,
including its complete title. Account retains focus and there is no horizontal
overflow, but the focused locus and the required retry are visually separated.
Opening Account also unmounts the outside alert and mounts a second copy inside
the menu. Repeating the same assertive announcement is therefore a plausible
assistive-technology risk, although target screen-reader behavior is untested.

The signed-in view currently receives `profileError || formError`. Sign-out
failure is not a distinct state, so a sign-out-specific action cannot safely be
attached to the generic Account error without first separating ownership.

These are deterministic local observations, not field failure rates, physical
input latency, assistive-technology output, or child/caregiver comprehension
results.

## Truth and language boundary

Use:

- alert: **Sign out did not finish.**
- action: **Try sign out again**

Do not say **You are still signed in**. An explicit service error or a lost
network response does not prove whether the server completed sign-out. **Did
not finish** names the app's observed transition without inventing account
state.

The selected words remove the less-common **unable**, the generic **Please try
again**, and a polite word that does not help recovery. The action repeats the
established operation and remains meaningful outside visual context. **Sign
out** is a phrasal verb, which limited-English guidance generally advises
against, but it is already the product's account term. Replacing it only for
the error with **exit**, **leave**, or **log out** would add a competing name.

Avoid **Oops**, **Something went wrong**, **session**, status codes, blame,
humor, apology, contractions, and character voice. Do not add connection advice
unless the application actually knows the cause.

## Source-to-design mapping

| Evidence | Product inference | Limit |
| --- | --- | --- |
| W3C defines an alert as important, assertive, atomic information that does not need focus. ARIA19 demonstrates an empty alert present before repeated submissions, cleared and refilled for a later error. See [A11Y-32](./source-register.md). | Keep one empty sign-out alert mounted. Fill it once after failure, leave focus on Account, clear it when retry starts, and refill the same owner if another attempt fails. | ARIA19 is written for input errors and is only a sufficient technique. DOM behavior does not prove what a particular screen reader says. |
| WAI-ARIA distinguishes assertive `alert` from polite `status`; the existing pending feedback already owns one pre-mounted status. See [A11Y-07, A11Y-08, and A11Y-10](./source-register.md). | Pending and failure need separate persistent semantic owners, with only one non-empty at a time. | A fast pending-to-error transition may still produce different announcements across assistive technologies. |
| W3C COGA favors clear words, visible labels, short paths, succinct text, and stable control placement. See [A11Y-01 through A11Y-04, A11Y-11, and A11Y-12](./source-register.md). | Give the failure one visible, literal recovery action at the Account locus. Do not require menu rediscovery, a modal, or a detached toast. | COGA is supplemental and does not validate the exact words or layout with Parrot's audience. |
| Home Office limited-English guidance recommends short active sentences, simple tenses, no contractions or idioms, translation checks, and direct testing of errors and buttons. See [UX-11](./source-register.md). | Use **Sign out did not finish.** and keep the operation's existing term in the retry label. | The source serves public-service users rather than young learners and advises against phrasal verbs such as **sign out**. The retained exception needs comprehension testing. |
| USWDS asks for short, human-readable alerts with an easy next step and short verb-first button labels. See [UX-12](./source-register.md). | Pair a specific failure sentence with **Try sign out again** and a non-color warning cue. | USWDS is neither child research nor proof that this implementation is accessible. |
| GOV.UK error guidance says to describe what happened and how to fix it in concise plain English; it discourages jargon, generic errors, **please**, apology, and humor. It also says its field-error component is not the right pattern for a service problem. See [UX-01 and UX-02](./source-register.md) and the [error-message guidance](https://design-system.service.gov.uk/components/error-message/). | Adopt the writing principles, but keep this recoverable operation failure with its Account task rather than transplanting a form-validation component. | Public-service writing guidance does not prescribe a compact child-product header. |
| W3C focus guidance and the APG Alert Pattern preserve keyboard work while a non-modal alert appears. See [A11Y-16, A11Y-22, and A11Y-32](./source-register.md). | Account remains focused after failure. Retry is the next logical control, and activating it must not leave focus on a removed node. | The exact DOM/visual order remains a product choice requiring browser and assistive-technology checks. |

## Interaction contract

1. Sign-out failure receives dedicated `signOutError` state; authentication and
   profile failures cannot accidentally acquire its retry behavior.
2. One empty `role="alert" aria-atomic="true"` exists before failure. It does
   not move between the closed header and open menu.
3. Failure clears pending and fills that alert with **Sign out did not
   finish.** in the same committed update.
4. Account keeps focus. A visible recovery action is available at the same
   Account-owned locus without reopening the menu.
5. The action's visible and accessible name identifies the retry without
   depending on a nearby sentence, red, or an icon alone.
6. Retry synchronously establishes a safe focus owner before any conditional
   recovery control can disappear, clears the alert, then calls the existing
   guarded sign-out boundary exactly once.
7. A second failure refills the same alert and restores the same deliberate
   retry. Pending and failure are never visible or non-empty together.
8. Account utilities remain reachable without forcing a successful retry.
9. Nothing auto-retries, auto-dismisses, counts down, or invents a client-side
   timeout. A request that never settles is a separate cancellation problem.

## Real-code patterns to compare

| Pattern | Strength | Main risk | Disposition before captures |
| --- | --- | --- | --- |
| Existing floating alert | Full sentence remains visible. | Covers primary content and supplies no action. | Reject. |
| Reopen or retain the Account menu | The original Sign out row is present. | A large menu interrupts the child task, short viewports scroll, and failure focus lands on an unrelated first item. | Reject. |
| Replace Account with one focused retry control | Reuses the stable pending frame, preserves focus, fits narrow and dense routes, and makes retry immediate. | Temporarily removes the visible path to Account utilities and may overload one control with Account/menu/retry meanings. | Prototype; reject if Account access is lost or ambiguous. |
| Keep Account plus an adjacent compact retry | Preserves the familiar Account escape path and puts retry one Tab away. | Two targets consume scarce 280px header space; a short label may make the failure too implicit. | Prototype. |
| Put a sentence and button below Account | Keeps all recovery words visible together. | Recreates the exact vertical overlap at narrow and short viewports. | Reject unless a capture disproves the overlap. |
| Global banner, toast, or modal | Familiar in systems with an existing host. | Detached or interruptive, adds infrastructure, and competes with the child's task. | Reject. |

## Acceptance contract

Use held first and second failures at 280×568, 390×844, 640×360, and
1440×900, plus the dense 640×360 Lesson Player and one arbitrary long/RTL
identity.

1. One persistent alert owner changes from empty to **Sign out did not
   finish.** and is not remounted when Account opens or closes.
2. Account remains focused after failure. The visible retry is reachable in one
   logical step and Account utilities remain available without retrying.
3. A deliberate retry issues request two exactly once. Repeated pointer,
   Enter, Space, and same-task activation cannot overlap requests.
4. Retry immediately returns to the existing visible **Signing out…** pending
   state. A later failure restores the same recovery; confirmed session absence
   still replaces the authenticated shell.
5. Every target is at least Parrot's 44×44 CSS-pixel baseline. The complete
   visible focus paint, action, alert cue, route header, shelf heading, Lesson
   Player HUD, and speech remain unobscured.
6. The document has no horizontal overflow, including with arbitrary identity,
   200% zoom/text spacing, forced colors, reduced motion, and short landscape.
7. Sampled primary-content anchors move no more than one CSS pixel. Failure
   recovery does not cause cumulative layout shift in the child activity.
8. Failure-to-recovery DOM mutation and the next animation-frame callback keep
   the project's local 20-sample p95 target of at most 100 ms. Label this a
   local response proxy, not physical, field, or assistive-technology latency.
9. Rendered behavior is tested with accessible locators; no test asserts CSS
   source or Tailwind class names.

## Safety and measurement guardrails

Do not collect child identity, raw audio, transcripts, or request payloads for
this UI experiment. Useful aggregate events, if a privacy review later permits
them, are sign-out failure, visible retry activation, repeated failure, and
successful authenticated-shell exit. A high failure-to-retry abandonment rate
is a diagnostic, not a reason to pressure the user or auto-retry.

Before release, manually check one first failure and one repeated failure with
VoiceOver/Safari and NVDA/Chrome or Firefox. Verify announcement count, Account
focus, the retry's name, and Account-menu access. Automated role inspection
cannot substitute for those checks.

## Unresolved questions

- Does **Sign out did not finish** survive professional translation into the
  product's priority languages without implying a known server outcome?
- Do limited-English caregivers recognize **Try sign out again** faster than
  the shorter **Try again** when both appear at the Account locus?
- Can the chosen compact pattern keep the complete failure sentence visibly
  available without competing with the child task, or should the interface
  prioritize a specific visible recovery action plus an assertive sentence?
- What timeout or cancellation contract does Better Auth provide for a request
  that never settles? This branch must not invent one.

The next cheapest evidence is a real-code comparison at the required
viewports, followed by five task-based caregiver sessions in priority
languages. Ask participants to recover from the failure; do not ask which
design they prefer.
