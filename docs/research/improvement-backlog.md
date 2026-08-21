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
| 1 | **Grown-up AI and saved-data explanation.** If About states verified AI/data facts in plain language, caregivers can make and revisit an informed choice without adding child-screen complexity. | 5 | 5 | 5 | 4 | 4 | 23 | Implemented on `codex/grown-up-ai-transparency` at `7a36b94` | Every sentence maps to code/deployment evidence; keyboard/mobile dialog tests pass; caregiver comprehension test planned |
| 2 | **Explicit voice state model and recovery.** If conversation uses stable Getting ready / Your turn / Thinking / character turn / Trying again states with immediate acknowledgement, children can distinguish waiting from failure and recover. | 5 | 4 | 4 | 4 | 3 | 20 | Implemented independently on `codex/voice-state-feedback` at `af311a7` | All state transitions tested; ack p95 target defined; no indefinite spinner; narrow/short screenshots |
| 3 | **Privacy-safe experience event boundary.** If typed allowlisted events capture milestones without content, the team can locate slow or broken experiences without collecting child speech. | 4 | 4 | 5 | 5 | 2 | 20 | Data review after item 1; `codex/privacy-safe-experience-events` | Event payload forbids content/identifiers; no-op never blocks UI; trace proves milestone ordering |
| 4 | **Non-reading first-use demonstrations.** If the three learner paths each show one pictorial/audio demonstration rather than helper prose, more beginners can start independently. | 5 | 4 | 2 | 5 | 3 | 19 | Needs direct current-screen observation; `codex/show-dont-explain` | First-task success without adult translation; replay/skip available; no surprise autoplay |
| 5 | **Skill-first learner modes.** If grown-ups can choose a reversible support profile (pre-reader, emerging reader, older beginner) separate from topic/age, tasks remain linguistically accessible without becoming babyish. | 5 | 3 | 3 | 5 | 1 | 17 | Needs child/caregiver research and content inventory; independent worktree spike first | Skill-specific placement is brief and reversible; no age-as-ability inference; content coverage measured |
| 6 | **Content-language lint and preview.** If authored/generated lessons flag long, abstract, unsupported directions and picture mismatches before publish, child-facing complexity becomes reviewable. | 4 | 3 | 3 | 4 | 2 | 16 | Implemented independently on `codex/child-language-content-checks` at `6f0392d`; hand-off `b51ab2c` | Advisory lint catches seeded problems without blocking valid simple content; human override recorded |
| 7 | **Caregiver/child co-design protocol.** If structured sessions test comprehension, perceived AI identity, recovery, and respectful age adaptation, roadmap confidence stops relying on adult intuition. | 5 | 5 | 5 | 5 | 0 | 20 | External recruitment, consent, safeguarding, ethics, accessibility; research artifact rather than code-first | Approved protocol, diverse sample, observable tasks, no dark-pattern engagement metric |
| 8 | **Low-bandwidth and denied-mic learning path.** If core practice retains a tap/listen path when voice is unavailable, more children can complete the learning goal. | 5 | 3 | 3 | 3 | 2 | 16 | Follow voice state audit; `codex/voice-fallback-practice` | Simulated denial/offline task completes; no shame copy; progress safe |
| 9 | **Bounded conversation safety evaluation.** If scripted ordinary-child and adversarial cases verify topic, disclosure, dependency, and stop boundaries, character chat can be treated as practice rather than assumed safe. | 5 | 4 | 5 | 3 | 1 | 18 | Implemented independently on `codex/bounded-conversation-eval` at `5e7b705` | Versioned cases and pass criteria; failures reproducible; release rollback switch documented |
| 10 | **Session-ending and pause design.** If each activity offers a clear finish and never rolls into the next one, child agency and healthy use improve without reducing learning. | 4 | 4 | 4 | 5 | 3 | 20 | Audit all flows; `codex/calm-finish-controls` | Finish visible/reachable in active states; no progress loss; no autoplay or guilt copy |

## Selected next improvement

Item 1 is implemented and retained. Its final evidence is in
[Grown-up AI and saved-data transparency](./grown-up-ai-transparency.md).

The immediate stacked improvement is **lesson-start state preservation** on
`codex/lesson-start-stability`, based on `codex/grown-up-ai-transparency`.
During personalized-art browser validation, the first tap on **Let's go!**
transitioned to a not-yet-rendered lazy lesson panel. The route-level Suspense
fallback unmounted the entire lesson player, repeated the My Lesson fetch, and
returned the learner to the introduction. This is a directly observed lost
action and content shift, not a speculative enhancement.

Acceptance criteria:

1. the first Start tap reaches the first learner or character turn without a
   second tap;
2. loading a deferred lesson-player panel does not unmount or reset lesson
   state;
3. the existing 280px personalized speaking-turn test passes without retries
   or a test-only wait;
4. lazy transitions do not repeat the My Lesson API request;
5. the full responsive browser suite passes.

The next visual branch after that is `codex/story-controls-short-landscape`.
The 2026-08-21 first-use audit found that at 640×360 the real Back, Listen, and
Next controls require roughly 300px of internal scrolling while a non-interactive
“Tap Listen” panel is visible. That work should keep the child controls fixed in
the short-wide right pane and let only secondary grown-up content scroll.

### Hand-off record

```text
Branch: codex/grown-up-ai-transparency
Base branch / dependency: codex/continuous-research-program
Commit: 7a36b94
Hypothesis: verified, progressive disclosure can answer caregiver AI/data questions without adding child-screen complexity
Changed: account menu/dialog, AI and storage explanation, deletion wording, story-art wording, provider documentation, responsive/keyboard tests, screenshots, research memo
Not changed: privacy policy, legal compliance status, provider configuration
Tests: 610 unit/lifecycle passed; 49 relevant Chromium passed; build passed; lint 0 errors with 2 pre-existing generated-file warnings
Screenshots / traces: artifacts/ux-review/grown-up-ai-transparency at 280×568, 390×844, and 1440×900
Measured result: repository claims reconciled; manual browser pass found and fixed missing visible list bullets
Risks / limitations: caregiver comprehension and provider retention settings are not yet tested directly
Retain, revise, or reject: retain
Next question: Can a caregiver accurately explain the AI/data boundary after one read?
```

## Newly observed defects

These findings came from the 2026-08-21 visual first-use audit and browser
validation. They are recorded before scoring so they are not lost between
branches.

1. **High: lesson Start can be discarded by a deferred UI boundary.** Selected
   now as `codex/lesson-start-stability`.
2. **High: story controls are initially off-screen at 640×360.** Planned as
   `codex/story-controls-short-landscape`.
3. **High: short-landscape lesson speech obscures most of the scene artwork.**
   Audit the `short-wide` speech placement after story controls.
4. **High: all ready-made retry lines call the signed-in learner Mia “Bella.”**
   Separate authored character data from the current learner name, or use
   name-free retry language.
5. **Medium: generic Talk request failures use grown-up API language.** Map
   transport errors to literal child-facing recovery copy.
6. **Low: a visible fourth desktop lesson card can remain blank for roughly
   450ms.** Measure eager-image coverage and placeholder behavior before
   increasing eager loading.

## Parked ideas

- Badges, streaks, leaderboards, infinite content, surprise rewards, and daily
  pressure are intentionally not backlog goals.
- More character animation is not a goal without a comprehension/state purpose
  and reduced-motion behavior.
- A general-purpose child chatbot is outside the current product boundary.
- Automatic ability inference from age, accent, affect, or a single speech score
  is outside the current evidence base.
