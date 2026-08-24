# Five Little Ducks Dubbing Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a responsive, child-friendly nine-line duck dubbing game with private owner-scoped R2 saves, retakes, resume, and a synchronized animated final replay.

**Architecture:** A fixed script and reducer drive one React route. The existing private R2 bucket stores nine deterministic, extensionless clip slots below the already-purged per-user prefix, so no D1 migration is needed. The final player decodes the authenticated clips into Web Audio buffers and schedules voices, original synthesized music, and SVG visual beats against one clock.

**Tech Stack:** React 19, TypeScript 5.9, React Router 7, Tailwind 4, Cloudflare Worker/R2, Better Auth, Web Audio, MediaRecorder, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-25-five-little-ducks-dubbing-design.md`

## Global Constraints

- Use Tailwind 4 utilities directly in React components and controls from `src/shared/ui.tsx`; use `RouteHeader` and `HeaderLink` from `src/app/AppHeader.tsx`.
- Keep the first release to the built-in `five-little-ducks-v1` script and `/dubs/five-little-ducks` route.
- Do not add YouTube, protected cartoon footage, public clip URLs, third-party recording/analytics services, dependencies, or a D1 table.
- Store audio only beneath `personalized-story-art/{encoded-user-id}/learner-dubs/` in the existing private `PERSONALIZED_STORY_ART_BUCKET`.
- Require the exact grown-up confirmation version on upload; cap each clip at 512 KiB and accept only signature-matched WebM, MP4, or Ogg audio.
- Use private `no-store` responses and include saved dub keys in the existing account-deletion purge prefix.
- The final replay duration is exactly 56,000 ms with authored cues at 800 ms plus six-second intervals.
- Respect reduced motion, preserve accessible names, use at least 48 px touch targets, and prevent horizontal overflow from 280 px upward.
- Use test-first red/green cycles and run `npm test`, `npm run lint`, `npm run build`, and `npm run test:browser` before completion.

---

## File Map

- `src/dubbing/dub-script.ts`: immutable lines, cue timing, visual beats, and lookup helpers.
- `src/dubbing/dub-state.ts`: pure session transitions and resume selection.
- `src/media/speech-recorder.ts`: cross-browser MediaRecorder MIME selection and recorder-reported Blob type.
- `worker/dubs.ts`: fixed authenticated R2 status/upload/stream/delete API.
- `worker/index.ts`: session-gated `/api/dubs/*` dispatch.
- `src/dubbing/dub-api.ts`: typed same-origin API client.
- `src/dubbing/dub-playback.ts`: Web Audio decode, cue/music scheduling, visual clock, and cancellation.
- `src/dubbing/DuckScene.tsx`: original inline SVG duck illustration for home and studio.
- `src/dubbing/DuckDub.tsx`: route orchestration and learner UI.
- `src/app/App.tsx`, `src/app/app-routes.ts`, `src/app/HomeMenu.tsx`: durable route and fourth home activity.
- `src/testing/e2e-browser-mocks.ts`: deterministic dub status/R2 and microphone browser doubles.
- `tests/dub-*.test.mjs`, `tests/speech-recorder.test.mjs`: domain, Worker, client, and scheduler coverage.
- `tests/e2e/dubbing.spec.ts`, `tests/e2e/home-menu.spec.ts`, `tests/e2e/header.spec.ts`: rendered flow and responsive containment.
- `docs/design/product-experience.md`, `docs/design/technical-architecture.md`: shipped fourth activity and private R2 boundary.

### Task 1: Script and Session State

**Files:**
- Create: `src/dubbing/dub-script.ts`
- Create: `src/dubbing/dub-state.ts`
- Test: `tests/dub-state.test.mjs`

**Interfaces:**
- Produces: `DUB_ID`, `DUB_ROUTE`, `DUB_DURATION_MS`, `DUB_RECORDING_MS`, `DUB_LINES`, `getDubLineAtElapsed(elapsedMs)`, `createInitialDubState()`, `firstMissingDubLineIndex(savedLineIds)`, and `reduceDubState(state, event)`.
- `DUB_LINES` items have `{ id, cueMs, duckCount, text, visualBeat }` where `id` is `line-1` through `line-9`.

- [ ] **Step 1: Write failing script and reducer tests**

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DUB_DURATION_MS,
  DUB_LINES,
  getDubLineAtElapsed,
} from "../src/dubbing/dub-script.ts";
import {
  createInitialDubState,
  firstMissingDubLineIndex,
  reduceDubState,
} from "../src/dubbing/dub-state.ts";

describe("five little ducks dub domain", () => {
  it("authors nine six-second slots inside a 56 second replay", () => {
    assert.equal(DUB_LINES.length, 9);
    assert.deepEqual(DUB_LINES.map(({ cueMs }) => cueMs),
      [800, 6800, 12800, 18800, 24800, 30800, 36800, 42800, 48800]);
    assert.equal(DUB_DURATION_MS, 56_000);
    assert.equal(getDubLineAtElapsed(12_900)?.id, "line-3");
  });

  it("resumes at the first missing line and unlocks the final replay", () => {
    assert.equal(firstMissingDubLineIndex(new Set(["line-1", "line-2"])), 2);
    let state = reduceDubState(createInitialDubState(), {
      type: "LOADED",
      savedLineIds: DUB_LINES.map(({ id }) => id),
    });
    assert.equal(state.currentLineIndex, 0);
    state = reduceDubState(state, { type: "CONFIRMED" });
    assert.equal(state.phase, "final-ready");
  });

  it("keeps a failed upload reviewable and advances after a saved take", () => {
    let state = reduceDubState(createInitialDubState(), {
      type: "LOADED",
      savedLineIds: [],
    });
    state = reduceDubState(state, { type: "CONFIRMED" });
    state = reduceDubState(state, { type: "MIC_OPENING" });
    state = reduceDubState(state, { type: "MIC_STARTED" });
    state = reduceDubState(state, { type: "SAVE_STARTED" });
    state = reduceDubState(state, { type: "SAVE_FAILED", message: "Try again." });
    assert.equal(state.phase, "save-error");
    state = reduceDubState(state, {
      type: "SAVE_SUCCEEDED",
      lineId: "line-1",
      recordedAt: "2026-08-25T10:00:00.000Z",
    });
    assert.equal(state.phase, "line-review");
    state = reduceDubState(state, { type: "NEXT_LINE" });
    assert.equal(state.currentLineIndex, 1);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the missing-module failure**

Run: `node --test tests/dub-state.test.mjs`

Expected: FAIL because `src/dubbing/dub-script.ts` and `dub-state.ts` do not exist.

- [ ] **Step 3: Implement the immutable script and pure reducer**

```ts
// src/dubbing/dub-script.ts
export const DUB_ID = "five-little-ducks-v1" as const;
export const DUB_ROUTE = "/dubs/five-little-ducks" as const;
export const DUB_DURATION_MS = 56_000;
export const DUB_RECORDING_MS = 6_000;

export type DubVisualBeat =
  | "five-enter" | "hill" | "frog" | "four-splash" | "reeds"
  | "lily-circle" | "one-calls" | "mama-calls" | "five-return";

export type DubLine = {
  cueMs: number;
  duckCount: number;
  id: `line-${number}`;
  text: string;
  visualBeat: DubVisualBeat;
};

const texts = [
  "Five little ducks went out to play.",
  "Over the hill and far away.",
  "One found a frog and stopped to say, “Hello!”",
  "Four little ducks came splashing back.",
  "Three little ducks raced through the reeds.",
  "Two little ducks twirled round and round.",
  "One little duck called, “Quack, quack, quack!”",
  "Mama duck called, “Come home, my friends!”",
  "Five happy ducks came swimming back.",
] as const;
const beats: DubVisualBeat[] = ["five-enter", "hill", "frog", "four-splash", "reeds", "lily-circle", "one-calls", "mama-calls", "five-return"];
const counts = [5, 5, 4, 4, 3, 2, 1, 1, 5];

export const DUB_LINES: readonly DubLine[] = texts.map((text, index) => ({
  cueMs: 800 + index * 6_000,
  duckCount: counts[index],
  id: `line-${index + 1}`,
  text,
  visualBeat: beats[index],
}));

export function getDubLineAtElapsed(elapsedMs: number) {
  return [...DUB_LINES].reverse().find(({ cueMs }) => elapsedMs >= cueMs) ?? DUB_LINES[0];
}
```

```ts
// src/dubbing/dub-state.ts
import { DUB_LINES } from "./dub-script";
export type DubPhase = "loading" | "intro" | "line-ready" | "mic-opening" | "recording" | "saving" | "save-error" | "line-review" | "final-ready" | "final-loading" | "final-playing";
export type DubState = { currentLineIndex: number; error: string; phase: DubPhase; saved: Record<string, string> };
export type DubEvent =
  | { type: "LOADED"; savedLineIds: string[] }
  | { type: "CONFIRMED" } | { type: "MIC_OPENING" } | { type: "MIC_STARTED" }
  | { type: "SAVE_STARTED" } | { type: "SAVE_FAILED"; message: string }
  | { type: "SAVE_SUCCEEDED"; lineId: string; recordedAt: string }
  | { type: "NEXT_LINE" } | { type: "RETAKE" }
  | { type: "FINAL_LOADING" } | { type: "FINAL_STARTED" } | { type: "FINAL_FINISHED" }
  | { type: "RESET_SUCCEEDED" };

export const createInitialDubState = (): DubState => ({ currentLineIndex: 0, error: "", phase: "loading", saved: {} });
export function firstMissingDubLineIndex(savedLineIds: ReadonlySet<string>) {
  const index = DUB_LINES.findIndex(({ id }) => !savedLineIds.has(id));
  return index < 0 ? 0 : index;
}
export function reduceDubState(state: DubState, event: DubEvent): DubState {
  if (event.type === "LOADED") {
    const saved = Object.fromEntries(event.savedLineIds.map((id) => [id, ""]));
    return { currentLineIndex: firstMissingDubLineIndex(new Set(event.savedLineIds)), error: "", phase: "intro", saved };
  }
  if (event.type === "CONFIRMED") return { ...state, phase: DUB_LINES.every(({ id }) => id in state.saved) ? "final-ready" : "line-ready" };
  if (event.type === "MIC_OPENING") return { ...state, error: "", phase: "mic-opening" };
  if (event.type === "MIC_STARTED") return { ...state, phase: "recording" };
  if (event.type === "SAVE_STARTED") return { ...state, error: "", phase: "saving" };
  if (event.type === "SAVE_FAILED") return { ...state, error: event.message, phase: "save-error" };
  if (event.type === "SAVE_SUCCEEDED") return { ...state, error: "", phase: "line-review", saved: { ...state.saved, [event.lineId]: event.recordedAt } };
  if (event.type === "NEXT_LINE") {
    if (DUB_LINES.every(({ id }) => id in state.saved)) return { ...state, phase: "final-ready" };
    const next = DUB_LINES.findIndex(({ id }, index) => index > state.currentLineIndex && !(id in state.saved));
    return { ...state, currentLineIndex: next < 0 ? firstMissingDubLineIndex(new Set(Object.keys(state.saved))) : next, phase: "line-ready" };
  }
  if (event.type === "RETAKE") return { ...state, error: "", phase: "line-ready" };
  if (event.type === "FINAL_LOADING") return { ...state, phase: "final-loading" };
  if (event.type === "FINAL_STARTED") return { ...state, phase: "final-playing" };
  if (event.type === "FINAL_FINISHED") return { ...state, phase: "final-ready" };
  if (event.type === "RESET_SUCCEEDED") return { ...createInitialDubState(), phase: "intro" };
  return state;
}
```

- [ ] **Step 4: Run the focused test and full domain tests**

Run: `node --test tests/dub-state.test.mjs`

Expected: 3 passing tests.

- [ ] **Step 5: Commit the domain model**

```bash
git add src/dubbing/dub-script.ts src/dubbing/dub-state.ts tests/dub-state.test.mjs
git commit -m "feat: define duck dub timeline and state"
```

### Task 2: Cross-Browser Recorder MIME Selection

**Files:**
- Modify: `src/media/speech-recorder.ts:1-206`
- Modify: `tests/speech-recorder.test.mjs`

**Interfaces:**
- Produces: `selectRecordingMimeType(MediaRecorderClass?)`.
- Preserves: `startSpeechRecording(options): Promise<SpeechRecordingSession>` and `recordSpeechClip(options): Promise<Blob>`.

- [ ] **Step 1: Add failing MIME negotiation tests**

```js
it("selects the first supported portable recording type", () => {
  class FakeRecorder {}
  FakeRecorder.isTypeSupported = (type) => type === "audio/webm;codecs=opus";
  assert.equal(speechRecorder.selectRecordingMimeType(FakeRecorder), "audio/webm;codecs=opus");
});

it("uses the recorder-reported MIME type for the returned blob", async () => {
  const { stream } = createStream();
  const { FakeMediaRecorder } = createRecorderClass();
  FakeMediaRecorder.isTypeSupported = (type) => type === "audio/mp4";
  FakeMediaRecorder.prototype.mimeType = "audio/mp4";
  const session = await startSpeechRecording({ MediaRecorder: FakeMediaRecorder, getUserMedia: async () => stream });
  assert.equal((await session.stop()).type, "audio/mp4");
});
```

- [ ] **Step 2: Verify the focused test fails for the missing export or wrong Blob type**

Run: `node --test tests/speech-recorder.test.mjs`

Expected: FAIL at `selectRecordingMimeType`.

- [ ] **Step 3: Implement selection and recorder-reported output**

```ts
const RECORDING_MIME_TYPES = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/webm",
  "audio/ogg;codecs=opus",
] as const;

export function selectRecordingMimeType(MediaRecorderClass = globalThis.MediaRecorder) {
  if (!MediaRecorderClass) throw new RecordingUnsupportedError();
  if (typeof MediaRecorderClass.isTypeSupported !== "function") return DEFAULT_MIME_TYPE;
  return RECORDING_MIME_TYPES.find((type) => MediaRecorderClass.isTypeSupported(type)) ?? "";
}
```

In both recording functions, resolve `mimeType ?? selectRecordingMimeType(MediaRecorderClass)`, pass `{ mimeType }` only when non-empty, and construct the result with `recorder.mimeType || resolvedMimeType`.

- [ ] **Step 4: Run recorder tests and type-check**

Run: `node --test tests/speech-recorder.test.mjs && npm run build`

Expected: recorder tests pass and build exits 0.

- [ ] **Step 5: Commit the recorder portability fix**

```bash
git add src/media/speech-recorder.ts tests/speech-recorder.test.mjs
git commit -m "fix: negotiate browser recording formats"
```

### Task 3: Authenticated Private R2 Dub API

**Files:**
- Create: `worker/dubs.ts`
- Modify: `worker/index.ts:1-281`
- Test: `tests/dub-worker.test.mjs`
- Test: `tests/dub-routing.test.mjs`

**Interfaces:**
- Consumes: `DUB_ID` and line IDs from `src/dubbing/dub-script.ts`, `readBoundedBytes`, `RequestBodyTooLargeError`, and `isAccountDeletionPending`.
- Produces: `DubEnv`, `DubRequestInput`, `handleDubRequest(input, overrides?)`, and authenticated Worker dispatch for `/api/dubs/*`.
- `handleDubRequest` overrides are `{ isDeletionPending?: typeof isAccountDeletionPending; now?: () => Date }`, which makes the account-delete race deterministic in tests.

- [ ] **Step 1: Write failing Worker behavior tests**

```js
async function callDub({ bucket, body, headers = {}, method, path, pending = async () => false }) {
  const { handleDubRequest } = await import("../worker/dubs.ts");
  return handleDubRequest({
    database: {},
    env: { PERSONALIZED_STORY_ART_BUCKET: bucket },
    identity: { sessionId: "session-1", userId: "user-1", userName: "Parent" },
    request: new Request(`https://example.test${path}`, { body, headers, method }),
  }, { isDeletionPending: pending, now: () => new Date("2026-08-25T10:00:00.000Z") });
}

it("stores and privately streams one owner-scoped WebM slot", async () => {
  const stored = new Map();
  const bucket = {
    async put(key, bytes, options) { stored.set(key, { bytes, options, uploaded: new Date("2026-08-25T10:00:00Z") }); },
    async get(key) {
      const item = stored.get(key);
      return item && { body: new Response(item.bytes).body, writeHttpMetadata(headers) { headers.set("Content-Type", item.options.httpMetadata.contentType); } };
    },
    async list({ prefix }) { return { objects: [...stored].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, uploaded: value.uploaded })), truncated: false }; },
    async delete(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) stored.delete(key); },
  };
  const body = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2]);
  const upload = await callDub({ bucket, body, method: "PUT", path: "/api/dubs/five-little-ducks-v1/lines/line-1", headers: { "Content-Type": "audio/webm", "X-Parrot-Guardian-Consent-Version": "guardian-voice-r2-v1" } });
  assert.equal(upload.status, 201);
  const asset = await callDub({ bucket, method: "GET", path: "/api/dubs/five-little-ducks-v1/lines/line-1/audio" });
  assert.equal(asset.headers.get("Cache-Control"), "private, no-store");
  assert.equal(asset.headers.get("X-Content-Type-Options"), "nosniff");
  assert.deepEqual(new Uint8Array(await asset.arrayBuffer()), body);
});

it("rejects missing consent, mismatched signatures, unknown lines, and oversized bodies before R2 put", async () => {
  let putCalls = 0;
  const bucket = { async put() { putCalls += 1; }, async list() { return { objects: [], truncated: false }; }, async delete() {}, async get() { return null; } };
  const base = { bucket, method: "PUT", path: "/api/dubs/five-little-ducks-v1/lines/line-1" };
  const missingConsent = await callDub({ ...base, body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), headers: { "Content-Type": "audio/webm" } });
  const mismatch = await callDub({ ...base, body: new Uint8Array([1, 2, 3, 4]), headers: { "Content-Type": "audio/webm", "X-Parrot-Guardian-Consent-Version": "guardian-voice-r2-v1" } });
  const unknown = await callDub({ ...base, body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), path: "/api/dubs/five-little-ducks-v1/lines/line-99", headers: { "Content-Type": "audio/webm", "X-Parrot-Guardian-Consent-Version": "guardian-voice-r2-v1" } });
  const oversized = await callDub({ ...base, body: new Uint8Array(512 * 1024 + 1), headers: { "Content-Type": "audio/webm", "X-Parrot-Guardian-Consent-Version": "guardian-voice-r2-v1" } });
  assert.deepEqual([missingConsent.status, mismatch.status, unknown.status, oversized.status], [400, 415, 404, 413]);
  assert.equal(putCalls, 0);
});

it("deletes a just-written object when account deletion begins during put", async () => {
  const deleted = [];
  let checks = 0;
  const response = await callDub({
    bucket: { async put() {}, async delete(key) { deleted.push(key); }, async list() { return { objects: [], truncated: false }; }, async get() { return null; } },
    body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
    headers: { "Content-Type": "audio/webm", "X-Parrot-Guardian-Consent-Version": "guardian-voice-r2-v1" },
    method: "PUT",
    path: "/api/dubs/five-little-ducks-v1/lines/line-1",
    pending: async () => ++checks > 1,
  });
  assert.equal(response.status, 409);
  assert.deepEqual(deleted, ["personalized-story-art/user-1/learner-dubs/five-little-ducks-v1/line-1.audio"]);
});
```

```js
it("rejects anonymous dub status, upload, audio, and delete routes", async () => {
  const worker = createWorker({ createAuth: () => authStub(null) });
  for (const [method, path] of [["GET", "/api/dubs/five-little-ducks-v1"], ["PUT", "/api/dubs/five-little-ducks-v1/lines/line-1"], ["GET", "/api/dubs/five-little-ducks-v1/lines/line-1/audio"], ["DELETE", "/api/dubs/five-little-ducks-v1"]]) {
    const response = await worker.fetch(new Request(`https://example.test${path}`, { method }), environment());
    assert.equal(response.status, 401);
  }
});
```

- [ ] **Step 2: Run focused Worker tests and confirm missing handler failures**

Run: `node --test tests/dub-worker.test.mjs tests/dub-routing.test.mjs`

Expected: FAIL because `worker/dubs.ts` and route dispatch do not exist.

- [ ] **Step 3: Implement the fixed API and deterministic private keys**

```ts
const CONSENT_VERSION = "guardian-voice-r2-v1";
const MAX_CLIP_BYTES = 512 * 1024;
const MIME_SIGNATURES = {
  "audio/webm": (bytes: Uint8Array) => bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3,
  "audio/mp4": (bytes: Uint8Array) => bytes.length >= 8 && new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp",
  "audio/ogg": (bytes: Uint8Array) => new TextDecoder().decode(bytes.slice(0, 4)) === "OggS",
} as const;

function objectPrefix(userId: string) {
  // ponytail: shared private bucket; split when voice and art retention policies differ.
  return `personalized-story-art/${encodeURIComponent(userId)}/learner-dubs/${DUB_ID}/`;
}
function objectKey(userId: string, lineId: string) {
  return `${objectPrefix(userId)}${lineId}.audio`;
}
```

Use these exact route and response helpers, then branch on the parsed route and method:

```ts
function parseDubRoute(pathname: string) {
  const match = /^\/api\/dubs\/([^/]+)(?:\/lines\/([^/]+)(?:\/(audio))?)?$/.exec(pathname);
  if (!match) return null;
  try {
    const dubId = decodeURIComponent(match[1]);
    const lineId = match[2] ? decodeURIComponent(match[2]) : null;
    if (dubId !== DUB_ID || (lineId && !DUB_LINES.some((line) => line.id === lineId))) return null;
    return { audio: match[3] === "audio", dubId, lineId };
  } catch {
    return null;
  }
}

class DubApiError extends Error {
  constructor(readonly status: number, readonly code: string, message = code) { super(message); }
}
const json = (payload: unknown, init: ResponseInit = {}) => Response.json(payload, {
  ...init,
  headers: { "Cache-Control": "private, no-store", ...init.headers },
});

function normalizeContentType(request: Request) {
  return request.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}
function validSignature(contentType: string, bytes: Uint8Array) {
  return MIME_SIGNATURES[contentType as keyof typeof MIME_SIGNATURES]?.(bytes) === true;
}
```

For `PUT`, run the exact sequence below so account deletion cannot strand a post-purge upload:

```ts
if (await isDeletionPending(input.database, input.identity.userId)) throw new DubApiError(409, "account_deletion_pending");
if (input.request.headers.get("X-Parrot-Guardian-Consent-Version") !== CONSENT_VERSION) throw new DubApiError(400, "guardian_consent_required");
const contentType = normalizeContentType(input.request);
let bytes: Uint8Array;
try { bytes = await readBoundedBytes(input.request, MAX_CLIP_BYTES); }
catch (error) { if (error instanceof RequestBodyTooLargeError) throw new DubApiError(413, "payload_too_large"); throw error; }
if (bytes.byteLength === 0) throw new DubApiError(400, "audio_required");
if (!validSignature(contentType, bytes)) throw new DubApiError(415, "unsupported_audio");
const key = objectKey(input.identity.userId, route.lineId!);
const recordedAt = now();
await input.env.PERSONALIZED_STORY_ART_BUCKET.put(key, bytes, {
  httpMetadata: { contentType },
  customMetadata: { guardianConsentVersion: CONSENT_VERSION, lineId: route.lineId!, recordedAt: recordedAt.toISOString() },
});
if (await isDeletionPending(input.database, input.identity.userId)) {
  await input.env.PERSONALIZED_STORY_ART_BUCKET.delete(key);
  throw new DubApiError(409, "account_deletion_pending");
}
return json({ lineId: route.lineId, recordedAt: recordedAt.toISOString() }, { status: 201 });
```

For pack status, filter `bucket.list({ prefix: objectPrefix(userId) }).objects` through the exact key map and return:

```ts
{
  complete: boolean,
  dubId: "five-little-ducks-v1",
  guardianConsentVersion: "guardian-voice-r2-v1",
  lines: DUB_LINES.map(({ id }) => ({ id, recordedAt: string | null, saved: boolean }))
}
```

For owner-only audio, call `bucket.get(objectKey(userId, lineId))`, return 404 when absent, copy R2 HTTP metadata, and overwrite headers with `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`. For pack delete, call `bucket.delete(DUB_LINES.map(({ id }) => objectKey(userId, id)))` and return 204. Catch `DubApiError` and return `{ error: code, message }`; return 404 for unparsed routes and 405 for unsupported methods.

Add `isDubPath`, `handleDubRequest` to `WorkerDependencies`, perform Better Auth session lookup in `worker/index.ts`, and pass `createDatabase(env.DB)`, `env`, identity, and request.

- [ ] **Step 4: Run API tests, account-deletion tests, and build**

Run: `node --test tests/dub-worker.test.mjs tests/dub-routing.test.mjs tests/account-deletion.test.mjs && npm run build`

Expected: all focused tests pass and TypeScript accepts the Worker env.

- [ ] **Step 5: Commit the private R2 API**

```bash
git add worker/dubs.ts worker/index.ts tests/dub-worker.test.mjs tests/dub-routing.test.mjs
git commit -m "feat: save private duck dub clips in R2"
```

### Task 4: Browser API Client and Synchronized Replay

**Files:**
- Create: `src/dubbing/dub-api.ts`
- Create: `src/dubbing/dub-playback.ts`
- Test: `tests/dub-api.test.mjs`
- Test: `tests/dub-playback.test.mjs`

**Interfaces:**
- Produces: `loadDubStatus`, `saveDubLine`, `getDubLineAudioUrl`, `deleteDub`, `scheduleDubAudio`, and `startDubPlayback`.
- `startDubPlayback(options)` returns `Promise<{ stop(): void }>` and reports elapsed milliseconds through `onTick`.

- [ ] **Step 1: Write failing client and scheduler tests**

```js
function fakeContext(currentTime) {
  return { currentTime };
}

it("uploads a raw clip with confirmation and parses private status", async () => {
  const requests = [];
  const blob = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], { type: "audio/webm;codecs=opus" });
  await saveDubLine("line-1", blob, { fetch: async (url, init) => { requests.push({ url, init }); return Response.json({ recordedAt: "2026-08-25T10:00:00.000Z" }, { status: 201 }); } });
  assert.equal(requests[0].init.body, blob);
  assert.equal(requests[0].init.headers["X-Parrot-Guardian-Consent-Version"], "guardian-voice-r2-v1");
});

it("schedules every voice from the authored cue instead of previous clip duration", () => {
  const starts = [];
  const sources = DUB_LINES.map(({ id }) => [id, { connect() {}, start(when) { starts.push(when); }, stop() {} }]);
  scheduleDubAudio({ context: fakeContext(10), lineSources: new Map(sources), output: {}, startAt: 11 });
  assert.deepEqual(starts, DUB_LINES.map(({ cueMs }) => 11 + cueMs / 1000));
});
```

- [ ] **Step 2: Run tests and confirm missing-module failures**

Run: `node --test tests/dub-api.test.mjs tests/dub-playback.test.mjs`

Expected: FAIL because the client and scheduler modules do not exist.

- [ ] **Step 3: Implement typed fetches and Web Audio scheduling**

```ts
export type DubStatus = {
  complete: boolean;
  dubId: typeof DUB_ID;
  guardianConsentVersion: "guardian-voice-r2-v1";
  lines: Array<{ id: string; recordedAt: string | null; saved: boolean }>;
};

export const getDubLineAudioUrl = (lineId: string) =>
  `/api/dubs/${DUB_ID}/lines/${encodeURIComponent(lineId)}/audio`;

export async function saveDubLine(lineId: string, blob: Blob, options: { fetch?: typeof fetch; signal?: AbortSignal } = {}) {
  const response = await (options.fetch ?? fetch)(`/api/dubs/${DUB_ID}/lines/${encodeURIComponent(lineId)}`, {
    body: blob,
    headers: {
      "Content-Type": blob.type,
      "X-Parrot-Guardian-Consent-Version": "guardian-voice-r2-v1",
    },
    method: "PUT",
    signal: options.signal,
  });
  if (!response.ok) throw new Error(response.status === 413 ? "That recording is too long. Try the line again." : "Your take was not saved. Try again.");
  return response.json() as Promise<{ recordedAt: string }>;
}
```

Implement the remaining client calls with the same response guard:

```ts
async function requireOk(response: Response, fallback: string) {
  if (!response.ok) throw new Error(fallback);
  return response;
}
export async function loadDubStatus(options: { fetch?: typeof fetch; signal?: AbortSignal } = {}) {
  const response = await (options.fetch ?? fetch)(`/api/dubs/${DUB_ID}`, { credentials: "same-origin", signal: options.signal });
  return (await requireOk(response, "Your saved dub could not be loaded.")).json() as Promise<DubStatus>;
}
export async function deleteDub(options: { fetch?: typeof fetch; signal?: AbortSignal } = {}) {
  const response = await (options.fetch ?? fetch)(`/api/dubs/${DUB_ID}`, { credentials: "same-origin", method: "DELETE", signal: options.signal });
  await requireOk(response, "Your saved dub was not deleted.");
}
```

Schedule voices only from authored cues:

```ts
export function scheduleDubAudio({ context, lineSources, output, startAt }: {
  context: Pick<AudioContext, "currentTime">;
  lineSources: Map<string, Pick<AudioBufferSourceNode, "connect" | "start" | "stop">>;
  output: AudioNode;
  startAt: number;
}) {
  const scheduled = DUB_LINES.flatMap((line) => {
    const source = lineSources.get(line.id);
    if (!source) return [];
    source.connect(output);
    source.start(startAt + line.cueMs / 1000);
    return [source];
  });
  return () => scheduled.forEach((source) => { try { source.stop(); } catch {} });
}
```

`startDubPlayback` creates/resumes an `AudioContext`, fetches all nine audio URLs with `credentials: "same-origin"`, decodes each response, creates a master gain at `0.95` and music gain at `0.08`, and schedules voices with `scheduleDubAudio`. Schedule a new 92 BPM pattern from MIDI notes `[60, 64, 67, 69, 67, 64, 62, 67]`, alternating sine melody and triangle bass; each note ramps from zero to its gain over `0.02s` and back to zero by `beatSeconds * 0.82`. Set `startAt = context.currentTime + 0.12`, report `Math.max(0, (context.currentTime - startAt) * 1000)` from `requestAnimationFrame`, finish at 56,000 ms, and make `stop()` idempotently stop every source/oscillator, cancel the frame, and close the context.

- [ ] **Step 4: Run client/scheduler tests and lint**

Run: `node --test tests/dub-api.test.mjs tests/dub-playback.test.mjs && npm run lint`

Expected: focused tests and lint pass.

- [ ] **Step 5: Commit the browser media boundary**

```bash
git add src/dubbing/dub-api.ts src/dubbing/dub-playback.ts tests/dub-api.test.mjs tests/dub-playback.test.mjs
git commit -m "feat: synchronize saved dub replay"
```

### Task 5: Original Duck Studio, Route, and Home Activity

**Files:**
- Create: `src/dubbing/DuckScene.tsx`
- Create: `src/dubbing/DuckDub.tsx`
- Modify: `src/app/App.tsx:1-1115`
- Modify: `src/app/app-routes.ts:12-35`
- Modify: `src/app/HomeMenu.tsx:1-120`
- Modify: `tests/app-shell-ui.test.mjs`
- Modify: `tests/app-routes.test.mjs`
- Modify: `tests/product-streamline.test.mjs`
- Test: `tests/dub-ui.test.mjs`

**Interfaces:**
- Consumes all Task 1–4 exports plus `playDeviceSpeech`, `startSpeechRecording`, `ActionButton`, `TextButton`, `RouteHeader`, and `HeaderLink`.
- Produces: `DuckScene`, `DuckDub`, testable `DuckDubView`, `getDuckDubPath()`, the `/dubs/five-little-ducks` route, and fourth **Dub a rhyme** home link.

- [ ] **Step 1: Write failing rendered-shell tests**

```js
function renderDuckDub(state) {
  return renderInRouter(createElement(DuckDubView, {
    confirmed: true,
    line: DUB_LINES[state.currentLineIndex],
    onConfirm() {}, onDelete() {}, onHearGuide() {}, onHearTake() {},
    onNext() {}, onRecord() {}, onRetake() {}, onSaveAgain() {},
    onStopPlayback() {}, onStopRecording() {}, onWatch() {},
    state: { ...createInitialDubState(), ...state },
  }), "/dubs/five-little-ducks");
}

test("home and application expose the duck dubbing activity", () => {
  const home = renderInRouter(createElement(HomeMenu));
  assert.match(home, /href="\/dubs\/five-little-ducks"/);
  assert.match(home, />Dub a rhyme</);
  assert.equal((home.match(/<a/g) ?? []).length, 4);
  const dub = renderApplicationRoute("/dubs/five-little-ducks");
  assert.match(dub, /Five Little Ducks/);
  assert.match(dub, /Your recordings are private/);
});

test("duck studio renders readable progress and stable controls", () => {
  const html = renderDuckDub({ phase: "line-ready", currentLineIndex: 0 });
  assert.match(html, /Line 1 of 9/);
  assert.match(html, /Five little ducks went out to play\./);
  assert.match(html, /aria-label="Hear the line"/);
  assert.match(html, /aria-label="Record line 1"/);
});
```

- [ ] **Step 2: Run focused shell/UI tests and confirm missing route/component failures**

Run: `node --test tests/dub-ui.test.mjs tests/app-shell-ui.test.mjs tests/app-routes.test.mjs tests/product-streamline.test.mjs`

Expected: FAIL because `DuckDub`, its path, and fourth home link do not exist.

- [ ] **Step 3: Build the original SVG scene and route orchestration**

`DuckScene` renders an SVG with `viewBox="0 0 960 540"`, a sky gradient, hill, pond, lily pads, reeds, frog, and reusable duck `<g>` shapes. Render `line.duckCount` ducklings and conditionally render mama/frog from `visualBeat`. Use `animate-bounce motion-reduce:animate-none` only on duck groups and `aria-hidden="true"`; put the descriptive scene text outside the SVG for assistive technology.

`DuckDub` must:

```tsx
<main className="h-dvh w-screen overflow-x-hidden overflow-y-auto bg-story-shelf px-3 pb-5 pt-20 md:px-6 md:py-24">
  <RouteHeader>
    <HeaderLink aria-label="Back to home" icon={<ChevronLeft strokeWidth={3.2} />} to="/">Back home</HeaderLink>
  </RouteHeader>
  <section aria-labelledby="dub-title" className="mx-auto grid w-full max-w-6xl gap-4 short-wide:grid-cols-[minmax(0,1.45fr)_minmax(16rem,0.8fr)]">
    <DuckScene line={activeLine} playing={state.phase === "final-playing"} />
    <section className="grid content-center gap-4 rounded-3xl border-4 border-white bg-white/90 p-4 shadow-card">
      <p aria-label={`Line ${index + 1} of ${DUB_LINES.length}`} role="status">Line {index + 1} of {DUB_LINES.length}</p>
      <h1 id="dub-title">Five Little Ducks</h1>
      <p className="text-xl font-black leading-snug text-brand-ink">{activeLine.text}</p>
      {renderDubControls({ activeLine, handlers, state })}
    </section>
  </section>
</main>
```

Render these exact phase actions:

- intro: required checkbox `I’m the grown-up and I agree to save these private voice clips.` and **Start dubbing** or **Continue dubbing**;
- line-ready: **Hear the line**, **Record line n**, and **Watch my dub** only when already complete;
- mic-opening: disabled **Opening microphone…**;
- recording: **Stop recording line n**, plus visible `Recording…`;
- saving: disabled **Saving your take…**;
- save-error: **Save again** and **Try recording again** while retaining the Blob;
- line-review: **Hear my take**, **Try again**, and **Next line**;
- final-ready: **Watch my dub**, **Record a line again**, and **Delete my dub** behind a grown-up confirmation dialog;
- final-loading/final-playing: **Getting your dub ready…** then **Stop playback**.

Implement the control switch with shared primitives and exact accessible labels:

```tsx
type DubControlsProps = {
  activeLine: DubLine;
  handlers: {
    onDelete(): void; onHearGuide(): void; onHearTake(): void; onNext(): void;
    onRecord(): void; onRetake(): void; onSaveAgain(): void;
    onStopPlayback(): void; onStopRecording(): void; onWatch(): void;
  };
  state: DubState;
};

function renderDubControls({ activeLine, handlers, state }: DubControlsProps) {
  const lineNumber = state.currentLineIndex + 1;
  if (state.phase === "mic-opening") return <ActionButton disabled>Opening microphone…</ActionButton>;
  if (state.phase === "recording") return <ActionButton aria-label={`Stop recording line ${lineNumber}`} onClick={handlers.onStopRecording} variant="rose"><Square aria-hidden="true" /> Stop recording</ActionButton>;
  if (state.phase === "saving") return <ActionButton disabled>Saving your take…</ActionButton>;
  if (state.phase === "save-error") return <><ActionButton onClick={handlers.onSaveAgain}>Save again</ActionButton><TextButton onClick={handlers.onRetake}>Try recording again</TextButton></>;
  if (state.phase === "line-review") return <><ActionButton aria-label="Hear my take" onClick={handlers.onHearTake} variant="navy"><Volume2 aria-hidden="true" /> Hear my take</ActionButton><ActionButton onClick={handlers.onNext}>Next line</ActionButton><TextButton onClick={handlers.onRetake}>Try again</TextButton></>;
  if (state.phase === "final-loading") return <ActionButton disabled>Getting your dub ready…</ActionButton>;
  if (state.phase === "final-playing") return <ActionButton onClick={handlers.onStopPlayback} variant="rose">Stop playback</ActionButton>;
  if (state.phase === "final-ready") return <><ActionButton onClick={handlers.onWatch} variant="success"><Play aria-hidden="true" /> Watch my dub</ActionButton><TextButton onClick={handlers.onRetake}>Record a line again</TextButton><TextButton onClick={handlers.onDelete}>Delete my dub</TextButton></>;
  return <><ActionButton aria-label="Hear the line" onClick={handlers.onHearGuide} variant="navy"><Volume2 aria-hidden="true" /> Hear the line</ActionButton><ActionButton aria-label={`Record line ${lineNumber}`} onClick={handlers.onRecord} variant="rose"><Mic aria-hidden="true" /> Record</ActionButton></>;
}
```

Create and abort one controller per guide, upload, clip-preview, and final-playback operation. Keep a recording session ref and stop tracks on unmount. On six-second timeout call `session.stop()`, save the returned Blob, and keep it in a ref until upload succeeds or a replacement recording starts.

Update `SAFE_RETURN_PATHS` with `/^\/dubs\/five-little-ducks\/*$/i`, export `getDuckDubPath()`, lazy-load `DuckDub` beside the story components, register the route, and add the fourth home item. Change the home layout to two columns on phones and four equal columns on `short-wide`/desktop; render `DuckScene compact` in the dub card instead of adding a public image.

- [ ] **Step 4: Run UI/shell tests, lint, and build**

Run: `node --test tests/dub-ui.test.mjs tests/app-shell-ui.test.mjs tests/app-routes.test.mjs tests/product-streamline.test.mjs && npm run lint && npm run build`

Expected: focused tests, lint, and build pass.

- [ ] **Step 5: Commit the complete route**

```bash
git add src/dubbing/DuckScene.tsx src/dubbing/DuckDub.tsx src/app/App.tsx src/app/app-routes.ts src/app/HomeMenu.tsx tests/dub-ui.test.mjs tests/app-shell-ui.test.mjs tests/app-routes.test.mjs tests/product-streamline.test.mjs
git commit -m "feat: add five little ducks dubbing game"
```

### Task 6: Browser Flow, Responsive QA, and Product Documentation

**Files:**
- Modify: `src/testing/e2e-browser-mocks.ts`
- Create: `tests/e2e/dubbing.spec.ts`
- Modify: `tests/e2e/home-menu.spec.ts`
- Modify: `tests/e2e/header.spec.ts`
- Modify: `docs/design/product-experience.md`
- Modify: `docs/design/technical-architecture.md`
- Modify: `docs/design/audio-and-content-pipeline.md`

**Interfaces:**
- Consumes the completed route and API contract.
- Produces deterministic browser scenarios `parrotE2eDub=empty|partial|complete|upload-failed` and final shipped documentation.

- [ ] **Step 1: Write failing Playwright coverage against the real route**

```ts
test("records, saves, resumes, and replays the nine-line dub", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=empty");
  await page.getByRole("checkbox", { name: /I’m the grown-up/ }).check();
  await page.getByRole("button", { name: "Start dubbing" }).click();
  await page.getByRole("button", { name: "Record line 1" }).click();
  await expect(page.getByText("Recording…")).toBeVisible();
  await page.getByRole("button", { name: "Stop recording line 1" }).click();
  await expect(page.getByRole("button", { name: "Hear my take" })).toBeVisible();
  await page.reload();
  await page.getByRole("checkbox", { name: /I’m the grown-up/ }).check();
  await page.getByRole("button", { name: "Continue dubbing" }).click();
  await expect(page.getByText("Line 2 of 9")).toBeVisible();
});

for (const viewport of [{ width: 280, height: 568 }, { width: 390, height: 844 }, { width: 640, height: 360 }, { width: 1280, height: 800 }]) {
  test(`contains the studio at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/dubs/five-little-ducks?parrotE2eDub=partial");
    await expect(page.getByRole("main")).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("link", { name: "Back to home" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Account for Mia" })).toBeVisible();
  });
}
```

Add these failure and completion assertions to the same spec:

```ts
test("keeps a take available when its first upload fails", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=upload-failed");
  await page.getByRole("checkbox", { name: /I’m the grown-up/ }).check();
  await page.getByRole("button", { name: "Start dubbing" }).click();
  await page.getByRole("button", { name: "Record line 1" }).click();
  await page.getByRole("button", { name: "Stop recording line 1" }).click();
  await expect(page.getByRole("alert")).toContainText("not saved");
  await page.getByRole("button", { name: "Save again" }).click();
  await expect(page.getByRole("button", { name: "Hear my take" })).toBeVisible();
});

test("plays and deletes a complete private dub", async ({ page }) => {
  await page.goto("/dubs/five-little-ducks?parrotE2eDub=complete");
  await page.getByRole("checkbox", { name: /I’m the grown-up/ }).check();
  await page.getByRole("button", { name: "Continue dubbing" }).click();
  await page.getByRole("button", { name: "Watch my dub" }).click();
  await expect(page.getByRole("button", { name: "Stop playback" })).toBeVisible();
  await page.getByRole("button", { name: "Stop playback" }).click();
  await page.getByRole("button", { name: "Delete my dub" }).click();
  await page.getByRole("button", { name: "Delete recordings" }).click();
  await expect(page.getByRole("button", { name: "Start dubbing" })).toBeVisible();
});
```

Use existing `parrotE2eMicrophone=denied|unsupported` cases to assert the calm alert, visible line, retryable record action, and unchanged focus. Run the containment test once with `page.emulateMedia({ reducedMotion: "reduce" })` and assert every visible duck has `animationName === "none"`. Compare the bounding boxes of **Back to home**, **Account for Mia**, the studio stage, and the active action and assert no pair overlaps.

- [ ] **Step 2: Run the new browser spec and confirm failures**

Run: `npx playwright test tests/e2e/dubbing.spec.ts --project=chromium`

Expected: FAIL until the browser doubles and responsive adjustments support the route.

- [ ] **Step 3: Add deterministic mocks, update home/header expectations, and document the feature**

Extend the existing fetch double with an in-memory `Map<string, Blob>` keyed by line ID. Seed zero, three, or nine blobs beginning with `[0x1a, 0x45, 0xdf, 0xa3]` from `parrotE2eDub`; on status return all nine `{ id, recordedAt, saved }` rows, on upload store `request.blob()`, on audio return the stored Blob or 404, and on delete clear the map. For `upload-failed`, return 503 once and then accept the retry. Make the fake recorder expose `mimeType = "audio/webm"` and static `isTypeSupported(type) { return type === "audio/webm;codecs=opus"; }`.

Update home tests from three to four activities and assert the two-by-two/four-across layout, loaded existing images plus the inline duck SVG, visible/contained links, and no overflow. Add the dub route to the header viewport matrix.

Update product documentation to state:

- four focused activities, with **Dub a rhyme** as private saved performance;
- `/dubs/five-little-ducks` is durable and `/api/dubs/five-little-ducks-v1/*` is authenticated;
- R2 clip slots live under the existing per-user private purge prefix and use no D1 metadata;
- final playback uses native Web Audio and original SVG/procedural music;
- voice clips are private, replaceable, resettable, and deleted with the account.

- [ ] **Step 4: Run browser tests, then all required gates**

Run:

```bash
npm run test:browser
npm test
npm run lint
npm run build
```

Expected: every command exits 0 with no failed tests, lint errors, type errors, or browser failures.

- [ ] **Step 5: Inspect the rendered experience and iterate once**

Run the app at 390x844 and 1280x800, capture screenshots of intro, line-ready, recording, review, and final-ready states, and verify the stage remains visually dominant, the active action is obvious, the account/header controls do not overlap, the duck count matches the line, and no copy or control is clipped. Fix any observed issue and rerun the relevant Playwright spec plus `npm run build`.

- [ ] **Step 6: Commit browser coverage and documentation**

```bash
git add src/testing/e2e-browser-mocks.ts tests/e2e/dubbing.spec.ts tests/e2e/home-menu.spec.ts tests/e2e/header.spec.ts docs/design/product-experience.md docs/design/technical-architecture.md docs/design/audio-and-content-pipeline.md
git commit -m "test: verify duck dubbing experience"
```
