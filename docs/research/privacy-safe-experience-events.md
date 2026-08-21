# Privacy-safe Experience Events

Last reviewed: 2026-08-21

Branch: `codex/privacy-safe-experience-events`

Status: implemented and validated

Implementation commit: `526d6d1`

Audience: young English learners, with a deliberately narrower data boundary
because child voice and personalised lesson flows can contain sensitive content

## Decision

Add one typed client boundary for a small set of experience milestones, but do
not collect them in production yet. With no sink installed, the boundary does
not read a clock, schedule a task, write storage, send a request, dispatch a DOM
event, or log to the console.

The implemented payload is identifier-free, not anonymous. If a future sink
sends it over a network, IP addresses, authentication, request logs, or linkage
inside that processor may still make the activity identifiable. Enabling such a
sink is a separate product, privacy, security, and legal decision.

## Product question

Can Parrot locate slow or broken child journeys without collecting speech,
lesson text, names, stable identifiers, or raw technical diagnostics?

The cheapest safe first step is an inert measurement contract. It lets local
and automated tests exercise candidate client milestones and the current
logical and transport boundaries before the product chooses a processor or
retains field data.

## Observed architecture

The browser application had local response-latency state and the worker had
ordinary operational observability, but the client had no analytics SDK,
beacon, event endpoint, or experience-event store. Adding a vendor would have
mixed two decisions:

1. which milestones and fields are actually useful; and
2. whether Parrot is authorised to transmit and retain them.

This branch answers only the first question and keeps the second off by
default. It does not change existing account, conversation, lesson, worker-log,
or database behavior elsewhere in the application.

## Implemented schema

Every event receives only `schemaVersion: 1` in addition to the fields shown.
Durations are relative, rounded integers from zero through five minutes. A
value at five minutes means "five minutes or more," preserving the slow tail
without allowing an unbounded value.

| Event | Outcome | Allowed fields | Exact endpoint |
| --- | --- | --- | --- |
| `conversation_start` | `ready` | `surface`, `apiReadyMs`, `roomReadyMs`, `microphoneMutedMs`, `learnerTurnReadyMs` | Start action through the logical client transition to the first learner turn. The four milestones share one monotonic origin and must be nondecreasing. `microphoneMutedMs` confirms only the initial disabled control call; it is not permission, capture, publication, or device readiness. |
| `conversation_start` | `failed` | `surface`, `stage`, `durationMs` | Start action through failure. `stage` is one of `api`, `room`, `microphone_mute`, or `opening`. |
| `conversation_turn_response` | `assistant_signal`, `disconnected`, `microphone_stop_failed`, or `send_failed` | `surface`, `durationMs` | End-turn action through the first assistant transport/transcript signal or terminal failure. `microphone_stop_failed` means the disable control rejected; `send_failed` means that control resolved but turn commit rejected. This is not verified audible speech. |
| `lesson_microphone` | `ready`, `access_failed`, `unsupported`, or `failed` | `durationMs` | Microphone tap through the current recorder result. It includes a person's permission-decision time and must not be compared with a post-grant device SLO. |
| `lesson_speech_check` | `completed` or `failed` | `durationMs` | End of the lesson speaking action through check completion or failure. It intentionally omits transcript, correctness, score, attempt, lesson, and feedback content. |

`surface` is only `talk` or `learner_profile`; it is not a raw route. The
learner-turn milestone is logical React/application readiness after state is
requested, not a verified browser paint. A future control-acknowledgement
measurement must use a committed/painted signal and remain a separately
reviewed event.

## Boundary invariants

The implementation treats the event producer as untrusted even though it is
inside the same application:

- only plain objects with enumerable data properties are accepted;
- symbol, non-enumerable, accessor, inherited, class-instance, proxy-failure,
  missing, and extra fields are rejected;
- each event is reconstructed from named fields and frozen before delivery, so
  later mutation cannot append child content;
- names, ages, account/session/conversation/turn/speech/lesson/story IDs, URLs,
  routes, query strings, referrers, audio, transcripts, prompts, lesson text,
  correctness, free-form errors, stack traces, epoch timestamps, user agents,
  device/screen/network details, ICE data, and metadata bags are not in the
  contract;
- one monotonic origin produces bounded, nondecreasing milestones; wall-clock
  time and `timeOrigin` are never emitted;
- stale or cancelled UI operations do not finish a timeline;
- replacing or removing a sink invalidates its in-flight measurements and any
  delivery task that has not started, so an old consent or test scope cannot
  flow into a new sink; removal cannot undo sink work that has already begun;
- delivery runs after the interaction stack, and scheduler, synchronous sink,
  and rejected-promise failures cannot interrupt a lesson or conversation;
- without a sink, the shared production instance is a constant no-op and does
  not even read `performance.now()`.

## Privacy and safety rationale

The current US COPPA rule includes categories such as persistent identifiers,
child audio, geolocation, and combinations linked to a child. The FTC FAQ also
makes clear that an analytics provider does not create a general-purpose
exception for collection. The UK Children's Code says to collect and retain
only what each service element needs, with privacy-protective defaults.
Together these sources support minimising this first contract and keeping
transmission off; they do not establish Parrot's legal status or lawful basis.

High Resolution Time supports same-context elapsed measurement with a
monotonic clock, while also documenting timing-related privacy considerations.
OWASP's logging guidance supports excluding session identifiers, access
tokens, and sensitive request data rather than relying on later scrubbing.

See [PRIV-04 through PRIV-06, PERF-03, and SEC-01](./source-register.md) for
dated direct links, the exact source claims, and limitations. This memo is
privacy-engineering guidance, not legal advice.

## Field-sink gate

Do not install a production sink until a review records all of the following:

1. one necessary purpose and a named owner;
2. applicable child/caregiver notice, consent, lawful-basis, and jurisdiction
   decisions from qualified reviewers;
3. the processor, region, recipients, access controls, deletion mechanism, and
   enforced retention time;
4. a complete data-flow review including request authentication, IP/network
   metadata, CDN and worker access logs, retries, backups, support tooling, and
   downstream exports;
5. aggregate release criteria and minimum cohort sizes that avoid exposing one
   child's activity;
6. tests proving that the exact-key boundary remains closed and that opting out
   or removing the sink invalidates measurements and not-yet-invoked delivery;
   a network sink must separately make already-started requests abortable.

An approved sink should consume the frozen events directly. It must not add a
session identifier, reconstruct a route, join account/conversation records, or
accept a generic metadata object.

## Rejected alternatives

- **Install an analytics or error-reporting vendor now.** Processor choice,
  network metadata, retention, and consent are unresolved.
- **Use `console`, `window` events, or local/session storage as a temporary
  sink.** These create another disclosure or retention surface and make the
  no-collection default harder to verify.
- **Add a random session or operation ID.** It enables correlation that the
  current milestone questions do not require.
- **Reuse LiveKit `speech_id` or conversation/turn IDs.** They are linkable and
  unnecessary for aggregate duration and outcome questions.
- **Emit raw routes or lesson IDs.** A fixed coarse surface answers the current
  question without leaking personalised titles or saved-content identifiers.
- **Attach errors, messages, codes, stacks, or response bodies.** Free-form
  diagnostics can contain account, content, network, or provider details.
- **Call the turn event first audio.** The existing callback is a transport or
  transcript signal; only a mounted media element's verified `playing` event
  could support an audible milestone.
- **Add Core Web Vitals in the same schema.** Page metrics have different
  lifecycle and privacy semantics and need their own collection review.
- **Measure engagement, dwell time, streaks, or cross-session funnels.** Those
  are not required to diagnose immediate feedback and can reward time-on-app
  instead of comprehension, agency, or calm recovery.

## Validation contract

Automated validation covers:

- every accepted event shape, exact fields, chronological milestones, frozen
  reconstruction, and mutation after validation;
- missing, extra, identifying, symbol, non-enumerable, getter, class, proxy,
  enum, numeric, range, and ordering failures;
- no-sink zero work, monotonic rounding, saturation, cancellation, sink
  replacement, out-of-order cleanup, queued-work removal, and failure isolation;
- conversation ready/API-failure/assistant-signal paths and lesson microphone/
  speech-check/stale-operation paths in the React lifecycle suite;
- a browser test that installs a page-local, in-test trace and proves exact
  startup order, absence of the seeded child fixture and system identifiers,
  and continued recovery after a throwing test sink. The trace is asserted in
  the test and is not retained as an artifact.

The complete branch run passed 638 of 638 unit/lifecycle/safety tests and 166 of
166 Chromium tests in 36.3 seconds. Lint reports zero errors and the two
pre-existing warnings in the generated worker declarations. The production
build passed with a 484.96 kB raw / 147.02 kB gzip core index bundle, below the
existing 180 kB gzip boot guardrail.

## Remaining uncertainty

- A logical learner-turn transition can precede a committed paint under main-
  thread contention. Measure control paint separately before making a child-
  visible wait claim.
- The assistant signal can precede audible output. A future media-element
  `playing` milestone should be researched and tested across autoplay,
  reconnect, replay, and accessibility behavior.
- Lesson microphone time currently includes the human permission decision.
  Separate permission-granted from device-ready before applying startup SLOs.
- No field distribution exists yet, so the proposed voice targets in
  [Feedback, voice latency, and experience measurement](./feedback-and-latency.md)
  remain hypotheses.
- Direct child and caregiver research is still needed to learn whether current
  waiting words and recovery states are understood and calming.

## Hand-off

```text
Branch: codex/privacy-safe-experience-events
Base branch / dependency: codex/my-lessons-recovery-copy documentation hand-off 85558fa
Commit: 526d6d1
Hypothesis: a closed identifier-free milestone boundary can make waiting and failure measurable without collecting child content or introducing production retention
Changed: strict event schema, no-op sink boundary, conversation/lesson timing integration, lifecycle and browser contracts, privacy/timing research records
Not changed: production collection, analytics/error vendor, event endpoint/store, account/conversation/lesson persistence, consent/legal status, child-facing UI, audible-output measurement
Tests: 638 unit/lifecycle/safety tests passed; 166 Chromium tests passed in 36.3 seconds; build passed; lint 0 errors with 2 pre-existing generated-file warnings
Screenshots / traces: artifacts/ux-review/privacy-safe-experience-events/talk-ready-desktop.jpg and talk-learner-turn-desktop.jpg; the page-local event trace is asserted in browser tests and intentionally not retained; no child-facing UI changed
Measured result: exact identifier-free events preserve milestone order; no-sink startup performs no measurement work; stale operations, replaced sinks, queued removal, and sink failures are isolated; core index is 484.96 kB raw / 147.02 kB gzip
Risks / limitations: logical learner readiness is not verified paint; assistant signal is not audible output; microphone permission decision remains inside lesson timing; no field baseline or child/caregiver study
Retain, revise, or reject: retain the inert boundary; do not enable a production sink without the documented field-sink gate
Next question: Can the mounted remote media element expose first-audible feedback without changing autoplay, replay, accessibility, or privacy behavior?
```
