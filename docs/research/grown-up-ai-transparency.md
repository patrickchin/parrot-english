# Grown-up AI and Saved-Data Transparency

Last reviewed: 2026-08-21  
Status: implemented on `codex/grown-up-ai-transparency`  
Implementation commit: `7a36b94`
Audience: caregivers and other grown-ups supporting a young English learner

## Question and scope

Can Parrot give a grown-up a short, accurate explanation of where AI is used,
what the account keeps, and what the grown-up can remove, without adding policy
language to a child's main learning path?

This memo covers the account-menu explanation, adjacent deletion and optional
story-art copy, and the repository evidence for each product statement. It does
not establish provider retention settings, legal compliance, a privacy policy,
a DPIA, or that the product is “safe for children.”

## Observed problem

The existing **About** menu item opened a technically useful deployment panel,
but it did not answer the questions a caregiver needs before or after a child
uses AI features. Nearby documentation also used absolute phrases such as “raw
audio is not stored” and “original photo never stored.” Those phrases described
Parrot's own application storage, but omitted live processing by external
services.

The risk was reassurance through omission. A technically correct claim about
D1 or R2 could be read as a claim about the complete provider data path.

The product direction follows:

- UNICEF's [Guidance on AI and children 3.0](https://www.unicef.org/innocenti/reports/policy-guidance-ai-children)
  (December 2025), which treats transparency, privacy, safety, well-being, and
  accountability as connected child-centred requirements;
- the UK ICO [Children's Code](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/?search=consent),
  accessed 2026-08-21, which supports best interests, age-appropriate
  transparency, data minimisation, and privacy-protective defaults;
- the US FTC's [2025 COPPA rule changes](https://www.ftc.gov/news-events/news/press-releases/2025/01/ftc-finalizes-changes-childrens-privacy-rule-limiting-companies-ability-monetize-kids-data),
  which reinforce legible purposes and bounded retention, subject to
  jurisdiction-specific legal review; and
- W3C COGA guidance to [use clear words](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o3p01-clear-words/)
  and [clear visible labels](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o4p06-clear-labels/).

These sources guide the design; none certifies this implementation. See
[AI-01, PRIV-01, PRIV-02, A11Y-01, and A11Y-02](./source-register.md) for dated
source notes and limits.

## Repository-verified data inventory

| Activity | Input and outside processing | What Parrot keeps | Removal boundary | Repository evidence |
| --- | --- | --- | --- | --- |
| Custom lesson generation | A topic and learner name are sent to OpenAI to produce a draft lesson. | A generated lesson is saved only after the grown-up chooses Save; uploaded and edited My Lessons are also owner-scoped in D1. | The lesson rows cascade when the account is deleted. | [`worker/lesson-generator.ts`](../../worker/lesson-generator.ts), [`worker/my-lessons.ts`](../../worker/my-lessons.ts), and `learnerLesson` in [`src/db/schema.ts`](../../src/db/schema.ts) |
| Speaking checks and typed profile transcription | A bounded audio file is sent through the Worker to Groq speech-to-text. | The handlers return transcript/scoring data but do not write the audio to D1 or R2. Profile answers may later be saved as profile text. | Saved profile data cascades with the account. Provider-side processing and retention are outside this repository. | [`worker/groq.ts`](../../worker/groq.ts), [`src/lessons/evaluation-request.ts`](../../src/lessons/evaluation-request.ts), and `learnerProfile` in [`src/db/schema.ts`](../../src/db/schema.ts) |
| Live voice conversation | LiveKit transports audio; the agent uses OpenAI Realtime and OpenAI transcription. Session recording is set to `false`. | Finalized user and assistant words are saved as text turns, including finalized user speech still pending when a conversation ends early. Session state and finish reason are also saved. | Conversation rows cascade with the account. Provider-side audio processing and retention still require a separate deployed-provider review. | [`agent/config.ts`](../../agent/config.ts), [`agent/index.ts`](../../agent/index.ts), [`agent/peppa-conversation.ts`](../../agent/peppa-conversation.ts), [`worker/conversation-repository.ts`](../../worker/conversation-repository.ts), and `conversationSession` / `conversationTurn` in [`src/db/schema.ts`](../../src/db/schema.ts) |
| Learner setup or profile editing | Live voice uses the same voice services as conversation and a finished transcript may be summarized through Groq. Form answers use Groq for factual enrichment. The fixed confirmation sound is a checked-in app asset and makes no runtime ElevenLabs request. | Learner setup and profile editing can update name, age, and the profile description. | Profile and conversation rows cascade with the account. | [`worker/conversation-profile-finalization.ts`](../../worker/conversation-profile-finalization.ts), [`worker/learner-profile.ts`](../../worker/learner-profile.ts), [`lib/static-audio.js`](../../lib/static-audio.js), and [`worker/conversation-repository.ts`](../../worker/conversation-repository.ts) |
| Ordinary Talk to Peppa chat | LiveKit and OpenAI process the live conversation as above. | Conversation text is saved, but the `small-chat` purpose does not update the learner profile. | Conversation rows cascade with the account. | [`lib/conversation-purpose.ts`](../../lib/conversation-purpose.ts), [`worker/conversation-repository.ts`](../../worker/conversation-repository.ts), and [`worker/conversation-profile-finalization.ts`](../../worker/conversation-profile-finalization.ts) |
| Optional personalized story art | The browser crops and normalizes the selected photo. A copy is sent to Cloudflare Workers AI with a scene reference. | Parrot persists only the generated derivative in private R2 plus owner-scoped metadata and consent fields in D1; the source photo is not persisted in Parrot's D1 or R2. | Delete story art removes its R2 object before deleting its row. Account deletion purges the user's art prefix before the account cascade. | [`src/stories/personalized-story-art-client.ts`](../../src/stories/personalized-story-art-client.ts), [`worker/personalized-story-art.ts`](../../worker/personalized-story-art.ts), and [`worker/account-deletion.ts`](../../worker/account-deletion.ts) |
| Account deletion | Better Auth verifies and runs the deletion flow. | Account-linked profile, lesson, conversation, and art rows are deleted. A non-reversible SHA-256 user-id hash, R2 prefix, and request time remain as an account-deletion tombstone so stale private art cannot return. | The tombstone intentionally does not cascade. Backup and external-provider retention are not defined by this code. | [`worker/auth.ts`](../../worker/auth.ts), [`worker/account-deletion.ts`](../../worker/account-deletion.ts), and `accountDeletionTombstone` in [`src/db/schema.ts`](../../src/db/schema.ts) |

## Decisions implemented

1. Rename the menu item and dialog from **About** to **AI and saved data**. The
   label states the caregiver task rather than the implementation container.
2. Put the caregiver explanation first in three scannable cards:
   **How Parrot uses AI**, **What this account keeps**, and **What you can do**.
3. State that AI can hear or say something wrong and ask a grown-up to review
   generated lessons and stay nearby during voice chat. This is a limitation,
   not a safety badge.
4. Distinguish outside processing from Parrot account storage. The UI says raw
   audio is not added to the Parrot account; it does not say nobody processes or
   retains audio.
5. Explain that conversation text can be saved even when a conversation ends
   early and that ordinary chat does not change the learner profile.
6. Name Cloudflare Workers AI at the point where a cropped photo copy leaves the
   browser. Rename **Delete learner photo** to **Delete story art**, because the
   product does not persist the source photo.
7. Explain the deletion tombstone instead of promising permanent deletion with
   no exception.
8. Preserve build versions and model identifiers under a collapsed
   **Technical build details** disclosure. A failed metadata request does not
   hide the static caregiver explanation.
9. Keep the dialog in the existing grown-up account menu so child activity
   screens remain unchanged.

## Alternatives rejected

- **A shield, lock, or “safe” badge:** rejected because it implies a verified
  safety or privacy status that the repository cannot establish.
- **“Nothing is saved,” “raw audio is never stored,” or “the photo is never
  stored”:** rejected because external services process those inputs and their
  deployed retention settings are not proved here.
- **“Permanently delete everything”:** rejected because the deletion tombstone
  intentionally remains and provider/back-up retention is not established.
- **Technical metadata first:** rejected because commit hashes do not answer a
  caregiver's primary questions.
- **Policy-length copy on child activity screens:** rejected because it would
  increase reading and decision load for the primary learner audience.
- **A new settings route:** deferred because the existing modal provides a
  durable, reversible surface with less navigation and no new child path.

## Validation and evidence

- Full unit/lifecycle suite: 610 tests passed.
- Responsive header/dialog suite: 33 Chromium tests passed, including a
  280×480 failed-metadata case.
- Dialog behavior covers accessible naming, initial focus, keyboard order,
  bidirectional focus trapping, Escape/Done closure, minimum 44px controls,
  scroll containment, and horizontal overflow.
- Build passed; lint reported zero errors and two pre-existing warnings in the
  generated `worker-configuration.d.ts` file.
- Manual in-app browser review covered 280×568, 390×844, and 1440×900. It found
  that list semantics were present but bullet marks were reset by Tailwind; the
  final UI explicitly restores `list-disc`.
- Saved screenshots:
  - [`ai-data-280x568.jpg`](../../artifacts/ux-review/grown-up-ai-transparency/ai-data-280x568.jpg)
  - [`ai-data-390x844.jpg`](../../artifacts/ux-review/grown-up-ai-transparency/ai-data-390x844.jpg)
  - [`technical-details-1440x900.jpg`](../../artifacts/ux-review/grown-up-ai-transparency/technical-details-1440x900.jpg)

This establishes implementation consistency and basic usability. It does not
establish caregiver comprehension or informed consent.

## Claims intentionally not made

- that Parrot is COPPA-, GDPR-, or Children's Code-compliant;
- that any AI conversation is always accurate or safe;
- that LiveKit, OpenAI, Groq, Cloudflare, or ElevenLabs retain nothing;
- that deletion immediately removes provider copies or backups;
- that no one other than the account holder can ever access account data;
- that the explanation is a complete privacy notice; or
- that young children can understand or meaningfully consent to these data
  flows without grown-up support.

## Measurement and safety guardrails

The next useful measurement is a short caregiver comprehension task, not click
or dwell analytics. After one read, a caregiver should be able to answer:

1. Which features use AI?
2. Does Parrot save conversation words?
3. Does ordinary Talk to Peppa change the learner profile?
4. What happens to an optional learner photo and generated picture?
5. What does Delete account remove, and what exception remains?

Do not record answers, transcripts, or child identifiers merely to measure this.
Use consented, task-based sessions and record only aggregate task outcomes.

Rollback or revise the copy if a caregiver reasonably infers that providers do
not process inputs, that story art deletion removes a source photo from Parrot,
or that account deletion proves immediate erasure from every provider and
backup.

## Open questions

- What retention, regional processing, and training settings are active in each
  deployed provider account?
- Where should a grown-up report an unsuitable AI response? No in-product report
  path exists today.
- Is data export required and, if so, which account-linked records should it
  include?
- Can a caregiver find this explanation before first AI use without adding a
  child-facing interruption?
- Can caregivers with limited English understand the current grown-up copy, or
  should the product offer localized explanations?
