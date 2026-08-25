# Five Little Ducks Dubbing Game Design

## Goal

Add one polished child-and-parent dubbing game to Parrot English. A learner
records the authentic traditional **Five Little Ducks** rhyme one line at a
time, can immediately hear or replace each take, and then watches a 98-second
animated replay with the saved voice clips and an original music bed kept in
sync.

This first release proves the interaction with one built-in rhyme. It does not
import YouTube media, use protected cartoon footage, export a mixed video, add
a dubbing catalogue, or share recordings publicly.

## Product Shape

The authenticated home gains a fourth picture-led activity, **Dub a rhyme**,
which links to `/dubs/five-little-ducks`. The new route uses the shared account
header, `RouteHeader`, and shared controls. It is a separate activity rather
than a lesson-player variant because it retains multiple takes and assembles a
timed final performance.

Before these four active stages, the learner route checks durable consent. When
it is absent or being revoked, the route shows **Ask a grown-up to turn on voice
dubbing in Guardian mode.** It shows no self-attestation checkbox, password,
consent terms, delete action, or `Grown-up options` panel.

After a current consent grant, the learner experience has four stages:

1. **Welcome.** Explain that voice clips are private, saved to the signed-in
   account, replayable, replaceable, and deleted with the account. **Start
   dubbing** or **Continue dubbing** is immediately available.
2. **Line recording.** Fill the available studio viewport with the animated
   duck stage and one compact control rail. Show `Line n of 24`, a visually
   dominant **Now read** line, and one large **Record** / **Stop** action. The
   saved ElevenLabs narrator guide plays as each line opens and remains
   available through the secondary **Replay example** action. Recording stops
   automatically at six seconds.
3. **Line review.** Create a local object URL as soon as MediaRecorder returns,
   decode that same `Blob` into a real waveform, and expose **Hear my voice**
   while the upload is saving and before the learner chooses **Next line**. The
   one large **Next line** action remains primary, with **Record again** quieter.
   A replacement upload atomically overwrites that line's previous object.
   Existing progress resumes at the first missing line.
4. **Final replay.** Unlock **Watch my dub** only after all 24 lines exist.
   Schedule the clips and an original procedural music bed against one shared
   Web Audio clock while the original SVG duck scene advances through the same
   fixed timeline. Return to **Watch my dub** after playback and keep line
   replacement under the learner-facing **Record another take** control.

Like The Choicer Voicer inspiration, each state has one unmistakable primary
action. The take preview, waveform, example replay, and retake are supporting
controls rather than competing next steps. The learner can reopen any saved
line, record a replacement, and replay the final performance.

Adult management lives separately at `/guardian/dubbing`, behind the live
15-minute guardian unlock. Only that route can accept version-2 voice-storage
consent or turn dubbing off and delete all saved clips. The separate **Switch to
learner and start dubbing** handoff locks guardian mode before learner
navigation. An interrupted deletion remains `revoking` and offers **Finish
removing voice clips** only in guardian mode.

## Traditional Rhyme and Original Presentation

The feature uses the traditional six-stanza **Five Little Ducks** text, not an
existing video, recording, arrangement, or protected character design. The
learner records these 24 lines:

| Slot | Start | Line | Visual beat |
| --- | ---: | --- | --- |
| `line-1` | 0.8s | Five little ducks went out one day. | Five ducklings depart. |
| `line-2` | 4.8s | Over the hill and far away. | Five ducklings cross the hill. |
| `line-3` | 8.8s | Mother duck said, “Quack, quack, quack, quack.” | Mother duck calls. |
| `line-4` | 12.8s | But only four little ducks came back. | Four ducklings return. |
| `line-5` | 16.8s | Four little ducks went out one day. | Four ducklings depart. |
| `line-6` | 20.8s | Over the hill and far away. | Four ducklings cross the hill. |
| `line-7` | 24.8s | Mother duck said, “Quack, quack, quack, quack.” | Mother duck calls. |
| `line-8` | 28.8s | But only three little ducks came back. | Three ducklings return. |
| `line-9` | 32.8s | Three little ducks went out one day. | Three ducklings depart. |
| `line-10` | 36.8s | Over the hill and far away. | Three ducklings cross the hill. |
| `line-11` | 40.8s | Mother duck said, “Quack, quack, quack, quack.” | Mother duck calls. |
| `line-12` | 44.8s | But only two little ducks came back. | Two ducklings return. |
| `line-13` | 48.8s | Two little ducks went out one day. | Two ducklings depart. |
| `line-14` | 52.8s | Over the hill and far away. | Two ducklings cross the hill. |
| `line-15` | 56.8s | Mother duck said, “Quack, quack, quack, quack.” | Mother duck calls. |
| `line-16` | 60.8s | But only one little duck came back. | One duckling returns. |
| `line-17` | 64.8s | One little duck went out one day. | One duckling departs. |
| `line-18` | 68.8s | Over the hill and far away. | One duckling crosses the hill. |
| `line-19` | 72.8s | Mother duck said, “Quack, quack, quack, quack.” | Mother duck calls. |
| `line-20` | 76.8s | But none of the five little ducks came back. | The pond stays empty. |
| `line-21` | 80.8s | Sad mother duck went out one day. | Mother duck departs alone. |
| `line-22` | 84.8s | Over the hill and far away. | Mother duck crosses the hill. |
| `line-23` | 88.8s | Sad mother duck said, “Quack, quack, quack, quack.” | Sad mother duck calls. |
| `line-24` | 92.8s | And all of the five little ducks came back. | All five ducklings return. |

The replay ends at 98 seconds. Every cue is four seconds after the previous
one, while each recording may run for at most six seconds. Inline SVG shapes
form the pond, hill, mother duck, and five distinct ducklings; there is no
unrelated animal or invented detour. React selects the visual beat from the
authored timeline; standard Tailwind motion utilities add gentle bobbing and
are disabled by `prefers-reduced-motion`.

The line guide uses checked-in ElevenLabs narrator MP3s resolved through the
static-audio manifest. Repeated traditional lines share the matching saved
asset, so 15 unique guide files cover all 24 slots without falling back to
device speech. The final music remains a new, quiet pentatonic pattern
synthesized with oscillators and gain envelopes. It is scheduled at the same
Web Audio start time as the voice clips, needs no media licence, and adds no
runtime dependency.

## Browser Architecture

`src/dubbing/dub-script.ts` owns the immutable script, slot IDs, cue offsets,
maximum record duration, and visual-beat metadata.

`src/dubbing/dub-api.ts` owns same-origin status, upload, private audio, durable
consent, and delete requests. Uploads are raw `Blob` bodies so the Worker can
apply a strict byte limit without multipart overhead.

`src/dubbing/dub-state.ts` owns pure transitions for loading, introduction,
line readiness, microphone opening, recording, saving, review, final readiness,
final loading, final playback, and recoverable errors.

`src/dubbing/dub-playback.ts` fetches authenticated clips, decodes them to
`AudioBuffer`s, schedules every source at its authored cue against one
`AudioContext`, schedules the music bed, and reports elapsed time for the
animation. It returns one idempotent stop function that cancels sources,
animation frames, and the context.

`src/dubbing/DuckDub.tsx` composes the large guided studio and owns cancellable
effects. It aborts guide playback, local take playback, microphone work,
uploads, and final playback on retake, consent loss, or unmount. It creates the
local take preview before the R2 request completes. Async results carry a
generation token so a late result cannot mutate a newer line or an exited route.

`src/dubbing/DubTakeWaveform.tsx` decodes the in-memory take through Web Audio
and renders normalized PCM peaks. It is a visualization of the actual recorded
`Blob`, not a decorative animation or server-derived approximation.

`src/dubbing/GuardianDubbingSettings.tsx` composes the guardian-only consent,
mode handoff, revocation, and cleanup-retry experience.

`src/dubbing/DuckScene.tsx` renders both the small home-card illustration and
the responsive game stage. It contains no media URLs.

The generic recorder chooses a MIME type at runtime with
`MediaRecorder.isTypeSupported`, preferring MP4/AAC when available and then
WebM/Opus, MP4, WebM, or Ogg. The resulting recorder-reported MIME type is used
for the `Blob`; the existing hard-coded `audio/webm` assumption is removed.

## Private R2 API

The Worker exposes one fixed, authenticated API family:

- `GET /api/dubs/five-little-ducks-v2`
- `PUT /api/dubs/five-little-ducks-v2/lines/:lineId`
- `GET /api/dubs/five-little-ducks-v2/lines/:lineId/audio`
- `PUT /api/dubs/five-little-ducks-v2/consent`
- `DELETE /api/dubs/five-little-ducks-v2`

Only the 24 authored line IDs are valid. The user ID always comes from the
Better Auth session and is never accepted from the browser. Status is an
authenticated owner-scoped read. Consent `PUT` and dub `DELETE` additionally
require a live guardian unlock; line upload and playback instead require the
current durable consent generation so they remain learner capabilities.

The current contract is `guardian-voice-r2-v2`. D1 table
`guardian_dub_consent` stores one row per account with the consent version, an
opaque grant generation, `granted` or `revoking` state, and timestamps. Version
1 represented browser self-attestation and is not a durable grant.

The proof of concept reuses the existing private personalized-art R2 bucket,
account-deletion tombstone, and owner prefix:

```text
personalized-story-art/{encoded-user-id}/learner-dubs/
  five-little-ducks-v2/.dub-generation
  five-little-ducks-v2/{line-id}.audio
```

This reuses the existing bucket while adding the D1 consent row and extending
the existing account-delete pipeline with a dub-specific storage closure. Each
fixed `.audio` key is the current slot, so replacing a take cannot orphan an
older browser format. Split voice data into its own bucket when its retention,
residency, or access policy differs from private story art.

R2 is the source of truth for clip bytes, while D1 is the source of truth for
consent. `list` determines saved slots, `put` conditionally replaces a slot, and
`get` streams owner-only audio only under a current grant. Reset keeps the 24 fixed
v2 keys but replaces each with a small, opaque non-audio generation tombstone,
then retires only that owner's legacy `five-little-ducks-v1/` namespace before
returning the v2 marker to `ready`. Retirement conditionally stores a terminal
`account-deleting` marker plus nine non-audio fixed-slot fences recognized by
old v1 Workers, and deletes every other object under that exact prefix. The ten
tiny fences remain so a v1 request that passed its marker checks before a
gradual deployment cannot recreate recording bytes. The paginated sweep rejects
keys outside that exact prefix or non-advancing cursors, rechecks ownership of
the exact v2 deleting marker around every page, and retries only transient R2
write-rate failures. Another user or product prefix is never a purge target.
The marker and tombstones include their generation in the object body. Each newly written
private audio envelope includes both that generation and a
request-unique upload nonce. This is required because R2 single-part ETags are
content-derived: custom metadata or generation-independent bodies cannot
prevent an ETag ABA when a reset rewrites a key, and identical takes in the same
generation otherwise cannot be distinguished by ETag. The audio endpoint
validates the exact v2 envelope prefix with an ETag-conditioned bounded range
read, then streams an ETag-conditioned payload range, so the learner receives
the exact uploaded clip without buffering it again. It retains read
compatibility with the earlier generation-only v1 envelope. Raw pre-marker
audio remains readable only when all envelope coordination metadata is absent.
Enveloped objects are also rejected when their total size exceeds the exact
prefix plus the 512 KiB upload ceiling.

HTTP metadata stores the normalized content type. Audio custom metadata stores
the reset generation, durable consent generation, request-unique upload nonce,
audio state, payload offset, consent version, line ID, and recording timestamp.
The `.dub-generation` coordination object also stores its generation and
`ready`, `deleting`, or terminal `account-deleting` state in custom metadata.
Conditional R2 writes serialize the marker and every fixed slot. Uploads
capture the ready generation and slot ETag, then conditionally replace only that
observed slot; resets acquire a new deleting generation and conditionally tombstone all 24 slots
before returning the marker to ready. Status and audio routes accept only
audio-state objects for the current ready generation (plus eligible pre-marker
audio already under the current v2 prefix). A first durable version-2 grant may
adopt those current-prefix clips; it never adopts, lists, counts, or plays the
retired `five-little-ducks-v1/` prefix. After any revocation, tombstones prevent
current-prefix clips from reappearing under a later grant. Account deletion
derives its generation from the persisted D1
tombstone, excludes the 25 current-v2 and ten retired-v1 closure keys from broad
prefix deletion, then conditionally stores terminal `account-deleting` markers
and all 33 same-generation non-audio slot fences. Concurrent deletion hooks therefore
converge on the same closure, and an ordinary reset cannot take over the
terminal marker. Cloudflare currently limits writes to the same R2 key to one
per second ([R2 limits](https://developers.cloudflare.com/r2/platform/limits/)).
Reset therefore waits a relative 1.05 seconds between acquiring the deleting
marker and finalizing it as ready. All marker and slot conditional writes retry
error `10058` with bounded backoff only while the exact observed version still
owns the CAS precondition; ownership loss fails closed.

## Validation, Privacy, and Failure Handling

Every API request is session-gated. All JSON and audio responses use
`Cache-Control: private, no-store`; audio also uses
`X-Content-Type-Options: nosniff`.

Uploads require a current durable `guardian-voice-r2-v2` grant in D1, are
limited to 512 KiB, and accept only browser-recordable WebM, MP4, or Ogg audio.
The Worker captures the grant generation, rechecks it before and after the
conditional R2 write, and fences its exact object if consent changes. A public
browser header cannot create or prove consent. The Worker also checks both the
normalized MIME type and container signature. Empty, oversized, mismatched,
unknown-line, and unsupported requests fail without an R2 write.

The permanent D1 account-deletion tombstone is checked before and after upload.
Consent grant checks before and after its D1 mutation. Status and audio check
before any R2 work and again before returning data, so a grant or read racing
account deletion fails closed.
If deletion begins during a write after the prefix sweep has already passed,
the request conditionally replaces exactly the object version it wrote with a
request-unique opaque `account-deleting` fence. It re-heads and retries on a CAS
loss or transient hot-key error until the slot is absent or demonstrably
non-audio. If a post-write D1 read itself fails, the deletion state is uncertain:
the request makes only a bounded, conditional attempt to fence its exact
nonce-bearing object and never takes over a slot after CAS loss, so it cannot
replace a newer writer. Cleanup failure does not hide the original D1 error.
After any successful audio write, this D1 check runs before the marker result is
interpreted and is repeated after either a marker conflict or a successful
marker check. It never unconditionally deletes a shared fixed slot that a newer
writer could own. The account-deletion coordinator sweeps non-closure objects
below the owner prefix, then retains the 25-object v2 closure and ten-object
retired-v1 closure with the tombstone-derived generation. Better Auth removes
the user only after all 35 non-audio objects exist. A retry or concurrent hook
protects those exact keys from its broad sweep and idempotently converges on the same
generation. This removes every recording while permanently closing stale
conditional uploads and resets; the D1 tombstone prevents any new legitimate
upload for the deleted account.

Migration `0011_guardian_dub_consent` must be deployed before the consent-aware
Worker.

Recordings are never sent to speech recognition, analytics, a public bucket,
or a third-party media player. Consent is an explicit guardian action on the
protected guardian route; the learner route has no adult self-attestation.

Recoverable failures stay in context:

- microphone unsupported or denied: keep the line visible and allow retry;
- upload failure: retain the new `Blob` in memory and offer **Save again**;
- saved clip playback failure: offer **Try again** without discarding progress;
- one corrupt/undecodable final clip: return to that line for replacement;
- guide audio unavailable: keep recording enabled because the visible line is
  authoritative;
- consent revoked during recording: fail the upload closed and return to the
  child-readable unavailable state without a **Save again** loop;
- interrupted revocation: keep all media blocked and let a guardian retry
  cleanup;
- route exit: stop media tracks and audio immediately.

## Responsive and Accessible Presentation

The game uses one large primary action per state, minimum 48 px controls,
visible text in addition to icons, and stable accessible names while compact
labels hide at narrow widths. Status changes use one polite live region;
permission, upload, and playback failures use an alert.

At 280–390 px the stage, line card, and controls stack inside a vertically
scrollable `main`. At short landscape sizes the stage and controls use two
columns while the route and account headers remain clear. Desktop keeps the
stage dominant inside a near-full-viewport studio up to 1600 px wide, with a
compact title and a substantially larger active lyric in the narrower control
rail. No viewport may horizontally overflow, hide the active control, or place
controls over the stage.

The home changes to a compact two-by-two grid on phones and four equal cards
on wide/short-landscape screens so all four activities remain picture-led.

## Verification

Test-first coverage will include:

- recorder MIME negotiation and recorder-reported Blob types;
- pure dubbing state transitions and first-missing-line resume logic;
- script cue ordering, four-second cue spacing, six-second recording maximum,
  and 98-second duration;
- Worker authentication, route validation, size/type/signature checks, owner
  isolation, atomic replacement, private streaming headers, reset, and the
  account-deletion race fence;
- browser behavior for not-granted status, guardian grant and learner handoff,
  recording, saving, retaking, reload resume, final replay, guardian deletion,
  denied/unsupported microphones, and failed uploads;
- learner-route audits proving there is no self-attestation, `Grown-up options`,
  delete action, or grown-up chat-style selector while **Watch my dub** remains;
- home and dubbing layouts at 280, 320, 390, short landscape, and desktop;
- fresh `npm test`, `npm run lint`, `npm run build`, and
  `npm run test:browser` runs before completion.

## External Constraints

The source screenshot shows Dub Mode in [The Choicer
Voicer](https://yeahmaybe.itch.io/the-choicer-voicer) and is an interaction
reference only. [YouTube's API
policies](https://developers.google.com/youtube/terms/developer-policies)
prohibit applying alternate audio tracks to embedded YouTube videos, so
YouTube is not part of this implementation.
Child voice recordings are personal information in relevant jurisdictions;
this design therefore keeps them private, owner-scoped, explicitly disclosed,
deletable, and inside the existing account deletion lifecycle.
