# Worker AI Director Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Worker-backed `/api/lesson-director` route that calls an AI provider, validates the returned packet, and falls back to deterministic packets when the AI response is invalid or unavailable.

**Architecture:** The browser sends the same lesson JSON/runtime state used by the mock director. The Worker assembles the system prompt, calls the provider through a small adapter, parses JSON, validates with `validateLessonDirectorResponse`, and returns either the validated packet or a deterministic fallback packet. The frontend switches from local mock packets to the Worker route only when a feature flag is enabled.

**Tech Stack:** Cloudflare Worker TypeScript, existing `worker/index.ts`, Node tests, shared `lib/lesson-director-schema.js`, `fetch`, environment variables for provider credentials and timeouts.

---

## Architecture Decisions

- Keep the Worker provider adapter isolated in `worker/lesson-director-provider.ts`.
- Keep prompt assembly in `worker/lesson-director-prompt.ts`.
- Keep request parsing, timeout handling, validation, and fallback in `worker/lesson-director.ts`.
- Do not expose provider keys to the browser.
- Do not persist child audio, raw child audio blobs, or long transcript history.
- Add a separate rate limit for `/api/lesson-director`; AI calls have different cost and latency than speech evaluation.
- Return deterministic packets for invalid JSON, provider errors, provider timeouts, and schema validation failures.

## File Structure

- Create `worker/lesson-director-prompt.ts`: system prompt and request prompt assembly.
- Create `worker/lesson-director-provider.ts`: provider adapter interface and network call wrapper.
- Create `worker/lesson-director.ts`: route handler.
- Modify `worker/index.ts`: route `/api/lesson-director`.
- Modify `worker/api-security.ts`: add director rate limiting.
- Create `src/lesson-director-request.ts`: browser request helper.
- Modify `src/App.tsx`: call Worker route when `VITE_PARROT_DIRECTOR_API=1`.
- Create `tests/lesson-director-prompt.test.mjs`.
- Create `tests/lesson-director-worker.test.mjs`.
- Create `tests/lesson-director-request.test.mjs`.

## Task 1: Prompt Assembly

**Files:**
- Create: `worker/lesson-director-prompt.ts`
- Test: `tests/lesson-director-prompt.test.mjs`

- [ ] **Step 1: Write failing prompt tests**

Create `tests/lesson-director-prompt.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../worker/lesson-director-prompt.ts", import.meta.url),
  "utf8"
);

describe("lesson director prompt", () => {
  it("contains world and character binding rules", () => {
    assert.match(source, /Treat lesson\\.world as the story bible/);
    assert.match(source, /persona, relationshipToLearner, speechStyle/);
  });

  it("requires JSON-only output and the response schema version", () => {
    assert.match(source, /Return valid JSON only/);
    assert.match(source, /lesson-director\\.response\\.v1/);
  });

  it("requires segmented multilingual speech", () => {
    assert.match(source, /Do not place Chinese and English in the same speech segment/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/lesson-director-prompt.test.mjs
```

Expected: FAIL because `worker/lesson-director-prompt.ts` does not exist.

- [ ] **Step 3: Implement prompt assembly**

Create `worker/lesson-director-prompt.ts`:

```ts
export const LESSON_DIRECTOR_SYSTEM_PROMPT = `You are the AI lesson director for a child English-speaking lesson app.

You control turn order for the visible lesson characters, but you are not a freeform chat assistant. You must follow the supplied lesson JSON, current runtime state, available assets, and output schema.

Primary job:
- Choose the next few character turns.
- Choose the scene background and character poses from the available asset IDs.
- Adapt tutor feedback to the child transcript and speech-evaluation result.
- Stop the packet as soon as the child should speak.

World rules:
- Treat lesson.world as the story bible for the lesson universe.
- Keep every line inside the supplied setting, tone, story premise, and allowed story elements.
- Do not introduce disallowed story elements.
- Do not create new locations, props, plot problems, or emotional stakes unless they are provided by the lesson scene.
- Keep the lesson feeling like a tiny friendly preschool cartoon moment, not a generic tutoring chat.

Character rules:
- Use only characters provided in the lesson JSON.
- Treat each character's persona, relationshipToLearner, speechStyle, mustDo, mustAvoid, and allowedPurposes as binding instructions.
- Peppa is the English scene speaker unless the lesson JSON says otherwise.
- Polly is the tutor. Polly may explain in Chinese, model short English target phrases, prompt the child, and give feedback.
- Peppa should feel like a friendly playmate, not a teacher.
- Polly should feel like an energetic supportive coach, not a test proctor.
- Do not invent new characters.
- Do not mention that you are an AI.

Lesson rules:
- Follow the current scene and target phrase from the lesson JSON.
- Do not skip required targets.
- Do not introduce new target phrases unless they are already in the lesson JSON.
- If the scene mode is "reply", prompt the child to answer the scene speaker.
- If the scene mode is "mimic", prompt the child to repeat the model line.
- Keep child-facing lines short and concrete.
- Use warm, supportive feedback.
- Never shame the child for mistakes.
- If the child answer passed and the teaching policy requires a success repeat, praise the child and prompt one more repeat before advancing.
- If the child answer failed, provide brief supportive feedback and prompt a retry, unless the retry limit has been reached.
- If no speech was detected, tell the child you did not hear clearly and prompt another try.

Audio and language rules:
- Output visibleText for the speech bubble.
- Output speech as an array of language-specific segments.
- Do not place Chinese and English in the same speech segment.
- Use "zh-CN" for Mandarin Chinese.
- Use "en-US" for English target phrases unless the lesson JSON specifies a different learning language.
- No character may speak while the child is recording.

Asset rules:
- background must be one of lesson.availableAssets.backgrounds.
- Every turn pose must be one of lesson.availableAssets.poses[speaker].
- The final resting character poses must also use available pose IDs.

Output rules:
- Return valid JSON only.
- Return exactly one object matching schemaVersion "lesson-director.response.v1".
- Do not include Markdown.
- Do not include comments.
- Do not include extra keys outside the schema.
- The turns array must contain only turns that happen before the next child recording or lesson transition.
- If the child should speak next, set childPrompt.shouldListen to true and set lessonControl.status to "prompt_child".
- childPrompt.targetText must exactly match the intended child answer.`;

export function createLessonDirectorUserPrompt(requestBody: unknown): string {
  return [
    "Use the following lesson JSON, runtime state, and response schema.",
    "",
    "REQUEST_JSON:",
    JSON.stringify(requestBody),
    "",
    "Return the next lesson-director response packet.",
  ].join("\n");
}
```

- [ ] **Step 4: Run prompt tests**

Run:

```bash
npm test -- tests/lesson-director-prompt.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/lesson-director-prompt.ts tests/lesson-director-prompt.test.mjs
git commit -m "Add lesson director system prompt"
```

## Task 2: Worker Route With Mockable Provider

**Files:**
- Create: `worker/lesson-director-provider.ts`
- Create: `worker/lesson-director.ts`
- Modify: `worker/index.ts`
- Test: `tests/lesson-director-worker.test.mjs`

- [ ] **Step 1: Write failing Worker route tests**

Create `tests/lesson-director-worker.test.mjs`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AI_LESSON } from "../lib/ai-lesson-data.js";
import { handleLessonDirector } from "../worker/lesson-director.ts";

function createRequest(body) {
  return new Request("https://example.com/api/lesson-director", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const runtimeState = {
  currentSceneId: "greeting",
  phase: "start_scene",
  attemptNumber: 0,
  successfulRepeats: 0,
  previousTurnSummary: [],
  lastChildResult: null,
};

describe("lesson director Worker route", () => {
  it("returns a validated provider packet", async () => {
    const providerPacket = {
      schemaVersion: "lesson-director.response.v1",
      packetId: "provider-packet-001",
      sceneId: "greeting",
      background: "meadowDay",
      characters: {
        peppa: { pose: "listen" },
        polly: { pose: "talk" },
      },
      turns: [],
      childPrompt: {
        shouldListen: false,
        targetText: "",
        displayText: "",
        recordingSeconds: 0,
      },
      lessonControl: {
        status: "advance_scene",
        nextSceneId: "cant-reach",
        reason: "test",
      },
    };

    const response = await handleLessonDirector(
      createRequest({ lesson: AI_LESSON, runtimeState }),
      {},
      async () => providerPacket
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.packetId, "provider-packet-001");
  });

  it("falls back when provider packet is invalid", async () => {
    const response = await handleLessonDirector(
      createRequest({ lesson: AI_LESSON, runtimeState }),
      {},
      async () => ({ schemaVersion: "lesson-director.response.v1" })
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.lessonControl.status, "prompt_child");
    assert.equal(payload.lessonControl.reason, "director_fallback");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/lesson-director-worker.test.mjs
```

Expected: FAIL because `worker/lesson-director.ts` does not exist.

- [ ] **Step 3: Implement provider adapter**

Create `worker/lesson-director-provider.ts`:

```ts
import {
  LESSON_DIRECTOR_SYSTEM_PROMPT,
  createLessonDirectorUserPrompt,
} from "./lesson-director-prompt";

export interface LessonDirectorProviderEnv {
  LESSON_DIRECTOR_API_KEY?: string;
  LESSON_DIRECTOR_BASE_URL?: string;
  LESSON_DIRECTOR_MODEL?: string;
  LESSON_DIRECTOR_TIMEOUT_MS?: string;
}

export async function callLessonDirectorProvider(
  requestBody: unknown,
  env: LessonDirectorProviderEnv
): Promise<unknown> {
  if (!env.LESSON_DIRECTOR_API_KEY) {
    throw new Error("LESSON_DIRECTOR_API_KEY is not configured.");
  }
  if (!env.LESSON_DIRECTOR_BASE_URL) {
    throw new Error("LESSON_DIRECTOR_BASE_URL is not configured.");
  }

  const response = await fetch(env.LESSON_DIRECTOR_BASE_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.LESSON_DIRECTOR_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.LESSON_DIRECTOR_MODEL,
      systemPrompt: LESSON_DIRECTOR_SYSTEM_PROMPT,
      userPrompt: createLessonDirectorUserPrompt(requestBody),
      responseFormat: "json_object",
    }),
  });

  if (!response.ok) {
    throw new Error(`Lesson director provider failed: ${response.status}`);
  }

  const payload = await response.json() as { outputText?: string; packet?: unknown };
  if (payload.packet) return payload.packet;
  if (!payload.outputText) {
    throw new Error("Lesson director provider returned no outputText.");
  }
  return JSON.parse(payload.outputText);
}
```

This adapter intentionally uses an app-owned provider gateway contract:
`systemPrompt`, `userPrompt`, `responseFormat`, and an `outputText` or `packet`
response. If the app calls a provider directly instead of a gateway, replace
only this adapter and keep route tests provider-mocked so CI never depends on
external network calls.

- [ ] **Step 4: Implement route handler**

Create `worker/lesson-director.ts`:

```ts
import { getMockDirectorPacket } from "../lib/mock-lesson-director.js";
import { validateLessonDirectorResponse } from "../lib/lesson-director-schema.js";
import { callLessonDirectorProvider, type LessonDirectorProviderEnv } from "./lesson-director-provider";

type ProviderCall = (requestBody: unknown, env: LessonDirectorProviderEnv) => Promise<unknown>;

function json(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

function createFallbackPacket(lesson: any, runtimeState: any) {
  const packet = getMockDirectorPacket(lesson, runtimeState);
  return {
    ...packet,
    lessonControl: {
      ...packet.lessonControl,
      reason: "director_fallback",
    },
  };
}

export async function handleLessonDirector(
  request: Request,
  env: LessonDirectorProviderEnv,
  providerCall: ProviderCall = callLessonDirectorProvider
) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, { status: 405 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const lesson = body.lesson;
  const runtimeState = body.runtimeState;
  if (!lesson || !runtimeState) {
    return json({ error: "lesson and runtimeState are required." }, { status: 400 });
  }

  try {
    const packet = await providerCall(body, env);
    const validation = validateLessonDirectorResponse(packet, lesson);
    if (validation.ok) return json(packet);
  } catch {
    // Fall through to deterministic packet.
  }

  return json(createFallbackPacket(lesson, runtimeState));
}
```

Modify `worker/index.ts`:

```ts
import { handleLessonDirector } from "./lesson-director";
```

Add route before the static fallback:

```ts
if (url.pathname === "/api/lesson-director") {
  return handleLessonDirector(request, env);
}
```

Extend `Env`:

```ts
LESSON_DIRECTOR_API_KEY?: string;
LESSON_DIRECTOR_BASE_URL?: string;
LESSON_DIRECTOR_MODEL?: string;
LESSON_DIRECTOR_TIMEOUT_MS?: string;
```

- [ ] **Step 5: Run Worker tests and build**

Run:

```bash
npm test -- tests/lesson-director-worker.test.mjs tests/mock-lesson-director.test.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add worker/index.ts worker/lesson-director.ts worker/lesson-director-provider.ts tests/lesson-director-worker.test.mjs
git commit -m "Add lesson director Worker route"
```

## Task 3: Browser Request Helper

**Files:**
- Create: `src/lesson-director-request.ts`
- Test: `tests/lesson-director-request.test.mjs`

- [ ] **Step 1: Write failing request-helper tests**

Create `tests/lesson-director-request.test.mjs`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { requestLessonDirectorPacket } from "../src/lesson-director-request.ts";

describe("lesson director request", () => {
  it("posts lesson and runtime state to the Worker route", async () => {
    const calls = [];
    const packet = { schemaVersion: "lesson-director.response.v1", packetId: "p1" };
    const result = await requestLessonDirectorPacket({
      lesson: { lessonId: "l1" },
      runtimeState: { currentSceneId: "greeting" },
      fetch: async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify(packet), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    assert.equal(result.packetId, "p1");
    assert.equal(calls[0].url, "/api/lesson-director");
    assert.equal(calls[0].init.method, "POST");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/lesson-director-request.test.mjs
```

Expected: FAIL because `src/lesson-director-request.ts` does not exist.

- [ ] **Step 3: Implement helper**

Create `src/lesson-director-request.ts`:

```ts
type RequestLessonDirectorPacketOptions = {
  fetch?: typeof globalThis.fetch;
  lesson: unknown;
  runtimeState: unknown;
  signal?: AbortSignal;
};

async function readJsonError(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string; error?: string };
    return payload.message ?? payload.error ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function requestLessonDirectorPacket({
  fetch: request = globalThis.fetch,
  lesson,
  runtimeState,
  signal,
}: RequestLessonDirectorPacketOptions) {
  const response = await request("/api/lesson-director", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lesson, runtimeState }),
    signal,
  });

  if (!response.ok) {
    throw new Error(await readJsonError(response));
  }

  return response.json();
}
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
npm test -- tests/lesson-director-request.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lesson-director-request.ts tests/lesson-director-request.test.mjs
git commit -m "Add lesson director browser request helper"
```

## Task 4: Frontend API Feature Flag

**Files:**
- Modify: `src/App.tsx`
- Test: `tests/director-packet-ui.test.mjs`

- [ ] **Step 1: Extend UI test**

Add this assertion to `tests/director-packet-ui.test.mjs`:

```js
it("can request director packets from the Worker route", () => {
  assert.match(appSource, /requestLessonDirectorPacket/);
  assert.match(appSource, /VITE_PARROT_DIRECTOR_API/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/director-packet-ui.test.mjs
```

Expected: FAIL because `src/App.tsx` does not import the request helper.

- [ ] **Step 3: Switch packet loading to API when enabled**

Modify `src/App.tsx`:

```tsx
import { requestLessonDirectorPacket } from "./lesson-director-request";
```

Add feature flag:

```tsx
const USE_DIRECTOR_PACKET_API =
  import.meta.env.VITE_PARROT_DIRECTOR_API === "1";
```

In the packet loading effect:

```tsx
const packet = USE_DIRECTOR_PACKET_API
  ? await requestLessonDirectorPacket({
      lesson: AI_LESSON,
      runtimeState: state.runtimeState,
      signal: controller.signal,
    })
  : getMockDirectorPacket(AI_LESSON, state.runtimeState);
```

Use an `AbortController` in that effect so navigation and unmount cancel pending AI calls.

- [ ] **Step 4: Run focused checks**

Run:

```bash
npm test -- tests/director-packet-ui.test.mjs tests/lesson-director-request.test.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "Gate director packets behind Worker API flag"
```

## Task 5: Plan 2 Verification

**Files:**
- No new files.

- [ ] **Step 1: Run full checks**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all commands PASS.

- [ ] **Step 2: Manual smoke test without AI key**

Run:

```bash
VITE_PARROT_DIRECTOR_FLOW=1 VITE_PARROT_DIRECTOR_API=1 npm run dev
```

Expected:

- `/api/lesson-director` returns a fallback packet because the provider key is absent.
- The UI still advances through mock-like packets.
- The child prompt still uses the exact target from the lesson JSON.

- [ ] **Step 3: Manual smoke test with AI key**

Run with local environment configured:

```bash
VITE_PARROT_DIRECTOR_FLOW=1 VITE_PARROT_DIRECTOR_API=1 npm run dev
```

Expected:

- `/api/lesson-director` returns a provider packet.
- Invalid provider output produces fallback, not a broken UI.
- AI latency is visible through the existing loading state.
