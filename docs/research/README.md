# Parrot English Research

This directory is the durable evidence base for product decisions. Its purpose
is not to make the product look "research-backed." It is to make assumptions,
trade-offs, unknowns, and evidence inspectable by the next person who changes
the product.

Last reviewed: 2026-08-24

## Start here

- [Continuous improvement program](./continuous-improvement-program.md) defines
  how research becomes a reviewable branch, an implementation, and measured
  follow-up.
- [Improvement backlog](./improvement-backlog.md) is the prioritized queue.
- [Source register](./source-register.md) is the canonical list of sources,
  versions, claims, and product decisions.

## Current research memos

- [Beginner language and age](./beginner-language-and-age.md)
- [Age-adaptive experience guidance](./age-adaptive-experience-guidance.md)
- [Child-language content check](./child-language-content-check.md)
- [Cognitive accessibility for young learners](./cognitive-accessibility.md)
- [Child AI safety and privacy](./child-ai-safety-and-privacy.md)
- [Bounded conversation safety evaluation](./bounded-conversation-safety-eval.md)
- [Child-friendly Talk error recovery](./child-friendly-talk-errors.md)
- [Child-first UX integration audit](./child-first-ux-integration.md)
- [Contrast-safe child actions](./contrast-safe-child-actions.md)
- [Enabled pink action content contrast](./contrast-safe-child-actions-implementation.md)
- [Shared focus visibility guidance](./shared-focus-visibility-guidance.md)
- [Shared focus visibility implementation](./shared-focus-visibility-implementation.md)
- [Story Reader page-focus visibility guidance](./story-reader-page-focus-guidance.md)
- [Story Reader page-arrival focus implementation](./story-reader-page-focus-implementation.md)
- [Story Reader join-in visibility guidance](./story-reader-join-in-visibility-guidance.md)
- [Story Reader join-in visibility implementation](./story-reader-join-in-visibility-implementation.md)
- [Story Reader completion focus guidance](./story-reader-completion-focus-guidance.md)
- [Story Reader completion focus implementation](./story-reader-completion-focus-implementation.md)
- [Story Reader child-first control order guidance](./story-reader-child-first-tab-order-guidance.md)
- [Story Reader child-first control order implementation](./story-reader-child-first-tab-order-implementation.md)
- [Conversation wait and terminal recovery](./conversation-wait-recovery.md)
- [Repeated Talk failure: picture-led lesson fallback](./repeated-talk-recovery.md)
- [Feedback, voice latency, and experience measurement](./feedback-and-latency.md)
- [First-use UX audit synthesis](./first-use-ux-audit-synthesis.md)
- [First-use timing and state-stability audit](./first-use-timing-stability-audit.md)
- [First-use visual hierarchy audit](./first-use-visual-hierarchy-audit.md)
- [Grown-up AI and saved-data transparency](./grown-up-ai-transparency.md)
- [Lesson start state stability](./lesson-start-stability.md)
- [Lesson microphone direct-action feedback guidance](./lesson-microphone-direct-action-feedback-guidance.md)
- [Lesson microphone direct-action feedback implementation](./lesson-microphone-direct-action-feedback-implementation.md)
- [Lesson speech in short landscape](./lesson-speech-short-landscape.md)
- [Layered lessons in short landscape](./layered-lesson-short-landscape.md)
- [My Lessons error recovery](./my-lessons-recovery.md)
- [Name-safe copy for ready-made lessons](./learner-name-safe-copy.md)
- [Performance and child-perceived latency baseline](./performance-baseline.md)
- [Picture-led first use](./picture-led-first-use.md)
- [Privacy-safe experience events](./privacy-safe-experience-events.md)
- [Child-paced profile acknowledgments](./profile-acknowledgment-control.md)
- [Deterministic beginner-safe profile acknowledgment guidance](./deterministic-profile-acknowledgments-guidance.md)
- [Deterministic profile acknowledgment implementation](./deterministic-profile-acknowledgments-implementation.md)
- [Saved profile acknowledgment audio guidance](./static-profile-acknowledgment-audio-guidance.md)
- [Saved profile acknowledgment audio implementation](./static-profile-acknowledgment-audio-implementation.md)
- [Profile fallback viewport stability](./profile-fallback-viewport-stability.md)
- [Profile fallback viewport-stability guidance](./profile-fallback-viewport-stability-guidance.md)
- [Profile heading reading-position cue guidance](./profile-heading-reading-cue-guidance.md)
- [Profile heading reading-position cue implementation](./profile-heading-reading-cue-implementation.md)
- [Profile replay and account clearance guidance](./profile-replay-account-clearance-guidance.md)
- [Profile replay and account clearance implementation](./profile-replay-account-clearance-implementation.md)
- [Separate profile answer labels guidance](./profile-answer-separate-labels-guidance.md)
- [Separate profile answer labels implementation](./profile-answer-separate-labels-implementation.md)
- [Profile setup plain-language guidance](./profile-setup-plain-language-guidance.md)
- [Profile setup plain-language implementation](./profile-setup-plain-language-implementation.md)
- [Remote audio playback readiness and honest feedback](./remote-audio-playback.md)
- [Responsive lesson and story shelf artwork](./responsive-shelf-art.md)
- [Story controls in short landscape](./story-controls-short-landscape.md)
- [Direct Talk action feedback: sound and microphone](./talk-direct-action-feedback.md)
- [Talk state clarity: one primary signal at a time](./talk-state-clarity.md)
- [Child-facing interface language audit](./child-interface-language-audit.md)
- [Literal voice-state feedback implementation](./voice-state-feedback.md)
- [Voice fallback speaking practice](./voice-fallback-practice.md)

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
