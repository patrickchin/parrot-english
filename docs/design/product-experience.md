# Product Experience Design

## Summary

Parrot English is an English speaking experience for young children. After
authentication and the one-time onboarding flow, the learner arrives at a
four-card home menu for Lessons, Create a Lesson, Progress, and Storytelling.
A lesson plays like a short interactive episode: characters act out a
situation, a character models a useful line, the learner repeats it, and a
voice-only narrator gives brief feedback.

All child-facing dialogue and narration is in English. Steps within the current
scene advance automatically except when the learner must press and hold the
microphone button to speak, and playback advances automatically across scene
boundaries. Start begins the current scene, while Previous and Next restart
adjacent scenes from their first steps.

## Entry and Navigation

The durable entry sequence is:

1. Anonymous visitors are sent to `/login`, with their original protected URL
   preserved as a safe `returnTo` value.
2. Authenticated learners who have not finished onboarding are sent to
   `/onboarding` and return to the preserved destination after completion.
3. Returning learners land on `/`, the authenticated home menu.

The home menu uses four equal activity cards. Lessons opens the combined lesson
catalog at `/lessons`. Create a Lesson, Progress, and Storytelling open
intentional skeleton pages at `/lessons/my/create`, `/progress`, and `/stories`.
Those routes are addressable now so links, refreshes, and browser history remain
stable as their full features are added. Each non-home page provides a direct
way back to the main menu.

## Roles

The lesson script uses three character roles:

- `peppa`: a visible story character.
- `dolly`: a visible story character who frequently models the learner's line.
- `user`: the scripted learner role, represented on screen only by the
  microphone prompt.

`narrator` is a global voice-only speaker. Narrator steps appear as captions and
never add a visible character or emote entry.

## Lesson and Scene Structure

`/lessons` is one catalog with two visibly separate sources. **Parrot Lessons**
contains the built-in curriculum discovered from independent JSON files in
`content/lessons`. **My Lessons** is reserved for lessons a learner creates;
until creation and persistence are implemented, it shows a friendly empty state
and a link to the creation skeleton. The two sources remain separate even when
they eventually use the same card presentation.

Parrot lesson URLs use `/lessons/parrot/:lessonId`, while learner-created lesson
URLs use `/lessons/my/:lessonId`. The source namespace prevents identical IDs
from conflicting and preserves the different storage and ownership rules. A
short Parrot lesson URL canonicalizes to scene 1. The catalog discovers built-in
files automatically, so authors can add or remove Parrot lessons without
changing application code.

A lesson contains five to eight scenes. Each scene provides:

- a title;
- a free-form setting description;
- a chosen pre-generated background ID;
- the scripted scene character IDs;
- an ordered list of steps.

Each step has one speaker and exactly one line of dialogue. It also selects one
pre-generated emote for every scripted scene character, including `user`. User
emote data remains complete even though the learner asset is not rendered. The
global emote set is intentionally small: `idle`, `talking`, `listening`,
`happy`, `sad`, and `surprised`.

## Automatic Lesson Loop

The implemented loop is:

1. The learner or adult opens a Parrot lesson card and presses Start lesson.
2. Character and narrator steps play automatically in script order.
3. A user step waits with an obvious hold-to-talk control.
4. The learner holds the microphone button, speaks, and releases it.
5. The app evaluates the recording after the microphone stops.
6. The narrator gives audible English feedback.
7. Success advances automatically.
8. The first unsuccessful attempt replays the preceding character model, then
   returns to the same user step.
9. A second unsuccessful attempt receives feedback and continues the story.
10. Final narrator praise completes the lesson and offers Replay Lesson.

No character or narrator audio plays while recording or evaluating.
Previous and Next restart the adjacent scene from its first step. Once started,
the current scene continues automatically except for the learner's
press-and-hold speaking turn.

The separate Back to lessons control returns to the catalog and unmounts the
active player. Reopening a lesson creates fresh state at scene 1. It never
shares behavior or placement with the playback dock's Previous scene control.
The separate Home control exits the player and returns to the four-card menu.

## Durable and Transient Lesson State

The active scene is durable navigation state. Its canonical address is
`/lessons/parrot/:lessonId/scenes/:sceneNumber` for a built-in lesson, with the
equivalent `/lessons/my/:lessonId/scenes/:sceneNumber` namespace reserved for a
learner-created lesson. Direct refreshes and browser Back/Forward restore the
addressed scene.

Playback phase, step progress within the scene, microphone permission,
recording, evaluation, and feedback are transient interaction state. They are
reset when the routed scene changes and are never encoded into the URL. Any
asynchronous work captured for an old route is invalidated before the new scene
becomes active, preventing stale audio, recording, or evaluation results from
advancing the restored scene.

## Hold-to-Talk State

Microphone access is not requested when the lesson starts. It is requested only
when the learner presses and holds the speaking button.

The user turn must:

- show the exact target line prominently;
- label the idle action as “Press and hold to speak”;
- label the active action as “Release when you finish”;
- support pointer and keyboard press-and-hold interaction;
- show a clear checking state after release;
- announce the turn and errors through accessible live regions;
- stop all media tracks before speech evaluation begins.

## Visual Design

The lesson list uses a scrollable responsive card grid with story artwork,
summaries, scene counts, and clear source headings. The player uses a fixed
full-screen stage, a selected catalog background, transparent character
sprites, rounded speech surfaces, and large tactile controls. A large standalone
Start lesson or Replay lesson action appears when appropriate. The reserved
bottom control dock contains Previous, Next, and the microphone prompt when it
is the learner's turn, without covering story elements. Character placement is
generic and based on each visible character's slot in the current scene, rather
than hard-coded names.

Design constraints:

- Keep controls and target text large enough for children and touch input.
- Keep character speech visually tied to the active speaker.
- Present narrator speech separately from character bubbles.
- Use more than color alone to identify recording and checking states.
- Respect reduced-motion preferences.
- Pre-generate every supported character/emote asset.

## Content Boundaries

Lesson JSON is text and catalog IDs only. It never stores image filenames,
audio filenames, voice IDs, or generation settings. Global catalogs own visual
asset paths, and the static audio manifest owns the optional saved-speech cache.
