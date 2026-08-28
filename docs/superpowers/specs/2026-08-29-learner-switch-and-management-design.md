# Learner switch and management design

Date: 2026-08-29

## Goal

Separate learner administration from learner-mode selection.

- `Manage learners` creates, edits, and deletes learner profiles.
- Entering learner mode is the only UI that chooses which learner will use the
  session.
- The choice and the mode switch are visibly connected in one focused flow.
- Individual deletion removes only the chosen learner and their private data,
  without exposing sibling data or leaving late uploads behind.

## Interaction model

### Manage learners

`/guardian/learners` presents a roster with no current-selection badge, no
`Use in learner mode` action, and no `Managing …` heading. Each learner card
has two Guardian-only actions:

1. `Edit {name}` opens `/guardian/learners/:learnerId`.
2. `Delete {name}` opens a confirmation dialog.

The page keeps the existing inline `Add learner` form. Adding a learner remains
non-activating and opens that learner's details route. Editing remains targeted
by learner ID and never changes the learner-mode selection.

The delete dialog names the learner, describes the learner-scoped data that
will be removed, and requires a second explicit destructive action. It explains
that the Guardian account and other learners remain. The final learner cannot
be deleted; its card explains that another learner must be added first.

### Switch to learner

The Guardian dashboard's `Switch to learner` action opens a modal titled
`Who is learning now?`. The same chooser is used when an unlocked Guardian
reaches a learner-only route.

The chooser loads the protected learner roster and initially selects nobody,
even when a learner is already active. The Guardian chooses one learner in a
radio group, then presses one adjacent primary action labelled
`Start learner mode as {name}`. This makes the temporary choice and its result
visible in one place. Cancel changes neither learner selection nor Guardian
access.

On confirmation, the app selects the chosen learner using the existing
cross-tab-safe mutation, then locks Guardian access, then navigates to the
requested learner destination. Selection must happen before locking because
the roster mutation requires live Guardian access. If locking fails after a
successful selection, Guardian mode remains open and the dialog reports the
failure; it does not claim that learner mode started.

An empty roster cannot normally occur because deleting the final learner is
rejected. The chooser still handles it defensively by linking to
`Manage learners`.

## Client structure

Add a shared `LearnerModeSwitchDialog` built from Tailwind utilities,
`ActionButton`, and `useDialogFocus`. It owns roster loading, local radio
selection, pending/error feedback, and focus restoration. It receives the
destination callback from either `GuardianDashboard` or
`LearnerModeBoundary`.

`GuardianLearnerProfiles` loses its selection handler and selection-oriented
presentation. It gains a delete dialog and calls a learner-deletion operation
exposed by `LearnerProfileGate`. The gate owns deletion reconciliation so an
active learner deletion clears shared learner state and notifies sibling tabs
through the existing learner-selection channel.

The browser API adds:

```text
DELETE /api/learner-profiles/:profileId
```

It returns the authoritative roster. A successful response validates exactly
as list, create, and select responses do.

## Deletion safety model

Individual learner deletion is a durable, fail-closed operation, not a raw
foreign-key cascade.

Add `learner_profile_deletion_tombstone`, keyed by learner profile ID and an
opaque account hash. It stores whether the learner owns legacy storage, the
deletion generation and time, and the exact R2 closure needed for retries. The
tombstone survives deletion of the learner and account rows.

Add a session-scoped `learner_selection_required` marker. Starting deletion
creates this marker for every session that selected the learner before those
selection rows cascade. Identity resolution checks the marker before its
single-profile compatibility fallback, so deleting one learner never silently
activates a sibling. A later explicit chooser selection clears the marker.

Starting deletion atomically verifies all of the following:

- the profile belongs to the authenticated account;
- it is not already deleted by another account;
- at least one other non-deleting learner remains;
- concurrent deletions cannot both remove the final learner.
- no conversation for that learner is starting or active.

Once tombstoned, roster and identity resolution treat the learner as
unavailable. New selections, targeted settings mutations, conversations,
voice uploads, recordings, and story-art generation cannot start for it.
Existing deletion attempts resume idempotently.

Before the profile row is cascaded, cleanup records and fences the full storage
closure:

- the learner's `learners/{profileId}/` subtree;
- current and retired dubbing marker/line slots;
- every listed lesson-recording upload slot;
- current, previous, and candidate personalized-art keys;
- for the original legacy owner only, the account-root dubbing, recording, and
  compatibility art namespaces and null-owned compatibility rows.

The implementation reuses the bounded retry and conditional-fence primitives
from account deletion. It must never sweep a sibling learner's subtree and
must never promote a sibling to legacy storage owner. A busy learner returns a
retryable conflict instead of introducing a second LiveKit room-termination
protocol; conversation creation atomically refuses a tombstoned learner. Any
external cleanup failure leaves the tombstone and profile in a retryable,
inaccessible state.

Whole-account deletion includes unfinished learner-deletion closures so its
existing permanent fences remain complete under concurrency.

## Worker contract

`DELETE /api/learner-profiles/:profileId` requires an authenticated session and
current session-specific Guardian access. Missing, foreign, malformed, encoded
slash, or oversized IDs return the same generic `404`. Deleting the only
remaining learner returns `409 { error: "last_learner" }`.
Deleting a learner with a starting or active conversation returns
`409 { error: "learner_busy" }` before deletion begins.

On success the Worker returns the remaining roster. If the deleted learner was
selected, the returned active profile is `null`; the Worker does not silently
select a sibling. The next learner-mode entry uses the chooser.

## Accessibility and responsive behavior

- The chooser and delete confirmation use modal dialog semantics, trapped
  focus, Escape/backdrop cancellation while idle, and return focus.
- Learner choices use a labelled radio group and retain full accessible names
  when labels wrap or visual text is compacted.
- Pending operations disable all conflicting actions and expose one polite
  status; failures use an alert and preserve a retry path.
- Roster cards and dialogs must remain contained at 280–390 px, short
  landscape, and desktop sizes.

## Test strategy

Follow RED-GREEN-REFACTOR.

1. Rendered/browser tests prove Manage learners exposes Add/Edit/Delete and no
   learner-mode selection control or current-selection badge.
2. Chooser tests prove opening is non-mutating, Cancel is non-mutating, and
   confirmation selects before lock and navigates only after both succeed.
3. Cross-tab and selection-required tests move their selection setup to the
   chooser and retain the existing fail-closed mutation coverage.
4. Client API and Worker auth tests cover the exact DELETE contract.
5. Worker deletion tests cover ownership, malformed IDs, final-learner
   rejection, concurrent deletions, active selection clearing, sibling
   preservation, legacy compatibility cleanup, R2 retry/fencing, held
   dub/recording/art writes, busy-conversation rejection, retry after partial failure, and
   concurrent whole-account deletion.
6. Run the complete unit/lifecycle suite, Playwright suite, lint, Worker/app
   builds, and responsive focused checks before integration.

## Deliberate limits

- The final learner cannot be deleted in this iteration.
- A successful learner choice followed by a Guardian-lock failure is not
  transactional; the dialog remains in Guardian mode and reports the failure.
  Combining both operations would require a larger server session contract.
- Learner IDs remain internal route/API identifiers; the UI always names the
  learner rather than displaying the ID.
