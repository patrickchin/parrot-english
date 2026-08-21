# Product Experience

## Product Promise

Parrot English helps young learners practice spoken English through three
focused activities:

1. **Talk to Peppa** for a short, learner-controlled conversation.
2. **Speaking lessons** for guided listen-and-repeat practice inside a story.
3. **Story time** for levelled read-aloud stories with simple join-in lines.

The authenticated home presents only these learner activities. Custom lesson
creation remains a secondary grown-up action inside the lesson catalog. Product
experiments, comparison renderers, internal content metrics, and roadmap
placeholders do not appear in the child-facing navigation.

## Entry and Navigation

Anonymous visitors are sent to `/login` with a validated same-origin `returnTo`
value. Authenticated learners complete the one-time profile flow at
`/profile/setup`, then continue to the requested activity or `/`.

Durable learner routes are:

- `/talk-to-peppa`
- `/lessons`
- `/lessons/parrot/:lessonId/scenes/:sceneNumber`
- `/lessons/my/:lessonId/scenes/:sceneNumber`
- `/stories`
- `/stories/:storyId/pages/:pageNumber`

The account menu owns learner profile, build information, and sign-out. Each
activity owns one consistent Back action. Retired experiment URLs fall back to
the learner home.

## Talk to Peppa

The learner gets one immediate **Talk to Peppa** action with the safest
short-turn style selected by default. Optional style choices live in a closed
grown-up disclosure and do not block play. The experience shows one calm
status, Peppa's latest line, the learner's live transcript, and one large turn
control. It does not expose developer timing, transcript history, or
profile-writing controls.

Connection and response waits use staged, honest messages. A cold start offers
a real retry after 12 seconds instead of asking a young child to wait
indefinitely. Longer thinking, reconnecting, and saving waits also end with a
large retry or Back action. Microphone setup changes the visible control
immediately and blocks duplicate taps while permission is pending.

The learner may interrupt, repeat Peppa's latest completed line, or finish at
any time. Ordinary chat never updates the learner profile. Parrot does not write
raw conversation audio to its D1 or R2 application storage, and LiveKit session
recording is disabled; live audio is still processed by LiveKit and OpenAI.

## Speaking Lessons

The lesson catalog shows seven ready-made lessons first as large picture-led
cards. The whole card is one clear Start action. My Lessons and the grown-up
custom lesson action appear below the ready-made catalog so authoring does not
compete with child practice.
Ready-made lessons use one consistent 16:9 scene illustration per step as their
default presentation; learners do not choose between rendering experiments.

A lesson plays as a short interactive episode:

1. The learner starts the lesson.
2. Character and narrator lines play automatically.
3. A learner line pauses the story and shows the exact phrase.
4. The learner taps the microphone, speaks, then taps again to finish.
5. The app checks the recording and plays brief feedback.
6. Success continues automatically; bounded retry behavior handles a miss.

The introduction teaches the loop visually as **Listen → Talk**. Opening the
microphone has its own visible state, and feedback remains visible for at least
1.5 seconds so praise does not vanish with a short audio clip. Speech matching
is deliberately encouragement-biased because child recognition commonly drops
short function words; this is practice, not a placement exam.
If sound playback fails, the lesson keeps a child-facing recovery card visible
with **Try sound** and **Skip sound** instead of leaving Pause as a dead control.

Previous and Next restart the adjacent scene at its first step. Browser
Back/Forward and direct refresh restore the routed scene while transient audio,
recording, evaluation, and step state reset safely.

## Story Time

The story shelf starts with the five fully illustrated **First words** stories,
so a child reaches a picture choice before any placement decision. Four
progressive learner levels remain available under grown-up options:

- First words
- Repeating patterns
- Tiny stories
- Early A1

Each level contains five curated stories. A child-facing card shows only its
cover, title, and one **Listen** action. Prompt experiments, vocabulary audit
data, uncontrolled baselines, and teaching diagnostics stay out of the
child-facing interface.

The reader moves page by page, presents one join-in line, and keeps listening
controls separate from page navigation. For a page without saved narration,
the English device voice reads the story line first and models the join-in line
as a separate utterance; the visual cue then changes to **Your turn**. Returning
from a story restores its levelled shelf. Before narration begins the cue says
**Tap Listen**, and Next stays visually secondary until the model is complete.

## Visual and Interaction Rules

- Use large touch targets, plain English, and accessible names.
- Keep one primary action per card or state.
- Do not use disabled roadmap cards in learner navigation.
- Do not expose internal labels such as experiment, pipeline, prompt test, or
  comparison.
- Keep route and account controls visually consistent through shared UI
  primitives.
- Respect reduced motion and prevent horizontal overflow from 280 px upward.
- Keep lesson controls clear of characters, speech, and the account header.
- Move focus to the new view heading after ordinary route navigation; immersive
  lesson and story routes own their more specific focus lifecycle.
- Keep modal focus contained and support complete keyboard behavior for ARIA
  menus.
- Serve responsive character images instead of decoding 1024 px art on every
  small-screen state change.

## Content Boundaries

Built-in lesson JSON contains text and catalog IDs, never image filenames,
audio filenames, voice IDs, or generation settings. Global catalogs own visual
assets, and the static audio manifest owns saved speech.

My Lessons use the same validated lesson contract but are owner-scoped in D1.
Story scripts are checked in and validated against their level limits. Learner
profile and conversation data remain separate from lesson and story content.
