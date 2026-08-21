# Age-Adaptive Experience Guidance

Last reviewed: 2026-08-21  
Status: research guidance; no learner mode has been validated or implemented  
Question: How could Parrot English serve learners beyond its current
five-year-old beginner audience without confusing age with English ability?

## Decision

Do not use age to choose English difficulty. Use three separate inputs:

1. **Language profile** controls listening, speaking, reading, and writing
   difficulty independently.
2. **Experience cohort** informs themes, visual tone, independence, caregiver
   involvement, and the form of privacy explanations.
3. **Access preferences** control pace, captions, replay, target size, motion,
   and other support without being inferred from age.

The first useful research cohorts are approximately **4–6**, **7–10**, and
**11–15**. They are planning ranges, not placement rules or claims about what a
child can do. A learner or grown-up should be able to change an experience
style without changing the learner's language level, history, or safeguards.

This follows the Council of Europe's warning that its young-learner age bands
are a road map for reflection rather than a definitive scheme. The same source
says literacy, cognitive development, and social development vary within an
age group and that its descriptors are not a ready-made curriculum
([LANG-01](./source-register.md), [LANG-02](./source-register.md)). NAEYC
similarly asks educators to consider developmental commonalities, each child's
individual experience, and social and cultural context together
([DEV-02](./source-register.md)).

## Planning cohorts

These defaults are hypotheses to take into child and caregiver research. They
must not become hard age gates.

| Planning cohort | Language and learning | Interaction and feedback | Content and visual direction | Grown-up and privacy role |
| --- | --- | --- | --- | --- |
| **Supported early learner, approximately 4–6** | Start with listening, literal pictures, demonstration, pointing or tapping, imitation, yes/no, and one-word responses. Printed English is optional support, not the only carrier of meaning. | One dominant action, ordinary taps rather than hidden or compound gestures, stable control positions, immediate visible acknowledgement, and a nearby replay or help route. Model before asking for an independent response. | One meaning-bearing scene at a time; familiar people, animals, objects, routines, movement, songs, and safe small stories. Decorative detail must not compete with the target. | Keep full data information and consequential settings in a grown-up path. A child-facing prompt can say or show **Get a grown-up**. Do not hide the fact that data is processed just because the explanation is short. |
| **Emerging-independent learner, approximately 7–10** | Keep a low-English entry point. Add optional sound–word links, short visible phrases, matching, ordering, and brief answers only when the learner's reading profile supports them. Measure listening, speaking, reading, and writing separately. | Preserve the same predictable practice loop while allowing independent replay, help, pace, and a small number of meaningful choices. Show compact visual progress; do not turn progress into another reading task. | Broaden beyond preschool cues to school, hobbies, family, friendship, local places, nature, making, and simple mysteries. Retain literal picture support and let interests vary within the cohort. | Explain basic service and privacy concepts with short words plus illustration, audio, or video. Keep grown-up resources and collaborative boundaries available. |
| **Independent young beginner, approximately 11–15** | A teenager at Pre-A1 may still need isolated words, formulaic phrases, slow models, and concrete situations. Keep the English simple while making topics and tone age-respectful. Offer explicit, skill-specific goals rather than assuming more text is better. | Give more control over goals, pace, replay, captions, and review. Use calm private retry and neutral feedback; avoid babyish praise, public-looking scores, or forced character enthusiasm. Keep escape and trusted-adult help routes. | Test school life, interests, sport, music, travel, community, practical tasks, and safe digital-life situations with participants. Use a less preschool-coded visual treatment without removing clarity or meaning-bearing images. | Provide an age-suitable explanation of data use with optional more/less detail and written or audio/video forms. Support growing autonomy and privacy while keeping a trusted-adult route. |

### Product boundaries

- **Under four:** do not position the current microphone-led app as an
  independent experience. A future caregiver-led listen, point, move, or story
  activity needs separate research, including whether a screen is useful at
  all.
- **Ages 16 and over:** do not stretch a child-coded interface with a new color
  theme and call it suitable. Council of Europe source portfolios above 15
  tended to resemble adult portfolios, and the ICO treats ages 16–17 as
  approaching adulthood. Explore an adult-style beginner experience as a
  separate product hypothesis while retaining all protections applicable to
  minors.

## What remains universal

Age adaptation must not remove these defaults:

- English level comes from demonstrated skill, not age, school year, accent,
  home language, or inferred maturity.
- Instructions use concrete common words, visible labels, and one clear next
  action. Important state changes are visible and accessible.
- Every learner can pause, replay, slow down, retry, go back, ask for help, and
  finish without shame or loss of safe progress.
- Touch targets, focus, contrast, reduced motion, captions, and assistive
  technology support remain accessibility requirements, not a "young child
  mode."
- Pictures communicate the target meaning. Older learners may prefer a
  different illustration style, but they should not lose visual support merely
  because of age.
- Privacy-protective defaults, minimal data, bounded AI behavior, and freedom
  from manipulative engagement mechanics apply to every cohort.
- Home languages and multilingual experience are assets. Optional
  home-language support must not silently lower expectations or replace
  target-language practice.
- The product measures comprehension, independent recovery, later transfer,
  and learner-perceived dignity. Session length and repeated tapping are not
  success measures.

These rules draw on W3C cognitive-accessibility patterns and WCAG 2.2
([A11Y-01 through A11Y-05](./source-register.md)), UNICEF's child well-being
framework ([WELL-01](./source-register.md)), and the UN Committee on the Rights
of the Child's emphasis on children's evolving autonomy and privacy
([RIGHTS-01](./source-register.md)).

## Smallest coherent product model

Do not build automatic age detection or a many-variable adaptive engine. The
lowest-risk first model is:

1. Keep today's supported early-learner experience as the default.
2. Let a grown-up choose an optional **experience style** for a research
   prototype.
3. Keep the language profile and support controls separate and reversible.
4. Associate content with a broad interest/cohort suitability review, a
   language profile, and a support mode such as listen, join in, or read.
5. Apply the safest privacy and AI defaults to everyone. Do not collect a full
   birth date or infer age from voice or behavior merely to change the theme.

The ICO notes a tension between age assurance and intrusive data collection;
when age confidence is not proportionate to the risk, applying child
protections broadly is an available approach ([PRIV-02](./source-register.md)).
Any real age-assurance or consent design still requires legal and privacy
review for the markets served.

## Future experiments

Run each experiment with the relevant cohort, varied home languages, and varied
access needs. Obtain appropriate caregiver consent and child assent, retain no
raw child audio for convenience, and stop when a child wants to stop.

### 1. Same English, different experience tone

Hold a Pre-A1 lesson script, target words, task, timing, and controls constant.
Compare an early-childhood visual/feedback treatment with a school-age or
teen-respectful treatment.

- **Question:** Can Parrot improve preference and dignity without changing
  comprehension?
- **Measure:** task comprehension, first-action time, help requests, voluntary
  retry, child explanation of what felt "for me," and observed discomfort.
- **Rollback:** the adapted treatment lowers comprehension, hides the next
  action, or participants describe it as babyish, school-like, or embarrassing.

### 2. Optional print for ages 7–10

Compare audio plus literal art with audio, art, and one synchronized short
phrase. Check the learner's reading profile separately first.

- **Question:** Does the short phrase improve sound–word connection without
  turning the task into unsupported reading?
- **Measure:** meaning selection, word recognition in a later scene, replay,
  and whether the learner waits for adult explanation.
- **Rollback:** print captures attention while meaning or speaking success
  falls.

### 3. Choice density for ages 7–10 and 11–15

Compare one next activity with three clearly described activity choices. Do
not change the language difficulty or use persuasive recommendations.

- **Question:** When does more agency help rather than add reading and decision
  load?
- **Measure:** independent choice, time to begin, backtracking, help requests,
  and whether the learner can state the activity goal.
- **Rollback:** choice delays or prevents practice, or one option is selected
  mainly because its meaning is unclear.

### 4. Private feedback for ages 11–15

Compare the current character-led praise with brief neutral acknowledgement
and a private retry option after the same speaking attempt.

- **Question:** Which response feels respectful and still makes the next step
  obvious?
- **Measure:** willingness to retry, comprehension of the feedback, stated
  preference, and embarrassment or reluctance observed in moderated research.
- **Rollback:** feedback feels punitive, vague, or less recoverable.

### 5. Layered data explanation

Prototype age-suitable child summaries alongside the existing grown-up detail:
audio/illustration plus **Get a grown-up** for early learners; basic concepts
for ages 7–10; and progressive written/audio detail for ages 11–15.

- **Question:** Can learners answer who or what processes their voice and how
  to get help before starting?
- **Measure:** explanation in the learner's own words and correct selection of
  a safe next action. Do not log the explanation content as product telemetry.
- **Rollback:** a shorter explanation creates false reassurance or hides a
  material data use.

## Evidence base and limitations

Primary and authoritative sources were accessed on 2026-08-21:

- Council of Europe, [young-learner descriptors for ages
  7–10](https://rm.coe.int/16808b1688) and [ages
  11–15](https://rm.coe.int/16808b1689), 2018. These are mapped examples and
  relevance judgements, not calibrated child norms, a placement test, or a
  curriculum. The source explicitly excludes pre-primary learners because
  validated material was scarce.
- Cambridge English, [Pre A1 Starters, A1 Movers and A2 Flyers handbook for
  teachers](https://www.cambridgeenglish.org/Images/357180-starters-movers-and-flyers-handbook-for-teachers-2024.pdf),
  2024. Its picture-supported tasks and skill-specific can-do framing are
  useful references, but an assessment suite is not a complete learning
  sequence or proof of app efficacy.
- NAEYC, [Developmentally Appropriate Practice core
  considerations](https://www.naeyc.org/resources/position-statements/dap/core-considerations)
  and [curriculum
  guidance](https://www.naeyc.org/resources/position-statements/dap/planning-curriculum),
  position statement 2020. It covers birth through age eight and educational
  settings; it does not validate a Parrot interface or the older cohorts.
- Harvard Center on the Developing Child, [executive-function activity guide
  from early childhood through
  adolescence](https://developingchild.harvard.edu/resources/handouts-tools/activities-guide-enhancing-and-practicing-executive-function-skills/),
  2014. It supports age-appropriate scaffolding and practice, but it is a
  general activity guide rather than a child-interface trial.
- UK Information Commissioner's Office, [meet children's needs as they change
  over
  time](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/designing-products-that-protect-privacy/childrens-code-design-guidance/meet-children-s-needs-as-they-change-over-time/),
  accessed 2026-08-21. Its brackets and recommendations concern privacy design
  in the UK; they are not a general cognitive taxonomy or legal advice for all
  jurisdictions.
- UN Committee on the Rights of the Child, [General Comment No. 25 on
  children's rights in the digital
  environment](https://docstore.ohchr.org/SelfServices/FilesHandler.ashx?enc=xfBzr2AVJ%2Fm%2FfXIEXW7hxTQrHodGBGQOLLAn9EXr%2BedAbHbjEePoBTI%2BN6n2B7SsntVQOGEX%2BbN2V0PM2w7hhQ%3D%3D),
  2021. It supports rights, growing autonomy, privacy, and caregiver support;
  it does not prescribe interface variants.
- UNICEF Innocenti, [Responsible Innovation in Technology for
  Children](https://www.unicef.org/innocenti/reports/responsible-innovation-technology-children),
  phase 2 report, 2024. Its findings concern digital play and well-being, not
  English-learning outcomes or a universal effect for every child.
- W3C, [Making Content Usable for People with Cognitive and Learning
  Disabilities](https://www.w3.org/TR/coga-usable/) and [WCAG
  2.2](https://www.w3.org/TR/WCAG22/). The cognitive patterns are supplemental
  guidance; WCAG is the normative accessibility baseline. Neither replaces
  usability research with the intended cohorts.

No source establishes the three Parrot cohorts as optimal, proves that a
specific visual style is age-respectful across cultures, or tells us how a
five-year-old and a thirteen-year-old with the same English level will respond
to this product. Device access, school context, disability, literacy, home
language, culture, and previous English exposure may matter as much as age.
Moderated research with children and caregivers is the next evidence step.

## Unresolved questions

- Which visual and feedback cues make older beginners feel respected without
  reducing clarity?
- Which learners want home-language support, and in which states does it help
  rather than replace English practice?
- Can one content catalogue support distinct interest reviews without encoding
  stereotypes about age or gender?
- How should a learner move between experience styles without exposing or
  collecting unnecessary age data?
- What independent child-safety and learning review is required before Parrot
  actively recruits learners older than its present audience?

## Hand-off record

```text
Branch: codex/age-cohort-guidance
Base branch / dependency: codex/continuous-research-program (8baaae7)
Evidence commit: 0850f26
Hypothesis: Separating language level, experience cohort, and access support can
  make future age adaptation more respectful without making English harder.
Changed: Research memo, source register, and research index only.
Not changed: Product UI, content catalogue, data model, age collection, and
  learner defaults.
Tests: git diff --check; local Markdown target check; duplicate source-ID check.
Screenshots / traces: None; no product implementation.
Measured result: Not measured. Proposed experiments define the next evidence.
Risks / limitations: Cohorts remain broad hypotheses and may encode cultural or
  developmental assumptions if implemented without participatory research.
Retain, revise, or reject: Retain as cautious research guidance; validate before
  implementation.
Next question: Does the same Pre-A1 lesson need a different visual and feedback
  treatment for ages 7–10 and 11–15?
```
