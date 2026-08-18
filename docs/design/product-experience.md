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

The learner chooses a conversation style before joining. The experience shows
one calm status, Peppa's latest line, the learner's live transcript, and one
large turn control. It does not expose developer timing, transcript history, or
profile-writing controls.

The learner may interrupt, repeat Peppa's latest completed line, or finish at
any time. Ordinary chat never updates the learner profile. Raw audio is not
stored.

## Speaking Lessons

The lesson catalog shows seven ready-made lessons first. Each row has one clear
Start action. My Lessons and the grown-up custom lesson action appear below the
ready-made catalog so authoring does not compete with child practice.
Ready-made lessons use one consistent 16:9 scene illustration per step as their
default presentation; learners do not choose between rendering experiments.

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

The story shelf exposes four progressive learner levels:

- First words
- Repeating patterns
- Tiny stories
- Early A1

Each level contains five curated stories. A story card shows its cover, title,
summary, page count, and one Read story action. Prompt experiments, vocabulary
audit data, uncontrolled baselines, and teaching diagnostics stay out of the
child-facing interface.

The reader moves page by page, presents one join-in line, and keeps narration
controls separate from page navigation. Returning from a story restores its
levelled shelf.

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

## Content Boundaries

Built-in lesson JSON contains text and catalog IDs, never image filenames,
audio filenames, voice IDs, or generation settings. Global catalogs own visual
assets, and the static audio manifest owns saved speech.

My Lessons use the same validated lesson contract but are owner-scoped in D1.
Story scripts are checked in and validated against their level limits. Learner
profile and conversation data remain separate from lesson and story content.
