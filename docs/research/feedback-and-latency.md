# Feedback, Voice Latency, and Experience Measurement

Last reviewed: 2026-08-21  
Question: How should Parrot measure and communicate waiting so a young learner
knows an action worked and the conversation still feels responsive?

## Conclusion

Measure two different experiences:

1. **Control acknowledgement:** the tap or key produces a visible state change
   immediately, even when permission, networking, AI, or audio needs more time.
2. **Outcome latency:** the requested experience becomes usable or audible.

A backend timing is not the child's waiting time. Voice measurement should
connect the child's action to a client-observed event such as microphone-ready
or first audible remote audio, while retaining stage timings for diagnosis.

Standards-backed page thresholds and product SLOs must be labelled separately.
Proposed SLOs below are starting hypotheses to validate on real target devices
and with children; they are not child-development standards.

## Event model and starting thresholds

| Area | Minimum privacy-reviewed fields | Definition | Starting threshold |
| --- | --- | --- | --- |
| Page experience | Future fixed metric, coarse surface, value, rating, and navigation type; no raw route | Field LCP, INP, and CLS after a separate collection review | Official "good" at p75: LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1 |
| Future control acknowledgement | Proposed `control_ack {control, duration_ms}` after a separate privacy review | Activation to next painted visual state for Start, Mic, Stop, Repeat, Continue | Proposed p95 ≤100 ms |
| Microphone startup | Fixed outcome and bounded duration only | Current lesson measurement includes the human permission decision; a future post-grant event must separate it before applying a device SLO | Proposed after grant: p75 ≤1 s, p95 ≤2 s; never SLO the human decision interval |
| Voice room startup | One identifier-free payload with API-ready, room-connected, initial-mute-confirmed, and learner-turn-state-ready relative durations | Start action through the logical client transition to a learner turn; initial mute is a control milestone, not microphone permission, capture, publication, or device readiness, and the learner-turn state does not verify a painted control or audible output | Proposed room connected p75 ≤3 s and p95 ≤7 s; learner-turn target still needs a field baseline |
| Turn response | Fixed surface, fixed outcome, and bounded duration; no turn ID | End-turn action to the first assistant transport or transcript signal; this is not proof of audible output | Proposed p75 ≤1.5 s, p95 ≤3 s; treat ≥4 s as degraded pending child validation |
| Future recovery | Proposed fixed operation/outcome and bounded duration after a separate privacy review; no disconnect text | Active interruption through usable recovery or clear fallback | Proposed reconnect p95 ≤3 s; offer calm fallback rather than an endless spinner |

The four-second conversational boundary is informed by an adult 2025 study of
1.5, 4.0, and 6.5 second response onset. It is useful as a warning, not
child-specific proof. Validate both the threshold and the status presentation
with young learners.

## State presentation

Every asynchronous activity should have a stable, literal state and one useful
next action:

| Technical state | Child-facing meaning | Recovery |
| --- | --- | --- |
| Permission not decided | "Ask a grown-up about the microphone." | Continue after decision; never show a fake countdown |
| Connecting | "Getting ready…" | Stop / go back remains available |
| Listening | "Your turn." | Repeat prompt, then speak |
| Processing | "Thinking…" | Keep the prior context visible; no layout jump |
| Remote speech | "Peppa's turn." | Stop, replay if supported |
| Reconnecting | "Trying again…" | Show a short fallback after the recovery budget |
| Recoverable failure | Specific literal cause when known | Retry plus a non-voice path or grown-up help |
| Complete | "Finished." | Leave, repeat, or choose another activity deliberately |

Animation can show life, but it cannot be the only state signal. Status text
must not churn so often that assistive technology repeatedly interrupts the
experience.

## Privacy-preserving telemetry

The first implemented boundary is intentionally narrower than this memo's
earlier proposal. It emits no session-scoped random identifier and no LiveKit
`speech_id`. It also adds no production sink, network request, persistent event
storage, cookie, global DOM event, or console output, so this boundary currently
creates no persistent event retention. This does not describe unrelated app data.
See [Privacy-safe experience events](./privacy-safe-experience-events.md).

- Use one fixed final event for a multi-stage operation, or an in-memory token
  that is never emitted. Do not build a cross-session funnel.
- Allow only closed system enums and bounded relative integer durations. Do not
  add a metadata/tag bag.
- Do not emit raw routes, URLs, saved-content IDs, account/session/conversation/
  turn identifiers, names, ages, audio, transcripts, prompts, lesson text,
  correctness, error messages/stacks, epoch timestamps, user agents, device or
  screen details, network addresses, ICE candidates, or complete WebRTC stats.
- Call the current turn endpoint **assistant signal**, not first audible. Add an
  audible endpoint only after the mounted media element exposes a verified
  `playing` signal.
- A future field sink requires a purpose, owner, legal/consent review, network
  and access-log audit, enforced deletion timeframe, and explicit data-flow
  documentation before it is enabled.
- Instrumentation failure must never block a lesson or conversation.

## Measurement sequence

1. Add a typed, no-op-safe event boundary with unit tests and explicit privacy
   allowlists.
2. Instrument existing client milestones without adding a vendor.
3. Verify event ordering and clocks in local/browser traces.
4. Choose a storage/analytics processor only after data and retention review.
5. Establish baselines on representative low/mid-range devices and networks.
6. Test state words and waiting behavior with children and caregivers.
7. Tune SLOs and create alerts only after the baseline is trustworthy.

## Evidence and limits

See [PRIV-04 through PRIV-06](./source-register.md),
[PERF-01 through PERF-03](./source-register.md), and
[VOICE-01 through VOICE-03](./source-register.md). Core Web Vitals are official
page-experience thresholds. The voice targets are Parrot hypotheses assembled
from platform semantics, general responsiveness research, and an adult
conversation study; they require validation with the product's audience.

## Open questions

- Where does current time-to-first-audio accrue: permission, room connection,
  agent startup, model response, speech generation, network, or autoplay?
- Does "Thinking" reassure children, or do they need a more concrete cue?
- What non-voice path preserves learning when microphone permission is denied?
- Which metrics can remain entirely on-device while still helping a grown-up
  diagnose a failed session?
