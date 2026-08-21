# Continuous Improvement Program

Status: active  
Started: 2026-08-21  
Product: Parrot English  
Primary audience: young children beginning English, including children whose
home language is not English

## Objective

Continuously research, design, implement, validate, and document small product
improvements. Each change should leave behind enough evidence that a future
maintainer can understand what changed, why it changed, what was actually
verified, and what remains uncertain.

"More" is not the objective. A successful improvement may remove a choice,
shorten a sentence, prevent an interruption, avoid data collection, or make a
wait feel understandable.

## Branch and worktree model

The initial stack is:

```text
main (2e89ea8)
└── codex/child-first-ux-foundation (061e5ac)
    └── codex/continuous-research-program
        └── one bounded improvement branch at a time
```

Use a stacked branch when an improvement genuinely needs the preceding product
or research work. Use a separate worktree from the nearest stable ancestor for
an independent experiment, risky spike, or work that can be reviewed in
parallel. Never create artificial stacks merely to make activity look
sequential.

Branch names use `codex/<outcome>`, for example:

- `codex/grown-up-ai-transparency`
- `codex/voice-state-feedback`
- `codex/learner-language-levels`

Each branch should have one primary hypothesis and a reviewable commit. If an
experiment fails, keep its memo and result; do not merge its implementation.

## Improvement loop

1. **Observe:** reproduce a problem in the product and record the route,
   viewport, state, device assumptions, elapsed time, and evidence artifact.
2. **Research:** check primary sources and existing product constraints. Mark
   evidence that is supplemental, adult-only, adjacent-age, small-sample, or
   otherwise limited.
3. **Frame:** write one falsifiable hypothesis, the audience, non-goals, safety
   constraints, success measures, and rollback signal.
4. **Branch:** branch from the lowest dependency that can support the change.
5. **Prototype:** make the smallest coherent change. Prefer familiar controls,
   concrete language, one dominant action, and reversible state.
6. **Verify:** run focused unit/integration tests, responsive browser tests,
   keyboard/screen-reader checks where relevant, a production build, and a
   visual review with screenshots. Measure real elapsed states for timing work.
7. **Record:** update the memo, source register, decision, branch/commit, tests,
   screenshots, known limits, and next question.
8. **Review:** decide to retain, revise, or reject based on child benefit and
   risk. Do not use time-on-app as a proxy for learning or well-being.

## Default validation matrix

| Risk area | Minimum evidence before hand-off |
| --- | --- |
| Child-facing copy | Read aloud; verify literal words, one idea at a time, no unexplained jargon; test accessible name |
| Responsive UI | Playwright at 280, 320, 390, and desktop widths; include a short landscape viewport when relevant |
| Interaction | Keyboard path, visible focus, 44×44 CSS px target baseline, calm retry, no lost progress |
| Motion/audio | No surprise autoplay; pause/repeat path; reduced-motion behavior; no system TTS for saved Chinese audio |
| Voice | Permission, connecting, listening, thinking, speaking, reconnecting, failure, and exit states |
| Performance | Production build plus field-oriented timing definitions; report p50/p75/p95 rather than one local run |
| Data/safety | Data inventory, purpose, retention, deletion, child/adult boundary, and least-data alternative |
| Content | Proficiency target, picture/meaning alignment, model → join → independent practice, and human review |

## Product guardrails

- Well-being, comprehension, agency, and mastery come before engagement.
- No streak pressure, infinite feeds, manipulative scarcity, advertising, or
  autoplay into another activity.
- One clear child action should dominate each state. Optional configuration and
  technical detail belong in grown-up surfaces.
- Pictures communicate the same meaning as the language; they are not rewards
  pasted beside unrelated text.
- Every tap produces immediate visible feedback. Longer work has named,
  stable states and an honest recovery path.
- Learners can pause, repeat, go back, retry, and finish without shame or loss
  of safe progress.
- AI is a bounded practice tool, not a friend, authority, caregiver, or source
  of emotional dependence. Adult-facing surfaces explain limitations and data
  use in plain language.
- Default to minimal data. Product telemetry must avoid raw audio, transcript
  content, persistent device IDs, and fine-grained network/location data.
- Claims about learning, accessibility, privacy, or legal compliance require
  evidence appropriate to the claim.

## Hand-off record

For each improvement, record this block in its research memo:

```text
Branch:
Base branch / dependency:
Commit:
Hypothesis:
Changed:
Not changed:
Tests:
Screenshots / traces:
Measured result:
Risks / limitations:
Retain, revise, or reject:
Next question:
```

## Review cadence

At the start of each improvement, re-rank the top five backlog items against new
evidence and product state. After implementation, update the source register
and backlog immediately. Revisit standards and regulator sources at least every
six months or before a material change to child data, voice, personalization,
or AI behavior.
