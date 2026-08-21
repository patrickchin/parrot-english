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
| 4 | **Non-reading first-use demonstrations.** If the three learner paths each show one pictorial/audio demonstration rather than helper prose, more beginners can start independently. | 5 | 4 | 2 | 5 | 3 | 19 | Picture-first scope implemented independently on `codex/nonreading-first-use` at `a256a4a` | All routes preview real content; labels remain accessible; no surprise autoplay; direct child task success remains untested |
| 5 | **Skill-first learner modes.** If grown-ups can choose a reversible support profile (pre-reader, emerging reader, older beginner) separate from topic/age, tasks remain linguistically accessible without becoming babyish. | 5 | 3 | 3 | 5 | 1 | 17 | Needs child/caregiver research and content inventory; independent worktree spike first | Skill-specific placement is brief and reversible; no age-as-ability inference; content coverage measured |
| 6 | **Content-language lint and preview.** If authored/generated lessons flag long, abstract, unsupported directions and picture mismatches before publish, child-facing complexity becomes reviewable. | 4 | 3 | 3 | 4 | 2 | 16 | Implemented independently on `codex/child-language-content-checks` at `6f0392d`; hand-off `b51ab2c` | Advisory lint catches seeded problems without blocking valid simple content; human override recorded |
| 7 | **Caregiver/child co-design protocol.** If structured sessions test comprehension, perceived AI identity, recovery, and respectful age adaptation, roadmap confidence stops relying on adult intuition. | 5 | 5 | 5 | 5 | 0 | 20 | External recruitment, consent, safeguarding, ethics, accessibility; research artifact rather than code-first | Approved protocol, diverse sample, observable tasks, no dark-pattern engagement metric |
| 8 | **Low-bandwidth and denied-mic learning path.** If core practice retains a tap/listen path when voice is unavailable, more children can complete the learning goal. | 5 | 3 | 3 | 3 | 2 | 16 | Microphone and speech-check fallback implemented independently on `codex/voice-fallback-practice`; full-session low-bandwidth work remains | Simulated denial/unsupported/check failure completes; no shame copy; progress safe |
| 9 | **[Bounded conversation safety evaluation](./bounded-conversation-safety-eval.md).** If scripted ordinary-child and adversarial cases verify topic, disclosure, dependency, and stop boundaries, character chat can be treated as practice rather than assumed safe. | 5 | 4 | 5 | 3 | 1 | 18 | Implemented independently on `codex/bounded-conversation-eval` at `5e7b705` | Versioned cases and pass criteria; failures reproducible; release rollback switch documented |
| 10 | **Session-ending and pause design.** If each activity offers a clear finish and never rolls into the next one, child agency and healthy use improve without reducing learning. | 4 | 4 | 4 | 5 | 3 | 20 | Audit all flows; `codex/calm-finish-controls` | Finish visible/reachable in active states; no progress loss; no autoplay or guilt copy |

## Selected next improvement

Item 1 is implemented and retained. Its final evidence is in
[Grown-up AI and saved-data transparency](./grown-up-ai-transparency.md).

The stacked **lesson-start state preservation** improvement is implemented on
`codex/lesson-start-stability` at `783da0f`, based on
`codex/grown-up-ai-transparency`. During personalized-art browser validation,
the first tap on **Start lesson** transitioned to a not-yet-rendered lazy lesson
panel. The route-level Suspense fallback unmounted the entire lesson player,
repeated the My Lesson fetch, and returned the learner to the introduction.
The final branch moves the small core lesson-player frame into the main bundle,
adds about 3.04 kB gzip to that bundle, and protects the transition with a
single-click/no-refetch browser contract.

Acceptance criteria:

1. the first Start tap reaches the first learner or character turn without a
   second tap;
2. loading a deferred lesson-player panel does not unmount or reset lesson
   state;
3. the existing 280px personalized speaking-turn test passes without retries
   or a test-only wait;
4. lazy transitions do not repeat the My Lesson API request;
5. the full responsive browser suite passes.

All five acceptance criteria passed. Final validation was 610 unit/lifecycle
tests, 109 Chromium tests, a production build, and lint with zero errors.

The stacked visual branch `codex/story-controls-short-landscape` is implemented
at `445dad4`. The 2026-08-21 first-use audit found that at 640×360 the real Back,
Listen, and Next controls started entirely below the reader while a
non-interactive **Tap Listen** cue was visible. The final two-pane layout keeps
the picture and controls fixed and lets only the right content pane scroll.
Complete control containment now passes at 640×360 and 1280×360 without a test
helper scrolling first.

The stacked visual branch `codex/lesson-speech-short-landscape` is
implemented for ready-made boxed lessons. The same audit found that the active
lesson speech panel covered 53–59% of the scene artwork at 360 px height. Its
two-pane layout preserves the complete spoken line, speaker identity, progress,
controls, and picture context.

The follow-up `codex/layered-lesson-short-landscape` is also implemented. It
uses a two-pane layout through 420 px, extends it through 480 px where `md`
controls otherwise collide, and gives the familiar vertical layout a compact
starting band that converges continuously with its roomy default geometry. The
complete supported one/two-character set stays separate from learning UI, and
the misleading generic speech tail is omitted only in the two-pane state.
Exceptional generated copy is measured from real overflow and remains
keyboard/touch reachable, but is still a content-quality failure case rather
than a normal authoring target.

The independent data-integrity branch `codex/learner-name-safe-copy` is
implemented at `e4f6176`, based on the completed boxed-lesson layout. All 18
ready-made retry responses and seven final lines now use short universal copy,
so the signed-in learner Mia is no longer called Bella in text or audio. The
branch also removes the obsolete named assets and adds catalog, manifest, audio,
and rendered-state regression coverage.

The independent performance follow-up `codex/responsive-shelf-art` is
implemented at `1cc6b27`, based on `4c54b7f`. It keeps the same child-facing
art and loading policy while adding crop-preserving 384/768 candidates and
layout-specific browser selection. On the documented constrained profile, the
first lesson cover completed in a median 661 ms and the first story cover in
625 ms, down from about 3.25 s. Every 768 px candidate is below 50 kB.

The independent picture-first branch `codex/nonreading-first-use` is
implemented at `a256a4a`. Its direct audit found that every destination was
already picture-led while the home asked for up to 30 words of English and
clipped choices at small portrait and short-landscape sizes. The final home
reuses real route art, keeps one visible accessible label per full-card link,
plays no automatic sound, and fits all three choices without scrolling at every
reviewed 280–390 px portrait and 560–1280×360 viewport.

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

```text
Branch: codex/lesson-start-stability
Base branch / dependency: codex/grown-up-ai-transparency
Commit: 783da0f
Hypothesis: keeping the small core lesson frame eager prevents a cold deferred panel from discarding a child's first Start action
Changed: lesson-player import boundary, single-click/request-count regression, accessible chat-style disclosure found during validation, semantic browser state assertions, screenshot, research memo
Not changed: creator/editor/story/conversation chunk splitting, lesson state model, field performance instrumentation
Tests: 610 unit/lifecycle passed; 109 Chromium passed in 35.9 seconds with four workers; build passed; lint 0 errors with 2 pre-existing generated-file warnings
Screenshots / traces: artifacts/ux-review/lesson-start-stability/first-tap-active-280x568.jpg
Measured result: first tap reaches the learner turn, My Lesson request count stays unchanged, core bundle +3.04 kB gzip
Risks / limitations: field Start-to-turn latency and low-end device impact are not yet measured
Retain, revise, or reject: retain
Next question: Can the story reader keep its primary controls visible at 640×360 without covering story meaning?
```

```text
Branch: codex/story-controls-short-landscape
Base branch / dependency: codex/lesson-start-stability
Commit: 445dad4
Hypothesis: a fixed picture/control layer with an independently scrolling content pane keeps the real child actions discoverable on short landscape screens
Changed: short-wide story grid, right-pane scroll ownership, opaque control surface, single-column grown-up form, disclosure name, no-scroll geometry tests, screenshots, research memo
Not changed: story scripts, typography scale, phone fixed controls, normal-height desktop layout
Tests: 610 unit/lifecycle passed; 111 Chromium passed in 35.0 seconds with four workers; focused story/art 17 passed; build passed; lint 0 errors with 2 pre-existing generated-file warnings
Screenshots / traces: artifacts/ux-review/story-controls-short-landscape includes before, first use, listening, grown-up scroll, long-title, and phone views
Measured result: controls moved from y 352.5–415.5 outside the reader to y 249–312 inside it; reader outer scroll remains 0; art remains fixed
Risks / limitations: inner-scroll discoverability, real safe-area geometry, and child task success remain untested
Retain, revise, or reject: retain
Next question: Can short-landscape lesson speech preserve both legible words and enough picture context?
```

```text
Branch: codex/lesson-speech-short-landscape
Base branch / dependency: codex/story-controls-short-landscape
Commit: 257b41c
Hypothesis: stable picture and learning panes let a beginner see what a spoken line means without removing its words, state, progress, or controls
Changed: boxed-stage presentation hook, two-pane short-wide geometry, compact portrait prompt, true non-overlap browser assertions, longest-line and saved-portrait cases, screenshots, research memo
Not changed: layered generated-lesson geometry, lesson scripts, audio timing, normal-height presentation
Tests: 23 focused lesson-player Chromium cases passed; 610 unit/lifecycle passed; 118 Chromium passed in 36.9 seconds with four workers; build passed; lint 0 errors with 2 pre-existing generated-file warnings
Screenshots / traces: artifacts/ux-review/lesson-speech-short-landscape at 560×360, 640×360, 768×360, 1280×360, and 768×600
Measured result: 640×360 artwork coverage changed from 53.2% to 0%; art is 321.6×180.9 px with an 18 px gutter and stable right-pane controls
Risks / limitations: layered lessons still overlap at 640×360; safe-area and direct child comprehension remain untested
Retain, revise, or reject: retain for boxed lessons
Next question: Can layered characters and speech form the same stable relationship without a misleading speech tail?
```

```text
Branch: codex/layered-lesson-short-landscape
Base branch / dependency: codex/lesson-speech-short-landscape
Commit: 010dc4f
Hypothesis: separating the supported layered characters from the learning pane preserves picture meaning and child actions on genuinely shallow landscape screens
Changed: one/two-character shallow geometry, continuous compact-to-roomy vertical character geometry, layered presentation regression hooks, tail removal in two-pane state, measured-overflow keyboard/touch fallback for speech/prompt/feedback, overlap tests, screenshots, research memo
Not changed: generated lesson content limits, audio timing, normal-height layout, character catalog
Tests: 29 boundary/generated-long-copy Chromium cases passed; 610 unit/lifecycle and 147 full Chromium passed; build passed; lint 0 errors with 2 pre-existing generated-file warnings
Screenshots / traces: artifacts/ux-review/layered-lesson-short-landscape at 560×360, 640×360, 768×360, 844×421, and 768×600
Measured result: zero character/HUD/dialogue/control overlap across the 360–807px sampled boundaries; reviewed 13-word line fits without scrolling in the shallow pane; 44×44 control floor preserved
Risks / limitations: direct child speaker matching, inner-scroll discovery, localization, text zoom, and real safe-area geometry remain untested
Retain, revise, or reject: retain
Next question: Do children correctly match the tail-free speaker label with the active character?
```

```text
Branch: codex/learner-name-safe-copy
Base branch / dependency: codex/lesson-speech-short-landscape
Commit: e4f6176
Hypothesis: universal exact-text feedback is safer than a fixed authored name when ready-made lesson audio cannot pronounce the current learner's name
Changed: 18 retry responses, seven final lines, exact-text audio manifest, one trimmed ElevenLabs retry asset, stale named-asset removal, catalog/audio/browser regressions, screenshot, research memo
Not changed: My Lesson personalization, account/profile data flow, lesson schema, legacy ready-made childName metadata
Tests: 611 unit/lifecycle passed; 119 Chromium passed in 37.7 seconds with four workers; build passed; lint 0 errors with 2 pre-existing generated-file warnings
Screenshots / traces: artifacts/ux-review/learner-name-safe-copy/retry-feedback-390x844.jpg
Measured result: 25 reachable wrong-name lines reduced to zero; account Mia and name-free retry render together; about 468 KB of stale named audio removed
Risks / limitations: direct child comprehension of the generic final cue and auditory review across target devices remain untested
Retain, revise, or reject: retain
Next question: Can generic Talk request failures use one short child-facing recovery action instead of API language?
```

```text
Branch: codex/responsive-shelf-art
Base branch / dependency: codex/lesson-speech-short-landscape at 4c54b7f
Commit: 1cc6b27
Hypothesis: verified in the constrained lab; responsive candidates make picture-led choices useful sooner without changing the crop
Changed: 384/768 shelf assets, srcset/sizes, generator, production benchmark, asset/UI/browser tests, screenshots, research memo
Not changed: source artwork, card layout, loading priority, story page art, full-scene lesson art, personalized private art
Tests: 612 unit/lifecycle passed; 118 Chromium passed in 29.7 seconds; 26 focused Chromium passed in 7.9 seconds; production build passed; lint 0 errors with 2 generated-file warnings; production benchmark passed
Screenshots / traces: artifacts/ux-review/responsive-shelf-art before/after at 390×844
Measured result: lesson first cover median 661 ms; story first cover median 625 ms; largest 768 px candidate 46.96 kB
Risks / limitations: local lab only; no child fidelity study; older browsers retain the larger source fallback
Retain, revise, or reject: retain
Next question: Do deployed low-end phones meet the same first-picture budget without increasing eager image contention?
```

```text
Branch: codex/child-friendly-talk-errors
Base branch / dependency: 4c54b7f (codex/lesson-speech-short-landscape)
Commit: 1613ba1
Hypothesis: phase-specific literal recovery copy helps a young beginner act without exposing request, database, configuration, or voice-transport language
Changed: conversation-hook error boundary, start/disconnect/finish/repeat copy, accessible failure tests, narrow and short-landscape screenshots, research memo
Not changed: server response payloads, ConversationApiError diagnostics, authentication errors, microphone-permission copy, non-voice fallback
Tests: 611 unit/lifecycle passed; 120 Chromium passed in 38.1 seconds with four workers; build passed; lint 0 errors with 2 pre-existing generated-file warnings
Screenshots / traces: artifacts/ux-review/child-friendly-talk-errors at 280×568 and 640×360
Measured result: reviewed error state has no outer overflow; alert and 48 px control row remain visible at both sizes
Risks / limitations: English copy is not child-tested; persistent failures still need a bounded non-voice path; two recovery actions remain after a room was created
Retain, revise, or reject: retain pending direct child/caregiver recovery testing
Next question: Does a beginner identify Try again without adult explanation, and when should repeated failure switch to grown-up help or non-voice practice?
```

```text
Branch: codex/nonreading-first-use
Base branch / dependency: codex/lesson-speech-short-landscape at 4c54b7f; independent of later layered-lesson work
Commit: a256a4a
Hypothesis: real destination previews plus one short label reduce first-use reading and make all three learner paths immediately findable without surprise audio
Changed: home heading, route-card previews, compact short-wide arrangement, accessible image/link regression tests, primary-source register, screenshots, research memo
Not changed: destination screens, route behavior, audio behavior, learner mode, translation, image files
Tests: 10 focused home Chromium passed; 610 unit/lifecycle passed; 122 Chromium passed in 36.9 seconds with four workers; build passed; lint 0 errors with 2 pre-existing generated-file warnings
Screenshots / traces: artifacts/ux-review/nonreading-first-use at 280×568, 320×480, 390×844, 560×360, 640×360, 1280×360, and 1280×900, with before views at 280×568 and 640×360
Measured result: choice text fell from 30 to 11 words; 280×568 home scroll height fell 603→568 px; 640×360 fell 535→360 px; all three choices now fit initially at every tested size
Risks / limitations: no child comprehension study; three existing images add 156,838 bytes to a cold home; lesson/story distinction and localization still need observation
Retain, revise, or reject: retain provisionally, pending direct child task testing and cold-load measurement
Next question: Can a young beginner choose lesson, chat, or story from the pictures without adult translation, and recover calmly from a wrong choice?
```

## Newly observed defects

These findings came from the 2026-08-21 visual first-use audit and browser
validation. They are recorded before scoring so they are not lost between
branches.

1. **High: lesson Start can be discarded by a deferred UI boundary.** Fixed on
   `codex/lesson-start-stability` at `783da0f`.
2. **High: story controls are initially off-screen at 640×360.** Fixed on
   `codex/story-controls-short-landscape` at `445dad4`.
3. **High: short-landscape lesson speech obscures most of the scene artwork.**
   Fixed for ready-made boxed lessons on
   `codex/lesson-speech-short-landscape` and for generated layered lessons on
   `codex/layered-lesson-short-landscape`.
4. **High: all ready-made retry lines call the signed-in learner Mia “Bella.”**
   Fixed with name-free retry and final language on
   `codex/learner-name-safe-copy` at `e4f6176`.
5. **Medium: generic Talk request failures use grown-up API language.** Fixed
   on `codex/child-friendly-talk-errors` at `1613ba1`.
6. **Low: a visible fourth desktop lesson card can remain blank for roughly
   450ms.** Mitigated on `codex/responsive-shelf-art` with smaller responsive
   candidates; loading priority remains unchanged pending field evidence.

## Parked ideas

- Badges, streaks, leaderboards, infinite content, surprise rewards, and daily
  pressure are intentionally not backlog goals.
- More character animation is not a goal without a comprehension/state purpose
  and reduced-motion behavior.
- A general-purpose child chatbot is outside the current product boundary.
- Automatic ability inference from age, accent, affect, or a single speech score
  is outside the current evidence base.
