# Guardian information architecture and learner targeting design

Date: 2026-08-26

## Problem

Guardian mode currently uses the session's active learner as an invisible global
editing target. Opening an inactive learner's details first changes that active
learner, then opens a generic profile route. The same implicit target flows into
lessons, stories, and dubbing. This makes a read or edit action unexpectedly
change who enters learner mode.

The Guardian dashboard compounds the problem: Learner profiles and Learner
details are duplicate destinations, all six cards have nearly identical visual
weight, Account and privacy is a dead end, and the account menu repeats most of
the dashboard while exposing account deletion. Shared controls and interactive
cards also move upward on hover.

Live signed-out route and authentication checks were clean. Authenticated local
E2E reproduced the hidden learner mutation. The apparent `Mia` header versus
`Noah` editing context is not stale state: `Mia` is also the fixture's Guardian
account name. The fixture must use distinct Guardian and learner names so these
identities cannot be confused.

## Product model

Two learner concepts must remain independent:

1. **Learner mode profile** — the learner who will use the child-facing app on
   this browser session. Only an explicit **Use in learner mode** action changes
   it.
2. **Guardian editing target** — the learner whose settings are visible on the
   current Guardian page. It is page-local, visible in the UI, and encoded in
   the URL. Changing it never changes the learner mode profile.

Guardian identity is also separate. In Guardian mode the account trigger names
the Guardian account, while learner-scoped pages name the editing target in the
page itself.

## Information architecture

### Profile menu

Guardian mode contains exactly four primary actions:

- Guardian dashboard
- Manage learners
- Account & privacy
- Sign out

It does not contain a learner-details shortcut, learner-mode switch, AI modal,
or Delete account. Learner mode retains only the password-protected Grown-up
access action.

### Guardian dashboard

The dashboard uses three visually distinct groups:

- A featured **Manage learners** destination. It shows which profile is used in
  learner mode and is the sole place to add learners, edit their core details,
  or choose the learner-mode profile.
- **Learning & content** destinations for My Lessons, Story settings, and Voice
  dubbing. Each has a distinct icon, accent, and action label.
- A separate **Account & privacy** destination for data explanations and
  account controls.

The top-level **Switch to learner mode** action remains on the dashboard. It
does not belong in the profile menu.

### Manage learners

`/guardian/learners` lists every learner. Copy explicitly distinguishes editing
from learner-mode selection. Every card provides:

- **Edit profile**, which opens `/guardian/learners/:learnerId` without changing
  session selection.
- **Use in learner mode** for inactive learners, which is the only selection
  mutation.
- A clear **Learner mode** badge on the selected learner.

Adding a learner does not silently select it. The new learner opens in the
explicit details route. Selecting it for learner mode remains a separate
choice.

The legacy `/guardian/profile` route redirects to `/guardian/learners` so old
links recover safely. The active learner setup flow remains available when a
new or incomplete learner is explicitly selected for learner mode.

### Learner-scoped Guardian settings

My Lessons, Story settings, and Voice dubbing each render the same compact
learner selector near the page title:

- all learner names stay visible;
- the selected button has a strong pressed state;
- the learner-mode profile has a small, separate badge;
- text says `Editing settings for {name}`;
- the URL contains `?learnerProfileId={id}`;
- refresh, browser history, and deep links preserve the target;
- choosing a different settings target never changes learner mode.

The first visit without a valid query target resolves to the learner-mode
profile when available, otherwise the first roster entry, and immediately
normalizes the URL with `replace`. Unknown or unowned identifiers recover to a
visible error and Manage learners link; they never fall back silently after a
mutation.

Custom lesson create/edit links preserve `learnerId`, and all learner-owned
requests made from those screens use that explicit target.

### Account & privacy

`/guardian/account` is a normal navigable page with a Back to Guardian dashboard
link. It contains:

- plain-language AI and saved-data explanations;
- optional technical build details;
- a visually separated Danger zone;
- Delete account only inside that Danger zone, followed by the existing
  password-confirmation dialog.

Sign out remains a conventional profile-menu action. The dashboard card links
to this page instead of instructing the user to open a dropdown.

## API and authorization

Learner-owned APIs accept an optional `learnerProfileId` query parameter. Without it,
learner mode and existing clients retain the current session-selected behavior.
With it:

- an authenticated, currently unlocked Guardian session is required for every
  method, including reads;
- the worker resolves the learner by both `learner_profile.id` and the signed-in
  `auth_user_id`;
- an owned learner produces a `LearnerIdentity` without writing
  `session_learner_selection`;
- an unknown or foreign learner returns 404;
- a locked Guardian returns 403 `guardian_required`;
- repeated or empty target parameters are rejected rather than ambiguously
  interpreted.

The targeted identity is reused by profile, preferences, recording consent,
custom lessons, personalized story art, and dubbing handlers. This is additive
and requires no database migration.

Creating a managed learner accepts an explicit non-activating mode and returns
the normal roster. Existing activating creation behavior remains available for
backward compatibility until all onboarding clients migrate.

## Interaction and visual behavior

Shared buttons, links, menu items, and interactive cards no longer translate on
hover or active press. Hover feedback uses color, brightness, border, and/or
shadow while focus-visible outlines and reduced-motion behavior stay intact.

Dashboard cards use icons and restrained tinted surfaces instead of six equal
white panels. Color is supplementary: headings and descriptions remain enough
to identify every destination. All controls keep accessible names, 44px or
larger targets, keyboard menu semantics, and narrow-screen containment.

## Loading, empty, and error states

- Roster-backed pages show one explicit loading status before rendering a
  learner target.
- A zero-learner account links to Manage learners and does not render broken
  settings controls.
- Roster failures expose Try again.
- Target-specific failures keep the target name/ID context visible and do not
  mutate learner mode.
- Guardian expiry uses the existing password-unlock recovery and returns to the
  same target URL.
- Destructive dubbing, recording, art, and account actions retain their existing
  confirmations and cleanup states.

## Verification

Unit and worker tests cover target parsing, ownership, authorization, and the
absence of session-selection writes. Component tests prove Edit profile does
not call selection. Playwright covers:

- every Guardian dashboard destination and its working Back route;
- exact reduced-menu contents and keyboard behavior;
- explicit Mia/Noah details deep links, refresh, history, and invalid IDs;
- every settings selector keeping Mia in learner mode while editing Noah;
- account/privacy content and Delete only in the Danger zone;
- stable bounding boxes on hover;
- narrow and short viewports;
- direct-route smoke for declared routes and wildcard recovery.

The existing parallel-session E2E race is fixed by waiting for the accessible
Learner profiles heading before reading its test controller. Full unit, browser,
build, type, and live post-deploy smoke checks gate completion.
