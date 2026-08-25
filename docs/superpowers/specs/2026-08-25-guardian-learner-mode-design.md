# Guardian and Learner Modes Design

## Goal

Clearly separate the guardian and learner experiences within the existing
one-account, one-learner Parrot English model. The profile dropdown must show
the active identity and a mode switch directly beneath it. Learner mode must
contain only age-appropriate learning activities. Guardian mode must be the
place for profile, content, consent, privacy, and account management.

Entering guardian mode requires the current account password. Guardian access
lasts for at most 15 minutes, is enforced by the Worker, and can be ended
immediately by switching back to learner mode.

## Product Decisions

- One Better Auth account remains paired with one learner profile.
- The Better Auth user name and email identify the guardian/account holder.
- `learner_profile.name`, age, and description identify the learner.
- A normal authenticated session starts in learner mode.
- A successful password check unlocks guardian mode for that same auth session
  for 15 minutes. A refresh or another tab may resume the still-valid unlock.
- The unlock has a fixed expiry; ordinary activity does not silently extend it.
- Initial learner onboarding remains a shared setup exception. It is available
  before the learner profile is complete, but later profile editing and setup
  redo are guardian-only.
- Switching to learner mode calls the lock endpoint first. The UI must not claim
  it is locked until the server confirms the unlock was removed.
- Expiry or a `guardian_required` response returns the UI to a password gate.
  The current guardian URL is retained so a successful re-unlock resumes the
  intended screen.
- Existing learner activities stay child-first. No progress dashboard,
  multi-learner household model, PIN recovery flow, or publishing workflow is
  invented in this change.

## Approaches Considered

### 1. Client-only mode toggle

This is the smallest visual change, but it only hides links. The authenticated
session could still call profile, lesson-authoring, and personalized-art
mutation endpoints. It does not satisfy the requested separation.

### 2. Session-scoped guardian unlock (selected)

Use Better Auth's server-side password verification, store a short-lived unlock
against the current auth session, and guard both routes and mutation APIs. This
fits the current account model, survives a refresh during a guardian task, and
does not require a second credential system.

### 3. Separate guardian and learner accounts

This is appropriate for multiple learners, invitations, independent devices,
and long-lived role permissions. It would require a household data model,
account linking, invitations, recovery, migration, and a new authorization
system. None of those capabilities exists or is required for the current
single-learner product.

## Experience Model

### Shared profile control

The fixed header control uses the active profile rather than the generic word
"Account":

- learner mode: learner avatar/icon, learner name, and a small `Learner` label;
- guardian mode: shield/account icon, Better Auth user name, and a small
  `Guardian` label;
- compact widths: the visible name may collapse, but the accessible name still
  includes the identity and mode.

Opening the dropdown shows the active identity first. Immediately beneath it is
one segmented mode control with `Learner` and `Guardian` options. Selecting
`Guardian` while locked opens a password dialog. Selecting `Learner` while
unlocked performs the server lock and then navigates to the learner home.

Learner mode exposes no profile editing, data notice, sign-out, or account
deletion actions in the dropdown. Its only account-level action is the mode
switch. Guardian mode exposes the current account menu actions after the mode
switch: Learner profile, AI and saved data, Sign out, and Delete account.

The dropdown preserves its existing outside-click, Escape, focus-return, and
keyboard-navigation behavior. The segmented control has an explicit accessible
group label and selected state.

### Guardian unlock dialog

The dialog is titled `Unlock guardian mode` and explains that the password is
required to protect grown-up settings. It contains one password field, Cancel,
and Unlock actions.

- Password bytes are sent only to the same-origin unlock endpoint and are never
  stored in React state after the request completes.
- Incorrect passwords keep the dialog open and show one field-level error.
- Rate limiting shows a literal wait-and-retry message.
- Network failure keeps the app in learner mode.
- Success closes the dialog, announces `Guardian mode unlocked for 15 minutes`,
  and opens the requested guardian screen.
- Focus starts on the password field and returns to the mode control on cancel.

### Learner mode

Learner mode contains only:

- `/` — the four picture-led choices;
- `/talk-to-peppa` — learner-controlled conversation;
- `/lessons` — ready-made and guardian-created playable lessons;
- `/lessons/parrot/:lessonId[/scenes/:sceneNumber]` — lesson playback;
- `/lessons/my/:lessonId[/scenes/:sceneNumber]` — custom lesson playback;
- `/stories` — the story shelf at the guardian-selected level;
- `/stories/:storyId[/pages/:pageNumber]` — story reading;
- `/dubs/five-little-ducks` — private line-by-line rhyme recording and complete
  dub replay.

The learner lesson shelf removes `Grown-up: edit`, `Grown-up tools`, and `Make a
lesson`. The learner story shelf removes `Grown-up options`, story-level
management, photo upload, consent, generation, and deletion. Learners can still
play every saved custom lesson and view already-generated private art in its
story/lesson presentation.

A learner-mode deep link to a guardian route renders the guardian password gate
without briefly rendering protected content. Cancelling returns to learner
home.

### Guardian mode

Unlocking guardian mode opens `/guardian`, a calm grown-up dashboard. It uses
the guardian/account identity in the header and identifies which learner is
being managed. It contains four focused destinations:

1. **Learner profile** — name, age, description, and redo setup at `/profile`.
2. **My Lessons** — list existing custom lessons and create/edit them at
   `/guardian/lessons`, `/lessons/my/create`, and
   `/lessons/my/:lessonId/edit`.
3. **Story settings** — choose the learner's story level and manage optional
   personalized story art at `/guardian/stories`.
4. **Account and privacy** — points to the guardian-only profile dropdown for
   the existing AI/data notice, sign-out, and password-confirmed deletion.

Guardian screens do not duplicate the learner activity catalog. A prominent
`Switch to learner` action locks guardian mode and opens `/`. A custom lesson
may offer `Switch and play`; this performs the same lock before navigating to
the learner playback route.

## Capability Matrix

| Capability | Learner | Guardian | Server enforcement |
| --- | --- | --- | --- |
| Complete first-time learner setup | Yes | Yes | Authenticated session |
| Talk, play lessons, read stories | Yes | Switch to learner | Authenticated session |
| View saved custom lessons for playback | Yes | Switch to learner | Owner-scoped read |
| Edit learner profile or redo setup | No | Yes | Guardian unlock |
| Choose stored story level | No | Yes | Guardian unlock |
| Create/generate/import/update custom lessons | No | Yes | Guardian unlock |
| Upload a learner photo or generate/delete story art | No | Yes | Guardian unlock plus existing consent checks |
| View already-generated story art | Yes | Yes | Owner-scoped read |
| Open AI/data notice | No | Yes | UI boundary; read-only |
| Sign out | No | Yes | UI boundary; no destructive data effect |
| Delete account | No | Yes | Guardian UI plus existing password confirmation |

## Routing and Mode Boundaries

Add the canonical guardian routes `/guardian`, `/guardian/lessons`, and
`/guardian/stories`. Keep the existing `/profile`, lesson-create, and
lesson-edit URLs, but wrap them in the same guardian boundary.

The route boundary accepts a destination and one of three access states:

- `loading`: show a neutral session/access check without protected content;
- `learner`: show the guardian unlock screen for guardian URLs;
- `guardian`: render the guardian route.

When guardian access expires, guardian routes change to the unlock screen at
the same URL. Learner routes remain available only in learner mode; switching
from guardian to learner always routes to `/` unless `Switch and play` provides
a specific validated learner destination.

Safe `returnTo` parsing must add only the new known guardian routes. Existing
same-origin, path allow-list, lesson activity cleanup, and route focus behavior
remain intact.

## Browser State and Component Boundaries

`AuthGate` remains the owner of the persistent account header because it already
owns the authenticated session, sign-out, and deletion actions. Its signed-in
branch gains one guardian-access container that:

- loads `/api/guardian-access` for the current session;
- owns `loading | learner | guardian` state and `expiresAt`;
- provides unlock, lock, and expiry behavior to routes;
- receives the learner display name from `LearnerProfileGate` through the
  existing account-action registration seam;
- passes the active identity, mode switch, and allowed account actions to
  `AccountHeader`.

The existing account-action context is expanded rather than adding a parallel
header ownership system. Guardian-specific route components consume the same
access context; page components do not independently infer mode.

`HomeMenu` remains the learner home. Add a focused `GuardianDashboard`, a custom
lesson manager that reuses the existing My Lessons API/card presentation, and a
story-settings page that reuses `PersonalizedStoryArtPanel` and shared segmented
controls. Do not create page-specific copies of shared header or button styles.

## Server Authorization

### Data model

Add `guardian_session_unlock` with:

- `session_id` — primary key and foreign key to Better Auth `session.id` with
  cascade deletion;
- `unlocked_at` — required timestamp;
- `expires_at` — required timestamp and indexed for cleanup.

Add `story_level` to `learner_profile`, constrained to the four existing story
level IDs and defaulting to `first-words`. This is the learner's selected shelf,
not a general preferences framework.

Expired unlock rows are treated as absent and deleted lazily. No password,
password hash, guardian token, or mode history is stored.

### Guardian access API

Add same-origin authenticated `/api/guardian-access`:

- `GET` returns `{ mode: "learner" }` or
  `{ mode: "guardian", expiresAt: <ISO timestamp> }`;
- `POST` accepts only `{ password: string }`, applies a strict body limit and a
  guardian-unlock rate limit, invokes Better Auth's server-side
  `verifyPassword`, and upserts a 15-minute unlock for the current session;
- `DELETE` removes the current session's unlock and returns learner mode.

Every response is `Cache-Control: no-store`. Incorrect credentials use one
generic error and do not reveal account details. The unlock rate limiter uses
the authenticated user ID plus client address and permits five attempts per 60
seconds.

### Central guard

Add one `requireGuardianAccess(database, sessionId, now)` helper and call it at
the Worker dispatch boundary before:

- `GET` or `PUT /api/profile`;
- `PUT /api/profile/preferences`;
- `POST /api/lessons/my`;
- `POST /api/lessons/my/generate`;
- `PUT /api/lessons/my/:lessonId`;
- `POST` or `DELETE /api/stories/:storyId/personalized-art`.

Profile-edit conversations share `/api/conversations` with learner onboarding
and small chat, so their guard is purpose-aware inside the conversation
handler: starting a `profile-edit` conversation and reviewing/finalizing a
stored `profile-edit` conversation require guardian access. Initial onboarding
and `small-chat` remain learner-safe.

The guard returns `403` with `{ error: "guardian_required" }` for missing or
expired access. Owner scoping, body validation, provider rate limits, and photo
consent remain mandatory after the role check. Learner-safe reads remain
available: custom-lesson list/detail, story-art metadata/asset, learner setup,
conversation, story, lesson, and speech-evaluation APIs.

Account deletion remains protected by its existing second password entry. The
delete action is reachable only in guardian UI, but Better Auth remains the
authoritative deletion verifier.

## Story-Level Preference

`GET /api/learner-profile` includes the selected `storyLevel` so learner routes
can render the correct shelf. Guardian story settings save it through
`PUT /api/profile/preferences` with exactly `{ storyLevel }`.

The learner story shelf canonicalizes an invalid or mismatched `?level=` query
to the saved level. The guardian settings page may preview the number and names
of stories in each level, but it does not expose internal CEFR diagnostics or
prompt metadata.

## Error and Expiry Behavior

- Access-status load failure fails closed to learner mode and shows a retryable
  account-header error.
- Unlock failure never navigates to guardian content.
- Lock failure leaves guardian mode visibly active and shows `Could not lock
  guardian mode. Try again before handing over the device.`
- A guardian API `403 guardian_required` synchronizes the browser state to
  locked and opens the unlock boundary at the current guardian URL.
- The client schedules expiry from the server-provided timestamp and also
  rechecks status when the document becomes visible, preventing a suspended tab
  from displaying stale guardian state.
- Pending lesson audio/recording is cancelled before switching modes, using the
  existing lesson route-exit registry.
- Sign-out and session identity changes clear all local guardian state.

## Accessibility and Responsive UX

- Preserve accessible names when the visible active-profile label collapses.
- The mode control exposes one group label and selected state; it works with
  pointer, Tab, Enter, Space, and arrow-key navigation appropriate to the
  selected shared control.
- Unlock and deletion dialogs trap focus, restore focus, describe errors, and
  expose pending states without changing button width unexpectedly.
- Mode changes announce the new mode through a polite live region and move
  focus to the destination page heading.
- At 280–390 px, short landscape, and desktop, the route header and profile
  control remain visible, non-overlapping, and inside the viewport.
- Dropdown content scrolls within short viewports; the mode switch and active
  identity stay before guardian actions.
- No guardian control may be hidden only with CSS; disallowed actions are not
  rendered, and protected routes do not render before authorization.
- All new UI uses Tailwind 4 utilities, `src/shared/ui.tsx`, and
  `src/app/AppHeader.tsx` primitives in accordance with `AGENTS.md`.

## Verification Strategy

### Domain and Worker tests

- migration/schema constraints and session-cascade cleanup;
- exact 15-minute boundary, expired-row cleanup, lock, and session isolation;
- bounded unlock body, generic invalid-password response, and rate limiting;
- central guardian guard for every listed method/path;
- learner-safe GETs remain available and owner scoped;
- story-level validation and persistence;
- account deletion keeps its existing password and purge guarantees.

### React/lifecycle tests

- account identity derives from learner profile in learner mode and Better Auth
  user in guardian mode;
- allowed account actions are mode-specific;
- unlock, lock failure, expiry, visibility recheck, sign-out, and identity
  changes synchronize state;
- guardian boundaries never render protected children while locked;
- learner lesson/story pages omit every management action;
- guardian dashboard and managers expose every current management capability.

### Playwright behavior

Use accessible locators and rendered geometry only. Cover 280x568, 320x568,
390x844, 640x360, and 1440x900 where relevant:

- mode switch placement beneath the profile identity;
- password failure, successful unlock, 15-minute expiry, immediate lock, and
  focus return;
- mode persistence through navigation and refresh while the unlock is valid;
- direct guardian deep links show the unlock boundary without content flash;
- direct learner routes from guardian mode require switching back;
- learner mode has only learner activities and no management/account actions;
- guardian mode has profile, lesson, story, privacy, sign-out, and deletion
  management;
- header/back controls, focus paint, dropdown, dialogs, player HUD, and speech
  controls do not overlap or overflow at required viewports.

Required final gates are:

```bash
npm test
npm run lint
npm run build
npm run test:browser
```

## Migration and Compatibility

- Existing users receive `story_level = "first-words"` and no guardian unlock,
  so they start safely in learner mode after deployment.
- Existing URLs remain valid. Guardian-only URLs now stop at the password gate.
- No existing learner profile, custom lesson, conversation, or story-art record
  is rewritten.
- The new unlock table cascades with Better Auth sessions and contains no
  durable guardian profile data.

## Out of Scope

- multiple learners or guardians per account;
- child credentials, invitations, or separate login screens;
- PIN setup, recovery, or biometrics;
- progress analytics or reporting;
- lesson publishing, approval, deletion, or scheduling;
- persistent guardian role history or audit logging;
- a general preferences framework beyond the selected story level.
