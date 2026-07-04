# JSON Lesson Creator Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the existing lesson creator prompt and replace the active prompt with an English-only scene-script prompt that returns validated JSON.

**Architecture:** Keep the original Markdown prompt as a dated, byte-for-byte backup. Treat the active prompt as an executable content contract: two embedded JSON examples demonstrate the exact lesson schema, while a focused Node test parses those examples and enforces the structural, language, speaker, emote, and summary rules approved in the design spec.

**Tech Stack:** Markdown, JSON examples, Node.js built-in test runner, JavaScript ES modules

---

### Task 1: Preserve the Existing Prompt

**Files:**
- Read: `docs/lesson-creator-system-prompt.md`
- Create: `docs/lesson-creator-system-prompt.backup-2026-07-05.md`

- [ ] **Step 1: Copy the active prompt to the dated backup**

```bash
cp docs/lesson-creator-system-prompt.md docs/lesson-creator-system-prompt.backup-2026-07-05.md
```

- [ ] **Step 2: Verify that the backup is byte-for-byte identical**

```bash
cmp docs/lesson-creator-system-prompt.md docs/lesson-creator-system-prompt.backup-2026-07-05.md
```

Expected: exit code 0 with no output.

### Task 2: Add a Failing Prompt Contract Test

**Files:**
- Create: `tests/lesson-creator-prompt.test.mjs`
- Read: `docs/superpowers/specs/2026-07-05-scene-script-lessons-design.md`

- [ ] **Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const prompt = readFileSync(
  new URL("../docs/lesson-creator-system-prompt.md", import.meta.url),
  "utf8"
);
const allowedRootKeys = [
  "childName",
  "detailedSummary",
  "goalPhrases",
  "location",
  "scenes",
  "summary",
  "title",
];
const allowedSceneKeys = [
  "background",
  "characters",
  "settingDescription",
  "steps",
  "title",
];
const allowedStepKeys = ["dialogue", "emotes", "speaker"];
const allowedCharacters = new Set(["peppa", "dolly", "user"]);
const allowedSpeakers = new Set([...allowedCharacters, "narrator"]);
const allowedEmotes = new Set([
  "idle",
  "talking",
  "listening",
  "happy",
  "sad",
  "surprised",
]);
const forbiddenSummaryLanguage =
  /\b(?:teach|teaching|practise|practice|learn|learner|english|target phrase|user)\b/i;
const chineseText = /[\u3400-\u9fff]/u;

function sortedKeys(value) {
  return Object.keys(value).sort();
}

function sentenceCount(value) {
  return value.match(/[.!?](?=\s|$)/g)?.length ?? 0;
}

function getJsonExamples() {
  return [...prompt.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) =>
    JSON.parse(match[1])
  );
}

describe("lesson creator system prompt", () => {
  it("requires strict English-only JSON in the scene-script contract", () => {
    assert.match(prompt, /valid JSON only/i);
    assert.match(prompt, /no Markdown fences/i);
    assert.match(prompt, /English-only/i);
    assert.match(prompt, /exactly two goal phrases/i);
    assert.match(prompt, /between five and eight scenes/i);
    assert.match(prompt, /one speaker and one dialogue line per step/i);
    assert.match(prompt, /press and hold/i);
    assert.match(prompt, /detailedSummary/);
  });

  it("contains two valid examples using only the supported contract", () => {
    const lessons = getJsonExamples();
    assert.equal(lessons.length, 2);

    for (const lesson of lessons) {
      assert.deepEqual(sortedKeys(lesson), allowedRootKeys);
      assert.equal(lesson.goalPhrases.length, 2);
      assert.equal(sentenceCount(lesson.summary), 1);
      assert.equal(sentenceCount(lesson.detailedSummary), 3);
      assert.doesNotMatch(lesson.summary, forbiddenSummaryLanguage);
      assert.doesNotMatch(lesson.detailedSummary, forbiddenSummaryLanguage);
      assert.ok(lesson.scenes.length >= 5 && lesson.scenes.length <= 8);
      assert.deepEqual(sortedKeys(lesson.location), ["description", "name"]);

      const allSteps = lesson.scenes.flatMap((scene) => {
        assert.deepEqual(sortedKeys(scene), allowedSceneKeys);
        assert.ok(scene.background.length > 0);
        assert.ok(scene.characters.length > 0);
        assert.ok(scene.characters.every((id) => allowedCharacters.has(id)));

        for (const step of scene.steps) {
          assert.deepEqual(sortedKeys(step), allowedStepKeys);
          assert.ok(allowedSpeakers.has(step.speaker));
          assert.equal(step.dialogue.includes("\n"), false);
          assert.doesNotMatch(step.dialogue, chineseText);
          assert.deepEqual(sortedKeys(step.emotes), [...scene.characters].sort());
          assert.ok(
            Object.values(step.emotes).every((emote) => allowedEmotes.has(emote))
          );
        }

        return scene.steps;
      });

      assert.ok(allSteps.some((step) => step.speaker === "narrator"));
      assert.ok(allSteps.some((step) => step.speaker === "user"));
      const finalStep = allSteps.at(-1);
      assert.equal(finalStep.speaker, "narrator");
      assert.match(finalStep.dialogue, new RegExp(lesson.childName, "i"));
    }
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/lesson-creator-prompt.test.mjs`

Expected: FAIL because the existing prompt has no strict JSON examples or `detailedSummary` contract.

### Task 3: Rewrite the Active Prompt

**Files:**
- Modify: `docs/lesson-creator-system-prompt.md`
- Test: `tests/lesson-creator-prompt.test.mjs`

- [ ] **Step 1: Replace the prose-output contract with the approved JSON contract**

The prompt sections are: Role and Purpose, Inputs, Output Contract, Global IDs,
Language Rules, Goal Phrase Rules, Story and Summary Rules, Scene Rules, Step
Rules, User Practice and Runtime Feedback, Ending Rules, Final Checklist, and
two complete JSON examples.

The exact root keys are `title`, `childName`, `goalPhrases`, `summary`,
`detailedSummary`, `location`, and `scenes`. Scene keys are `title`,
`settingDescription`, `background`, `characters`, and `steps`. Step keys
are `speaker`, `dialogue`, and `emotes`.

The prompt requires `peppa`, `dolly`, and `user` as visible character IDs;
`narrator` as a voice-only speaker; only `idle`, `talking`, `listening`,
`happy`, `sad`, and `surprised` as emotes; English-only child-facing text;
exactly two goal phrases; five to eight scenes; one dialogue line per step;
complete emote maps; automatic runtime progression; and press-and-hold recording
for `user`.

Example 1 is a five-scene playroom story using `Can you help me, please?` and
`Thank you!`. Example 2 is a five-scene restaurant story using
`May I have some water?` and `Here you are!`. Each example ends with narrator
praise containing the child name. Each `summary` is one story-only sentence,
and each `detailedSummary` is three story-only sentences with no teaching,
practice, learner-performance, or English-ability language.

- [ ] **Step 2: Run the focused test and verify GREEN**

Run: `node --test tests/lesson-creator-prompt.test.mjs`

Expected: 2 tests pass.

- [ ] **Step 3: Compare the active prompt to the preserved backup**

Run: `git diff --no-index -- docs/lesson-creator-system-prompt.backup-2026-07-05.md docs/lesson-creator-system-prompt.md`

Expected: a nonzero diff showing that the backup retains the old prose examples
and the active prompt contains the new JSON contract.

### Task 4: Verify the Prompt Change

**Files:**
- Verify: `docs/lesson-creator-system-prompt.md`
- Verify: `docs/lesson-creator-system-prompt.backup-2026-07-05.md`
- Verify: `tests/lesson-creator-prompt.test.mjs`

- [ ] **Step 1: Run the complete unit suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 2: Run the whitespace check**

Run: `git diff --check`

Expected: exit code 0 with no output.

- [ ] **Step 3: Review the intended task files**

Run:

```bash
git status --short
git diff -- docs/lesson-creator-system-prompt.md tests/lesson-creator-prompt.test.mjs
```

Expected: the active prompt, dated backup, test, and this plan are the only new
task files; unrelated `.superpowers/` content remains untouched.

