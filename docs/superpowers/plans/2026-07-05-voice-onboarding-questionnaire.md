# Voice Onboarding Questionnaire Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a database-defined, voice-assisted onboarding questionnaire and reusable profile editor between authenticated learners and the lesson player.

**Architecture:** Extend the existing Better Auth/Drizzle/shared-D1 boundary with separate learner profile and questionnaire tables. Keep answer validation, canonical-field mapping, branching, progress, completion, and skip-session decisions in a pure shared module; expose them through authenticated Worker routes backed by a Drizzle repository. Compose `AuthGate -> OnboardingGate -> LessonPlayer`, with a reusable one-question form for onboarding and profile editing, static audio resolved by ID, and Groq transcription used only to prefill editable inputs.

**Tech Stack:** React 19, TypeScript, Cloudflare Workers/D1, Drizzle ORM/Kit, Better Auth, Node test runner, Groq Whisper, ElevenLabs static MP3 assets.

---

## File map

- `src/db/schema.ts`: add application-owned profile/questionnaire tables and relations without modifying Better Auth tables.
- `migrations/0001_*.sql`, `migrations/meta/*`: Drizzle-generated forward migration and schema metadata.
- `lib/onboarding.js`: pure parsing, normalization, validation, branching, next-question, completion, assignment, and skip-session helpers.
- `content/onboarding/questionnaire-v1.json`: checked-in initial questionnaire data.
- `scripts/publish-questionnaire.mjs`: validate questionnaire/audio contracts and publish data-only D1 statements through Wrangler.
- `lib/static-audio.js`, `public/assets/audio/onboarding-*.mp3`: saved introduction/question audio registry and ElevenLabs-generated source assets.
- `worker/onboarding-repository.ts`: Drizzle reads/writes for profile assignment, answer persistence, completion, skip, and profile updates.
- `worker/onboarding.ts`: authenticated route contracts, request validation, safe errors, and response shaping.
- `worker/groq.ts`: shared bounded transcription primitive plus transcript-only onboarding handler.
- `worker/index.ts`: session-first routing for onboarding/profile endpoints using the request-scoped shared D1 client.
- `src/onboarding-api.ts`: typed same-origin browser requests and transcription upload.
- `src/OnboardingQuestion.tsx`: reusable one-question form with typed/choice input, array chips, Replay, and editable transcription.
- `src/OnboardingGate.tsx`: onboarding load/start/save/skip/resume/complete state and profile editor entry.
- `src/App.tsx`: explicit `AuthGate -> OnboardingGate -> LessonPlayer` composition.
- `src/styles.css`: responsive, accessible onboarding/profile presentation and reduced-motion behavior.
- `tests/onboarding-domain.test.mjs`: pure questionnaire behavior.
- `tests/onboarding-infrastructure.test.mjs`: tables, relations, migration, registry, and publisher validation.
- `tests/onboarding-worker.test.mjs`: authenticated route and persistence behavior against migrated in-memory SQLite through a D1-compatible test adapter.
- `tests/onboarding-transcription.test.mjs`: transcript-only Groq behavior and bounded input failures.
- `tests/onboarding-api.test.mjs`: browser request contracts and error handling.
- `tests/onboarding-ui.test.mjs`: gate composition and executable one-question/profile views.
- `tests/helpers/d1-test-database.mjs`: minimal D1-compatible wrapper around Node SQLite for repository tests.

### Task 1: Drizzle application schema and generated migration

**Files:**
- Modify: `src/db/schema.ts`
- Create: `tests/onboarding-infrastructure.test.mjs`
- Generate: `migrations/0001_*.sql`
- Generate: `migrations/meta/0001_snapshot.json`
- Modify: `migrations/meta/_journal.json`

- [ ] **Step 1: Write failing infrastructure assertions**

Add assertions that `learner_profile`, `questionnaire`, and `questionnaire_question` expose the approved columns; `learner_profile.auth_user_id` is unique and cascades from `user.id`; question keys and positions are unique within a questionnaire; status/type/cardinality and JSON-validity checks exist; and timestamps/indexes match the design.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/onboarding-infrastructure.test.mjs`

Expected: FAIL because the application tables and second migration do not exist.

- [ ] **Step 3: Add the minimum Drizzle schema**

Define `learnerProfile`, `questionnaire`, `questionnaireQuestion`, and their relations with stable camelCase properties mapped to the approved snake_case columns. Use Drizzle `check`, `uniqueIndex`, and `index` declarations; keep learner fields separate from Better Auth's `user` table.

- [ ] **Step 4: Generate and inspect the migration**

Run: `npm run db:generate`

Inspect the generated SQL for exactly three additive tables, cascade behavior, JSON checks, allowed-value checks, lookup indexes, and no DML or Better Auth table rewrites.

- [ ] **Step 5: Verify GREEN**

Run: `node --test tests/auth-infrastructure.test.mjs tests/onboarding-infrastructure.test.mjs`

Expected: PASS.

### Task 2: Pure questionnaire rules

**Files:**
- Create: `lib/onboarding.js`
- Create: `tests/onboarding-domain.test.mjs`

- [ ] **Step 1: Write failing tests for normalization and validation**

Cover trimmed scalar text, integer ranges, option membership, scalar/array shape, maximum array length, case-insensitive duplicate removal, required values, and safe rejection of malformed JSON configuration.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/onboarding-domain.test.mjs`

Expected: FAIL because `lib/onboarding.js` does not exist.

- [ ] **Step 3: Implement minimal validation helpers**

Export `parseQuestionConfig`, `normalizeAnswer`, and `validateAnswer`. Return `{ value }` on success or `{ error }` with a field-safe message; never trust client-provided answer metadata.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/onboarding-domain.test.mjs`

Expected: PASS for validation tests.

- [ ] **Step 5: Write the next failing tests for storage, branching, progress, completion, assignment, and skip**

Assert that `name` and `age` map only to dedicated columns; unknown keys map beneath `answers_json`; declarative `equals`, `notEquals`, `includes`, and `notIncludes` rules are deterministic; next question is the first applicable unanswered required question or the saved applicable question; completed profiles keep their version; incomplete profiles keep an existing assignment; and only the exact skipped Better Auth session bypasses onboarding.

- [ ] **Step 6: Verify RED, implement the minimum helpers, and verify GREEN**

Run RED and GREEN with: `node --test tests/onboarding-domain.test.mjs`

Implement `readProfileAnswers`, `writeProfileAnswer`, `isQuestionApplicable`, `getApplicableQuestions`, `getNextQuestion`, `getProgress`, `canCompleteQuestionnaire`, `assignQuestionnaireVersion`, and `canSkipForSession`.

### Task 3: Initial questionnaire publisher and static audio contract

**Files:**
- Create: `content/onboarding/questionnaire-v1.json`
- Create: `scripts/publish-questionnaire.mjs`
- Modify: `package.json`
- Modify: `lib/static-audio.js`
- Create: `public/assets/audio/onboarding-introduction.mp3`
- Create: `public/assets/audio/onboarding-age.mp3`
- Create: `public/assets/audio/onboarding-favourite-cartoons.mp3`
- Create: `public/assets/audio/onboarding-favourite-animals.mp3`
- Create: `public/assets/audio/onboarding-favourite-activities.mp3`
- Create: `public/assets/audio/onboarding-favourite-story-topics.mp3`
- Modify: `tests/onboarding-infrastructure.test.mjs`
- Modify: `tests/static-audio.test.mjs`

- [ ] **Step 1: Write failing publisher/audio assertions**

Require five contiguous initial questions; stable unique keys; supported types/cardinalities; earlier-key-only branch references; reachable required questions; exact `peppa` prompt/audio matches; safe SQL literal escaping; one Wrangler execution containing deactivation plus idempotent questionnaire/question upserts; and existing MP3 files for the introduction and every prompt.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/onboarding-infrastructure.test.mjs tests/static-audio.test.mjs`

Expected: FAIL because the definition, publisher, registry entries, and files are absent.

- [ ] **Step 3: Implement the validated data-only publisher**

Export testable `validateQuestionnaireDefinition` and `buildQuestionnaireSql`; when invoked directly, require exactly one of `--local` or `--remote`, write a temporary SQL batch, call `wrangler d1 execute parrot-english --file ...`, and always delete the temporary file. Add `questionnaire:publish` to `package.json`.

- [ ] **Step 4: Register and generate only the six new audio IDs**

Use `speaker: "peppa"`, the approved Summer voice default, `eleven_v3`, exact visible English text, and character-directed performance metadata. Run:

`npm run generate:audio:elevenlabs -- --only=onboarding-introduction --only=onboarding-age --only=onboarding-favourite-cartoons --only=onboarding-favourite-animals --only=onboarding-favourite-activities --only=onboarding-favourite-story-topics`

- [ ] **Step 5: Verify GREEN**

Run: `node --test tests/onboarding-infrastructure.test.mjs tests/static-audio.test.mjs tests/generate-static-audio.test.mjs`

Expected: PASS.

### Task 4: Drizzle repository and onboarding/profile routes

**Files:**
- Create: `tests/helpers/d1-test-database.mjs`
- Create: `tests/onboarding-worker.test.mjs`
- Create: `worker/onboarding-repository.ts`
- Create: `worker/onboarding.ts`
- Modify: `worker/index.ts`

- [ ] **Step 1: Write failing anonymous-routing tests**

For every onboarding and profile endpoint, assert a `401 { error: "unauthorized" }` before repository or transcription work. Assert wrong methods return 405 and non-API paths still reach assets.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/onboarding-worker.test.mjs`

Expected: FAIL because onboarding routes are not registered.

- [ ] **Step 3: Add session-first route dispatch**

Construct Better Auth once per protected request, derive `user.id`, `user.name`, and `session.id` only from the session, create Drizzle from `env.DB`, and dispatch to an injected onboarding handler.

- [ ] **Step 4: Verify GREEN for routing**

Run: `node --test tests/worker-auth.test.mjs tests/onboarding-worker.test.mjs`

Expected: PASS for routing cases.

- [ ] **Step 5: Write failing migrated-database tests**

Using the D1-compatible SQLite helper, apply checked-in migrations and seed questionnaire data. Cover profile creation with auth-name prefill and fixed active version, loading/resume, canonical age persistence, JSON array persistence, invalid and retired keys, deterministic branch advancement, exact-session skip, required completion, completed-user behavior after v2 activation, and profile edits through shared validation.

- [ ] **Step 6: Verify RED**

Run: `node --test tests/onboarding-worker.test.mjs`

Expected: FAIL because repository operations are absent.

- [ ] **Step 7: Implement repository and handlers minimally**

Use Drizzle queries only. Create a missing profile with `crypto.randomUUID()`, auth-name prefill, and the active questionnaire version; preserve existing incomplete and completed assignments. Resolve each question audio ID through `STATIC_AUDIO_LINES`, persist after each confirmed answer, return only safe profile/question/progress fields, and reuse the same validation/mapping functions for `PUT /api/profile`.

- [ ] **Step 8: Verify GREEN**

Run: `node --test tests/onboarding-domain.test.mjs tests/onboarding-worker.test.mjs tests/worker-auth.test.mjs`

Expected: PASS.

### Task 5: Transcript-only onboarding speech endpoint

**Files:**
- Modify: `worker/groq.ts`
- Modify: `worker/onboarding.ts`
- Create: `tests/onboarding-transcription.test.mjs`

- [ ] **Step 1: Write failing transcription tests**

Assert POST-only behavior, required audio, supported `audio/webm`, `audio/mp4`, `audio/mpeg`, `audio/ogg`, and `audio/wav`, six-megabyte bound, timeout/provider-safe errors, English Whisper parameters, trimmed `{ transcript }` success, and no persistence callback.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/onboarding-transcription.test.mjs`

Expected: FAIL because the transcript-only handler does not exist.

- [ ] **Step 3: Extract the minimal shared Groq transcription primitive**

Keep lesson scoring behavior unchanged. Add `handleOnboardingTranscription` that validates the bounded file and returns transcript text only, with no raw audio retention and no database access.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/groq.test.mjs tests/onboarding-transcription.test.mjs tests/onboarding-worker.test.mjs`

Expected: PASS.

### Task 6: Typed browser API boundary

**Files:**
- Create: `src/onboarding-api.ts`
- Create: `tests/onboarding-api.test.mjs`

- [ ] **Step 1: Write failing request-contract tests**

Cover same-origin GET load/profile, JSON PUT answer/profile, POST skip/complete, multipart transcription, `Cache-Control`-agnostic JSON parsing, field errors, and cancellation propagation.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/onboarding-api.test.mjs`

Expected: FAIL because the client module does not exist.

- [ ] **Step 3: Implement minimal typed fetch helpers**

Export the questionnaire/profile response types and `loadOnboarding`, `saveOnboardingAnswer`, `skipOnboarding`, `completeOnboarding`, `loadProfile`, `saveProfileAnswer`, and `transcribeOnboardingAudio`. Throw an `OnboardingApiError` with a safe field message when available.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/onboarding-api.test.mjs`

Expected: PASS.

### Task 7: Reusable one-question UI and voice input

**Files:**
- Create: `src/OnboardingQuestion.tsx`
- Create: `tests/onboarding-ui.test.mjs`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing executable-view tests**

Server-render scalar number/text/choice and array choice/free-text questions. Assert exactly one current question, English prompt and Chinese translation, progress, Replay, editable input, microphone, typed/choice fallback, removable chips, field error, Retry-capable save state, Skip during onboarding, and no Skip during profile editing.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/onboarding-ui.test.mjs`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the presentational form**

Keep answer state controlled by the parent. For arrays, maintain one editable pending value and emit confirmed unique chips without splitting transcription. Give every control an accessible name and visible focus state.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/onboarding-ui.test.mjs`

Expected: PASS for view cases.

- [ ] **Step 5: Write failing interaction-helper tests for audio and microphone state**

Assert Start plays introduction then first question, Replay plays only the question, transcription populates but never saves, text remains editable after transcription/failure, and recording completion forwards one blob to the client boundary.

- [ ] **Step 6: Verify RED, implement minimal controller helpers, verify GREEN**

Reuse `playAudioSequence`, `playAudioLine`, and `startSpeechRecording`; do not add runtime TTS. Run RED and GREEN with `node --test tests/onboarding-ui.test.mjs`.

### Task 8: Onboarding gate, resume/completion, and profile editor

**Files:**
- Create: `src/OnboardingGate.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Modify: `tests/onboarding-ui.test.mjs`
- Modify: `tests/auth-ui.test.mjs`

- [ ] **Step 1: Write failing gate/container tests**

Assert loading/error retry states hide lessons; Start precedes the first question; successful answers advance; failed saves preserve local input; Skip opens only the current session; resumed data starts at the server-computed question; final answers call completion; completed or current-session-skipped profiles render children; and profile editing reuses the question form without introduction.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/onboarding-ui.test.mjs tests/auth-ui.test.mjs`

Expected: FAIL because `OnboardingGate` and the new composition are absent.

- [ ] **Step 3: Implement the injectable gate and profile view**

Follow the existing `createAuthGate` testability pattern. Load once per authenticated mount, use server-returned next question/progress as authority, preserve draft values across request failures, expose profile editing after lesson entry, and never replay the introduction in editor mode.

- [ ] **Step 4: Compose the application explicitly**

Render:

```tsx
<AuthGate>
  <OnboardingGate>
    <LessonPlayer />
  </OnboardingGate>
</AuthGate>
```

- [ ] **Step 5: Add responsive/accessibility styling and verify GREEN**

Add reduced-motion overrides, visible focus styles, touch-sized controls, compact short/narrow layouts, and no voice-only path. Run: `node --test tests/onboarding-ui.test.mjs tests/auth-ui.test.mjs tests/lesson-controls-ui.test.mjs tests/stage-layout.test.mjs`.

Expected: PASS.

### Task 9: Focused regression, migration review, and full verification

**Files:**
- Review all intended files only.

- [ ] **Step 1: Apply migrations to isolated local D1**

Run: `npm run db:migrate:local`

Expected: both Drizzle migrations apply successfully.

- [ ] **Step 2: Publish questionnaire to isolated local D1 and inspect rows**

Run: `npm run questionnaire:publish -- --local`

Use Wrangler read-only queries to confirm one active questionnaire, five ordered questions, exact audio IDs, and no schema ownership in the publisher.

- [ ] **Step 3: Run all focused onboarding/auth/audio tests**

Run: `node --test tests/onboarding-*.test.mjs tests/auth-*.test.mjs tests/worker-auth.test.mjs tests/groq.test.mjs tests/static-audio.test.mjs tests/generate-static-audio.test.mjs`

Expected: PASS.

- [ ] **Step 4: Run required repository checks**

Run, in order:

```bash
npm test
npm run lint
npm run build
```

Expected: all exit 0. Do not run the expensive E2E suite without separate need/approval.

- [ ] **Step 5: Review complete diff and migration**

Run `git status --short`, `git diff --check`, `git diff --stat`, `git diff -- migrations src/db/schema.ts`, and then read the full diff. Confirm no secrets, generated `dist`, local D1 state, temporary SQL, or unrelated files are included.

### Task 10: Commit, push, and draft PR

**Files:**
- Stage only the reviewed intended files.

- [ ] **Step 1: Attach the harness worktree to the feature branch**

Because this worktree began detached at the branch tip, switch to `codex/voice-onboarding-questionnaire` if available and still at the expected base; otherwise create a new `codex/voice-onboarding-questionnaire-implementation` branch without rewriting history.

- [ ] **Step 2: Commit intended files**

Use an explicit path list and commit message: `feat: add voice onboarding questionnaire`.

- [ ] **Step 3: Push with tracking**

Run: `git push -u origin <current-branch>`

- [ ] **Step 4: Open a draft PR against main**

Title: `[codex] add voice onboarding questionnaire`

Body: summarize the Drizzle/D1 model, deterministic questionnaire API, static ElevenLabs audio, voice/form UI, skip/resume/profile editing, and list exact test/lint/build results plus the intentionally skipped E2E suite.

- [ ] **Step 5: Verify PR metadata**

Confirm draft state, base `main`, correct head branch, intended commit, and a clean local worktree.
