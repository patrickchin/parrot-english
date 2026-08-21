# Child-Facing Interface Language Audit

Last reviewed: 2026-08-21

Repository baseline: `7e3bf1da728090fc6f1d8050deadd853e2e1de72`

Branch: `codex/first-use-ux-audit`

Primary audience: children roughly 5–7 who are beginning English, including
children who cannot yet read English independently

Comparison audience: children roughly 7–10 with the same beginner-English
starting point

## Decision

The next bounded change should be in learner-profile setup, not on the Home,
lesson, story, My Lessons, or Talk shelves:

> Keep each profile acknowledgment on screen until the learner chooses **Next**.
> Audio may play once, but audio completion, audio failure, and a missing-audio
> timer must never advance the questionnaire.

This is a timing and comprehension defect with direct repository evidence, not
a subjective preference about tone. The acknowledgment currently advances when
audio ends or fails, and advances after 1,800 ms when there is no audio
([`LearnerProfileAcknowledgment.tsx`, lines 15–63](../../src/learner-profile/LearnerProfileAcknowledgment.tsx)).
The generated text may contain up to 160 characters and has no word-count,
common-word, or sentence-complexity constraint
([`learner-profile-enrichment.ts`, lines 44–61 and 120–148](../../worker/learner-profile-enrichment.ts)).
A beginning reader therefore may lose the only visible acknowledgment before
reading or understanding it. The visible **Next** button already supplies a
clear, explicit continuation action.

W3C's WCAG 2.2 explanation says that a scripted content change is a time limit
and that people with cognitive or language limitations may need more time to
read and understand. W3C's supplemental cognitive-accessibility pattern also
recommends that context and route changes occur on user request. This creates a
likely WCAG 2.2 Level A timing risk; it is not a complete conformance finding.

Profile intro wording and generated acknowledgment length also need subsequent
work, but combining those copy changes with pacing would make it harder to learn
which change helped. The smallest coherent first experiment is to remove only
implicit advancement, preserve audio and the existing **Next** action, and test
that behavior.

## Scope and method

This is a static product-language and interaction-contract audit. It covers:

- learner-profile setup intro, questions, answer affordances, status, errors,
  acknowledgments, and pacing;
- Home;
- ready-made lesson discovery, the child-facing My Lessons shelf, and the lesson
  player;
- the story shelf and story reader;
- ordinary Talk to Peppa UI, including wait and recovery copy; and
- the boundary between child activity copy and grown-up controls.

I inspected rendered string sources, catalog data, generated-output contracts,
error mappings, relevant timers, prior research notes, and tests at the stated
baseline. Dynamic lesson and AI output are treated as contracts and risk
categories; this audit did not observe every possible runtime model response.

Each child-facing string was reviewed with five questions:

1. Does it name one literal action or state?
2. Does it use common, concrete words and one idea at a time?
3. Can a picture, audio cue, layout, or visible control carry the same meaning?
4. Does the same product concept keep the same name?
5. Does it assume a culture, routine, technology concept, reading skill, or
   personal disclosure that may not be shared by the learner?

Word counts are warning lights, not reading-age scores. A three-word metaphor
can be harder than a longer literal instruction. No source found establishes a
universal word limit for a five-year-old English learner.

This audit separates English ability from age. A 7–10-year-old beginner may
need the same short English as a 5–7-year-old beginner, while preferring less
preschool-coded art or praise. Age may inform tone, motor support, independence,
and safeguarding; it must not silently set English difficulty.

## Learner-profile setup: highest priority

### Current inventory

| State | Visible instructional, status, or action language | Repository evidence |
| --- | --- | --- |
| Initial load | **Getting Peppa ready…** or **Loading your questions…** | [`LearnerProfileGate.tsx`, lines 152–163](../../src/learner-profile/LearnerProfileGate.tsx) |
| Load failure | **Peppa is taking a break** or **Questions are taking a break**; a raw error message; **Back to home**, **Skip for now**, **Retry** | [`LearnerProfileGate.tsx`, lines 166–197](../../src/learner-profile/LearnerProfileGate.tsx) |
| Setup intro | **Help Peppa get to know you**; **Answer a few quick questions to personalize chats and lessons. You can change these later in Learner profile.**; **Set up profile**; **Skip for now** | [`LearnerProfileGate.tsx`, lines 297–321](../../src/learner-profile/LearnerProfileGate.tsx) |
| Progress and input | **Question _n_ of 6**; **Your answer**; icon-only controls named **Replay question** and **Speak your answer** | [`LearnerProfileQuestion.tsx`, lines 57–131](../../src/learner-profile/LearnerProfileQuestion.tsx) |
| Question 1 | **Hi! I'm Peppa. What's your name?** plus Mandarin support | [`questionnaire-v2.json`, lines 5–15](../../content/learner-profile/questionnaire-v2.json) |
| Question 2 | **How old are you?** plus Mandarin support | [`questionnaire-v2.json`, lines 16–26](../../content/learner-profile/questionnaire-v2.json) |
| Question 3 | **What cartoons do you like?** plus Mandarin support | [`questionnaire-v2.json`, lines 27–37](../../content/learner-profile/questionnaire-v2.json) |
| Question 4 | **What animals do you like?** plus Mandarin support | [`questionnaire-v2.json`, lines 38–48](../../content/learner-profile/questionnaire-v2.json) |
| Question 5 | **What do you like doing for fun?** plus Mandarin support | [`questionnaire-v2.json`, lines 49–59](../../content/learner-profile/questionnaire-v2.json) |
| Question 6 | **What kind of stories do you like?** plus Mandarin support | [`questionnaire-v2.json`, lines 60–70](../../content/learner-profile/questionnaire-v2.json) |
| Recording and save | **Listening…**, **Writing what I heard…**, **Peppa is thinking…**; **Skip question** only when optional; **Skip for now**; **Next** | [`LearnerProfileQuestion.tsx`, lines 134–175](../../src/learner-profile/LearnerProfileQuestion.tsx) |
| Validation examples | **Please tell me the name you would like us to use.**; **Please tell me your age using a whole number.**; **Please use _n_ characters or fewer.** | [`learner-profile-enrichment.ts`, lines 81–100 and 172–180](../../worker/learner-profile-enrichment.ts) |
| Acknowledgment | Generated or fallback praise and **Next**. Fallbacks include **It's lovely to meet you!**, **That sounds like a brilliant age!**, and **Those animals sound brilliant!** | [`questionnaire-v2.json`](../../content/learner-profile/questionnaire-v2.json); [`LearnerProfileAcknowledgment.tsx`, lines 77–112](../../src/learner-profile/LearnerProfileAcknowledgment.tsx) |
| Completion | **Finishing your profile…** | [`LearnerProfileGate.tsx`, lines 332–340](../../src/learner-profile/LearnerProfileGate.tsx) |

All six current questions are marked required. The per-question **Skip question**
branch is consequently unavailable; **Skip for now** exits the full setup
instead. A child who does not watch cartoons or cannot categorize favorite
stories is not shown an explicit **I don't know** or **None** path, although the
free-text field will accept such an answer.

The form has meaningful support: only one question appears at a time, every
question has a replayable audio contract, the transcript remains editable, the
current question and total are visible, and the learner can skip the setup.
**Writing what I heard…** is especially good status copy because it describes
the visible result in ordinary language.

### Findings

#### 1. The intro asks for too much reading before the first question

The helper is 18 words and contains **personalize** and **Learner profile**,
which are app/data concepts rather than beginner activity words. The heading
**Help Peppa get to know you** frames saved personal answers as a relationship
with the character. **Quick** is also a timing promise that the implementation
cannot guarantee.

The server performs profile enrichment with a 15-second default upstream
timeout and then acknowledgment speech synthesis with a 10-second default
timeout. Those calls are sequential after a submitted answer; configurable
ceilings are 60 and 30 seconds respectively
([`groq.ts`, lines 19–20 and 52–59](../../worker/groq.ts),
[`learner-profile-acknowledgment-audio.ts`, lines 7–9 and 28–35](../../worker/learner-profile-acknowledgment-audio.ts),
and [`learner-profile.ts`, lines 371–422](../../worker/learner-profile.ts)).
These are code ceilings, not measured deployed latency. Network and database
time are additional, and deployed configuration is unknown.

A simpler, more literal intro hypothesis for later testing is:

- heading: **Answer 6 questions**;
- body: **We save your answers for chats and lessons. A grown-up can change
  them.**;
- primary action: **Start questions**; and
- secondary action: **Skip for now**.

This is a prototype, not approved privacy or consent wording. It is more direct
about saving, removes the relationship metaphor and timing promise, and keeps
the consequential adult explanation in the grown-up surface.

#### 2. Question language is mostly short, but some prompts assume categories

**What's your name?**, **How old are you?**, and **What animals do you like?**
are short and concrete. **What cartoons do you like?** assumes access to and a
shared concept of cartoons. **What do you like doing for fun?** asks the learner
to form an abstract activity category. **What kind of stories do you like?**
uses **kind** as a category word.

Candidate simplifications to prototype, not silently substitute, are **What do
you like to do?** and **What stories do you like?** The cartoon question needs
research before a rewrite: **What do you like to watch?** is broader but still
assumes watching media, while picture choices would introduce a different
interaction and cultural-selection problem.

Mandarin text and replayable English audio may help Mandarin-speaking learners.
They are not a general multilingual strategy and must not be treated as evidence
that another home-language learner understands the question. Home language,
literacy, and English listening should be observed separately.

The microphone and replay actions are visible only as icons; their clear names
are available to assistive technology. For a non-reader unfamiliar with the
icons, a short visible **Say it** cue beside the microphone is a reasonable
hypothesis. It needs a rendered-width and comprehension test before adoption.

#### 3. Save status is warm but opaque

**Peppa is thinking…** does not tell the learner whether the app heard, saved,
or lost the answer. It also attributes a network and data operation to the
character. **Saving your answer…** is a more literal candidate, but the current
request continues through optional speech synthesis after the database save, so
the operation should be split or the status sequence should be tested before
claiming exact phases.

There is no visible milestone change while this answer request waits. That is
more noticeable here than in Talk, whose feedback deliberately changes at
bounded milestones. First measure content-free request durations, then test a
second literal state such as **Still saving…** if real waits warrant it. Do not
add changing messages merely to create motion.

#### 4. Acknowledgment language is not actually constrained for beginners

The generation prompt asks for one warm, playful acknowledgment, no question,
and no invented details. It does not require common words, one short sentence,
a word limit, literal language, or avoidance of repeated private information
([`learner-profile-enrichment.ts`, lines 18–23](../../worker/prompts/learner-profile-enrichment.ts)).
Runtime validation checks only that it is non-empty, no more than 160
characters, and contains no question mark. The fallbacks use **lovely** and
**brilliant**, culturally marked praise words that do not confirm what happened.

A later, separate output-contract hypothesis is one sentence of roughly 3–8
common words, no question, no private-detail repetition, and deterministic
fallbacks such as **Thanks!**, **Nice to meet you!**, or **That sounds fun!**.
The exact phrases should be tested for comprehension and age-respectful tone;
replacing every response with generic praise may make feedback less meaningful.

#### 5. Acknowledgment pacing removes learner control

With audio, playback end, playback error, or rejected playback invokes the same
advance callback. With no audio or failed audio decoding, a 1,800 ms timer
invokes it. The screen can therefore disappear immediately on an error or after
a fixed interval unrelated to text length. The learner cannot pause or extend
that interval, and the acknowledgment is not otherwise available in the child
flow.

This is the strongest finding in the audit because the implementation and the
failure mode are both concrete. It affects every answered setup question, not
only a rare error string.

## Home

### Current inventory

- **Parrot English**
- **Tap a picture.**
- **Play a lesson**
- **Talk to Peppa**
- **Story time**

The route labels are paired with real destination imagery and familiar action
symbols; images are presentational inside already named links
([`HomeMenu.tsx`, lines 19–45 and 47–137](../../src/app/HomeMenu.tsx)).

### Assessment

Home is the strongest child-language surface. It has one three-word instruction
and three stable, picture-backed choices. **Story time** is a noun phrase rather
than an action, but the headphones symbol and story art supply its activity
meaning. Prior work reduced the choice layer from 30 to 11 visible words and
fixed image geometry to avoid load-time movement
([Picture-Led First Use](./picture-led-first-use.md)).

No copy change is justified before child observation. Measure whether learners
tap the intended route from the picture and label; do not add helper prose in
advance of evidence.

## Lesson discovery and My Lessons

### Current inventory

| Area | Visible instructional, status, or action language |
| --- | --- |
| Shelf header | **Back to home**, **Pick a lesson**, **Listen. Then speak.** |
| Ready-made card practice | **Say: Can you help me?**, **Say: It is red.**, **Say: May I have an apple?**, **Say: Can I have a turn?**, **Say: Two apples, please.**, **Say: Yes, please.**, **Say: Good night.** |
| Every lesson card | Dynamic lesson title, **_n_ parts**, **Play**; accessible link **Start lesson: _title_** |
| Child-facing custom shelf | **Made for you**, dynamic custom title, fallback **A lesson made for you.**, **Grown-up: edit** |
| Clearly marked grown-up area | **Grown-up tools**, **Make a new lesson.**, **Loading My Lessons…**, **We couldn't load My Lessons.**, count or empty status, **Try again**, **Make a lesson** |

Evidence: [`LessonList.tsx`, lines 66–99, 111–175, and 194–325](../../src/lessons/LessonList.tsx).

### Assessment

The shelf gives one concrete two-step instruction and previews the exact phrase
the child will practice. This is more useful than an abstract topic summary.
The seven built-in practice lines are short; **May I have an apple?** may be less
common than **Can I have…?**, but it is target language, not interface jargon.
Market, picnic, playground, snack, and bedtime routines are plausible familiar
contexts, not universal ones. Artwork and moderated observation must establish
whether each context is recognizable across the intended families.

**Made for you** and **A lesson made for you.** are warm but vague. **Your
lessons** is a more literal shelf-heading hypothesis. More importantly, custom
titles and the fallback summary are child-visible but outside the existing
custom-lesson language review. That advisory reviews dialogue and feedback, not
titles, scene titles, setting descriptions, or fixed UI. Do not solve that gap
by assigning a reading score; add a title-specific author note only after
observing confusing titles.

The loading, error, count, and creation copy lives within an explicitly named
**Grown-up tools** area. It can use adult account concepts without forcing those
terms into the child's task. **Grown-up: edit** visibly marks the boundary on a
child card.

## Lesson player

### Current inventory

| State | Visible instructional, status, or action language |
| --- | --- |
| Intro | **_n_ parts**, **1. Listen**, **2. Talk**, **Let's go!**; accessible **Start lesson** |
| Progress | **Scene _n_ of _n_**, dynamic lesson title; accessible **Scene progress** |
| Speech and prompt | **Story**, **Listen · _speaker_**, **Your turn**, **Opening mic**, **Listening**, **Checking** |
| Speaking actions | **Checking your words…**, **Done**, **Opening mic…**, **Tap when done**, **Try mic**, **Tap to talk**, **Skip** |
| Feedback | **You did it!**, **Try once more**, **Keep going!**, plus scripted lesson feedback |
| Playback | Icon actions named **Previous scene**, **Pause lesson** or **Resume lesson**, **Next scene** |
| Mic recovery | **No mic here. Say the words. Then tap Done.**; **The mic is off. Say the words. Then tap Done.**; **The mic did not work. Say the words. Then tap Done.**; **We could not check your words. Tap Done to keep going.** |
| Sound recovery | **The sound stopped. Try it again or skip this sound.**, **Try sound**, **Skip sound** |
| Completion | **Lesson complete!**, **You finished _title_!**, **Replay lesson**, **Back to lessons** |

Evidence: [`LessonPlayerUi.tsx`, lines 172–327 and 366–770](../../src/lessons/LessonPlayerUi.tsx)
and [`App.tsx`, lines 160–170](../../src/app/App.tsx).

### Assessment

The intro and speaking loop use short commands, immediate named states, and a
safe **Skip** or **Done** path. Mic errors say what to do instead of requiring a
child to diagnose permissions. This is strong for the primary audience.

The same unit is called a **part** on the shelf and intro, then a **scene** in
visible progress and control names. **Scene** is production/story vocabulary and
creates a needless second concept. A bounded later hypothesis is to say **Part
_n_ of _n_**, **Previous part**, **Next part**, and **Part progress** while
leaving internal schema and route identifiers unchanged. It is a good testable
cleanup, but it ranks below an acknowledgment screen that currently disappears
without learner action.

The assistive-technology live update also combines **Scene _n_ of _n_** with a
dynamic setting description. The existing language advisory does not review
that description. When the terminology change is tested, include screen-reader
announcement length and avoid repeatedly announcing decorative scene detail.

## Stories

### Current inventory

| Area | Visible instructional, status, or action language |
| --- | --- |
| Shelf | **Back to home**, **Story time**, **Pick a story**, **Tap a picture. I can read it to you.**, dynamic title, **Listen** |
| Active level | **Start here** / **Very short. One idea on each page.**; **Say it again** / **The same words come back.**; **Little stories** / **A little story with short lines.**; **Big adventures** / **A longer story with more words.** |
| Grown-up disclosure | **Grown-up options**, **Pick a story level** and level controls |
| Reader progress | **Back to stories**, **Page _n_ of _n_**, dynamic title and story text |
| Join-in cue | **Tap Listen**, **Listen**, **Listen and say it**, **Story paused**, **Your turn**, plus a short dynamic join-in line |
| Reader controls | **Back**, **Listen**, **Pause story**, **Resume story**, **Listen again**, **Next**, **Done** |
| Read-aloud failure | **I can't read aloud on this device. You can still read together.** |
| Completion | **The end!**, **Great job!**, dynamic completion line, **Listen again**, **Pick another story** |

Evidence: [`StoryList.tsx`, lines 47–195](../../src/stories/StoryList.tsx),
[`story-catalog.ts`, lines 124–169](../../src/stories/story-catalog.ts), and
[`StoryReader.tsx`, lines 144–173 and 204–460](../../src/stories/StoryReader.tsx).

### Assessment

The shelf and reader are picture-led, give replay and pause control, and use a
predictable join-in loop. Catalog tests limit narrative words per page and in
total, cap join-in lines at seven words, and require every script word to be
declared in a versioned vocabulary profile. These are useful authoring
constraints, not proof that a child knows the words.

The first-person **I** in **I can read it to you** and the failure message has no
explicit speaker in the interface. Peppa art is not present on the story shelf,
so some learners may not know who **I** means. **Tap Listen. Hear the story.** is
a literal candidate, but the current copy should be changed only if observation
shows confusion.

The failure message uses technical **device**, assumes a co-reader in **read
together**, and is 12 words. A candidate is **Story sound cannot play here. You
can still read.** If the product expects adult support, **Get a grown-up to read
with you** is clearer than an unnamed **together**, but it must not imply that a
grown-up is always available.

**Little stories** and **Big adventures** use size and genre as difficulty
metaphors. They may feel friendly to a younger child but babyish or misleading
to a 7–10-year-old beginner. The selector is behind **Grown-up options**, though
the active level name remains visible. Test age-respectful labels separately
from English difficulty; do not move an older beginner to harder text because
of age.

## Talk to Peppa

### Current inventory

| State | Visible instructional, status, or action language |
| --- | --- |
| Entry | **Back**, **Chat with Peppa**, **Ready to talk**, **Peppa is here.**, **Tap Talk to Peppa.**, **Talk to Peppa** |
| Sound and microphone | **Sound is off**, **Tap for sound**, **Starting sound**, **Opening microphone**, **Tap, then talk**, **I'm done**, **Tap or press Space** |
| Turn-taking | **Listening**, **Your turn**, **Your words**, **Say your answer.**, **You said**, **Thinking**, **Wait for Peppa.**, **Peppa's turn**, **Listen to Peppa.** |
| Connecting | **Getting ready**, **Starting the voice chat.**, **Still getting ready.**, **Chat paused**, **The chat did not start.** |
| Slow response | **Your turn is done. Wait for Peppa.**, **Still waiting for Peppa.**, **Peppa did not answer.** |
| Reconnect | **Trying again**, **The chat stopped.**, **Still trying.** |
| Finish | **Finishing chat**, **That was fun!**, **Still working.**, **Finish paused**, **Finishing took too long.**, **Finish chat** |
| Recovery | **Please try again**, **The voice room took a break. Try again.**, **The connection stopped.**, **Peppa cannot talk now.**, **Try again**, **Try chat again**, **Play a lesson**, **Back** |
| Clearly marked grown-up option | **Grown-up: _style_**, **Chat style** and a style description |

Evidence: [`ConversationSurface.tsx`, lines 103–119, 182–229, 349–485, and 600–990](../../src/conversation/ConversationSurface.tsx)
and [`conversation-feedback.ts`, lines 21–147](../../src/conversation/conversation-feedback.ts).

### Assessment

Ordinary Talk is already more tightly constrained than the profile
acknowledgment. Its model prompt requires common, concrete beginner English,
one question at most, and ordinary replies of 2–8 or 2–10 words depending on
the grown-up-selected style. Tests assert those contracts
([`small-chat.ts`](../../agent/prompts/small-chat.ts) and
[`conversation-agent.test.mjs`, lines 328–375](../../tests/conversation-agent.test.mjs)).
Model instructions reduce risk but do not guarantee every runtime response or
establish child comprehension.

Talk also changes wait feedback at explicit milestones: connecting at 4 and 12
seconds; thinking first at 1.8 seconds, then at a bounded learned interval of
7–15 seconds and again up to 8 seconds later; reconnecting and finishing at 8
and 18 seconds. That is a good example of status evolving without exposing
implementation detail.

Most action copy is short and literal. The weak exceptions are error-only:
**voice room** and **connection** are technical, while **took a break** is a
metaphor. **The chat stopped. Tap Try again.** is a simpler recovery hypothesis
and already matches nearby terminology. This ranks below profile pacing because
the Talk state machine supplies a visible recovery action and the problematic
copy is uncommon.

The internal model role calls the character a **friend**. Child-visible fixed UI
does not make a friendship claim, but generated conversation could still shape
that belief. Continue adversarial and ordinary-child transcript review against
the existing product boundary: a warm language-practice character is not a
confidant, authority, or substitute for a trusted person.

## Child and grown-up language must remain different

The goal is not to rewrite every product sentence into preschool English.

| Surface | Intended language level | Audit treatment |
| --- | --- | --- |
| Home, lesson shelf, child My Lessons cards, lesson player, story shelf/reader, Talk, and profile questions/acknowledgments | Child-facing; meaning should survive very limited English and early reading | Prefer literal, short, picture/audio-supported action and state language. Do not rely on an accessible name alone for a primary non-reader action. |
| **Grown-up tools**, **Grown-up options**, **Grown-up chat style**, lesson creation/editing, story-art controls | Clearly marked adult support | Adult concepts are acceptable when accurate and scannable. Keep them out of the dominant child action. |
| Account menu, **Learner profile** editor, **AI and saved data**, account deletion | Consequential grown-up/account work | Preserve necessary AI, storage, correction, and deletion detail. Do not remove material facts merely to lower word count. |

The profile editor uses **Learner profile**, **These details personalize chats
and lessons**, field labels, and **Save changes**
([`ProfileEditor.tsx`, lines 39–203](../../src/learner-profile/ProfileEditor.tsx)).
That language belongs in a grown-up/account path. The boundary is not entirely
enforced by role—the signup copy permits an adult or learner account name—so a
child may still reach it. Research should test whether it needs a visible
**Grown-up** marker, not simplify away its data meaning.

## Prioritized findings

| Rank | Finding | Reach and confidence | Next treatment |
| ---: | --- | --- | --- |
| 1 | Profile acknowledgment advances on audio completion/failure or after 1,800 ms without audio | Repeats after every answered setup question; directly verified in code; likely Level A timing risk | Implement explicit-Next-only advancement as the one bounded change |
| 2 | Profile intro uses 18-word helper copy, app jargon, relationship framing, and an unverified **quick** promise | First-use gate before protected activities; high confidence in language burden, exact replacement needs testing | Prototype literal saved-answer copy after pacing is isolated |
| 3 | Generated profile acknowledgment permits 160 characters with no beginner-language or privacy-reflection rule | Repeated model output; contract gap is direct, best word/tone constraint is unvalidated | Separately tighten prompt/schema/test after reviewing sampled outputs |
| 4 | Profile interest questions are all required and some assume cartoons, abstract hobbies, or story categories | Six-question setup; cultural fit varies | Test **I don't know**/optional interest answers and simplified questions |
| 5 | Lesson uses **parts** and **scenes** for the same unit | Every lesson; simple terminology defect | Later bounded terminology-only change with AT tests |
| 6 | Story and Talk error copy uses **device**, **voice room**, **connection**, speakerless **I**, and **took a break** | Error paths only; concrete alternatives exist | Revise together with simulated-error comprehension tests |
| 7 | **Made for you**, story level size metaphors, and praise tone may be vague or young-coded | Lower task risk; age/culture response uncertain | Observe before changing; test tone separately from English level |

## Existing tests and language guards

| Guard | What it establishes | What it does not establish |
| --- | --- | --- |
| [`english-ui.test.mjs`](../../tests/english-ui.test.mjs) | Blocks Han characters in `src`, `lib`, `worker`, and selected web metadata | It does not scan `content`, where Mandarin profile prompts ship; it does not assess English simplicity or mixed-language usefulness. |
| [`lesson-language.js`](../../lib/lesson-language.js) and [`lesson-language.test.mjs`](../../tests/lesson-language.test.mjs) | Advisory warnings for long custom-lesson dialogue/questions/practice and a small technical-term list | No fixed UI, title, scene title, setting description, abstract short word, idiom, cultural match, or picture-language check. |
| [`story-catalog.test.mjs`, lines 81–161](../../tests/story-catalog.test.mjs) | Per-level narrative ceilings, short join-ins, declared vocabulary, repeated teaching language | No shelf/control/status/error-copy comprehension and no proof that declared words are known. |
| [`product-streamline.test.mjs`](../../tests/product-streamline.test.mjs) | Locks Home, lesson, and story structure and prevents research jargon from leaking into learner views | Exact-copy assertions are regression contracts, not evidence children understand the copy. |
| [`learner-profile-ui.test.mjs`, lines 98–326](../../tests/learner-profile-ui.test.mjs) | One editable question, replay/speech affordances, states, acknowledgment rendering, audio cleanup, and current auto-advance behavior | It currently asserts advance on audio end and only checks that the no-audio delay is at least 1,500 ms. It has no beginner-word or self-paced-reading contract. |
| [`learner-profile-enrichment.test.mjs`](../../tests/learner-profile-enrichment.test.mjs) | Strict JSON shape, no acknowledgment question, fallback behavior, timeout handling, and canonical fields | Generated acknowledgment may still be long, abstract, culturally marked, or repeat a sensitive detail. |
| [`conversation-agent.test.mjs`](../../tests/conversation-agent.test.mjs), [`conversation-feedback.test.mjs`](../../tests/conversation-feedback.test.mjs), and browser wait-recovery tests | Short model-response instructions, one-question contract, timed feedback milestones, and visible recovery behavior | Prompts cannot guarantee model behavior; tests do not demonstrate comprehension by a child. |
| Playwright accessible-locator tests | Stable accessible names and operable UI at covered viewports | An accessible name is not necessarily visible or understandable to a non-reader. |

A global readability linter would duplicate neither the profile timing fix nor
the need for contextual review. It would also miss short abstractions such as
**profile**, **room**, **kind**, and **break**. Keep automated checks small,
explainable, and tied to observed failure modes.

## Bounded implementation contract

Change only acknowledgment advancement behavior:

1. `LearnerProfileAcknowledgment` plays available acknowledgment audio once.
2. Audio `ended`, `error`, decoding failure, and `play()` rejection clean up or
   stop playback but do not call questionnaire advancement.
3. No missing-audio timer is scheduled.
4. The visible **Next** button is the only way the acknowledgment advances.
5. Cleanup still pauses audio, removes listeners, revokes object URLs, and
   prevents stale callbacks from affecting a later screen.
6. Profile editing with several acknowledgments uses the same explicit **Next**
   action to step through them.

Focused acceptance tests:

- no-audio acknowledgment remains after fake timers advance well past 1,800 ms;
- audio end, audio error, decoding failure, and rejected playback do not invoke
  `onNext`;
- selecting **Next** advances exactly once;
- unmount cleanup still pauses and revokes audio resources;
- a lifecycle or browser test submits one answer, advances time by at least ten
  seconds, confirms the acknowledgment and **Next** remain, then selects
  **Next** and sees the next question; and
- keyboard and screen-reader focus reaches **Next** predictably without a route
  change occurring first.

Rollback criterion: if moderated sessions show learners consistently cannot
find **Next**, first improve its visual/audio cue and retest. Do not restore a
fixed timer merely to increase completion counts; that would hide rather than
solve the affordance problem.

## Validation plan

### Moderated comprehension sessions

Recruit small, varied samples of 5–7-year-old beginner-English learners and
7–10-year-old learners at a comparable English level. Include varied home
languages, literacy, device experience, and access needs. Treat the age groups
as research cohorts, not ability bands.

Ask each learner to:

1. choose a named activity from Home without adult translation;
2. start one lesson and explain or demonstrate **Listen**, **Talk**, and progress;
3. start profile setup, say what the intro is asking, and answer one question by
   speech or typing;
4. explain what **Writing what I heard…** and the save/wait state mean;
5. hear or read an acknowledgment, wait as long as they want, then continue;
6. choose a story and use listen, pause, replay, and next; and
7. start Talk, identify whose turn it is, then recover from one simulated mic or
   network failure.

Observe first action, correct action without explanation, adult-help request,
replay use, recovery choice, whether acknowledgment content can be recalled,
and whether the learner can stop. Ask what felt confusing or “for younger/older
children” in the learner's preferred language where ethically and practically
appropriate.

Do not treat session duration, number of taps, or questionnaire completion as a
learning or well-being success measure.

### Timing measurement

Measure content-free durations for profile transcription, answer enrichment,
save, acknowledgment speech generation, and total submit-to-visible-feedback.
Report median, 90th, and 95th percentile by coarse network/device class. Never
log answer text, raw audio, generated acknowledgment text, name, age, persistent
device identifiers, or precise network/location data for this measurement.

Use those measurements to decide whether the profile wait state needs a second
milestone, not to reintroduce forced advancement. Also test no-audio, blocked
autoplay, slow synthesis, synthesis failure, offline, and screen-reader cases.

### Copy comparison

After the pacing change is evaluated, compare one variable at a time:

- current intro versus the literal six-question/saved-answer prototype;
- **Peppa is thinking…** versus a literal save state;
- current activity/story-category questions versus simpler candidates;
- generated warm/playful acknowledgment versus a short common-word contract;
- **scene** versus **part**; and
- current error metaphors versus literal **stopped / try again** messages.

Success is the learner correctly explaining or acting on the state with less
help, not merely preferring one phrase.

## Safety and privacy notes

- The profile collects and saves a name, age, and interests. Simplified child
  copy is participation support, not informed consent. Caregiver notice,
  applicable consent, data-minimization, retention, and legal review remain
  separate obligations.
- A submitted answer is sent for Groq enrichment and its acknowledgment may be
  sent to ElevenLabs for speech. The answer and generated summary are saved
  before speech synthesis returns
  ([`learner-profile.ts`, lines 371–422](../../worker/learner-profile.ts)). Keep
  the grown-up **AI and saved data** explanation accurate about outside
  processing and Parrot account storage.
- The acknowledgment prompt says not to invent details or ask a question, but
  unlike the Talk prompt it does not say not to repeat a private detail. Add
  adversarial cases for addresses, school names, phone numbers, secrets, and
  distress before expanding generated personalization. A child should never be
  rewarded for disclosure.
- Do not frame Peppa as knowing, remembering, or caring about the learner in a
  way that implies human awareness or a reciprocal friendship. Warmth is
  compatible with describing saved data literally.
- The six questions include age and media/interests. Confirm that each field has
  a named child benefit and that interest answers can be declined. Do not infer
  English level, maturity, or safe independence from age.
- Do not retain raw session audio or full child quotations merely to validate
  these copy changes. Obtain caregiver consent and child assent for research,
  allow stopping without penalty, and retain the minimum coded observations.
- Do not remove technical storage, provider, correction, or deletion detail
  from grown-up surfaces in pursuit of a lower word count. Layer the explanation
  by audience instead.

## Evidence base

External sources were accessed on 2026-08-21. They guide hypotheses; none
validates this product or proves comprehension by a five-year-old learner.

| Source | Claim used here | Applicability and limitation |
| --- | --- | --- |
| W3C WAI, [Use Clear Words](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o3p01-clear-words/), Content Usable Working Group Note pattern, interface posted January 2022 | Prefer common, clear words; remove vague terms and jargon, especially in headings, labels, navigation, instructions, and errors. | Authoritative supplemental cognitive-accessibility guidance, not a child-EFL study or WCAG success criterion. |
| W3C WAI, [Use Simple Tense and Voice](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o3p02-simple-tense/), interface posted January 2022 | Prefer direct, active, simple sentences. | Useful for state and error copy; not a vocabulary syllabus. |
| W3C WAI, [Keep Text Succinct](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o3p05-succinct-text/), interface posted January 2022 | Put one point in a sentence and compare long text with split alternatives. | Supports prototyping, not a universal word threshold. |
| W3C WAI, [Use Clear Visible Labels](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o4p06-clear-labels/), interface posted January 2022 | Visible common labels should be near controls and available to assistive technology. | Supports reviewing icon-only speech/replay controls; user testing is still required. |
| W3C WAI, [Make Each Step Clear](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o1p04-clear-steps/), interface posted January 2022 | Show current, completed, and pending steps so users can orient without much reading. | Supports stable question/progress cues; does not prescribe **Question 1 of 6** as sufficient for a non-reader. |
| W3C WAI, [Understanding SC 2.2.1: Timing Adjustable](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html), WCAG 2.2 Understanding document | A process or content update that occurs after a set time creates a time limit; users may need to turn it off, adjust it, or extend it. Language and cognitive limitations may increase needed reading time. | Directly relevant to the 1,800 ms disappearance. This memo identifies risk, not full conformance or legal compliance. |
| W3C WAI, [Let Users Control When the Content Moves or Changes](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o8p01-motion/), interface posted January 2022 | Context, route, and functionality changes should be initiated by the user or have an easy way to disable/reverse them. | Strong design support for explicit **Next**; supplemental guidance, not by itself a conformance requirement. |
| Cambridge English, [Pre A1 Starters](https://www.cambridgeenglish.org/exams-and-tests/qualifications/young-learners/paper/starters/) and [exam format](https://www.cambridgeenglish.org/exams-and-tests/qualifications/young-learners/paper/starters/format/) | Official examples use simple instructions, familiar people/things, pictures, modeled examples, very short stories, and very simple questions or answers. | An assessment description, not an app curriculum, interface trial, or developmental norm for all five-year-olds. |
| Council of Europe, [Collated Representative Samples of Descriptors of Language Competences Developed for Young Learners aged 7–10](https://rm.coe.int/16808b1688), 2018 | The age-group descriptors are a reflection aid, not a definitive age road map; development and context vary. Pre-primary evidence was too scarce for inclusion. | Supports caution when comparing 7–10 and rejecting age-as-ability. It does not describe the primary under-seven audience. |
| NAEYC, [Developmentally Appropriate Practice: Core Considerations](https://www.naeyc.org/resources/position-statements/dap/core-considerations), 2020 position statement | Consider developmental commonalities, individual variation, and social, cultural, and linguistic context together; avoid deficit assumptions based on dominant monolingual norms. | Relevant educational guidance through age eight, not a validation of any Parrot phrase or the 7–10 cohort. |
| US Head Start, [Visual Supports](https://headstart.gov/children-disabilities/article/visual-supports), accessed 2026-08-21 | Pictures can help young children understand what to do and what happens next. | Official practitioner guidance, not proof that Parrot's particular pictures convey the intended action across cultures. |

Relevant repository research already establishes compatible boundaries:

- [Beginner Language and Age](./beginner-language-and-age.md) separates age
  from proficiency and favors spoken language, meaning-bearing pictures, one
  concrete action, and safe Skip/replay paths.
- [Child-Language Content Check](./child-language-content-check.md) documents
  the current advisory's exact scope and why word counts cannot detect abstract
  short words, idiom, cultural mismatch, or picture-language mismatch.
- [Cognitive Accessibility for Young Learners](./cognitive-accessibility.md)
  asks every state to answer where the learner is, what to do, whether it worked,
  and how to recover.
- [Age-Adaptive Experience Guidance](./age-adaptive-experience-guidance.md)
  treats approximately 4–6, 7–10, and 11–15 as research cohorts and keeps
  language level, experience tone, and access support separate.
- [Child AI Safety and Privacy](./child-ai-safety-and-privacy.md) defines the
  character as a bounded practice tool rather than a friend, confidant, or
  authority.
- [Grown-up AI and Saved-Data Transparency](./grown-up-ai-transparency.md)
  documents the adult explanation and verified repository data flow.

## Unresolved questions

- Do 5–7-year-old beginner learners understand that profile answers are saved
  and used, and can they identify when to get a grown-up?
- Is asking for age necessary for the current child benefit, and what happens
  when a child cannot or does not want to answer?
- Should the four interest questions be optional, or should **I don't know** and
  **None** be visible first-class answers?
- Which home languages need support, who chooses them, and should support be
  text, audio, picture demonstration, or a combination?
- What are deployed median and tail latencies for transcription, enrichment,
  persistence, and acknowledgment speech? Repository timeout ceilings are not
  performance measurements.
- Which generated acknowledgments have actually been shown, and how often do
  they exceed one short sentence, use unfamiliar praise, repeat private detail,
  or disappear after audio failure?
- Does **Answer 6 questions** feel like a test, and can a picture/audio
  demonstration communicate the purpose with fewer words?
- Do learners understand **part**, **scene**, **page**, and **turn** as distinct
  progress concepts?
- Are **Little stories**, **Great job!**, character animation, and playful
  acknowledgment respectful for 7–10-year-old beginners at the same English
  level? Test dignity separately from comprehension.
- Can a child recover from every simulated profile, mic, story-audio, and Talk
  failure using only what is visible and audible on the screen?
- Can caregivers with limited English find and understand the grown-up AI/data
  explanation before profile setup without placing policy-length text in the
  child's path?

## Hand-off

```text
Recommended next branch: one learner-profile acknowledgment pacing change
Dependency: baseline 7e3bf1d
Hypothesis: Keeping acknowledgment feedback until explicit Next lets each learner process it at their own pace without removing audio or adding copy.
Change: Remove timer/audio-driven advancement; retain audio playback, cleanup, and visible Next.
Do not bundle: Intro rewrite, generated-output constraints, question optionality, lesson terminology, or error-copy changes.
Primary verification: Focused unit/lifecycle/browser tests plus moderated comprehension with content-free timing measurement.
Primary risk: A learner may not notice Next; improve the affordance if observed rather than restoring forced timing.
```
