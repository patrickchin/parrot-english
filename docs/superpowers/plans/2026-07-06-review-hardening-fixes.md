# Review Hardening Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all seven second-pass review findings while simplifying only the request-limit, rate-limit, profile-operation, deployment, and bypass-lifecycle code directly involved.

**Architecture:** Add one bounded request-body module shared by JSON and multipart handlers, replace module maps with Cloudflare Rate Limiting bindings, and give profile transcription one explicit abortable lifetime. Keep existing route ownership and payloads, serialize deployments, and enforce bypass cleanup with a session foreign key.

**Tech Stack:** TypeScript, React 19, Cloudflare Workers and D1, Drizzle ORM/Kit, Node test runner, Vite, ESLint

---

## File Map

- Create `worker/request-body.ts`: bounded stream reading plus text and multipart adapters.
- Create `tests/request-body.test.mjs`: direct regression coverage for bounded reads.
- Modify `worker/onboarding.ts`: use bounded JSON reads.
- Modify `worker/groq.ts`: bound multipart input before parsing while preserving the file-size cap.
- Modify `worker/api-security.ts`: small async adapter over Cloudflare Rate Limiting bindings.
- Modify `worker/index.ts`: await route-specific rate-limit checks and type the bindings.
- Modify `wrangler.jsonc`: configure evaluation, transcription, and enrichment rate-limit bindings.
- Modify `src/OnboardingQuestion.tsx`: forward an optional abort signal through capture and transcription.
- Modify `src/OnboardingGate.tsx`: abort the current profile capture when its existing operation generation is invalidated.
- Modify `src/ProfileEditor.tsx`: lock Save during capture and lock Close/Cancel only during save.
- Modify `src/db/schema.ts`: make bypass session IDs cascade from Better Auth sessions.
- Create `migrations/0003_*.sql` and `migrations/meta/0003_snapshot.json`: rebuild the bypass table and prune orphans.
- Modify `.github/workflows/deploy-cloudflare.yml`: serialize without cancelling active deployments.
- Modify focused tests under `tests/` for each behavior.

### Task 1: Bound request bodies before parsing

**Files:**
- Create: `worker/request-body.ts`
- Create: `tests/request-body.test.mjs`
- Modify: `worker/onboarding.ts:175-193`
- Modify: `worker/groq.ts:89-126`
- Test: `tests/onboarding-transcription.test.mjs`
- Test: `tests/onboarding-worker.test.mjs`

- [ ] **Step 1: Write failing bounded-reader tests**

Add tests that require an exported `RequestBodyTooLargeError`, reject both a declared oversized body and a streamed oversized body without `Content-Length`, and successfully parse bounded text and multipart input:

```js
import {
  RequestBodyTooLargeError,
  readBoundedFormData,
  readBoundedText,
} from "../worker/request-body.ts";

await assert.rejects(
  readBoundedText(
    new Request("https://example.test", {
      method: "POST",
      headers: { "Content-Length": "9" },
    }),
    8,
  ),
  RequestBodyTooLargeError,
);

const body = new ReadableStream({
  start(controller) {
    controller.enqueue(new Uint8Array(6));
    controller.enqueue(new Uint8Array(3));
    controller.close();
  },
});
await assert.rejects(
  readBoundedText(
    new Request("https://example.test", {
      method: "POST",
      body,
      duplex: "half",
    }),
    8,
  ),
  RequestBodyTooLargeError,
);
```

Extend the onboarding transcription test with a raw multipart request above the bounded form limit, and extend the onboarding Worker test with a JSON stream above 16 KiB. Assert each returns the existing 413 error.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node --test tests/request-body.test.mjs tests/onboarding-transcription.test.mjs tests/onboarding-worker.test.mjs
```

Expected: FAIL because `worker/request-body.ts` and the pre-parse enforcement do not exist.

- [ ] **Step 3: Implement the bounded reader**

Implement a focused helper with no route knowledge:

```ts
export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body is too large.");
    this.name = "RequestBodyTooLargeError";
  }
}

async function readBoundedBytes(request: Request, maxBytes: number) {
  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength && /^\d+$/.test(declaredLength)) {
    if (Number(declaredLength) > maxBytes) throw new RequestBodyTooLargeError();
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readBoundedText(request: Request, maxBytes: number) {
  return new TextDecoder().decode(await readBoundedBytes(request, maxBytes));
}

export async function readBoundedFormData(request: Request, maxBytes: number) {
  const contentType = request.headers.get("Content-Type") ?? "";
  const bytes = await readBoundedBytes(request, maxBytes);
  return new Response(bytes, {
    headers: { "Content-Type": contentType },
  }).formData();
}
```

Use `readBoundedText` in `readJsonBody`. In onboarding transcription, cap the raw multipart body at `MAX_ONBOARDING_AUDIO_BYTES + 64 * 1024`, map helper overflow to `audio_too_large`, and retain the exact 512 KiB `File.size` check.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the Step 2 command. Expected: all focused tests pass.

- [ ] **Step 5: Commit**

```bash
git add worker/request-body.ts worker/onboarding.ts worker/groq.ts tests/request-body.test.mjs tests/onboarding-transcription.test.mjs tests/onboarding-worker.test.mjs
git commit -m "fix: bound onboarding request bodies"
```

### Task 2: Replace isolate-local rate limits

**Files:**
- Modify: `worker/api-security.ts`
- Modify: `worker/index.ts`
- Modify: `wrangler.jsonc`
- Test: `tests/api-security.test.mjs`
- Test: `tests/worker-auth.test.mjs`
- Test: `tests/onboarding-infrastructure.test.mjs`

- [ ] **Step 1: Write failing binding-backed rate-limit tests**

Replace time/map assertions with deterministic fake bindings:

```js
function fakeLimiter(successes) {
  const keys = [];
  return {
    keys,
    async limit({ key }) {
      keys.push(key);
      return { success: successes.shift() ?? false };
    },
  };
}

const limiter = fakeLimiter([true, false]);
const env = { EVALUATE_RATE_LIMITER: limiter };
assert.equal(await checkEvaluateSpeechRateLimit(request(), env), null);
const limited = await checkEvaluateSpeechRateLimit(request(), env);
assert.equal(limited.status, 429);
assert.deepEqual(limiter.keys, ["203.0.113.42", "203.0.113.42"]);
```

Add equivalent onboarding assertions for `user-1:203.0.113.42` for both transcription and enrichment. Parse `wrangler.jsonc` and require three bindings with limits 8, 6, and 12 and period 60. Update Worker dependency tests to use async checks.

- [ ] **Step 2: Run focused security tests and verify RED**

```bash
node --test tests/api-security.test.mjs tests/worker-auth.test.mjs tests/onboarding-infrastructure.test.mjs
```

Expected: FAIL because the environment has no binding contract and the functions are synchronous map counters.

- [ ] **Step 3: Implement one binding adapter and configure bindings**

Replace maps, integer parsing, clocks, and window state with:

```ts
export interface RateLimitBinding {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}

export interface RateLimitEnv {
  EVALUATE_RATE_LIMITER: RateLimitBinding;
  ONBOARDING_TRANSCRIPTION_RATE_LIMITER: RateLimitBinding;
  ONBOARDING_ENRICHMENT_RATE_LIMITER: RateLimitBinding;
}

async function checkRateLimit(
  binding: RateLimitBinding,
  key: string,
  message: string,
) {
  const { success } = await binding.limit({ key });
  return success
    ? null
    : jsonResponse(
        { error: "rate_limited", message },
        { status: 429, headers: { "Retry-After": "60" } },
      );
}
```

Keep the two exported functions as thin key/message adapters. Await them in `worker/index.ts`. Add two unique binding configurations in `wrangler.jsonc`:

```json
"ratelimits": [
  {
    "name": "EVALUATE_RATE_LIMITER",
    "namespace_id": "104201",
    "simple": { "limit": 8, "period": 60 }
  },
  {
    "name": "ONBOARDING_TRANSCRIPTION_RATE_LIMITER",
    "namespace_id": "104202",
    "simple": { "limit": 6, "period": 60 }
  },
  {
    "name": "ONBOARDING_ENRICHMENT_RATE_LIMITER",
    "namespace_id": "104203",
    "simple": { "limit": 12, "period": 60 }
  }
]
```

- [ ] **Step 4: Run focused security tests and verify GREEN**

Run the Step 2 command. Expected: all focused tests pass.

- [ ] **Step 5: Commit**

```bash
git add worker/api-security.ts worker/index.ts wrangler.jsonc tests/api-security.test.mjs tests/worker-auth.test.mjs tests/onboarding-infrastructure.test.mjs
git commit -m "fix: use platform speech rate limits"
```

### Task 3: Make profile capture abortable

**Files:**
- Modify: `src/OnboardingQuestion.tsx`
- Modify: `src/OnboardingGate.tsx`
- Modify: `src/ProfileEditor.tsx`
- Test: `tests/onboarding-ui.test.mjs`

- [ ] **Step 1: Write failing profile operation tests**

Extend the capture helper test so both dependencies receive the same signal. Render `ProfileEditorView` with a recording field and assert Save is disabled while Close and Cancel remain enabled; render with `isSaving: true` and assert all three are disabled. Add source assertions that closing the editor aborts the active capture controller and profile capture passes its signal. Keep the existing raw-string submission assertions: current main has no separate pending array state, so the pending-value finding is already superseded.

- [ ] **Step 2: Run the UI test and verify RED**

```bash
node --test tests/onboarding-ui.test.mjs
```

Expected: FAIL because capture does not forward a signal, closing does not abort physical work, and busy controls are not coordinated.

- [ ] **Step 3: Forward abort signals through capture**

Simplify `captureOnboardingAnswer` by removing its unused `save` option and accepting the dependency-compatible signal:

```ts
export async function captureOnboardingAnswer({
  record = recordSpeechClip,
  signal,
  transcribe = transcribeOnboardingAudio,
}: {
  record?: (options?: { signal?: AbortSignal }) => Promise<Blob>;
  signal?: AbortSignal;
  transcribe?: (
    audio: Blob,
    options?: { signal?: AbortSignal },
  ) => Promise<{ transcript: string }>;
}) {
  const audio = await record({ signal });
  return (await transcribe(audio, { signal })).transcript;
}
```

- [ ] **Step 4: Add one profile capture lifetime**

Keep an `AbortController` ref in `OnboardingGate` alongside the existing operation-generation ref. Starting profile capture aborts the previous controller. Closing the editor aborts and clears it while incrementing the existing generation. After every await, update state only when the controller is still current and not aborted; ignore `AbortError` and clear status only for the current controller.

Do not introduce a general operation manager. Use one local `cancelProfileCapture` callback and one ref.

- [ ] **Step 5: Coordinate profile controls**

In `ProfileEditorView`, derive whether any field status is active. Disable the editor fieldset and Save during capture or save. Keep Close and Cancel enabled during capture so they can abort it, but disable them during save.

- [ ] **Step 6: Run the UI test and verify GREEN**

Run the Step 2 command. Expected: all onboarding UI tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/OnboardingQuestion.tsx src/OnboardingGate.tsx src/ProfileEditor.tsx tests/onboarding-ui.test.mjs
git commit -m "fix: make profile edits cancellation safe"
```

### Task 4: Prevent partial deployment cancellation

**Files:**
- Modify: `.github/workflows/deploy-cloudflare.yml:12-15`
- Test: `tests/onboarding-infrastructure.test.mjs`

- [ ] **Step 1: Write the failing workflow assertion**

```js
assert.match(
  workflow,
  /concurrency:[\s\S]*cancel-in-progress:\s*false/,
  "Expected database and Worker deployment to finish as one serialized job",
);
```

- [ ] **Step 2: Run the infrastructure test and verify RED**

```bash
node --test tests/onboarding-infrastructure.test.mjs
```

Expected: FAIL because cancellation is currently enabled.

- [ ] **Step 3: Disable active-job cancellation**

Change only:

```yaml
concurrency:
  group: cloudflare-workers-${{ github.ref }}
  cancel-in-progress: false
```

- [ ] **Step 4: Run the infrastructure test and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy-cloudflare.yml tests/onboarding-infrastructure.test.mjs
git commit -m "fix: serialize production deployments"
```

### Task 5: Cascade bypass records from Better Auth sessions

**Files:**
- Modify: `src/db/schema.ts:221-233`
- Create: `migrations/0003_*.sql`
- Create: `migrations/meta/0003_snapshot.json`
- Modify: `migrations/meta/_journal.json`
- Test: `tests/onboarding-infrastructure.test.mjs`

- [ ] **Step 1: Write failing schema and lifecycle tests**

Require four migrations and a session foreign key with cascade behavior. Add a migration lifecycle test that:

```js
const database = new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys = ON");
for (const migration of readMigrations().slice(0, 3)) database.exec(migration.sql);
database.exec(`
  INSERT INTO user (id, name, email) VALUES ('user-1', 'Mia', 'mia@example.test');
  INSERT INTO session (id, expires_at, token, user_id)
  VALUES ('session-live', 9999999999999, 'token-live', 'user-1');
  INSERT INTO onboarding_session_bypass (session_id, auth_user_id, skipped_at)
  VALUES ('session-live', 'user-1', 1), ('session-orphan', 'user-1', 1);
`);
database.exec(readMigrations()[3].sql);
assert.deepEqual(
  database.prepare("SELECT session_id FROM onboarding_session_bypass ORDER BY session_id").all(),
  [{ session_id: "session-live" }],
);
database.exec("DELETE FROM session WHERE id = 'session-live'");
assert.equal(
  database.prepare("SELECT count(*) AS count FROM onboarding_session_bypass").get().count,
  0,
);
```

- [ ] **Step 2: Run the infrastructure test and verify RED**

```bash
node --test tests/onboarding-infrastructure.test.mjs
```

Expected: FAIL because only three migrations exist and bypass rows do not reference sessions.

- [ ] **Step 3: Update the Drizzle schema**

Change `sessionId` to:

```ts
sessionId: text("session_id")
  .primaryKey()
  .references(() => session.id, { onDelete: "cascade" }),
```

- [ ] **Step 4: Generate and harden the migration**

Run:

```bash
npm run db:generate
```

Expected: a new migration and snapshot rebuilding `onboarding_session_bypass`.

Adjust only the generated copy statement so it keeps valid, owner-matched sessions:

```sql
INSERT INTO `__new_onboarding_session_bypass` (`session_id`, `auth_user_id`, `skipped_at`)
SELECT bypass.`session_id`, bypass.`auth_user_id`, bypass.`skipped_at`
FROM `onboarding_session_bypass` AS bypass
INNER JOIN `session` AS auth_session
  ON auth_session.`id` = bypass.`session_id`
 AND auth_session.`user_id` = bypass.`auth_user_id`;
```

Preserve the generated table, foreign keys, rename, and index statements.

- [ ] **Step 5: Run infrastructure and Worker persistence tests and verify GREEN**

```bash
node --test tests/onboarding-infrastructure.test.mjs tests/onboarding-worker.test.mjs
```

Expected: all tests pass, including orphan pruning and delete cascade.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts migrations tests/onboarding-infrastructure.test.mjs
git commit -m "fix: expire onboarding session bypasses"
```

### Task 6: Full verification and focused diff review

**Files:**
- Review all files changed by Tasks 1-5.

- [ ] **Step 1: Run the complete test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Run lint and production build**

```bash
npm run lint
npm run build
```

Expected: lint has no errors and only the existing generated-file warnings; TypeScript and Vite build pass.

- [ ] **Step 3: Verify migration and diff hygiene**

```bash
git diff origin/main...HEAD --check
git status --short --branch
git diff --stat origin/main...HEAD
```

Expected: no whitespace errors, a clean worktree, and changes limited to the design/plan plus the focused implementation and tests.

- [ ] **Step 4: Audit simplification and regressions**

Confirm:

- no module-level rate-limit maps or timer/window arithmetic remain;
- JSON and multipart handlers share the bounded-reader implementation;
- no profile recording survives close/cancel;
- no general operation framework or broad component split was introduced;
- existing API error identifiers and successful payloads remain unchanged;
- deployment mutation order remains migration then deploy; and
- the bypass migration preserves only valid session-owned rows.

- [ ] **Step 5: Commit any test-only cleanup required by verification**

If verification requires a focused test correction, stage only that correction and commit:

```bash
git commit -m "test: complete review hardening coverage"
```

Otherwise, do not create an empty commit.
