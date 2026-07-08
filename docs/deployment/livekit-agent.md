# LiveKit onboarding agent deployment

This runbook deploys the bounded onboarding conversation as two cooperating
services: the existing Cloudflare Worker/D1 application and a LiveKit Node.js
agent. The Worker owns Better Auth, D1 persistence, review, and short-lived room
tokens. The agent owns speech recognition, the constrained conversation loop,
speech synthesis, and finalized transcript ingest.

The rollout flag defaults to off. Keep the form fallback available throughout
preview and production rollout.

## Provider and cost dependencies

The runtime uses LiveKit Cloud/WebRTC and LiveKit Agents 1.5 with LiveKit
Inference. Each conversation can incur agent compute plus usage for:

- `elevenlabs/scribe_v2_realtime` speech recognition;
- `openai/gpt-4.1-mini` language-model tokens; and
- `inworld/inworld-tts-2` speech synthesis with the upbeat British voice
  `Olivia`, with `cartesia/sonic-3` as a managed cross-provider fallback.

Confirm that all three model/voice combinations are enabled in the target
LiveKit project before enabling the flag. The voice is character-directed; do
not replace it with an exact protected-character voice clone.

The first production smoke test rejected ElevenLabs v3 for realtime use: the
model is deprecated in LiveKit Inference and its WebSocket stream repeatedly
errored after partial audio. Saved Chinese assets still follow the repository's
ElevenLabs rule; the realtime agent uses Inworld through LiveKit Inference and
falls back to Cartesia when a provider stream is unavailable.

The current agent is deployed in `us-east`. The same managed TTS models worked
from a direct project-credential check but failed inside the initial `ap-south`
Cloud agent, so retain this region while that provider-path difference remains
unexplained.

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

For local investigation, set `REALTIME_ONBOARDING_ENABLED=1` in `.dev.vars`.
Return it to `0` before committing. The browser must still offer Use the form
instead at every realtime error or stop point.

## Cloudflare Worker and D1

Apply the additive conversation migration before deploying the Worker:

```bash
npx wrangler d1 migrations apply parrot-english --remote
npm run build
npm run build:agent
npx wrangler deploy --config wrangler.jsonc
```

Configure these Worker values without committing their real values:

```bash
npx wrangler secret put LIVEKIT_URL
npx wrangler secret put LIVEKIT_API_KEY
npx wrangler secret put LIVEKIT_API_SECRET
npx wrangler secret put CONVERSATION_AGENT_SECRET
```

`wrangler.jsonc` keeps `REALTIME_ONBOARDING_ENABLED` at `0`. Enable it only in a
reviewed preview or production deployment after the agent smoke test.

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
lk agent deploy
```

Do not put the automatically injected `LIVEKIT_URL`, `LIVEKIT_API_KEY`, or
`LIVEKIT_API_SECRET` into `.env.livekit`. The agent secrets file needs only:

```text
CONVERSATION_INGEST_URL=https://your-worker.example.com
CONVERSATION_AGENT_SECRET=the-same-random-worker-secret
AGENT_STT_MODEL=elevenlabs/scribe_v2_realtime
AGENT_LLM_MODEL=openai/gpt-4.1-mini
AGENT_TTS_MODEL=inworld/inworld-tts-2
AGENT_TTS_VOICE_ID=Olivia
```

LiveKit excludes environment files from the build context and injects secrets
at runtime. Keep `.env.livekit` untracked.

## Smoke test and rollout

Before enabling the flag, authenticate as a test user and verify:

1. Start creates one D1 conversation and joins one LiveKit room.
2. Speaking over the pig friend stops its playback and the child is not spoken
   over.
3. English works first; only the single gentle rephrase contains a brief Chinese
   hint.
4. “I don’t know”, silence, refusal, typed input, Finish now, and the form
   fallback all remain usable.
5. The summary can edit, accept, or reject extracted facts and then reaches the
   existing onboarding completion/bypass path.
6. D1 contains finalized user and assistant turns for completed and abandoned
   sessions, but no raw-audio payload. LiveKit starts with `record: false`.

After the smoke test, deploy the Worker with
`REALTIME_ONBOARDING_ENABLED=1`. Watch LiveKit agent logs, Worker errors, token
issuance failures, D1 ingest conflicts, session duration, and model usage/cost.

## Rollback

Disable `REALTIME_ONBOARDING_ENABLED` and redeploy the Worker. This immediately
returns new onboarding visits to the form fallback without deleting transcripts
or requiring a D1 rollback. The additive tables and deployed agent can remain in
place while the incident is investigated. If the agent version itself is bad,
use `lk agent rollback` after disabling the application flag.
