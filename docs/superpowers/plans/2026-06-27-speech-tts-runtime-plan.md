# Speech And TTS Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add audio playback for director `speech[]` segments using static audio when available and cached generated audio for dynamic segments, while preserving the rule that no character speaks during child recording.

**Architecture:** Introduce a segment playback pipeline instead of passing director text directly to `playAudioLine`. Each speech segment is resolved to either an existing static audio asset or a generated data URL from the Worker. The browser caches generated segment URLs by a stable hash of speaker, language, and text for the current lesson session. Durable Worker/KV/R2 caching can wrap the same segment key later without changing the frontend contract.

**Tech Stack:** Existing `src/audio-playback.ts`, `lib/static-audio.js`, Cloudflare Worker TypeScript, ElevenLabs-compatible generation path already used by `scripts/generate-static-audio.mjs`, Node tests.

---

## Architecture Decisions

- Prefer static audio when `speech[].text` exactly matches a saved static line.
- Generate audio only for unmatched dynamic segments.
- Cache generated audio by deterministic segment key in the browser session.
- Keep Chinese and English segments separate for voice quality.
- Use existing voice metadata from `lib/static-audio.js` as the model for voice routing.
- Never trigger TTS while recording. Segment resolution happens before or during packet turn playback, not during `Listening`.
- If TTS fails, play a timed silent segment and keep the UI moving.

## File Structure

- Create `lib/director-speech-segments.js`: segment key generation and static audio matching.
- Create `src/director-audio-playback.ts`: browser playback for director turn `speech[]`.
- Create `worker/director-tts.ts`: Worker handler for generated segment audio.
- Modify `worker/index.ts`: route `/api/director-tts`.
- Modify `src/App.tsx`: use director audio playback instead of fixed turn delay when director flow is active.
- Create `tests/director-speech-segments.test.mjs`.
- Create `tests/director-audio-playback.test.mjs`.
- Create `tests/director-tts-worker.test.mjs`.

## Task 1: Segment Keys And Static Audio Matching

**Files:**
- Create: `lib/director-speech-segments.js`
- Test: `tests/director-speech-segments.test.mjs`

- [ ] **Step 1: Write failing segment tests**

Create `tests/director-speech-segments.test.mjs`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDirectorSpeechSegmentKey,
  resolveStaticDirectorSpeechSegment,
} from "../lib/director-speech-segments.js";

describe("director speech segments", () => {
  it("creates stable segment keys from speaker language and text", () => {
    assert.equal(
      createDirectorSpeechSegmentKey({
        speaker: "polly",
        lang: "zh-CN",
        text: "轮到你了，跟着佩奇说。",
      }),
      "polly__zh-CN__ea0dc272"
    );
  });

  it("matches existing static audio by exact visible text", () => {
    const result = resolveStaticDirectorSpeechSegment({
      speaker: "peppa",
      lang: "en-US",
      text: "Thank you!",
    });

    assert.equal(result.kind, "static");
    assert.equal(result.audioSrc, "/assets/audio/pig-thank-you.wav");
  });

  it("marks unmatched dynamic text for generated audio", () => {
    const result = resolveStaticDirectorSpeechSegment({
      speaker: "polly",
      lang: "zh-CN",
      text: "太棒了！你回答了佩奇。",
    });

    assert.equal(result.kind, "dynamic");
    assert.equal(result.audioSrc, null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/director-speech-segments.test.mjs
```

Expected: FAIL because `lib/director-speech-segments.js` does not exist.

- [ ] **Step 3: Implement segment helpers**

Create `lib/director-speech-segments.js`:

```js
// @ts-check

import { findStaticAudioLineByText, getStaticAudioLine } from "./static-audio.js";

function hashText(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createDirectorSpeechSegmentKey(segment) {
  return `${segment.speaker}__${segment.lang}__${hashText(segment.text)}`;
}

export function resolveStaticDirectorSpeechSegment(segment) {
  const audioId = findStaticAudioLineByText(segment.text);
  if (!audioId) {
    return {
      kind: "dynamic",
      key: createDirectorSpeechSegmentKey(segment),
      audioId: null,
      audioSrc: null,
      lang: segment.lang,
      text: segment.text,
    };
  }

  const line = getStaticAudioLine(audioId);
  return {
    kind: "static",
    key: createDirectorSpeechSegmentKey(segment),
    audioId: line.id,
    audioSrc: line.src,
    lang: line.lang,
    text: line.text,
  };
}
```

- [ ] **Step 4: Run segment tests**

Run:

```bash
npm test -- tests/director-speech-segments.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/director-speech-segments.js tests/director-speech-segments.test.mjs
git commit -m "Resolve director speech segments"
```

## Task 2: Browser Director Audio Playback

**Files:**
- Create: `src/director-audio-playback.ts`
- Test: `tests/director-audio-playback.test.mjs`

- [ ] **Step 1: Write failing playback tests**

Create `tests/director-audio-playback.test.mjs`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { playDirectorTurnSpeech } from "../src/director-audio-playback.ts";

describe("director audio playback", () => {
  it("plays each speech segment in order", async () => {
    const played = [];

    await playDirectorTurnSpeech({
      speaker: "polly",
      speech: [
        { lang: "zh-CN", text: "轮到你说：" },
        { lang: "en-US", text: "Hello, Peppa!" },
      ],
      playResolvedSegment: async (segment) => {
        played.push(segment.text);
      },
      waitForSilentSegment: async () => {},
    });

    assert.deepEqual(played, ["轮到你说：", "Hello, Peppa!"]);
  });

  it("falls back to silent timing when segment playback fails", async () => {
    let silentCount = 0;

    await playDirectorTurnSpeech({
      speaker: "polly",
      speech: [{ lang: "zh-CN", text: "新的动态句子。" }],
      playResolvedSegment: async () => {
        throw new Error("audio failed");
      },
      waitForSilentSegment: async () => {
        silentCount += 1;
      },
    });

    assert.equal(silentCount, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/director-audio-playback.test.mjs
```

Expected: FAIL because `src/director-audio-playback.ts` does not exist.

- [ ] **Step 3: Implement browser playback**

Create `src/director-audio-playback.ts`:

```ts
import { resolveStaticDirectorSpeechSegment } from "../lib/director-speech-segments";
import { playAudioLine } from "./audio-playback";

type SpeechSegment = {
  lang: string;
  text: string;
};

type PlayDirectorTurnSpeechOptions = {
  signal?: AbortSignal;
  speaker: string;
  speech: SpeechSegment[];
  playResolvedSegment?: (segment: {
    audioSrc: string | null;
    lang: string;
    text: string;
  }) => Promise<void>;
  waitForSilentSegment?: (segment: SpeechSegment) => Promise<void>;
};

const dynamicAudioCache = new Map<string, string>();

function getSilentDurationMs(text: string) {
  return Math.max(600, Math.min(1800, text.length * 80));
}

async function defaultWaitForSilentSegment(segment: SpeechSegment) {
  await new Promise((resolve) => {
    window.setTimeout(resolve, getSilentDurationMs(segment.text));
  });
}

async function requestDynamicSegmentAudio(segment: {
  speaker: string;
  lang: string;
  text: string;
}) {
  const response = await fetch("/api/director-tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(segment),
  });
  if (!response.ok) throw new Error("Director TTS failed.");
  const payload = (await response.json()) as { audioSrc: string; key: string };
  dynamicAudioCache.set(payload.key, payload.audioSrc);
  return payload.audioSrc;
}

export async function playDirectorTurnSpeech({
  signal,
  speaker,
  speech,
  playResolvedSegment,
  waitForSilentSegment = defaultWaitForSilentSegment,
}: PlayDirectorTurnSpeechOptions) {
  for (const segment of speech) {
    if (signal?.aborted) return;
    const resolved = resolveStaticDirectorSpeechSegment({ speaker, ...segment });
    try {
      const cachedAudioSrc = dynamicAudioCache.get(resolved.key);
      const audioSrc =
        cachedAudioSrc ??
        (resolved.kind === "static"
          ? resolved.audioSrc
          : await requestDynamicSegmentAudio({ speaker, ...segment }));
      if (playResolvedSegment) {
        await playResolvedSegment({ audioSrc, lang: segment.lang, text: segment.text });
      } else {
        await playAudioLine({
          audioId: resolved.key,
          audioSrc,
          lang: segment.lang,
          text: segment.text,
          signal,
        });
      }
    } catch {
      await waitForSilentSegment(segment);
    }
  }
}
```

- [ ] **Step 4: Run playback tests**

Run:

```bash
npm test -- tests/director-audio-playback.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/director-audio-playback.ts tests/director-audio-playback.test.mjs
git commit -m "Add director speech playback"
```

## Task 3: Worker TTS Route

**Files:**
- Create: `worker/director-tts.ts`
- Modify: `worker/index.ts`
- Test: `tests/director-tts-worker.test.mjs`

- [ ] **Step 1: Write failing TTS route tests**

Create `tests/director-tts-worker.test.mjs`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleDirectorTts } from "../worker/director-tts.ts";

describe("director TTS Worker route", () => {
  it("rejects mixed language segment text", async () => {
    const response = await handleDirectorTts(
      new Request("https://example.com/api/director-tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          speaker: "polly",
          lang: "zh-CN",
          text: "轮到你说：Hello, Peppa!",
        }),
      }),
      {}
    );

    assert.equal(response.status, 400);
  });

  it("returns a playable data URL for valid text when provider is mocked", async () => {
    const response = await handleDirectorTts(
      new Request("https://example.com/api/director-tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          speaker: "polly",
          lang: "zh-CN",
          text: "新的动态句子。",
        }),
      }),
      {},
      async () => new Uint8Array([1, 2, 3])
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.match(payload.audioSrc, /^data:audio\/mpeg;base64,/);
    assert.match(payload.key, /^polly__zh-CN__/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/director-tts-worker.test.mjs
```

Expected: FAIL because `worker/director-tts.ts` does not exist.

- [ ] **Step 3: Implement TTS handler shell**

Create `worker/director-tts.ts`:

```ts
import { createDirectorSpeechSegmentKey } from "../lib/director-speech-segments.js";

type Env = {
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_MODEL_ID?: string;
};

type GenerateAudio = (segment: {
  speaker: string;
  lang: string;
  text: string;
}, env: Env) => Promise<Uint8Array>;

const CHINESE_PATTERN = /[\u3400-\u9fff]/;
const LATIN_PATTERN = /[A-Za-z]/;

function json(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

function hasMixedChineseAndEnglish(text: string) {
  return CHINESE_PATTERN.test(text) && LATIN_PATTERN.test(text);
}

function toDataUrl(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:audio/mpeg;base64,${btoa(binary)}`;
}

async function defaultGenerateAudio() {
  throw new Error("Director TTS provider is not configured.");
}

export async function handleDirectorTts(
  request: Request,
  env: Env,
  generateAudio: GenerateAudio = defaultGenerateAudio
) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, { status: 405 });
  }

  const body = await request.json() as {
    speaker?: string;
    lang?: string;
    text?: string;
  };

  if (!body.speaker || !body.lang || !body.text) {
    return json({ error: "speaker, lang, and text are required." }, { status: 400 });
  }
  if (hasMixedChineseAndEnglish(body.text)) {
    return json({ error: "speech segment must contain one language." }, { status: 400 });
  }

  const key = createDirectorSpeechSegmentKey({
    speaker: body.speaker,
    lang: body.lang,
    text: body.text,
  });

  const bytes = await generateAudio({
    speaker: body.speaker,
    lang: body.lang,
    text: body.text,
  }, env);

  return json({ key, audioSrc: toDataUrl(bytes) });
}
```

Modify `worker/index.ts`:

```ts
import { handleDirectorTts } from "./director-tts";
```

Add route:

```ts
if (url.pathname === "/api/director-tts") {
  return handleDirectorTts(request, env);
}
```

- [ ] **Step 4: Run TTS route tests**

Run:

```bash
npm test -- tests/director-tts-worker.test.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/director-tts.ts worker/index.ts tests/director-tts-worker.test.mjs
git commit -m "Add director TTS route shell"
```

## Task 4: Use Director Audio In Packet Flow

**Files:**
- Modify: `src/App.tsx`
- Modify: `tests/director-packet-ui.test.mjs`

- [ ] **Step 1: Extend UI test**

Add:

```js
it("plays director turn speech through the director audio helper", () => {
  assert.match(appSource, /playDirectorTurnSpeech/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/director-packet-ui.test.mjs
```

Expected: FAIL because `playDirectorTurnSpeech` is not imported.

- [ ] **Step 3: Replace silent turn delay with audio playback**

Modify `src/App.tsx`:

```tsx
import { playDirectorTurnSpeech } from "./director-audio-playback";
```

Replace the director turn timeout effect with:

```tsx
useEffect(() => {
  if (state.phase !== DirectorPacketPhase.PlayingTurn || !state.packet) return;
  const turn = state.packet.turns[state.activeTurnIndex];
  if (!turn) return;

  let cancelled = false;
  const controller = new AbortController();

  async function playTurn() {
    await playDirectorTurnSpeech({
      speaker: turn.speaker,
      speech: turn.speech,
      signal: controller.signal,
    });
    if (!cancelled) dispatch({ type: "TURN_DONE" });
  }

  void playTurn();
  return () => {
    cancelled = true;
    controller.abort();
  };
}, [state.activeTurnIndex, state.packet, state.phase]);
```

- [ ] **Step 4: Run focused checks**

Run:

```bash
npm test -- tests/director-audio-playback.test.mjs tests/director-packet-ui.test.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx tests/director-packet-ui.test.mjs
git commit -m "Play director packet speech segments"
```

## Task 5: Plan 3 Verification

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

- [ ] **Step 2: Manual audio smoke check**

Run:

```bash
VITE_PARROT_DIRECTOR_FLOW=1 npm run dev:vite
```

Expected:

- Existing static lines play from saved audio where available.
- Dynamic lines move the UI forward even if `/api/director-tts` is unavailable.
- Recording starts only after all segments in the final prompt are complete.
- No character audio plays during recording.
