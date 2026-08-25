# Guardian-Managed Dubbing Consent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Five Little Ducks learner-facing while moving voice-storage consent and deletion into guardian mode and enforcing the durable grant at the Worker.

**Architecture:** A D1 consent row is the durable authority; the 15-minute guardian unlock authorizes grant/revoke mutations only. Learner status, upload, and audio reads fail closed when the current grant is absent or revoking. The existing R2 generation/tombstone protocol remains the media authority and is reused during revocation.

**Tech Stack:** React 19, React Router 7, TypeScript, Tailwind 4, Cloudflare Workers/D1/R2, Drizzle ORM, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-25-guardian-dubbing-consent-design.md`

## Global Constraints

- Keep `/dubs/five-little-ducks` as a learner route.
- Use `src/shared/ui.tsx`, `src/app/AppHeader.tsx`, and existing mode boundaries; add no dependency.
- `guardian-voice-r2-v2` is the only current durable consent version.
- Learner mode renders no adult attestation, grown-up management panel, or dub deletion action.
- Grant and revoke require the current guardian-session unlock; recording later uses the durable D1 grant.
- Preserve owner scoping, 512 KiB limit, MIME/signature validation, private `no-store` responses, R2 CAS/reset behavior, and account-deletion fencing.
- Use behavior tests, never CSS-source or class-name assertions.
- Run `npm test`, `npm run lint`, `npm run build`, then `npm run test:browser` before completion.

---

### Task 1: Durable dubbing-consent repository and migration

**Files:**
- Modify: `src/db/schema.ts`
- Create: `worker/dub-consent.ts`
- Create: `tests/dub-consent.test.mjs`
- Create via Drizzle: `migrations/0011_guardian_dub_consent.sql`
- Create via Drizzle: `migrations/meta/0011_snapshot.json`
- Modify via Drizzle: `migrations/meta/_journal.json`
- Modify: `tests/guardian-access-schema.test.mjs`

**Interfaces:**
- Produces: `CURRENT_DUB_CONSENT_VERSION = "guardian-voice-r2-v2"`.
- Produces: `createDubConsentRepository(database, { createGeneration, now })` with `status(userId)`, `grant(userId)`, `beginRevocation(userId)`, `finishRevocation(userId, generation)`, and `requireCurrentGrant(userId, expectedGeneration?)`.
- Produces: status union `{ state: "not_granted" } | { state: "granted"; consentVersion; grantGeneration; grantedAt } | { state: "revoking"; grantGeneration }`.
- Consumes: existing `Database`, `user`, Drizzle query patterns, and account cascade.

- [ ] **Step 1: Write repository tests that name the authorization breaks**

Add tests with a real migrated SQLite database. The tests must prove:

```js
test("a fresh account has no current dubbing grant", async () => {
  assert.deepEqual(await repository.status("user-1"), { state: "not_granted" });
});

test("grant stores the current version and a fresh opaque generation", async () => {
  const granted = await repository.grant("user-1");
  assert.equal(granted.state, "granted");
  assert.equal(granted.consentVersion, "guardian-voice-r2-v2");
  assert.equal(granted.grantGeneration, "grant-1");
});

test("revoking blocks grant and exact-generation checks until cleanup finishes", async () => {
  const granted = await repository.grant("user-1");
  const revoking = await repository.beginRevocation("user-1");
  assert.equal(revoking.state, "revoking");
  assert.equal(await repository.requireCurrentGrant("user-1", granted.grantGeneration), null);
  await assert.rejects(() => repository.grant("user-1"), /dub_consent_revoking/);
  await repository.finishRevocation("user-1", revoking.grantGeneration);
  assert.deepEqual(await repository.status("user-1"), { state: "not_granted" });
});
```

Mutation caught: accepting an absent, stale-version, revoking, or wrong-generation row as authorization.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/dub-consent.test.mjs`

Expected: failure because `guardian_dub_consent` and `worker/dub-consent.ts` do not exist.

- [ ] **Step 3: Add the schema and minimal repository**

Add a `guardianDubConsent` table with the exact columns and state check from the spec. Use conditional Drizzle writes so `grant()` cannot overwrite `revoking`, and use `returning()` to distinguish a successful transition from a rejected conflict. `finishRevocation()` must delete only the exact revoking generation.

Generate the migration with
`npm run db:generate -- --name guardian_dub_consent`; do not hand-edit Drizzle
snapshot metadata.

- [ ] **Step 4: Add runtime cascade evidence**

Extend `tests/guardian-access-schema.test.mjs` to apply every real migration, insert a user and consent row, delete the user, and assert the consent row disappears while the migration exposes the state check.

- [ ] **Step 5: Run focused schema/repository tests and verify GREEN**

Run: `node --test tests/dub-consent.test.mjs tests/guardian-access-schema.test.mjs`

Expected: all pass with a real SQLite migration.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts worker/dub-consent.ts tests/dub-consent.test.mjs tests/guardian-access-schema.test.mjs migrations
git commit -m "feat: persist guardian dubbing consent"
```

---

### Task 2: Worker authorization and cross-store revocation

**Files:**
- Modify: `worker/dubs.ts`
- Modify: `worker/index.ts`
- Modify: `worker/guardian-access.ts`
- Modify: `tests/dub-worker.test.mjs`
- Modify: `tests/dub-routing.test.mjs`
- Modify: `tests/guardian-access-worker.test.mjs`

**Interfaces:**
- Consumes: Task 1 repository and consent status union.
- Produces: consent route `PUT /api/dubs/five-little-ducks-v1/consent`.
- Produces: status fields `recordingEnabled: boolean` and `consentState: "granted" | "not_granted" | "revoking"`.
- Produces: `403 { error: "dubbing_not_enabled" }` and `409 { error: "dub_consent_revoking" }`.
- Preserves: authenticated status/audio reads, owner-scoped object keys, and existing account-deletion cleanup.

- [ ] **Step 1: Write central route-policy RED tests**

Extend routing tests so a locked authenticated session cannot call consent `PUT` or dub `DELETE`, and the dub handler is not invoked:

```js
for (const [method, path] of [
  ["PUT", `${DUB_PATH}/consent`],
  ["DELETE", DUB_PATH],
]) {
  const response = await worker.fetch(request(method, path), env);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "guardian_required" });
}
assert.equal(handlerCalls, 0);
```

Also prove `GET` status/audio and line `PUT` still reach the domain handler; line `PUT` uses durable consent rather than the short guardian unlock.

- [ ] **Step 2: Write domain RED tests for missing/current/revoking consent**

Add focused cases to `tests/dub-worker.test.mjs`:

```js
it("returns disabled status without listing R2 when consent is absent", async () => {
  const response = await callDub({ method: "GET", consentState: "not_granted" });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).recordingEnabled, false);
  assert.equal(bucket.listCalls, 0);
});

it("rejects upload and audio without a current durable grant", async () => {
  assert.equal((await callUpload({ consentState: "not_granted" })).status, 403);
  assert.equal((await callAudio({ consentState: "not_granted" })).status, 404);
  assert.equal(bucket.putCalls, 0);
});

it("ignores the public version header when no durable grant exists", async () => {
  const response = await callUpload({
    consentState: "not_granted",
    headers: { "X-Parrot-Guardian-Consent-Version": "guardian-voice-r2-v1" },
  });
  assert.equal(response.status, 403);
});
```

Add grant-generation race cases: wrong generation before write causes no put;
revocation after the exact conditional put fences that object; regrant with a
new generation never makes the old object readable.

- [ ] **Step 3: Run the route and Worker tests and verify RED**

Run: `node --test tests/dub-routing.test.mjs tests/guardian-access-worker.test.mjs tests/dub-worker.test.mjs`

Expected: the new adult mutations reach the handler while locked, and the
domain accepts the static header without D1 consent.

- [ ] **Step 4: Add guardian route policy at the shared boundary**

Extend `requiresGuardianAccess()` for exact dub consent `PUT` and root dub
`DELETE`. In the dub branch of `worker/index.ts`, create one database object,
run the shared guardian guard before the handler for those methods, then pass
that same database to `handleDubRequest`.

- [ ] **Step 5: Enforce consent in the dub domain**

Inject or create the Task 1 repository in `handleDubRequest`. Parse the exact
consent route and bounded JSON body. For status, return disabled/revoking
payloads before R2 listing. For upload and audio, require the current grant.
Remove reliance on `X-Parrot-Guardian-Consent-Version`.

Before upload, capture the current `grantGeneration`; recheck it immediately
before the R2 conditional put. Store both `guardianConsentVersion` and
`guardianConsentGeneration` in custom metadata. Recheck after the put; on
mismatch or uncertain D1 state, conditionally replace only the exact stored
version with a non-audio consent-revoked fence and return 403.

For delete, call `beginRevocation`, reuse the existing reset/tombstone flow,
then call `finishRevocation` only after the marker returns to ready. A failed
reset leaves `revoking` for a guardian retry.

- [ ] **Step 6: Verify focused GREEN and regressions**

Run: `node --test tests/dub-consent.test.mjs tests/dub-routing.test.mjs tests/guardian-access-worker.test.mjs tests/dub-worker.test.mjs tests/account-deletion.test.mjs`

Expected: all pass; existing account-deletion race/fence coverage stays green.

- [ ] **Step 7: Commit**

```bash
git add worker/dubs.ts worker/index.ts worker/guardian-access.ts tests/dub-worker.test.mjs tests/dub-routing.test.mjs tests/guardian-access-worker.test.mjs
git commit -m "fix: enforce guardian dubbing consent"
```

---

### Task 3: Client contract and learner-safe dubbing UI

**Files:**
- Modify: `src/dubbing/dub-api.ts`
- Modify: `src/dubbing/DuckDub.tsx`
- Modify: `src/dubbing/dub-state.ts`
- Modify: `tests/dub-api.test.mjs`
- Modify: `tests/dub-ui.test.mjs`
- Modify: `tests/dub-state.test.mjs`

**Interfaces:**
- Consumes: Task 2 status and errors.
- Produces: `grantDubConsent()` for the guardian screen.
- Produces: `DubNotEnabledError` for a revoked/missing grant during upload.
- Produces: learner intro with no `confirmed` prop or adult handlers.
- Preserves: line recording, retry, retake, resume, and final playback.

- [ ] **Step 1: Write API RED tests**

Update the status fixture to include `recordingEnabled` and `consentState`.
Assert `saveDubLine()` sends no guardian-consent header. Add:

```js
it("submits the exact guardian consent body", async () => {
  await grantDubConsent({ fetch: request });
  assert.equal(calls[0].url, `${DUB_PATH}/consent`);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    accepted: true,
    consentVersion: "guardian-voice-r2-v2",
  });
});

it("maps a revoked upload to DubNotEnabledError", async () => {
  await assert.rejects(() => saveDubLine("line-1", blob, {
    fetch: async () => Response.json({ error: "dubbing_not_enabled" }, { status: 403 }),
  }), DubNotEnabledError);
});
```

- [ ] **Step 2: Write learner-view RED tests**

Replace the old confirmation test with behavior assertions:

```js
it("never asks a learner to claim they are a grown-up", () => {
  const disabled = renderDuckDub({ phase: "intro" }, { recordingEnabled: false });
  assert.match(disabled, /Ask a grown-up to turn on voice dubbing in Guardian mode/);
  assert.doesNotMatch(disabled, /checkbox|I’m the grown-up|Grown-up options|Delete my dub/);

  const enabled = renderDuckDub({ phase: "intro" }, { recordingEnabled: true });
  assert.match(enabled, />Start dubbing<\/button>/);
  assert.doesNotMatch(enabled, /checkbox|I’m the grown-up/);
});

it("keeps retakes learner-facing but removes destructive management", () => {
  const ready = renderCompleteDub();
  assert.match(ready, /Record another take/);
  assert.doesNotMatch(ready, /Grown-up options|Delete my dub/);
});
```

Mutation caught: hiding only the checkbox while leaving adult/deletion controls
or disabling the whole learner activity.

- [ ] **Step 3: Run client/UI tests and verify RED**

Run: `node --test tests/dub-api.test.mjs tests/dub-state.test.mjs tests/dub-ui.test.mjs`

Expected: old API header and adult learner UI violate the new assertions.

- [ ] **Step 4: Implement the minimal learner UI**

Remove local `confirmed`, `onConfirm`, and learner deletion state/handlers.
Drive availability from `loadDubStatus().recordingEnabled`. The disabled view
shows only child-readable help and **Back home**. The enabled intro advances
with **Start dubbing** or **Continue dubbing**. Rename the reducer start event
from `CONFIRMED` to `STARTED` so domain language matches behavior.

Replace final `Grown-up options` with a learner-labelled closed
`Record another take` disclosure containing the line picker and retake action
only. If `saveDubLine()` throws `DubNotEnabledError`, discard the pending blob,
stop media, and return to the disabled view.

- [ ] **Step 5: Verify focused GREEN**

Run: `node --test tests/dub-api.test.mjs tests/dub-state.test.mjs tests/dub-ui.test.mjs tests/dub-playback.test.mjs`

Expected: all pass with no adult or deletion surface in learner rendering.

- [ ] **Step 6: Commit**

```bash
git add src/dubbing/dub-api.ts src/dubbing/DuckDub.tsx src/dubbing/dub-state.ts tests/dub-api.test.mjs tests/dub-ui.test.mjs tests/dub-state.test.mjs
git commit -m "fix: keep learner dubbing child-safe"
```

---

### Task 4: Guardian voice-dubbing settings

**Files:**
- Create: `src/dubbing/GuardianDubbingSettings.tsx`
- Modify: `src/app/app-routes.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/GuardianDashboard.tsx`
- Create: `tests/guardian-dubbing-settings.test.mjs`
- Modify: `tests/app-routes.test.mjs`
- Modify: `tests/product-streamline.test.mjs`
- Modify: `tests/app-shell-ui.test.mjs`

**Interfaces:**
- Produces: `getGuardianDubbingPath(): "/guardian/dubbing"`.
- Consumes: `loadDubStatus`, `grantDubConsent`, `deleteDub`, and `useGuardianAccess().lock`.
- Produces: a guardian route protected by existing `GuardianModeBoundary`.

- [ ] **Step 1: Write guardian-view RED tests**

Render a pure `GuardianDubbingSettingsView` for three states:

```js
test("guardian settings owns voice consent and deletion", () => {
  const disabled = renderView({ consentState: "not_granted" });
  assert.match(disabled, /Allow voice dubbing/);
  assert.match(disabled, /I am the learner(?:&#x27;|')s guardian/);

  const enabled = renderView({ consentState: "granted", savedCount: 4 });
  assert.match(enabled, /4 of 9 lines saved/);
  assert.match(enabled, /Switch to learner and start dubbing/);
  assert.match(enabled, /Turn off voice dubbing and delete saved clips/);

  const revoking = renderView({ consentState: "revoking" });
  assert.match(revoking, /Finish removing voice clips/);
  assert.doesNotMatch(revoking, /Allow voice dubbing/);
});
```

Add route tests proving `/guardian/dubbing` is a canonical guardian route and a
safe return target. Update dashboard expectations to five management cards and
the exact new link.

- [ ] **Step 2: Run route/view tests and verify RED**

Run: `node --test tests/guardian-dubbing-settings.test.mjs tests/app-routes.test.mjs tests/product-streamline.test.mjs tests/app-shell-ui.test.mjs`

Expected: the route, card, and view do not exist.

- [ ] **Step 3: Implement the guardian route and stateful container**

Build the pure view with shared controls and `RouteHeader`. In the container:

- load status with an abort controller;
- require the checkbox before `grantDubConsent()`;
- call `deleteDub()` for revoke/cleanup and reload authoritative status;
- call `lock()` before navigating to `/dubs/five-little-ducks`;
- retain the guardian page and render the access error if locking fails;
- prevent duplicate grant/delete/switch mutations with refs and disabled
  controls.

Register a lazy guardian route in `ApplicationRoutes`, add it to declared and
safe route lists, and add the dashboard card.

- [ ] **Step 4: Verify focused GREEN**

Run: `node --test tests/guardian-dubbing-settings.test.mjs tests/app-routes.test.mjs tests/product-streamline.test.mjs tests/app-shell-ui.test.mjs tests/lifecycle/app-lifecycle.test.mjs`

Expected: all pass and the existing guardian boundary lifecycle remains green.

- [ ] **Step 5: Commit**

```bash
git add src/dubbing/GuardianDubbingSettings.tsx src/app/app-routes.ts src/app/App.tsx src/app/GuardianDashboard.tsx tests/guardian-dubbing-settings.test.mjs tests/app-routes.test.mjs tests/product-streamline.test.mjs tests/app-shell-ui.test.mjs
git commit -m "feat: manage voice dubbing in guardian mode"
```

---

### Task 5: Remove the dormant learner-operated grown-up chat setting

**Files:**
- Modify: `src/conversation/ConversationSurface.tsx`
- Modify: `tests/conversation-ui.test.mjs`
- Modify: `tests/e2e/conversation-prompt-styles.spec.ts`
- Modify: `tests/e2e/conversation-helpers.ts`

**Interfaces:**
- Preserves: the current internal/default prompt style sent by the conversation
  container.
- Removes: learner-facing `Grown-up chat style` selector and its browser helper.

- [ ] **Step 1: Write the RED component assertion**

Change the small-chat presentation test to assert the learner action remains
and adult controls do not render:

```js
assert.match(html, /Start talking/);
assert.doesNotMatch(html, /Grown-up chat style|Grown-up:/);
```

Mutation caught: reintroducing a learner-operated adult setting when the route
is re-enabled.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/conversation-ui.test.mjs`

Expected: the existing selector violates the absence assertion.

- [ ] **Step 3: Remove only the dormant selector UI**

Delete the select/button presentation and unused local UI handlers. Keep the
conversation request's existing default prompt style so this task does not
change conversation behavior or the Worker contract. Remove browser helpers
and specs that exist only to operate the deleted control.

- [ ] **Step 4: Verify focused GREEN**

Run: `node --test tests/conversation-ui.test.mjs tests/conversation-api.test.mjs tests/conversation-worker.test.mjs`

Expected: all pass; ordinary conversation behavior is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/conversation/ConversationSurface.tsx tests/conversation-ui.test.mjs tests/e2e/conversation-prompt-styles.spec.ts tests/e2e/conversation-helpers.ts
git commit -m "fix: remove learner-facing grown-up chat setting"
```

---

### Task 6: End-to-end capability matrix and documentation

**Files:**
- Modify: `tests/e2e/dubbing.spec.ts`
- Modify: `tests/e2e/guardian-mode.spec.ts`
- Modify: `src/testing/e2e-browser-mocks.ts`
- Modify: `docs/design/product-experience.md`
- Modify: `docs/design/technical-architecture.md`
- Modify: `docs/superpowers/specs/2026-08-25-five-little-ducks-dubbing-design.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: browser evidence for guardian consent handoff and adult-control
  absence across learner routes.

- [ ] **Step 1: Add a deterministic RED browser journey**

Extend the E2E mock with explicit `not_granted`, `granted`, and `revoking`
consent states. Replace `enterStudio()` checkbox interaction with a flow that:

1. opens learner dubbing and sees the child-readable unavailable state;
2. sees zero grown-up checkboxes, grown-up options, and delete actions;
3. unlocks guardian mode and opens `/guardian/dubbing`;
4. accepts consent in guardian mode;
5. switches to learner and records a line;
6. confirms learner mode still renders no adult controls.

- [ ] **Step 2: Expand the shared learner-surface audit**

Add `/talk-to-peppa` and a granted complete dub to the existing learner-route
loop in `tests/e2e/guardian-mode.spec.ts`. For every learner route assert zero:

```ts
page.getByRole("checkbox", { name: /I’m the grown-up|I am the learner's guardian/i });
page.getByLabel("Grown-up options");
page.getByRole("button", { name: /Delete (my )?dub/i });
page.getByLabel(/^Grown-up chat style:/);
```

For the complete dub also assert **Watch my dub** remains visible, proving the
activity was not removed to satisfy the absence check.

- [ ] **Step 3: Run focused browser tests and verify failures are behavior-specific**

Run: `npx playwright test tests/e2e/dubbing.spec.ts tests/e2e/guardian-mode.spec.ts`

Expected before mock/journey migration: old checkbox helpers or adult controls
fail the new capability assertions.

- [ ] **Step 4: Update mocks, journeys, and architecture documentation**

Make mock status and consent mutations mirror the real response shapes and
guardian access boundary. Update product capability tables and dubbing design
to make durable guardian consent, learner recording, guardian deletion, and
version 2 explicit. Remove statements that describe learner self-attestation
or learner `Grown-up options`.

- [ ] **Step 5: Run focused browser GREEN**

Run: `npx playwright test tests/e2e/dubbing.spec.ts tests/e2e/guardian-mode.spec.ts`

Expected: all focused journeys pass at their existing responsive sizes.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/dubbing.spec.ts tests/e2e/guardian-mode.spec.ts src/testing/e2e-browser-mocks.ts docs/design/product-experience.md docs/design/technical-architecture.md docs/superpowers/specs/2026-08-25-five-little-ducks-dubbing-design.md
git commit -m "test: verify guardian-managed dubbing consent"
```

---

### Task 7: Full verification and independent review

**Files:**
- Modify only if a verification failure proves a defect in the changed behavior.

**Interfaces:**
- Consumes: the complete branch.
- Produces: merge-ready evidence with no unresolved guardian/learner boundary findings.

- [ ] **Step 1: Run the ordered local gates**

```bash
npm test
npm run lint
npm run build
npm run test:browser
```

Expected: every command exits 0. Record exact test totals and distinguish
pre-existing generated-file warnings from failures.

- [ ] **Step 2: Run the final mutation audit**

Confirm tests fail conceptually for each realistic regression: restoring the
checkbox, skipping D1 consent on upload, permitting locked consent/delete,
reading a stale generation, rendering deletion in learner mode, or hiding the
entire learner activity.

- [ ] **Step 3: Request independent code review**

Review against the spec, capability table, cross-store revocation rules,
account-deletion behavior, accessible learner/guardian UI, and current
`AGENTS.md` constraints. Fix every Critical or Important finding test-first and
rerun affected gates.

- [ ] **Step 4: Commit any verified review fixes**

```bash
git add -u
git commit -m "fix: close dubbing consent review gaps"
```
