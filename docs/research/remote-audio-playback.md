# Remote Audio Playback Readiness and Honest Feedback

Last reviewed: 2026-08-21

Branch: `codex/first-audible-feedback`

Base: `codex/privacy-safe-experience-events` at `8291916`

Status: implemented and fully validated by the local automated suite; real
LiveKit target-browser/device, accessibility, and child validation pending

## Question and scope

Can Parrot use a browser media event to say when each LiveKit assistant turn
first becomes audible, and how should it recover when browser autoplay blocks
remote audio?

This memo covers the realtime conversation path in which one remote LiveKit
audio track is attached to one long-lived media element. It does not cover
saved lesson audio, microphone permission, speech recognition, or whether a
child understood a spoken line.

## Decision

No `HTMLMediaElement` event establishes per-turn first-audible onset for this
architecture.

`play()` fulfillment, the element's `playing` event, and LiveKit's
`AudioPlaybackStarted` event can support a **session-level browser playback
readiness** milestone. They do not establish that a later assistant utterance
has begun, that the samples are non-silent, that sound left a physical output,
or that a child heard it.

Keep three concepts separate:

| Concept | Honest endpoint | Status |
| --- | --- | --- |
| Assistant response signal | First LiveKit active-speaker, agent-state, or assistant transcript signal after the learner ends a turn | Implemented as `assistant_signal`; not audible output |
| Remote-audio session readiness | The first attached media element emits `playing`, or a known autoplay block is followed by a false→true LiveKit transition or fulfilled gesture-bound `startAudio()` | Implemented for session recovery; not a per-turn metric |
| Physical first audible / heard | Sound leaves the selected output and is perceived by the learner | Not measurable by the current browser events; do not claim or emit it |

Prefer names such as `assistant_signal`, `remote_audio_ready`, or the literal
`media_element_playing`. Do not name either client signal `first_audible`,
`audio_heard`, or `voice_reached_child`.

## Observed Parrot architecture

At the reviewed base commit:

1. `src/conversation/livekit-conversation.ts` handles `trackSubscribed` by
   calling `track.attach()` once, retaining the returned element, and mounting
   it in the document.
2. `defaultMountAudio` marks the element `autoplay` and appends it to the body.
3. The same remote `MediaStreamTrack` remains attached while silence and later
   assistant utterances pass through it. A new turn does not call `attach()` or
   `play()` again.
4. `speech-started` comes from `activeSpeakersChanged` or the remote participant
   attribute `lk.agent.state === "speaking"`.
5. `usePeppaConversation.ts` settles turn-response timing with
   `assistant_signal` when that event or an assistant transcript arrives.
6. The reviewed transport did not expose `Room.canPlaybackAudio`,
   `Room.startAudio()`, or `RoomEvent.AudioPlaybackStatusChanged`, so a blocked
   remote track had no explicit child-facing unlock path.

On `codex/first-audible-feedback`, the implementation now:

1. exposes `blocked` and `ready` room playback-status changes plus `started`
   and `stopped` attachment events to the conversation hook;
2. treats the first attached element's `playing` event as session readiness;
3. deliberately ignores an initial `canPlaybackAudio === true` value as proof
   of playback, because LiveKit 2.20.0 initializes that flag to `true` before an
   observed media play outcome;
4. treats only a known false→true status transition or a fulfilled
   gesture-bound `startAudio()` call as recovery readiness;
5. shows one **Tap for sound** recovery control with a static blocked icon and
   the short pending copy **Starting sound.**;
6. automatically requests one repeat only when assistant output overlapped an
   observed playback block or stop. A late `playing` event without that
   interruption does not infer missed sound and does not replay; and
7. emits one identifier-free startup event for the first `ready` **or**
   `blocked` outcome. A blocked outcome closes that event, so it neither records
   nor times the later recovery.

The installed `livekit-client` version is 2.20.0. Its `Track.attach()` source
creates or reuses a media element, adds the track to a `MediaStream`, enables
autoplay, and calls `element.play()`. It emits `AudioPlaybackStarted` when that
promise fulfills and reports autoplay failure when the promise rejects with
`NotAllowedError`.

This source behavior plus the continuous-stream architecture leads to the
engineering inference that `playing` will normally occur at initial attachment
or after a genuine pause/starvation recovery. The browser is not required to
fire it at the beginning of each later talkspurt.

## Exact browser and LiveKit signal semantics

| Signal | What the source supports | What it does not prove | Parrot use |
| --- | --- | --- | --- |
| `play()` promise fulfilled | The browser resolved that play request. The HTML algorithm may resolve a call on an already-playing element without firing another `playing` event | A new talkspurt, non-silent samples, non-zero effective volume, physical output, or human perception | Session readiness only; never count it as a new turn |
| `playing` | The user agent queued HTML's "notify about playing" steps when `paused` became false with `readyState >= HAVE_FUTURE_DATA`, or when readiness crossed that threshold while `paused` was false; the queued task dispatched the event | A conversational utterance boundary, non-silent samples, physical output, or that the element still has the triggering state when the task runs | Literal diagnostic or first attachment/session readiness only |
| LiveKit `AudioPlaybackStarted` | The `play()` promise used by `Track.attach()` fulfilled | Per-turn speech or physical audibility | Same limit as the play promise |
| LiveKit `Room.canPlaybackAudio` / `AudioPlaybackStatusChanged` | `false` reports a known autoplay block. In v2.20.0 the backing flag starts as `true`; a reported false→true transition can describe recovery | Initial media playback, a later utterance, non-silent output, or hearing | Ignore initial `true`; use known `false` for the prompt and false→true for session recovery |
| Fulfilled LiveKit `Room.startAudio()` | The gesture-bound attempts to play attached media elements and resume the room audio context fulfilled | Per-turn onset, non-silent samples, physical output, or hearing | Session recovery readiness after a known block |
| Parrot transport `started` | The first `playing` event was observed for an attached element | That a specific assistant line started or was heard | Opens session playback readiness once; the name is internal and must be documented literally |
| `canplay` | The user agent estimates it can resume playback | Uninterrupted playback or speech onset | Do not use as a turn endpoint |
| `waiting` | Playback stopped because the next media frame was unavailable | Ordinary silence, a pause between utterances, or a reliable WebRTC failure | Optional diagnostic only after browser testing |
| `stalled` | Fetching a media resource stopped making expected progress | A WebRTC talkspurt boundary or a complete connection diagnosis | Do not use as a child state by itself |
| `timeupdate` / `currentTime` | The continuous media timeline advanced | Non-silent audio; a MediaStream timeline can advance through silence | Do not use as speech detection |
| MediaStreamTrack `mute` / `unmute` | Source availability changed; remote unmute can follow receipt of RTP data | Speech activity or output volume; an unmuted track can carry silence | Connection diagnostic, not turn onset |
| LiveKit agent `speaking` state | The agent is producing an audio-output state for application UI | Browser playout, speaker output, or learner perception | Honest per-turn application signal |
| LiveKit active speaker | SDK activity/energy selection suitable for speaker UI | Exact first sample or physical output | Honest coarse application signal |

The Media Capture specification is decisive on the silence case: consumers of
a muted or disabled audio track receive silence, and a media element can remain
in a playing state while rendering it. Its MediaStream timeline is continuous
and `buffered.length` is always zero, so file-like buffered ranges do not expose
utterance boundaries.

The HTML standard also derives effective media volume from the element,
browser/user override, and system state. A playing element can therefore have
zero effective volume. Browser code cannot establish the selected device's
physical volume, whether Bluetooth or headphones are usable, or whether the
learner listened.

## Rejected first-audible claim

The relevant chain is:

`assistant signal` → received/decoded samples → browser mixer → selected output
→ sound in the room → learner perception

The current LiveKit signal observes the first stage. A media-element
`playing` event observes browser element state near the middle of the chain,
usually once per attachment. Neither observes the last two stages.

Rejected alternatives:

- **Call the first `playing` event first audible.** It is session-scoped and can
  occur while the stream supplies silence.
- **Reset the per-turn timer on `waiting` and end it on `playing`.** Ordinary
  MediaStream silence need not cause either transition, while real starvation
  can cause them outside an utterance boundary.
- **Use `canplay`, `currentTime`, or track `unmute`.** These are readiness,
  continuous-timeline, or source-availability signals, not speech onset.
- **Poll `RTCInboundRtpStreamStats.audioLevel` or a Web Audio analyser.** This
  can estimate received non-silent energy but not device output or hearing. It
  also creates content-derived speech-presence data that is unnecessary for
  the current product question.
- **Depend on `RTCAudioPlayoutStats`.** The current specification marks the
  entire dictionary at risk for lack of consensus; its counters may represent
  mixed device playout rather than one assistant track and still do not prove
  sound in the room.

An external acoustic probe can compare software signals with speaker onset in
a controlled lab. Even that does not prove that a child heard or understood the
line, and it must not become production child monitoring.

## Autoplay recovery contract

Use LiveKit's supported room-level path rather than inferring blockage from a
turn timer:

1. Subscribe to `RoomEvent.AudioPlaybackStatusChanged` before connecting.
2. Treat `room.canPlaybackAudio === false` as a known block. Do not treat its
   initial `true` value as an observed playback success in LiveKit 2.20.0.
3. If false, keep a large, persistent **Tap for sound** button in the normal
   focus order. Do not steal focus.
4. Call `room.startAudio()` directly from that click or tap handler. LiveKit
   documents that the call must occur in a user gesture for browser autoplay
   recovery.
5. On a false→true status transition or fulfilled `startAudio()`, clear the
   blocked prompt. This means only browser/room session recovery readiness.
6. On rejection, return the same **Tap for sound** action and show **Sound did
   not start. Tap again.** Do not show raw exception text.
7. If assistant output overlapped an observed block or attachment stop, request
   one automatic repeat after recovery. Describe the line as **possibly
   interrupted**, not certainly missed or unheard. If the assistant is still
   speaking, wait for its speech-end signal before requesting the repeat.
8. A delayed `playing` event without an observed block or stop must only open
   the learner turn; it must not trigger a repeat.
9. Keep the ordinary **Play again** command available once the learner turn is
   usable because no web event can diagnose system mute, an unusable output
   route, or learner attention.

Recommended internal state names are `audio_ready` and `audio_blocked`. If an
experience event is added, prefer:

```text
conversation_audio_playback {
  surface: "talk" | "learner_profile",
  outcome: "ready" | "blocked",
  durationMs: bounded relative integer
}
```

`started` is less precise than `ready`; in Parrot's transport it means
"an attached media element emitted `playing`." It must not be reused as an
audible or per-turn endpoint.

The implemented `conversation_audio_playback` event is one-shot for each
conversation Start operation. It records whichever outcome is observed first:
session `ready` or known `blocked`. `blocked` settles the timeline; a later
recovery does not emit a second event and its duration is not captured by this
schema.

## Child-facing waiting and recovery copy

Use one short, literal message in a reserved layout area. Pair text with a
stable character pose or familiar icon, but do not rely on color, sound, or
motion alone.

| Situation | Preferred child copy | Reason or limit |
| --- | --- | --- |
| Initial room connection | **Getting ready** | Common words; makes no hearing claim |
| Learner has ended a turn | **Wait for Peppa** | One short action; keep stable during ordinary latency |
| Agent state says speaking | **Peppa's turn** | Describes turn ownership, not audibility |
| Browser blocks remote audio | **Tap for sound** | Clear action without autoplay jargon |
| Recovery tap is pending | **Starting sound.** | Short literal state; keep the control disabled while the one request is active |
| Browser recovery request fulfills | Return to the ordinary turn state | Session readiness only; no need to claim that sound is ready or heard |
| Recovery request remains pending | **Starting sound.** | Current branch adds no timer-based message change; establish a real timeout before adding an escalation |
| Recovery fails | **Sound did not start. Tap again.** | The same **Tap for sound** action remains; comprehension still needs child testing |
| Possibly interrupted line is repeated | Keep the ordinary turn copy | Recovery follows an observed interruption, not proof that the line was missed |
| Learner wants the line again | **Play again** | Familiar, voluntary recovery once the learner turn is usable |

Avoid **Peppa heard you**, **Your words are safe**, **Peppa is making an
answer**, and technical phrases such as **autoplay was blocked**. The first two
make unsupported hearing or privacy promises; the others increase language
load.

Show acknowledgement on the next paint after the action. The general RAIL
guidance treats about 100 ms as immediate, but this is not a child-specific
threshold. Base a later **Still getting ready** transition on representative
latency percentiles and child observation rather than rotating messages on an
arbitrary timer.

Use one pre-existing polite `role="status"` region for meaningful state
changes. The unlock action must remain a real button with the same visible and
accessible name. Reserve its space to avoid layout shift, and do not announce
every LiveKit or media-element event.

Under `prefers-reduced-motion: reduce`, remove bouncing, pulsing, travelling,
and character bobbing from waiting feedback. A static icon and text are enough.
Outside reduced-motion mode, moving, blinking, or scrolling content that starts
automatically, lasts more than five seconds, and appears beside other content
needs a pause, stop, or hide mechanism under WCAG 2.2.2 unless essential. The
cheapest safe design is not to use an endless decorative animation.

## Privacy boundary

Follow the existing identifier-free event boundary in
[Privacy-safe experience events](./privacy-safe-experience-events.md):

- use a same-context monotonic clock and emit only bounded, rounded relative
  duration;
- allow only a fixed surface, a fixed `ready`/`blocked` outcome, and duration;
- keep startup playback readiness separate from per-turn
  `conversation_turn_response { outcome: "assistant_signal" }`;
- do not add room, participant, track, speech, turn, device, sink, account, or
  session identifiers;
- do not emit wall-clock timestamps, `timeOrigin`, routes, URLs, user-agent or
  screen details, raw errors, ICE data, complete WebRTC stats, audio levels,
  energy histories, samples, transcripts, or child correctness;
- emit no production data until the existing field-sink gate is satisfied;
- cancel stale operation timelines and never let instrumentation block a
  conversation.

Autoplay blockage is useful as a coarse, actionable outcome. The implemented
one-shot event answers whether the first startup observation was session-ready
or known-blocked; it does **not** answer whether the prompt was shown, whether
the child used it, or whether recovery succeeded or how long recovery took.
Speech energy, output-device detail, and an alleged per-turn audible timestamp
are not necessary for this boundary.

## Browser and accessibility test matrix

Use generated or synthetic adult audio, never recorded child speech, for the
technical matrix.

| Scenario | Required observations | Passing behavior |
| --- | --- | --- |
| LiveKit starts with `canPlaybackAudio === true` | Initial value, room status events, first element `playing` | Initial `true` alone neither records readiness nor opens the learner turn |
| Autoplay permitted on initial attach | `play()` result, `playing`, LiveKit playback status, `canPlaybackAudio`, UI state | No unlock prompt; readiness is recorded at most once for the startup attempt |
| Initial stream attached before agent speaks | Same observations plus first agent signal | No claim that initial `playing` is the later utterance's onset |
| Three utterances on one long-lived track | All media events and three agent signals | Every turn uses `assistant_signal`; no turn waits for a new `playing` event |
| Autoplay blocked | Rejection/status event and prompt timing | Stable **Tap for sound** button appears without focus theft or layout shift |
| Tap recovery succeeds | Direct-handler `startAudio()`, room state, replay availability | Prompt clears, readiness is session-scoped, and one repeat occurs only if output overlapped an observed block/stop |
| Tap recovery fails | Rejection path | The same **Tap for sound** action returns with short fixed copy; no raw error or endless spinner |
| RTP starvation and recovery | `waiting`, `playing`, connection state, agent state | Recovery is not mislabeled as a new assistant turn |
| Reconnect with same track | Attachment identity and event order | No duplicate elements/listeners; readiness naming remains session/attachment scoped |
| Reconnect with replacement track | Detach/attach, autoplay state, prompt | Old element removed and a new blocked state can recover honestly |
| Background/foreground | Media and room events | No false first-audible event or repeated live-region chatter |
| System volume zero / muted site / Bluetooth route | Browser-visible state only | UI does not claim the line was heard; replay remains available |
| Reduced motion | Computed presentation and state changes | No nonessential spatial or pulsing wait animation |
| VoiceOver, TalkBack, NVDA, keyboard | Announcement count, focus, button access | One polite state announcement; unlock is discoverable and operable |

The branch's automated checks cover state transitions, event allowlists,
stale-operation handling, rapid-tap coalescing, and the narrow/short-landscape
presentation with a **synthetic conversation transport in local Chromium**.
They validate Parrot's logic and rendered UI, not a real LiveKit WebRTC stream,
browser autoplay policy, physical speakers, cross-browser event ordering,
screen-reader output, or child comprehension. Final branch validation passed
653/653 unit/lifecycle/safety tests in 90 suites, 172/172 local Chromium tests
in 13 files, lint with zero errors and the same two generated-file warnings,
and the production build.

Run at minimum on Chrome Android, iOS Safari, macOS Safari, and current desktop
Chrome, Edge, and Firefox. Record browser and LiveKit versions with results.
Specifications define semantics, not identical event ordering across all these
implementations.

## Evidence and source limits

See [VOICE-01 through VOICE-09, A11Y-09, LANG-09, PERF-02, and
PERF-03](./source-register.md).

- WHATWG and W3C specifications establish event and stream semantics; they do
  not prove current interoperability for Parrot's exact LiveKit sequence.
- LiveKit v2.20.0 source matches the installed dependency. Current LiveKit docs
  may describe a later SDK release, so use them for the supported recovery
  contract and verify the installed API in tests.
- Browser autoplay policy pages document platform policy, not a guarantee that
  every embedded, installed, or enterprise configuration behaves identically.
- CEFR Pre-A1 and W3C cognitive guidance support short literal instructions,
  but neither validates these exact words with five-year-old multilingual
  learners.
- The 100 ms RAIL target describes general perceived responsiveness, not a
  child-development standard.
- Privacy and children's-design guidance informs conservative defaults; this
  memo is not legal advice or a DPIA.

## Remaining research

1. Determine whether audio sent before a successful `startAudio()` is discarded,
   queued, or partially rendered on each target browser. Revisit whether the
   current one-repeat-on-observed-interruption rule is the right recovery.
2. Log event order for an initially silent LiveKit stream, codec DTX, packet
   starvation, reconnect, tab suspension, and output-route changes.
3. Compare `assistant_signal` with an external acoustic probe in a controlled
   lab to describe latency distribution. Keep that probe and raw traces out of
   production and away from child sessions.
4. Co-design and comprehension-test **Tap for sound**, **Starting sound.**, and
   **Play again** with children aged 4–5 and 6–8 across representative first
   languages, with caregiver assistance for the youngest group.
5. Test screen-reader announcement volume and prompt discovery with VoiceOver,
   TalkBack, and NVDA.
6. Establish representative-device latency percentiles before choosing a slow
   feedback threshold or an SLO for session playback readiness.

## Implementation hand-off

```text
Branch: codex/first-audible-feedback
Base branch / dependency: codex/privacy-safe-experience-events at 8291916
Commit: 5178822
Decision: reject per-turn first-audible measurement from HTMLMediaElement events; retain assistant_signal and add only session playback readiness/autoplay recovery
Changed: LiveKit playback-status/startAudio and mounted-element playing events; a Tap for sound recovery state with static blocked feedback and "Starting sound."; interruption-gated one-repeat recovery; exact-key one-shot startup event; lifecycle, transport, UI, and local Chromium contracts; research records
Signal semantics: initial LiveKit true is ignored; first element playing, known false→true, or fulfilled gesture-bound startAudio means session readiness; blocked settles the event; delayed playing without interruption never replays
Privacy: fixed surface/outcome/bounded duration only; the event records first ready OR blocked, not recovery; no sink enabled, identifiers, content, audio analysis, raw stats, or output-device data
Not changed: LiveKit dependency, production event sink or retention, audio output route, physical-audibility measurement, legal status, or direct child/caregiver research
Tests: 653/653 unit/lifecycle/safety tests passed in 90 suites (~2.45 seconds); 172/172 Chromium tests passed in 13 files (~30 seconds); lint passed with 0 errors and the same 2 generated-file warnings
Final build: passed; core index-67RCCEkF.js is 491.37 kB raw / 148.36 kB gzip; ConversationSurface-BWl6fnDQ.js is 15.68 kB raw / 5.24 kB gzip
Screenshots / traces: five JPGs — artifacts/ux-review/remote-audio-playback/blocked-280x568.jpg; artifacts/ux-review/remote-audio-playback/blocked-640x360.jpg; artifacts/ux-review/remote-audio-playback/starting-sound-280x568.jpg; artifacts/ux-review/remote-audio-playback/failed-280x568.jpg; artifacts/ux-review/remote-audio-playback/recovered-280x568.jpg — all are local Chromium screenshots driven by a synthetic conversation transport, not real WebRTC/autoplay interoperability evidence
Measured result: synthetic validation distinguishes the known blocked, gesture-pending, rejected-recovery, and recovered states; readiness gates the learner turn; automatic replay requires an observed block/stop overlapping assistant output; the one-shot event preserves the identifier-free boundary
Risks / limitations: real LiveKit event order, actual browser autoplay, queued-versus-dropped audio, system output, screen readers, representative devices, and child comprehension remain untested
Retain, revise, or reject: retain the signal distinction; revise copy and thresholds after child research
Next action: run the target browser/device/accessibility matrix, then observe children and caregivers without labeling playing/startAudio as per-turn, non-silent, physical output, or proof a child heard
```
