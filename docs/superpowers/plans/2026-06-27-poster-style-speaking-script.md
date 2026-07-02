# Poster-Style Speaking Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each lesson page follow the approved poster-style speaking script, with a greeting reply exception and parrot-led Chinese cue plus English model before Bella speaks.

**Architecture:** Keep the existing lesson state machine. Extend lesson step data with `parrotModelLine`, make parrot coaching audio return two static lines, and update scene presentation/tests to read the new fields.

**Tech Stack:** JavaScript modules, React 19, Node test runner, Vite/TypeScript build.

---

### Task 1: Script Data Contract

**Files:**
- Modify: `lib/lesson-data.js`
- Test: `tests/lesson-script.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/lesson-script.test.mjs`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LESSON_STEPS } from "../lib/lesson-data.js";

describe("poster-style lesson script", () => {
  it("uses a Peppa-name reply for the greeting instead of repeating Bella's name", () => {
    const [greeting] = LESSON_STEPS;

    assert.equal(greeting.exampleLine, "Hello, Bella!");
    assert.equal(greeting.parrotModelLine, "Hello, Peppa!");
    assert.equal(greeting.childTarget, "Hello, Peppa!");
  });

  it("uses mimic practice for every non-greeting page", () => {
    for (const step of LESSON_STEPS.slice(1)) {
      assert.equal(step.parrotModelLine, step.exampleLine, step.id);
      assert.equal(step.childTarget, step.exampleLine, step.id);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/lesson-script.test.mjs`

Expected: FAIL because `parrotModelLine` is missing and the greeting still uses `Hi, Bella! How are you?`.

- [ ] **Step 3: Implement the script data**

Update `LessonStep` with `parrotModelLine`. Set the approved script:

```js
{
  id: "hello",
  sceneTitleZh: "多莉打招呼",
  exampleLine: "Hello, Bella!",
  parrotPromptZh: "佩奇在和你打招呼。我们回答佩奇。",
  parrotModelLine: "Hello, Peppa!",
  childTarget: "Hello, Peppa!",
  tipZh: "听到别人叫你的名字，可以用对方的名字打招呼。",
  durationHintSeconds: 30,
}
```

For the other four steps, set `parrotPromptZh` to the approved Chinese cue and set `parrotModelLine` equal to `childTarget`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/lesson-script.test.mjs`

Expected: PASS.

### Task 2: Audio Manifest and Sequence

**Files:**
- Modify: `lib/static-audio.js`
- Modify: `lib/lesson-audio.js`
- Modify: `tests/static-audio.test.mjs`
- Modify: `tests/lesson-audio.test.mjs`

- [ ] **Step 1: Write failing audio expectations**

Update audio tests so `ParrotCoaching` expects two lines: `turn-${step.id}` then `model-${step.id}`. Update static audio coverage to require `model-${step.id}`.

- [ ] **Step 2: Run audio tests to verify failure**

Run: `npm test -- tests/lesson-audio.test.mjs tests/static-audio.test.mjs`

Expected: FAIL because the manifest lacks `model-*` entries and coaching only returns one line.

- [ ] **Step 3: Implement audio manifest and sequence**

Add `model-*` entries that point to saved `parrot-*.mp3` files. Update `turn-*` visible text and `ttsText` to the approved Chinese prompts. Return `[turn, model]` for `ParrotCoaching`.

- [ ] **Step 4: Run audio tests to verify pass**

Run: `npm test -- tests/lesson-audio.test.mjs tests/static-audio.test.mjs`

Expected: PASS.

### Task 3: Scene Presentation

**Files:**
- Modify: `lib/lesson-scene.js`
- Modify: `tests/lesson-scene.test.mjs`

- [ ] **Step 1: Write failing scene expectations**

Update scene tests so the greeting base scene uses `Hello, Bella!`, coaching shows the Chinese cue, and listening shows `轮到你：Hello, Peppa!`.

- [ ] **Step 2: Run scene tests to verify failure**

Run: `npm test -- tests/lesson-scene.test.mjs`

Expected: FAIL until lesson data and scene assumptions use the new target.

- [ ] **Step 3: Implement scene text changes**

Keep Peppa bubble on `exampleLine`, keep parrot coaching bubble on `parrotPromptZh`, and keep listening bubble on `childTarget`.

- [ ] **Step 4: Run scene tests to verify pass**

Run: `npm test -- tests/lesson-scene.test.mjs`

Expected: PASS.

### Task 4: Full Verification

**Files:**
- Read: `src/App.tsx`
- Read: `lib/lesson-state.js`

- [ ] **Step 1: Run all focused tests**

Run: `npm test -- tests/lesson-script.test.mjs tests/lesson-audio.test.mjs tests/static-audio.test.mjs tests/lesson-scene.test.mjs`

Expected: PASS.

- [ ] **Step 2: Run project verification**

Run: `npm test`

Expected: PASS.

Run: `npm run build`

Expected: PASS.
