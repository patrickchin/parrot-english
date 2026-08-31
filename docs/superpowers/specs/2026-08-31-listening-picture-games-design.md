# Listening-First Picture Word Games

## Status

Approved in advance by the user's explicit autonomous instruction on
2026-08-31. The user asked to replace the current reading-heavy quiz with a
larger library of listening-first picture games, use the Superpowers workflow,
and continue through implementation, pull request, and merge without stopping
for approval.

## Problem

The current `/word-game` is one six-question text quiz. It speaks a question
and then lists the written answers, reuses story scenes that include children,
and relies on browser text-to-speech. Two rounds test soap and clean hands with
vague questions rather than a concrete first word. This makes the activity
more about reading and inference than listening and vocabulary recognition.

Young learners need a repeatable loop that works before they can read: hear a
short target, explore clear pictures through audio, choose the matching
picture, and hear a complete explanation. Guardians should be able to choose
from several familiar first-word topics just as they choose stories and
nursery rhymes.

## Chosen Approach

Build a small data-driven topic library and one shared picture-game player.
This is preferable to one long mixed game because topic choice is visible and
repeatable, and preferable to adapting the story player because answer-card
exploration, selection feedback, and progress are a distinct interaction.

The player derives six deterministic rounds from each topic's six items. Each
round shows the target plus two same-topic distractors, with answer positions
rotated so the correct picture is not always in the same place. Content owns
its exact prompt, label, and success sentences so singular, plural, color, and
feeling grammar stay natural.

## Goals

- Replace the current quiz with six selectable topic games of six rounds each.
- Make listening the primary route to the answer; visible words must not be
  required to play.
- Give every option a large, isolated picture and its own non-selecting Listen
  control.
- Use checked-in ElevenLabs `eleven_v3` audio for all authored speech, with no
  browser or operating-system speech fallback.
- Ask concrete, conversational questions such as “Which is the cat?” and
  answer in full sentences such as “Yes, this is a cat.”
- Turn wrong choices into teaching: identify the selected picture, then invite
  the learner to listen and try again without consuming the round.
- Keep the game substantially larger than the former quiz while preserving the
  normal app page and header rather than adding browser or game fullscreen.
- Publish purpose-made artwork as immutable R2 media and verify it before use.
- Preserve accessible keyboard, focus, cancellation, error, and responsive
  behavior.

## Non-goals

- Reading, spelling, typing, scoring, timers, lives, penalties, or leaderboards.
- Speech recognition or asking the child to pronounce an answer in this change.
- Randomized or remotely generated questions at runtime.
- A general lesson CMS, a new audio service, or a new UI dependency.
- Reusing story scenes with a child, a hand-washing sequence, soap, cleanliness,
  or the questions “What is on the hands?” and “How are the hands?”
- Replacing the current stories, nursery rhymes, or lesson player.

## Content Scope

Ship six topics with six concrete targets apiece:

| Topic | Targets | Prompt pattern |
| --- | --- | --- |
| Animals | cat, dog, bird, fish, duck, frog | “Which is the cat?” |
| Colors | red, blue, yellow, green, orange, purple | “Where is blue?” |
| Body parts | eyes, ears, nose, mouth, hand, foot | Natural singular/plural “Which…” |
| Food | apple, banana, carrot, orange, bread, cheese | “Which is the apple?” |
| Toys | ball, toy car, doll, kite, blocks, teddy bear | “Which is the ball?” |
| Feelings | happy, sad, angry, sleepy, surprised, silly | “Which face is happy?” |

Each item also owns a teaching label and success sentence. Examples are “This
is a dog.” / “Yes, this is a dog.”, “These are the eyes.” / “Yes, these are the
eyes.”, and “This face is happy.” / “Yes, this face is happy.” The authored
content contains no personal names.

## Catalog and Routes

Add a compact `word-game-catalog` as the single content source of truth. A
topic contains its stable ID, title, short library description, visual theme,
and six items. An item contains its stable ID, display/accessible noun, exact
prompt, exact label, exact success feedback, image or native swatch data, alt
text, and three stable audio IDs. A pure round builder supplies deterministic
distractors and answer ordering without copying 36 round records.

Routes become:

- `/word-games` — topic library.
- `/word-games/:gameId` — shared player for a known topic.
- `/word-game` — replace-redirect to `/word-games` for existing links and saved
  return destinations.

Unknown topic IDs redirect to the library. Safe auth-return handling accepts
the library, the legacy route, and only known topic routes. The home activity
card points to the library. The library header returns home; the player header
returns to the game library.

## Learner Interaction

The library presents six large cards in a responsive one/two/three-column
grid. Selecting a topic opens its player. Because browsers require a user
gesture before media playback, the first view has one prominent “Start
listening” action. It does not hide the topic identity or introduce rules to
read.

After start:

1. The saved prompt plays automatically and remains available through “Listen
   again.”
2. Three large visual cards appear. Each card has two sibling buttons:
   - the picture selects that answer and is named “Choose cat”;
   - the separate control below says “Listen” visually and is named
     “Listen: cat”; it plays “This is a cat.” without selecting, scoring, or
     advancing anything.
3. A wrong picture plays that item's teaching label followed by the saved line
   “Listen and try again.” The round stays open and uses calm neutral styling.
4. The right picture plays its complete success sentence, marks the card, and
   reveals a large Next action.
5. Next advances and automatically plays the new prompt. After round six, the
   completion view plays “Great listening! You finished the game.” and offers
   Play again or Back to games.

Any new playback aborts the prior playback. Route changes and unmounts abort
audio too. Expected aborts remain silent; real failures show one persistent
message while leaving visual play usable. Focus moves to the question heading
after round changes and the completion heading at the end. Progress is exposed
as “1 of 6” rather than quiz language or a score.

## Audio Design

`lib/static-audio.js` derives word-game entries from the catalog so authored
text is not duplicated. Every one of the 36 items has three saved lines:

- target prompt;
- exploratory label;
- full correct feedback.

Two generic lines cover retry and completion, for 110 MP3s total. Generate
them with the repository's ElevenLabs workflow, the established friendly
English narrator voice, and the pinned `eleven_v3` model. Performance text asks
for warm, playful teacher delivery, clear first-word pacing, and natural
sentence intonation while visible text stays clean.

The player uses `playAudioLine` and `playAudioSequence`; it does not import or
fall back to `playDeviceSpeech`. Static-audio tests require metadata and a
decodable non-empty file for every line, so missing premium speech fails before
release rather than silently changing voice quality.

## Visual Design and Media

Colors use native circular swatches with subtle texture and shape contrast;
they do not need generated bitmap files. The other 30 targets use purpose-made
illustrations. Each answer image contains exactly one isolated subject or, for
feelings, one simple expressive face. It contains no child, adult, hand holding
the object, scene narrative, words, logos, watermark, or protected character.

The visual system is consistent across topics: friendly flat picture-book
illustration, rounded forms, confident navy outline, restrained soft shading,
high contrast, a pale warm background, and a small grounding shadow. Body-part
art is icon-like and unambiguous. Food and toy art uses familiar toddler forms.
Feeling faces differ in both mouth/eye expression and color cues while staying
kind rather than frightening.

Generate one ordered 3×2 source sheet per illustrated topic, inspect it at
original detail, and derive six individual square/near-square cards from each
accepted sheet. Normalize public choices to lightweight WebP files. Preserve
the ignored originals and prompts during generation, and publish the public
cards to fresh immutable keys under
`https://media.parrotbook.com/assets/v1/word-games/<topic>/<item>.webp` with
`image/webp` and one-year immutable caching. A small guarded media plan may
extend the existing provenance/publish utilities, but must preflight every key,
refuse overwrite, and verify status, MIME, cache policy, dimensions, and decode.

The card renderer uses `object-contain`; it does not reuse the story reader's
cropped `object-cover` scene renderer. Topic covers reuse representative card
art or native grouped swatches rather than adding decorative assets.

## Layout

Keep the standard `RouteHeader` and shared controls. The player is a normal
scrollable app route, not an exclusive fullscreen mode. Its central surface
uses the available viewport up to the existing wide content limit, with a much
larger question, three image-forward answer cards, and child-sized tap targets.

At ordinary phone widths the three cards share a row when they remain legible;
at the ultra-narrow 280px boundary they stack to preserve large pictures. Short
landscape uses a compact three-column row and scrolls vertically rather than
clipping controls. Desktop keeps three generous cards without stretching the
art beyond its intended size. Tailwind utilities stay in the React components;
no page-specific stylesheet is added.

## Testing and Verification

- Catalog tests pin exactly six topics, six items each, deterministic
  three-choice rounds, natural sentence forms, unique IDs, immutable R2 URLs,
  and the absence of soap/washing/cleanliness and vague former questions.
- Route and shell tests cover the library, all six topic routes, legacy
  redirect, safe auth returns, unknown IDs, and the home card.
- Static-audio tests require all 110 exact lines and checked-in ElevenLabs MP3s.
- Playback tests cover prompt replay, independent card listening, wrong-choice
  label-plus-retry sequencing, full correct feedback, replacement cancellation,
  unmount cancellation, and failure without device-speech fallback.
- Playwright uses accessible locators to prove that Listen never selects,
  Choose changes state, all six rounds complete, keyboard focus moves, and
  controls/images stay contained at 280×568, 390×844, 640×360, 768×360, and
  desktop sizes.
- Manually inspect every generated crop and the real player in the in-app
  browser at phone, short-landscape, and desktop sizes.
- Final gates are `npm test`, `npm run lint`, `npm run build`, and
  `npm run test:browser`, followed by independent review and CI.
