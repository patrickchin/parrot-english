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

| Area | Minimum event fields | Definition | Starting threshold |
| --- | --- | --- | --- |
| Page experience | `web_vital {name, value, rating, route, navigation_type}` | Field LCP, INP, and CLS by route/device/browser | Official "good" at p75: LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1 |
| Control acknowledgement | `control_ack {control, duration_ms}` | Activation to next painted visual state for Start, Mic, Stop, Repeat, Continue | Proposed p95 ≤100 ms |
| Microphone startup | request, permission settled/outcome, capture ready, failure/reason | Separate human permission time from post-decision device startup | Proposed after grant: p75 ≤1 s, p95 ≤2 s; never SLO the human decision interval |
| Voice room startup | start requested, room connected, mic published, first remote audio, playback blocked | Start tap to connected/published/audible milestones | Proposed room connected p75 ≤3 s, p95 ≤7 s; first remote audio after connection p75 ≤1 s, p95 ≤2 s |
| Turn response | `turn_id`, child end, agent stages, client first audible | Child stops speaking to character audio becoming audible | Proposed p75 ≤1.5 s, p95 ≤3 s; treat ≥4 s as degraded pending child validation |
| Recovery | reconnect started/completed, duration, disconnect reason | Active voice interruption through usable recovery or clear fallback | Proposed reconnect p95 ≤3 s; offer calm fallback rather than an endless spinner |

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

- Report distributions (p50/p75/p95) by release, route, browser, coarse device
  class, and permission state.
- Use session-scoped random identifiers and, where available, LiveKit
  `speech_id` correlation.
- Keep both agent-side end-to-end timing and client-observed first-audible time.
  Near-zero server playback timing does not include delivery to the learner.
- Sample connection quality coarsely while a voice session is active. Derive
  jitter-buffer average from `jitterBufferDelay / jitterBufferEmittedCount`.
- Never send raw audio, transcript content, IP or ICE candidate addresses,
  persistent device identifiers, or precise network/location signals.
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

See [PERF-01 through PERF-02](./source-register.md) and
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
