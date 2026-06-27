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

function createValidAdvancePacket() {
  return {
    schemaVersion: "lesson-director.response.v1",
    packetId: "greeting-start-001",
    sceneId: "greeting",
    background: "meadowDay",
    characters: {
      peppa: { pose: "listen" },
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
}

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

  it("rejects null top-level lesson field shapes", () => {
    const result = validateLessonDefinition({
      ...lesson,
      learner: null,
      world: null,
      characters: null,
      availableAssets: null,
      teachingPolicy: null,
      scenes: null,
    });
    const errors = result.errors.join("\n");

    assert.equal(result.ok, false);
    assert.match(errors, /lesson\.learner must be an object/);
    assert.match(errors, /lesson\.world must be an object/);
    assert.match(errors, /lesson\.characters must be an array/);
    assert.match(errors, /lesson\.availableAssets must be an object/);
    assert.match(errors, /lesson\.teachingPolicy must be an object/);
    assert.match(errors, /lesson\.scenes must be an array/);
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

  it("rejects listening child prompts without prompt_child status", () => {
    const packet = {
      schemaVersion: "lesson-director.response.v1",
      packetId: "greeting-start-001",
      sceneId: "greeting",
      background: "meadowDay",
      characters: {
        peppa: { pose: "listen" },
        polly: { pose: "talk" },
      },
      turns: [],
      childPrompt: {
        shouldListen: true,
        targetText: "Hello, Peppa!",
        displayText: "轮到你说：Hello, Peppa!",
      },
      lessonControl: {
        status: "advance_scene",
        nextSceneId: "greeting",
        reason: "test",
      },
    };

    const result = validateLessonDirectorResponse(packet, lesson);

    assert.equal(result.ok, false);
    assert.match(
      result.errors.join("\n"),
      /childPrompt.shouldListen requires prompt_child status/
    );
  });

  it("returns validation errors for malformed packet shapes", () => {
    const cases = [
      {
        name: "undefined lesson",
        packet: createValidAdvancePacket(),
        lessonValue: undefined,
        expectedError: /unknown scene greeting/,
      },
      {
        name: "malformed characters",
        packet: { ...createValidAdvancePacket(), characters: [] },
        lessonValue: lesson,
        expectedError: /packet\.characters must be an object/,
      },
      {
        name: "malformed turns",
        packet: { ...createValidAdvancePacket(), turns: {} },
        lessonValue: lesson,
        expectedError: /packet\.turns must be an array/,
      },
      {
        name: "malformed turn speech",
        packet: {
          ...createValidAdvancePacket(),
          turns: [
            {
              turnId: "t1",
              speaker: "polly",
              purpose: "prompt_repeat",
              visibleText: "轮到你说。",
              speech: { lang: "zh-CN", text: "轮到你说。" },
              pose: "talk",
            },
          ],
        },
        lessonValue: lesson,
        expectedError: /turn t1 speech must be an array/,
      },
      {
        name: "malformed turn entry",
        packet: { ...createValidAdvancePacket(), turns: [null] },
        lessonValue: lesson,
        expectedError: /turn 0 must be an object/,
      },
    ];

    for (const { name, packet, lessonValue, expectedError } of cases) {
      let result;
      assert.doesNotThrow(() => {
        result = validateLessonDirectorResponse(packet, lessonValue);
      }, name);
      assert.equal(result.ok, false, name);
      assert.match(result.errors.join("\n"), expectedError, name);
    }
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
