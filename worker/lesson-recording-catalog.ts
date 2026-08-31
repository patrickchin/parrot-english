import lesson01 from "../content/lessons/01-peppas-high-ball.json" with { type: "json" };
import lesson02 from "../content/lessons/02-garden-colors.json" with { type: "json" };
import lesson03 from "../content/lessons/03-snack-time.json" with { type: "json" };
import lesson04 from "../content/lessons/04-playground-words.json" with { type: "json" };
import lesson05 from "../content/lessons/05-market-day.json" with { type: "json" };
import lesson06 from "../content/lessons/06-picnic-time.json" with { type: "json" };
import lesson07 from "../content/lessons/07-bedtime-story.json" with { type: "json" };
import type { Database } from "./database.ts";
import type { LessonRecordingSlot } from "./lesson-recording-storage.ts";
import type { LearnerIdentity } from "./request-identity.ts";

const BUILT_IN_LESSONS = new Map<string, unknown>([
  ["01-peppas-high-ball", lesson01],
  ["02-garden-colors", lesson02],
  ["03-snack-time", lesson03],
  ["04-playground-words", lesson04],
  ["05-market-day", lesson05],
  ["06-picnic-time", lesson06],
  ["07-bedtime-story", lesson07],
]);

type LessonRecordingTarget = {
  lessonGeneration: number | null;
  revision: string | null;
  targetText: string;
};

function userTarget(lesson: unknown, slot: LessonRecordingSlot) {
  if (!lesson || typeof lesson !== "object" || Array.isArray(lesson)) {
    return null;
  }
  const scenes = (lesson as { scenes?: unknown }).scenes;
  if (!Array.isArray(scenes)) return null;
  const scene = scenes[slot.sceneIndex];
  if (!scene || typeof scene !== "object" || Array.isArray(scene)) return null;
  const steps = (scene as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return null;
  const step = steps[slot.stepIndex];
  if (!step || typeof step !== "object" || Array.isArray(step)) return null;
  const { dialogue, speaker } = step as {
    dialogue?: unknown;
    speaker?: unknown;
  };
  return speaker === "user" && typeof dialogue === "string" && dialogue.trim()
    ? dialogue
    : null;
}

export async function resolveLessonRecordingTarget(
  _database: Database,
  _identity: LearnerIdentity,
  slot: LessonRecordingSlot,
): Promise<LessonRecordingTarget | null> {
  if (slot.source !== "parrot") return null;
  const targetText = userTarget(BUILT_IN_LESSONS.get(slot.lessonId), slot);
  return targetText
    ? { lessonGeneration: null, revision: null, targetText }
    : null;
}
