# Onboarding Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make onboarding transitions recoverable, optional questions skippable, session bypass resilient to questionnaire outages, transcription abuse-bounded, and questionnaire versions immutable.

**Architecture:** Keep the current questionnaire/profile model, add one migration for the three missing persistence concepts, and move final completion into the server-owned answer transition. Expose a discriminated degraded-access payload when questionnaire content is unavailable, while retaining the existing full payload for normal onboarding and profile editing.

**Tech Stack:** React 19, TypeScript, Cloudflare Workers, D1/SQLite, Drizzle ORM, Better Auth, Node test runner, ESLint, Vite.

---

## File Structure

- `lib/onboarding.js`: pure skipped-question parsing and next-question rules.
- `src/db/schema.ts`: Drizzle columns/table for hashes, skipped keys, and session bypasses.
- `migrations/0002_onboarding_review_fixes.sql`: additive production schema and v1 hash backfill.
- `migrations/meta/0002_snapshot.json`, `migrations/meta/_journal.json`: Drizzle migration metadata.
- `scripts/publish-questionnaire.mjs`: canonical hashing and immutable/idempotent activation SQL.
- `worker/onboarding-repository.ts`: D1 access, session bypass, and atomic profile transition writes.
- `worker/onboarding.ts`: authenticated answer, optional skip, degraded access, and completion flow.
- `worker/api-security.ts`, `worker/index.ts`, `worker/groq.ts`: transcription rate and payload limits.
- `src/onboarding-api.ts`, `src/OnboardingGate.tsx`, `src/OnboardingQuestion.tsx`: discriminated payloads and optional skip controls.
- `.github/workflows/deploy-cloudflare.yml`: migrate and publish before deploy.
- `tests/onboarding-*.test.mjs`, `tests/api-security.test.mjs`, `tests/worker-auth.test.mjs`: regression coverage.

### Task 1: Model Optional-Question Handling in the Pure Domain Layer

**Files:**
- Modify: `tests/onboarding-domain.test.mjs`
- Modify: `lib/onboarding.js`

- [ ] **Step 1: Write failing skipped-question tests**

Add imports and cases that establish the desired pure API:

```js
import {
  readSkippedQuestionKeys,
  skipProfileQuestion,
  writeProfileAnswer,
} from "../lib/onboarding.js";

it("advances past explicitly skipped optional questions in position order", () => {
  const questions = [
    question({ answerKey: "favorite", position: 1, required: false }),
    question({ answerKey: "age", answerType: "number", position: 2 }),
  ];
  const profile = skipProfileQuestion(
    { answersJson: "{}", skippedQuestionKeysJson: "[]" },
    "favorite",
  );

  assert.deepEqual(readSkippedQuestionKeys(profile), ["favorite"]);
  assert.equal(
    getNextQuestion({
      answers: {},
      currentQuestionKey: null,
      questions,
      skippedQuestionKeys: readSkippedQuestionKeys(profile),
    })?.answerKey,
    "age",
  );
});

it("removes an optional key from the skipped set when it receives an answer", () => {
  const profile = writeProfileAnswer(
    {
      answersJson: "{}",
      skippedQuestionKeysJson: '["favorite"]',
    },
    "favorite",
    "Bluey",
  );

  assert.deepEqual(readSkippedQuestionKeys(profile), []);
  assert.deepEqual(JSON.parse(profile.answersJson), { favorite: "Bluey" });
});
```

- [ ] **Step 2: Run the domain test and verify RED**

Run: `node --test tests/onboarding-domain.test.mjs`

Expected: FAIL because the skipped-question helpers do not exist and `getNextQuestion` does not accept skipped keys.

- [ ] **Step 3: Implement skipped-question helpers and ordered progression**

Add strict JSON-array parsing and use it when determining whether a question is handled:

```js
export function readSkippedQuestionKeys(profile) {
  let value;
  try {
    value = JSON.parse(profile.skippedQuestionKeysJson ?? "[]");
  } catch {
    throw new Error("Invalid learner profile data.");
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error("Invalid learner profile data.");
  }
  return [...new Set(value)];
}

export function skipProfileQuestion(profile, answerKey) {
  const skipped = new Set(readSkippedQuestionKeys(profile));
  skipped.add(answerKey);
  return { ...profile, skippedQuestionKeysJson: JSON.stringify([...skipped]) };
}
```

Update `writeProfileAnswer` to delete `answerKey` from the skipped set. Update `getNextQuestion` and `getProgress` to accept `skippedQuestionKeys = []`, preserve sorted questionnaire order, and consider a skipped key handled only when its question is optional.

- [ ] **Step 4: Run the domain test and verify GREEN**

Run: `node --test tests/onboarding-domain.test.mjs`

Expected: PASS with the new optional-skip cases and existing branching/completion cases.

- [ ] **Step 5: Commit the domain behavior**

```bash
git add lib/onboarding.js tests/onboarding-domain.test.mjs
git commit -m "fix: model optional onboarding skips"
```

### Task 2: Add Persistent Hash, Optional-Skip, and Session-Bypass State

**Files:**
- Modify: `tests/onboarding-infrastructure.test.mjs`
- Modify: `src/db/schema.ts`
- Create: `migrations/0002_onboarding_review_fixes.sql`
- Create: `migrations/meta/0002_snapshot.json`
- Modify: `migrations/meta/_journal.json`

- [ ] **Step 1: Write failing schema and migration tests**

Extend `EXPECTED_MODELS` and the migrated-database assertions:

```js
questionnaire: {
  table: "questionnaire",
  properties: [
    "id", "version", "status", "definitionHash", "createdAt", "activatedAt",
  ],
},
learnerProfile: {
  table: "learner_profile",
  properties: [
    "id", "authUserId", "name", "age", "answersJson",
    "skippedQuestionKeysJson", "questionnaireVersion", "currentQuestionKey",
    "onboardingStatus", "lastSkippedAt", "lastSkippedSessionId",
    "completedAt", "createdAt", "updatedAt",
  ],
},
onboardingSessionBypass: {
  table: "onboarding_session_bypass",
  properties: ["sessionId", "authUserId", "skippedAt"],
},
```

Assert three migrations, valid JSON checks for `skipped_question_keys_json`, foreign-key cascades from bypass rows to `user`, and an `auth_user_id` bypass index.

- [ ] **Step 2: Run the infrastructure test and verify RED**

Run: `node --test tests/onboarding-infrastructure.test.mjs`

Expected: FAIL because the new columns/table and third migration are absent.

- [ ] **Step 3: Add the Drizzle schema**

Add:

```ts
definitionHash: text("definition_hash"),
```

to `questionnaire`, and:

```ts
skippedQuestionKeysJson: text("skipped_question_keys_json")
  .default("[]")
  .notNull(),
```

to `learnerProfile`, including a `json_valid` check. Define:

```ts
export const onboardingSessionBypass = sqliteTable(
  "onboarding_session_bypass",
  {
    sessionId: text("session_id").primaryKey(),
    authUserId: text("auth_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    skippedAt: integer("skipped_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("onboarding_session_bypass_user_idx").on(table.authUserId)],
);
```

Add the user/bypass relation exports.

- [ ] **Step 4: Generate and normalize the additive migration**

Run: `npm run db:generate`

Rename the generated SQL to `migrations/0002_onboarding_review_fixes.sql` and update the generated journal tag. Ensure the SQL is additive and contains this v1 backfill:

```sql
UPDATE `questionnaire`
SET `definition_hash` = '0e256950166405c15d0b7e303b733240f19558bb7aad48d217caaaf344014b8d'
WHERE `id` = 'voice-onboarding-v1' AND `version` = 1 AND `definition_hash` IS NULL;
```

- [ ] **Step 5: Run the infrastructure test and verify GREEN**

Run: `node --test tests/onboarding-infrastructure.test.mjs`

Expected: PASS, including applying all three migrations to an in-memory SQLite database.

- [ ] **Step 6: Commit the persistence layer**

```bash
git add src/db/schema.ts migrations tests/onboarding-infrastructure.test.mjs
git commit -m "feat: persist onboarding recovery state"
```

### Task 3: Make Questionnaire Publishing Immutable and Deployment Ordered

**Files:**
- Modify: `tests/onboarding-infrastructure.test.mjs`
- Modify: `scripts/publish-questionnaire.mjs`
- Modify: `.github/workflows/deploy-cloudflare.yml`

- [ ] **Step 1: Write failing publication and workflow tests**

Add an in-memory transaction test that publishes v1 twice unchanged, then
attempts a changed validation under the same ID/version and verifies rollback:

```js
const originalSql = buildQuestionnaireSql(definition, 1_000);
database.exec(originalSql);
database.exec(buildQuestionnaireSql(definition, 2_000));

const changed = structuredClone(definition);
changed.questions[0].validation.max = 18;
assert.throws(() => {
  database.exec(`BEGIN; ${buildQuestionnaireSql(changed, 3_000)} COMMIT;`);
}, /constraint/i);
database.exec("ROLLBACK");

assert.equal(
  database.prepare("SELECT definition_hash FROM questionnaire WHERE version = 1").get()
    .definition_hash,
  questionnaireDefinitionHash(definition),
);
assert.equal(
  database.prepare("SELECT validation_json FROM questionnaire_question WHERE answer_key = 'age'").get()
    .validation_json,
  '{"min":3,"max":17}',
);
```

Read the deployment workflow and assert that `d1 migrations apply`,
`questionnaire:publish`, and `wrangler deploy` occur in that order.

- [ ] **Step 2: Run the infrastructure test and verify RED**

Run: `node --test tests/onboarding-infrastructure.test.mjs`

Expected: FAIL because hashes, immutable conflict handling, and deployment steps are absent.

- [ ] **Step 3: Implement canonical definition hashing**

Import `createHash` from `node:crypto` and export:

```js
export function questionnaireDefinitionHash(definition) {
  const validated = validateQuestionnaireDefinition(definition);
  const persisted = {
    id: validated.id,
    version: validated.version,
    introductionAudioId: validated.introductionAudioId,
    questions: validated.questions.map((entry) => ({
      answerKey: entry.answerKey,
      position: entry.position,
      promptEn: entry.promptEn,
      promptZh: entry.promptZh,
      answerType: entry.answerType,
      cardinality: entry.cardinality,
      required: entry.required,
      options: entry.options,
      validation: entry.validation,
      branching: entry.branching,
      audioId: entry.audioId,
    })),
  };
  return createHash("sha256").update(JSON.stringify(persisted)).digest("hex");
}
```

Include `definition_hash` in the questionnaire insert. On ID conflict, set
`status` to `active` only when both version and hash match; otherwise assign an
invalid status such as `immutable_conflict` so the existing status check aborts
the atomic D1 import.

- [ ] **Step 4: Order production database work before deployment**

Insert these workflow steps immediately before Worker deployment:

```yaml
      - name: Apply D1 migrations
        run: npx wrangler d1 migrations apply parrot-english --remote

      - name: Publish onboarding questionnaire
        run: npm run questionnaire:publish -- --remote
```

- [ ] **Step 5: Run the infrastructure test and verify GREEN**

Run: `node --test tests/onboarding-infrastructure.test.mjs`

Expected: PASS for idempotent republish, immutable conflict rollback, and workflow order.

- [ ] **Step 6: Commit publishing and deployment changes**

```bash
git add scripts/publish-questionnaire.mjs .github/workflows/deploy-cloudflare.yml tests/onboarding-infrastructure.test.mjs
git commit -m "fix: publish immutable questionnaires"
```

### Task 4: Make Server Transitions Atomic and Session Bypass Degraded-Safe

**Files:**
- Modify: `tests/onboarding-worker.test.mjs`
- Modify: `worker/onboarding-repository.ts`
- Modify: `worker/onboarding.ts`

- [ ] **Step 1: Write failing Worker regressions**

Add cases that:

1. save all five answers and assert the fifth answer response is already completed;
2. issue `POST /api/onboarding/question/skip` for an optional current question and reject the same request for a required question;
3. remove the active questionnaire, issue `POST /api/onboarding/skip`, and expect `{ mode: "bypass-only", canBypass: true }`;
4. reload that same session and receive degraded access;
5. skip two concurrent sessions and verify both bypass rows remain;
6. remove questionnaire content for a completed profile and still receive degraded access.

Use explicit session rows in seeded tests:

```js
state.sqlite.prepare(
  "INSERT INTO session (id, token, expires_at, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?)",
).run(sessionId, `token-${sessionId}`, 9_999_999_999_999, 1_000, 1_000, "user-1");
```

- [ ] **Step 2: Run the Worker test and verify RED**

Run: `node --test tests/onboarding-worker.test.mjs`

Expected: FAIL because final answer remains `in_progress`, optional skip is missing, and skip still requires questionnaire state.

- [ ] **Step 3: Add repository access and transition methods**

Implement:

```ts
async function hasSessionBypass(identity: OnboardingIdentity) {
  const [row] = await database
    .select({ sessionId: onboardingSessionBypass.sessionId })
    .from(onboardingSessionBypass)
    .where(
      and(
        eq(onboardingSessionBypass.sessionId, identity.sessionId),
        eq(onboardingSessionBypass.authUserId, identity.userId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function canBypass(identity: OnboardingIdentity) {
  const profile = await findProfile(identity.userId);
  return (
    profile?.onboardingStatus === "completed" ||
    profile?.lastSkippedSessionId === identity.sessionId ||
    (await hasSessionBypass(identity))
  );
}

async function skipSession(identity: OnboardingIdentity) {
  const skippedAt = now();
  await database
    .insert(onboardingSessionBypass)
    .values({
      sessionId: identity.sessionId,
      authUserId: identity.userId,
      skippedAt,
    })
    .onConflictDoUpdate({
      target: onboardingSessionBypass.sessionId,
      set: { authUserId: identity.userId, skippedAt },
    });
}

async function saveTransition(profileId: string, values: {
  age?: number | null;
  answersJson: string;
  skippedQuestionKeysJson: string;
  currentQuestionKey: string | null;
  name?: string | null;
  onboardingStatus: "in_progress" | "completed";
  completedAt: Date | null;
}) {
  await database
    .update(learnerProfile)
    .set({ ...values, updatedAt: now() })
    .where(eq(learnerProfile.id, profileId));
}
```

Keep legacy `lastSkippedSessionId` as a read fallback for sessions skipped before this migration.

- [ ] **Step 4: Centralize server-owned progression**

In `worker/onboarding.ts`, compute the transition after an answer or optional skip:

```ts
function transitionFor(state, updatedProfile) {
  const answers = readProfileAnswers(updatedProfile);
  const skippedQuestionKeys = readSkippedQuestionKeys(updatedProfile);
  const next = getNextQuestion({
    answers,
    currentQuestionKey: null,
    questions: state.questions,
    skippedQuestionKeys,
  });
  const completion = canCompleteQuestionnaire(state.questions, answers);
  const completed = !next && completion.complete;
  return {
    currentQuestionKey: next?.answerKey ?? null,
    onboardingStatus: completed ? "completed" : "in_progress",
    completedAt: completed ? new Date() : null,
  };
}
```

Use `saveTransition` for answer and optional skip. Verify the requested key is the current question and optional before calling `skipProfileQuestion`. Add `/api/onboarding/question/skip` to recognized/protected routes.

- [ ] **Step 5: Return degraded access for eligible identities**

Add `{ mode: "full" }` to normal payloads. For GET failures, return bypass-only only when `repository.canBypass(identity)` is true. For POST skip, write `skipSession` first, then return either the full payload or:

```ts
return jsonResponse({ mode: "bypass-only", canBypass: true });
```

Do not convert failures to degraded access for unskipped, incomplete sessions.

- [ ] **Step 6: Run the Worker test and verify GREEN**

Run: `node --test tests/onboarding-worker.test.mjs`

Expected: PASS for atomic completion, optional skip, multi-session bypass, and questionnaire-outage access.

- [ ] **Step 7: Commit server transition fixes**

```bash
git add worker/onboarding-repository.ts worker/onboarding.ts tests/onboarding-worker.test.mjs
git commit -m "fix: make onboarding transitions recoverable"
```

### Task 5: Protect Paid Onboarding Transcription

**Files:**
- Modify: `tests/api-security.test.mjs`
- Modify: `tests/worker-auth.test.mjs`
- Modify: `tests/onboarding-transcription.test.mjs`
- Modify: `worker/api-security.ts`
- Modify: `worker/index.ts`
- Modify: `worker/groq.ts`

- [ ] **Step 1: Write failing limiter and routing tests**

In `tests/api-security.test.mjs`, call a new checker twice with the same user/IP and assert the third call returns 429, while a different user on the same IP is allowed:

```js
assert.equal(checkOnboardingTranscriptionRateLimit(request(), env, "user-1", 0), null);
assert.equal(checkOnboardingTranscriptionRateLimit(request(), env, "user-1", 1_000), null);
assert.equal(
  checkOnboardingTranscriptionRateLimit(request(), env, "user-1", 2_000).status,
  429,
);
assert.equal(
  checkOnboardingTranscriptionRateLimit(request(), env, "user-2", 2_000),
  null,
);
```

In `tests/worker-auth.test.mjs`, inject the new checker and prove it runs only for the exact transcription route after authentication and before the onboarding handler. In the transcription test, assert a file larger than 512 KiB is rejected before `fetch`.

- [ ] **Step 2: Run the security tests and verify RED**

Run: `node --test tests/api-security.test.mjs tests/worker-auth.test.mjs tests/onboarding-transcription.test.mjs`

Expected: FAIL because the new checker and reduced upload limit are absent.

- [ ] **Step 3: Implement a scoped rate-limit helper**

Refactor the existing bucket logic into a private helper and export:

```ts
export function checkOnboardingTranscriptionRateLimit(
  request: Request,
  env: RateLimitEnv,
  userId: string,
  now = Date.now(),
) {
  return checkRateLimit({
    buckets: onboardingTranscriptionRateLimitBuckets,
    key: `${userId}:${getClientAddress(request)}`,
    maxRequests: readPositiveInteger(env.ONBOARDING_TRANSCRIPTION_RATE_LIMIT_MAX, 6),
    windowSeconds: readPositiveInteger(
      env.ONBOARDING_TRANSCRIPTION_RATE_LIMIT_WINDOW_SECONDS,
      60,
    ),
    message: "Too many transcription requests. Please wait and try again.",
    now,
  });
}
```

Extend `Env` and `WorkerDependencies`, then call this checker for
`/api/onboarding/transcribe` after session lookup and before `onboardingRequest`.

- [ ] **Step 4: Reduce the onboarding-only upload bound**

Keep the lesson evaluation limit at 6 MiB and add:

```ts
const MAX_ONBOARDING_AUDIO_BYTES = 512 * 1024;
```

Reject zero-byte and larger onboarding files before building the Groq form.

- [ ] **Step 5: Run the security tests and verify GREEN**

Run: `node --test tests/api-security.test.mjs tests/worker-auth.test.mjs tests/onboarding-transcription.test.mjs`

Expected: PASS with no Groq handler invocation after a rate-limit or payload rejection.

- [ ] **Step 6: Commit transcription protection**

```bash
git add worker/api-security.ts worker/index.ts worker/groq.ts tests/api-security.test.mjs tests/worker-auth.test.mjs tests/onboarding-transcription.test.mjs
git commit -m "fix: protect onboarding transcription"
```

### Task 6: Update the Browser for Degraded Access and Optional Skip

**Files:**
- Modify: `tests/onboarding-api.test.mjs`
- Modify: `tests/onboarding-ui.test.mjs`
- Modify: `src/onboarding-api.ts`
- Modify: `src/OnboardingGate.tsx`
- Modify: `src/OnboardingQuestion.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing browser API and UI tests**

Add an API assertion for:

```js
await skipOnboardingQuestion("favorite", { fetch: request.fetch });
assert.equal(request.calls[0][0], "/api/onboarding/question/skip");
assert.equal(request.calls[0][1].body, '{"questionKey":"favorite"}');
```

Update UI fixtures with `mode: "full"`. Add a bypass-only render case that shows lesson content without the profile button, and an optional-question case that renders **Skip question** while required/profile questions do not.

Replace the old two-call completion test with:

```js
it("uses the server-completed answer response directly", async () => {
  const completedState = {
    ...incompleteData,
    mode: "full",
    canBypass: true,
    question: null,
    profile: { ...incompleteData.profile, onboardingStatus: "completed" },
  };
  let saveCalls = 0;
  const result = await saveQuestionAndAdvance({
    questionKey: "favoriteStoryTopics",
    value: ["space"],
    async save() {
      saveCalls += 1;
      return completedState;
    },
  });
  assert.equal(saveCalls, 1);
  assert.equal(result, completedState);
});
```

- [ ] **Step 2: Run browser tests and verify RED**

Run: `node --test tests/onboarding-api.test.mjs tests/onboarding-ui.test.mjs`

Expected: FAIL because payload modes and optional skip APIs/controls are absent and completion still makes two requests.

- [ ] **Step 3: Add discriminated API payloads**

Define:

```ts
export type FullOnboardingState = {
  mode: "full";
  profile: LearnerProfileSummary;
  questionnaire: { version: number; introductionAudio: OnboardingAudio };
  question: OnboardingQuestion | null;
  progress: { answered: number; current: number; total: number };
  canBypass: boolean;
};

export type BypassOnlyOnboardingState = {
  mode: "bypass-only";
  canBypass: true;
};

export type OnboardingState = FullOnboardingState | BypassOnlyOnboardingState;
```

Add `skipOnboardingQuestion(questionKey)` using JSON POST.

- [ ] **Step 4: Narrow full state and remove the second completion call**

In `OnboardingGate`, derive:

```ts
const fullData = data?.mode === "full" ? data : null;
```

Use `fullData` for profile/question/audio fields and use `data?.canBypass` for lesson access. Do not show the profile button for bypass-only state. Simplify `saveQuestionAndAdvance` to return the save response directly.

- [ ] **Step 5: Wire optional-question skip**

Add `onSkipQuestion` to `OnboardingQuestionView`. Render it only when
`mode === "onboarding" && !question.required`, and call the new API from
`OnboardingGate`, updating state with the returned transition.

- [ ] **Step 6: Run browser tests and verify GREEN**

Run: `node --test tests/onboarding-api.test.mjs tests/onboarding-ui.test.mjs`

Expected: PASS for one-request completion, bypass-only lesson access, profile-button suppression, and optional skip controls.

- [ ] **Step 7: Commit client recovery behavior**

```bash
git add src/onboarding-api.ts src/OnboardingGate.tsx src/OnboardingQuestion.tsx src/styles.css tests/onboarding-api.test.mjs tests/onboarding-ui.test.mjs
git commit -m "fix: recover onboarding access in the client"
```

### Task 7: Full Verification and Handoff

**Files:**
- Modify only if verification exposes a regression in the files above.

- [ ] **Step 1: Run all repository unit tests**

Run: `npm test`

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run lint and TypeScript checks**

Run: `npm run lint`

Expected: exit 0 with no ESLint errors.

Run: `npx tsc --noEmit`

Expected: exit 0 with no TypeScript errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: TypeScript and Vite production build complete successfully.

- [ ] **Step 4: Check migration and diff hygiene**

```bash
git diff origin/main...HEAD --check
git status --short
```

Expected: no whitespace errors and no uncommitted generated artifacts.

- [ ] **Step 5: Review the final commit range**

```bash
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
```

Expected: design, domain, persistence, publisher, Worker, security, and client commits only.
