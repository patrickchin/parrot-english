# Product Experience

## Product Promise

Parrot English helps young learners practice spoken English through four
focused activities:

1. **Talk to Peppa** for a short, learner-controlled conversation.
2. **Speaking lessons** for guided listen-and-repeat practice inside a story.
3. **Story time** for levelled read-aloud stories with simple join-in lines.
4. **Dub a rhyme** for recording and replaying a private saved performance.

The authenticated home presents only these learner activities. Profile,
content, consent, privacy, and account management live behind authenticated
Guardian-only UI and API boundaries. The current temporary Guardian-entry flow
is passwordless for a signed-in session; it does not remove authentication,
ownership checks, or those management boundaries. Product experiments,
comparison renderers, internal content metrics, and roadmap placeholders do not
appear in learner navigation.

## Learner and Guardian Modes

One Better Auth account is the Guardian account and may own multiple learner
profiles. Each authenticated browser session has at most one active learner,
selected independently from other sessions. An authenticated session starts in
learner mode. The fixed profile control names only the active learner in learner
mode (or the generic `Learner` label when none is selected) and the Guardian
account in Guardian mode.

The learner dropdown contains `Switch learner` followed by `Grown-up access`.
The switch action opens the shared owned-profile chooser; the dropdown itself
does not list sibling names or expose profile editing, consent, privacy,
sign-out, or account controls. The Guardian dropdown shows the
four account actions in a stable order: Guardian dashboard, Manage learners,
Account & privacy, and Sign out. It does not show a current learner or account
deletion shortcut. Learner administration stays on Manage learners, while
account deletion stays inside the Account & privacy page's Danger zone.

Selecting `Grown-up access`, or entering a declared Guardian route directly,
automatically requests Guardian access for the already-authenticated Better Auth
session. The current temporary flow has no intermediate password dialog. This
passwordless handoff is a deliberately weaker temporary boundary; account
authentication, learner ownership, and Guardian-only server authorization still
apply. A successful grant lasts for at most 15 minutes. Its fixed expiry
survives refresh and another tab sharing the session, but ordinary activity
never extends it. Genuine access failures keep the requested URL behind a
visible error and Retry action.

`Switch to learner` opens `Who is learning now?`. The chooser presents one
direct `Start learner mode as {name}` button per owned learner; choosing the
button is the complete selection action. The app selects that learner, removes
the server grant, then opens the requested learner route. If selection or
locking fails, the Guardian screen and URL remain in place with an error. Cancel
changes neither the active learner nor Guardian access. Expiry retains a
Guardian deep link behind the automatic access check so a new grant can resume
it without flashing protected content. In learner mode, `Switch learner` opens
the same chooser; selecting an owned profile returns to learner home without
calling the Guardian lock API.

When a session has more than one learner and no valid selection, learner mode
fails closed with the required `Who is learning now?` page. It does not guess a
learner, show a Cancel path, or require Guardian mode; it lists the account's
owned profiles for direct selection.

Learner mode exposes no profile editing, AI/data notice, sign-out, account
deletion, consent, or deletion controls. Guardian mode exposes those management
actions but not a duplicate learner activity catalog.

| Capability                                          | Learner                                      | Guardian                      | Enforcement                                           |
| --------------------------------------------------- | -------------------------------------------- | ----------------------------- | ----------------------------------------------------- |
| Complete first-time learner setup                   | Yes, for the selected learner                | Yes                           | Authenticated session plus selected learner           |
| List owned learner profiles                         | Yes, in the switch/required picker            | Yes                           | Authenticated account ownership                       |
| Add, edit, or delete learner profiles               | No                                           | Yes                           | Live Guardian unlock; ownership checked by the server |
| Choose who enters learner mode                      | Yes, during Switch learner                    | Yes, during Switch to learner | Authenticated owned-learner selection                  |
| Talk, play lessons, read stories                    | Yes                                          | Switch to learner             | Authenticated session                                 |
| See whether voice dubbing is available              | Yes                                          | Yes                           | Authenticated, learner-scoped status                  |
| Record, retake, and replay saved dub lines          | Yes, after guardian consent for that learner | Switch to learner             | Current learner's durable consent grant               |
| Allow voice-clip storage                            | No                                           | Yes                           | Guardian unlock plus learner-scoped v2 consent        |
| Turn off dubbing and delete saved clips             | No                                           | Yes                           | Guardian unlock plus learner-scoped fenced cleanup    |
| Join in with lesson phrases                         | Yes                                          | Switch to learner             | Authenticated selected learner                        |
| Save the latest lesson join-in clip                 | Yes, after guardian consent for that learner | Switch to learner             | Current learner's durable recording consent           |
| Allow, stop, or delete lesson voice recordings      | No                                           | Yes                           | Guardian unlock plus learner-scoped fenced cleanup    |
| Edit learner profile or redo setup                  | No                                           | Yes                           | Guardian unlock                                       |
| Open AI/data notice                                 | No                                           | Yes                           | Guardian UI boundary                                  |
| Sign out                                            | No                                           | Yes                           | Guardian UI boundary                                  |
| Delete account and every learner's data             | No                                           | Yes                           | Guardian UI plus account-password confirmation        |

## Entry and Navigation

Anonymous visitors are sent to `/login` with a validated same-origin `returnTo`
value. After authentication, Guardian return targets normalize to learner home;
validated learner deep links remain intact. Authenticated learners complete the
one-time profile flow at `/profile/setup`, then continue to the requested
activity or `/`.

If the account owns one learner, a new session may select it automatically. If
it owns multiple learners, a new session without a valid selection shows the
required owned-profile picker. A missing, stale, or foreign selection never
falls through to a sibling.

Durable learner routes are:

- `/talk-to-peppa`
- `/lessons`
- `/lessons/parrot/:lessonId/scenes/:sceneNumber`
- `/stories`
- `/stories/:storyId/pages/:pageNumber`
- `/dubs/five-little-ducks`

Canonical guardian routes are:

- `/guardian` — dashboard;
- `/guardian/learners` — learner roster, creation, deletion, and details entry;
- `/guardian/learners/:learnerId` — page-local learner details and setup redo;
- `/guardian/profile` — retired compatibility route redirected to Manage
  learners;
- `/guardian/dubbing` — durable voice-dubbing consent and clip deletion;

Initial `/profile/setup` remains available to either mode until onboarding is
complete; later editing and setup redo are Guardian-only. Adding a learner asks
only for the preferred name and opens that learner's details without changing
who will enter learner mode.

Manage learners is strictly CRUD-only: it has no current badge, selector, or
mode-selection action. Deleting a learner requires a Guardian-only,
name-specific confirmation. The final usable learner cannot be deleted; the
Guardian must add a replacement first. A cleanup failure leaves that learner
marked for deletion, inaccessible to learner mode and settings selectors, with
a `Finish deleting` retry that survives refresh. Deleting the active learner
clears the session selection and never auto-selects a sibling; Guardian mode
remains navigable and the next `Switch to learner` opens the chooser.

Guardian navigation is recoverable from every state. Missing, malformed,
external, learner-mode, unknown, or self-referential Guardian `returnTo` values
fall back to `/guardian`. Profile Back, Cancel, Save, setup completion, errors,
and redo use that policy. If an unlocked Guardian reaches a learner route, the
mode boundary offers both `Back to Guardian dashboard` and an explicit switch
to learner mode. Unknown routes fall back to `/guardian` in Guardian mode and
`/` in learner mode.

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

The learner lesson catalog shows the ready-made built-in lessons. Each row has
one clear Start action. Ready-made lessons use one consistent 16:9 scene
illustration per step as their default presentation; learners do not choose
between rendering experiments.

A lesson plays as a short, continuous cartoon episode:

1. The learner starts the lesson.
2. Character and narrator lines play automatically.
3. A join-in beat shows the exact phrase and plays a quiet group cue.
4. The learner may say the phrase with the group, but the story never waits,
   scores, corrects, or treats silence as failure.
5. When a Guardian has enabled lesson voice recordings for this learner, the
   microphone captures that short beat automatically and privately saves only
   the latest clip for the same moment.
6. Missing consent, microphone access, cue audio, or storage never blocks the
   cartoon; the phrase remains available and the story continues.

Previous and Next restart the adjacent scene at its first step. Browser
Back/Forward and direct refresh restore the routed scene while transient audio,
recording, and step state reset safely.

## Story Time

The story shelf offers four progressive learner levels:

- First words
- Repeating patterns
- Tiny stories
- Early A1

Existing profiles open at their stored starting level. Learners can switch
among every built-in level directly on the shelf; no Guardian story-settings
page or art-management controls remain. Each learner level contains curated
stories, and the same selector includes public Long stories with saved
narration. All stories use the same authenticated shelf and reader routes;
there is no preview-only story shell. A story card shows its cover, title, and
one Listen action. Prompt experiments, vocabulary audit data, uncontrolled
baselines, and teaching diagnostics stay out of the learner interface.

The reader moves page by page, presents one join-in line, and keeps narration
controls separate from page navigation. Returning from a story restores the
story's shelf. Stories always render their checked-in catalog artwork.

## Dub a Rhyme

Five Little Ducks is a durable authenticated studio at
`/dubs/five-little-ducks`. Before consent it shows the child-readable message
**Ask a grown-up to turn on voice dubbing in Guardian mode.** It never asks the
learner to self-attest as an adult. A guardian grants the durable
`guardian-voice-r2-v2` consent for the active learner at `/guardian/dubbing`,
then switches back to learner mode. The learner opens a full-video project home:
the 98-second duck video is prominent, its six scene controls are always
selectable, and the project bar shows how many of the traditional rhyme's 24
clips are recorded. **Continue Scene** opens the first missing line, but the
learner can open any scene at any time. Each scene contains four independent
line clips; an incomplete scene selects its first missing line, while a
completed scene opens for review.

The full video and every four-line scene can play as a draft at any completion
level. Saved clips use private audio for the active learner and unfinished clips
use checked-in ElevenLabs guide audio, synchronized with the matching animation
and music. A saved clip that cannot load or decode falls back to its guide and
marks that line's scene **Needs retake** for this browser session only. If both
sources fail, the animation and music continue without that voice and identify
the affected line. Reloading clears the marker until playback discovers the
failure again.

The focused scene recorder shows the selected lyric, **Hear example**, and a
fixed recording action that changes among **Record line**, **Stop recording**,
and **Record again**. There is no countdown: recording starts as soon as
microphone access is ready and stops early or after its six-second limit. After
recording, the learner can see the decoded waveform and use **Hear my voice**.
Saving keeps the learner on the same line for review, replacement, scene
playback, another line choice, or return to the full video; there is no required
Next action or automatic advancement. Consent, `Grown-up options`, reset, and
deletion controls do not appear in learner mode.

Only a live Guardian session can turn dubbing off and delete the active
learner's saved clips. Every learner has an independent namespace and grant.
Recordings live only under
`accounts/{user}/learners/{learner}/recordings/{nursery-rhymes|lessons}/` in
the private-media bucket; there is no story-art or account-root recording
fallback. Dubbing playback accepts only the current v2 recording envelope.
Whole-account deletion closes the account namespace so stale uploads cannot
recreate voice data. Recordings are not shared publicly or sent to speech
recognition.

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
- In the dubbing studio, keep the full video dominant on project home and the
  selected lyric and fixed recording action clear in the scene editor.

## Content Boundaries

Built-in lesson JSON contains text and catalog IDs, never image filenames,
audio filenames, voice IDs, or generation settings. Global catalogs own visual
assets, and the static audio manifest owns saved speech. Story scripts are
checked in and validated against their level limits. Profiles, onboarding
progress, conversations, dubbing consent, and saved clips remain isolated per
learner; authentication, Guardian unlock, rate limits, and whole-account
deletion remain account- or session-scoped.
