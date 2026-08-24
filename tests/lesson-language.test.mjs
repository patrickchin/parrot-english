import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getLessonLanguageWarnings } from "../lib/lesson-language.js";
import { createLessonScript } from "./fixtures/lesson-script.mjs";

describe("custom lesson language review", () => {
  it("leaves short, concrete lesson dialogue without notes", () => {
    assert.deepEqual(getLessonLanguageWarnings(createLessonScript()), []);
  });

  it("explains long questions, learner lines, spoken lines, and technical terms", () => {
    const lesson = createLessonScript();
    lesson.scenes = lesson.scenes.slice(0, 1);
    lesson.scenes[0].steps = [
      {
        speaker: "dolly",
        dialogue: "Can you please point to the little red flower beside Peppa?",
      },
      {
        speaker: "user",
        dialogue: "I would really like to choose the little red flower.",
      },
      {
        speaker: "narrator",
        dialogue:
          "First listen carefully and then look beside Peppa before choosing the flower that matches her basket.",
      },
      {
        speaker: "dolly",
        dialogue: "Open the JSON API.",
      },
    ];
    const unchanged = JSON.parse(JSON.stringify(lesson));

    const warnings = getLessonLanguageWarnings(lesson);

    assert.equal(warnings.length, 4);
    assert.match(warnings[0], /Scene 1, dialogue 1.*question has 11 words/i);
    assert.match(warnings[1], /dialogue 2.*learner practice line has 10 words/i);
    assert.match(warnings[2], /dialogue 3.*spoken line has 16 words/i);
    assert.match(warnings[3], /dialogue 4.*technical terms.*"JSON".*"API"/i);
    assert.deepEqual(
      lesson,
      unchanged,
      "advisory review must not change the draft",
    );
  });

  it("reviews optional speaking feedback and caps noisy output", () => {
    const lesson = createLessonScript();
    lesson.scenes = lesson.scenes.slice(0, 1);
    const learnerStep = lesson.scenes[0].steps[1];
    learnerStep.check = {
      maxAttempts: 2,
      correct: {
        speaker: "dolly",
        dialogue:
          "That was a wonderful answer and now we can continue together to find another bright flower.",
        after: "continue",
      },
      incorrect: {
        speaker: "dolly",
        dialogue: "Can you please try saying the whole long answer one more time?",
        after: "retry",
      },
      incorrectFinal: {
        speaker: "dolly",
        dialogue: "The API will submit your parameter to the database interface.",
        after: "continue",
      },
    };
    lesson.scenes = Array.from({ length: 5 }, () =>
      JSON.parse(JSON.stringify(lesson.scenes[0])),
    );

    const warnings = getLessonLanguageWarnings(lesson);

    assert.equal(warnings.length, 9);
    assert.match(warnings[0], /correct feedback.*spoken line/i);
    assert.match(warnings[1], /try-again feedback.*question/i);
    assert.match(warnings.at(-1), /more language notes are hidden/i);
  });
});
