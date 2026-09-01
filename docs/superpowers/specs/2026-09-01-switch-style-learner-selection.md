# Switch-style learner selection

## Goal

Make learner profiles behave like lightweight console profiles: authenticated
people can see and switch among profiles without entering Guardian mode.

## Approved behavior

- A successful sign-in enters the learner experience. A validated learner deep
  link remains intact, but a Guardian `returnTo` is normalized to learner home.
- When the account has multiple profiles and no active learner, the app shows a
  required learner-selection page immediately. It does not show the former
  “Ask a grown-up” dead end, a password prompt, or a Cancel path.
- The learner account menu includes **Switch learner** before **Grown-up
  access**. Opening it shows the shared chooser, and selecting a learner returns
  to learner home.
- Any authenticated session may list its own learner profiles and select one of
  its own profiles. Account authentication and existing same-account ownership
  checks remain required.
- Creating or deleting profiles, editing settings, and other Guardian
  management operations remain Guardian-only.
- Switching from Guardian mode locks back to learner mode. Switching between
  learners while already in learner mode does not call the Guardian lock API.
- Genuine roster-load, profile-selection, and identity-verification failures
  keep their existing retry/error treatment.

## Non-goals

- Do not change the session-scoped learner-selection storage model.
- Do not auto-pick the first sibling when several profiles exist.
- Do not weaken ownership checks or expose another account's profiles.
