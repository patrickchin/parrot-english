# Account sign-out feedback guidance

Date: 2026-08-24

Status: implementation input; real-code visual prototypes under review

Baseline commit: `5dce79a`

## Question

How should Parrot acknowledge a slow **Sign out** request immediately after the
Account menu closes, without moving the child activity, inviting duplicate
requests, adding confirmation friction, or hiding the state from assistive
technology?

The Account menu is a grown-up surface inside a product for young English
learners. The copy can therefore address a caregiver, but it should remain
short, literal, and usable by someone with limited English.

## Recommendation boundary

Keep routine sign-out direct and use exactly **Signing out…** while it is
pending. The words repeat the action's existing label, describe an unfinished
operation, and avoid technical **session** language. Pair them with a waiting
icon, but never make motion or the icon the only cue. Do not add **Please
wait**, a countdown, a confirmation dialog, or a minimum display duration.

The pending message should appear in the persistent top-right Account locus by
the next painted frame, while the menu closes. The Account trigger should keep
focus, become temporarily unavailable with authored `aria-disabled` behavior,
and reject activation. A pre-mounted polite atomic status should expose the
same state without receiving focus. The status must not sit inside an
`aria-busy=true` ancestor because assistive technology may defer descendant
changes while that ancestor is busy.

Pending must last until one of two truthful boundaries:

- a failure result restores Account and exposes the existing alert; or
- the authenticated shell disappears after the session is confirmed absent.

Do not clear pending merely because the sign-out request promise resolved. A
fast destination is sufficient success feedback; intentionally delaying the
login screen would only make a fast exit slower.

## Repository audit

At the baseline, `AccountHeader.selectAction` closes the menu before invoking
`onSignOut`. The only conditional **Signing out…** text is inside that removed
menu. `AuthGate.handleSignOut` sets `isSigningOut`, awaits `signOutSession`, and
clears the flag in `finally`. The persistent Account trigger does not change
and remains operable. The Account `<aside>` alone gets `aria-busy=true`; that
attribute has no visible output and is not a live status.

The installed Better Auth 1.6.23 client adds a session signal after a successful
`/sign-out`. Parrot also calls `refetch()` explicitly. In a held-session local
experiment, those paths produced two session reads; the signal-driven read
aborted the explicit read, its promise settled, and Parrot cleared pending
before the winning session read had finished. This is an observed interaction
between the installed dependency and Parrot's lifecycle, not a general claim
about every Better Auth version.

## Delayed baseline

A local Chromium proxy held `/api/auth/sign-out` for 3,500 milliseconds on the
signed-in `/lessons` route. The capture used the E2E identity **Mia** and sampled
280x568, 390x844, 640x360, and 1440x900 CSS-pixel viewports at device-pixel
ratio 1.

- The menu disappeared in the first observed frame, about 18–19 ms after the
  DOM activation boundary.
- The request began about 36–46 ms after pointer activation.
- Samples around 275 ms and 750 ms were visually indistinguishable from the
  ordinary lesson shelf: Account looked enabled and no pending words existed.
- Success or failure appeared only around 3,549–3,584 ms.
- Pointer and keyboard paths left `<body>` focused after the menu item was
  removed.
- Account could be reopened during the wait. Only then was the disabled
  **Signing out…** row visible; unrelated menu actions remained enabled.
- The ordinary pointer path issued one request, but `handleSignOut` has no
  synchronous operation lock for same-task or programmatic re-entry.
- No content layout shifted. The current outside failure alert is absolute,
  but it covers all of **Pick a lesson** at 280x568, about 85% at 390x844, and
  about 26% at 640x360.

These are deterministic local observations, not physical input latency, field
INP, screen-reader announcement timing, low-end-device performance, or child
and caregiver comprehension results.

## Source-to-design mapping

| Evidence | Product inference | Limit |
| --- | --- | --- |
| W3C's [Understanding Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) includes application waiting states and asks that status changes which do not take focus be programmatically determinable. See A11Y-10. | Give the visible pending words a programmatic status equivalent without moving focus to the message. | The Understanding page is informative and does not require authors to invent a message where none is displayed. |
| WAI-ARIA defines [`status`](https://www.w3.org/TR/wai-aria-1.2/#status) as polite, atomic advisory information that should not receive focus; [ARIA22](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA22) tests a status container that exists before its text changes. See A11Y-07 and A11Y-08. | Keep one empty status mounted before activation, then replace its whole text with **Signing out…**. | Markup inspection cannot prove a particular browser and assistive-technology announcement. |
| WAI-ARIA says [`aria-busy=true`](https://www.w3.org/TR/wai-aria-1.2/#aria-busy) can cause descendant changes to be withheld until busy becomes false. See A11Y-10. | Remove the current busy Account ancestor rather than wrapping the live status in it. | `aria-busy` remains appropriate for batching some DOM updates; it is wrong here because the message itself is ready. |
| W3C COGA recommends recognizable feedback and stable controls/content. See A11Y-03 and A11Y-11. | Use the fixed Account locus and an overlay or contained replacement; do not insert a new row into the child activity. | COGA is supplemental and does not validate Parrot's exact placement or words. |
| GOV.UK documents slow feedback and repeated activation as causes of duplicate submissions. See UX-03. | Add immediate feedback plus both an authored UI guard and a synchronous domain guard. | Server-side idempotency and session revocation remain separate boundaries. |
| WAI-ARIA, HTML, and APG distinguish authored `aria-disabled` behavior from native disabled controls. See A11Y-13 and A11Y-28. | Keep the Account trigger focusable while its action is unavailable, guard click and key paths, and retain visible focus. | Focusable unavailability is a contextual Parrot choice, not a universal rule. |
| Current [INP guidance](https://web.dev/articles/inp) says initial visual feedback belongs in the next painted frame, while eventual network work is outside that initial response. See PERF-01 and PERF-02. | Require the pending state before a held request is released and measure a two-frame local settlement proxy. | The 200 ms field threshold is page-level; Parrot's 100 ms target is a heuristic, not a WCAG or child-development limit. |
| GOV.UK One Login separates ordinary direct sign-out from a special unsaved-progress interruption. See UX-10. | Do not add universal confirmation. Audit dirty lesson creation and editing as a separate exit-safety problem. | The service patterns do not establish Parrot's exact workflow. |

## Real-code patterns to compare

| Pattern | Strength | Main risk | Current disposition |
| --- | --- | --- | --- |
| Inline Account state | The focused trigger itself becomes a spinner plus **Signing out…**; one visual locus and no extra overlay. | Its width grows below the `wide` breakpoint and its temporary accessible identity changes. | Real-code isolated prototype; require header-clearance and label-in-name checks. |
| Adjacent Account status | Account geometry and identity stay fixed; a separate visible `role=status` can sit immediately left. | Two simultaneous surfaces may feel redundant, and focus paint consumes the first eight pixels of their gap. | Real-code isolated prototype; require at least 12 px border-to-border separation. |
| Compact status below Account | Reuses the current pending/error anchor and keeps status semantics visually direct. | That vertical zone already overlaps the lesson heading at narrow and short sizes. | Keep only if an actual compact capture beats the horizontal candidates. |
| Keep the menu open | The original action row can retain focus and change in place. | A large overlay covers the child activity for the whole request and short-landscape recovery already scrolls. | Reject for this branch. |
| Global toast or modal | Familiar infrastructure in products that already own a toast/dialog system. | Parrot has no toast host; either option adds a detached locus or unnecessary interruption. | Reject. |

## Acceptance contract

Use held success and failure requests at 280x568, 390x844, 640x360, and
1440x900, plus one dense lesson-player route.

1. Before release, the menu is hidden and exactly one visible **Signing out…**
   message exists.
2. One pre-mounted `role=status` has `aria-atomic=true`; no busy ancestor can
   defer it.
3. The Account trigger retains focus, reports authored unavailability, and
   cannot open the menu or start a second request by pointer, Enter, Space,
   double click, or two same-task programmatic calls.
4. Pending remains present after the sign-out response while session
   confirmation is held. It ends only on failure or authenticated-shell
   replacement.
5. On failure, Account becomes available, retains focus, the status clears,
   and one alert appears. One deliberate retry may issue request two.
6. The Account target remains at least 44x44 CSS pixels. Pending content and
   focus paint stay inside the viewport and do not overlap a route control.
7. Primary content anchors, document scroll extent, and header controls move
   no more than one CSS pixel. There is no horizontal overflow.
8. Forced colors preserves a real focus outline. Reduced motion removes the
   spinner animation without removing the icon or words.
9. The pending update settles before two animation frames in the local harness;
   record median and p95 over 20 samples without calling the result physical
   or field latency.
10. Success still routes to the safe login return target. Failure still permits
    a deliberate retry. No timer, extra request, or artificial navigation
    delay is added.

## Evidence boundary and follow-ups

Browser and DOM checks cannot prove actual speech output. Manually check one
pending announcement, status/focus order, and one failure announcement with
VoiceOver/Safari and NVDA/Chrome or Firefox before treating assistive output as
verified.

This work does not establish that a five-year-old or weak-English caregiver
understands **Signing out…**. A later study should use preferred-language task
instructions, record English-reading level separately from age, and compare
action recognition rather than asking whether participants like the design.

Successful sign-out currently leaves focus on `<body>` after the authenticated
route-focus manager unmounts. Failure recovery lacks a direct retry and its
alert overlaps narrow headings. Unsaved lesson creation/editing also needs one
cross-route exit audit. Those are adjacent improvements, not reasons to hide
the pending-state fix inside a larger rewrite.
