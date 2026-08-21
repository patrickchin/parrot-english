# Voice fallback speaking practice

Date: 2026-08-21
Status: implemented on `codex/voice-fallback-practice`
Implementation commit: `2a7fd71`

## Question and scope

When a lesson cannot open the microphone or cannot check recorded speech, can a
young beginner still practise the target words and continue without being
blamed, seeing technical provider language, losing progress, or being told that
their speech was assessed?

This slice covers the shared lesson player used by ready-made and generated My
Lessons. It covers:

- recording APIs that are unavailable;
- microphone permission or device access that fails;
- a speech-check request that fails or times out.

It does not add an offline speech recognizer, change live character chat, infer
whether the child really spoke, or claim that unscored practice is equivalent
to assessed pronunciation feedback.

## Audience

The primary learner may be about five years old, may not read independently,
and may know little English. A grown-up may be nearby, but recovery must not
require reading a browser name, an API error, or microphone-settings
instructions.

## Repository audit

Ready-made and generated lessons both run through `LessonPlayer` in
[`src/app/App.tsx`](../../src/app/App.tsx). The failure handling was therefore a
single shared product problem rather than two route-specific problems.

| Failure | Previous visible result | State and progress before this change |
| --- | --- | --- |
| `MediaRecorder` unavailable | “This browser does not support audio recording. Try the latest Chrome or Safari.” | The learner remained on the turn; the only non-mic action was **Skip**. |
| Microphone access rejected | “Please allow microphone access, then tap the microphone again.” | The learner remained on the turn; retrying could repeat the same failure. |
| Recorder start/stop failure | A low-level exception could reach the child. | Checked turns remained or returned to the turn; unchecked stop failures have a separate lifecycle limitation noted below. |
| Evaluation HTTP failure or timeout | “Speech check failed:” followed by server/provider detail | `EVALUATION_FAILED` correctly returned to the same turn without incrementing `attemptCount`, but recovery still looked like the learner's failure. |

The reducer already had the safest progress primitive: `SKIP_USER` advances a
waiting/recording learner line without creating a transcript, response outcome,
or feedback response. The smallest safe implementation reuses that transition.

## Evidence used

No new external source was needed for this bounded implementation. The durable
[source register](./source-register.md) already contains the relevant primary
and practitioner evidence:

- **A11Y-01** and **A11Y-02:** common words and clear visible labels reduce
  cognitive barriers;
- **A11Y-03:** feedback should make the current state and next step clear;
- **A11Y-04:** recovery should keep the critical path short and avoid needless
  interruption;
- **VOICE-01:** recording support, permission decisions, and device failures are
  distinct media-capture outcomes;
- **LANG-03** and [Beginner language and age](./beginner-language-and-age.md):
  Pre-A1 practice should use short instructions and brief spoken responses.

These sources do not prove that the final labels work for five-year-old
multilingual learners. That requires direct, consented comprehension testing.

## Decision

After a microphone or speech-check failure, the player now shows a calm navy
**Speaking help** status and changes the two controls:

1. **Done** is the larger primary action. It continues through the existing
   unscored `SKIP_USER` transition.
2. **Try mic** remains available as a secondary action.

The child-facing messages are deliberately short:

| Condition | Message |
| --- | --- |
| Recording unsupported | “No mic here. Say the words. Then tap Done.” |
| Access denied/unavailable | “The mic is off. Say the words. Then tap Done.” |
| Other microphone start failure | “The mic did not work. Say the words. Then tap Done.” |
| Speech check unavailable | “We could not check your words. Tap Done to keep going.” |

The recovery does not dispatch `EVALUATED`, display success/incorrect feedback,
store a transcript, or increment an attempt. After an evaluation failure, the
child's original spoken attempt already happened; **Done** therefore does not
ask them to repeat it. After a microphone failure, the prompt explicitly asks
for out-loud practice before **Done**.

The help card uses polite status semantics instead of an alert, because loss of
microphone service is not the child's error. The general lesson live region is
empty while this dedicated status is active so assistive technology does not
also announce the contradictory old instruction to tap the microphone.

## Rejected alternatives

- **Mark the turn correct:** rejected because the app did not assess the speech.
- **Keep retry plus Skip:** rejected because “Skip” frames the only working path
  as abandoning practice.
- **Require a grown-up to change browser settings:** rejected as the only path;
  it blocks the learning goal and adds technical language.
- **Remove microphone practice after one failure:** rejected because a denied
  permission or network failure can be temporary; **Try mic** keeps agency.
- **Add an offline recognizer:** rejected for this slice because it adds model,
  download, privacy, and quality work that is unnecessary for safe continuation.

## Visual evidence

- [Before: denied access shown as a red technical error at 280×568](../../artifacts/ux-review/voice-fallback-practice/before-denied-280x568.png)
- [After: calm help and visible Done/Try mic controls at 280×568](../../artifacts/ux-review/voice-fallback-practice/after-denied-280x568.png)
- [After: boxed lesson picture and recovery stay separate at 640×360](../../artifacts/ux-review/voice-fallback-practice/after-denied-640x360.png)

At 640×360 the final measured rectangles were:

- artwork: `x 12–333.6`, `y 109.6–290.4`;
- prompt: `x 351.6–628`, `y 128–196`;
- help: `x 351.6–628`, `y 213–280`;
- controls: `x 351.6–628`, `y 300–348`.

There was no page overflow or overlap. Both actions retained at least a 44×44
CSS pixel target. The final manual browser pass logged no warnings or errors.

## Verification contract

The browser tests simulate all three outcomes and assert behavior through
accessible names:

- denied access on a 280×568 ready-made lesson;
- unsupported recording on a 768×600 generated lesson;
- a checked ready-made turn whose server returns a technical HTTP 503 detail.

The contracts require that the provider detail is absent, the calm help is
visible, **Done** advances or completes the task, and no speaking-feedback
region appears. The reducer test additionally proves that evaluation failure
preserves the turn and that unscored continuation leaves transcript, outcome,
response, and attempt count empty.

The E2E-only `parrotE2eMicrophone=denied|unsupported` scenario makes these
states reproducible for screenshots and browser tests without changing
production behavior.

Final validation:

- 18 focused lesson-state tests passed;
- 25 focused lesson-player Chromium tests passed;
- 610 unit and mounted-lifecycle tests passed;
- 120 Chromium tests passed in 36.5 seconds with four workers;
- the production build passed;
- lint reported zero errors and the two pre-existing unused-disable warnings in
  generated `worker-configuration.d.ts`.

## Measurement and safety guardrails

- The failure response adds no network step: the local catch immediately swaps
  the controls and status after the browser/provider failure settles.
- Do not measure recovery by child time-on-app. Measure whether the learner can
  identify the next action and reach the next scene without adult translation.
- Never log child audio or a transcript merely to measure this fallback.
- Treat any UI that implies “correct,” “passed,” or “heard” after **Done** as a
  release-blocking regression.
- Keep **Done** available even if repeated microphone retries fail.

## Limits and next questions

- “Mic,” “Done,” and the arrow/microphone icons still need comprehension testing
  with non-reading learners and caregivers.
- A real device may distinguish a blocked permission from missing hardware in
  ways the deterministic simulations do not cover.
- Unchecked speaking turns advance as soon as recording is released; a rare
  recorder stop failure can therefore surface after the script has moved. Fix
  that operation ordering separately rather than expanding this branch.
- This path does not solve slow or failed lesson audio. That already has its own
  retry/skip recovery.
- A later low-bandwidth study should test whether saved audio and pictures remain
  useful when speech checking is unavailable for an entire session.

The cheapest next evidence is a short, consented task: deny the microphone, ask
the child to show what they would tap next, and record only task completion and
whether adult translation was needed.
