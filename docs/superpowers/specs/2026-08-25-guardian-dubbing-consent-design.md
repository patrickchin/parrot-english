# Guardian-Managed Dubbing Consent Design

## Goal

Keep Five Little Ducks as a learner activity while moving every adult consent,
privacy-management, and destructive control into password-protected guardian
mode. A learner must never be asked to claim that they are a grown-up.

## Problem

The dubbing feature was merged after the guardian/learner profile split. Its
learner route still renders an adult self-attestation checkbox and a completed
state named `Grown-up options`. The browser sends a public consent-version
header on every upload, and the Worker accepts that header without proving a
guardian granted consent. The same learner-mode session can also delete every
saved clip.

Hiding the checkbox alone would make the interface look correct while leaving
the authorization defect intact. Making the entire dubbing route guardian-only
would remove a promised learner activity. Removing persistence would discard
resume and final-playback behavior. The correction therefore needs a durable
guardian grant separate from the short-lived guardian-mode unlock.

## Capability Split

| Capability | Learner mode | Guardian mode | Enforcement |
| --- | --- | --- | --- |
| See whether voice dubbing is available | Yes | Yes | Authenticated, owner-scoped status |
| Record, replace, and replay saved lines | Yes, after a current guardian grant | Switch to learner | Worker checks the durable grant |
| Grant voice-storage consent | No | Yes | Guardian route plus live guardian-session unlock |
| Turn off dubbing and delete saved clips | No | Yes | Guardian route plus live guardian-session unlock |
| Read clips after consent is absent or revoking | No | No | Worker fails closed |

Existing learner capabilities remain unchanged for lessons, stories, profile
setup, and saved custom-content playback. Existing guardian protections remain
unchanged for profile editing, lesson authoring, story settings, account
controls, and personalized-art consent.

## Guardian Experience

Add `/guardian/dubbing` and a **Voice dubbing** destination to the guardian
dashboard. The route uses the existing `GuardianModeBoundary`, route header,
shared controls, and 15-minute account-password unlock.

When no current consent exists, the page explains that Five Little Ducks saves
private voice clips in the account, uses them only for the learner's private
playback, and deletes them with the account. The guardian must check one
explicit attestation and choose **Allow voice dubbing**. The attestation is
adult-facing and exists only inside guardian mode.

When consent is active, the page shows the number of saved lines and offers:

- **Switch to learner and start dubbing**, which first locks guardian mode and
  then opens the learner route; and
- **Turn off voice dubbing and delete saved clips**, a destructive guardian
  action that revokes new writes before cleaning private R2 objects.

If cleanup was interrupted, the page remains in a blocked cleanup state and
offers **Finish removing voice clips**. It must not allow a new grant until the
old generation is fully fenced.

## Learner Experience

`/dubs/five-little-ducks` remains a learner route and home activity.

Before consent, the page shows the duck artwork, title, and child-readable copy:
`Ask a grown-up to turn on voice dubbing in Guardian mode.` It contains no
checkbox, password field, consent copy, delete action, or grown-up management
panel.

After consent, the introduction explains only that voice clips stay private in
the account. **Start dubbing** and **Continue dubbing** are immediately
available. Recording, retry, retake, and final playback stay learner-facing.
The final screen may offer **Record another take** and a saved-line picker
because replacing one's performance is part of the activity; it must not call
that area grown-up options or expose deletion.

If consent is revoked in another tab during recording, the next upload fails
closed and the route returns to the child-readable unavailable state without
offering an endless **Save again** loop.

## Durable Consent Model

Add `guardian_dub_consent` in D1 with one row per account for the fixed dubbing
experience:

- `auth_user_id` — primary key and cascading foreign key to `user.id`;
- `consent_version` — the exact current consent contract;
- `grant_generation` — a new opaque UUID for every fresh grant;
- `state` — `granted` or `revoking`;
- `granted_at` and `updated_at` timestamps.

The current verified contract is `guardian-voice-r2-v2`. Version 1 represented
only browser self-attestation and is not accepted as a durable grant. Existing
clips remain private and unavailable until a guardian accepts version 2.

`grant_generation` prevents a stalled upload authorized by an old grant from
surviving revoke-and-regrant ABA. `revoking` blocks new grants and writes while
cross-store cleanup is incomplete. A successful cleanup deletes the consent
row; absence means not granted.

## API Contract

Keep the existing authenticated family and add one management endpoint:

- `GET /api/dubs/five-little-ducks-v1`
- `PUT /api/dubs/five-little-ducks-v1/lines/:lineId`
- `GET /api/dubs/five-little-ducks-v1/lines/:lineId/audio`
- `PUT /api/dubs/five-little-ducks-v1/consent`
- `DELETE /api/dubs/five-little-ducks-v1`

Status returns `recordingEnabled`, `consentState`, and the existing saved-line
shape. When consent is absent, it reports no saved lines without listing R2.
When revocation is incomplete, it reports `consentState: "revoking"` so the
guardian route can offer cleanup while the learner route stays blocked.

Consent `PUT` requires live guardian access and an exact bounded JSON object:

```json
{
  "accepted": true,
  "consentVersion": "guardian-voice-r2-v2"
}
```

Dub `DELETE` also requires live guardian access. It first performs one atomic
D1 transition to `revoking`, then runs the existing R2 marker/tombstone reset,
and deletes the D1 row only after cleanup succeeds. Retrying is idempotent; the
D1 and R2 operations are deliberately not described as one cross-store
transaction.

Line upload does not require the 15-minute guardian session because the learner
must be able to record later. Instead it captures the current D1 grant
generation before accepting the upload, rechecks the exact generation before
the conditional R2 write, stores the generation with the clip, and rechecks
afterward. If consent changed or D1 became uncertain, it conditionally fences
the exact object version it wrote and returns a consent-required error.

Audio reads require a current grant and accept current-version objects only
when their grant generation matches. Pre-version-2 clips may be adopted by the
first durable grant so existing private work is not discarded. A successful
revocation tombstones every fixed slot before a later grant is possible, so a
pre-version-2 clip cannot reappear after revoke-and-regrant. This prevents old
or partially revoked clips from crossing consent generations while preserving
the one-time migration path. All existing owner scoping, MIME/signature
validation, body limits, CAS generation handling, account-deletion fencing,
and private `no-store` headers remain in force.

## Error Handling

- Missing or stale consent: `403 dubbing_not_enabled`; no R2 write or audio
  body.
- Consent cleanup in progress: `409 dub_consent_revoking`.
- Locked guardian management request: existing `403 guardian_required`.
- Invalid consent JSON/version: `400 invalid_request`.
- Failed cleanup: keep `revoking`, keep media unreadable, and allow a guardian
  retry.
- Guardian-to-learner lock failure: retain the guardian page and show the
  existing access error.

## Other Adult-Surface Audit

The current learner routes for home, lessons, story shelf/reader, profile
setup, and account header do not render guardian controls. Personalized-photo
consent remains correctly isolated to `/guardian/stories` and protected APIs.
Profile editing, lesson authoring, sign-out, account deletion, and privacy
management remain guardian-only.

`ConversationSurface` still contains a dormant `Grown-up chat style` selector
for the currently disabled small-chat screen. Remove that selector from the
learner surface and retain the default prompt style internally so re-enabling
Talk to Peppa cannot reintroduce a learner-operated grown-up setting.

Informational copy such as `Ask a grown-up to allow the microphone` is allowed:
it asks the learner to seek help and does not let the learner perform an adult
action.

## Verification

Test first at each boundary:

- learner dubbing renders no adult checkbox, grown-up options, or delete action;
- guardian settings owns consent and deletion controls;
- status and audio fail closed without a current grant;
- uploads require the exact durable generation, not a public request header;
- locked sessions cannot grant consent or delete a dub;
- revocation blocks concurrent uploads and regrant until cleanup completes;
- old-generation audio cannot reappear after regrant;
- guardian consent enables learner recording across a mode switch;
- every reachable learner route remains free of adult management controls;
- dormant learner conversation UI contains no grown-up style selector;
- schema migration and account cascade are exercised at runtime.

Run `npm test`, `npm run lint`, `npm run build`, and `npm run test:browser` in
that order before completion.
