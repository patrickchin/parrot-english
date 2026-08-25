# Strict Guardian Profile Separation

## Goal

Make learner mode visibly and behaviorally learner-only. Adult management must
live in password-unlocked Guardian mode, while learner mode exposes only the
learner identity, learning activities, and one clearly locked entry point for a
grown-up.

## Context and root cause

The existing authorization boundary is already sound: guardian routes are
wrapped by `GuardianModeBoundary`, protected mutations require a live
session-scoped guardian unlock, and unlocking verifies the signed-in account
password on the Worker. The confusing part is the presentation:

- the learner account menu presents `Learner` and `Guardian` as equal tabs, so
  Guardian mode looks like an ordinary profile switch even though it is gated;
- adult editing of learner details is guardian-only but still uses `/profile`
  and the title `Learner profile`, which blurs which mode owns the controls;
- the private story-preview shelf still renders a `Grown-up options` level
  selector outside the normal guardian boundary.

The fix therefore belongs in shared navigation, route naming, and labels—not a
second authorization system.

## Considered approaches

### 1. Asymmetric locked gateway and guardian-owned routes (selected)

Learner mode shows no mode segmented control and no adult management actions.
Its account menu contains the learner identity plus one `Grown-up access`
button that explicitly says an account password is required. Pressing it opens
the existing password dialog and cannot render management content before a
successful server response.

Guardian mode contains the adult actions and a one-way `Switch to learner`
action. Adult editing moves to canonical `/guardian/profile` routes and uses
`Learner details` language. Existing `/profile` adult-edit URLs remain guarded
compatibility aliases, but the application no longer generates them.

This removes the misleading peer-profile model without adding credentials,
storage, recovery flows, or dependencies.

### 2. Keep the two-tab switch and strengthen its copy

Adding a lock icon or `Password required` under the existing Guardian tab would
be a smaller visual change, but Guardian would still look like a learner-owned
section. It does not address the user's central concern.

### 3. Add a separate guardian PIN or account

A distinct PIN could avoid browser password autofill, and a second account
could provide a stronger identity boundary. Both require setup, recovery,
migration, and account-linking policy. The current account-password check is
already a stronger credential and server-enforced, so this is unnecessary for
the requested separation.

## UX design

### Learner account menu

The profile trigger continues to identify the active learner. Opening it in
learner mode shows:

1. the learner name and `Learner` label;
2. one menu action, `Grown-up access`, with a lock/shield icon and visible
   supporting text `Account password required`.

It does not show a Guardian tab, learner/guardian segmented control, learner
detail editing, AI/data information, sign-out, deletion, consent, content
authoring, or story-level controls. Activating the gateway opens `Unlock
guardian mode`; cancel returns focus to the gateway. An incorrect password,
network error, or expired response keeps the app in learner mode.

The gateway is not a management section. It is the single discoverable door to
the adult area, and no adult capability exists on its learner side.

### Guardian account menu and dashboard

After unlock, the profile trigger uses the guardian/account identity. The menu
starts with `Switch to learner`, followed by adult-only actions:

- `Manage learner details`;
- `AI and saved data`;
- `Sign out`;
- `Delete account`.

The Guardian dashboard continues to be the management hub for learner details,
custom lessons, story settings, voice dubbing, and account/privacy guidance.
The first card and its destination are renamed from `Learner profile` to
`Learner details` to distinguish adult management from the learner's active
identity.

Switching to learner calls the existing server lock before navigation. A lock
failure keeps Guardian mode visible and does not hand an unlocked management
screen to the learner.

### Learner details

The canonical editor is `/guardian/profile`; redo setup is
`/guardian/profile/setup?redo=1`. The page is titled `Learner details` with a
`Guardian settings` eyebrow. It retains the current name, age, description,
save, and redo controls because those are correctly adult-managed.

Legacy `/profile` and `/profile/setup?redo=1` URLs remain password-gated aliases
for compatibility. New navigation and return paths use only the canonical
Guardian URLs.

### Story preview

The private story-preview build no longer renders `Grown-up options` or a
story-level picker. Its requested/default story level still comes from the
preview URL so review links remain deterministic. Production learner story
levels continue to come only from guardian settings.

## Route and authorization rules

`/guardian/profile` and `/guardian/profile/setup` join the shared Guardian route
allow-list. They are declared application routes and safe same-origin return
targets. `getProfilePath` and `getRedoLearnerProfilePath` generate the canonical
Guardian paths.

The current server rules remain unchanged:

- the account password is verified only by the same-origin Worker;
- guardian access is tied to the authenticated session and expires after 15
  minutes;
- profile reads/writes, lesson authoring, story settings/art mutations, and
  dubbing consent/deletion fail with `guardian_required` without that unlock;
- locked, loading, failed, or expired access never renders protected route
  children.

Initial learner setup remains learner-accessible. Editing or redoing an already
completed learner profile remains Guardian-only.

## Accessibility and responsive behavior

- The learner gateway and Guardian actions are real buttons with accessible
  names; no disallowed control is merely hidden with CSS.
- Menu keyboard order follows rendered items. Escape and dialog cancellation
  restore focus to a stable visible control.
- The password dialog retains its current focus trap, error announcement, and
  pending-state behavior.
- Account identity, the gateway, and Guardian actions remain contained at
  280px, 320px, 390px, short landscape, and desktop viewports.

## Test strategy

1. Unit route tests prove canonical Guardian profile URLs are guarded and
   generated, while normal first-time `/profile/setup` remains learner-safe.
2. Component/browser tests prove the learner account menu has exactly the
   locked gateway and no adult management actions or mode selector.
3. Unlock tests prove the gateway opens the password dialog, cancellation and
   failure remain in learner mode, and success opens the Guardian dashboard.
4. A no-flash deep-link matrix covers the dashboard, learner details, redo
   setup, lesson authoring/editing, story settings, and dubbing settings.
5. Guardian tests prove adult actions remain available only after unlock and
   switching back removes them.
6. Story-preview tests prove no adult options render.
7. Full unit/integration, Playwright responsive, lint, and production-build
   gates run before completion.

## Non-goals

- multiple learners or guardians per account;
- a separate guardian PIN, passkey, or account;
- changes to the 15-minute guardian-session lifetime;
- new learner profile customization or avatar features;
- redesigning the existing management pages beyond labels and routing needed
  for clear ownership.
