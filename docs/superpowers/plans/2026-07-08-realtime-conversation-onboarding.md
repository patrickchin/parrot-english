# Realtime Conversation Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the primary fixed-form onboarding path with a reusable, bounded LiveKit voice conversation while preserving the authenticated D1-backed form fallback.

**Architecture:** Extend the existing Better Auth/Drizzle/Worker boundary with conversation tables and authenticated start/review plus agent-only ingest APIs. Add a generic React conversation surface and a separately built TypeScript LiveKit agent whose onboarding `AgentTask` uses a pure finite controller to cap rephrases and optional topics.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Cloudflare Workers, Better Auth, Drizzle/D1, LiveKit Client 2.20, LiveKit Server SDK 2.16, LiveKit Agents 1.5, Zod 4, Node test runner.

---

## File map

New focused units:

- `lib/conversation-scenario.js`: provider-independent onboarding state and transition rules.
- `worker/conversation-repository.ts`: Drizzle persistence for sessions, turns, candidates, review, and exact-session bypass.
- `worker/livekit-token.ts`: short-lived room-scoped participant-token creation.
- `worker/conversations.ts`: authenticated browser and service-authenticated agent HTTP contracts.
- `src/conversation-api.ts`: typed browser API client.
- `src/livekit-conversation.ts`: small `livekit-client` adapter that owns room/media/text events.
- `src/ConversationSurface.tsx`: generic accessible realtime UI and summary review.
- `agent/config.ts`: required environment parsing with explicit model IDs.
- `agent/ingest-client.ts`: bounded authenticated Worker persistence client.
- `agent/onboarding-scenario.ts`: LiveKit `AgentTask`, tools, prompts, and controller bridge.
- `agent/index.ts`: LiveKit agent server entrypoint.
- `tsconfig.agent.json`: Node-only agent build.
- `agent/Dockerfile`: reproducible LiveKit agent image.

Existing integration points:

- `src/db/schema.ts`: additive conversation models and relations.
- `worker/index.ts`: route conversations after browser/session or agent authentication.
- `worker/onboarding.ts`: expose the server-owned experience mode.
- `src/onboarding-api.ts`: model `experienceMode`.
- `src/OnboardingGate.tsx`: select realtime or current form and refresh after review.
- `src/styles.css`: conversation surface layout and state styling.
- `.dev.vars.example`, `wrangler.jsonc`, `package.json`, `package-lock.json`: runtime configuration and commands.

## Task 1: Finite onboarding scenario controller

**Files:**

- Create: `lib/conversation-scenario.js`
- Create: `tests/conversation-scenario.test.mjs`

- [ ] **Step 1: Write failing state-transition tests**

Cover the contract with table-driven assertions:

```js
const state = createOnboardingConversationState();
assert.equal(state.phase, "core");
assert.equal(state.activeObjective, "name");

const afterName = applyConversationObservation(state, {
  outcome: "answered",
  facts: [{ key: "name", value: "Mia" }],
});
assert.equal(afterName.activeObjective, "age");

const rephrased = applyConversationObservation(afterName, {
  outcome: "unclear",
  facts: [],
});
assert.equal(rephrased.rephraseCount.age, 1);
assert.equal(nextConversationPrompt(rephrased).includeChineseHint, true);

const skipped = applyConversationObservation(rephrased, {
  outcome: "unclear",
  facts: [],
});
assert.equal(skipped.activeObjective, "interest");
assert.equal(skipped.optionalExchangeCount, 0);
```

Also assert that three completed interest exchanges force `phase: "closing"`,
terminal states reject further transitions, stop/silence/refusal can close
early, and facts outside `name`, `age`, or `interest` are rejected.

- [ ] **Step 2: Run the controller test and confirm failure**

Run:

```bash
node --test tests/conversation-scenario.test.mjs
```

Expected: failure because `lib/conversation-scenario.js` does not exist.

- [ ] **Step 3: Implement immutable controller helpers**

Export these exact functions:

```js
export function createOnboardingConversationState() {}
export function applyConversationObservation(state, observation) {}
export function nextConversationPrompt(state) {}
export function validateCandidateFacts(state, facts) {}
export function isConversationTerminal(state) {}
```

State contains `phase`, `activeObjective`, `rephraseCount`,
`optionalExchangeCount`, `facts`, and `finishReason`. Every helper returns new
objects. `nextConversationPrompt` returns structured prompt intent instead of
model prose:

```js
{
  objective: "age",
  mode: "rephrase",
  includeChineseHint: true,
  mustFinishAfterTurn: false,
}
```

- [ ] **Step 4: Run the controller test and full domain tests**

Run:

```bash
node --test tests/conversation-scenario.test.mjs tests/onboarding-domain.test.mjs
```

Expected: all pass.

- [ ] **Step 5: Commit the controller**

```bash
git add lib/conversation-scenario.js tests/conversation-scenario.test.mjs
git commit -m "feat: add bounded conversation controller"
```

## Task 2: Conversation schema and migration

**Files:**

- Modify: `src/db/schema.ts`
- Create: generated `migrations/0004_*.sql`
- Modify: `migrations/meta/_journal.json`
- Create: generated `migrations/meta/0004_snapshot.json`
- Create: `tests/conversation-infrastructure.test.mjs`

- [ ] **Step 1: Write failing Drizzle and migrated-SQL tests**

Assert exports and exact properties:

```js
assert.deepEqual(Object.keys(getTableColumns(schema.conversationSession)), [
  "id", "authUserId", "scenarioKey", "scenarioVersion", "roomName",
  "status", "finishReason", "controllerState", "startedAt", "endedAt",
  "createdAt", "updatedAt",
]);
assert.deepEqual(Object.keys(getTableColumns(schema.conversationTurn)), [
  "id", "conversationId", "providerItemId", "sequence", "role", "text",
  "language", "inputMode", "interrupted", "startedAt", "endedAt", "createdAt",
]);
assert.deepEqual(Object.keys(getTableColumns(schema.conversationFact)), [
  "id", "conversationId", "factKey", "valueJson", "sourceTurnIds", "status",
  "createdAt", "updatedAt",
]);
```

Apply all migrations to in-memory SQLite and assert JSON/status checks, both
turn unique indexes, user/session cascades, and a maximum fact payload enforced
by application tests.

- [ ] **Step 2: Run the infrastructure test and confirm failure**

```bash
node --test tests/conversation-infrastructure.test.mjs
```

Expected: missing schema exports.

- [ ] **Step 3: Add the three Drizzle tables and relations**

Use `text`, `integer`, `check`, `index`, and `uniqueIndex` consistently with the
existing schema. Add `many(conversationSession)` to `userRelations`; add
session-to-turn and session-to-fact relations; use `ON DELETE CASCADE` on both
foreign-key levels.

- [ ] **Step 4: Generate and review migration**

```bash
npm run db:generate
git diff -- src/db/schema.ts migrations
```

Expected: one additive migration with no mutation of Better Auth tables.

- [ ] **Step 5: Run schema tests**

```bash
node --test tests/conversation-infrastructure.test.mjs tests/auth-infrastructure.test.mjs tests/onboarding-infrastructure.test.mjs
```

Expected: all pass after updating the onboarding migration-count assertion from
four to five without weakening its content checks.

- [ ] **Step 6: Commit schema and migration**

```bash
git add src/db/schema.ts migrations tests/conversation-infrastructure.test.mjs tests/onboarding-infrastructure.test.mjs
git commit -m "feat: add conversation persistence schema"
```

## Task 3: Worker repository and application contracts

**Files:**

- Create: `worker/conversation-repository.ts`
- Create: `worker/livekit-token.ts`
- Create: `worker/conversations.ts`
- Modify: `worker/index.ts`
- Modify: `worker/onboarding.ts`
- Modify: `src/onboarding-api.ts`
- Modify: `.dev.vars.example`
- Modify: `wrangler.jsonc`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tests/conversation-worker.test.mjs`
- Modify: `tests/onboarding-worker.test.mjs`

- [ ] **Step 1: Install server token dependency**

Install `livekit-server-sdk@2.16.0`. Preserve the npm lockfile and do not create
a pnpm lockfile.

```bash
npm install livekit-server-sdk@2.16.0
```

- [ ] **Step 2: Write failing repository and route tests**

Create dependency-injected tests for:

```js
await request("POST", "/api/conversations", { authenticated: false }); // 401
await request("POST", "/api/conversations", { authenticated: true });  // 201
await request("GET", "/api/conversations/other-user", { authenticated: true }); // 404
await agentRequest("POST", "/api/conversations/id/turns", { secret: "bad" }); // 401
```

Assert token creation receives a room-scoped identity and a 10-minute TTL;
turn ingest is idempotent by provider item ID; sequence collisions return 409;
review accepts only `name`, `age`, and at most three interests; and missing name
or age calls the existing session-bypass repository before returning.

- [ ] **Step 3: Run Worker tests and confirm failure**

```bash
node --test tests/conversation-worker.test.mjs
```

Expected: missing conversation handler.

- [ ] **Step 4: Implement repository methods**

Expose:

```ts
createConversation(identity, scenario)
loadOwnedConversation(conversationId, userId)
appendTurn(conversationId, turn)
upsertCandidates(conversationId, candidates, controllerState)
endConversation(conversationId, status, finishReason)
reviewConversation(conversationId, userId, decisions)
```

Use Drizzle transactions for review/profile updates, JSON parse guards, bounded
strings, and `onConflictDoNothing` only where idempotency is intended.

- [ ] **Step 5: Implement LiveKit token helper**

Use `AccessToken` and `RoomServiceClient`-compatible claims without exposing
the API secret:

```ts
const token = new AccessToken(apiKey, apiSecret, {
  identity: `learner:${identity.userId}:${conversation.id}`,
  metadata: JSON.stringify({ conversationId: conversation.id }),
  ttl: "10m",
});
token.addGrant({ roomJoin: true, room: conversation.roomName });
return token.toJwt();
```

- [ ] **Step 6: Implement route authentication and payload bounds**

Browser routes receive the existing Better Auth identity from `worker/index.ts`.
Agent routes require `Authorization: Bearer ${CONVERSATION_AGENT_SECRET}` and do
not accept cookie identity. Add `LIVEKIT_URL`, `LIVEKIT_API_KEY`,
`LIVEKIT_API_SECRET`, `CONVERSATION_AGENT_SECRET`, and
`REALTIME_ONBOARDING_ENABLED` to the Worker environment type and examples.

- [ ] **Step 7: Expose server-owned experience mode**

Add to full onboarding payloads:

```ts
experienceMode: env.REALTIME_ONBOARDING_ENABLED === "1" ? "realtime" : "form"
```

Keep bypass-only payloads unchanged.

- [ ] **Step 8: Run focused Worker and API tests**

```bash
node --test tests/conversation-worker.test.mjs tests/onboarding-worker.test.mjs tests/onboarding-api.test.mjs
```

Expected: all pass.

- [ ] **Step 9: Commit Worker contracts**

```bash
git add package.json package-lock.json .dev.vars.example wrangler.jsonc worker src/onboarding-api.ts tests
git commit -m "feat: add authenticated conversation APIs"
```

## Task 4: Browser API and LiveKit transport

**Files:**

- Create: `src/conversation-api.ts`
- Create: `src/livekit-conversation.ts`
- Create: `tests/conversation-api.test.mjs`
- Create: `tests/livekit-conversation.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install browser LiveKit dependency**

```bash
npm install livekit-client@2.20.0
```

- [ ] **Step 2: Write failing browser API tests**

Assert exact same-origin requests for start, load, finish, and review, including
AbortSignal forwarding and safe `ConversationApiError` parsing.

```js
await startConversation({ fetch: fake.fetch });
assert.equal(fake.calls[0][0], "/api/conversations");
assert.equal(fake.calls[0][1].method, "POST");
```

- [ ] **Step 3: Implement typed API client**

Model `ConversationSession`, `ConversationTurn`, `ConversationFact`,
`ConversationScenarioDescriptor`, and `ConversationStartResponse`. Reuse the
error-handling shape from `src/onboarding-api.ts` without importing private
helpers.

- [ ] **Step 4: Write failing transport-adapter tests**

Inject a fake Room and assert:

- connect uses URL and participant token;
- microphone enable occurs only after connect;
- typed messages use topic `lk.chat`;
- state, transcription, and disconnect events are normalized;
- mute/interrupt/disconnect delegate once; and
- all listeners are removed on close.

- [ ] **Step 5: Implement `createLiveKitConversation`**

Expose this narrow adapter:

```ts
type LiveKitConversation = {
  connect(): Promise<void>;
  setMicrophoneEnabled(enabled: boolean): Promise<void>;
  sendText(text: string): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(listener: (event: ConversationTransportEvent) => void): () => void;
};
```

Do not expose the Room object to React.

- [ ] **Step 6: Run adapter tests**

```bash
node --test tests/conversation-api.test.mjs tests/livekit-conversation.test.mjs
```

Expected: all pass.

- [ ] **Step 7: Commit browser transport**

```bash
git add package.json package-lock.json src/conversation-api.ts src/livekit-conversation.ts tests/conversation-api.test.mjs tests/livekit-conversation.test.mjs
git commit -m "feat: add reusable LiveKit browser transport"
```

## Task 5: Accessible conversation surface

**Files:**

- Create: `src/ConversationSurface.tsx`
- Create: `tests/conversation-ui.test.mjs`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing SSR and behavior-helper tests**

Render ready, connecting, listening, speaking, reconnecting, error, and summary
states. Assert captions, transcript list, typed form, microphone button, mute,
Finish now, Use form instead, live regions, and editable candidate fields.

```js
assert.match(html, /aria-label="Type your answer"/);
assert.match(html, /Finish now/);
assert.match(html, /Use the form instead/);
assert.doesNotMatch(html, /disabled[^>]*Type your answer/);
```

- [ ] **Step 2: Run UI test and confirm failure**

```bash
node --test tests/conversation-ui.test.mjs
```

Expected: missing component.

- [ ] **Step 3: Implement presentational component**

Keep provider and onboarding logic out of the view. Props contain normalized
transport state, turns, candidates, handlers, and scenario labels. Use the
existing `public/assets/characters/pig-host.png` rather than protected-character
assets.

- [ ] **Step 4: Add responsive and reduced-motion styles**

Add `.conversation-*` rules with the existing color/spacing tokens, visible
focus, scrollable transcript, short-viewport safety, and a reduced-motion block.

- [ ] **Step 5: Run UI and style checks**

```bash
node --test tests/conversation-ui.test.mjs tests/stage-layout.test.mjs
```

Expected: all pass.

- [ ] **Step 6: Commit the surface**

```bash
git add src/ConversationSurface.tsx src/styles.css tests/conversation-ui.test.mjs
git commit -m "feat: add accessible conversation surface"
```

## Task 6: LiveKit agent runtime and onboarding task

**Files:**

- Create: `agent/config.ts`
- Create: `agent/ingest-client.ts`
- Create: `agent/onboarding-scenario.ts`
- Create: `agent/index.ts`
- Create: `agent/Dockerfile`
- Create: `tsconfig.agent.json`
- Create: `tests/conversation-agent.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `eslint.config.mjs`
- Modify: `.env.example`

- [ ] **Step 1: Install agent dependencies**

```bash
npm install @livekit/agents@1.5.0 zod@4.4.3
```

- [ ] **Step 2: Write failing config and prompt-contract tests**

Assert all required environment variables, explicit model IDs, default voice ID
`Oqy85UMasXzUjUxF0ta5`, no protected-character claim, exactly four bounded tool
names, and `record: false` in the session start contract.

- [ ] **Step 3: Implement environment parsing**

`readAgentConfig(env)` returns:

```ts
{
  livekitUrl, livekitApiKey, livekitApiSecret,
  sttModel, llmModel, ttsModel, ttsVoiceId,
  ingestUrl, ingestSecret,
}
```

Reject blank values and implicit model names such as `latest` or `auto`.

- [ ] **Step 4: Implement bounded ingest client**

Provide `appendTurn`, `upsertFacts`, and `endConversation`; each uses a 5-second
AbortSignal timeout, JSON size limits, the agent bearer secret, and one retry
for retryable network/5xx failures.

- [ ] **Step 5: Implement `GettingToKnowYouTask`**

Create a stable `voice.AgentTask.create` with Zod tools:

```ts
recordCandidateFacts({ outcome, facts, nextInterestTopic })
markObjectiveUnanswered({ outcome })
finishConversation({ reason })
requestGentleRephrase({ reason })
```

Every executor calls `lib/conversation-scenario.js`, persists resulting facts
and controller state, and rejects invalid/terminal transitions. Instructions
require one short English question, permit one brief Chinese hint only when the
controller says so, forbid unrelated answers, and never claim an exact
protected identity.

- [ ] **Step 6: Implement agent entrypoint**

Construct explicit LiveKit Inference models:

```ts
new inference.STT({ model: config.sttModel })
new inference.LLM({ model: config.llmModel, strictToolSchema: true })
new inference.TTS({ model: config.ttsModel, voice: config.ttsVoiceId })
```

Use `new inference.TurnDetector()`, default/bundled VAD, adaptive interruption,
bounded endpointing, and `record: false`. Persist final
`user_input_transcribed`, `conversation_item_added`, and close events. Run the
task from a root agent's `onEnter` hook and close cleanly at terminal state.

- [ ] **Step 7: Add Node build and container**

`tsconfig.agent.json` emits ESM to `dist-agent`; `npm run build:agent` runs its
typecheck/build. The Dockerfile installs locked production dependencies, builds
the agent, and starts the LiveKit Agents CLI in production mode.

- [ ] **Step 8: Run agent tests and build**

```bash
node --test tests/conversation-agent.test.mjs tests/conversation-scenario.test.mjs
npm run build:agent
```

Expected: tests pass and `dist-agent/agent/index.js` is emitted or the configured
no-emit typecheck succeeds consistently with the Docker build.

- [ ] **Step 9: Commit agent runtime**

```bash
git add agent tsconfig.agent.json package.json package-lock.json eslint.config.mjs .env.example tests/conversation-agent.test.mjs
git commit -m "feat: add bounded LiveKit onboarding agent"
```

## Task 7: Onboarding gate integration and rollout fallback

**Files:**

- Modify: `src/OnboardingGate.tsx`
- Modify: `src/onboarding-api.ts`
- Modify: `src/ConversationSurface.tsx`
- Modify: `tests/onboarding-ui.test.mjs`
- Modify: `tests/onboarding-api.test.mjs`
- Modify: `tests/conversation-ui.test.mjs`

- [ ] **Step 1: Write failing gate selection tests**

Assert `experienceMode: "realtime"` renders the realtime start surface,
`"form"` renders the current question, Use form instead is sticky for the
mounted gate, LiveKit failure offers form fallback, and successful review
refreshes the existing gate state.

- [ ] **Step 2: Run gate tests and confirm failure**

```bash
node --test tests/onboarding-ui.test.mjs tests/onboarding-api.test.mjs
```

Expected: realtime experience fields/branch missing.

- [ ] **Step 3: Add a focused conversation controller hook**

Inside `OnboardingGate.tsx`, isolate realtime state in `useConversationOnboarding`
or a new adjacent `src/useConversationOnboarding.ts` if the gate grows beyond
its current responsibilities. It starts the API session only after Start,
connects the adapter, merges persisted/transport turns idempotently, supports
typed input and microphone mute, posts Finish now, loads the durable summary,
submits review, then calls the existing `refresh()`.

- [ ] **Step 4: Preserve current form path unchanged**

The existing question/acknowledgment branch remains the default when the server
returns `form` or the learner selects the fallback. Do not delete static audio,
Groq transcription, enrichment, or profile editor code.

- [ ] **Step 5: Run focused integration tests**

```bash
node --test tests/conversation-ui.test.mjs tests/onboarding-ui.test.mjs tests/onboarding-api.test.mjs tests/lifecycle/*.test.mjs
```

Expected: all pass.

- [ ] **Step 6: Commit gate integration**

```bash
git add src tests/onboarding-ui.test.mjs tests/onboarding-api.test.mjs tests/conversation-ui.test.mjs
git commit -m "feat: offer realtime onboarding conversation"
```

## Task 8: Deployment documentation and verification

**Files:**

- Modify: `README.md`
- Modify: `.github/workflows/deploy-cloudflare.yml`
- Create: `docs/deployment/livekit-agent.md`
- Modify: `tests/architecture-cleanup.test.mjs`
- Modify: `tests/conversation-infrastructure.test.mjs`

- [ ] **Step 1: Write failing deployment-contract tests**

Assert the Cloudflare workflow applies the fifth migration before deployment,
the agent Dockerfile uses the lockfile, example env files list names but no
secrets, the feature flag defaults off, and docs contain exact local and
LiveKit deployment verification commands.

- [ ] **Step 2: Run deployment tests and confirm failure**

```bash
node --test tests/conversation-infrastructure.test.mjs tests/architecture-cleanup.test.mjs
```

- [ ] **Step 3: Document operational setup**

Include:

```bash
npm run db:migrate:local
npm run build
npm run build:agent
lk agent create
lk agent deploy
```

Document required Worker/agent secrets, explicit model IDs, voice-compatibility
check, preview flag enablement, form fallback, and rollback by disabling
`REALTIME_ONBOARDING_ENABLED`.

- [ ] **Step 4: Run smallest complete verification**

```bash
npm test
npm run lint
npm run build
npm run build:agent
git diff --check origin/main...HEAD
```

Expected: every command exits zero. Report the real LiveKit smoke test as not
run when credentials are unavailable; do not imply deployment success.

- [ ] **Step 5: Commit verification docs**

```bash
git add README.md .github/workflows/deploy-cloudflare.yml docs/deployment/livekit-agent.md tests
git commit -m "docs: document LiveKit onboarding deployment"
```

## Task 9: Review, publish, and open PR

- [ ] **Step 1: Review the complete branch**

Inspect `git diff --stat origin/main...HEAD`, `git diff --check`, generated
migration SQL, environment examples, and the absence of secrets or raw-audio
persistence.

- [ ] **Step 2: Run final verification again after review fixes**

```bash
npm test
npm run lint
npm run build
npm run build:agent
```

- [ ] **Step 3: Push and open a draft PR**

```bash
git push -u origin codex/realtime-onboarding-livekit
```

Open a draft PR against `main` summarizing architecture, tests, provider/deploy
dependencies, feature-flag rollout, costs, and the status of the external
LiveKit smoke test.
