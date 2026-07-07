# Realtime Conversation Foundation and Voice Onboarding Design

**Date:** 2026-07-08
**Status:** Approved for implementation

## Supersedes

This design supersedes the primary experience decisions in:

- `2026-07-05-voice-onboarding-questionnaire-design.md`; and
- `2026-07-06-flexible-playful-onboarding-design.md`.

The existing form-based onboarding remains as an accessible fallback and
rollout safety net. Existing Better Auth, Drizzle, D1, profile, routing, and
onboarding code is the implementation base rather than a missing dependency.

## Goal

Introduce a reusable realtime conversation foundation and use it first for a
short, child-friendly onboarding conversation. A warm, playful pig friend gets
to know the learner through natural speech without becoming a general chatbot.
The child can interrupt, type instead of speaking, stop early, skip a topic, or
say that they do not know.

The first scenario tries to learn the child's name and age, then explores at
most three optional interests. Name and age are the only facts required for a
completed learner profile. They are not required to finish the conversation or
open the lesson for the current authenticated session.

The deployed investigation must use the real application boundaries:

- Better Auth sessions;
- the production-shaped Cloudflare Worker;
- Drizzle-managed D1 persistence;
- a private LiveKit WebRTC room;
- a separately deployed TypeScript LiveKit agent; and
- the React application and its existing route gates.

## Approved Product Decisions

- Use LiveKit Agents rather than direct browser-to-model Realtime WebRTC.
- Build shared conversation transport, UI, transcript, and scenario contracts
  so later finite conversation features can reuse them.
- Do not add a general-purpose or open-ended conversation scenario.
- Use a single bounded onboarding scenario, implemented as a custom stable
  `AgentTask`; do not depend on experimental `TaskGroup` APIs.
- Ask natural questions rather than walking a fixed questionnaire definition.
- Try to collect name and age, then have no more than three optional interest
  exchanges.
- End sooner when the child wants to stop, stays silent, declines, or is unsure.
- Allow one initial question and at most one light rephrase for an objective.
- Speak English first. A single rephrase may include one brief Chinese rescue
  hint when the child appears confused.
- Acknowledge unrelated input briefly and bridge back instead of answering as
  a general assistant.
- Keep microphone capture active during agent speech so genuine barge-in stops
  playback immediately.
- Use LiveKit turn detection plus VAD/semantic endpointing to avoid speaking
  over the child or treating every short pause as a completed turn.
- Use an ElevenLabs character-directed voice when supported through the chosen
  LiveKit pipeline. Do not claim to be, imitate, or clone an exact protected
  character or voice.
- Save every finalized user and assistant transcript turn, including turns in
  stopped, failed, disconnected, and abandoned sessions.
- Extract useful facts separately from the transcript. Only facts accepted or
  edited in the summary update the canonical learner profile.
- Never persist raw audio.
- Keep the current form onboarding available behind a server-controlled
  realtime rollout flag and as the permanent non-voice fallback.

## Current Foundation

Remote `main` already provides:

- Better Auth 1.6 with same-origin cookie sessions;
- Drizzle ORM and generated D1 migrations;
- the production `DB` binding;
- authenticated Worker routing and rate limits;
- `AuthGate -> OnboardingGate -> LessonExperience` composition;
- `learner_profile`, skip/resume, and profile editing;
- the checked-in v2 form onboarding definition;
- Groq transcription and structured answer enrichment; and
- ElevenLabs-generated prompts and acknowledgments.

The implementation extends these boundaries. It does not create another user,
session, profile, or database mechanism.

## Experience

### Entry

An authenticated learner with incomplete onboarding is routed to the existing
`/onboarding` gate. When realtime onboarding is enabled, the gate shows:

- the pig host illustration;
- a concise text notice that the conversation transcript is saved;
- a Start button that unlocks microphone and audio playback;
- a permanent “Type instead” path; and
- the existing skip/bypass action.

The browser does not request LiveKit credentials or microphone access before an
explicit user action.

### Conversation

The conversation controller moves through these finite phases:

```text
connecting -> introduction -> core facts -> optional interests -> closing
                                      \-> early closing
```

The agent starts with a short introduction. It may learn name and age in either
order when the child volunteers them naturally. It then explores up to three
interest topics chosen from bounded, child-appropriate categories such as
animals, cartoons, stories, activities, music, or food. A follow-on question
may depend on the child's last answer, but it still consumes one of the three
optional exchanges.

For each active objective:

1. Ask one short question.
2. If the response is unclear, silent, uncertain, or apparently misunderstood,
   either accept that outcome or make one gentle rephrase.
3. The rephrase may contain one short Chinese hint.
4. After that turn, accept the answer or mark the objective unanswered and move
   on.

The agent never asks the same objective a third time. “I don't know,” refusal,
silence, and explicit stop are valid outcomes. An unrelated request receives
one short acknowledgement followed by a return to the active objective or an
early close.

### Barge-in and endpointing

The LiveKit session listens while the agent speaks. When VAD/turn detection
identifies genuine child speech, the agent output is interrupted and its
conversation history is truncated to the portion actually heard. Semantic and
acoustic end-of-turn detection waits through natural hesitation while retaining
a bounded endpointing timeout.

The UI reflects `connecting`, `listening`, `thinking`, `speaking`, `interrupted`,
`reconnecting`, and `ended` states without relying on animation alone.

### Summary and lesson entry

At the warm closing, or after “Finish now,” the UI shows:

- the complete saved transcript;
- editable candidate name and age;
- up to three editable optional interests; and
- Accept, Reject, and Continue later actions.

Accepted facts update the learner profile in one server transaction. If valid
name and age are present, onboarding becomes completed. Otherwise it remains
in progress and the existing exact-session bypass permits lesson entry for the
current session. Incomplete onboarding can be offered again later.

## Reusable Architecture

```text
React browser
  |-- AuthGate / OnboardingGate
  |-- ConversationSurface
  |      |-- LiveKit room connection
  |      |-- microphone + audio output
  |      |-- captions + typed input
  |      `-- summary review
  |
  `-> Cloudflare Worker
         |-- Better Auth session
         |-- conversation start/read/review APIs
         |-- short-lived LiveKit participant token
         |-- agent-only transcript/fact ingest APIs
         `-- Drizzle -> shared D1

LiveKit Cloud room <-> TypeScript agent server
                         |-- shared ConversationRuntime
                         |-- scenario registry
                         |-- GettingToKnowYouTask
                         |-- streaming STT
                         |-- constrained tool-capable LLM
                         |-- ElevenLabs TTS
                         `-- turn detector + VAD
```

### Browser modules

`ConversationSurface` owns only generic realtime presentation and controls:

- connect/disconnect/reconnect;
- microphone enablement and mute;
- text input over LiveKit's text channel;
- visible captions and transcript state;
- manual interrupt and Finish now;
- connection and provider errors; and
- summary review.

Scenario-specific copy and summary fields arrive from a typed scenario
descriptor. The component does not contain onboarding question logic.

### Worker modules

The Worker owns authenticated application state:

- create a conversation session for the current Better Auth user;
- mint a short-lived, room-scoped LiveKit participant token;
- return only public LiveKit connection information to the browser;
- accept idempotent transcript and candidate-fact events from the agent;
- load only sessions owned by the authenticated user;
- apply accepted facts to `learner_profile`; and
- preserve the current session-bypass semantics.

The Worker and agent share a long-lived service secret stored only in their
deployment environments. The browser never receives it. Agent ingest requests
are also scoped to an existing conversation session and use idempotency keys.

### Agent modules

`ConversationRuntime` owns LiveKit and model plumbing that every scenario may
reuse. A `ConversationScenario` defines:

- scenario key and version;
- system instructions;
- permitted tools and schemas;
- initial state;
- transition and completion policy;
- candidate-fact schema; and
- UI summary descriptor.

The initial `onboarding.get-to-know-you` scenario implements the approved
limits. It exposes only tools for recording a bounded candidate fact, marking
an objective unanswered, advancing the finite controller, and finishing the
session. It has no web, retrieval, MCP, handoff, or arbitrary action tools.

The controller, not prompt prose alone, enforces maximum topic and rephrase
counts. Tool executors reject invalid transitions and finish the session once a
terminal state is reached.

## LiveKit and Model Configuration

Use the current `@livekit/agents` Node.js SDK and `livekit-client` browser SDK.
The agent runs as its own process and is not bundled into the Cloudflare
Worker. The first deployment uses LiveKit Inference for the STT-LLM-TTS
pipeline so model providers remain configuration rather than application
architecture.

Required agent configuration includes:

```text
LIVEKIT_URL
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
AGENT_STT_MODEL
AGENT_LLM_MODEL
AGENT_TTS_MODEL
AGENT_TTS_VOICE_ID
CONVERSATION_INGEST_URL
CONVERSATION_AGENT_SECRET
```

The Cloudflare Worker receives the matching LiveKit URL/key/secret and agent
ingest secret as server-only bindings or secrets.

The initial provider compatibility check must prove:

- streaming English transcription with short Mandarin rescue responses;
- a low-latency tool-capable LLM;
- ElevenLabs streaming TTS;
- support for the approved Summer voice ID (`Oqy85UMasXzUjUxF0ta5`) or selection
  of another supported character-directed voice;
- correct interruption and transcript truncation; and
- acceptable end-to-end latency on a child-paced conversation.

Model identifiers remain deployment configuration because LiveKit Inference
model availability changes independently of application releases. The deployed
environment must pin explicit identifiers; it must not use an implicit “latest”
model.

LiveKit session recording is disabled with `record: false`; raw room audio is
not retained by the application. Normal operational logs and model-usage
metrics remain available for deployment diagnostics. Application transcript
persistence is handled by D1 rather than relying on LiveKit recordings.

## Data Model

Drizzle adds the following tables and generates the next reviewed migration.

### `conversation_session`

```text
id                  TEXT PRIMARY KEY
auth_user_id        TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
scenario_key        TEXT NOT NULL
scenario_version    INTEGER NOT NULL
room_name           TEXT UNIQUE NOT NULL
status              TEXT NOT NULL
finish_reason       TEXT
controller_state    TEXT NOT NULL
started_at          INTEGER NOT NULL
ended_at            INTEGER
created_at          INTEGER NOT NULL
updated_at          INTEGER NOT NULL
```

`status` is restricted to `starting`, `active`, `completed`, `stopped`,
`disconnected`, `failed`, or `abandoned`. `controller_state` is valid JSON and
contains only bounded scenario state, not audio.

### `conversation_turn`

```text
id                  TEXT PRIMARY KEY
conversation_id     TEXT NOT NULL REFERENCES conversation_session(id) ON DELETE CASCADE
provider_item_id    TEXT NOT NULL
sequence            INTEGER NOT NULL
role                TEXT NOT NULL
text                TEXT NOT NULL
language            TEXT
input_mode          TEXT NOT NULL
interrupted         INTEGER NOT NULL DEFAULT 0
started_at          INTEGER
ended_at            INTEGER
created_at          INTEGER NOT NULL
```

Unique constraints cover `(conversation_id, provider_item_id)` and
`(conversation_id, sequence)`. `role` is `user` or `assistant`; `input_mode` is
`voice` or `text`. Streaming deltas are not individual rows. Finalized turns
and the heard portion of an interrupted assistant turn are durable.

### `conversation_fact`

```text
id                  TEXT PRIMARY KEY
conversation_id     TEXT NOT NULL REFERENCES conversation_session(id) ON DELETE CASCADE
fact_key            TEXT NOT NULL
value_json          TEXT NOT NULL
source_turn_ids     TEXT NOT NULL
status              TEXT NOT NULL
created_at          INTEGER NOT NULL
updated_at          INTEGER NOT NULL
```

`value_json` and `source_turn_ids` must contain valid JSON. `status` is
`candidate`, `accepted`, `edited`, or `rejected`. The onboarding scenario
allows `name`, `age`, and a maximum of three `interest` candidates.

Accepted name and age update the existing canonical columns. Accepted optional
facts remain durable, queryable `conversation_fact` rows. Realtime review does
not add keys to the strict v2 `learner_profile.answers_json` envelope, so the
existing form and profile editor remain backward compatible.

## API Contracts

### Authenticated browser APIs

- `POST /api/conversations` creates an onboarding conversation for the current
  session and returns `{ conversation, livekit: { url, participantToken },
  scenario }`.
- `GET /api/conversations/:id` returns the owned session, ordered transcript,
  candidates, and summary state.
- `POST /api/conversations/:id/finish` records an explicit Finish now request
  and asks the agent session to close.
- `PUT /api/conversations/:id/review` accepts edited fact decisions, applies
  valid profile updates atomically, and returns completion/bypass status. The
  browser refreshes the existing onboarding gate after success.

The existing `GET /api/onboarding` response gains an experience mode so the
server-controlled rollout can select `realtime` or `form` without trusting a
client flag.

### Agent-only APIs

- `POST /api/conversations/:id/turns` appends one idempotent finalized turn.
- `POST /api/conversations/:id/facts` upserts bounded candidate facts and
  controller state.
- `POST /api/conversations/:id/end` records the terminal status and finish
  reason.

Agent routes reject cookie authentication and require the dedicated service
secret. Payload, text, array, and batch sizes are bounded.

## Transcript and Fact Semantics

All finalized and recoverable turns are saved, even when the conversation does
not complete. The transcript is not the canonical learner profile. A hard
disconnect may lose the final untranscribed audio fragment because preserving
it would require raw-audio storage.

Candidate facts include source turn IDs. The summary UI can edit, accept, or
reject them. Review is authoritative; agent confidence is not. Raw transcripts
are not automatically injected into later scenarios. Future scenario access to
history requires an explicit design decision.

## Accessibility and Fallbacks

- Every agent utterance has a visible caption.
- Typed input is available before and throughout the session.
- Microphone denial never blocks onboarding.
- Start, mute, stop, replay/interrupt, type, retry, and finish controls have
  accessible names and visible focus styles.
- State changes use polite live regions; urgent failures use alerts.
- Reduced motion disables decorative animation.
- The current form experience remains available when the rollout flag is off,
  LiveKit connection fails, or the learner chooses the form explicitly.
- A TTS failure degrades to captions and typed interaction.
- A persistence failure stops advancement, preserves local visible state, and
  offers a bounded retry instead of silently dropping turns.

## Rollout

The Worker owns `REALTIME_ONBOARDING_ENABLED`. The first release defaults the
flag off in production and on in an explicitly configured preview/staging
environment. When enabled, a learner may still choose the form fallback.

Implementation lands in three focused layers:

1. conversation schema, repository, authenticated Worker contracts, and
   feature-flag response;
2. shared browser surface plus LiveKit Node runtime and deployment files; and
3. the bounded onboarding scenario, summary review, and gate integration.

No existing form onboarding endpoint or data is removed in this release.

## Testing and Verification

Implementation follows test-first development.

### Pure and agent tests

- finite phase transitions;
- name/age in either order;
- maximum three optional exchanges;
- maximum one rephrase per objective;
- Chinese hint only in the allowed rephrase;
- silence, uncertainty, refusal, stop, and off-topic behavior;
- terminal-state tool rejection;
- candidate-fact limits and schemas; and
- transcript truncation semantics after interruption.

### Worker and persistence tests

- anonymous browser route rejection;
- cross-user session rejection;
- service-secret enforcement for agent routes;
- short-lived room-scoped token claims;
- transcript ordering and idempotency;
- partial and abandoned session persistence;
- candidate review and atomic profile updates;
- existing session bypass behavior when name or age is missing;
- migration constraints and cascade deletion; and
- server-owned rollout mode.

### UI tests

- explicit start and microphone permission;
- captions, typed input, mute, interrupt, finish, and retry;
- fallback selection and LiveKit failure recovery;
- connection-state accessibility;
- summary editing and acceptance; and
- stale session/event isolation.

### Deployed smoke test

Using a real authenticated preview deployment and LiveKit agent, verify:

- room connection and agent dispatch;
- child-paced endpointing;
- barge-in while the agent is speaking;
- false-interruption recovery;
- English transcription and brief Chinese hint output;
- ElevenLabs voice compatibility and latency;
- transcript/fact persistence in D1;
- reconnect and Finish now; and
- form fallback.

Final repository verification runs focused tests, the full unit suite, lint,
TypeScript checks, the Vite/Worker production build, and the agent build. The
external deployed smoke test is reported separately because it requires
LiveKit credentials and deployed secrets.

## Cost and Provider Dependencies

LiveKit Cloud bills deployed agent sessions by connected minute after plan
allowances and bills inference separately. Current public pricing lists agent
sessions at approximately `$0.01/min` beyond included usage. ElevenLabs and
other model costs depend on the pinned LiveKit Inference choices.

Required external state:

- a LiveKit Cloud project;
- a deployed LiveKit agent;
- LiveKit URL, API key, and API secret;
- matching Worker and agent ingest secrets; and
- supported pinned STT, LLM, TTS, and voice identifiers.

The repository can implement and verify all local contracts without those
secrets. A real deployed smoke test remains blocked until they are configured.

## Out of Scope

- A general voice chatbot
- More than one active scenario in the initial UI
- More than three optional onboarding interests
- Web search, RAG, MCP tools, or agent handoffs
- Raw-audio storage or recording playback
- Exact protected-character impersonation or voice cloning
- Removing the existing form onboarding
- Reworking unrelated lesson voice flows
- An admin UI for transcripts or conversation scenarios
- Automatic use of transcript history in later scenarios

## References

- [LiveKit Agents](https://docs.livekit.io/agents/)
- [LiveKit tasks](https://docs.livekit.io/agents/logic/tasks/)
- [LiveKit turn detection and interruptions](https://docs.livekit.io/agents/logic/turns/)
- [LiveKit agent server lifecycle](https://docs.livekit.io/agents/server/)
- [LiveKit ElevenLabs TTS](https://docs.livekit.io/agents/models/tts/elevenlabs/)
- [LiveKit observability recording controls](https://docs.livekit.io/deploy/observability/insights/#recording-options)
- [LiveKit pricing](https://livekit.io/pricing)
- [Drizzle ORM with Cloudflare D1](https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1)
