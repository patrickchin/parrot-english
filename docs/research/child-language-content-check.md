# Child-Language Content Check

Last reviewed: 2026-08-21  
Question: What is the smallest explainable check that helps a grown-up notice
complex child-facing language in a generated, imported, or edited custom lesson
without blocking valid content or pretending to measure a child?

## Audit

All three custom-lesson paths already meet in the visual editor:

- AI generation returns a normalized lesson and structural warnings;
- JSON import parses and normalizes the pasted lesson in the browser;
- editing loads the saved normalized lesson and submits it through the same
  preparation boundary again.

The shared preparation logic repairs missing or incompatible data and reports
warnings. It intentionally has no curriculum rules. The editor already renders
those warnings in a grown-up review surface, but clears repaired-field warnings
after an edit because the repaired value is now in the draft.

The smallest useful addition is therefore a pure advisory pass over the current
lesson object at render time. Generation, import, and later editing all receive
the same feedback, and a note disappears immediately when its line is revised.
No second form, score, dependency, network request, or save gate is needed.
Language-only notes are not a live status region, so their changing word counts
do not interrupt assistive-technology users while they type. Existing repair
warnings retain their status announcement.

## Implemented rules

| Child-facing text | Warning light | Explanation shown to the author |
| --- | ---: | --- |
| Learner practice line | More than 7 words | Gives the exact word count and suggests one shorter phrase |
| Character/narrator question | More than 7 words | Gives the exact word count and suggests one short question |
| Other character/narrator line | More than 13 words | Gives the exact word count and suggests splitting it into one idea at a time |
| Main dialogue or scripted feedback | Explicit technical term such as `API`, `JSON`, `authentication`, or `configuration` | Names the term and asks the author to keep it only when taught or explained |

At most eight detailed language notes are shown, followed by a count of hidden
notes. Contractions count as one word. The pass reads main dialogue and correct,
retry, final, and optional no-speech feedback.

These thresholds are warning lights, not validation rules. They do not edit the
draft and Save remains enabled.

## Evidence and decision limits

The decision uses [LANG-03 and LANG-05](./source-register.md): Cambridge Pre-A1
tasks use short spoken language, pictures, and brief responses; British Council
guidance recommends short, graded, demonstrated directions and comprehension
checking. The working 7/13-word warning lights are recorded in
[Beginner Language and Age](./beginner-language-and-age.md).

Neither source validates a universal word-count threshold for five-year-olds.
The checker therefore does **not** calculate reading age, CEFR level,
readability, vocabulary knowledge, intelligence, or learning ability. It does
not infer skill from chronological age.

False positives are expected:

- a longer line may be deliberate target language or a familiar repeated song;
- an acronym or technical word may be the lesson topic;
- word count cannot detect abstract short words, idiom, unclear reference,
  cultural mismatch, pronunciation difficulty, or whether the picture carries
  the same meaning;
- imported non-English or mixed-language content is not language-identified;
- a simple-looking line can still be confusing to one learner.

The technical-term list is deliberately small and inspectable. Expanding it
requires observed authoring problems or a versioned learner-vocabulary source;
an opaque “AI readability” score would make a stronger claim with less useful
explanation.

## Measurement and rollback

Seeded long questions, learner lines, feedback, and technical terms must produce
the expected accessible review notes. Existing short lesson fixtures must stay
note-free. Saving must remain available, and the checker must not mutate the
lesson.

Retain the check if grown-ups can use the note to make or consciously reject a
specific edit. Revise or remove a rule if direct review shows that it creates
repeated noise without useful edits. Do not use warning count as a child-quality
score.

## Hand-off record

```text
Branch: codex/child-language-content-checks
Base branch / dependency: codex/continuous-research-program at 8baaae7
Implementation commit: 6f0392d
Hypothesis: Concrete, non-blocking language notes make complexity reviewable without claiming to measure a learner.
Changed: Pure dialogue/feedback advisory; existing grown-up warning surface; focused tests; author and research docs.
Not changed: Lesson schema validity, save behavior, generation prompt, built-in lessons, learner profile, vocabulary/proficiency inference, picture-language review.
Tests: npm test (614 passed); focused language/UI tests (11 passed); lesson-creator Chromium tests (6 passed); npm run lint (passed with 2 pre-existing generated-declaration warnings); npm run build (passed)
Screenshots / traces: No screenshot required because layout and interaction structure are unchanged; Chromium verifies the note appears, is not a live status, clears after revision, and does not block save.
Measured result: Existing short fixture produced 0 notes; four seeded risk types each produced an exact note; noisy output stopped at 8 details plus a summary; mutation assertion passed.
Risks / limitations: Word counts and an explicit term list can only prompt human review; they cannot judge comprehension.
Retain, revise, or reject: Retain as a small advisory; validate false-positive usefulness with caregiver review before expanding rules.
Next question: Which notes cause useful edits in caregiver review, and which are dismissed as noise?
```
