# Evidence-Ranked Improvement Backlog

Last ranked: 2026-08-22

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
| 3 | **Privacy-safe experience event boundary.** If typed allowlisted events capture milestones without content, the team can locate slow or broken experiences without collecting child speech. | 4 | 4 | 5 | 5 | 2 | 20 | Implemented on `codex/privacy-safe-experience-events` at `526d6d1` | Exact-key payload forbids content/identifiers; no-sink path performs no timing or scheduling work; browser contract proves milestone order |
| 4 | **Non-reading first-use demonstrations.** If the three learner paths each show one pictorial/audio demonstration rather than helper prose, more beginners can start independently. | 5 | 4 | 2 | 5 | 3 | 19 | Picture-first scope implemented independently on `codex/nonreading-first-use` at `a256a4a` | All routes preview real content; labels remain accessible; no surprise autoplay; direct child task success remains untested |
| 5 | **Skill-first learner modes.** If grown-ups can choose a reversible support profile (pre-reader, emerging reader, older beginner) separate from topic/age, tasks remain linguistically accessible without becoming babyish. | 5 | 3 | 3 | 5 | 1 | 17 | Needs child/caregiver research and content inventory; independent worktree spike first | Skill-specific placement is brief and reversible; no age-as-ability inference; content coverage measured |
| 6 | **Content-language lint and preview.** If authored/generated lessons flag long, abstract, unsupported directions and picture mismatches before publish, child-facing complexity becomes reviewable. | 4 | 3 | 3 | 4 | 2 | 16 | Implemented independently on `codex/child-language-content-checks` at `6f0392d`; hand-off `b51ab2c` | Advisory lint catches seeded problems without blocking valid simple content; human override recorded |
| 7 | **Caregiver/child co-design protocol.** If structured sessions test comprehension, perceived AI identity, recovery, and respectful age adaptation, roadmap confidence stops relying on adult intuition. | 5 | 5 | 5 | 5 | 0 | 20 | External recruitment, consent, safeguarding, ethics, accessibility; research artifact rather than code-first | Approved protocol, diverse sample, observable tasks, no dark-pattern engagement metric |
| 8 | **Low-bandwidth and denied-mic learning path.** If core practice retains a tap/listen path when voice is unavailable, more children can complete the learning goal. | 5 | 3 | 3 | 3 | 2 | 16 | Microphone and speech-check fallback implemented independently on `codex/voice-fallback-practice` at `2a7fd71`; full-session low-bandwidth work remains | Simulated denial/unsupported/check failure completes; no shame copy; progress safe |
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

The independent `codex/voice-fallback-practice` branch is implemented at
`2a7fd71`. When a microphone is denied/unsupported or a speech check fails, the
shared ready-made/generated lesson player now offers calm, unscored out-loud
practice through **Done**, keeps **Try mic** secondary, and never invents an
assessment result. Whole-session low-bandwidth audio remains a separate study.

The integration branch `codex/child-first-ux-integration` is implemented at
`4ef7886`, based on the completed stacked visual hand-off `dc65b5c`. It retains
the ten independently developed improvements above, resolves their shared
voice-error contract, gives generated no-microphone help a non-overlapping
place in layered lessons, and reuses responsive cover candidates on the new
picture-led home. Final validation passed 622 unit/lifecycle tests, 159
Chromium tests, the production build and responsive-art benchmark, and lint
with zero errors. Independent re-review found no actionable regression across
the combined fallback layouts.

The stacked recovery branch `codex/my-lessons-recovery-copy` is implemented at
`f5b28b2`, based on the integration documentation hand-off `aa943b6`. It turns
malformed, technical, and failed My Lessons responses into one calm grown-up
recovery state while preserving the child-ready shelf. The implementation also
validates complete playable descriptors, rejects unsafe route IDs, sanitizes
parser causes, holds keyboard focus through retry and success, and fixes the
390 px panel squeeze found during visual review.

The stacked Talk recovery branches now make a slow or failed remote voice task
finite. `codex/talk-wait-recovery-message` at `5366776` adds staged literal
feedback and one first retry. `codex/repeated-talk-recovery` at `d48c38f`
switches only a second consecutive Talk failure to one static, picture-led
**Play a lesson** route while preserving reusable recovery for onboarding and
profile editing. The exact threshold, picture, and English remain child-study
hypotheses.

The stacked **one child-facing Talk state at a time** improvement is implemented
on `codex/talk-state-clarity` at `17c1711`. Remote waits now use one visible
phase owner, one meaningful caption, an inert reserved primary-control slot,
and one status spinner. Peppa is static during timed remote work, empty slots no
longer expose named groups, and sparse wait milestones remain in the single
polite live status. State/timer behavior and direct microphone/autoplay actions
are unchanged.

The stacked **single-owner direct Talk action feedback** improvement is
implemented on `codex/talk-direct-action-feedback` at `8e69386`. The focused
control now owns the only visible pending label and spinner while one static
visible status retains turn context and exposes the pending detail through its
existing polite live region. The same `aria-disabled` button remains mounted;
view and domain guards prevent repeated activation; sound recovery stays in the
native click call stack; and deliberate success/failure hand-offs prevent focus
from falling to the document body. Deterministic tests cover delayed sound and
microphone work, timing, motion, geometry, repeated input, stale completion,
and all target viewports. Screen-reader announcement order, real autoplay and
permission behavior, after-state visual review, and child/caregiver
comprehension remain explicit validation gates.

The parallel first-use language, timing, and visual audits are complete on
`codex/first-use-ux-audit`. Their selected child-paced acknowledgment change is
implemented on `codex/profile-acknowledgment-control` at `4dd2ad3`. The stacked
viewport-stability change is implemented on
`codex/profile-fallback-viewport-stability` at `1152866`: profile art reserves
its geometry, short screens use deliberate compositions, and each same-route
step restores its visible/focused origin. The selected enabled-action contrast
change is implemented on `codex/contrast-safe-child-actions` at `c5fa0f6`:
bright pink remains the primary cue while deep-navy content raises the rendered
pair above 4.5:1 in every tested enabled state. This sequence fixed
deterministic content loss before layout, then removed movement and hidden
actions before changing the shared visual treatment. Its visual review found a
separate 1.278:1 focus-ring failure on the navy account menu. The bounded repair
is implemented on `codex/shared-focus-visibility` at `d5e1bdc`. The stacked
route-specific Story Reader page-arrival cue is implemented on
`codex/story-reader-page-focus-visibility` at `8c300aa`: static prose now uses
an open, separated reading marker rather than a pale closed ring, without
changing any current story's geometry. The generated-feedback language
contract follows this visual repair.

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

```text
Branch: codex/voice-fallback-practice
Base commit / dependency: 4c54b7f (codex/lesson-speech-short-landscape hand-off)
Commit: 2a7fd71
Hypothesis: a calm unscored Done path preserves speaking practice when recording or checking is unavailable
Changed: shared lesson failure copy/state, primary Done and secondary Try mic recovery, polite status semantics, deterministic microphone simulations, ready-made/generated/error browser contracts, reducer progress assertion, screenshots, research memo
Not changed: speech scoring, microphone permissions, live conversation, offline recognition, whole-session low-bandwidth audio
Tests: 18 focused state tests; 25 focused lesson-player Chromium tests; 610 unit/lifecycle tests; 120 Chromium tests in 36.5 seconds; build passed; lint 0 errors with 2 pre-existing generated-file warnings
Screenshots / traces: artifacts/ux-review/voice-fallback-practice at 280×568 and 640×360, including a denied-access baseline
Measured result: every simulated failure can advance without transcript, outcome, attempt increment, or feedback; 640×360 art, prompt, help, and controls have non-overlapping rectangles and no overflow
Risks / limitations: child comprehension is untested; rare unchecked-recorder stop ordering and whole-session offline audio remain
Retain, revise, or reject: retain pending direct child/caregiver comprehension observation
Next question: When the microphone is denied, can a non-reading beginner identify Done without adult translation?
```

```text
Branch: codex/my-lessons-recovery-copy
Base branch / dependency: codex/child-first-ux-integration documentation hand-off aa943b6
Commit: f5b28b2
Hypothesis: one named failure sentence and one literal retry action let a grown-up recover without exposing implementation detail or implying saved lessons were deleted
Changed: strict list-response validation, shared route-ID safety, sanitized internal causes, explicit loading/error/retrying states, stable live region and focus behavior, 390 px responsive composition, E2E mock, screenshots, research memo
Not changed: lesson-detail/update response validation, telemetry provider, server contracts, saved data, direct child or caregiver copy research
Tests: 626 unit/lifecycle/safety tests passed; 163 Chromium tests passed in 44.1 seconds with four workers; build passed; lint 0 errors with 2 pre-existing generated-file warnings
Screenshots / traces: artifacts/ux-review/my-lessons-recovery at 280x568, 390x844, and 640x360, plus pending retry at 390x844
Measured result: the 390 px status column grew from 105 px to at least 200 px, its three-line 60 px heading stayed within 32 px, and click-to-loading status remained below 100 ms at every responsive target
Risks / limitations: direct screen-reader checks, 200% zoom, increased text spacing, and caregiver comprehension remain untested; other My Lessons endpoints retain their existing validation boundary
Retain, revise, or reject: retain
Next question: Can privacy-safe milestone timing reveal slow or broken child journeys without collecting speech, lesson text, names, or stable identifiers?
```

```text
Branch: codex/privacy-safe-experience-events
Base branch / dependency: codex/my-lessons-recovery-copy documentation hand-off 85558fa
Commit: 526d6d1
Hypothesis: a closed identifier-free milestone boundary can make waiting and failure measurable without collecting child content or introducing production retention
Changed: strict event schema, constant no-op boundary, conversation/lesson timing integration, stale-operation and sink-generation isolation, lifecycle/browser contracts, two reviewed screenshots, privacy/timing research records
Not changed: production collection, analytics/error vendor, event endpoint/store, account/conversation/lesson persistence, consent/legal status, child-facing UI, painted-control or audible-output measurement
Tests: 638 unit/lifecycle/safety tests passed; 166 Chromium tests passed in 36.3 seconds; build passed; lint 0 errors with 2 pre-existing generated-file warnings
Screenshots / traces: artifacts/ux-review/privacy-safe-experience-events/talk-ready-desktop.jpg and talk-learner-turn-desktop.jpg; the page-local event trace is asserted in browser tests and intentionally not retained
Measured result: exact identifier-free events preserve milestone order; a missing sink performs no timing or scheduling work; stale operations, replaced sinks, queued removal, and sink failures are isolated; core index is 484.96 kB raw / 147.02 kB gzip (+6.27 kB raw / +1.94 kB gzip from the base and below the 180 kB gzip boot guardrail)
Risks / limitations: logical learner readiness is not verified paint; assistant signal is not audible output; microphone permission decision remains inside lesson timing; no field sink, field baseline, or direct child/caregiver study exists
Retain, revise, or reject: retain the inert boundary; do not enable a production sink without the documented field-sink gate
Next question: Can the mounted remote media element expose first-audible feedback without changing autoplay, replay, accessibility, or privacy behavior?
```

```text
Branch: codex/first-audible-feedback
Base branch / dependency: codex/privacy-safe-experience-events at 8291916
Commit: 5178822
Hypothesis: honest session-level playback readiness plus one direct autoplay-recovery action can keep a child from entering a silent turn without falsely claiming per-turn audibility or hearing
Changed: first mounted-element playing and LiveKit playback-status/startAudio transport signals; initial-true guard; Tap for sound recovery with a static blocked icon and "Starting sound."; interruption-gated one-repeat behavior; exact-key one-shot startup event; lifecycle/transport/UI/local-Chromium contracts; research record
Not changed: LiveKit dependency, production event sink or retention, physical-output or child-hearing measurement, output routing, legal status, or direct child/caregiver research
Signal semantics: first element playing, known false→true, or fulfilled gesture-bound startAudio means session readiness; initial true is ignored; blocked closes the one-shot event; delayed playing without an observed block/stop opens the learner turn without replay
Tests: 653/653 unit/lifecycle/safety tests passed in 90 suites (~2.45 seconds); 172/172 Chromium tests passed in 13 files (~30 seconds); lint passed with 0 errors and the same 2 generated-file warnings
Final build: passed; core index-67RCCEkF.js is 491.37 kB raw / 148.36 kB gzip; ConversationSurface-BWl6fnDQ.js is 15.68 kB raw / 5.24 kB gzip
Screenshots / traces: five JPGs — artifacts/ux-review/remote-audio-playback/blocked-280x568.jpg; artifacts/ux-review/remote-audio-playback/blocked-640x360.jpg; artifacts/ux-review/remote-audio-playback/starting-sound-280x568.jpg; artifacts/ux-review/remote-audio-playback/failed-280x568.jpg; artifacts/ux-review/remote-audio-playback/recovered-280x568.jpg — local Chromium screenshots driven by a synthetic conversation transport, not real WebRTC or autoplay interoperability evidence
Measured result: synthetic validation distinguishes known blocked, gesture-pending, rejected-recovery, and recovered states; readiness gates the learner turn; only output overlapping an observed block/stop requests one automatic repeat; first ready OR blocked is recorded without identifiers or recovery timing
Risks / limitations: target-browser LiveKit event order, real autoplay policy, queued-versus-dropped audio, physical output, screen readers, representative devices, and child comprehension remain untested
Retain, revise, or reject: retain the readiness/audibility distinction and direct recovery; revise replay and copy only after device and child evidence
Next question: Across target browsers and devices, is blocked audio queued, discarded, or partly rendered, and can young multilingual learners use Tap for sound without adult translation?
```

```text
Branch: codex/talk-wait-recovery-message
Base branch / dependency: codex/first-audible-feedback documentation hand-off f11bde7
Commit: 5366776
Hypothesis: staged plain-language waiting followed by one static, result-first restart state helps a young beginner distinguish a slow reply from a failed one
Changed: transcript acknowledgement; staged wait copy; finite result-first terminal state; one live status and restart action; stable reserved geometry; serialized session retirement; stale, reused-ID, remount, and hung-request reconciliation; seven screenshots; research memo
Not changed: response thresholds, provider behavior, production telemetry, persistence, localization, or non-voice fallback
Tests: 665/665 unit/integration/lifecycle/safety tests; 178/178 Chromium tests; TypeScript, build, lint, diff, links, and JPEG integrity passed
Screenshots / traces: seven JPEGs in artifacts/ux-review/conversation-wait-recovery at 280x568 and 640x360
Measured result: deterministic boundaries acknowledge the learner, distinguish two wait stages, stop busy motion at terminal failure, keep Back/action geometry stable, and safely reconcile stale or hung replacement starts
Risks / limitations: mock transport/time and Chromium only; no real service, target assistive technology, localization, or direct child/caregiver evidence
Retain, revise, or reject: retain provisionally pending representative comprehension and timing work
Next question: After that explicit retry also fails, can a picture-led non-voice route preserve the learning goal without adding choice overload?
```

```text
Branch: codex/repeated-talk-recovery
Base branch / dependency: codex/talk-wait-recovery-message documentation hand-off ee5ba00
Commit: d48c38f
Hypothesis: after one explicit voice retry also fails, one familiar picture-led lesson route preserves the learning goal better than another identical retry loop
Changed: Talk-only retry budget; response-gated reset; restart/finish phase separation; static lesson-cover cue; one Play a lesson action; matching Finish recovery; cleanup-before-navigation; contrast-safe rose state; responsive, live-region, focus, motion, race, and purpose-isolation tests; five screenshots; research memo
Not changed: threshold evidence, provider behavior, persistence, production telemetry, localization, automatic lesson selection/playback, or child-content collection
Tests: 674/674 unit/integration/lifecycle/safety tests; 182/182 Chromium tests; TypeScript, production build, lint, diff, 196/196 local research links, and JPEG integrity passed
Screenshots / traces: five JPEGs in artifacts/ux-review/repeated-talk-recovery at 280x568, 390x844, and 640x360
Measured result: first failure keeps one retry; second consecutive Talk failure shows one static lesson route with exact polite status, >=44 px action, >=4.5:1 rest/interaction contrast, stable containment, destination focus, and safe stale/hung-start cleanup; onboarding/profile retries remain reusable
Risks / limitations: deterministic mocks and Chromium only; assistant signal is not proof of sound; server retirement may settle after navigation; direct child/caregiver, screen-reader, localization, and real-device/network evidence is absent
Retain, revise, or reject: retain as a bounded reversible hypothesis pending the documented formative study
Next question: Can Talk show one child-facing state at a time without duplicate text, multiple spinners, or unnecessary character motion?
```

```text
Branch: codex/talk-state-clarity
Base branch / dependency: codex/repeated-talk-recovery documentation hand-off b0f6147
Commit: 17c1711
Geometry evidence follow-up: b5c00b4
Hypothesis: one named phase, one meaningful caption, and only actionable controls make remote Talk states calmer and easier to parse than repeated wait text, disabled pseudo-actions, and simultaneous busy motion
Changed: duplicate system-caption labels removed; passive wait/listen pseudo-controls replaced by a responsive inert slot; timed Peppa motion stopped; reconnecting and saving copy simplified; sparse milestone detail kept in one atomic polite status; empty control slots removed from the accessibility tree; four-viewport geometry and active reduced-motion coverage added
Not changed: lifecycle states, wait thresholds, retry budgets, LiveKit or AI behavior, prompts, audio, persistence, Finish/Back/Retry/lesson fallback, or gesture-bound Starting sound and Opening microphone controls
Tests: 674/674 unit/integration/lifecycle/safety tests; 189/189 Chromium tests; TypeScript, production build, lint with 0 errors and 2 generated-file warnings, diff checks, 200 local research-document links (206 including the artifact manifest), and six baseline JPEG integrity checks passed
Screenshots / traces: six baseline JPEGs and a manifest in artifacts/ux-review/talk-state-clarity; after-state in-app capture remains unavailable and is explicitly not represented
Measured result: ordinary Thinking falls from three simultaneous animations to one; timed remote states have one running status animation, zero character/control-slot animations, and zero under reduced motion; caption and control-slot geometry remains stable across wait, Peppa speech, learner turn, and terminal recovery at 280×568, 390×844, 640×360, and 1440×900
Risks / limitations: no after-state visual inspection, VoiceOver/TalkBack session, 200% zoom/text-spacing check, real service/device/browser interoperability, localization review, or child/caregiver study; speaking and direct-action character motion remain deferred
Retain, revise, or reject: retain provisionally pending the documented visual, assistive-technology, and formative child/caregiver checks
Next question: Can Starting sound and Opening microphone acknowledge a child once without losing focus or the browser-required activation gesture?
```

```text
Branch: codex/talk-direct-action-feedback
Base branch / dependency: codex/talk-state-clarity documentation hand-off feacfe1
Commit: 8e69386
Hypothesis: the focused direct-action control can own one immediate pending acknowledgement while a stable status retains context, without losing focus, repeating transport work, or breaking gesture-bound sound recovery
Changed: single visible pending owner and spinner; static status context with one polite atomic announcement; same-node aria-disabled control; view and hook activation guards; inert shared-control pointer/press styling; literal microphone action semantics; static Peppa; neutral unattributed caption fallback; deliberate sound success/failure focus hand-off; deterministic delayed-microphone and established-track sound cases; timing, motion, geometry, focus, and repetition tests
Not changed: LiveKit or production transport behavior, request/operation IDs, permission policy, autoplay policy, retry budgets, wait thresholds, prompts, audio, persistence, production timeout, telemetry, dependencies, or translations
Tests: 27/27 focused component/lifecycle tests; 10/10 focused Chromium direct-action tests; 676/676 full unit/integration/lifecycle/safety tests; 193/193 full Chromium tests; TypeScript and production build passed; lint 0 errors with 2 generated-file warnings
Screenshots / traces: six pre-change JPEGs, eight after-state in-app Browser JPEGs, and a provenance/measurement manifest in artifacts/ux-review/talk-direct-action-feedback at 280×568, 390×844, 640×360, and 1440×900
Measured result: pending feedback renders below 100 ms in deterministic in-page measurement; one visible label and running animation at normal motion and zero animations under reduced motion; same button node and focus survive pending; duplicate pointer, Enter, Space, held-Space, programmatic, and hook calls are suppressed; stable control containment and no main overflow at 280×568, 390×844, 640×360, and 1440×900
Risks / limitations: local in-app Browser and deterministic transport only; no target-browser clean autoplay profile, real permission prompt/media device, VoiceOver/TalkBack/NVDA/switch observation, localization review, or direct child/caregiver study
Retain, revise, or reject: retain provisionally pending the documented platform, assistive-technology, visual, and formative checks
Next question: Which remaining first-use surface causes the largest avoidable content shift, hidden action, or language burden for a young English beginner?
```

```text
Branch: codex/first-use-ux-audit
Base branch / dependency: codex/talk-direct-action-feedback documentation hand-off 7e3bf1d
Evidence commits: b570605, 29d66b0, 691afeb; Talk visual follow-up fc09750
Changed: durable language, timing, and visual audits; first-use synthesis; source-register and backlog decisions; eight genuine after-state Talk screenshots
Not changed: product UI, profile flow, APIs, audio, persistence, telemetry, dependencies, or child-facing copy
Observed: acknowledgment navigation is owned by audio end/error/rejection or a 1.8-second timer; focus falls to BODY; profile setup shifts 208px and hides its 640x360 action; retained scroll hides the next heading; 280px question controls cross the fold
Selected next branch: codex/profile-acknowledgment-control
Next stacked branch: codex/profile-fallback-viewport-stability
Risks / limitations: deterministic local browser and source evidence only; no child/caregiver, target-AT, target-device, production-latency, or broad localization study
Next question: Can explicit Next preserve every acknowledgment and hand focus to each new step without adding copy or changing audio?
```

```text
Branch: codex/profile-acknowledgment-control
Base branch / dependency: codex/first-use-ux-audit ab95c65
Implementation commit: 4dd2ad3
Hypothesis: explicit Next lets each learner process acknowledgment feedback at their own pace without removing optional audio
Changed: removed timer/media navigation; idempotent audio cleanup; one-time per-operation heading focus; opt-in browser fixture; component/lifecycle/responsive browser contracts
Not changed: message copy, generated-output constraints, profile data/API/persistence, audio content/provider, replay UI, visual layout, telemetry, dependencies, or translations
Tests: 92/92 focused component/lifecycle; 2/2 focused Chromium; 679/679 full unit/integration/lifecycle/safety; 195/195 full Chromium; build and TypeScript passed; lint 0 errors with 2 generated warnings
Screenshots / traces: five in-app Browser JPEGs and manifest in artifacts/ux-review/profile-acknowledgment-control
Measured result: no implicit advance after 2.2s; heading owns focus; explicit Next alone navigates; 280x568, 390x844, and 1440x900 have no main overflow; initial 640x360 exposes the queued 260px vertical gap
Risks / limitations: target AT announcement order, real audio/browser policy, real devices, localization, production latency, and child/caregiver comprehension remain untested
Retain, revise, or reject: retain provisionally
Next branch: codex/profile-fallback-viewport-stability stacked on this documentation hand-off
```

```text
Branch: codex/profile-fallback-viewport-stability
Base branch / dependency: codex/profile-acknowledgment-control documentation hand-off 7a89a39
Research commit: 7ef2e35
Implementation commit: 1152866
Hypothesis: reserved art, viewport-shaped composition, and one-time step focus keep the current profile task visible without changing its flow
Changed: intrinsic image geometry; short and short-wide layout; step-keyed scroll/focus hand-off; length-aware valid acknowledgment layout; deterministic multi-step/long-copy fixtures; rendered regression matrix
Not changed: profile questions/copy/order, bilingual support, audio/transcription, skip behavior, API/persistence, telemetry, dependencies, or explicit acknowledgment pacing
Tests: 93/93 focused component/lifecycle; 14/14 focused Chromium; 679/679 full unit/integration/lifecycle/safety; 207/207 full Chromium; TypeScript/build passed; lint 0 errors with 2 generated warnings
Screenshots / traces: twelve in-app Browser JPEGs and manifest in artifacts/ux-review/profile-fallback-viewport-stability
Measured result: <=1px delayed-image movement across 16 surface/viewport cases; zero-scroll visible flow at 280x568, 390x844, 640x360, and 1440x900; exact 160-character boundary remains visible with Next
Risks / limitations: target devices/AT, zoom/text spacing, localization, real latency/CLS, and child/caregiver comprehension remain untested; maximum valid feedback is still linguistically dense
Retain, revise, or reject: retain provisionally
Next branch: contrast-safe child actions stacked on this documentation hand-off
```

```text
Branch: codex/contrast-safe-child-actions
Base branch / dependency: codex/profile-fallback-viewport-stability e2cf42a
Research commit: 13a2bd4
Implementation commit: c5fa0f6
Hypothesis: a deep semantic foreground can make enabled bright-pink action content readable without removing Parrot's playful primary cue
Changed: one action-foreground token; shared brand content; direct Play/Listen content; rendered state/ancestor-filter regression tests; before/after/focus evidence
Not changed: decorative/progress pink, labels, icons, target sizes, layout, navigation, timing, audio, APIs, persistence, disabled opacity, focus-ring token, dependencies, or translations
Tests: 11/11 focused Chromium; 679/679 full unit/integration/lifecycle/safety; 218/218 full Chromium; TypeScript/build passed; lint 0 errors with 2 generated warnings
Screenshots / traces: thirteen in-app Browser JPEGs and manifest in artifacts/ux-review/contrast-safe-child-actions
Measured result: enabled pair 5.063 rest, 5.066 hover, 4.685 active; prior pair 3.274 rest and about 3.21-3.22 filtered; no observed layout shift
Known boundaries: disabled composite about 2.105 over white under inactive exception; shared focus outline only 1.278 against navy menu
Retain, revise, or reject: retain provisionally for enabled pink action content only
Next branch: codex/shared-focus-visibility stacked on this documentation hand-off
```

```text
Branch: codex/shared-focus-visibility
Base branch / dependency: codex/contrast-safe-child-actions documentation hand-off a851d88
Research commit: 2c988b3
Implementation commit: d5e1bdc
Hypothesis: one contiguous light/deep indicator can keep shared keyboard focus visible across light, navy, selected, raised, and image-adjacent placements without extra language or layout change
Changed: semantic light/dark focus tokens; shared/base two-color focus geometry; synchronous ring feedback; rendered changed-area, retained-focus, forced-colors, and representative-surface browser contracts; thirteen screenshots; implementation evidence
Not changed: focus order, programmatic focus movement, labels, routes, content, control geometry, navigation, audio, domain timing, data, dependencies, translations, disabled palette, or route-specific page-text focus
Tests: 12/12 focused Chromium; 679/679 unit/integration/lifecycle/safety; 230/230 full Chromium; production build passed; lint 0 errors with 2 generated warnings
Screenshots / traces: thirteen genuine in-app Browser JPEGs and a provenance/integrity manifest in artifacts/ux-review/shared-focus-visibility at 280×568, 390×844, 640×360, and 1440×900
Measured result: unchanged base failed two dark-surface cases with zero qualifying changed area; candidate passes all twelve; the 16.576:1 token pair renders as four-pixel white then four-pixel deep navy without increasing the prior eight-pixel footprint; removing the shadow transition makes the full light band synchronous instead of arriving over 150 ms
Risks / limitations: same-pixel test is not exhaustive adjacent contrast or whole-product conformance; forced colors is computed emulation only; representative artwork is bounded; target devices/browsers/AT, zoom/text spacing, and child/caregiver comprehension remain untested
Retain, revise, or reject: retain provisionally for shared controls and base form fallbacks
Next branch: codex/story-reader-page-focus-visibility stacked on this documentation hand-off; then generated profile-feedback language
```

```text
Branch: codex/story-reader-page-focus-visibility
Base branch / dependency: codex/shared-focus-visibility documentation hand-off 0d08e63
Research commit: 749ab64
Implementation commit: 8c300aa
Hypothesis: a separated left page-arrival marker can make route-managed story focus findable without extra English, closed-control affordance, or changed story geometry
Changed: focused page-text presentation; pointer-stable :focus cue; symmetric short-wide containment gutter; forced-colors outline; shape/contrast/pointer/wrapping/prompt/edge browser contracts; fourteen screenshots and implementation evidence
Not changed: focus lifecycle, tab order, routes, page words, prompts, narration, audio timing, controls, data, dependencies, translations, or shared-control focus
Tests: 18/18 focused Chromium; 679/679 unit/integration/lifecycle/safety; 236/236 full Chromium; production build passed; lint 0 errors with 2 generated warnings
Screenshots / traces: fourteen genuine in-app Browser JPEGs and a provenance/integrity manifest in artifacts/ux-review/story-reader-page-focus-visibility at 280×568, 390×844, and 640×360
Measured result: baseline sky/cream pair 1.603:1; retained brand-blue/cream pair 6.451:1; all 122 pages show zero line, prompt, scroll, overflow, clip, or focus geometry regressions across three viewports; both forced-color outline edges render in the short-wide clip
Risks / limitations: static paragraph is not classified as a UI component; forced colors is emulation only; target browsers/devices/AT, RTL/localization, zoom/text spacing, and child/caregiver comprehension remain untested
Retain, revise, or reject: retain provisionally as page-arrival feedback, not narration tracking
Completed next branch: codex/deterministic-profile-acknowledgments at 77916ca; separately investigate long-page short-wide prompt discoverability
```

```text
Branch: codex/deterministic-profile-acknowledgments
Base branch / dependency: codex/story-reader-page-focus-visibility documentation hand-off 1fb33b6
Research commit: 160e2a3
Implementation commit: 77916ca
Hypothesis: one reviewed, input-independent Pre-A1 formula can confirm every successful form-profile answer without model-written reading-level drift, subjective praise, invented language, or public answer echo
Changed: all six checked-in acknowledgments to exact Thank you!; validator drift guard; Groq prompt/schema/parser limited to summary and canonical fields; trusted write boundary; historical API projection; retry and bulk selection; standard browser fixtures; adversarial/generated/fallback/read/repeated-copy tests; five visual-evidence captures; language, privacy, compatibility, and implementation research
Not changed: profile questions/order, raw-answer/summary persistence, Groq factual enrichment, realtime profile conversation, explicit Next pacing, runtime acknowledgment TTS, API or D1 snapshot shape, database migrations, dependencies, translations, or long legacy rendering tolerance
Tests: 53/53 focused domain/enrichment/worker/infrastructure; 680/680 full unit/integration/lifecycle/safety; 236/236 full Chromium; production build passed; lint 0 errors with 2 generated warnings
Screenshots / traces: four selected-state and one legacy-density genuine in-app Browser JPEGs with integrity manifest in artifacts/ux-review/deterministic-profile-acknowledgments at 280×568, 390×844, 640×360, and 1440×900
Measured result: exact current phrase remains one line at all four viewports; 30px heading height at 280×568 versus 300px for the retained 160-character defensive fixture; Next is 144×52; heading focus, main scroll origin, and zero horizontal overflow are preserved
Risks / limitations: Thank you! is a vocabulary-aligned product hypothesis, not proven comprehension; six repeated screens may feel tedious; raw answers still go to Groq and D1; realtime speech remains generated; target child/caregiver, device/browser/AT, localization, production latency, and provider-retention testing remain
Retain, revise, or reject: retain provisionally pending direct child/caregiver comprehension and repetition testing
Next branch: codex/static-profile-acknowledgment-audio to remove the now-redundant runtime ElevenLabs request; later test a non-control-like reading-position cue for focused profile headings
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
7. **Medium: malformed My Lessons responses can expose raw data-shape text.**
   Fixed on `codex/my-lessons-recovery-copy` at `f5b28b2` with a fixed public
   recovery state, complete list-response validation, sanitized diagnostic
   causes, and stable retry focus.
8. **High: a deferred Finish continuation could revive a conversation the child
   had left or disconnect a newly opened transport.** Fixed on
   `codex/privacy-safe-experience-events` at `526d6d1` by invalidating the old
   operation immediately, retaining transport ownership across awaits, and
   regression-testing Finish → Back → reopen → late completion.
9. **High: profile acknowledgments can disappear on audio outcome or after
   1,800 ms without a learner action.** Fixed on
   `codex/profile-acknowledgment-control` at `4dd2ad3`; **Next** is now the sole
   advance owner and each message receives focus.
10. **High: the form-profile fallback moves and hides its first action or next
    step at narrow and short viewports.** Fixed on
    `codex/profile-fallback-viewport-stability` at `1152866` with intrinsic art
    geometry, compact compositions, and step-keyed scroll/focus restoration.
11. **High: normal-size white text on the default pink action token is 3.27:1.**
    Fixed for enabled shared brand content and direct **Play**/**Listen** cues
    on `codex/contrast-safe-child-actions` at `c5fa0f6`. The retained
    bright-pink/deep-navy pair is 5.063:1 at rest, 5.066:1 on hover, and 4.685:1
    active.
12. **Medium: a valid 160-character acknowledgment becomes a ten-line reading
    wall at 280×568.** Fixed provisionally for current server output on
    `codex/deterministic-profile-acknowledgments` at `77916ca`: all six form
    questions now use exact `Thank you!`, which occupies one 30-pixel line at
    280×568 instead of the legacy fixture's 300-pixel, ten-line heading. The
    160-character viewport case remains as defensive compatibility coverage,
    and direct beginner comprehension is still untested.
13. **High: the shared ink focus outline nearly disappears against the navy
    account menu.** Fixed provisionally on `codex/shared-focus-visibility` at
    `d5e1bdc` with a contiguous four-pixel white/four-pixel deep-navy indicator.
    The unchanged base failed both routed dark-surface cases; the candidate
    passes all 12 bounded shared-focus checks.
14. **Medium: the Story Reader's programmatically focused page text uses a pale
    sky ring against cream.** Fixed provisionally on
    `codex/story-reader-page-focus-visibility` at `8c300aa` with a separated
    four-pixel page-arrival marker and real forced-colors fallback. The
    retained pair is 6.451:1; all 122 current pages preserve baseline geometry.
15. **Medium: a three-line Story Reader page at 640×360 can leave only the top
    sliver of the yellow join-in prompt visible with no obvious scroll cue.**
    Confirmed on Kite, Come Back! page 4 in both base and retained screenshots.
    The page-focus branch causes zero prompt or scroll-geometry change. Study a
    discoverable short-wide content-pane affordance separately without reducing
    story font size or silently moving focus away from the sentence.

## Parked ideas

- Badges, streaks, leaderboards, infinite content, surprise rewards, and daily
  pressure are intentionally not backlog goals.
- More character animation is not a goal without a comprehension/state purpose
  and reduced-motion behavior.
- A general-purpose child chatbot is outside the current product boundary.
- Automatic ability inference from age, accent, affect, or a single speech score
  is outside the current evidence base.
