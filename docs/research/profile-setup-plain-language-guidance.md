# Profile Setup Plain-Language Guidance

Last reviewed: 2026-08-24

Repository baseline: `eaaff1248a8b2ff9e79f4f8ab754a6ffb1cde0a7`

Branch: `codex/profile-setup-plain-language`

Primary audience: children roughly 5–7 who are beginning English, including
children who cannot yet read English independently

Comparison audience: children roughly 7–10 with the same beginner-English
starting point

## Decision

Replace only the form-profile setup gate's heading, explanation, and primary
action with a literal, dynamically counted version:

- heading: **Answer 6 questions** in the current production questionnaire, with
  the number read from `progress.total` and correct singular/plural grammar;
- explanation: **We save your answers for chats and lessons. A grown-up can
  change your answers.**;
- primary action: **Start questions**; and
- secondary action: keep **Skip for now**.

The exact words are a product hypothesis backed by current interface evidence
and general guidance. They are not proof that a five-year-old understands the
screen, not a privacy notice, and not a consent mechanism. Retain the change
only provisionally until child and caregiver sessions compare explanation and
first action without adult translation.

## Why this branch now

The previous language audit ranked the profile intro immediately after the now
completed acknowledgment-pacing change. The intro gates every new form-profile
learner before the one-question-at-a-time, bilingual questionnaire.

The current setup copy contains 30 visible instructional/action words:

| Part | Current words | Problem |
| --- | ---: | --- |
| **Help Peppa get to know you** | 6 | Relationship framing makes stored answers sound like character awareness. |
| **Answer a few quick questions to personalize chats and lessons. You can change these later in Learner profile.** | 18 | **quick** is an unmeasured timing promise; **personalize** and **Learner profile** are app/data abstractions; the first action is buried. |
| **Set up profile** | 3 | Names an internal product object rather than the immediate task. |
| **Skip for now** | 3 | Existing reversible exit; it already describes the consequence adequately. |

The retained candidate contains 22 words: a three-word task heading, two
one-idea sentences containing fourteen words, a two-word primary action, and
the unchanged three-word exit. This is a 27% reduction, but word count is only
a warning light. The more important changes are literal action, removal of
jargon, removal of the timing promise, and preservation of the saved-data fact.

Three independent reviews ranked the setup language against other reproduced
defects. The visual review ranked the gate first because the 280×568 baseline
requires a three-line heading and five-line English explanation before the
learner reaches otherwise clearer bilingual questions. Accessibility and code
reviews agreed that **Set up profile** should at least become **Start
questions**, but cautioned that a broader rewrite must not remove data-use or
changeability information. This contract preserves both.

The reviews also found separate implementation defects: the profile textarea
and microphone currently share an accidental label boundary, and saving can
disable the focused fieldset and drop focus. Those are higher-confidence
semantic/state fixes, but they affect the question step and should be isolated
in later stacked branches rather than bundled with first-use copy.

## Repository truth behind the words

The child-facing explanation must remain accurate:

- [`worker/learner-profile.ts`](../../worker/learner-profile.ts) enriches a
  submitted answer and persists its raw answer, summary, and profile transition
  before returning the fixed acknowledgment.
- [`src/learner-profile/ProfileEditor.tsx`](../../src/learner-profile/ProfileEditor.tsx)
  exposes saved name, age, and profile information for later changes.
- [`src/app/AboutDialog.tsx`](../../src/app/AboutDialog.tsx) retains the detailed
  grown-up explanation of AI providers, saved account data, correction, and
  deletion.
- Saved learner details are supplied to chat and lesson-personalization paths;
  the existing grown-up editor already describes this as affecting chats and
  lessons.
- **Skip for now** remains available and continues to bypass setup under the
  existing product rule. This branch does not make answering mandatory.

**We save your answers** is therefore a truthful point-of-use disclosure. **A
grown-up can change your answers** is also true, but it does not mean that the
child-directed sentence replaces caregiver notice, lawful-basis analysis,
consent where applicable, retention controls, or jurisdiction-specific legal
review.

## External evidence and its limits

The [W3C cognitive-accessibility objective](https://www.w3.org/WAI/WCAG2/supplemental/objectives/o3-clear-content/)
recommends common words, short sentences, simple tense, short blocks, literal
language, and separated instructions. It also cautions against relying on
numerical concepts. Parrot uses the number only as an orientation cue; the
primary button remains a word action and the learner does not need to calculate
anything. This is supplemental accessibility guidance, not a young-EFL trial
or a WCAG success criterion.

The [Council of Europe CEFR Companion Volume](https://rm.coe.int/cefr-companion-volume-with-new-descriptors-2020/16809ea0d4)
describes Pre-A1 reading as recognition of familiar words with pictures and A1
reading as very short simple text processed phrase by phrase. That supports
reducing this gate to a literal task plus short facts. It does not validate
these exact words, cover early literacy in every home language, or equate age
with proficiency.

The [UK ICO Children's Code transparency standard](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/4-transparency/)
calls for concise, prominent, age-suited privacy information and bite-sized
explanations where a data use is activated. It also says simplification must
not hide what happens and detailed parent information should remain alongside
younger-child explanations. That supports keeping **save**, use, and later
change visible while leaving the grown-up panel intact. The guidance has UK
regulatory context; this memo is not legal advice or a compliance finding.

UNICEF's June 2026
[recommendations for businesses operating AI chatbots](https://www.unicef.org/media/181136/file/UNICEF-When-AI-becomes-friend-Business-recommendations-2026.pdf)
recommend disabling highly persuasive relational framing for child users and
making it difficult to confuse AI with a human. Parrot is a bounded learning
character, not a general companion, so this is indirect evidence. It still
supports removing **get to know you** from the moment personal answers begin
to be stored. The recommendation is international best practice, not a legal
compliance checklist and not proof that the retained alternative is understood.

Source-register references: [LANG-09](./source-register.md),
[A11Y-01](./source-register.md), [A11Y-11](./source-register.md),
[A11Y-12](./source-register.md), [AI-06](./source-register.md), and
[PRIV-07](./source-register.md).

## Alternatives considered

### Rename only the primary button

**Set up profile** → **Start questions** is the lowest-risk local change. It
would leave the 18-word explanation, unverified **quick** promise, profile
jargon, and relationship framing immediately above it. That does not address
the dominant reading burden observed in the compact baseline.

### Use only **Start** and **Not now**

Those labels are shorter, but **Start questions** names the task without asking
the learner to infer it from surrounding prose. Keeping **Skip for now** also
preserves terminology already used on the question screen and avoids changing
two concepts in one experiment.

### Remove the saved-data explanation

This would reduce reading but hide material information exactly when personal
answers begin to be collected. It is rejected.

### Keep **Help Peppa get to know you** for warmth

The waving character already carries warmth. The heading should carry the task.
Removing the phrase does not make the character cold; it avoids suggesting that
the character personally knows or remembers the child.

### Add Mandarin to the gate in this branch

The production questions contain Mandarin text and saved audio, while this gate
is English-only. A concise home-language line could materially help the current
Chinese-learning audience. It is not added silently here because:

- the current fixed-UI language guard intentionally blocks Han characters in
  `src`, while questionnaire translations live in versioned content;
- adding one language is not a general multilingual strategy;
- the saved-data sentence needs native-language and caregiver/privacy review,
  not ad hoc translation; and
- translation adds a separate visual-density variable to the copy comparison.

This branch instead makes the responsive fixture production-real by covering a
six-question bilingual first prompt after **Start questions**. A later branch
should design a content-sourced localized gate, language selection, and audio
support with native review.

### Add a new question or privacy illustration

The current waving image is warm but does not explain questions or saved data.
A meaning-bearing illustration could help a non-reader, but introducing or
generating new character artwork is a separate visual/content experiment with
asset, cultural, and comprehension review. It is not needed to test the smaller
copy hypothesis.

## Age and proficiency

The 5–7 and 7–10 comparison cohorts may need the same beginner English. The
older cohort may reject preschool-coded praise or art without understanding
more advanced words. This branch changes neither artwork nor praise, so later
testing can ask two separate questions:

1. Can the learner explain or act on the setup without translation?
2. Does the screen feel suitable for the learner's age?

Do not use an age answer to infer English ability, literacy, independence, or
safe access to AI features.

## Bounded implementation contract

1. `LearnerProfileSetupView` receives the current `progress.total` count from
   the already loaded full profile state.
2. The heading renders **Answer 1 question** or **Answer _n_ questions** with no
   hard-coded production count.
3. The explanation is exactly two visible sentences: **We save your answers for
   chats and lessons. A grown-up can change your answers.**
4. The primary action is exactly **Start questions**.
5. **Skip for now**, art, card composition, heading focus lifecycle/reading cue,
   action order, and focus order remain unchanged.
6. The setup contains none of **personalize**, **Learner profile**, **quick**, or
   **get to know you**.
7. The viewport fixture starts with six questions and the production bilingual
   name prompt, while its deterministic two-step transition may remain a
   bounded test fixture.
8. Do not change persistence, API payloads, route behavior, question order,
   answer requirements, acknowledgment, audio, timing, dependencies, or grown-up
   copy.

## Acceptance evidence

### Rendered behavior

- unit rendering covers plural and singular counts, exact visible sentences,
  exact primary/secondary actions, and absence of retired wording;
- Playwright uses headings, visible text, and accessible button names rather
  than source or class assertions;
- heading programmatic focus, next Tab target, action order, and minimum 44×44
  CSS pixel targets remain unchanged;
- setup, production-real bilingual question, acknowledgment, and next question
  remain usable at 280×568, 390×844, 640×360, and 1440×900;
- no horizontal overflow, account overlap, obscured action, or unexpected main
  scroll appears; and
- reduced-motion and delayed-image geometry remain stable.

### Visual evidence

Retain genuine baseline and candidate images for the setup at 280×568,
640×360, and 1440×900, plus the bilingual first question at the most pressured
phone and short-landscape sizes. Record viewport, state, visible geometry, file
type, dimensions, and SHA-256 in the artifact manifest.

### Product research still required

In moderated sessions, ask learners to show what they think the main button will
do and explain, in their preferred language, what happens to their answers.
Record correct first action, adult-help request, use of Skip, and whether the
learner thinks Peppa is a person who remembers them. Do not treat speed,
completion, or preference alone as comprehension or well-being evidence.

## Rollback and revision criteria

Revise rather than defend the copy if:

- learners interpret **Answer 6 questions** as a test or cannot connect it to
  the main action;
- **save**, **chat**, **lesson**, **grown-up**, or **change** repeatedly need
  translation with no visual/audio support;
- caregivers think the short explanation overstates, understates, or obscures
  the actual data flow;
- a localized gate proves more effective and can be maintained through the
  content pipeline; or
- responsive evidence shows the replacement hides or displaces an action at a
  supported viewport.

Do not restore **quick**, relationship framing, or hidden data use merely to
improve completion rate.

## Follow-up questions

- Should the point-of-use explanation have a simple saved-data symbol or a
  replayable home-language audio line?
- Which supported home languages should be selected, and by whom?
- Can the exact count be represented visually without requiring number skills
  or making the setup feel like an assessment?
- Should **Skip for now** become **Not now** after a separate comprehension
  comparison, and should the same term change on question screens?
- Can children and caregivers find the detailed **AI and saved data** panel
  before answering?
- Does the answer textarea retain the exact accessible name **Your answer** once
  its nested microphone button is separated in the next semantic branch?
- How should profile save pending/success/error states retain focus and one
  feedback owner without changing this copy contract?
