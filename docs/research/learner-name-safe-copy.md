# Name-safe copy for ready-made lessons

Last reviewed: 2026-08-21

## Question and scope

How should a ready-made lesson respond when its authored `childName` does not
match the current learner?

This memo covers the seven checked-in Parrot lessons, their retry and final
narration, and the saved audio those lines use. It does not change generated
My Lessons, learner-profile collection, account labels, or the lesson schema.
The primary audience remains young beginners who may know little English.

## Observed evidence

At baseline commit `4c54b7f`, the local browser fixture signs in **Mia** while
all seven ready-made lesson files carry the authored `childName` **Bella**.
Across those files, 18 retry responses said “Almost! Try again, Bella.” and
seven final lines also addressed Bella. The mismatch was therefore present in
25 reachable text lines, not one isolated lesson.

The problem also existed in sound. Ready-made lessons use static audio, and
[`getStaticAudioLineForSpeech`](../../lib/static-audio.js) resolves it by exact
speaker and text. Replacing only the visible React copy would still let the
learner hear the wrong name.

Local evidence:

- [`vite.config.ts`](../../vite.config.ts) defines the signed-in browser fixture
  as Mia.
- [`content/lessons`](../../content/lessons) is the ready-made lesson source.
- [`lib/lesson-audio.js`](../../lib/lesson-audio.js) and
  [`lib/static-audio.js`](../../lib/static-audio.js) show the exact-text static
  audio path.
- [`src/app/App.tsx`](../../src/app/App.tsx) selects static audio for Parrot
  lessons and device speech only for My Lessons.

Two existing research sources guide the replacement language:

- [LANG-05 in the source register](./source-register.md#source-register) records
  the British Council's
  [Giving instructions handbook](https://africa.teachingenglish.org.uk/sites/default/files/unit_4_giving_instructions_participant_handbook.pdf),
  published 2020 and accessed 2026-08-21, which recommends short, graded
  instructions and demonstrating meaning where possible.
- [A11Y-01 in the source register](./source-register.md#source-register) records
  W3C COGA's [Use clear words](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o3p01-clear-words/),
  published 2021 and accessed 2026-08-21, which recommends common, literal
  words for cognitive accessibility.

Neither source studies mistaken names in this product. The conclusion that a
known-wrong name is worse than no name is a Parrot data-integrity decision
based on the observed mismatch, not a claimed research effect.

## Decision

Use universal copy in ready-made lessons:

- retry: **“Almost! Try again.”**
- final: **“Great job!”**

The final sentence that used to recap the scene is removed because the next
screen immediately says which lesson the child finished. This keeps the spoken
success cue short and lets all seven lessons reuse the existing saved
`narrator-feedback-success.mp3` asset.

The retry asset
[`narrator-feedback-retry.mp3`](../../public/assets/audio/narrator-feedback-retry.mp3)
is derived from the existing ElevenLabs narration rather than local or browser
text-to-speech. The source was `narrator-retry-bella.mp3` at `4c54b7f`, SHA-256
`542b004f8407461429b6e69df0bf0db3cdf9a4723f147503f19418c64a02adff`.
The derived file keeps the first 63 complete 44.1 kHz MP3 frames through the
quiet boundary after “again” (1.646 seconds), removes the trailing spoken name,
and has SHA-256
`f55910fa86404a53367c57f672cad30f153ff1a788bf9711c9cf1b07e69f8de7`.
No new voice or synthesis provider was introduced.

Nine unreferenced Bella-specific audio files were removed. Git retains them in
the baseline commit; omitting them from `public` avoids shipping about 468 KB of
known-wrong narration.

## Rejected alternatives

### Substitute the current profile name at runtime

Rejected for ready-made lessons. The current route does not receive the learner
profile name, the account label may belong to a grown-up, and arbitrary names
cannot match the checked-in exact-text audio cache. Adding profile plumbing or
runtime TTS would increase data use, latency, failure states, and pronunciation
risk to solve a problem that name-free copy avoids.

### Substitute the signed-in account name

Rejected because an account name is not guaranteed to be the learner's name.
Using a readily available but semantically different field would preserve the
data-integrity defect in another form.

### Keep the contextual final sentence without a name

Deferred, not ruled out. It would require seven newly generated and reviewed
audio files. The short generic success cue already has exact saved audio and is
followed by the named lesson-completion screen. Add contextual endings only if
child observation shows that the shorter ending is unclear.

The legacy `childName` field remains in each ready-made JSON file for schema
compatibility, but a regression test now prevents that authored value from
appearing in any ready-made dialogue or response. Removing or making the field
optional is a separate schema migration.

## Validation and guardrails

Success criteria:

1. No ready-made scripted line or cached-audio manifest entry says “Bella.”
2. Retry text and saved audio resolve to the same exact phrase.
3. Final feedback stays visible and contained at 640×360 and 768×360.
4. Existing lesson playback, completion, validation, build, and accessibility
   behavior continue to pass.

Rollback if a child/caregiver review shows that “Great job!” does not make the
end of a scene clear. The safe rollback is a name-free contextual line with a
new reviewed ElevenLabs asset, not reinstating a fixed learner name.

Privacy guardrail: do not send the learner name to another service merely to
personalize universal feedback. Measurement should record only the feedback
state and success/failure, never the child's name or raw audio.

## Implementation record

- Branch: `codex/learner-name-safe-copy`
- Base: `4c54b7f`
- Implementation commit: pending
- Tests: 611 unit/lifecycle tests passed; 119 Chromium tests passed in 37.7
  seconds with four workers; the production build passed; lint passed with zero
  errors and two pre-existing generated-file warnings.
- Browser review: the 390×844 incorrect-answer flow rendered account **Mia**
  above **“Almost! Try again.”**, with stable artwork and controls and no console
  warnings or errors.
- Screenshot:
  [`retry-feedback-390x844.jpg`](../../artifacts/ux-review/learner-name-safe-copy/retry-feedback-390x844.jpg).

## Open question

Does the learner understand the generic final cue as the end of the scene? The
cheapest useful evidence is five observed sessions with 4–6-year-old beginners:
after the cue, ask the child to show whether the lesson is finished without an
adult explaining the screen.
