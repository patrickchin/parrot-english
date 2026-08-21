# Cognitive Accessibility for Young Learners

Last reviewed: 2026-08-21  
Question: Which interaction patterns make Parrot English easier to understand,
operate, and recover for young beginners and learners with varied cognitive or
executive-function needs?

## Conclusion

The interface should repeatedly answer four questions without requiring much
English: Where am I? What should I do? Did it work? What can I do if it did not?
The strongest default is one dominant action, a visible literal label, immediate
feedback, predictable state, and a calm way back.

W3C COGA patterns are supplemental cognitive-accessibility guidance rather than
WCAG conformance requirements. WCAG 2.2 remains the normative baseline. Parrot
adopts the supplemental patterns as product defaults because the primary
audience is especially sensitive to language, memory, unfamiliar controls, and
uncertain state.

## Product rules

### Understandable words and controls

- Use familiar, concrete words. Put configuration, deployment, data, and model
  terminology in grown-up surfaces.
- Give primary actions visible labels beside or inside the control. An icon and
  an accessible name are not enough for many children.
- Reuse the same control, position, color role, and verb for the same action.
  Novelty belongs in the story, not the navigation grammar.
- Keep child touch targets at least 44×44 CSS pixels when layout permits, while
  preserving the WCAG 2.2 AA minimum and exceptions.
- Keep keyboard focus strong and unobscured by fixed headers, sheets, and
  character art.

### Clear state and feedback

- Show progress in a form that does not require reading, then pair it with a
  useful accessible name.
- Give every activation a painted response within the same immediate moment.
- Name longer voice states consistently: **Getting ready**, **Your turn**,
  **Thinking**, **Peppa's turn**, **Trying again**, and **Finished** are clearer
  than a generic spinner.
- Announce important state changes programmatically, but do not repeatedly
  announce animation frames, timers, or decorative changes.
- Prevent layout shift when labels, captions, or status messages change.

### Short paths and controlled attention

- Place one dominant child action in each state.
- Keep optional settings and explanations behind a grown-up route.
- Avoid pop-ups, surprise audio, competing movement, and auto-advancing into a
  new activity.
- Let the child pause, repeat, slow down, go back, retry, ask for help, or finish.
- Respect reduced-motion preference. Motion should explain state or cause, not
  demand attention for its own sake.

### Inexpensive mistakes

- A retry never erases safe completed progress.
- A calm error says what happened in literal language and offers one next step.
- Preserve lesson position and appropriate draft state across recoverable
  failures.
- Confirm destructive grown-up actions; do not add confirmation friction to
  harmless child retries.

### Developmental scaffold

Use model → child attempt → calm feedback → repeat, gradually increasing
complexity while retaining replay and help. Executive-function skills develop
through practice and age-appropriate support; the UI must not assume that a
young learner can remember multi-step directions or independently diagnose a
failed microphone.

## Review checklist

- Can a non-reader identify the next action from layout, picture, and a very
  short spoken/visible cue?
- Is the control visibly labelled and at least 44×44 CSS pixels?
- Does activation change the screen within 100 ms even when the underlying work
  takes longer?
- Does focus remain visible and move predictably through dialogs and routes?
- Can the learner pause, replay, retry, go back, and finish?
- Does the screen preserve its layout while state text changes?
- Are errors calm, specific, and recoverable without losing progress?
- Is optional complexity absent from the child's immediate path?

## Evidence and limits

See [A11Y-01 through A11Y-05](./source-register.md), [DEV-01](./source-register.md),
and [WELL-01 through WELL-02](./source-register.md). These sources support
general interaction patterns; they do not prove a particular Parrot screen is
understood by a five-year-old beginner. That needs task-based testing with the
audience, including children with varied access needs.

## Open questions

- Which current icons are mistaken for a different action?
- Do learners understand the difference between **Thinking** and a frozen app?
- How much progress detail helps without becoming another reading task?
- Can a child recover from every simulated permission, network, and speech
  recognition failure with only the information on screen?
