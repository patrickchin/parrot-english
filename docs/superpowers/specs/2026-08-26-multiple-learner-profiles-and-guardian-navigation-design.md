# Multiple Learner Profiles and Reliable Guardian Navigation

## Goal

Allow one authenticated Guardian account to own and manage multiple isolated
learner profiles while keeping learner mode strictly learner-only. Guardian
management must remain password protected, every Guardian route must have a
reliable path back to the Guardian dashboard, and all personalized data must be
bound to the correct learner.

This design extends the existing strict Guardian/learner separation rather
than replacing its session-scoped password boundary.

Where earlier product or implementation documents list multiple learners as a
non-goal, this approved design supersedes that limitation. Those documents must
be updated with the implementation so the shipped architecture has one
authoritative ownership model.

## Product invariants

1. One Better Auth user is the Guardian account and may own multiple learner
   profiles.
2. One authenticated browser session has at most one active learner.
3. Only a live Guardian unlock may list, create, or select learner profiles.
4. Learner mode never renders sibling names, profile selection, editing,
   content authoring, consent, privacy, or account controls.
5. Every learner-created or learner-personalized record belongs to exactly one
   learner profile.
6. Authentication, Guardian unlock, rate limits, tombstones, and whole-account
   deletion remain account- or session-scoped.
7. The server resolves the active learner. Learner-facing clients do not choose
   a profile by supplying an arbitrary ID.
8. A conversation is permanently bound to the learner that started it, even if
   the Guardian later changes the active learner.
9. Missing or corrupt multi-learner selection fails closed rather than exposing
   a guessed sibling.
10. Existing accounts retain their current profile and personalized data without
    requiring a user-visible migration.

## Considered architectures

### 1. Session-selected normalized learner ownership (selected)

The account owns many profiles, and a server-side selection row binds the
current auth session to one owned profile. Existing learner APIs remain
implicit: they operate on the server-resolved active learner.

This provides real sibling isolation, independent selections on different
devices, stable learner URLs, and limited frontend churn.

### 2. Account-global active learner

An active profile stored on the Guardian account would be simpler, but changing
the learner on one device would unexpectedly change another device. Concurrent
Guardian and learner use would become confusing and unsafe.

### 3. Explicit profile IDs in every URL and API

Routes such as `/learners/:id/lessons` would make ownership visible, but would
rewrite nearly every client and handler and turn every request into a broader
IDOR boundary. The learner-facing app does not need simultaneous sibling views.

## Guardian and learner UX

### Learner mode

The account trigger identifies only the active learner. Its menu contains one
password-protected `Grown-up access` gateway and no sibling information.

Learner mode may access only:

- the learner home;
- learner conversation practice;
- ready-made and saved-lesson playback;
- story reading at the active learner's stored level;
- Five Little Ducks recording and replay after consent;
- the one-time friendly learner introduction for an incomplete active profile.

After onboarding is complete or bypassed, all profile changes remain
Guardian-only.

When an account has multiple learners but a new session has no selection, the
learner app shows a calm `Ask a grown-up to choose a learner` state. It does not
show the roster. The grown-up gateway unlocks Guardian mode and opens the
learner manager.

### Guardian learner manager

Add `/guardian/learners` as the canonical Guardian-only manager. It lists owned
profiles in stable creation order. Each card shows:

- preferred name;
- age when available;
- setup status;
- a `Current learner` badge when selected;
- `Use this learner` when inactive;
- `Manage details`.

An inline `Add learner` form asks only for a preferred name. Creation selects
the new learner for the current session and opens the Guardian details editor.
The Guardian can finish the details or deliberately switch to learner mode so
the learner can complete the friendly introduction.

Managing an inactive learner first selects it, refreshes active-profile state,
then opens:

```text
/guardian/profile?returnTo=/guardian/learners
```

Individual learner deletion is not exposed in this release. It requires a
separate per-profile tombstone, an R2 sweep, and upload-generation fences
equivalent to account deletion. Wrong details remain editable, and whole-account
deletion still removes every learner.

### Guardian navigation and identity

Every Guardian management page displays a shared `Managing {learnerName}`
context label. This includes learner details, custom lessons, lesson creation
and editing, story settings and personalized art, and dubbing consent/deletion.

The Guardian account menu contains:

1. `Guardian dashboard`;
2. `Learner profiles`;
3. `Manage {learnerName}'s details`;
4. `Switch to {learnerName}`;
5. AI/data, sign-out, and account-deletion actions.

The full roster does not appear in the dropdown. A dedicated page avoids
accidental profile changes during unsaved work and remains usable at narrow
viewports. Selecting a learner stays in Guardian mode. Only `Switch to
{learnerName}` locks Guardian access and opens learner home.

Successful selection announces `Now managing {learnerName}` in a stable live
region. A failed selection leaves the previous learner and route intact and
restores focus to the initiating control.

## Route repairs

The current navigation traps are part of this work, not a follow-up.

### Guardian return targets

Guardian-owned profile routes accept only validated Guardian-management return
targets. Missing, blank, malformed, external, learner-mode, self-referential,
or unknown targets fall back to `/guardian`.

Profile Back, Cancel, Save, setup completion, load-error recovery, and form-mode
redo all use that Guardian return policy.

### Lesson authoring

Custom lesson creation and editing are Guardian-owned flows:

- Back returns to `/guardian/lessons`;
- successful Save returns to `/guardian/lessons`;
- playback remains the manager's explicit `Switch and play` action, which locks
  Guardian mode before entering the learner route.

### Mode mismatch and wildcard routes

When Guardian mode reaches a learner route, the boundary provides both:

- `Back to Guardian dashboard`, which preserves Guardian mode; and
- `Switch to learner mode`, which locks first and then opens the learner route.

Wildcard routing is mode aware: Guardian mode falls back to `/guardian`, while
learner mode falls back to `/`. No fallback may strand an unlocked Guardian at
a learner-only boundary.

The form-based `/guardian/profile/setup?redo=1` path must render the setup flow
instead of falling through to the route's null element.

### Incomplete profiles

Guardian routes remain available when the active learner is incomplete. The
profile gate distinguishes:

- whether authenticated/Guardian management may render; and
- whether learner activities may render for the selected learner.

Switching an incomplete learner to learner mode opens that learner's setup.

## Server identity and API boundary

Split the current implicit identity into two concepts:

```text
AccountIdentity
  sessionId
  userId
  userName

LearnerIdentity
  AccountIdentity fields
  learnerProfileId
  learnerName
  legacyStorageOwner
```

After Better Auth validates a session, one central resolver loads the
session's selection and proves that the selected profile belongs to the same
user. Learner-data handlers receive `LearnerIdentity`; account deletion,
Guardian access, and account-scoped rate limiting continue to use
`AccountIdentity`.

The Worker adds Guardian-protected management endpoints:

```text
GET  /api/learner-profiles
POST /api/learner-profiles
PUT  /api/learner-profiles/:profileId/active
```

`GET` returns the stable roster and active profile ID. `POST` accepts a bounded
preferred name, creates an incomplete profile, and selects it atomically for
the current session. `PUT` performs an ownership-checked selection. A foreign
or missing profile returns a generic 404.

Existing endpoints retain their public shapes and operate on the active
learner:

- `/api/learner-profile` and `/api/profile`;
- `/api/lessons/my`;
- `/api/conversations`;
- personalized story-art routes;
- Five Little Ducks status, audio, upload, consent, and reset routes.

The active profile response includes its immutable profile ID. Client state is
keyed by that ID so a selection change aborts stale operations and remounts
learner-specific surfaces.

### Selection behavior

- Existing sessions are backfilled to their existing learner.
- A new session with exactly one learner may select that learner automatically.
- A new session with multiple learners and no selection returns an explicit
  `learner_selection_required` state.
- A stale, corrupt, or ownership-mismatched selection fails closed and requires
  Guardian selection.
- Creation and selection require a live session-specific Guardian unlock.
- Selection changes only the current Better Auth session.

## Data ownership

| Data | Scope after migration |
| --- | --- |
| Better Auth user/account | Guardian account |
| Better Auth session | Guardian account session |
| Guardian unlock | Session |
| Session active learner | Session plus owned learner |
| Learner profile and story level | Learner |
| Onboarding bypass | Session plus learner |
| Custom lessons | Learner |
| Conversation sessions | Learner, fixed at creation |
| Conversation turns and facts | Inherit conversation learner |
| Personalized story art and generation lease | Learner plus story |
| Dub consent and saved voice clips | Learner |
| Rate limits | Guardian account plus existing IP dimensions |
| Account-deletion tombstone | Guardian account |
| Static lesson/story/catalog content | Global |

Child tables retain the account user ID through the compatibility window and
gain `learner_profile_id`. Composite ownership constraints ultimately ensure
that `(learner_profile_id, auth_user_id)` references a profile owned by that
same account. Retaining the user ID keeps account-deletion queries efficient and
supports the staged rollout.

`conversation_session.learner_profile_id` is immutable after creation. Browser
reads additionally require the currently selected learner. Trusted LiveKit
agent turns and finalization use the conversation row's stored learner and
never resolve a later session selection.

## Migration and deployment

The live Worker relies on singleton conflict targets, so this is an
expand/compatibility/enable/contract rollout rather than a one-shot destructive
migration.

### Stage 1: expand

Add an expansion migration that keeps every old table and unique index usable:

- mark exactly one existing profile per account as `legacy_storage_owner`;
- add a unique `(learner_profile.id, auth_user_id)` ownership key;
- add nullable `learner_profile_id` columns to learner lessons, conversations,
  and personalized art;
- backfill them through the still-unique existing profile owner;
- create `session_learner_selection` and backfill existing sessions;
- create profile-specific onboarding-bypass, dub-consent, and art-lease tables;
- add per-profile indexes while retaining old singleton indexes.

Create a default legacy profile for any exceptional Better Auth user that has
no profile before backfilling. Existing profile IDs never change.

### Stage 2: compatibility Worker

Deploy code that:

- resolves the active learner centrally;
- writes a learner profile ID on every personalized child row;
- treats rows written with a null learner ID during the migration/deploy gap as
  belonging only to the marked legacy learner;
- lazily creates selections for sessions created during that gap;
- no longer depends on singleton conflict targets;
- keeps second-learner creation disabled.

The compatibility version becomes the production rollback floor.

### Stage 3: enable

After the compatibility Worker is fully deployed:

- repeat backfills to catch gap writes;
- assert that no learner-owned row or live session remains unmapped;
- remove singleton profile and art uniqueness;
- deploy the roster/create/select UI and enable second-learner creation.

The locally merged history includes both stages, but deployment documentation
must identify and deploy the intermediate compatibility commit before the final
enable commit. Cloudflare D1 applies all pending migration files, so production
must not first encounter both stages while the original singleton Worker is
live.

### Stage 4: contract

After the rollback and session-expiry window, a later migration may rebuild
tables to make learner IDs non-null, install final composite foreign keys, and
retire the old bypass/consent/lease structures. Contracting is not required to
deliver the user-facing feature.

## Private R2 storage

### Personalized story art

Existing rows already store their exact R2 object key. Migration preserves that
key. New generations use a learner-specific subtree beneath the account prefix.

### Dubbing

Dubbing keys are currently derived from only the account user ID. Only the
profile marked `legacy_storage_owner` may read, replace, or reset existing
user-level v1/v2 dub objects and migrated consent.

New learners use:

```text
personalized-story-art/{encoded-user-id}/learners/{learner-profile-id}/
  learner-dubs/{dub-id}/...
```

No non-legacy learner probes the old account-level dub path. Consent and reset
generations are independent per learner.

Whole-account deletion retains the existing encompassing account-prefix sweep
and adds marker/slot fences for every learner subtree. The Worker loads learner
storage identities before removing the database user so concurrent late
uploads cannot recreate private recordings after deletion.

## Error handling and concurrency

- Roster load errors retain a retryable Guardian page and do not reveal partial
  data in learner mode.
- Create/select failures do not change the active learner, mode, or route.
- A selection response that becomes stale is ignored and followed by an
  authoritative reload.
- Profile selection aborts learner-profile, lesson, conversation, art, and dub
  requests owned by the previous profile before rendering new data.
- A lesson ID owned by a sibling returns 404.
- An active conversation cannot be reused by a sibling and finalizes only its
  stored learner.
- Art generation and dub reset leases/generations are profile-specific.
- Account deletion remains account-scoped and continues to fence all writes
  regardless of active learner.
- Account-level rate limits prevent profile creation from multiplying provider
  quotas.

## Accessibility and responsive behavior

- The roster uses semantic headings, lists/cards, buttons, labels, and a stable
  live region.
- `Current learner` is text, not color alone.
- Successful selection moves focus predictably and announces the new context.
- Failed selection retains focus and exposes one accessible alert.
- The Guardian account menu and all shared headers keep accessible names when
  visible labels shorten.
- The roster, account menu, route boundaries, and active-learner context are
  tested at 280x568, 320x568, 390x844, 640x360, and desktop widths for overlap,
  wrapping, containment, scrolling, and horizontal overflow.

## Verification strategy

### Migration and schema

- Apply all existing migrations, seed realistic singleton data, then apply the
  expansion migration.
- Prove deterministic backfill for users with and without profiles, sessions,
  bypasses, lessons, conversations, art, leases, and consent.
- Simulate writes from the old Worker during the expansion/deploy gap and prove
  the enable migration catches them.
- Preserve exact legacy R2 keys and generations.
- Run `PRAGMA foreign_key_check` and inspect the final indexes.

### Worker and repository isolation

- Guardian-only roster, create, and select; foreign profile IDs return 404.
- Two sessions for one account can select different learners independently.
- Profile answers, bypasses, story level, and edits affect only the selected
  learner.
- Lesson list/get/create/update cannot cross sibling profiles.
- Conversation reuse, initial profile state, browser access, trusted-agent
  turns, and finalization remain bound to one learner.
- Story-art rows, object keys, leases, regeneration, and deletion are
  independent for the same story across siblings.
- Legacy dub audio is visible only to the legacy learner; new learners have
  separate consent, status, upload, replay, and reset generations.
- Account deletion sweeps and fences legacy plus all learner prefixes under
  concurrent upload races.

### Browser and routing

- Add, select, refresh, and manage two learners.
- Prove learner mode contains no sibling names or grown-up actions.
- Prove `/guardian/learners` and every management deep link require password.
- Prove incomplete learners do not block Guardian pages and route to setup in
  learner mode.
- Prove creator/editor Back and Save remain in Guardian navigation.
- Prove missing/invalid profile returns, unknown routes, and Guardian-on-learner
  boundaries always provide a dashboard escape.
- Prove form-mode redo never renders blank.
- Prove stale selection work is cancelled and focus/live announcements are
  correct.
- Exercise the required responsive viewports with accessible Playwright
  locators.

### Required final gates

Run in order:

```bash
npm test
npm run lint
npm run build
npm run test:browser
```

## Non-goals

- learner-visible sibling selection;
- multiple Guardian identities or household invitations;
- a separate Guardian PIN or credential;
- individual learner deletion before race-safe D1/R2 cleanup exists;
- avatars, colors, profile themes, or other customization unrelated to safe
  identity selection;
- simultaneous multi-learner views in one browser session;
- changing the 15-minute Guardian unlock lifetime.
