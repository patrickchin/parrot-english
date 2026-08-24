# Five Little Ducks Dubbing Game Design

## Goal

Add one polished child-and-parent dubbing game to Parrot English. A learner
records an original duck rhyme one line at a time, can replace any take, and
then watches a roughly one-minute animated replay with the saved voice clips
and an original music bed kept in sync.

This first release proves the interaction with one built-in rhyme. It does not
import YouTube media, use protected cartoon footage, export a mixed video, add
a dubbing catalogue, or share recordings publicly.

## Product Shape

The authenticated home gains a fourth picture-led activity, **Dub a rhyme**,
which links to `/dubs/five-little-ducks`. The new route uses the shared account
header, `RouteHeader`, and shared controls. It is a separate activity rather
than a lesson-player variant because it retains multiple takes and assembles a
timed final performance.

The experience has four learner-visible stages:

1. **Welcome and grown-up confirmation.** Explain that voice clips are private,
   saved to the signed-in account, replayable, replaceable, and deleted with
   the account. A grown-up must confirm before a new clip can be uploaded.
2. **Line recording.** Show the animated duck scene, `Line n of 9`, the exact
   line, **Hear the line**, and one large **Record** / **Stop** action. Recording
   stops automatically at six seconds.
3. **Line review.** Upload immediately, then offer **Hear my take**, **Try
   again**, and **Next line**. A replacement upload atomically overwrites that
   line's previous object. Existing progress resumes at the first missing line.
4. **Final replay.** Unlock **Watch my dub** only after all nine lines exist.
   Schedule the clips and an original procedural music bed against one shared
   Web Audio clock while the original SVG duck scene advances through the same
   fixed timeline. Offer **Watch again** and a grown-up-only **Delete my dub**.

The line-review playback is intentionally available even though The Choicer
Voicer hides takes until the end. Immediate review makes retakes understandable
for young learners and supports parent-child play.

## Original Content

The feature uses an original counting-ducks mini-story, not an existing video,
recording, arrangement, or character design. The learner records these lines:

| Slot | Start | Line | Visual beat |
| --- | ---: | --- | --- |
| `line-1` | 0.8s | Five little ducks went out to play. | Five ducks enter the pond. |
| `line-2` | 6.8s | Over the hill and far away. | The flock swims toward a green hill. |
| `line-3` | 12.8s | One found a frog and stopped to say, “Hello!” | A frog appears; four ducks continue. |
| `line-4` | 18.8s | Four little ducks came splashing back. | Four ducks make bright ripples. |
| `line-5` | 24.8s | Three little ducks raced through the reeds. | Three ducks pass swaying reeds. |
| `line-6` | 30.8s | Two little ducks twirled round and round. | Two ducks circle a lily pad. |
| `line-7` | 36.8s | One little duck called, “Quack, quack, quack!” | One duck calls beside the bank. |
| `line-8` | 42.8s | Mama duck called, “Come home, my friends!” | Mama duck appears at sunset. |
| `line-9` | 48.8s | Five happy ducks came swimming back. | All five return for the finale. |

The replay ends at 56 seconds. Inline SVG shapes form the pond, hill, reeds,
frog, lily pads, mama duck, and five distinct ducklings. React selects the
visual beat from the authored timeline; standard Tailwind motion utilities add
gentle bobbing and are disabled by `prefers-reduced-motion`.

**Hear the line** uses the existing cancellable on-device English narrator.
The final music is a new, quiet pentatonic pattern synthesized with oscillators
and gain envelopes. It is scheduled at the same Web Audio start time as the
voice clips, needs no media licence, and adds no dependency or binary asset.

## Browser Architecture

`src/dubbing/dub-script.ts` owns the immutable script, slot IDs, cue offsets,
maximum record duration, and visual-beat metadata.

`src/dubbing/dub-api.ts` owns same-origin status, upload, private audio, and
delete requests. Uploads are raw `Blob` bodies so the Worker can apply a strict
byte limit without multipart overhead.

`src/dubbing/dub-state.ts` owns pure transitions for loading, introduction,
line readiness, microphone opening, recording, saving, review, final readiness,
final loading, final playback, and recoverable errors.

`src/dubbing/dub-playback.ts` fetches authenticated clips, decodes them to
`AudioBuffer`s, schedules every source at its authored cue against one
`AudioContext`, schedules the music bed, and reports elapsed time for the
animation. It returns one idempotent stop function that cancels sources,
animation frames, and the context.

`src/dubbing/DuckDub.tsx` composes the route UI and owns cancellable effects.
It aborts guide speech, microphone work, uploads, clip previews, and final
playback on retake, reset, or unmount. Async results carry a generation token
so a late result cannot mutate a newer line or an exited route.

`src/dubbing/DuckScene.tsx` renders both the small home-card illustration and
the responsive game stage. It contains no media URLs.

The generic recorder chooses a MIME type at runtime with
`MediaRecorder.isTypeSupported`, preferring MP4/AAC when available and then
WebM/Opus, MP4, WebM, or Ogg. The resulting recorder-reported MIME type is used
for the `Blob`; the existing hard-coded `audio/webm` assumption is removed.

## Private R2 API

The Worker exposes one fixed, authenticated API family:

- `GET /api/dubs/five-little-ducks-v1`
- `PUT /api/dubs/five-little-ducks-v1/lines/:lineId`
- `GET /api/dubs/five-little-ducks-v1/lines/:lineId/audio`
- `DELETE /api/dubs/five-little-ducks-v1`

Only the nine authored line IDs are valid. The user ID always comes from the
Better Auth session and is never accepted from the browser.

The proof of concept reuses the existing private personalized-art R2 bucket and
its already-purged account prefix:

```text
personalized-story-art/{encoded-user-id}/learner-dubs/
  five-little-ducks-v1/.dub-generation
  five-little-ducks-v1/{line-id}.audio
```

This deliberately avoids a new bucket, D1 table, migration, and account-delete
pipeline. Each fixed `.audio` key is the current slot, so replacing a take
cannot orphan an older browser format. Split voice data into its own bucket
when its retention, residency, or access policy differs from private story art.

R2 is the source of truth. `list` determines saved slots, `put` atomically
replaces a slot, `get` streams owner-only audio, and deleting the dub removes
the nine exact keys. HTTP metadata stores the normalized content type; custom
metadata stores the consent version, line ID, and recording timestamp.
The zero-byte `.dub-generation` coordination object stores only a unique reset
generation and `deleting` or `ready` state in custom metadata. Conditional R2
writes serialize resets; uploads capture and recheck the ready generation so a
reset cannot return success while an older upload recreates a clip. Status and
audio routes expose only the nine canonical line keys, while account deletion
sweeps the marker through the same owner prefix.

## Validation, Privacy, and Failure Handling

Every API request is session-gated. All JSON and audio responses use
`Cache-Control: private, no-store`; audio also uses
`X-Content-Type-Options: nosniff`.

Uploads require the current grown-up confirmation version in a request header,
are limited to 512 KiB, and accept only browser-recordable WebM, MP4, or Ogg
audio. The Worker checks both the normalized MIME type and container signature.
Empty, oversized, mismatched, unknown-line, and unsupported requests fail
without an R2 write.

The account-deletion tombstone is checked before and after upload. If deletion
begins during a write, the new object is deleted before the request returns.
Because dub keys live below the existing per-user purge prefix, Better Auth's
current account-deletion sweep removes both tracked clips and any interrupted
or orphaned dub object.

Recordings are never sent to speech recognition, analytics, a public bucket,
or a third-party media player. The UI makes no claim that a checkbox alone is
legal consent; it is a product safeguard and a clear disclosure for this
proof of concept.

Recoverable failures stay in context:

- microphone unsupported or denied: keep the line visible and allow retry;
- upload failure: retain the new `Blob` in memory and offer **Save again**;
- saved clip playback failure: offer **Try again** without discarding progress;
- one corrupt/undecodable final clip: return to that line for replacement;
- guide speech unavailable: keep recording enabled because the visible line is
  authoritative;
- route exit or reset: stop media tracks and audio immediately.

## Responsive and Accessible Presentation

The game uses one large primary action per state, minimum 48 px controls,
visible text in addition to icons, and stable accessible names while compact
labels hide at narrow widths. Status changes use one polite live region;
permission, upload, and playback failures use an alert.

At 280–390 px the stage, line card, and controls stack inside a vertically
scrollable `main`. At short landscape sizes the stage and controls use two
columns while the route and account headers remain clear. Desktop keeps the
stage dominant and caps line/control width. No viewport may horizontally
overflow, hide the active control, or place controls over the stage.

The home changes to a compact two-by-two grid on phones and four equal cards
on wide/short-landscape screens so all four activities remain picture-led.

## Verification

Test-first coverage will include:

- recorder MIME negotiation and recorder-reported Blob types;
- pure dubbing state transitions and first-missing-line resume logic;
- script cue ordering, six-second slot boundaries, and 56-second duration;
- Worker authentication, route validation, size/type/signature checks, owner
  isolation, atomic replacement, private streaming headers, reset, and the
  account-deletion race fence;
- browser behavior for confirmation, recording, saving, retaking, reload
  resume, final replay, reset, denied/unsupported microphones, and failed
  uploads;
- home and dubbing layouts at 280, 320, 390, short landscape, and desktop;
- fresh `npm test`, `npm run lint`, `npm run build`, and
  `npm run test:browser` runs before completion.

## External Constraints

The source screenshot is The Choicer Voicer's Dub Mode and is an interaction
reference only. YouTube's API policies prohibit applying alternate audio tracks
to embedded YouTube videos, so YouTube is not part of this implementation.
Child voice recordings are personal information in relevant jurisdictions;
this design therefore keeps them private, owner-scoped, explicitly disclosed,
deletable, and inside the existing account deletion lifecycle.
