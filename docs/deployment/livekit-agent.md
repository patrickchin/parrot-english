# LiveKit Peppa conversation agent deployment

This runbook deploys the purpose-specific Peppa conversations as two cooperating
services: the existing Cloudflare Worker/D1 application and a LiveKit Node.js
agent. The Worker owns Better Auth, D1 persistence, review, and short-lived room
tokens. The agent owns the realtime voice conversation and finalized transcript
ingest.

Keep the onboarding form alternative available throughout production
operation and rollback.

## Provider and cost dependencies

The runtime uses LiveKit Cloud/WebRTC, LiveKit Agents 1.7, and OpenAI Realtime.
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

The OpenAI Realtime API supports function tools. Both purposes register only
`endConversation` for bounded natural endings. Worker review derives onboarding
profile details from the saved transcript; small chat never writes learner
profile data. The `marin` voice is character-directed; do not replace it with
an exact protected-character voice clone.

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
node --env-file=.env.local agent/index.ts dev
```

The browser must still offer Use the form instead at every realtime error or
stop point.

The Worker sends either `onboarding` or `small-chat` in the signed participant
metadata. The agent selects the matching system prompt, and every conversation
receives `endConversation`. Onboarding profile updates are finalized from the
reviewed conversation state; ordinary small chat never writes learner-profile
data.

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

## LiveKit Cloud agent

The repository-root `Dockerfile` is the LiveKit build file. It uses the npm
lockfile, installs the required CA bundle, and runs as the unprivileged `node`
user.

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

Before deploying, authenticate as a test user and verify:

1. Onboarding and Talk to Peppa each store the matching scenario key and join
   one LiveKit room.
2. Agent playback remains non-interruptible and each manual learner turn is
   committed only after the prior reply finishes.
3. Every agent response stays in English, including the single gentle rephrase.
4. A different child-safe preference than the category asked is recorded and
   followed naturally instead of being treated as off-topic.
5. “I don’t know”, silence, refusal, Finish conversation, and the form fallback
   all remain usable.
6. Each live child turn produces a Realtime Mini reply without a separate
   STT-to-LLM-to-TTS chain or a tool-call round trip.
   Onboarding finalizes the saved prose summary from the transcript after
   Finish; small chat finishes without changing the profile.
7. D1 contains finalized user and assistant turns for completed and abandoned
   sessions, but no raw-audio payload or structured fact rows. LiveKit starts
   with `record: false`.

After each deployment, watch LiveKit agent logs, Worker errors, token issuance
failures, D1 ingest conflicts, session duration, and model usage/cost.

## Rollback

Redeploy the last known-good Worker release. The additive tables do not require
a D1 rollback and saved transcripts remain intact. If the agent version itself
is bad, use `lk agent rollback`.
