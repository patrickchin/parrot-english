# Director Packet Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the local packet-driven lesson engine with a structured lesson JSON, validator, mock director, packet runner, and UI rendering path without calling an LLM or runtime TTS.

**Architecture:** Add the director system beside the existing deterministic lesson modules. The mock director returns validated packets from local lesson JSON; the React app executes those packets one turn at a time, then records the child through the existing microphone and speech-evaluation path. Audio can initially use silent timing for director packet turns, so packet rendering is proven before TTS work begins.

**Tech Stack:** React 19, Vite 8, Node test runner, JavaScript JSDoc modules in `lib`, TypeScript React code in `src`, existing `recordSpeechClip` and `/api/evaluate-speech`.

---

## Architecture Decisions

- Keep the current deterministic lesson modules until the packet flow is verified.
- Create new director modules instead of rewriting `lesson-state.js` in place.
- Use plain JavaScript modules under `lib` for shared schema/lesson logic because existing tests import `lib/*.js` directly.
- Use a mock director first. It must produce the same packet shape expected from the future Worker AI director.
- Make packet validation strict. The frontend must never render an unvalidated packet.
- Use silent playback timing in this plan. TTS and generated audio are handled in the Speech and TTS Runtime plan.

## File Structure

- Create `lib/lesson-director-schema.js`: constants and validation for lesson definitions, director requests, and director responses.
- Create `lib/ai-lesson-data.js`: local structured lesson JSON, including world, characters, assets, teaching policy, and scenes.
- Create `lib/mock-lesson-director.js`: deterministic packet generator for start, success repeat, retry, advance, and finish.
- Create `lib/director-packet-state.js`: reducer for executing packet turns and moving into listening/evaluating/feedback-like states.
- Create `lib/director-packet-scene.js`: maps the active packet turn into the current UI presentation.
- Create `src/director-request.ts`: browser helper for requesting a packet. In this plan it calls the mock module through an injected adapter in tests and a local frontend adapter in app code.
- Modify `src/App.tsx`: add a director-flow branch that renders packet scenes and uses existing recording/evaluation.
- Create `tests/lesson-director-schema.test.mjs`.
- Create `tests/mock-lesson-director.test.mjs`.
- Create `tests/director-packet-state.test.mjs`.
- Create `tests/director-packet-scene.test.mjs`.
- Create `tests/director-packet-ui.test.mjs`.

## Task 1: Schema Constants And Validation

**Files:**
- Create: `lib/lesson-director-schema.js`
- Test: `tests/lesson-director-schema.test.mjs`

- [ ] **Step 1: Write failing schema tests**

Create `tests/lesson-director-schema.test.mjs`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DIRECTOR_PURPOSES,
  DIRECTOR_STATUSES,
  validateLessonDefinition,
  validateLessonDirectorResponse,
} from "../lib/lesson-director-schema.js";

const lesson = {
  lessonId: "helping-peppa-001",
  title: "Helping Peppa",
  learner: {
    displayName: "Bella",
    nativeLanguage: "zh-CN",
    learningLanguage: "en-US",
    ageBand: "young_child",
  },
  world: {
    setting: "A bright preschool cartoon meadow.",
    tone: "warm, playful, patient, and simple",
    storyPremise: "Peppa creates tiny everyday scenes and Polly coaches Bella.",
    allowedStoryElements: ["greetings"],
    disallowedStoryElements: ["danger"],
  },
  characters: [
    {
      id: "peppa",
      displayName: "Peppa",
      role: "scene_speaker",
      defaultLanguage: "en-US",
      persona: "A cheerful young pig.",
      relationshipToLearner: "friendly playmate",
      speechStyle: "short English scene lines",
      mustDo: ["Use English scene dialogue."],
      mustAvoid: ["Do not explain grammar."],
      allowedPurposes: ["scene_dialogue", "model_phrase", "feedback_success"],
    },
    {
      id: "polly",
      displayName: "Polly",
      role: "tutor",
      defaultLanguage: "zh-CN",
      persona: "An energetic parrot tutor.",
      relationshipToLearner: "supportive coach",
      speechStyle: "short Mandarin coaching with English target phrases",
      mustDo: ["Prompt the exact English target phrase."],
      mustAvoid: ["Do not speak over recording."],
      allowedPurposes: ["context_explain", "model_phrase", "prompt_repeat"],
    },
  ],
  availableAssets: {
    backgrounds: ["meadowDay"],
    poses: {
      peppa: ["wave", "talk", "listen", "clap"],
      polly: ["idle", "talk", "laugh", "flap"],
    },
  },
  teachingPolicy: {
    packetStopsAtChildPrompt: true,
    maxTurnsBeforeChildPrompt: 4,
    maxRetriesPerScene: 2,
    successRequiresRepeat: true,
    silenceDuringRecording: true,
    keepTutorLinesShort: true,
  },
  scenes: [
    {
      id: "greeting",
      titleZh: "打招呼",
      backgroundPreference: "meadowDay",
      goal: "Teach Bella to answer Peppa's greeting.",
      mode: "reply",
      sceneLine: { speaker: "peppa", text: "Hello, Bella!", lang: "en-US" },
      tutorCueZh: "佩奇在和你打招呼。我们回答佩奇。",
      modelLine: { speaker: "polly", text: "Hello, Peppa!", lang: "en-US" },
      childTarget: "Hello, Peppa!",
      successCriteria: {
        mustContainMeaning: ["hello", "peppa"],
        allowClosePronunciation: true,
      },
    },
  ],
};

describe("lesson director schema", () => {
  it("exports known purpose and status values", () => {
    assert.ok(DIRECTOR_PURPOSES.includes("prompt_repeat"));
    assert.ok(DIRECTOR_STATUSES.includes("prompt_child"));
  });

  it("accepts a complete lesson definition", () => {
    assert.deepEqual(validateLessonDefinition(lesson), {
      ok: true,
      errors: [],
    });
  });

  it("rejects a packet with an unknown pose", () => {
    const packet = {
      schemaVersion: "lesson-director.response.v1",
      packetId: "greeting-start-001",
      sceneId: "greeting",
      background: "meadowDay",
      characters: {
        peppa: { pose: "floating" },
        polly: { pose: "talk" },
      },
      turns: [],
      childPrompt: { shouldListen: false, targetText: "", displayText: "" },
      lessonControl: {
        status: "advance_scene",
        nextSceneId: "greeting",
        reason: "test",
      },
    };

    const result = validateLessonDirectorResponse(packet, lesson);

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /unknown pose floating for peppa/);
  });

  it("rejects mixed-language speech in one segment", () => {
    const packet = {
      schemaVersion: "lesson-director.response.v1",
      packetId: "greeting-start-001",
      sceneId: "greeting",
      background: "meadowDay",
      characters: {
        peppa: { pose: "listen" },
        polly: { pose: "talk" },
      },
      turns: [
        {
          turnId: "t1",
          speaker: "polly",
          purpose: "prompt_repeat",
          visibleText: "轮到你说：Hello, Peppa!",
          speech: [{ lang: "zh-CN", text: "轮到你说：Hello, Peppa!" }],
          pose: "talk",
        },
      ],
      childPrompt: {
        shouldListen: true,
        targetText: "Hello, Peppa!",
        displayText: "轮到你说：Hello, Peppa!",
      },
      lessonControl: {
        status: "prompt_child",
        nextSceneId: null,
        reason: "test",
      },
    };

    const result = validateLessonDirectorResponse(packet, lesson);

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /mixed Chinese and English/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/lesson-director-schema.test.mjs
```

Expected: FAIL with an import error for `../lib/lesson-director-schema.js`.

- [ ] **Step 3: Implement schema validation**

Create `lib/lesson-director-schema.js`:

```js
// @ts-check

export const DIRECTOR_SCHEMA_VERSION = "lesson-director.response.v1";

export const DIRECTOR_PURPOSES = [
  "scene_dialogue",
  "context_explain",
  "model_phrase",
  "slow_model",
  "prompt_repeat",
  "feedback_success",
  "feedback_retry",
  "feedback_no_speech",
  "transition",
  "completion",
];

export const DIRECTOR_STATUSES = [
  "prompt_child",
  "continue_current_scene",
  "advance_scene",
  "finish_lesson",
  "recover_error",
];

const CHINESE_PATTERN = /[\u3400-\u9fff]/;
const LATIN_PATTERN = /[A-Za-z]/;

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasMixedChineseAndEnglish(text) {
  return CHINESE_PATTERN.test(text) && LATIN_PATTERN.test(text);
}

function pushRequired(errors, object, key, path) {
  if (!isObject(object) || !(key in object)) {
    errors.push(`${path}.${key} is required`);
  }
}

export function validateLessonDefinition(lesson) {
  const errors = [];
  pushRequired(errors, lesson, "lessonId", "lesson");
  pushRequired(errors, lesson, "title", "lesson");
  pushRequired(errors, lesson, "learner", "lesson");
  pushRequired(errors, lesson, "world", "lesson");
  pushRequired(errors, lesson, "characters", "lesson");
  pushRequired(errors, lesson, "availableAssets", "lesson");
  pushRequired(errors, lesson, "teachingPolicy", "lesson");
  pushRequired(errors, lesson, "scenes", "lesson");

  if (Array.isArray(lesson?.characters)) {
    const ids = new Set();
    for (const character of lesson.characters) {
      if (!character.id) errors.push("character.id is required");
      if (ids.has(character.id)) errors.push(`duplicate character ${character.id}`);
      ids.add(character.id);
      for (const purpose of character.allowedPurposes ?? []) {
        if (!DIRECTOR_PURPOSES.includes(purpose)) {
          errors.push(`unknown allowed purpose ${purpose} for ${character.id}`);
        }
      }
    }
  }

  if (Array.isArray(lesson?.scenes)) {
    for (const scene of lesson.scenes) {
      if (!scene.id) errors.push("scene.id is required");
      if (!scene.childTarget) errors.push(`scene ${scene.id} missing childTarget`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function collectLessonIndexes(lesson) {
  return {
    backgrounds: new Set(lesson.availableAssets?.backgrounds ?? []),
    characters: new Set((lesson.characters ?? []).map((character) => character.id)),
    scenes: new Map((lesson.scenes ?? []).map((scene) => [scene.id, scene])),
    poses: lesson.availableAssets?.poses ?? {},
  };
}

export function validateLessonDirectorResponse(packet, lesson) {
  const errors = [];
  const indexes = collectLessonIndexes(lesson);

  if (!isObject(packet)) {
    return { ok: false, errors: ["packet must be an object"] };
  }

  if (packet.schemaVersion !== DIRECTOR_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${DIRECTOR_SCHEMA_VERSION}`);
  }
  if (!indexes.scenes.has(packet.sceneId)) {
    errors.push(`unknown scene ${packet.sceneId}`);
  }
  if (!indexes.backgrounds.has(packet.background)) {
    errors.push(`unknown background ${packet.background}`);
  }

  for (const [speaker, state] of Object.entries(packet.characters ?? {})) {
    if (!indexes.characters.has(speaker)) errors.push(`unknown character ${speaker}`);
    if (!indexes.poses[speaker]?.includes(state?.pose)) {
      errors.push(`unknown pose ${state?.pose} for ${speaker}`);
    }
  }

  for (const turn of packet.turns ?? []) {
    if (!indexes.characters.has(turn.speaker)) {
      errors.push(`unknown turn speaker ${turn.speaker}`);
    }
    if (!DIRECTOR_PURPOSES.includes(turn.purpose)) {
      errors.push(`unknown purpose ${turn.purpose}`);
    }
    if (!indexes.poses[turn.speaker]?.includes(turn.pose)) {
      errors.push(`unknown pose ${turn.pose} for ${turn.speaker}`);
    }
    for (const segment of turn.speech ?? []) {
      if (hasMixedChineseAndEnglish(segment.text ?? "")) {
        errors.push(`mixed Chinese and English in ${turn.turnId}`);
      }
    }
  }

  const status = packet.lessonControl?.status;
  if (!DIRECTOR_STATUSES.includes(status)) {
    errors.push(`unknown lessonControl.status ${status}`);
  }
  if (status === "prompt_child" && packet.childPrompt?.shouldListen !== true) {
    errors.push("prompt_child requires childPrompt.shouldListen");
  }

  const scene = indexes.scenes.get(packet.sceneId);
  if (
    packet.childPrompt?.shouldListen &&
    packet.childPrompt.targetText !== scene?.childTarget
  ) {
    errors.push("childPrompt.targetText must match current scene childTarget");
  }

  return { ok: errors.length === 0, errors };
}
```

- [ ] **Step 4: Run schema tests**

Run:

```bash
npm test -- tests/lesson-director-schema.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/lesson-director-schema.js tests/lesson-director-schema.test.mjs
git commit -m "Add lesson director schema validation"
```

## Task 2: Local Lesson JSON

**Files:**
- Create: `lib/ai-lesson-data.js`
- Test: `tests/ai-lesson-data.test.mjs`

- [ ] **Step 1: Write failing lesson-data tests**

Create `tests/ai-lesson-data.test.mjs`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AI_LESSON } from "../lib/ai-lesson-data.js";
import { validateLessonDefinition } from "../lib/lesson-director-schema.js";

describe("AI lesson data", () => {
  it("is a valid director lesson definition", () => {
    assert.deepEqual(validateLessonDefinition(AI_LESSON), {
      ok: true,
      errors: [],
    });
  });

  it("keeps the greeting reply target different from Peppa's addressed line", () => {
    const greeting = AI_LESSON.scenes.find((scene) => scene.id === "greeting");

    assert.equal(greeting.sceneLine.text, "Hello, Bella!");
    assert.equal(greeting.childTarget, "Hello, Peppa!");
  });

  it("uses only existing scene assets and poses", () => {
    assert.deepEqual(AI_LESSON.availableAssets.backgrounds, [
      "meadowDay",
      "meadowEvening",
      "reward",
    ]);
    assert.deepEqual(AI_LESSON.availableAssets.poses.peppa, [
      "wave",
      "talk",
      "listen",
      "clap",
    ]);
    assert.deepEqual(AI_LESSON.availableAssets.poses.polly, [
      "idle",
      "talk",
      "laugh",
      "flap",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/ai-lesson-data.test.mjs
```

Expected: FAIL with an import error for `../lib/ai-lesson-data.js`.

- [ ] **Step 3: Add the lesson JSON**

Create `lib/ai-lesson-data.js` with five scenes matching the approved poster-style script:

```js
// @ts-check

export const AI_LESSON = {
  lessonId: "helping-peppa-001",
  title: "Helping Peppa",
  learner: {
    displayName: "Bella",
    nativeLanguage: "zh-CN",
    learningLanguage: "en-US",
    ageBand: "young_child",
  },
  world: {
    setting:
      "A bright preschool cartoon meadow where Peppa and Polly help Bella practice useful English phrases.",
    tone: "warm, playful, patient, and simple",
    storyPremise:
      "Each scene is a tiny everyday moment. Peppa creates the situation in English, Polly helps Bella understand it, and Bella practices the useful response or phrase.",
    allowedStoryElements: [
      "greetings",
      "asking for help",
      "sharing",
      "saying thank you",
    ],
    disallowedStoryElements: [
      "danger",
      "fear",
      "punishment",
      "sarcasm",
      "long explanations",
    ],
  },
  characters: [
    {
      id: "peppa",
      displayName: "Peppa",
      role: "scene_speaker",
      defaultLanguage: "en-US",
      persona:
        "A cheerful young pig who speaks in short, friendly English lines and sets up simple everyday scenes.",
      relationshipToLearner: "friendly playmate",
      speechStyle: "short, bright, concrete, never teacher-like",
      mustDo: [
        "Use English scene dialogue.",
        "Give the learner a clear social reason to practice the target phrase.",
      ],
      mustAvoid: ["Do not explain grammar.", "Do not correct the child directly."],
      allowedPurposes: ["scene_dialogue", "model_phrase", "feedback_success"],
    },
    {
      id: "polly",
      displayName: "Polly",
      role: "tutor",
      defaultLanguage: "zh-CN",
      persona:
        "An energetic parrot tutor who helps Bella understand Peppa and practice speaking.",
      relationshipToLearner: "supportive coach",
      speechStyle: "native Mandarin coaching with short English target phrases",
      mustDo: [
        "Explain the situation in simple Mandarin.",
        "Model or prompt the exact English target phrase.",
        "Give gentle feedback after the child speaks.",
      ],
      mustAvoid: [
        "Do not speak over recording.",
        "Do not give long grammar lessons.",
        "Do not shame mistakes.",
      ],
      allowedPurposes: [
        "context_explain",
        "model_phrase",
        "prompt_repeat",
        "feedback_success",
        "feedback_retry",
        "feedback_no_speech",
        "slow_model",
        "transition",
        "completion",
      ],
    },
  ],
  availableAssets: {
    backgrounds: ["meadowDay", "meadowEvening", "reward"],
    poses: {
      peppa: ["wave", "talk", "listen", "clap"],
      polly: ["idle", "talk", "laugh", "flap"],
    },
  },
  teachingPolicy: {
    packetStopsAtChildPrompt: true,
    maxTurnsBeforeChildPrompt: 4,
    maxRetriesPerScene: 2,
    successRequiresRepeat: true,
    silenceDuringRecording: true,
    keepTutorLinesShort: true,
  },
  scenes: [
    {
      id: "greeting",
      titleZh: "打招呼",
      backgroundPreference: "meadowDay",
      goal: "Teach Bella to answer Peppa's greeting.",
      mode: "reply",
      sceneLine: { speaker: "peppa", text: "Hello, Bella!", lang: "en-US" },
      tutorCueZh: "佩奇在和你打招呼。我们回答佩奇。",
      modelLine: { speaker: "polly", text: "Hello, Peppa!", lang: "en-US" },
      childTarget: "Hello, Peppa!",
      successCriteria: {
        mustContainMeaning: ["hello", "peppa"],
        allowClosePronunciation: true,
      },
    },
    {
      id: "cant-reach",
      titleZh: "佩奇需要帮助",
      backgroundPreference: "meadowDay",
      goal: "Teach Bella to describe not being able to reach something.",
      mode: "mimic",
      sceneLine: { speaker: "peppa", text: "Oh! I can't reach it.", lang: "en-US" },
      tutorCueZh: "佩奇够不到。跟我说。",
      modelLine: { speaker: "polly", text: "Oh! I can't reach it.", lang: "en-US" },
      childTarget: "Oh! I can't reach it.",
      successCriteria: {
        mustContainMeaning: ["can't", "reach"],
        allowClosePronunciation: true,
      },
    },
    {
      id: "help-please",
      titleZh: "请求帮助",
      backgroundPreference: "meadowDay",
      goal: "Teach Bella to ask for help politely.",
      mode: "mimic",
      sceneLine: {
        speaker: "peppa",
        text: "Can you help me, please?",
        lang: "en-US",
      },
      tutorCueZh: "佩奇在请求帮助。跟我说。",
      modelLine: {
        speaker: "polly",
        text: "Can you help me, please?",
        lang: "en-US",
      },
      childTarget: "Can you help me, please?",
      successCriteria: {
        mustContainMeaning: ["help", "please"],
        allowClosePronunciation: true,
      },
    },
    {
      id: "here-you-are",
      titleZh: "多莉来帮忙",
      backgroundPreference: "meadowEvening",
      goal: "Teach Bella a polite giving phrase.",
      mode: "mimic",
      sceneLine: { speaker: "peppa", text: "Here you are!", lang: "en-US" },
      tutorCueZh: "多莉把东西给佩奇。跟我说。",
      modelLine: { speaker: "polly", text: "Here you are!", lang: "en-US" },
      childTarget: "Here you are!",
      successCriteria: {
        mustContainMeaning: ["here"],
        allowClosePronunciation: true,
      },
    },
    {
      id: "thank-you",
      titleZh: "说谢谢",
      backgroundPreference: "meadowEvening",
      goal: "Teach Bella to say thank you.",
      mode: "mimic",
      sceneLine: { speaker: "peppa", text: "Thank you!", lang: "en-US" },
      tutorCueZh: "佩奇在说谢谢。跟我说。",
      modelLine: { speaker: "polly", text: "Thank you!", lang: "en-US" },
      childTarget: "Thank you!",
      successCriteria: {
        mustContainMeaning: ["thank", "you"],
        allowClosePronunciation: true,
      },
    },
  ],
};
```

- [ ] **Step 4: Run lesson-data tests**

Run:

```bash
npm test -- tests/ai-lesson-data.test.mjs tests/lesson-director-schema.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ai-lesson-data.js tests/ai-lesson-data.test.mjs
git commit -m "Add structured AI lesson data"
```

## Task 3: Mock Director

**Files:**
- Create: `lib/mock-lesson-director.js`
- Test: `tests/mock-lesson-director.test.mjs`

- [ ] **Step 1: Write failing mock director tests**

Create `tests/mock-lesson-director.test.mjs`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AI_LESSON } from "../lib/ai-lesson-data.js";
import { getMockDirectorPacket } from "../lib/mock-lesson-director.js";
import { validateLessonDirectorResponse } from "../lib/lesson-director-schema.js";

describe("mock lesson director", () => {
  it("returns a start packet ending with a child prompt", () => {
    const packet = getMockDirectorPacket(AI_LESSON, {
      currentSceneId: "greeting",
      phase: "start_scene",
      attemptNumber: 0,
      successfulRepeats: 0,
      previousTurnSummary: [],
      lastChildResult: null,
    });

    assert.equal(packet.sceneId, "greeting");
    assert.equal(packet.lessonControl.status, "prompt_child");
    assert.equal(packet.childPrompt.targetText, "Hello, Peppa!");
    assert.equal(packet.turns.at(-1).purpose, "prompt_repeat");
    assert.equal(validateLessonDirectorResponse(packet, AI_LESSON).ok, true);
  });

  it("returns success repeat when policy requires it", () => {
    const packet = getMockDirectorPacket(AI_LESSON, {
      currentSceneId: "greeting",
      phase: "after_child_answer",
      attemptNumber: 1,
      successfulRepeats: 0,
      previousTurnSummary: [],
      lastChildResult: {
        targetText: "Hello, Peppa!",
        transcript: "hello peppa",
        passed: true,
        similarity: 0.92,
        reason: "matched_target",
      },
    });

    assert.equal(packet.lessonControl.reason, "success_repeat_required");
    assert.equal(packet.childPrompt.shouldListen, true);
  });

  it("advances after a successful repeat", () => {
    const packet = getMockDirectorPacket(AI_LESSON, {
      currentSceneId: "greeting",
      phase: "after_child_answer",
      attemptNumber: 2,
      successfulRepeats: 1,
      previousTurnSummary: [],
      lastChildResult: {
        targetText: "Hello, Peppa!",
        transcript: "hello peppa",
        passed: true,
        similarity: 0.92,
        reason: "matched_target",
      },
    });

    assert.equal(packet.lessonControl.status, "advance_scene");
    assert.equal(packet.lessonControl.nextSceneId, "cant-reach");
    assert.equal(packet.childPrompt.shouldListen, false);
  });

  it("retries a failed answer with segmented prompt speech", () => {
    const packet = getMockDirectorPacket(AI_LESSON, {
      currentSceneId: "greeting",
      phase: "after_child_answer",
      attemptNumber: 1,
      successfulRepeats: 0,
      previousTurnSummary: [],
      lastChildResult: {
        targetText: "Hello, Peppa!",
        transcript: "yellow",
        passed: false,
        similarity: 0.2,
        reason: "below_threshold",
      },
    });

    const prompt = packet.turns.at(-1);
    assert.equal(packet.lessonControl.status, "prompt_child");
    assert.deepEqual(prompt.speech, [
      { lang: "zh-CN", text: "轮到你说：" },
      { lang: "en-US", text: "Hello, Peppa!" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/mock-lesson-director.test.mjs
```

Expected: FAIL with an import error for `../lib/mock-lesson-director.js`.

- [ ] **Step 3: Implement mock director**

Create `lib/mock-lesson-director.js`:

```js
// @ts-check

function getScene(lesson, sceneId) {
  const scene = lesson.scenes.find((candidate) => candidate.id === sceneId);
  if (!scene) throw new Error(`Unknown scene: ${sceneId}`);
  return scene;
}

function getNextSceneId(lesson, sceneId) {
  const index = lesson.scenes.findIndex((scene) => scene.id === sceneId);
  return lesson.scenes[index + 1]?.id ?? null;
}

function createTurn(packetId, index, speaker, purpose, visibleText, speech, pose) {
  return {
    turnId: `${packetId}-t${index}`,
    speaker,
    purpose,
    visibleText,
    speech,
    pose,
  };
}

function createPromptTurn(packetId, index, scene) {
  return createTurn(
    packetId,
    index,
    "polly",
    "prompt_repeat",
    `轮到你说：${scene.childTarget}`,
    [
      { lang: "zh-CN", text: "轮到你说：" },
      { lang: "en-US", text: scene.childTarget },
    ],
    "flap"
  );
}

function createStartPacket(lesson, scene) {
  const packetId = `${scene.id}-start-001`;
  return {
    schemaVersion: "lesson-director.response.v1",
    packetId,
    sceneId: scene.id,
    background: scene.backgroundPreference,
    characters: {
      peppa: { pose: "listen" },
      polly: { pose: "flap" },
    },
    turns: [
      createTurn(packetId, 1, "peppa", "scene_dialogue", scene.sceneLine.text, [
        { lang: scene.sceneLine.lang, text: scene.sceneLine.text },
      ], "talk"),
      createTurn(packetId, 2, "polly", "context_explain", scene.tutorCueZh, [
        { lang: "zh-CN", text: scene.tutorCueZh },
      ], "talk"),
      createTurn(packetId, 3, "polly", "model_phrase", scene.modelLine.text, [
        { lang: scene.modelLine.lang, text: scene.modelLine.text },
      ], "talk"),
      createPromptTurn(packetId, 4, scene),
    ],
    childPrompt: {
      shouldListen: true,
      targetText: scene.childTarget,
      displayText: `轮到你说：${scene.childTarget}`,
      recordingSeconds: 4.2,
    },
    lessonControl: {
      status: "prompt_child",
      nextSceneId: null,
      reason: "waiting_for_first_attempt",
    },
  };
}

function createSuccessPacket(lesson, scene, runtimeState) {
  const nextSceneId = getNextSceneId(lesson, scene.id);
  const needsRepeat =
    lesson.teachingPolicy.successRequiresRepeat &&
    runtimeState.successfulRepeats < 1;

  if (!needsRepeat) {
    const packetId = `${scene.id}-advance-001`;
    return {
      schemaVersion: "lesson-director.response.v1",
      packetId,
      sceneId: scene.id,
      background: scene.backgroundPreference,
      characters: {
        peppa: { pose: "clap" },
        polly: { pose: "laugh" },
      },
      turns: [
        createTurn(packetId, 1, "polly", "feedback_success", "太棒啦，我们继续。", [
          { lang: "zh-CN", text: "太棒啦，我们继续。" },
        ], "laugh"),
      ],
      childPrompt: {
        shouldListen: false,
        targetText: "",
        displayText: "",
        recordingSeconds: 0,
      },
      lessonControl: {
        status: nextSceneId ? "advance_scene" : "finish_lesson",
        nextSceneId,
        reason: nextSceneId ? "target_completed" : "lesson_completed",
      },
    };
  }

  const packetId = `${scene.id}-success-repeat-001`;
  return {
    schemaVersion: "lesson-director.response.v1",
    packetId,
    sceneId: scene.id,
    background: scene.backgroundPreference,
    characters: {
      peppa: { pose: "clap" },
      polly: { pose: "flap" },
    },
    turns: [
      createTurn(packetId, 1, "polly", "feedback_success", "太棒了！你说对了。", [
        { lang: "zh-CN", text: "太棒了！你说对了。" },
      ], "laugh"),
      createTurn(packetId, 2, "polly", "prompt_repeat", `再说一遍：${scene.childTarget}`, [
        { lang: "zh-CN", text: "再说一遍：" },
        { lang: "en-US", text: scene.childTarget },
      ], "talk"),
    ],
    childPrompt: {
      shouldListen: true,
      targetText: scene.childTarget,
      displayText: `再说一遍：${scene.childTarget}`,
      recordingSeconds: 4.2,
    },
    lessonControl: {
      status: "prompt_child",
      nextSceneId: null,
      reason: "success_repeat_required",
    },
  };
}

function createRetryPacket(scene, reason) {
  const packetId = `${scene.id}-retry-001`;
  const feedbackText =
    reason === "no_speech" ? "我没有听清楚，我们再试一次。" : "差一点点，我们慢慢再来。";
  return {
    schemaVersion: "lesson-director.response.v1",
    packetId,
    sceneId: scene.id,
    background: scene.backgroundPreference,
    characters: {
      peppa: { pose: "listen" },
      polly: { pose: "flap" },
    },
    turns: [
      createTurn(packetId, 1, "polly", reason === "no_speech" ? "feedback_no_speech" : "feedback_retry", feedbackText, [
        { lang: "zh-CN", text: feedbackText },
      ], "talk"),
      createTurn(packetId, 2, "polly", "slow_model", scene.childTarget, [
        { lang: "en-US", text: scene.childTarget },
      ], "talk"),
      createPromptTurn(packetId, 3, scene),
    ],
    childPrompt: {
      shouldListen: true,
      targetText: scene.childTarget,
      displayText: `轮到你说：${scene.childTarget}`,
      recordingSeconds: 4.2,
    },
    lessonControl: {
      status: "prompt_child",
      nextSceneId: null,
      reason: "retry_current_target",
    },
  };
}

export function getMockDirectorPacket(lesson, runtimeState) {
  const scene = getScene(lesson, runtimeState.currentSceneId);
  if (runtimeState.phase !== "after_child_answer") {
    return createStartPacket(lesson, scene);
  }
  if (runtimeState.lastChildResult?.passed) {
    return createSuccessPacket(lesson, scene, runtimeState);
  }
  return createRetryPacket(scene, runtimeState.lastChildResult?.reason);
}
```

- [ ] **Step 4: Run mock director tests**

Run:

```bash
npm test -- tests/mock-lesson-director.test.mjs tests/lesson-director-schema.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/mock-lesson-director.js tests/mock-lesson-director.test.mjs
git commit -m "Add mock lesson director packets"
```

## Task 4: Packet Execution State

**Files:**
- Create: `lib/director-packet-state.js`
- Test: `tests/director-packet-state.test.mjs`

- [ ] **Step 1: Write failing packet-state tests**

Create `tests/director-packet-state.test.mjs`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AI_LESSON } from "../lib/ai-lesson-data.js";
import { getMockDirectorPacket } from "../lib/mock-lesson-director.js";
import {
  DirectorPacketPhase,
  createInitialDirectorPacketState,
  reduceDirectorPacketState,
} from "../lib/director-packet-state.js";

const packet = getMockDirectorPacket(AI_LESSON, {
  currentSceneId: "greeting",
  phase: "start_scene",
  attemptNumber: 0,
  successfulRepeats: 0,
  previousTurnSummary: [],
  lastChildResult: null,
});

describe("director packet state", () => {
  it("starts idle on the first scene", () => {
    const state = createInitialDirectorPacketState("greeting");

    assert.equal(state.phase, DirectorPacketPhase.Idle);
    assert.equal(state.currentSceneId, "greeting");
    assert.equal(state.activeTurnIndex, -1);
  });

  it("loads a packet and starts the first turn", () => {
    const state = reduceDirectorPacketState(
      createInitialDirectorPacketState("greeting"),
      { type: "PACKET_LOADED", packet }
    );

    assert.equal(state.phase, DirectorPacketPhase.PlayingTurn);
    assert.equal(state.activeTurnIndex, 0);
    assert.equal(state.packet.packetId, packet.packetId);
  });

  it("advances through turns and enters listening after the packet prompt", () => {
    let state = reduceDirectorPacketState(createInitialDirectorPacketState("greeting"), {
      type: "PACKET_LOADED",
      packet,
    });

    for (let index = 0; index < packet.turns.length; index += 1) {
      state = reduceDirectorPacketState(state, { type: "TURN_DONE" });
    }

    assert.equal(state.phase, DirectorPacketPhase.Listening);
    assert.equal(state.activeTurnIndex, packet.turns.length - 1);
    assert.equal(state.activePrompt.targetText, "Hello, Peppa!");
  });

  it("tracks evaluation result for the next director request", () => {
    const state = reduceDirectorPacketState(
      { ...createInitialDirectorPacketState("greeting"), phase: DirectorPacketPhase.Evaluating },
      {
        type: "EVALUATED",
        result: {
          transcript: "hello peppa",
          similarity: 0.92,
          passed: true,
          feedbackText: "Great.",
          retryAllowed: true,
        },
      }
    );

    assert.equal(state.phase, DirectorPacketPhase.NeedsPacket);
    assert.equal(state.runtimeState.phase, "after_child_answer");
    assert.equal(state.runtimeState.lastChildResult.passed, true);
    assert.equal(state.runtimeState.successfulRepeats, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/director-packet-state.test.mjs
```

Expected: FAIL with an import error for `../lib/director-packet-state.js`.

- [ ] **Step 3: Implement packet reducer**

Create `lib/director-packet-state.js`:

```js
// @ts-check

export const DirectorPacketPhase = {
  Idle: "idle",
  LoadingPacket: "loading-packet",
  PlayingTurn: "playing-turn",
  Listening: "listening",
  Evaluating: "evaluating",
  NeedsPacket: "needs-packet",
  Finished: "finished",
  Error: "error",
};

export function createInitialDirectorPacketState(sceneId = "greeting") {
  return {
    phase: DirectorPacketPhase.Idle,
    currentSceneId: sceneId,
    packet: null,
    activeTurnIndex: -1,
    activePrompt: null,
    attemptNumber: 0,
    successfulRepeats: 0,
    previousTurnSummary: [],
    runtimeState: {
      currentSceneId: sceneId,
      phase: "start_scene",
      attemptNumber: 0,
      successfulRepeats: 0,
      previousTurnSummary: [],
      lastChildResult: null,
    },
  };
}

function summarizeTurns(packet) {
  return packet.turns.map((turn) => ({
    speaker: turn.speaker,
    purpose: turn.purpose,
    visibleText: turn.visibleText,
  }));
}

export function reduceDirectorPacketState(state, event) {
  switch (event.type) {
    case "START":
      return { ...state, phase: DirectorPacketPhase.LoadingPacket };
    case "PACKET_LOADED":
      return {
        ...state,
        phase:
          event.packet.turns.length > 0
            ? DirectorPacketPhase.PlayingTurn
            : event.packet.lessonControl.status === "finish_lesson"
              ? DirectorPacketPhase.Finished
              : DirectorPacketPhase.NeedsPacket,
        packet: event.packet,
        currentSceneId: event.packet.sceneId,
        activeTurnIndex: event.packet.turns.length > 0 ? 0 : -1,
        activePrompt: event.packet.childPrompt,
        previousTurnSummary: summarizeTurns(event.packet),
      };
    case "TURN_DONE": {
      if (!state.packet) return state;
      const nextIndex = state.activeTurnIndex + 1;
      if (nextIndex < state.packet.turns.length) {
        return { ...state, activeTurnIndex: nextIndex };
      }
      if (state.packet.childPrompt.shouldListen) {
        return { ...state, phase: DirectorPacketPhase.Listening };
      }
      if (state.packet.lessonControl.status === "finish_lesson") {
        return { ...state, phase: DirectorPacketPhase.Finished };
      }
      return {
        ...state,
        phase: DirectorPacketPhase.NeedsPacket,
        currentSceneId: state.packet.lessonControl.nextSceneId ?? state.currentSceneId,
      };
    }
    case "RECORDING_DONE":
      return { ...state, phase: DirectorPacketPhase.Evaluating };
    case "EVALUATED": {
      const passed = event.result.passed;
      const successfulRepeats = passed ? state.successfulRepeats + 1 : state.successfulRepeats;
      const attemptNumber = state.attemptNumber + 1;
      return {
        ...state,
        phase: DirectorPacketPhase.NeedsPacket,
        attemptNumber,
        successfulRepeats,
        runtimeState: {
          currentSceneId: state.currentSceneId,
          phase: "after_child_answer",
          attemptNumber,
          successfulRepeats,
          previousTurnSummary: state.previousTurnSummary,
          lastChildResult: {
            targetText: state.activePrompt?.targetText ?? "",
            transcript: event.result.transcript,
            passed,
            similarity: event.result.similarity,
            reason: passed ? "matched_target" : "below_threshold",
          },
        },
      };
    }
    case "PACKET_FAILED":
      return { ...state, phase: DirectorPacketPhase.Error };
    default:
      return state;
  }
}
```

- [ ] **Step 4: Run packet-state tests**

Run:

```bash
npm test -- tests/director-packet-state.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/director-packet-state.js tests/director-packet-state.test.mjs
git commit -m "Add director packet execution state"
```

## Task 5: Packet Scene Presentation

**Files:**
- Create: `lib/director-packet-scene.js`
- Test: `tests/director-packet-scene.test.mjs`

- [ ] **Step 1: Write failing packet-scene tests**

Create `tests/director-packet-scene.test.mjs`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AI_LESSON } from "../lib/ai-lesson-data.js";
import { getMockDirectorPacket } from "../lib/mock-lesson-director.js";
import {
  DirectorPacketPhase,
  createInitialDirectorPacketState,
  reduceDirectorPacketState,
} from "../lib/director-packet-state.js";
import { getDirectorPacketScenePresentation } from "../lib/director-packet-scene.js";

const packet = getMockDirectorPacket(AI_LESSON, {
  currentSceneId: "greeting",
  phase: "start_scene",
  attemptNumber: 0,
  successfulRepeats: 0,
  previousTurnSummary: [],
  lastChildResult: null,
});

describe("director packet scene presentation", () => {
  it("shows the active packet turn in the correct character bubble", () => {
    const state = reduceDirectorPacketState(createInitialDirectorPacketState("greeting"), {
      type: "PACKET_LOADED",
      packet,
    });

    const scene = getDirectorPacketScenePresentation(AI_LESSON, state);

    assert.equal(scene.activeSpeaker, "peppa");
    assert.equal(scene.peppaBubble.text, "Hello, Bella!");
    assert.equal(scene.peppaBubble.isActive, true);
    assert.equal(scene.pollyBubble.isActive, false);
  });

  it("shows the child prompt while listening", () => {
    const state = {
      ...createInitialDirectorPacketState("greeting"),
      phase: DirectorPacketPhase.Listening,
      packet,
      activePrompt: packet.childPrompt,
      activeTurnIndex: packet.turns.length - 1,
    };

    const scene = getDirectorPacketScenePresentation(AI_LESSON, state);

    assert.equal(scene.activeSpeaker, "child");
    assert.equal(scene.pollyBubble.text, "轮到你说：Hello, Peppa!");
    assert.equal(scene.statusText, "麦克风正在听，请开口说");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/director-packet-scene.test.mjs
```

Expected: FAIL with an import error for `../lib/director-packet-scene.js`.

- [ ] **Step 3: Implement packet scene mapping**

Create `lib/director-packet-scene.js`:

```js
// @ts-check

import { LESSON_SCENE_ASSETS } from "./lesson-scene.js";
import { DirectorPacketPhase } from "./director-packet-state.js";

const BACKGROUNDS = {
  meadowDay: LESSON_SCENE_ASSETS.backgrounds.meadowDay,
  meadowEvening: LESSON_SCENE_ASSETS.backgrounds.meadowEvening,
  reward: LESSON_SCENE_ASSETS.backgrounds.reward,
};

const POSES = {
  peppa: LESSON_SCENE_ASSETS.peppa,
  polly: LESSON_SCENE_ASSETS.polly,
};

function findScene(lesson, sceneId) {
  return lesson.scenes.find((scene) => scene.id === sceneId) ?? lesson.scenes[0];
}

function createBubble(text = "", tone = "coach", isActive = false) {
  return { text, tone, isActive };
}

export function getDirectorPacketScenePresentation(lesson, state) {
  const sceneDefinition = findScene(lesson, state.currentSceneId);
  const packet = state.packet;
  const activeTurn = packet?.turns[state.activeTurnIndex] ?? null;
  const peppaPose = activeTurn?.speaker === "peppa" ? activeTurn.pose : packet?.characters?.peppa?.pose ?? "wave";
  const pollyPose = activeTurn?.speaker === "polly" ? activeTurn.pose : packet?.characters?.polly?.pose ?? "idle";
  const background = packet?.background ?? sceneDefinition.backgroundPreference;

  const presentation = {
    backgroundAsset: BACKGROUNDS[background] ?? LESSON_SCENE_ASSETS.backgrounds.meadowDay,
    peppaAsset: POSES.peppa[peppaPose] ?? LESSON_SCENE_ASSETS.peppa.wave,
    pollyAsset: POSES.polly[pollyPose] ?? LESSON_SCENE_ASSETS.polly.idle,
    activeSpeaker: activeTurn?.speaker ?? null,
    peppaBubble: createBubble(sceneDefinition.sceneLine.text, "example", false),
    pollyBubble: createBubble(sceneDefinition.tutorCueZh, "coach", false),
    statusText: sceneDefinition.goal,
  };

  if (activeTurn) {
    const bubble = createBubble(activeTurn.visibleText, activeTurn.purpose, true);
    if (activeTurn.speaker === "peppa") {
      return { ...presentation, activeSpeaker: "peppa", peppaBubble: bubble };
    }
    return { ...presentation, activeSpeaker: "polly", pollyBubble: bubble };
  }

  if (state.phase === DirectorPacketPhase.Listening) {
    return {
      ...presentation,
      activeSpeaker: "child",
      peppaAsset: LESSON_SCENE_ASSETS.peppa.listen,
      pollyAsset: LESSON_SCENE_ASSETS.polly.flap,
      pollyBubble: createBubble(state.activePrompt?.displayText ?? "", "listen", true),
      statusText: "麦克风正在听，请开口说",
    };
  }

  if (state.phase === DirectorPacketPhase.Finished) {
    return {
      ...presentation,
      backgroundAsset: LESSON_SCENE_ASSETS.backgrounds.reward,
      peppaAsset: LESSON_SCENE_ASSETS.peppa.clap,
      pollyAsset: LESSON_SCENE_ASSETS.polly.laugh,
      activeSpeaker: "polly",
      pollyBubble: createBubble("太棒啦，今天练习完成。", "completion", true),
    };
  }

  return presentation;
}
```

- [ ] **Step 4: Run packet-scene tests**

Run:

```bash
npm test -- tests/director-packet-scene.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/director-packet-scene.js tests/director-packet-scene.test.mjs
git commit -m "Add director packet scene presentation"
```

## Task 6: React Packet Flow Behind Local Flag

**Files:**
- Modify: `src/App.tsx`
- Create: `tests/director-packet-ui.test.mjs`

- [ ] **Step 1: Write failing static UI test**

Create `tests/director-packet-ui.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("director packet UI integration", () => {
  it("imports the director packet modules", () => {
    assert.match(appSource, /ai-lesson-data/);
    assert.match(appSource, /mock-lesson-director/);
    assert.match(appSource, /director-packet-state/);
    assert.match(appSource, /director-packet-scene/);
  });

  it("uses childPrompt.targetText for director speech evaluation", () => {
    assert.match(appSource, /activePrompt\\?\\.targetText/);
  });
});
```

- [ ] **Step 2: Run UI test to verify it fails**

Run:

```bash
npm test -- tests/director-packet-ui.test.mjs
```

Expected: FAIL because `src/App.tsx` does not import director packet modules.

- [ ] **Step 3: Add a local director-flow branch**

Modify `src/App.tsx` in the smallest possible branch:

```tsx
import { AI_LESSON } from "../lib/ai-lesson-data";
import { getDirectorPacketScenePresentation } from "../lib/director-packet-scene";
import {
  DirectorPacketPhase,
  createInitialDirectorPacketState,
  reduceDirectorPacketState,
} from "../lib/director-packet-state";
import { getMockDirectorPacket } from "../lib/mock-lesson-director";
```

Add a feature switch near constants:

```tsx
const USE_DIRECTOR_PACKET_FLOW =
  import.meta.env.VITE_PARROT_DIRECTOR_FLOW === "1";
const DIRECTOR_TURN_DELAY_MS = 900;
```

Add a separate `DirectorLessonPlayer` component below `LessonPlayer`, then switch the exported app entry to render it when the flag is set:

```tsx
export function LessonPlayer() {
  if (USE_DIRECTOR_PACKET_FLOW) return <DirectorLessonPlayer />;

  // existing deterministic component body remains unchanged
}
```

In `DirectorLessonPlayer`, use the packet reducer and the same stage markup pattern as `LessonPlayer`. The first implementation can use `window.setTimeout` for each director turn:

```tsx
function DirectorLessonPlayer() {
  const [state, dispatch] = useReducer(
    reduceDirectorPacketState,
    undefined,
    () => createInitialDirectorPacketState(AI_LESSON.scenes[0].id)
  );
  const [error, setError] = useState("");
  const scene = useMemo(
    () => getDirectorPacketScenePresentation(AI_LESSON, state),
    [state]
  );
  const activePrompt = state.activePrompt;

  useEffect(() => {
    if (state.phase !== DirectorPacketPhase.LoadingPacket &&
        state.phase !== DirectorPacketPhase.NeedsPacket) {
      return;
    }

    try {
      const packet = getMockDirectorPacket(AI_LESSON, state.runtimeState);
      dispatch({ type: "PACKET_LOADED", packet });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Director failed.");
      dispatch({ type: "PACKET_FAILED" });
    }
  }, [state.phase, state.runtimeState]);

  useEffect(() => {
    if (state.phase !== DirectorPacketPhase.PlayingTurn) return;
    const timeout = window.setTimeout(() => {
      dispatch({ type: "TURN_DONE" });
    }, DIRECTOR_TURN_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [state.activeTurnIndex, state.phase]);

  useEffect(() => {
    if (state.phase !== DirectorPacketPhase.Listening || !activePrompt) return;
    let cancelled = false;
    const controller = new AbortController();

    async function recordAndEvaluateDirectorPrompt() {
      try {
        const audioBlob = await recordSpeechClip({ signal: controller.signal });
        if (cancelled) return;
        dispatch({ type: "RECORDING_DONE" });
        const result = await evaluateSpeech({
          audio: audioBlob,
          signal: controller.signal,
          targetText: activePrompt.targetText,
        });
        if (!cancelled) dispatch({ type: "EVALUATED", result });
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Evaluation failed.");
        }
      }
    }

    void recordAndEvaluateDirectorPrompt();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activePrompt, state.phase]);

  // Reuse existing stage markup and bind scene/background/bubbles to `scene`.
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- tests/director-packet-ui.test.mjs tests/director-packet-state.test.mjs tests/director-packet-scene.test.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx tests/director-packet-ui.test.mjs
git commit -m "Render mock director packets behind a feature flag"
```

## Task 7: Plan 1 Verification

**Files:**
- No new files.

- [ ] **Step 1: Run full automated checks**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all commands PASS.

- [ ] **Step 2: Run local director-flow smoke check**

Run:

```bash
VITE_PARROT_DIRECTOR_FLOW=1 npm run dev:vite
```

Open the local Vite URL and verify:

- Start shows the lesson stage.
- The mock director cycles Peppa and Polly bubbles.
- The child prompt uses `Hello, Peppa!`.
- Recording starts only after the prompt turn.
- Existing deterministic flow still works without `VITE_PARROT_DIRECTOR_FLOW=1`.

- [ ] **Step 3: Commit verification notes if docs changed**

If no files changed, do not commit. If a follow-up note is added, run:

```bash
git add docs/design/codex-session-decision-log.md
git commit -m "Document director packet foundation verification"
```
