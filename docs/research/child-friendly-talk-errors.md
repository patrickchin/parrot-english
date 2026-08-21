# Child-Friendly Talk Error Recovery

Last reviewed: 2026-08-21  
Branch: `codex/child-friendly-talk-errors`  
Base: `4c54b7f` (`codex/lesson-speech-short-landscape`)
Implementation commit: `1613ba1`

## Question and scope

When Talk to Peppa cannot start, stops unexpectedly, cannot finish, or cannot
repeat audio, what is the smallest truthful message that helps a young beginner
recover without showing server, API, or voice-transport language?

This change covers errors produced by the conversation request and transport
flow in `usePeppaConversation`. It does not change authentication screens,
lesson speech errors, the microphone-permission message, server response
payloads, or provider logging.

## Audience

The default learner is approximately five to seven years old, is new to
English, and may not read English independently. The visible error therefore
cannot assume that the learner knows terms such as API, request, session,
LiveKit, transport, or voice room. The adjacent labelled button remains the
main recovery cue for a non-reader.

## Evidence used

- [A11Y-01](./source-register.md) supports familiar, literal words rather than
  technical or figurative language.
- [A11Y-02](./source-register.md) supports a visible label on the recovery
  control rather than relying on an icon or alert alone.
- [A11Y-03](./source-register.md) supports recognizable status feedback and a
  clear next step.
- [LANG-05](./source-register.md) supports one short, graded instruction. The
  source is teacher guidance, so the exact wording remains a Parrot product
  decision rather than a proven comprehension result.

These sources justify the direction, not the exact sentences. Direct task
observation with children and caregivers is still required.

## Repository finding

The browser API intentionally retained an HTTP status, error code, and server
message in `ConversationApiError`. The conversation hook then used
`error.message` as learner-facing copy. This joined two different needs:
diagnostic detail for adults and developers, and recovery guidance for a child.

The resulting visible strings could include:

- `The conversation request could not be completed.` for an empty or non-JSON
  failed response;
- a server-supplied implementation message such as a missing environment key;
- a browser networking exception such as `Failed to fetch`;
- an arbitrary LiveKit connection or repeat-audio exception; and
- the hard-coded phrase `The voice room disconnected before the conversation
  finished.`

The baseline narrow screenshot shows a friendlier transport fixture, `The
voice room took a break.` It still uses product jargon and a metaphor, and it
does not say which available action to take:

- [Before, transport error at 280×568](../../artifacts/ux-review/child-friendly-talk-errors/before-transport-error-280x568.jpg)

## Decision

Map failures once in the conversation hook, where the failed phase and purpose
are known. Do not change server error payloads or `ConversationApiError`, so
status, code, and message remain available in network inspection and server
diagnostics.

| Failure phase | Learner message | Recovery relationship |
| --- | --- | --- |
| Start request or initial room connection | **Peppa cannot talk now. Tap Try again.** | Names the unavailable outcome and the exact large button |
| Unexpected room disconnect | **The chat stopped. Tap Try again.** | Distinguishes an interruption from successful completion |
| Finish/review, ordinary chat | **The chat did not finish. Tap Finish chat again.** | Reuses the visible control label |
| Finish/review, onboarding | **Your answers did not save. Tap Save and finish again.** | Avoids claiming that profile answers were saved |
| Finish/review, profile editing | **Your changes did not save. Tap Save changes again.** | Avoids claiming that edits were saved |
| Repeat audio | **Peppa could not say that again. Keep talking.** | Does not trap the learner behind a failed optional replay |

The existing microphone mapping remains more specific because permission and
turn state provide reliable recovery information. In particular, permission
denial continues to ask for grown-up help rather than being flattened into a
generic chat error.

### Rejected alternatives

- **Show the raw message under a child summary.** Rejected because it brings
  unpredictable technical text back into the learner's immediate path.
- **Build a large server-code translation table now.** Rejected because current
  response codes do not reliably distinguish offline, configuration, provider,
  and transient failures. Phase-specific recovery is smaller and more truthful.
- **Say that the internet is broken.** Rejected because a server configuration,
  session, or provider failure can look identical from this boundary.
- **Use only “Something went wrong.”** Rejected because it does not say what
  stopped or identify a next action.

## Visual and accessibility validation

The error remains in the existing live alert inside the caption region. The
status remains **Chat paused**, the sad Peppa pose remains visible, and **Try
again** stays the dominant pink action. No new component, dependency, modal, or
layout rule was added.

- [After, transport error at 280×568](../../artifacts/ux-review/child-friendly-talk-errors/after-transport-error-280x568.jpg)
- [After, transport error at 640×360](../../artifacts/ux-review/child-friendly-talk-errors/after-transport-error-640x360.jpg)

Manual Browser measurements found no page overflow at either reviewed size:

| Viewport | Main client / scroll size | Controls | Result |
| --- | --- | --- | --- |
| 280×568 | 280×568 / 280×568 | y 512–560, 48 px high | Alert and both recovery actions remain visible |
| 640×360 | 640×360 / 640×360 | y 304–352, 48 px high | Two-pane error state remains contained |

The final manual-review tab reported no console warnings or errors.

## Automated validation

Accessible browser tests now require that:

- a technical 503 start payload renders only the literal child message;
- an initial transport exception does not expose `voice room` language;
- a technical finish payload names **Finish chat** and hides database/request
  detail; and
- the matching retry control remains visible.

The mounted lifecycle suite also verifies that an unexpected disconnect is not
presented as completion and that a repeat-audio transport exception returns to
the learner turn with child-facing copy.

Final validation passed 611 unit/lifecycle tests and 120 Chromium tests with
four workers. The production build passed. Lint reported zero errors and two
pre-existing unused-disable warnings in generated `worker-configuration.d.ts`.
The implementation commit and hand-off are recorded in the
[improvement backlog](./improvement-backlog.md).

## Measurement and safety guardrails

Retain the change if simulated request/transport failures always expose one
literal next action, never expose arbitrary technical text, and never claim
that unsaved answers were saved. Revise it if child observation shows that the
message and highlighted button are not understood, or if retry loops rise
because a persistent failure needs grown-up help or a non-voice path sooner.

Do not add raw transcript, audio, account identifiers, or fine-grained network
data to measure recovery. A future privacy-reviewed event may record only a
coarse failure phase, whether retry was offered, and whether the learner left or
recovered.

## Limits and next questions

- Start failures of different causes intentionally share one safe message; a
  future grown-up diagnostic surface may need code-specific help.
- The ordinary error state can still show **Finish chat** beside **Try again**
  after a room was created. The primary action is visually dominant, but this
  two-action choice needs direct child observation.
- Repeated retry cannot repair an offline device or persistent provider outage.
  A bounded non-voice practice path remains a separate backlog item.
- The copy is English-only and has not been comprehension-tested with the
  youngest learners or across home languages.

The next cheapest evidence step is a short moderated failure-recovery task:
show the simulated start error without explanation, ask the child what happened
and what they would tap, then repeat with a caregiver nearby and record only
task success and misunderstandings.
