# LiveKit Peppa conversation agent deployment

This runbook deploys the purpose-specific Peppa conversations as two cooperating
services: the existing Cloudflare Worker/D1 application and a LiveKit Node.js
agent. The Worker owns Better Auth, D1 persistence, review, and short-lived room
tokens. The agent owns the realtime voice conversation and finalized transcript
ingest.

Realtime conversations are enabled in the production Worker configuration.
Keep the onboarding form fallback available throughout production operation
and rollback.

## Provider and cost dependencies

The runtime uses LiveKit Cloud/WebRTC, LiveKit Agents 1.5, and OpenAI Realtime.
Each conversation can incur agent compute plus usage for:

- `gpt-realtime-2.1-mini` audio input, reasoning, and audio output with the
  `marin` voice; and
- `gpt-4o-mini-transcribe` asynchronous English input transcription for live
  captions and saved conversation turns.

The transcription companion is not part of the reply's critical path: Realtime
Mini listens, reasons, and speaks over one realtime model connection. Keep the
companion enabled because profile finalization and conversation review require
user text. The agent leaves server VAD disabled so the existing turn button
continues to commit each learner turn manually.

The OpenAI Realtime API supports function tools, but these purpose-specific
conversations intentionally register no tools. Onboarding and profile editing
derive their saved profile once from the completed transcript during Worker
review. The `marin` voice is character-directed; do not replace it with an exact
protected-character voice clone.

## Local verification

Install locked dependencies, migrate a local D1 database, and verify both
builds:

```bash
npm ci
npm run db:migrate:local
npm run build
npm run build:agent
```

Copy `.dev.vars.example` to `.dev.vars` for the Worker. Create an untracked
`.env.local` for the agent using `.env.example` as the field list. The Worker
and agent must share the same random `CONVERSATION_AGENT_SECRET`.

Run the Worker-backed application in one terminal:

```bash
npm run dev
```

Run the agent in another terminal:

```bash
node --env-file=.env.local --experimental-strip-types agent/index.ts dev
```

For local investigation, set `REALTIME_CONVERSATIONS_ENABLED=1` in `.dev.vars`.
Return it to `0` before committing. The browser must still offer Use the form
instead at every realtime error or stop point.

The Worker sends one of `onboarding`, `profile-edit`, or `small-chat` in the
signed participant metadata. The agent must select the matching system prompt.
Every purpose starts without tools, keeping each live child turn to one LLM
response. Onboarding and profile editing derive their saved profile once from
the completed transcript during Worker review.

## Cloudflare Worker and D1

Apply the additive conversation migration before deploying the Worker:

```bash
npx wrangler d1 migrations apply parrot-english --remote
npm run build
npm run build:agent
npm run deploy:worker
```

Configure these Worker values without committing their real values:

```bash
npx wrangler secret put LIVEKIT_URL
npx wrangler secret put LIVEKIT_API_KEY
npx wrangler secret put LIVEKIT_API_SECRET
npx wrangler secret put LIVEKIT_AGENT_NAME # parrot-conversation
npx wrangler secret put CONVERSATION_AGENT_SECRET
```

`LIVEKIT_AGENT_NAME` must exactly match the value in the agent's
`.env.livekit`; otherwise rooms wait indefinitely for a nonexistent dispatch
target.

`wrangler.jsonc` keeps `REALTIME_CONVERSATIONS_ENABLED` at `1` for production.
Set it to `0` and redeploy when rolling back the realtime experience.

## LiveKit Cloud agent

The repository-root `Dockerfile` is the LiveKit build file; `agent/Dockerfile`
is kept identical so the runtime remains discoverable beside its source. Both
use the npm lockfile, install the required CA bundle, and run as the unprivileged
`node` user.

Authenticate the current LiveKit CLI, create the deployment once, and deploy
later versions from the repository root:

```bash
lk cloud auth
lk agent create --region us-east --secrets-file=.env.livekit
npm run deploy:agent -- --secrets-file=.env.livekit
```

The Worker and agent deploy wrappers use the same repository commit-count semver
and short Git SHA. The running agent waits for those values and its pinned model
IDs to be stored whenever it starts a conversation, so the account menu's About
panel reflects the builds that actually ran. Production agent images reject
missing or placeholder build metadata.

Do not put the automatically injected `LIVEKIT_URL`, `LIVEKIT_API_KEY`, or
`LIVEKIT_API_SECRET` into `.env.livekit`. The agent secrets file needs only:

```text
LIVEKIT_AGENT_NAME=parrot-conversation
CONVERSATION_INGEST_URL=https://your-worker.example.com
CONVERSATION_AGENT_SECRET=the-same-random-worker-secret
OPENAI_API_KEY=your-openai-api-key
AGENT_REALTIME_MODEL=gpt-realtime-2.1-mini
AGENT_REALTIME_VOICE=marin
AGENT_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
```

The asynchronous transcription companion is pinned to English instead of using
automatic language detection. All model IDs are explicit; production must not
use moving `auto` or `latest` aliases.

LiveKit excludes environment files from the build context and injects secrets
at runtime. Keep `.env.livekit` untracked.

## Smoke test and rollout

Before enabling the flag, authenticate as a test user and verify:

1. Onboarding, profile editing, and Talk to Peppa each store the matching
   scenario key and join one LiveKit room.
2. Speaking over the pig friend stops its playback and the child is not spoken
   over.
3. Every agent response stays in English, including the single gentle rephrase.
4. A different child-safe preference than the category asked is recorded and
   followed naturally instead of being treated as off-topic.
5. “I don’t know”, silence, refusal, Finish conversation, and the form fallback
   all remain usable.
6. Each live child turn produces a Realtime Mini reply without a separate
   STT-to-LLM-to-TTS chain or a tool-call round trip.
   Onboarding and profile editing finalize the saved prose summary from the
   transcript after Finish; small chat finishes without changing the profile.
7. D1 contains finalized user and assistant turns for completed and abandoned
   sessions, but no raw-audio payload or structured fact rows. LiveKit starts
   with `record: false`.

The production Worker deploys with `REALTIME_CONVERSATIONS_ENABLED=1`. After each
deployment, watch LiveKit agent logs, Worker errors, token issuance failures,
D1 ingest conflicts, session duration, and model usage/cost.

## Rollback

Disable `REALTIME_CONVERSATIONS_ENABLED` and redeploy the Worker. This immediately
returns new onboarding visits to the form fallback without deleting transcripts
or requiring a D1 rollback. The additive tables and deployed agent can remain in
place while the incident is investigated. If the agent version itself is bad,
use `lk agent rollback` after disabling the application flag.
