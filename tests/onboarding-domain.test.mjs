import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assignQuestionnaireVersion,
  canCompleteQuestionnaire,
  canSkipForSession,
  getApplicableQuestions,
  getNextQuestion,
  getProgress,
  isQuestionApplicable,
  normalizeAnswer,
  parseQuestionConfig,
  readProfileAnswers,
  validateAnswer,
  writeProfileAnswer,
} from "../lib/onboarding.js";

function question(overrides = {}) {
  return {
    answerKey: "favoriteCartoons",
    answerType: "text",
    branchingJson: null,
    cardinality: "scalar",
    optionsJson: null,
    required: true,
    validationJson: null,
    ...overrides,
  };
}

describe("onboarding answer validation", () => {
  it("parses nullable question configuration without trusting malformed JSON", () => {
    assert.deepEqual(parseQuestionConfig(question()), {
      branching: null,
      options: null,
      validation: {},
    });
    assert.deepEqual(
      parseQuestionConfig(
        question({
          branchingJson: '{"key":"age","operator":"equals","value":8}',
          optionsJson: '["Bluey","Paw Patrol"]',
          validationJson: '{"maxItems":3}',
        }),
      ),
      {
        branching: { key: "age", operator: "equals", value: 8 },
        options: ["Bluey", "Paw Patrol"],
        validation: { maxItems: 3 },
      },
    );

    assert.throws(
      () => parseQuestionConfig(question({ validationJson: "not-json" })),
      /Invalid questionnaire configuration/,
    );
    assert.throws(
      () => parseQuestionConfig(question({ optionsJson: '{"Bluey":true}' })),
      /Invalid questionnaire configuration/,
    );
  });

  it("trims text and enforces configured maximum length", () => {
    assert.deepEqual(
      normalizeAnswer(question(), "  drawing  "),
      { value: "drawing" },
    );
    assert.deepEqual(
      validateAnswer(question({ validationJson: '{"maxLength":5}' }), "drawing"),
      { error: "Please use 5 characters or fewer." },
    );
  });

  it("requires finite integer numbers inside the configured range", () => {
    const ageQuestion = question({
      answerKey: "age",
      answerType: "number",
      validationJson: '{"min":3,"max":17}',
    });

    assert.deepEqual(validateAnswer(ageQuestion, 8), { value: 8 });
    assert.deepEqual(validateAnswer(ageQuestion, "8"), {
      error: "Please enter a whole number.",
    });
    assert.deepEqual(validateAnswer(ageQuestion, 8.5), {
      error: "Please enter a whole number.",
    });
    assert.deepEqual(validateAnswer(ageQuestion, 2), {
      error: "Please enter a number from 3 to 17.",
    });
  });

  it("canonicalizes configured choice labels and rejects unknown choices", () => {
    const choiceQuestion = question({
      answerType: "choice",
      optionsJson: '["Bluey","Paw Patrol"]',
    });

    assert.deepEqual(validateAnswer(choiceQuestion, " bluey "), {
      value: "Bluey",
    });
    assert.deepEqual(validateAnswer(choiceQuestion, "Peppa Pig"), {
      error: "Please choose one of the available options.",
    });
  });

  it("validates array shape, removes normalized duplicates, and limits items", () => {
    const arrayQuestion = question({
      cardinality: "array",
      validationJson: '{"maxItems":3,"maxLength":20}',
    });

    assert.deepEqual(
      validateAnswer(arrayQuestion, [" dog ", "DOG", "dinosaur"]),
      { value: ["dog", "dinosaur"] },
    );
    assert.deepEqual(validateAnswer(arrayQuestion, "dog"), {
      error: "Please provide a list of answers.",
    });
    assert.deepEqual(
      validateAnswer(arrayQuestion, ["dog", "cat", "bird", "rabbit"]),
      { error: "Please choose no more than 3 answers." },
    );
  });

  it("enforces scalar shape and required answers", () => {
    assert.deepEqual(validateAnswer(question(), ["Bluey"]), {
      error: "Please provide one answer.",
    });
    assert.deepEqual(validateAnswer(question(), "   "), {
      error: "Please answer this question.",
    });
    assert.deepEqual(
      validateAnswer(question({ required: false }), "   "),
      { value: "" },
    );
    assert.deepEqual(
      validateAnswer(question({ cardinality: "array" }), []),
      { error: "Please answer this question." },
    );
  });
});

describe("onboarding profile and flow rules", () => {
  const questions = [
    question({ answerKey: "age", answerType: "number", position: 1 }),
    question({
      answerKey: "favoriteAnimals",
      cardinality: "array",
      position: 2,
    }),
    question({
      answerKey: "dinosaurStories",
      branchingJson:
        '{"key":"favoriteAnimals","operator":"includes","value":"dinosaur"}',
      position: 3,
    }),
    question({ answerKey: "favoriteActivities", position: 4 }),
  ];

  it("keeps canonical name and age in columns and other keys in JSON", () => {
    const profile = {
      name: "Mia",
      age: 8,
      answersJson:
        '{"name":"wrong","age":99,"favoriteAnimals":["dog"]}',
    };

    assert.deepEqual(readProfileAnswers(profile), {
      favoriteAnimals: ["dog"],
      name: "Mia",
      age: 8,
    });

    assert.deepEqual(writeProfileAnswer(profile, "name", "May"), {
      ...profile,
      name: "May",
      answersJson: '{"favoriteAnimals":["dog"]}',
    });
    assert.deepEqual(writeProfileAnswer(profile, "age", 9), {
      ...profile,
      age: 9,
      answersJson: '{"favoriteAnimals":["dog"]}',
    });
    assert.deepEqual(
      writeProfileAnswer(profile, "favoriteActivities", ["drawing"]),
      {
        ...profile,
        answersJson:
          '{"favoriteAnimals":["dog"],"favoriteActivities":["drawing"]}',
      },
    );
  });

  it("evaluates declarative branches against confirmed stable answers", () => {
    const base = question({ answerKey: "branch" });
    const branch = (operator, value) => ({
      ...base,
      branchingJson: JSON.stringify({
        key: "favoriteAnimals",
        operator,
        value,
      }),
    });
    const answers = { favoriteAnimals: ["dog", "dinosaur"] };

    assert.equal(isQuestionApplicable(branch("includes", "dinosaur"), answers), true);
    assert.equal(isQuestionApplicable(branch("notIncludes", "cat"), answers), true);
    assert.equal(
      isQuestionApplicable(
        { ...base, branchingJson: '{"key":"age","operator":"equals","value":8}' },
        { age: 8 },
      ),
      true,
    );
    assert.equal(
      isQuestionApplicable(
        {
          ...base,
          branchingJson: '{"key":"age","operator":"notEquals","value":8}',
        },
        { age: 8 },
      ),
      false,
    );
    assert.throws(
      () => isQuestionApplicable(branch("exec", "anything"), answers),
      /Invalid questionnaire configuration/,
    );
  });

  it("computes applicable questions, saved resume position, and progress", () => {
    const answers = { age: 8, favoriteAnimals: ["dog"] };
    const applicable = getApplicableQuestions(questions, answers);

    assert.deepEqual(
      applicable.map(({ answerKey }) => answerKey),
      ["age", "favoriteAnimals", "favoriteActivities"],
    );
    assert.equal(
      getNextQuestion({
        answers,
        currentQuestionKey: "favoriteActivities",
        questions,
      })?.answerKey,
      "favoriteActivities",
    );
    assert.deepEqual(getProgress(questions, answers, "favoriteActivities"), {
      answered: 2,
      current: 3,
      total: 3,
    });
  });

  it("advances to a newly applicable branch and validates completion", () => {
    const answers = { age: 8, favoriteAnimals: ["dinosaur"] };
    assert.equal(
      getNextQuestion({ answers, currentQuestionKey: null, questions })?.answerKey,
      "dinosaurStories",
    );
    assert.deepEqual(canCompleteQuestionnaire(questions, answers), {
      complete: false,
      missingQuestionKey: "dinosaurStories",
    });
    assert.deepEqual(
      canCompleteQuestionnaire(questions, {
        ...answers,
        dinosaurStories: "space",
        favoriteActivities: "drawing",
      }),
      { complete: true },
    );
  });

  it("preserves assigned versions and bypasses only the exact skipped session", () => {
    assert.equal(
      assignQuestionnaireVersion(
        { onboardingStatus: "not_started", questionnaireVersion: null },
        2,
      ),
      2,
    );
    assert.equal(
      assignQuestionnaireVersion(
        { onboardingStatus: "in_progress", questionnaireVersion: 1 },
        2,
      ),
      1,
    );
    assert.equal(
      assignQuestionnaireVersion(
        { onboardingStatus: "completed", questionnaireVersion: 1 },
        2,
      ),
      1,
    );

    const skipped = {
      onboardingStatus: "in_progress",
      lastSkippedSessionId: "session-1",
    };
    assert.equal(canSkipForSession(skipped, "session-1"), true);
    assert.equal(canSkipForSession(skipped, "session-2"), false);
    assert.equal(
      canSkipForSession(
        { ...skipped, onboardingStatus: "completed" },
        "session-1",
      ),
      false,
    );
  });
});
