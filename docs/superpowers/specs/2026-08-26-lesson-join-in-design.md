# Cartoon-First Lesson Join-In Design

## Goal

Replace the current stop-and-correct lesson loop with a continuous cartoon-like
experience. Story dialogue remains the center of the lesson. At natural moments,
the learner sees a short phrase and hears a quiet group say it, so they can join
in whenever they feel ready. The lesson never waits for an answer and never
corrects, scores, transcribes, retries, or praises an individual attempt.

When a guardian has granted the one-time lesson-recording consent in the learner
profile, the microphone starts automatically for each join-in moment and the
latest clip for that moment is saved privately to the signed-in account. Without
consent, permission, browser support, or a working microphone, the identical
cartoon and join-in cues continue without recording.

This change replaces the existing flow for both ready-made Parrot lessons and
guardian-created My Lessons. Scoring and recording review are deliberately out
of scope; the stored raw clips are the input for a later scoring feature.

## Learner Experience

The lesson introduction uses the title **Watch and join in** and explains that
the story keeps going while the learner can say the large words with the group.
The single primary action remains **Let's go**.

Starting a lesson does three things:

1. Read the account's saved guardian-consent state.
2. If recording is allowed, request microphone permission from that user gesture
   and release the preflight stream immediately.
3. Start the episode whether permission succeeded, failed, or was not requested.

Preflight only avoids surprising the learner with a permission prompt later.
Each join-in beat still reopens `getUserMedia()` through
`startSpeechRecording()`, and that later acquisition may fail independently. A
successful preflight is therefore never presented as a guarantee that a clip
will be recorded.

Character and narrator story lines then autoplay as they do today. A `user` step
is reinterpreted as an automatic **Join in** beat:

- the target phrase remains large and visible;
- a quiet group cue says the exact phrase in a ready-made lesson;
- a quiet on-device English guide says the phrase in a My Lesson;
- if preflight and consent succeeded, recording starts just before the cue;
- recording stops 250 ms after the cue ends;
- the lesson advances immediately, without checking or commenting on speech;
- the finished blob is queued for private background saving.

The cue is useful even if the learner stays silent. No copy implies that silence
is a failure. A child may listen through several scenes and begin joining later.

Pause, previous scene, next scene, Back, and route changes cancel an unfinished
join-in capture and stop its cue. Resuming or revisiting starts that join-in beat
cleanly. A clip that already finished continues through its save queue and is
not discarded merely because the visible scene changes.

The story never waits for storage. On the completion screen, a neutral status
reports **Saving your voices…** while uploads remain. A failed blob stays in
memory and the completion screen offers **Try saving again**; it never asks the
child to repeat the line. Replay and Back remain available after the queue has
settled. Normal browser/tab termination cannot guarantee an in-memory retry, so
the primary path uploads each clip as soon as it is captured.

## Lesson State and Player Boundaries

`lib/lesson-state.js` is simplified to the presentation states the new flow
actually needs:

- `idle`
- `speaking`
- `joining-in`
- `paused`, with `speaking` or `joining-in` as its resume phase
- `finished`

`LINE_DONE` advances a story line, and `JOIN_IN_DONE` advances a learner line.
The recording, evaluating, responding, attempt, transcript, response, skip, and
retry states/events are removed from lesson playback. The lesson JSON validator
continues to accept legacy `check` blocks so old imported lessons remain
loadable, but the runtime ignores them.

`LessonPlayer` no longer imports or calls `finishSpeechOperation` or
`evaluateSpeech`. No completion path can dispatch the old microphone,
evaluation, or response events: a `user` step advances only through
`JOIN_IN_DONE`, whether or not a usable blob was captured.

`src/app/App.tsx` keeps ownership of the player orchestration. It gains one
cancellable join-in effect that coordinates cue playback, optional recording,
the short tail, and advancement. Existing route-generation guards prevent late
media work from mutating a new scene. Completed blobs move to a separate save
queue with no route-scoped abort controller, so `cancelPendingWork()` can stop
the visible cue/capture without cancelling an already-created clip. Each slot
has exactly one promise chain: a new upload or retry for that slot appends after
the prior promise settles, ensuring an older upload completes before a replayed
clip overwrites the same key.

`src/lessons/LessonPlayerUi.tsx` replaces the manual microphone/checking controls
and feedback card with a `LessonJoinInPrompt`. It shows **Join in**, the phrase,
and a small listening/recording indicator, while the normal playback controls
remain available. It does not expose record, stop, skip, retry, transcript, or
score controls.

Static cue playback and device speech each accept a volume option. Ready-made
join-in cues play at 0.28 volume; My Lesson device guides use the same quiet
level. A cue playback failure falls back to a short phrase-display interval and
then advances, so unavailable audio cannot stop the episode.

## Content and Audio

All seven ready-made lesson scripts are shortened:

- remove the 18 generic narrator prompts such as `Let's copy Dolly!`;
- remove the duplicate character model line inserted after each prompt;
- keep the original story-native character line immediately before its learner
  join-in step;
- remove every `check` block and its success/retry responses;
- remove the seven final narrator-only `Great job!` lines.

This leaves 18 join-in beats covering 17 unique phrases. The story character
says each phrase naturally once; the following quiet group cue is the signal to
join, not another narrator instruction.

The 17 ready-made group MP3s are derived from the existing checked-in
ElevenLabs character recordings by mixing small timing and pitch variants with
FFmpeg. This produces an audible group without macOS/system text-to-speech,
protected voice cloning, a runtime dependency, or a new external-generation
credential. Source assets live in `public/assets/audio`. The static-audio
manifest maps each exact join-in phrase to its group asset and tests require
every ready-made `user` step to resolve one.

My Lessons do not generate durable chorus media at authoring time. Their exact
target is spoken quietly with the existing on-device English voice. The lesson
generator is updated to create story-native character dialogue followed
directly by optional unchecked learner join-ins, and to avoid instructional
narrator prompts, feedback, retries, and closing praise. The GUI editor stops
creating or presenting pronunciation checks and defaults new dialogue to a
story character. Existing imported checks may remain in JSON for compatibility
but have no runtime effect.

## Guardian Consent

Consent version `lesson-join-in-recording-v1` is stored on the one learner
profile as `lesson_recording_consent_version` and
`lesson_recording_consent_at`. It is account-level, persists across sessions,
and is not tied to a 15-minute guardian unlock.

The guardian-only Learner profile page gains a **Lesson voice recordings**
section. Before consent, it explains that Parrot can automatically save the
learner's private voice during join-in moments and provides **Allow lesson voice
recordings**. After consent, it reports that recording is allowed and provides
**Stop and delete lesson recordings**.

Revocation first clears the stored consent and then deletes every lesson clip
under that user's exact lesson-recording prefix. The destructive action requires
confirmation and explains that it cannot be undone. Clearing consent before the
R2 sweep makes new uploads fail closed; upload post-checks remove any request
that raced with revocation. Consent can be granted again later.

An authenticated learner route may read only `{ enabled: boolean }`. Only a
currently unlocked guardian session may grant or revoke consent. The browser
never asserts consent in an upload header: the Worker verifies the stored
profile value for every write.

The AI and saved-data notice is updated to say that lesson voice clips are saved
only after guardian consent, are private to the signed-in account, are replaced
by later takes for the same moment, are not currently scored or transcribed,
and are deleted on revocation or account deletion.

## Private Recording Storage

The existing private `PERSONALIZED_STORY_ART_BUCKET` is reused. No D1 recording
table or history model is added. Each deterministic object key is the one
current slot:

```text
personalized-story-art/{encoded-user-id}/lesson-recordings/
  parrot/{encoded-lesson-id}/scene-{scene-index}/step-{step-index}.audio
  my/{encoded-lesson-id}/scene-{scene-index}/step-{step-index}.audio
```

Putting a replayed clip to the same key replaces the previous bytes, satisfying
the latest-only rule without orphaning attempts. Custom metadata records source,
lesson ID, zero-based scene and step indices, exact target text, recorded time,
and consent version. The user ID always comes from the authenticated session.

The authenticated API is intentionally write-only for this release:

- `GET /api/lesson-recordings/consent` returns recording availability;
- `PUT /api/lesson-recordings/:source/:lessonId/scenes/:scene/steps/:step`
  replaces the owned slot with the raw browser-recorded blob;
- `PUT /api/profile/lesson-recording-consent` grants or revokes consent, with
  revocation also deleting the lesson-recording prefix.

The Worker resolves the target step itself. Ready-made IDs resolve against the
checked-in catalog; My Lesson IDs resolve against an owner-scoped D1 row. The
indices must address a `user` step. This prevents a browser from inventing a
target or writing clips for another account. Updating a My Lesson clears that
lesson's recording prefix because positional prompts may have changed.

Uploads are limited to 512 KiB and browser-recordable WebM, MP4, or Ogg. The
Worker validates the normalized MIME type and container signature, stores
`Cache-Control: private, no-store` semantics where applicable, and checks the
permanent account-deletion tombstone plus current consent both before and after
the write. If either becomes invalid during the request, the exact slot is
deleted and the upload fails. The existing account-deletion sweep already owns
the parent `personalized-story-art/{user}/` prefix, so it removes all lesson
recordings with the account.

## Failure and Privacy Rules

- Consent missing, stale, or unreadable: do not request the mic and do not save;
  play the same join-in cue and continue.
- Microphone unsupported or denied: remember the failure for this lesson, show
  one calm non-blocking notice, play every cue, and continue.
- Recording start/stop failure: cancel that clip, play/finish the cue, and
  continue without a retry demand.
- Cue audio unavailable: cancel and deliberately discard that partial capture,
  keep the phrase visible for a bounded fallback delay, and continue.
- Upload failure: keep the blob in the in-memory save queue and offer a neutral
  completion-screen retry; never alter the story state.
- Consent revoked or account deletion pending: the server rejects the write and
  removes racing bytes; the client treats recording as disabled.
- Recordings are not sent to speech recognition, evaluation, analytics, public
  storage, or a third-party player in this release.

## Responsive and Accessible Presentation

The existing lesson stage, HUD, character, and full-scene layouts remain based
on `LessonPlayerUi.tsx` and shared controls. The Join in phrase is the dominant
text during its beat, with a stable accessible heading and a polite status
announcement. Recording state is communicated by text as well as an icon, but
silence is never described as an error.

At 280–390 px, short landscape, and desktop sizes, the phrase and playback
controls must remain contained and must not overlap the route header or artwork.
All existing reduced-motion, focus, route-exit, and accessible-name behavior is
preserved.

## Verification

Test-first coverage includes:

- simplified lesson-state transitions, pause/resume, scene navigation, and
  automatic join-in advancement;
- quiet static/device cue volume and cue failure fallback;
- recorder preflight, auto-start/stop, no-consent and denied-mic continuation;
- per-slot upload ordering, immediate background saves, completion retry, and
  latest-only overwrite behavior;
- Worker authentication, owner isolation, server-resolved targets, stored
  consent, guardian-only mutation, size/MIME/signature checks, revocation purge,
  My Lesson edit purge, and account-deletion races;
- ready-made scripts contain no coaching narrator prompts, checks, generic
  feedback, duplicate target models, or final `Great job!` line;
- all ready-made user steps resolve exact checked-in group cues;
- generated/editor-authored lessons favor direct story-native join-ins;
- truthful guardian/profile and AI-data copy;
- lesson-player behavior and containment at ultra-narrow, short-landscape, and
  desktop sizes through accessible Playwright locators;
- fresh `npm test`, `npm run lint`, `npm run build`, and
  `npm run test:browser` runs before completion.

## Deferred Work

This release does not score, transcribe, summarize, list, replay, download, or
share saved lesson clips. It does not retain attempt history, build an offline
upload database, generate a custom chorus for My Lessons, or add a guardian
recording-review screen. Those features can use the private raw latest-slot
recordings later without changing the learner's continuous cartoon flow.
