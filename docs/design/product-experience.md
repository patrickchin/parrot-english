# Product Experience Design

## Summary

Parrot English is an English speaking experience for young children. After
authentication and the one-time onboarding flow, the learner arrives at a
home hub with Talk to Peppa, Lessons, Storytelling, Game, Create a Lesson, and
Pixel Lesson Lab as top-level activities. Progress appears underneath as a
smaller disabled preview. Create a Lesson opens the custom lesson authoring
flow directly; the same flow can also remain reachable from My lessons.
Storytelling opens a read-aloud script lab with 20 selectable prototypes across
four internal language bands. Their artwork and narration remain explicit
placeholders while the scripts are compared. Game keeps the standalone
pixel-garden experience, while Pixel Lesson Lab generates a transient speaking
mission and runs it in the same pixel-art engine. A lesson plays like a short
interactive episode: characters act out a situation, a character models a
useful line, the learner repeats it, and the script chooses a character or
narrator response when evaluation is enabled.

Bundled lesson dialogue and narration is in English; learner-created scripts
may use another language. Steps within the current scene advance automatically
except when the learner must press and hold the microphone button to speak, and
playback advances automatically across scene boundaries. Start begins the
current scene, while Previous and Next restart adjacent scenes from their first
steps.

## Entry and Navigation

The durable entry sequence is:

1. Anonymous visitors are sent to `/login`, with their original protected URL
   preserved as a safe `returnTo` value.
2. Authenticated learners who have not finished onboarding are sent to
   `/profile/setup` and return to the preserved destination after completion.
3. Returning learners land on `/`, the authenticated home menu.

The home hub opens free conversation at `/talk-to-peppa`, the combined lesson
catalog at `/lessons`, Storytelling at `/stories`, custom lesson authoring at
`/lessons/my/create`, the standalone pixel garden at
`/prototypes/pixel-stage/`, and the Pixel Lesson Lab at `/games`. The My lessons
section may provide another Create a Lesson link, but it is not the sole entry
point. Legacy `/progress` links safely redirect home. Home names Progress only
in a disabled “Coming soon” tile, so it adds context without creating dead-end
navigation.
Each non-home page provides a direct way back to Home or the lesson catalog.

## Storytelling Prompt Lab

`/stories` exposes 20 complete listen-and-join-in scripts rather than hiding
unbuilt titles behind disabled cards. The shelf groups them into First words,
Repeating patterns, Tiny stories, and Early A1. Every card states its narrative
word count, target words, assumed-familiar content words, and prompt mechanism
so an adult can compare the experiments while the child still gets a direct
Open the script action.

Every page contains one short narrator beat and one easier join-in line. A null
artwork source renders a neutral child-facing placeholder; production prompts
remain metadata and are not added to the controlled reading text. A null
narration ID disables the audio control with an Audio later label; it never
attempts saved playback or browser speech. Completion copy is owned by the
story instead of referring to one fixed character or plot.

The internal bands are product heuristics, not claims that age determines CEFR
level. The full research basis, vocabulary guidance, reusable prompt, and
selection plan live in `docs/design/young-learner-storytelling.md`.

## Roles

The lesson script uses three character roles:

- `peppa`: a visible story character.
- `dolly`: a visible story character who frequently models the learner's line.
- `user`: the scripted learner role, represented on screen only by the
  microphone prompt.

`narrator` is a global voice-only speaker. Narrator steps appear as captions and
never add a visible character or emote entry.

## Lesson and Scene Structure

`/lessons` is one catalog with two visibly separate sources. **Ready-made
lessons** contains the built-in curriculum discovered from independent JSON
files in `content/lessons`. **My lessons** lists lessons generated, imported, or
edited by the authenticated learner and may expose another Create a Lesson
action whether the list is empty or populated. Both sources share card and
player presentation while retaining separate ownership.

Parrot lesson URLs use `/lessons/parrot/:lessonId`, while learner-created lesson
URLs use `/lessons/my/:lessonId`. The source namespace prevents identical IDs
from conflicting and preserves the different storage and ownership rules. A
short Parrot lesson URL canonicalizes to scene 1. The catalog discovers built-in
files automatically, so authors can add or remove Parrot lessons without
changing application code.

## Create a Custom Lesson

Create a Lesson is a top-level Home activity that opens
`/lessons/my/create`. **Make with AI** accepts a bounded real-world topic, uses
the canonical learner profile name, and asks OpenAI `gpt-5.6-luna` for a
playable draft. **Import JSON** accepts an existing script for the same draft
workflow. Generation and import both lead into a GUI editor; authors do not need
to edit raw JSON to finish a lesson.

The editor is a visual lesson studio rather than a long form. Its primary
workspace is a horizontally scrollable storyboard: every scene thumbnail shows
the selected background and on-stage characters, and selecting a thumbnail
opens that scene for editing. A live scene preview combines the real catalog
background, character artwork, accumulated moods, active speaker, and current
dialogue so changes can be judged in context before the lesson is saved.

Backgrounds are chosen from image cards, characters from illustrated on-stage
cards, and character moods from portrait choices instead of text-only selects.
Dialogue is an ordered visual timeline: selecting a line updates the preview
and opens only that line's speaker, words, mood changes, ordering, and optional
speaking-check controls. Adding, removing, duplicating, and reordering scenes
or lines remains explicit.

Text-heavy metadata uses progressive disclosure. Lesson setup and goals, scene
titles and notes, and detailed speaking feedback remain available in expandable
sections without competing with the storyboard and preview. On narrow screens,
the storyboard scrolls horizontally and the preview stacks above the current
scene controls. Existing saved lessons use the same studio at
`/lessons/my/:lessonId/edit`. JSON import remains an advanced interoperability
path, not the primary authoring interface.

Generated and imported drafts still pass through the shared normalization and
validation boundary. Repairable issues appear as warnings beside the relevant
GUI review state, and save remains an explicit confirmation. Changing the form
invalidates any stale review until the updated draft has been validated again.

Saved lessons are scoped to the authenticated user and appear under My Lessons.
Their arbitrary-language dialogue is spoken through browser on-device speech;
built-in Parrot Lessons retain their authored ElevenLabs audio.

## Pixel Lesson Lab

The Pixel Lesson Lab activity opens `/games`, an intentionally transient
generation lab. A supervising adult describes an English practice idea, then
the app generates a short ordered mission and immediately loads it into a
React-owned Phaser preview. The sample mission remains playable before the
first generation, and the generated JSON is available behind an Advanced
disclosure for inspection and editing. Generating or editing a preview never
creates a saved lesson.

Pixel lesson JSON contains only bounded text and catalog IDs. The model can
choose among the four authored garden targets and four supported Peppa emotes;
the engine owns asset URLs, coordinates, collision bodies, camera behavior,
movement speed, and target proximity. A mission asks the learner to find one
target, reveals a phrase to practice, gives a scripted success response, and
then advances to the next target. Unsupported or incomplete generated values
receive safe defaults and visible warnings before the engine sees them.

A lesson contains one or more scenes. Each scene provides:

- a title;
- a free-form setting description;
- a chosen pre-generated background ID;
- the scripted scene character IDs;
- an ordered list of steps.

Each step has one speaker and a dialogue string. It may also select partial
emote changes for visible Peppa and Dolly characters. The learner uses the
non-visual `user` speaker ID and never appears in character or emote maps. The
global emote set is intentionally small: `idle`, `talking`, `listening`,
`happy`, `sad`, and `surprised`.

## Automatic Lesson Loop

The implemented loop is:

1. The learner or adult opens a Parrot lesson card and presses Start lesson.
2. Character and narrator steps play automatically in script order.
3. A user step waits with an obvious hold-to-talk control.
4. The learner holds the microphone button, speaks, and releases it.
5. If the user step contains `check`, the app evaluates the recording after the
   microphone stops; otherwise it continues without evaluation.
6. A checked turn plays the response speaker, dialogue, and emote changes
   selected by the script.
7. The response's `after` action retries or continues.
8. Retry replays the preceding character model, then returns to the same user
   step.
9. Reaching `maxAttempts` selects the script's final response and continues.
10. The final scripted line completes the lesson and offers Replay Lesson.

No character or narrator audio plays while recording or evaluating.
Previous and Next restart the adjacent scene from its first step. Once started,
the current scene continues automatically except for the learner's
press-and-hold speaking turn.

The separate Back to lessons control returns to the catalog and unmounts the
active player. Reopening a lesson creates fresh state at scene 1. It never
shares behavior or placement with the playback dock's Previous scene control.
The separate Home control exits the player and returns to the activity hub.

## Durable and Transient Lesson State

The active scene is durable navigation state. Its canonical address is
`/lessons/parrot/:lessonId/scenes/:sceneNumber` for a built-in lesson, with the
equivalent `/lessons/my/:lessonId/scenes/:sceneNumber` namespace for an owned
learner-created lesson. Direct refreshes and browser Back/Forward restore the
addressed scene.

Playback phase, step progress within the scene, microphone permission,
recording, evaluation, and scripted responses are transient interaction state.
They are reset when the routed scene changes and are never encoded into the
URL. Any
asynchronous work captured for an old route is invalidated before the new scene
becomes active, preventing stale audio, recording, or evaluation results from
advancing the restored scene.

## Microphone Toggle State

Microphone access is not requested when the lesson starts. It is requested only
when the learner activates the speaking button.

The user turn must:

- show the exact target line prominently;
- label the idle action as “Start speaking”;
- label the active action as “Stop speaking”;
- support pointer and keyboard toggle interaction;
- show a clear checking state after the learner stops recording;
- announce the turn and errors through accessible live regions;
- stop all media tracks before speech evaluation begins.

## Visual Design

The lesson list uses scrollable responsive cards with story artwork, summaries,
scene counts, and clear source headings. On phones, each card stacks a
full-width artwork banner, copy, and full-width action; the horizontal
artwork/content composition begins at the desktop breakpoint. The player uses
a fixed full-screen stage, a selected catalog background, transparent character
sprites, rounded speech surfaces, and large tactile controls. A large
standalone Start lesson or Replay lesson action appears when appropriate. The
reserved bottom control dock contains Previous, Next, and the microphone prompt
when it is the learner's turn, without covering story elements. Character
placement is generic and based on each visible character's slot in the current
scene, rather than hard-coded names.

Design constraints:

- Keep controls and target text large enough for children and touch input.
- Keep character speech visually tied to the active speaker.
- Present narrator speech separately from character bubbles.
- Use more than color alone to identify recording and checking states.
- Respect reduced-motion preferences.
- Pre-generate every supported character/emote asset.

## Content Boundaries

Lesson and pixel-lesson JSON are text and catalog IDs only. They never store image filenames,
audio filenames, voice IDs, or generation settings. Global catalogs own visual
asset paths. The static audio manifest owns built-in saved speech, while My
Lessons select on-device speech at the player boundary.
