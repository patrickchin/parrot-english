# Technical Architecture

## Runtime Shape

Parrot English is a React 19 and Vite single-page app served by a Cloudflare
Worker. React Router owns durable browser navigation. The Worker owns the REST
API and falls back to static Vite assets for non-API requests.

```text
Browser
  -> Cloudflare Worker
       -> /api/auth/* -> Better Auth -> Drizzle -> D1
       -> /api/guardian-access -> authenticated session grant -> D1
       -> /api/learner-profiles -> authenticated ownership
            -> D1 roster + session selection
       -> active-learner resolver -> owned learner identity
            -> /api/learner-profile/* -> Groq / ElevenLabs -> D1
            -> /api/conversations/* -> LiveKit -> D1
            -> /api/lesson-recordings/* -> learner consent + private R2 slots
            -> /api/dubs/:dubId/* -> D1 consent + private R2 clip slots
       -> /api/evaluate-speech -> Groq
       -> static Vite assets
```

There is no separate game document, Phaser runtime, pixel-lesson API, or
prototype build entry in the shipped product.

## Browser Responsibilities

- `src/main.tsx` mounts one `BrowserRouter`.
- `src/app/App.tsx` composes route guards and owns lesson playback effects.
- `src/app/app-routes.ts` owns canonical paths, safe return targets, and route
  decisions.
- `src/app/HomeMenu.tsx` exposes the four learner activities, including the
  nursery-rhyme dubbing catalog.
- `src/auth` owns the Better Auth session, account UI, guardian-access state,
  automatic temporary grant, fixed expiry, and learner/guardian route
  boundaries.
- `src/learner-profile` owns onboarding, active-learner state, Guardian roster
  management, and profile editing. A successful profile change replaces the
  active profile ID, aborts stale work, clears learner-specific client state,
  and reloads before the new learner's routes render.
- `src/conversation` owns the learner-controlled LiveKit conversation surface.
- `src/lessons` owns the built-in learner catalog and player.
- `src/stories` owns the stored-level learner shelf/reader and its public Long
  stories. Long stories use the main authenticated routes; no private-preview
  route or build mode remains.
- `src/dubbing` owns the generated nursery-rhyme catalog, studio,
  authenticated client, Guardian settings, decoded take waveform, and
  synchronized replay. Each rhyme defines fixed line slots grouped into scene
  editors. Full and scene playback resolve each line independently, preferring
  the authenticated private take when saved and otherwise using the checked-in
  ElevenLabs guide. A failed private fetch or decode uses that guide as a
  fallback; only an unavailable preferred and fallback source omits its voice
  while the shared animation and music clock continues.
- `src/media` owns recording and browser playback adapters.
- `src/shared` owns reusable controls and cards.

Top-level learner navigation stays small. Management starts at `/guardian`,
with learner CRUD at `/guardian/learners` and dubbing consent/deletion at
`/guardian/dubbing`. Learner selection occurs
inside one shared chooser launched from either the learner account menu or
Guardian mode. Post-login Guardian return targets normalize to learner home;
validated learner deep links remain intact. Internal Guardian return targets
are validated against known Guardian routes and invalid targets fall back to
`/guardian`. Wildcard routing is mode-aware: Guardian mode returns to
`/guardian`, while learner mode returns to `/`.

## Worker Responsibilities

`worker/index.ts` authenticates protected requests, applies endpoint-specific
rate limits, resolves account or learner identity, and delegates to focused
handlers. Better Auth first produces an `AccountIdentity` containing the
session ID, user ID, normalized account email, and Guardian account name.
Account deletion, Guardian access, and account-scoped rate limiting use that
identity directly.

Learner-data routes pass the account identity through one central resolver. It
joins the current session selection to a profile owned by the same account and
produces a `LearnerIdentity` with immutable profile ID, current learner name,
and stable readable private-media directory name.
Existing learner APIs do not accept an arbitrary learner ID from the browser.
A stale, corrupt, or foreign selection fails closed. The resolver auto-selects
the only owned learner when safe; two or more owned learners without a selection return
`409 learner_selection_required`.

The Worker exposes authentication, Guardian access, the Guardian learner
roster, learner profile, conversations, lesson join-in recordings, build
information, speech evaluation, and nursery-rhyme dubbing. The authenticated
`/api/dubs/:dubId/*` family owns consent-aware status, raw clip upload, private
clip streaming, durable consent grant, and whole-catalog revocation/deletion.
Static assets are the final fallback.

`GET`, `POST`, and `DELETE /api/guardian-access` read, grant, and revoke the
current Better Auth session. In the current temporary flow, `POST` accepts no
password body and grants the already-authenticated session Guardian access.
Declared Guardian routes request that grant automatically; a genuine request or
response failure remains visible at the requested URL with Retry. This
passwordless entry is a weaker temporary boundary, not a removal of Better Auth,
owned-learner resolution, or Guardian-only endpoint checks. The grant request is
rate-limited, writes the actual fixed 15-minute expiry, and returns
`Cache-Control: no-store`. Expired rows are treated as absent and cleaned up
lazily. No password, Guardian token, or mode history is stored.

Authenticated owner-scoped roster and selection endpoints are:

```text
GET  /api/learner-profiles
PUT  /api/learner-profiles/:profileId/active
```

Guardian-protected roster mutations are:

```text
POST /api/learner-profiles
DELETE /api/learner-profiles/:profileId
```

`GET` returns owned profiles in stable creation order plus the current
session's active profile ID. `POST` accepts only a bounded preferred name,
creates an incomplete profile, and does not change this session's
active learner.
`PUT` selects only a profile owned by the authenticated account; missing and
foreign IDs share a generic `404`. The browser calls it only from the shared
`Who is learning now?` chooser. A Guardian-mode choice locks back to learner
mode before navigation; a learner-mode choice does not call the lock API.
`DELETE` requires the same live Guardian unlock and a name-specific UI
confirmation. It returns the authoritative remaining roster, rejects the final
usable learner with `409 last_learner`, and leaves retryable cleanup visible as
`deletionPending`. Deleting the active learner clears its selection and records
selection-required state instead of auto-selecting a sibling. All four routes
re-prove account ownership; malformed, missing, and foreign IDs share a generic
`404`.

One Worker dispatch guard returns `403 { "error": "guardian_required" }`
before roster create/delete mutations, Guardian profile reads/updates, dubbing
consent grant, and whole-dub deletion when the current session lacks a live
unlock.
Conversation start is purpose-aware: profile edits
always require the current session's live unlock, while onboarding remains
learner-safe only until the owner profile is completed or bypassed. The
authenticated `/review` endpoint is the sole conversation path that persists
profile answers and repeats that current-session check; browser `/finish` and
trusted-agent `/end` update conversation status only. Owner scoping, request
validation and rate limits still run after the mode check; learner-safe reads
remain available.

The Worker and browser share the Drizzle schema in `src/db/schema.ts`. Better
Auth and product data use one D1 database. `guardian_session_unlock` and
`session_learner_selection` are keyed to the Better Auth session; session
deletion cascades to both. The selection row also carries the account user ID
and selected profile ID, and the resolver re-proves ownership on every learner
request.

The Better Auth `shared-guest` plugin loads the seeded shared user and creates
a normal session for it. Existing user ownership makes all account and learner
data shared for that identity, while the active learner selection remains
scoped to each session.

`learner_profile_deletion_tombstone` stores a durable, account-bound cleanup
closure for individual deletion, while `learner_selection_required` prevents
single-profile fallback from silently selecting a sibling in sessions that
lost their active learner. A tombstoned learner is omitted from chooser and
settings-target lists but remains in the Guardian roster with
`deletionPending` until cleanup finishes. Retry uses the same learner ID and
closure. Cleanup is limited to that learner's private-media prefix, so sibling
storage is never swept. Whole-account deletion closes the account prefix.

`learner_profile.story_level` stores one of the four supported IDs and defaults
to `first-words`. Profile-specific tables store onboarding bypass and recording
consent. No runtime route creates, reads, or serves personalized story art.

## Durable and Transient State

URLs are authoritative for durable screens, lesson scenes, story pages, the
Five Little Ducks dubbing studio, and Guardian management. The learner story
shelf URL is canonicalized to the active profile's stored `story_level`.
Guardian mode is server state for the current auth session, not a client-only
role or long-lived account permission. The active learner is separate server
state for that same session, so different sessions can manage different
learners without changing one another. Guardian settings use explicit
learner-target URLs and never mutate that state. The shared switch dialog first
selects the learner named by a direct learner button, then locks Guardian access
when leaving Guardian mode, then navigates. The button is the complete selection
action, and the dialog keeps the current page on failure.

Dubbing and lesson-recording consent are deliberately durable learner state so
the selected learner may record after Guardian mode is locked. Lesson and dub
playback phase, active recording, selected scene and line, pending local take
recovery, and session-local Needs-retake markers are transient React state. The
saved-line map comes from the learner-scoped dub status response, so a reload
resumes recorded progress without persisting editor-only fallback markers.
Route and learner-selection changes invalidate pending audio, conversation,
story, profile, lesson, lesson-recording, and dubbing work before the new
learner's state is committed.

Completed lesson clips may continue through their background queue after route
unmount. Every upload therefore includes the learner ID captured by the mounted
player only as an expected-selection precondition. The Worker compares it with
the learner identity it independently resolves from the authenticated session
and rejects a mismatch before reading the audio body. It never trusts that
header to select a profile or storage namespace.

```text
/
├── /talk-to-peppa
├── /lessons
│   ├── /lessons/parrot/:lessonId/scenes/:sceneNumber
├── /stories
│   └── /stories/:storyId/pages/:pageNumber
├── /dubs/five-little-ducks
├── /guardian
│   ├── /guardian/learners
│   │   └── /guardian/learners/:learnerId
│   ├── /guardian/account
│   ├── /guardian/profile
│   ├── /guardian/profile/setup
│   └── /guardian/dubbing
├── /profile                         (compatibility alias; guardian after setup)
├── /profile/setup
└── /login
```

Guardian profile return targets accept only known Guardian management routes.
Missing, malformed, cross-origin, learner-mode, self-referential, and unknown
targets resolve to `/guardian`. A Guardian who reaches a learner route can
return to the dashboard without locking or explicitly lock and enter learner
mode, so no fallback strands an unlocked session at a learner-only screen.

## Ownership Boundaries

| State or record                                   | Authoritative scope                          |
| ------------------------------------------------- | -------------------------------------------- |
| Better Auth account                               | Guardian account                             |
| Better Auth session and Guardian unlock           | Account session                              |
| Active learner selection                          | Account session plus owned learner           |
| Learner profile, story level, onboarding progress | Learner profile                              |
| Conversation session                              | Learner profile fixed at creation            |
| Conversation turns and facts                      | Inherit the conversation's stored learner    |
| Dubbing consent and clip namespace                | Learner profile                              |
| Lesson-recording consent and clip namespace       | Learner profile                              |
| Rate limits                                       | Guardian account plus existing IP dimensions |
| Account-deletion tombstone                        | Guardian account                             |

Browser conversation reads require the currently selected learner. Trusted
LiveKit agent turns and finalization use the learner stored on the conversation
row, not a later session selection. Whole-account deletion remains
account-scoped and enumerates all learner storage identities before the user
row cascades.

## Dubbing Capability Boundary

`GET /api/dubs/:dubId` returns `recordingEnabled`, `consentState`, the selected
rhyme's fixed-line status shape, and consent contract
`guardian-voice-r2-v2`. Absence or `revoking` returns no saved lines and never
lists R2. Consent lookup and every R2 path use the resolved learner identity.
Learners may upload, retake, read, and replay clips only while that learner's
current D1 grant generation remains valid. The upload path captures that
generation, checks it around the conditional R2 write, and fences the exact
object it wrote if consent changes.

`PUT /api/dubs/:dubId/consent` accepts only the bounded version-2 attestation
object under a live Guardian unlock. Guardian-only `DELETE /api/dubs/:dubId`
changes D1 to `revoking` before R2 cleanup and removes that learner's consent
row only after every supported rhyme is clean. The learner studio contains no
self-attestation, `Grown-up options`, or delete action; it retains recording,
retakes, saved-line replacement, and final playback.

After the permanent account-deletion tombstone exists, consent grant, status,
audio, upload, and revocation fail closed. Grant checks before and after its D1
mutation; status and audio check before R2 access and again before returning.
Migration `0011_guardian_dub_consent` must be deployed before the consent-aware
Worker.

## Content Boundaries

- `content/lessons/*.json` owns built-in lesson scripts.
- `content/catalogs/*.json` owns shared character, emote, background, and cover
  references.
- `src/lessons/full-scene-lessons.ts` maps each ready-made lesson scene to its
  checked-in 16:9 illustration.
- `lib/static-audio.js` owns saved speech keyed by speaker and exact text.
- `src/stories/story-script-candidates.ts` owns the twenty learner stories.
- `src/stories/long-stories.ts` owns the two published long read-aloud scripts;
  their narration IDs resolve through the same static audio manifest.
- `content/learner-profile/questionnaire-v2.json` owns form-fallback prompts.
- `public/assets/nursery-rhymes/*/rhyme.json` and each adjacent MusicXML score
  own the generated dubbing catalog's scripts, timing, and guide references.

Built-in lesson JSON never stores asset filenames. Story language, vocabulary,
and participation choices are reviewed before check-in. Runtime story records
keep only the identity, shelf level, title, cover, reader pages, and completion
text consumed by the product.

All learner recordings use the `PRIVATE_MEDIA_BUCKET` binding, backed by
`parrot-english-private-media` in production and
`parrot-english-private-media-preview` for preview deployments. R2 keys have
one account root, one learner root, and recording-kind subtrees:

```text
accounts/{escaped-email}/
  learners/{stable-readable-private-media-name}/
    recordings/
      nursery-rhymes/{dub-id}/
        .dub-generation
        {line-id}.audio
      lessons/{lesson-id}/
        scene-{scene-index}/
          step-{step-index}.audio
```

There is no live story-art namespace, account-root recording namespace, or
legacy dub fallback. The old personalized-story-art buckets are not part of the
runtime storage contract.

The escaped account email and stable readable learner directory make this tree
directly navigable in R2. A learner receives that directory name once; later
display-name edits do not rename it or orphan recordings. An unnamed initial
profile keeps `Learner`; deleted learner directories remain reserved and a
later profile with the same name receives a readable numeric suffix. Current
display names are unique per account. Account-deletion tombstones permanently
reserve their email roots, so a deleted email cannot sign up again and collide
with retained fences. R2 has no symlinks, so reads, writes, and deletion use this
one canonical path rather than maintaining aliases or duplicate objects.

For dubbing, the browser creates an object URL immediately from each finished
MediaRecorder `Blob`, decodes the same bytes to PCM for the visible waveform,
and can replay that local take while its selected line remains open, including
after a successful upload. Upload and draft playback remain separate: R2 is the
durable source of truth, while the local object URL is revoked when a take is
replaced or discarded by navigation, deletion, or unmount. The full project and
each scene resolve saved slots from authenticated R2 and missing slots from
checked-in guides, then schedule the usable voices, procedural music bed, and
scene beats against one Web Audio clock. Private playback failures retry the
guide and set a browser-session Needs-retake marker; if both sources fail, the
voice is omitted without stopping the draft.

R2 is the source of truth for clip bytes; D1 is the source of truth for whether
those clips may be used. Status returns `not_granted`, `granted`, or `revoking`
and does not list R2 when no current grant exists. During normal studio use the
marker carries a generation and a `ready` or `deleting` state; status and
playback expose only clips owned by both the current ready R2 generation and the
current D1 consent generation. Each new upload stores a `parrot-dub-audio-v2`
envelope with the generations and a request-unique upload nonce before the raw
audio payload.
Matching metadata records the payload offset, generation, and nonce so an
authenticated GET can conditionally validate the exact envelope and stream only
the payload.

Replacement conditionally writes the observed fixed slot and rechecks the
generation fence. Reset conditionally acquires a new `deleting` generation,
conditionally replaces every catalog-defined line slot with generation-owned
non-audio tombstones, and then conditionally finalizes the marker as `ready`;
an interrupted reset remains fenced until another DELETE completes it. Reads
accept only the current `parrot-dub-audio-v2` envelope and matching metadata;
raw legacy audio is treated as unsaved rather than streamed.

The paginated sweep validates its exact prefix and cursor, rechecks ownership
of the observed deleting marker around each page, and bounds retries for
transient R2 write-rate failures. Learner deletion sweeps only that learner's
prefix; account deletion sweeps `accounts/{escaped-email}/`. Closure keys are
excluded from broad sweeps, so concurrent deletion hooks converge instead of
dismantling one another. Better Auth can remove the user only after every
learner closure exists; ordinary dub resets cannot take over a terminal marker.
The retained fence objects contain no recording bytes. Guardian revocation
first changes the selected learner's D1 consent to `revoking`, completes the R2
tombstones, and deletes the consent row only after cleanup succeeds. New grants
and all media access fail closed while that cleanup is incomplete.

## Migration and Deployment Boundary

Multi-learner ownership ships through an expand/compatibility/enable sequence:

1. `0012_multi_learner_expand.sql` adds nullable profile ownership, backfills
   existing data and sessions to the marked legacy learner, and retains every
   singleton table and unique index required by the old Worker.
2. A compatibility Worker resolves learner identity, writes profile IDs,
   recognizes null-profile rows only for the legacy learner, and keeps roster
   mutations disabled with `MULTI_LEARNER_PROFILES_ENABLED="0"`.
3. After that exact Worker commit is verified in production and recorded in
   `MULTI_LEARNER_COMPATIBILITY_DEPLOYED`, `0013_multi_learner_enable.sql`
   repeats backfills, asserts there are no unmapped rows or eligible sessions,
   removes singleton uniqueness, and enables roster mutations with the flag set
   to `"1"`.
4. `0015_learner_profile_deletion.sql` adds durable learner-deletion and
   selection-required state. It is safe to apply with the compatibility Worker
   while roster mutations are disabled and is required before individual
   deletion is exposed.
5. A later contract migration may make ownership columns non-null and retire
   compatibility tables after the rollback and session-expiry window.

The deployment workflow verifies that the recorded compatibility commit is an
ancestor of the enable commit, contains `0012`, and does not contain `0013`
before applying remote migrations. After `0013` applies, production must never
run a Worker older than that recorded compatibility floor. The operational
commands, smoke tests, monitoring signals, and rollback rules are in
[multiple-learner-rollout.md](../deployment/multiple-learner-rollout.md).

## Provider Boundaries

- Built-in lesson lines use checked-in ElevenLabs audio assets.
- Nursery-rhyme line guides use checked-in ElevenLabs narrator MP3s; the
  browser never substitutes device speech for a missing guide.
- Groq evaluates lesson speech and supports profile enrichment.
- LiveKit carries realtime conversation audio; the agent uses explicit model
  IDs and purpose-specific prompts.

Provider keys remain on the Worker or agent. The browser receives only
same-origin API responses and short-lived room-scoped LiveKit tokens.

## Verification

The required local product gates are:

```bash
npm test
npm run lint
npm run build
npm run test:browser
```

Responsive browser coverage includes the home, headers, lesson catalog, lesson
player, story shelf, story reader, conversation surface,
authentication/profile boundaries, learner/guardian switching, unlock errors,
lock errors, refresh persistence, expiry, and protected deep links from 280 px
through desktop widths. Guardian/learner responsive gates explicitly cover
280x568, 320x568, 390x844, 640x360, and 1440x900. Multi-learner coverage also
proves CRUD-only roster management, explicit chooser selection,
inactive/active/final/pending deletion behavior, independent session
selections, stale-result suppression, sibling data isolation,
selection-required fail-closed behavior, Guardian route recovery, and the
absence of sibling or grown-up controls across the learner-route matrix.
