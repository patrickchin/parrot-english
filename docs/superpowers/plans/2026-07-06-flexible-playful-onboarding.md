# Flexible, Playful Voice Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace array/scalar onboarding with six simple prose questions, self-contained answer snapshots, Groq summaries and personalized acknowledgments, and runtime ElevenLabs acknowledgment audio.

**Architecture:** Ship and validate one versioned questionnaire JSON file with the Worker. Keep pure definition and profile-envelope rules in focused shared JavaScript modules; orchestrate authenticated Groq -> D1 -> ElevenLabs work in the Worker; simplify the React flow to an editable textarea followed by a non-blocking acknowledgment state. Stop querying or publishing normalized questionnaire data while retaining its tables for later cleanup.

**Tech Stack:** React 19, TypeScript, Cloudflare Workers/D1, Drizzle ORM, Better Auth, Groq Whisper and Chat Completions, ElevenLabs `eleven_v3`, Node test runner.

---

## File Structure

- `content/onboarding/questionnaire-v2.json`: deployed six-question prose definition.
- `lib/onboarding-questionnaire.js`: validate and normalize that definition.
- `lib/onboarding-profile.js`: v2 envelope parsing, v1 conversion, response writes, progress, completion, and idempotency.
- `worker/onboarding-definition.ts`: expose one validated runtime definition.
- `worker/onboarding-enrichment.ts`: Groq strict-JSON request, semantic validation, canonical extraction, and fallback.
- `worker/onboarding-acknowledgment-audio.ts`: ElevenLabs TTS with timeout and nullable audio.
- `worker/onboarding-repository.ts`: profile/session-bypass persistence only.
- `worker/onboarding.ts`: authenticated API orchestration.
- `worker/api-security.ts`, `worker/index.ts`: enrichment rate limiting and environment wiring.
- `src/onboarding-api.ts`: prose and acknowledgment client contracts.
- `src/OnboardingQuestion.tsx`: one prose textarea with voice transcription.
- `src/OnboardingAcknowledgment.tsx`: acknowledgment and optional audio playback.
- `src/OnboardingGate.tsx`: question/thinking/acknowledgment/profile state.
- `lib/static-audio.js`, `public/assets/audio/onboarding-v2-*.mp3`: fixed v2 prompt audio.
- Deployment, package, docs, and focused onboarding tests.

### Task 1: Checked-in v2 questionnaire contract

**Files:**
- Create: `content/onboarding/questionnaire-v2.json`
- Create: `lib/onboarding-questionnaire.js`
- Create: `worker/onboarding-definition.ts`
- Modify: `tests/onboarding-infrastructure.test.mjs`

- [ ] **Step 1: Write the failing definition tests**

Add tests requiring exact prompt order, one name/age target, prose-only limits, unique contiguous positions, known keys only, and immutable output:

```js
import questionnaireV2 from "../content/onboarding/questionnaire-v2.json" with { type: "json" };
import { validateOnboardingQuestionnaire } from "../lib/onboarding-questionnaire.js";

it("validates the six simple v2 prose questions", () => {
  const definition = validateOnboardingQuestionnaire(questionnaireV2);
  assert.deepEqual(definition.questions.map(({ promptEn }) => promptEn), [
    "Hi! I'm Peppa. What's your name?",
    "How old are you?",
    "What cartoons do you like?",
    "What animals do you like?",
    "What do you like doing for fun?",
    "What kind of stories do you like?",
  ]);
  assert.deepEqual(
    definition.questions.map(({ canonicalField }) => canonicalField),
    ["name", "age", null, null, null, null],
  );
  assert.ok(Object.isFrozen(definition));
  assert.ok(Object.isFrozen(definition.questions));
});

it("rejects duplicate positions and unknown definition fields", () => {
  assert.throws(
    () => validateOnboardingQuestionnaire({
      ...questionnaireV2,
      questions: questionnaireV2.questions.map((entry, index) =>
        index === 1 ? { ...entry, position: 1, mystery: true } : entry),
    }),
    /Invalid onboarding questionnaire/,
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/onboarding-infrastructure.test.mjs`

Expected: FAIL because the JSON and validator do not exist.

- [ ] **Step 3: Implement the minimal definition and validator**

Create the six-question JSON from the design. In `lib/onboarding-questionnaire.js`, accept only root keys `id`, `version`, and `questions`; accept only the approved question keys; require v2, unique stable keys, contiguous positions, valid canonical fields, booleans, bounded lengths, and nonblank strings; clone and deep-freeze the result.

Expose the singleton:

```ts
import source from "../content/onboarding/questionnaire-v2.json" with { type: "json" };
import { validateOnboardingQuestionnaire } from "../lib/onboarding-questionnaire.js";

export const ONBOARDING_QUESTIONNAIRE =
  validateOnboardingQuestionnaire(source);
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/onboarding-infrastructure.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add content/onboarding/questionnaire-v2.json lib/onboarding-questionnaire.js worker/onboarding-definition.ts tests/onboarding-infrastructure.test.mjs
git commit -m "feat: add prose onboarding definition"
```

### Task 2: V2 answer envelope and legacy compatibility

**Files:**
- Create: `lib/onboarding-profile.js`
- Modify: `tests/onboarding-domain.test.mjs`

- [ ] **Step 1: Write failing envelope tests**

Cover exact snapshots, canonical mirrors, progress, completion, same-answer idempotency, incomplete-v1 reset, completed-v1 preservation, and first profile-edit conversion:

```js
it("stores prose metadata and canonical age", () => {
  const profile = ensureV2Profile({
    answersJson: "{}",
    onboardingStatus: "not_started",
    name: "Mia",
    age: null,
  }, definition);
  const updated = writeV2Response(profile, definition.questions[1], {
    rawAnswer: "I am six years old.",
    summary: "Is six years old.",
    acknowledgment: "Six is a brilliant age!",
    canonicalAge: 6,
    canonicalName: null,
    enrichmentStatus: "generated",
    answeredAt: "2026-07-06T10:30:00.000Z",
  });
  assert.equal(updated.age, 6);
  assert.deepEqual(readV2Answers(updated).responses.age, {
    question: "How old are you?",
    rawAnswer: "I am six years old.",
    summary: "Is six years old.",
    acknowledgment: "Six is a brilliant age!",
    enrichmentStatus: "generated",
    answeredAt: "2026-07-06T10:30:00.000Z",
  });
});

it("retains v1 JSON while restarting only incomplete profiles", () => {
  const legacy = { favoriteAnimals: ["cat", "dog"] };
  const updated = ensureV2Profile({
    answersJson: JSON.stringify(legacy),
    onboardingStatus: "in_progress",
    currentQuestionKey: "favoriteAnimals",
    name: "Mia",
    age: 6,
  }, definition);
  assert.deepEqual(readV2Answers(updated).legacyAnswers, legacy);
  assert.deepEqual(readV2Answers(updated).responses, {});
  assert.equal(updated.currentQuestionKey, "name");
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/onboarding-domain.test.mjs`

Expected: FAIL because `lib/onboarding-profile.js` does not exist.

- [ ] **Step 3: Implement the pure profile module**

Export:

```js
export function readV2Answers(profile) {}
export function ensureV2Profile(profile, definition, options = {}) {}
export function writeV2Response(profile, question, enrichment) {}
export function getV2CurrentQuestion(profile, definition) {}
export function getV2Progress(profile, definition) {}
export function isV2Complete(profile, definition) {}
export function isSameV2Answer(profile, answerKey, rawAnswer) {}
```

Use a closed v2 envelope. Copy v1 JSON into `legacyAnswers`, keep completed v1 profiles completed, reset only incomplete v1 progress, preserve skip/session fields, and mirror validated name and age without removing their snapshots.

- [ ] **Step 4: Run and verify GREEN**

Run: `node --test tests/onboarding-domain.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/onboarding-profile.js tests/onboarding-domain.test.mjs
git commit -m "feat: add prose answer envelope"
```

### Task 3: Groq answer enrichment

**Files:**
- Create: `worker/onboarding-enrichment.ts`
- Create: `tests/onboarding-enrichment.test.mjs`
- Modify: `worker/groq.ts`
- Modify: `tests/onboarding-transcription.test.mjs`
- Modify: `tests/groq.test.mjs`

- [ ] **Step 1: Write failing provider tests**

Inject `fetch`, capture the request, and cover strict schema, data minimization, semantic validation, canonical extraction, timeout, refusal, missing key, and fallback:

```js
it("requests strict child-safe summary and acknowledgment JSON", async () => {
  let upstreamRequest;
  const result = await enrichOnboardingAnswer({
    env: { GROQ_API_KEY: "test-key" },
    fetch: async (url, init) => {
      upstreamRequest = { url, body: JSON.parse(String(init.body)) };
      return Response.json({ choices: [{ message: { content: JSON.stringify({
        summary: "Likes dinosaurs.",
        acknowledgment: "Dinosaurs are very stompy!",
        canonicalName: null,
        canonicalAge: null,
      }) } }] });
    },
    question,
    rawAnswer: "I like dinosaurs",
  });
  assert.equal(upstreamRequest.body.model, "openai/gpt-oss-20b");
  assert.equal(upstreamRequest.body.response_format.json_schema.strict, true);
  assert.doesNotMatch(JSON.stringify(upstreamRequest.body), /user-id|email/);
  assert.equal(result.enrichmentStatus, "generated");
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/onboarding-enrichment.test.mjs`

Expected: FAIL because the provider module does not exist.

- [ ] **Step 3: Implement enrichment**

Refactor the timeout helper in `worker/groq.ts` into an exported provider-neutral helper without changing transcription behavior. Implement:

```ts
export type OnboardingEnrichment = {
  summary: string;
  acknowledgment: string;
  canonicalName: string | null;
  canonicalAge: number | null;
  enrichmentStatus: "generated" | "fallback";
};

export async function enrichOnboardingAnswer(
  input: EnrichmentInput,
): Promise<OnboardingEnrichment> {}
```

Call `/chat/completions` with `openai/gpt-oss-20b`, strict JSON Schema, every field required, and `additionalProperties: false`. Enforce 240-character summary, 160-character acknowledgment, no question mark, no unknown fields, and valid canonical values. Operational or semantic failure returns truncated raw prose plus the checked-in fallback acknowledgment; unresolved canonical fields return a typed validation result.

- [ ] **Step 4: Run and verify GREEN**

Run: `node --test tests/onboarding-enrichment.test.mjs tests/onboarding-transcription.test.mjs tests/groq.test.mjs`

Expected: PASS with transcription and speech evaluation unchanged.

- [ ] **Step 5: Commit**

```bash
git add worker/groq.ts worker/onboarding-enrichment.ts tests/onboarding-enrichment.test.mjs tests/onboarding-transcription.test.mjs tests/groq.test.mjs
git commit -m "feat: enrich onboarding prose with Groq"
```

### Task 4: Runtime ElevenLabs acknowledgment audio

**Files:**
- Create: `worker/onboarding-acknowledgment-audio.ts`
- Create: `tests/onboarding-acknowledgment-audio.test.mjs`
- Modify: `.dev.vars.example`

- [ ] **Step 1: Write failing TTS tests**

```js
it("synthesizes only the server acknowledgment with the Peppa voice", async () => {
  let request;
  const audio = await synthesizeAcknowledgment({
    env: { ELEVENLABS_API_KEY: "test-key" },
    fetch: async (url, init) => {
      request = { url, body: JSON.parse(String(init.body)) };
      return new Response(Uint8Array.from([1, 2, 3]), {
        headers: { "Content-Type": "audio/mpeg" },
      });
    },
    text: "Dinosaurs are very stompy!",
  });
  assert.match(String(request.url), /Oqy85UMasXzUjUxF0ta5/);
  assert.equal(request.body.model_id, "eleven_v3");
  assert.equal(
    request.body.text,
    "[bright and playful] Dinosaurs are very stompy!",
  );
  assert.deepEqual(audio, { contentType: "audio/mpeg", base64: "AQID" });
});
```

Add separate timeout, missing-key, excessive-input, and upstream-failure cases returning null.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/onboarding-acknowledgment-audio.test.mjs`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the TTS boundary**

Use Summer voice `Oqy85UMasXzUjUxF0ta5`, model `eleven_v3`, a short configurable timeout, 160-character input cap, `xi-api-key`, and Worker-safe `Uint8Array` base64 conversion. The module accepts only acknowledgment text and provider dependencies.

Add `ELEVENLABS_API_KEY=your_elevenlabs_api_key_here` to `.dev.vars.example`.

- [ ] **Step 4: Run and verify GREEN**

Run: `node --test tests/onboarding-acknowledgment-audio.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/onboarding-acknowledgment-audio.ts tests/onboarding-acknowledgment-audio.test.mjs .dev.vars.example
git commit -m "feat: speak onboarding acknowledgments"
```

### Task 5: Decouple persistence from questionnaire tables

**Files:**
- Modify: `worker/onboarding-repository.ts`
- Modify: `tests/onboarding-worker.test.mjs`
- Modify: `tests/onboarding-infrastructure.test.mjs`

- [ ] **Step 1: Write failing repository tests**

Require a new profile to load without active questionnaire rows and keep the legacy foreign key null:

```js
it("creates v2 profiles without normalized questionnaire rows", async () => {
  const repository = createOnboardingRepository(database, {
    createId: () => "profile-v2",
    now: () => new Date("2026-07-06T00:00:00Z"),
  });
  const profile = await repository.ensureProfile(identity);
  assert.equal(profile.questionnaireVersion, null);
  assert.equal(profile.name, identity.userName);
});
```

Assert source no longer imports `questionnaire`, `questionnaireQuestion`, `asc`, or `assignQuestionnaireVersion`.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/onboarding-worker.test.mjs tests/onboarding-infrastructure.test.mjs`

Expected: FAIL because profile loading still requires an active D1 questionnaire.

- [ ] **Step 3: Simplify the repository**

Keep `findProfile`, `ensureProfile`, `canBypass`, `skipSession`, `saveTransition`, `saveAnswer`, and `complete`. Remove active-questionnaire and question lookup. Make `loadProfile(identity)` return the ensured profile. Preserve recovery timestamps, optional-question skip JSON, and session-bypass behavior from PR #13.

- [ ] **Step 4: Run and verify GREEN**

Run: `node --test tests/onboarding-worker.test.mjs tests/onboarding-infrastructure.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/onboarding-repository.ts tests/onboarding-worker.test.mjs tests/onboarding-infrastructure.test.mjs
git commit -m "refactor: load onboarding from deployed definition"
```

### Task 6: Orchestrate v2 answers in the Worker

**Files:**
- Modify: `worker/onboarding.ts`
- Modify: `worker/api-security.ts`
- Modify: `worker/index.ts`
- Modify: `tests/onboarding-worker.test.mjs`
- Modify: `tests/api-security.test.mjs`
- Modify: `tests/worker-auth.test.mjs`

- [ ] **Step 1: Write failing orchestration tests**

Inject `enrichAnswer` and `synthesizeAudio`. Cover client-metadata rejection, prose validation, current-question enforcement, Groq -> D1 -> TTS ordering, fallback, same-answer idempotency, canonical errors, v1 conversion, profile editing, skip/resume, and completed-user bypass:

```js
it("persists a complete snapshot before requesting TTS", async () => {
  const calls = [];
  const response = await handleOnboardingRequest(input, {
    enrichAnswer: async () => {
      calls.push("enrich");
      return generatedEnrichment;
    },
    synthesizeAudio: async () => {
      calls.push("tts");
      const stored = await readProfile(database);
      assert.match(stored.answersJson, /Dinosaurs are very stompy/);
      return { contentType: "audio/mpeg", base64: "AQID" };
    },
  });
  assert.deepEqual(calls, ["enrich", "tts"]);
  assert.equal(response.status, 200);
});
```

Add rate-limit tests for authenticated PUTs to `/api/onboarding/answer` and `/api/profile` sharing a per-user/IP enrichment bucket.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/onboarding-worker.test.mjs tests/api-security.test.mjs tests/worker-auth.test.mjs`

Expected: FAIL because the handler still uses D1 question rows and scalar/array values.

- [ ] **Step 3: Implement v2 request and payload contracts**

Accept `{ questionKey, rawAnswer }`. Derive prompt and canonical metadata from `ONBOARDING_QUESTIONNAIRE`. Serialize questions with only `answerKey`, `position`, `promptEn`, `promptZh`, `required`, `maxLength`, and resolved audio.

Use pure v2 functions for conversion, current question, response writes, progress, and completion. Skip Groq for an identical saved answer but still allow TTS retry. Persist before TTS. Return:

```ts
{
  ...onboardingPayload,
  acknowledgment: {
    text: savedResponse.acknowledgment,
    audio: generatedAudio,
  },
}
```

Add `checkOnboardingEnrichmentRateLimit()` and apply it after authentication to both save routes. Keep completed-v1 bypass and all session recovery behavior.

- [ ] **Step 4: Run and verify GREEN**

Run: `node --test tests/onboarding-worker.test.mjs tests/api-security.test.mjs tests/worker-auth.test.mjs tests/onboarding-transcription.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/onboarding.ts worker/api-security.ts worker/index.ts tests/onboarding-worker.test.mjs tests/api-security.test.mjs tests/worker-auth.test.mjs
git commit -m "feat: orchestrate prose onboarding answers"
```

### Task 7: Update client API contracts

**Files:**
- Modify: `src/onboarding-api.ts`
- Modify: `tests/onboarding-api.test.mjs`

- [ ] **Step 1: Write failing client tests**

```js
it("submits prose and retains the acknowledgment response", async () => {
  const requests = [];
  await saveOnboardingAnswer("favoriteAnimals", "I like dinosaurs", {
    fetch: async (path, init) => {
      requests.push({ path, body: JSON.parse(String(init.body)) });
      return Response.json(onboardingWithAcknowledgment);
    },
  });
  assert.deepEqual(requests[0].body, {
    questionKey: "favoriteAnimals",
    rawAnswer: "I like dinosaurs",
  });
});
```

Require public question types to omit type/cardinality/options and response types to include v2 snapshots and optional acknowledgment audio.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/onboarding-api.test.mjs`

Expected: FAIL because the client posts `{ value }` and models arrays.

- [ ] **Step 3: Implement minimal types**

Define `OnboardingResponseSnapshot`, `OnboardingAcknowledgment`, prose-only `OnboardingQuestion`, and the v2 profile envelope. Update onboarding/profile save helpers to accept string `rawAnswer`. Remove `answerType`, `cardinality`, `options`, and numeric validation maps.

- [ ] **Step 4: Run and verify GREEN**

Run: `node --test tests/onboarding-api.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/onboarding-api.ts tests/onboarding-api.test.mjs
git commit -m "refactor: expose prose onboarding contracts"
```

### Task 8: Prose and acknowledgment UI

**Files:**
- Create: `src/OnboardingAcknowledgment.tsx`
- Modify: `src/OnboardingQuestion.tsx`
- Modify: `src/OnboardingGate.tsx`
- Modify: `src/styles.css`
- Modify: `tests/onboarding-ui.test.mjs`

- [ ] **Step 1: Write failing UI tests**

```js
it("renders one editable prose answer without array controls", () => {
  const html = renderToStaticMarkup(<OnboardingQuestionView {...props} />);
  assert.match(html, /<textarea/);
  assert.match(html, /Speak your answer/);
  assert.doesNotMatch(
    html,
    /onboarding-chips|Answer suggestions|Add one answer/,
  );
});

it("shows one Peppa acknowledgment and an immediate Next action", () => {
  const html = renderToStaticMarkup(
    <OnboardingAcknowledgment
      acknowledgment={{ text: "Dinosaurs are very stompy!", audio: null }}
      onNext={() => {}}
    />,
  );
  assert.match(html, /Dinosaurs are very stompy!/);
  assert.match(html, />Next</);
  assert.doesNotMatch(html, /<textarea/);
});
```

Add helper tests for base64 audio playback, automatic advance, no-audio delay, cleanup, and stale-operation isolation.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/onboarding-ui.test.mjs`

Expected: FAIL because chips remain and acknowledgment state is absent.

- [ ] **Step 3: Implement the prose form**

Remove array helper props/functions. Render a controlled textarea with max length, voice transcription, replay, field errors, optional question skip, whole-session skip, and confirm. Use `Listening…`, `Writing what I heard…`, and `Peppa is thinking…`.

- [ ] **Step 4: Implement acknowledgment and gate state**

Create `OnboardingAcknowledgment` with Peppa art, `aria-live`, immediate Next, and an effect that converts base64 MP3 to a Blob URL, plays it, revokes it, and advances only the current operation. With no audio, use a short readable timeout.

Keep the saved next state separate in `OnboardingGate` while acknowledgment is active. Do not reveal the next question until Next/playback completion. Invalidate stale transcription, save, and playback outcomes. Reuse the flow for profile editing.

- [ ] **Step 5: Run and verify GREEN**

Run: `node --test tests/onboarding-ui.test.mjs tests/onboarding-api.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/OnboardingAcknowledgment.tsx src/OnboardingQuestion.tsx src/OnboardingGate.tsx src/styles.css tests/onboarding-ui.test.mjs
git commit -m "feat: add playful prose onboarding UI"
```

### Task 9: Exact v2 prompt audio

**Files:**
- Modify: `lib/static-audio.js`
- Create: `public/assets/audio/onboarding-v2-name.mp3`
- Create: `public/assets/audio/onboarding-v2-age.mp3`
- Create: `public/assets/audio/onboarding-v2-cartoons.mp3`
- Create: `public/assets/audio/onboarding-v2-animals.mp3`
- Create: `public/assets/audio/onboarding-v2-fun.mp3`
- Create: `public/assets/audio/onboarding-v2-stories.mp3`
- Modify: `tests/static-audio.test.mjs`
- Modify: `tests/onboarding-infrastructure.test.mjs`

- [ ] **Step 1: Write failing audio tests**

Require one Peppa entry per v2 question, exact visible text, Summer voice metadata, `energetic-character`, and an existing non-empty MP3.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/static-audio.test.mjs tests/onboarding-infrastructure.test.mjs`

Expected: FAIL because v2 entries and files do not exist.

- [ ] **Step 3: Register and generate only the six IDs**

Add clean `text` matching the approved prompts and performance-only `ttsText`. Generate with ElevenLabs only:

```bash
npm run generate:audio:elevenlabs -- --only=onboarding-v2-name
npm run generate:audio:elevenlabs -- --only=onboarding-v2-age
npm run generate:audio:elevenlabs -- --only=onboarding-v2-cartoons
npm run generate:audio:elevenlabs -- --only=onboarding-v2-animals
npm run generate:audio:elevenlabs -- --only=onboarding-v2-fun
npm run generate:audio:elevenlabs -- --only=onboarding-v2-stories
```

Inspect file sizes and decodeability. Never substitute local or macOS speech.

- [ ] **Step 4: Run and verify GREEN**

Run: `node --test tests/static-audio.test.mjs tests/onboarding-infrastructure.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/static-audio.js public/assets/audio/onboarding-v2-*.mp3 tests/static-audio.test.mjs tests/onboarding-infrastructure.test.mjs
git commit -m "feat: add playful onboarding prompt audio"
```

### Task 10: Remove obsolete publisher wiring

**Files:**
- Delete: `scripts/publish-questionnaire.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/deploy-cloudflare.yml`
- Modify: `README.md`
- Modify: `docs/design/technical-architecture.md`
- Modify: `tests/onboarding-infrastructure.test.mjs`

- [ ] **Step 1: Write failing operational tests**

Require no `questionnaire:publish` script, no workflow publish step, no publisher file, a checked-in definition, and docs for the runtime secret and dormant tables.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/onboarding-infrastructure.test.mjs`

Expected: FAIL because publisher wiring still exists.

- [ ] **Step 3: Remove publisher wiring and update docs**

Delete the publisher and package command. Remove only the publish workflow step; retain D1 migrations. Document:

```bash
npx wrangler secret put ELEVENLABS_API_KEY
```

Explain that v2 questions deploy with code, v2 snapshots live in `answers_json`, and normalized questionnaire tables remain dormant.

- [ ] **Step 4: Run and verify GREEN**

Run: `node --test tests/onboarding-infrastructure.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json .github/workflows/deploy-cloudflare.yml README.md docs/design/technical-architecture.md tests/onboarding-infrastructure.test.mjs
git rm scripts/publish-questionnaire.mjs
git commit -m "docs: deploy onboarding from checked-in JSON"
```

### Task 11: Full regression and draft PR

**Files:**
- Modify only files required by failures attributable to this feature.

- [ ] **Step 1: Run focused tests**

```bash
node --test \
  tests/onboarding-api.test.mjs \
  tests/onboarding-domain.test.mjs \
  tests/onboarding-enrichment.test.mjs \
  tests/onboarding-acknowledgment-audio.test.mjs \
  tests/onboarding-infrastructure.test.mjs \
  tests/onboarding-transcription.test.mjs \
  tests/onboarding-ui.test.mjs \
  tests/onboarding-worker.test.mjs \
  tests/api-security.test.mjs \
  tests/worker-auth.test.mjs \
  tests/static-audio.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 2: Run full verification**

```bash
npm test
npm run lint
npm run build
npx wrangler deploy --dry-run --config wrangler.jsonc
```

Expected: all commands pass; generated-file lint warnings may remain, but no errors.

- [ ] **Step 3: Review the complete diff and secret boundary**

```bash
git status --short
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git diff origin/main...HEAD -- . ':!public/assets/audio/*.mp3'
git diff --numstat origin/main...HEAD -- public/assets/audio/*.mp3
```

Confirm no key values, local D1 state, temporary audio, build output, or unrelated files. Confirm the browser never references `ELEVENLABS_API_KEY` or calls ElevenLabs directly.

- [ ] **Step 4: Verify release prerequisites without mutating production**

```bash
npx wrangler secret list --config wrangler.jsonc
npx wrangler d1 migrations list parrot-english --remote --config wrangler.jsonc
```

Expected: Better Auth and Groq secrets exist, no migrations are pending, and `ELEVENLABS_API_KEY` is present or explicitly reported as the only release blocker. Do not set secrets or mutate D1 without authorization.

- [ ] **Step 5: Commit verification corrections if needed**

Use an explicit path list and `git commit -m "test: verify flexible onboarding flow"`. Skip this commit if verification required no changes.

- [ ] **Step 6: Push and open a draft PR**

```bash
git push -u origin codex/flexible-playful-onboarding
gh pr create --draft --base main \
  --title "[codex] make voice onboarding playful and flexible" \
  --body "$(printf '%s\n' \
    '## Summary' \
    '- ship six simple prose questions from checked-in JSON' \
    '- persist self-contained answer snapshots with Groq summaries and playful acknowledgments' \
    '- synthesize runtime acknowledgment audio with ElevenLabs while preserving graceful fallbacks and v1 compatibility' \
    '' \
    '## Verification' \
    '- npm test' \
    '- npm run lint' \
    '- npm run build' \
    '- npx wrangler deploy --dry-run --config wrangler.jsonc' \
    '' \
    '## Release note' \
    '- Update this line with the verified ELEVENLABS_API_KEY secret status before running the command.')"
```

The PR body summarizes the checked-in definition, prose snapshots, Groq/ElevenLabs flow, v1 compatibility, publisher removal, exact verification, and missing secret status. Do not merge or run expensive E2E without explicit authorization.
