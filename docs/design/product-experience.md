# Product Experience

## Product Promise

Parrot English helps young learners practice spoken English through four
focused activities:

1. **Talk to Peppa** for a short, learner-controlled conversation.
2. **Speaking lessons** for guided listen-and-repeat practice inside a story.
3. **Story time** for levelled read-aloud stories with simple join-in lines.
4. **Dub a rhyme** for recording and replaying a private saved performance.

The authenticated home presents only these learner activities. Profile,
content, consent, privacy, and account management live in password-protected
guardian mode. Product experiments, comparison renderers, internal content
metrics, and roadmap placeholders do not appear in learner navigation.

## Learner and Guardian Modes

One Better Auth account is the Guardian account and may own multiple learner
profiles. Each authenticated browser session has at most one active learner,
selected independently from other sessions. An authenticated session starts in
learner mode. The fixed profile control names only the active learner in learner
mode (or the generic `Learner` label when none is selected) and the Guardian
account in Guardian mode.

The learner dropdown contains one `Grown-up access` action. It never lists
sibling names or exposes profile selection, editing, content authoring,
consent, privacy, sign-out, or account controls. The Guardian dropdown shows the
account identity, a `Managing {learnerName}` context, and these actions in a
stable order: Guardian dashboard, Learner profiles, manage the active learner's
details, switch to that learner, AI and saved data, sign out, and delete
account. The full roster stays on its dedicated management page.

Selecting `Grown-up access` requires the same password used to sign in to the
Guardian account. There is no separate Guardian password or PIN. A successful
check unlocks Guardian mode for that auth session for at most 15 minutes. The
fixed expiry survives refresh and another tab sharing the session, but ordinary
activity never extends it. Switching back to learner first removes the server
unlock, then opens `/`. If locking fails, the Guardian screen and URL remain in
place with an error. Expiry retains a Guardian deep link behind the password
gate so a new unlock can resume it without flashing protected content.

When a session has more than one learner and no valid selection, learner mode
fails closed with `Ask a grown-up to choose a learner`. It does not guess a
learner or render the roster. Unlocking Guardian mode opens the learner manager,
where the Guardian can make an explicit selection.

Learner mode exposes no profile editing, AI/data notice, sign-out, account
deletion, lesson authoring, story settings, photo, consent, generation, or
deletion controls. Guardian mode exposes those management actions but not a
duplicate learner activity catalog.

| Capability | Learner | Guardian | Enforcement |
| --- | --- | --- | --- |
| Complete first-time learner setup | Yes, for the selected learner | Yes | Authenticated session plus selected learner |
| List, add, select, or manage learner profiles | No | Yes | Live Guardian unlock; ownership checked by the server |
| Talk, play lessons, read stories | Yes | Switch to learner | Authenticated session |
| See whether voice dubbing is available | Yes | Yes | Authenticated, learner-scoped status |
| Record, retake, and replay saved dub lines | Yes, after guardian consent for that learner | Switch to learner | Current learner's durable consent grant |
| Allow voice-clip storage | No | Yes | Guardian unlock plus learner-scoped v2 consent |
| Turn off dubbing and delete saved clips | No | Yes | Guardian unlock plus learner-scoped fenced cleanup |
| View saved custom lessons for playback | Yes | Switch to learner | Selected-learner read |
| Edit learner profile or redo setup | No | Yes | Guardian unlock |
| Choose stored story level | No | Yes | Guardian unlock |
| Create, generate, import, or update custom lessons | No | Yes | Guardian unlock |
| Upload a learner photo or generate/delete story art | No | Yes | Guardian unlock plus consent for the active learner |
| View already-generated story art | Yes | Yes | Selected-learner read |
| Open AI/data notice | No | Yes | Guardian UI boundary |
| Sign out | No | Yes | Guardian UI boundary |
| Delete account and every learner's data | No | Yes | Guardian UI plus account-password confirmation |

## Entry and Navigation

Anonymous visitors are sent to `/login` with a validated same-origin `returnTo`
value. Authenticated learners complete the one-time profile flow at
`/profile/setup`, then continue to the requested activity or `/`.

If the account owns one learner, a new session may select it automatically. If
it owns multiple learners, a new session without a valid selection stays at the
learner-safe grown-up prompt until a Guardian chooses one. A missing, stale, or
foreign selection never falls through to a sibling.

Durable learner routes are:

- `/talk-to-peppa`
- `/lessons`
- `/lessons/parrot/:lessonId/scenes/:sceneNumber`
- `/lessons/my/:lessonId/scenes/:sceneNumber`
- `/stories`
- `/stories/:storyId/pages/:pageNumber`
- `/dubs/five-little-ducks`

Canonical guardian routes are:

- `/guardian` — dashboard;
- `/guardian/learners` — learner roster, creation, selection, and details entry;
- `/guardian/profile` and `/guardian/profile/setup` — active-learner details
  and setup redo;
- `/guardian/lessons` — saved custom lesson management;
- `/guardian/stories` — stored story level and personalized-art management;
- `/guardian/dubbing` — durable voice-dubbing consent and clip deletion;
- `/lessons/my/create` and `/lessons/my/:lessonId/edit` — existing authoring
  URLs protected by the same Guardian boundary.

Initial `/profile/setup` remains available to either mode until onboarding is
complete; later editing and setup redo are Guardian-only. Adding a learner asks
only for the preferred name, selects the new profile for the current session,
and opens its details flow. Individual learner deletion is deliberately not
available in this release; details remain editable and whole-account deletion
removes every learner.

Guardian navigation is recoverable from every state. Missing, malformed,
external, learner-mode, unknown, or self-referential Guardian `returnTo` values
fall back to `/guardian`. Profile Back, Cancel, Save, setup completion, errors,
and redo use that policy. Custom-lesson Back and Save return to
`/guardian/lessons`. If an unlocked Guardian reaches a learner route, the mode
boundary offers both `Back to Guardian dashboard` and an explicit switch to
learner mode. Unknown routes fall back to `/guardian` in Guardian mode and `/`
in learner mode.

## Talk to Peppa

Talk to Peppa currently shows a learner-safe unavailable screen. When the
conversation experience is enabled, it shows one calm status, Peppa's latest
line, the learner's live transcript, and one large turn control. It does not
expose developer timing, transcript history, profile-writing controls, or a
grown-up chat-style selector; the adult prompt style remains an internal
default.

The learner may interrupt, repeat Peppa's latest completed line, or finish at
any time. Ordinary chat never updates the learner profile. Raw audio is not
stored. Each conversation is permanently bound to the learner who started it;
changing the session's active learner does not reassign earlier conversations.

## Speaking Lessons

The learner lesson catalog shows seven ready-made lessons first, then any saved
custom lessons for the active learner. Each row has one clear Start action.
Creation and editing live at `/guardian/lessons` and its protected create/edit
routes, so authoring does not compete with learner practice. Selecting another
learner refreshes the catalog before that learner's pages render. Ready-made
lessons use one consistent 16:9 scene illustration per step as their default
presentation; learners do not choose between rendering experiments.

A lesson plays as a short interactive episode:

1. The learner starts the lesson.
2. Character and narrator lines play automatically.
3. A learner line pauses the story and shows the exact phrase.
4. The learner taps the microphone, speaks, then taps again to finish.
5. The app checks the recording and plays brief feedback.
6. Success continues automatically; bounded retry behavior handles a miss.

Previous and Next restart the adjacent scene at its first step. Browser
Back/Forward and direct refresh restore the routed scene while transient audio,
recording, evaluation, and step state reset safely.

## Story Time

Guardian story settings offer four progressive learner levels:

- First words
- Repeating patterns
- Tiny stories
- Early A1

The choice is stored on the active learner profile. The learner shelf always
opens at that learner's stored level and contains no level selector or
art-management controls.
Each level contains five curated stories. A story card shows its cover, title,
and one Listen action. Prompt experiments, vocabulary audit data, uncontrolled
baselines, and teaching diagnostics stay out of the learner interface.

The reader moves page by page, presents one join-in line, and keeps narration
controls separate from page navigation. Returning from a story restores the
active learner's stored-level shelf. Already-generated private art for that
learner may appear in stories and lessons; sibling art cannot. Upload, consent,
generation, and deletion remain Guardian-only.

## Dub a Rhyme

Five Little Ducks is a durable authenticated studio at
`/dubs/five-little-ducks`. Before consent it shows the child-readable message
**Ask a grown-up to turn on voice dubbing in Guardian mode.** It never asks the
learner to self-attest as an adult. A guardian grants the durable
`guardian-voice-r2-v2` consent for the active learner at `/guardian/dubbing`,
then switches back to learner mode. The learner records the authentic
traditional six-stanza rhyme one line at a time. Its 24 lines count down from
five ducklings to none, then
end with sad mother duck bringing all five home. Progress is saved to that
learner profile, resumes at the first missing line, and is presented as six
four-line verses rather than one long 24-step task. Completing each verse plays
those four saved voice clips with the matching animation and music before the
next verse opens. All six verses unlock one synchronized 98-second final
performance.

Voice clips and consent are private to one learner within the account. Entering
a line autoplays its checked-in ElevenLabs narrator example; **Replay example**
remains available. The current **Now read** lyric dominates the compact title,
and the responsive studio keeps the animated scene clear. After recording, the
learner can choose **Hear my voice** and see a waveform decoded from the actual
local take before the primary **Next line** action. **Record again**, **Record
another take**, and **Watch my dub** remain learner capabilities; consent,
`Grown-up options`, reset, and deletion controls do not.

Only a live Guardian session can turn dubbing off and delete the active
learner's saved clips. The original migrated learner retains the exact legacy
account-level dub namespace; every added learner gets an independent
learner-prefixed namespace and grant. A v2 revoke for the legacy owner also
retires the old v1 prefix with ten non-audio fences. Whole-account deletion
enumerates every learner namespace and persists its marker and line-slot
fences, so stale uploads cannot recreate voice data. Recordings are not shared
publicly or sent to speech recognition.

## Visual and Interaction Rules

- Use large touch targets, plain English, and accessible names.
- Keep one primary action per card or state.
- Do not use disabled roadmap cards in learner navigation.
- Do not expose internal labels such as experiment, pipeline, prompt test, or
  comparison.
- Keep route and profile controls visually consistent through shared UI
  primitives.
- Respect reduced motion and prevent horizontal overflow from 280 px upward.
- Keep lesson controls clear of characters, speech, and the account header.
- In the dubbing studio, keep the active lyric visually dominant, the title
  compact, and the fixed Record/Next action slots in the same physical places.

## Content Boundaries

Built-in lesson JSON contains text and catalog IDs, never image filenames,
audio filenames, voice IDs, or generation settings. Global catalogs own visual
assets, and the static audio manifest owns saved speech.

My Lessons use the same validated lesson contract but are scoped to one learner
profile in D1. Story scripts are checked in and validated against their level
limits. Profiles, onboarding progress, conversations, personalized art, dubbing
consent, and saved clips remain isolated per learner; authentication, Guardian
unlock, rate limits, and whole-account deletion remain account- or
session-scoped.
