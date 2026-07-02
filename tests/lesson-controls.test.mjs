import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getLessonPrimaryControl } from "../lib/lesson-controls.js";
import { LessonPhase, createInitialLessonState } from "../lib/lesson-state.js";

describe("lesson primary controls", () => {
  it("shows the start button only on the first idle scene", () => {
    const control = getLessonPrimaryControl(createInitialLessonState());

    assert.deepEqual(control, {
      kind: "start",
      label: "开始",
      ariaLabel: "Start lesson",
      action: "start",
    });
  });

  it("uses play to continue from later idle scenes", () => {
    const control = getLessonPrimaryControl({
      ...createInitialLessonState(),
      stepIndex: 2,
    });

    assert.deepEqual(control, {
      kind: "play",
      label: "播放",
      ariaLabel: "Play scene 3",
      action: "play",
    });
  });

  it("uses pause while later scenes are active", () => {
    const control = getLessonPrimaryControl({
      ...createInitialLessonState(),
      phase: LessonPhase.ParrotCoaching,
      stepIndex: 2,
    });

    assert.deepEqual(control, {
      kind: "pause",
      label: "暂停",
      ariaLabel: "Pause scene 3",
      action: "pause",
    });
  });

  it("keeps active first-scene playback as status text", () => {
    const control = getLessonPrimaryControl({
      ...createInitialLessonState(),
      phase: LessonPhase.ExampleSpeaking,
    });

    assert.deepEqual(control, {
      kind: "status",
      label: "",
      ariaLabel: "",
      action: "none",
    });
  });
});
