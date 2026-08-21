# Evidence-Ranked Improvement Backlog

Last ranked: 2026-08-21

This is a decision queue, not a promise that every feature will be built. Scores
are relative and should change when observation, implementation, or direct
child/caregiver research changes the evidence.

## Scoring

Each item receives 1–5 for:

- **Benefit:** likely improvement to comprehension, agency, learning, safety,
  or calm recovery for the primary audience;
- **Evidence:** strength and directness of evidence plus confidence that the
  current product has the problem;
- **Risk reduction:** privacy, safety, accessibility, or operational risk
  reduced;
- **Reach:** how much of the core journey it affects;
- **Effort:** estimated implementation/validation cost, where 5 is smallest.

Priority is the sum, but dependencies and irreversible risk can override it.

## Ranked queue

| Rank | Candidate / hypothesis | Benefit | Evidence | Risk reduction | Reach | Effort | Total | Dependency / branch | Success signal |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | **Grown-up AI and saved-data explanation.** If About states verified AI/data facts in plain language, caregivers can make and revisit an informed choice without adding child-screen complexity. | 5 | 5 | 5 | 4 | 4 | 23 | Research program → `codex/grown-up-ai-transparency` | Every sentence maps to code/deployment evidence; keyboard/mobile dialog tests pass; caregiver comprehension test planned |
| 2 | **Explicit voice state model and recovery.** If conversation uses stable Getting ready / Your turn / Thinking / character turn / Trying again states with immediate acknowledgement, children can distinguish waiting from failure and recover. | 5 | 4 | 4 | 4 | 3 | 20 | Requires voice-flow audit; `codex/voice-state-feedback` | All state transitions tested; ack p95 target defined; no indefinite spinner; narrow/short screenshots |
| 3 | **Privacy-safe experience event boundary.** If typed allowlisted events capture milestones without content, the team can locate slow or broken experiences without collecting child speech. | 4 | 4 | 5 | 5 | 2 | 20 | Data review after item 1; `codex/privacy-safe-experience-events` | Event payload forbids content/identifiers; no-op never blocks UI; trace proves milestone ordering |
| 4 | **Non-reading first-use demonstrations.** If the three learner paths each show one pictorial/audio demonstration rather than helper prose, more beginners can start independently. | 5 | 4 | 2 | 5 | 3 | 19 | Needs direct current-screen observation; `codex/show-dont-explain` | First-task success without adult translation; replay/skip available; no surprise autoplay |
| 5 | **Skill-first learner modes.** If grown-ups can choose a reversible support profile (pre-reader, emerging reader, older beginner) separate from topic/age, tasks remain linguistically accessible without becoming babyish. | 5 | 3 | 3 | 5 | 1 | 17 | Needs child/caregiver research and content inventory; independent worktree spike first | Skill-specific placement is brief and reversible; no age-as-ability inference; content coverage measured |
| 6 | **Content-language lint and preview.** If authored/generated lessons flag long, abstract, unsupported directions and picture mismatches before publish, child-facing complexity becomes reviewable. | 4 | 3 | 3 | 4 | 2 | 16 | Depends on content schema and false-positive study; `codex/child-language-content-checks` | Advisory lint catches seeded problems without blocking valid simple content; human override recorded |
| 7 | **Caregiver/child co-design protocol.** If structured sessions test comprehension, perceived AI identity, recovery, and respectful age adaptation, roadmap confidence stops relying on adult intuition. | 5 | 5 | 5 | 5 | 0 | 20 | External recruitment, consent, safeguarding, ethics, accessibility; research artifact rather than code-first | Approved protocol, diverse sample, observable tasks, no dark-pattern engagement metric |
| 8 | **Low-bandwidth and denied-mic learning path.** If core practice retains a tap/listen path when voice is unavailable, more children can complete the learning goal. | 5 | 3 | 3 | 3 | 2 | 16 | Follow voice state audit; `codex/voice-fallback-practice` | Simulated denial/offline task completes; no shame copy; progress safe |
| 9 | **[Bounded conversation safety evaluation](./bounded-conversation-safety-eval.md).** If scripted ordinary-child and adversarial cases verify topic, disclosure, dependency, and stop boundaries, character chat can be treated as practice rather than assumed safe. | 5 | 4 | 5 | 3 | 1 | 18 | Prompt/provider inventory; test data and evaluation design; `codex/bounded-conversation-eval` | Versioned cases and pass criteria; failures reproducible; release rollback switch documented |
| 10 | **Session-ending and pause design.** If each activity offers a clear finish and never rolls into the next one, child agency and healthy use improve without reducing learning. | 4 | 4 | 4 | 5 | 3 | 20 | Audit all flows; `codex/calm-finish-controls` | Finish visible/reachable in active states; no progress loss; no autoplay or guilt copy |

## Selected next improvement

Item 1 is selected because it has strong current child-AI and privacy support,
uses an existing grown-up-only surface, reduces risk across all AI features, and
can be verified against the repository before making any policy-level claim.

Before implementation:

1. inventory actual AI/data flows in code and deployment docs;
2. label unknowns rather than filling them with reassuring copy;
3. keep child-facing navigation unchanged;
4. write mobile, keyboard, and accessible-dialog tests;
5. capture before/after screenshots at narrow and desktop sizes;
6. update the hand-off record below.

### Hand-off record

```text
Branch: pending
Base branch / dependency: codex/continuous-research-program
Commit: pending
Hypothesis: pending implementation wording
Changed: pending
Not changed: privacy policy, legal compliance status, provider configuration
Tests: pending
Screenshots / traces: pending
Measured result: pending
Risks / limitations: caregiver comprehension not yet tested directly
Retain, revise, or reject: pending
Next question: Can a caregiver accurately explain the AI/data boundary after one read?
```

## Parked ideas

- Badges, streaks, leaderboards, infinite content, surprise rewards, and daily
  pressure are intentionally not backlog goals.
- More character animation is not a goal without a comprehension/state purpose
  and reduced-motion behavior.
- A general-purpose child chatbot is outside the current product boundary.
- Automatic ability inference from age, accent, affect, or a single speech score
  is outside the current evidence base.
