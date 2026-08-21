# Literal Voice-State Feedback

Last reviewed: 2026-08-21  
Branch: `codex/voice-state-feedback`  
Base: `codex/continuous-research-program`

## Question

Can the existing realtime conversation make every wait understandable to a
young beginner without adding a second state machine, more telemetry, or more
child data?

## Audit finding

The interaction model and recovery timers already existed, but presentation
mixed technical state with metaphor and unsupported reassurance. Examples
included “Waking up Peppa,” “Peppa heard you,” and “Your words are safe.” The
status label also changed during one wait, causing avoidable live-region churn.

## Implemented contract

| Event | Immediate child-facing state | Later recovery |
| --- | --- | --- |
| Start tapped | **Getting ready** before the request resolves | **Chat paused** plus one retry after 12 s |
| Learner can begin | **Your turn** | Repeat Peppa's last line remains available |
| Microphone opening | **Opening microphone** | Return to the same turn with a literal error |
| Microphone active | **Listening** | **I'm done** ends the turn |
| Turn ended | **Thinking** immediately | **Chat paused** plus one retry after 15–23 s |
| Remote audio active | **Peppa's turn** | **Your turn** only after the audio ends |
| Connection interrupted | **Trying again** | **Chat paused** plus one retry after 18 s |
| Unexpected disconnect | **Chat paused** | One **Try again** action |

The status remains an atomic polite live region. Growing transcript text stays
visual instead of repeatedly interrupting assistive-technology users. Detail
copy may change during a long wait, but the announced state remains stable until
the interaction becomes recoverable.

## Scope boundary

This branch reuses the current state machine and timed-feedback helper. It does
not change LiveKit, prompts, persistence, analytics, raw-audio handling, or
conversation content. No event vendor or content collection was added. A
denied-microphone learning path remains a separate backlog item.

## Evidence

- The mounted lifecycle check holds the conversation request open and verifies
  that Start changes `ready` to `connecting` before the response returns.
- Feedback tests cover stable labels and finite retry thresholds.
- Rendered accessibility tests cover the polite atomic status, quiet live
  transcript, literal microphone error, and one recovery action.
- Browser checks cover state behavior and containment at 280×568, 640×360, and
  1440×900.

Screenshots:

- [Getting ready, 280×568](../../artifacts/ux-review/voice-state-feedback/getting-ready-280x568.png)
- [Thinking, 280×568](../../artifacts/ux-review/voice-state-feedback/thinking-280x568.png)
- [Trying again, 640×360](../../artifacts/ux-review/voice-state-feedback/trying-again-640x360.png)

The rationale and proposed timing thresholds come from
[Feedback, voice latency, and experience measurement](./feedback-and-latency.md),
with cognitive accessibility support in
[Cognitive accessibility for young beginners](./cognitive-accessibility.md).

## Hand-off

```text
Commit: branch tip (see Git history; this memo is part of that commit)
Tests: 44 focused unit/lifecycle/accessibility checks; 13 Chromium responsive checks; lint; production build
Measured result: immediate pre-response Start acknowledgement; finite retry at every long voice wait
Risks: words and timer budgets have not been validated with children; “Thinking” still relies on readable text
Retain, revise, or reject: retain, subject to representative-device and child comprehension testing
Next question: should a non-reading cue change with “Thinking,” or is the listening Peppa pose understood?
```
