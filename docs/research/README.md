# Parrot English Research

This directory is the durable evidence base for product decisions. Its purpose
is not to make the product look "research-backed." It is to make assumptions,
trade-offs, unknowns, and evidence inspectable by the next person who changes
the product.

Last reviewed: 2026-08-21

## Start here

- [Continuous improvement program](./continuous-improvement-program.md) defines
  how research becomes a reviewable branch, an implementation, and measured
  follow-up.
- [Improvement backlog](./improvement-backlog.md) is the prioritized queue.
- [Source register](./source-register.md) is the canonical list of sources,
  versions, claims, and product decisions.

## Current research memos

- [Beginner language and age](./beginner-language-and-age.md)
- [Cognitive accessibility for young learners](./cognitive-accessibility.md)
- [Child AI safety and privacy](./child-ai-safety-and-privacy.md)
- [Feedback, voice latency, and experience measurement](./feedback-and-latency.md)
- [Grown-up AI and saved-data transparency](./grown-up-ai-transparency.md)

These memos complement the existing
[child-first UX audit](../design/child-first-ux-audit.md) and
[young-learner storytelling guide](../design/young-learner-storytelling.md).

## Evidence rules

1. Start with a product question or observable problem, not a preferred feature.
2. Prefer current primary sources: standards, regulator guidance, original
   research, official technical documentation, and direct child/caregiver
   research.
3. Record the publication or version date and the date accessed. A URL without
   a dated claim is not a durable source.
4. Separate a source's finding from Parrot's design inference. Supplemental
   guidance, small studies, adult studies, and adjacent-age evidence must be
   labelled as such.
5. Do not turn age into an ability score. Segment language proficiency and
   support needs first; use age for safeguarding, themes, motor demands, and
   developmental appropriateness.
6. Treat privacy, safety, and well-being as release criteria rather than future
   polish. These notes are product guidance, not legal advice or a substitute
   for counsel, a DPIA, or research ethics review.
7. Define success and a rollback signal before implementation. Prefer
   observable task success, comprehension, calm recovery, and learner-perceived
   response time over engagement or time-on-app.
8. Never collect raw child audio, transcripts, identifiers, or fine-grained
   network data merely because they would make an experiment easier.

## Memo template

Every new memo should include:

- question and scope;
- audience and important exclusions;
- evidence with direct sources, dates, and limitations;
- product decisions and rejected alternatives;
- measurement and safety guardrails;
- linked branch, commit, screenshots, and tests after implementation;
- unresolved questions and the next cheapest way to reduce uncertainty.

When evidence changes a decision, preserve the earlier reasoning and add a
dated revision note. Do not silently rewrite history.
