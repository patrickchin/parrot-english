# Product Experience

## Product Promise

Parrot English helps young learners practice spoken English through three
focused activities:

1. **Talk to Peppa** for a short, learner-controlled conversation.
2. **Speaking lessons** for guided listen-and-repeat practice inside a story.
3. **Story time** for levelled read-aloud stories with simple join-in lines.

The authenticated home presents only these learner activities. Profile,
content, consent, privacy, and account management live in password-protected
guardian mode. Product experiments, comparison renderers, internal content
metrics, and roadmap placeholders do not appear in learner navigation.

## Learner and Guardian Modes

One Better Auth account remains paired with one learner profile. An
authenticated session starts in learner mode. The fixed profile control names
the active identity and mode; its dropdown places a `Learner`/`Guardian` mode
switch directly below that identity.

Selecting Guardian requires the current account password. A successful check
unlocks guardian mode for that auth session for at most 15 minutes. The fixed
expiry survives refresh and another tab but ordinary activity never extends
it. Switching back to learner first removes the server unlock, then opens `/`.
If locking fails, the guardian screen and URL remain in place with an error.
Expiry retains a guardian deep link behind the password gate so a new unlock
can resume it without flashing protected content.

Learner mode exposes no profile editing, AI/data notice, sign-out, account
deletion, lesson authoring, story settings, photo, consent, generation, or
deletion controls. Guardian mode exposes those management actions but not a
duplicate learner activity catalog.

| Capability | Learner | Guardian | Enforcement |
| --- | --- | --- | --- |
| Complete first-time learner setup | Yes | Yes | Authenticated session |
| Talk, play lessons, read stories | Yes | Switch to learner | Authenticated session |
| View saved custom lessons for playback | Yes | Switch to learner | Owner-scoped read |
| Edit learner profile or redo setup | No | Yes | Guardian unlock |
| Choose stored story level | No | Yes | Guardian unlock |
| Create, generate, import, or update custom lessons | No | Yes | Guardian unlock |
| Upload a learner photo or generate/delete story art | No | Yes | Guardian unlock plus consent |
| View already-generated story art | Yes | Yes | Owner-scoped read |
| Open AI/data notice | No | Yes | Guardian UI boundary |
| Sign out | No | Yes | Guardian UI boundary |
| Delete account | No | Yes | Guardian UI plus password confirmation |

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

Canonical guardian routes are:

- `/guardian` — dashboard;
- `/guardian/lessons` — saved custom lesson management;
- `/guardian/stories` — stored story level and personalized-art management;
- `/profile`, `/lessons/my/create`, and `/lessons/my/:lessonId/edit` — existing
  management URLs protected by the same guardian boundary.

Initial `/profile/setup` remains available to either mode until onboarding is
complete; later editing and setup redo are guardian-only. In learner mode the
profile dropdown contains only the mode switch. In guardian mode it also owns
Learner profile, AI and saved data, Sign out, and Delete account. Each activity
owns one consistent Back action. Retired experiment URLs fall back to learner
home.

## Talk to Peppa

The learner chooses a conversation style before joining. The experience shows
one calm status, Peppa's latest line, the learner's live transcript, and one
large turn control. It does not expose developer timing, transcript history,
or profile-writing controls.

The learner may interrupt, repeat Peppa's latest completed line, or finish at
any time. Ordinary chat never updates the learner profile. Raw audio is not
stored.

## Speaking Lessons

The learner lesson catalog shows seven ready-made lessons first, then any saved
custom lessons for playback. Each row has one clear Start action. Creation and
editing live at `/guardian/lessons` and its protected create/edit routes, so
authoring does not compete with learner practice. Ready-made lessons use one
consistent 16:9 scene illustration per step as their default presentation;
learners do not choose between rendering experiments.

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

The choice is stored on the learner profile. The learner shelf always opens at
that stored level and contains no level selector or art-management controls.
Each level contains five curated stories. A story card shows its cover, title,
and one Listen action. Prompt experiments, vocabulary audit data, uncontrolled
baselines, and teaching diagnostics stay out of the learner interface.

The reader moves page by page, presents one join-in line, and keeps narration
controls separate from page navigation. Returning from a story restores the
learner's stored-level shelf. Already-generated private art may appear in
learner stories and lessons; upload, consent, generation, and deletion remain
guardian-only.

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

## Content Boundaries

Built-in lesson JSON contains text and catalog IDs, never image filenames,
audio filenames, voice IDs, or generation settings. Global catalogs own visual
assets, and the static audio manifest owns saved speech.

My Lessons use the same validated lesson contract but are owner-scoped in D1.
Story scripts are checked in and validated against their level limits. Learner
profile and conversation data remain separate from lesson and story content.
