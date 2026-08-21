# Child AI Safety and Privacy

Last reviewed: 2026-08-21  
Question: How should Parrot English use generative AI, character conversation,
voice, personalization, and learner data without confusing or exploiting a
young child?

## Conclusion

AI should be a bounded language-practice tool under grown-up control, not a
friend, caregiver, authority, confidant, or engagement engine. The product must
make the boundary visible through behavior as well as copy: limited activity
scope, no proactive pressure, no emotional-dependence cues, a clear finish, and
an adult-readable explanation of what AI does, may get wrong, processes, saves,
and deletes.

Current child-AI evidence is incomplete. UNICEF's 2026 snapshot reports broad
child use and substantial evidence gaps. That uncertainty supports conservative
defaults and direct evaluation; it does not support stronger safety or learning
claims.

This memo guides product design. It is not legal advice, a privacy policy, a
COPPA/GDPR determination, a DPIA, or an ethics review.

## AI boundary

Parrot characters may:

- model and practice defined English language;
- respond within an age-appropriate activity;
- say that they are part of an app or practice activity;
- admit uncertainty and suggest asking a grown-up;
- stop when the child or grown-up chooses Finish.

They must not:

- claim to be human, alive, conscious, the child's best friend, or a substitute
  for a trusted person;
- ask the child to keep secrets, return later, maintain a streak, or stay longer;
- imply hurt, abandonment, disappointment, or lost relationship if the child
  leaves;
- initiate open-ended personal probing unrelated to language practice;
- provide authoritative medical, legal, safety, or crisis advice;
- reward disclosure of personal information;
- continue indefinitely or autoplay into another interaction.

Character warmth is compatible with these limits. The goal is a kind teacher
or scene partner, not simulated mutual dependence.

## Grown-up transparency surface

The product should provide one easy-to-find, plain-language summary that is
verified against implementation and explains:

1. where AI is used: lesson creation, speech/transcription or evaluation,
   real-time character conversation, and optional personalized art as
   applicable;
2. that AI can misunderstand speech, generate an unsuitable response, or make
   factual mistakes;
3. what raw audio, transcript text, profile data, uploaded images, generated
   images, and technical diagnostics are processed, stored, retained, and
   deleted;
4. which actions can update a learner profile and which cannot;
5. how to stop an activity, remove optional personalization, export or correct
   data if supported, and delete an account;
6. how to report a problem and when a grown-up should stay nearby.

Do not claim "nothing is saved," "safe for children," "COPPA compliant," or
"private" unless the complete deployed data path and applicable legal standard
support that exact claim. Product copy must distinguish live processing from
persistent storage.

## Data rules

- Collect the minimum data needed for a named child benefit.
- Choose privacy-protective defaults; optional personalization requires a
  deliberate grown-up action and an equally clear removal path.
- Do not collect child data for advertising, resale, unrelated profiling, or
  engagement optimization.
- Do not retain data indefinitely or "just in case." Record purpose, retention,
  deletion trigger, storage location, processor, and access boundary.
- Avoid raw audio retention when derived, minimal signals can fulfill the
  learning purpose.
- Telemetry must not contain raw audio, transcript content, uploaded images,
  persistent device identifiers, IP/candidate addresses, or fine-grained
  network/location data.
- Separate child-facing participation from adult consent and configuration.
- A deletion path must include owned and derived records, generated assets,
  caches, backups/retention exceptions, and third-party processor behavior.

## Pre-release review

For any new AI or data feature, record:

- the concrete child benefit and a non-AI/less-data alternative;
- expected and unexpected users, including a child using it alone;
- input and output data flow, vendors/processors, locations, retention, and
  deletion;
- prompt and model boundaries, unsafe-output handling, and human escalation;
- how the child understands current state and can stop;
- caregiver controls and explanation;
- bias, exclusion, accessibility, and failure modes;
- adversarial and ordinary-child test cases;
- incident response and rollback switch;
- jurisdiction-appropriate legal and privacy review when applicable.

## Evidence and limits

See [AI-01 through AI-04](./source-register.md) and
[PRIV-01 through PRIV-02](./source-register.md). UNICEF guidance supplies a
child-centred review framework, not a product certification. FTC and ICO
materials have jurisdictional scope and require qualified legal interpretation.
Research on long-term child relationships with conversational AI remains
limited, so Parrot should avoid companion patterns rather than attempt to tune
their persuasiveness.

## Immediate product implication

The existing grown-up About surface should be audited against the deployed data
flow and expanded with a short, factual "AI and saved data" explanation. This
must be implemented only after verifying each sentence in code and deployment
documentation. It should link to more detail rather than placing policy-length
copy in the child's path.

## Open questions

- Which deployed providers see audio, text, profile fields, or images, and under
  what retention settings?
- Can the current conversation be reliably constrained to language practice
  across prompt injection, personal disclosure, and sensitive-topic tests?
- What does a five-year-old believe the character is, and does the interface
  create a false sense of friendship or authority?
- Which transparency details do caregivers need before first use versus in a
  durable settings/about surface?
