import {
  validateLessonDefinition,
  validateLessonDirectorResponse,
} from "../lib/lesson-director-schema.js";
import { getMockDirectorPacket } from "../lib/mock-lesson-director.js";
import type { LessonDirectorProviderEnv } from "./lesson-director-provider";

type LessonDirectorProviderModule = typeof import("./lesson-director-provider");
type LessonDirectorProviderCall = (
  requestBody: unknown,
  env: LessonDirectorProviderEnv
) => Promise<unknown>;
type MockDirectorLesson = Parameters<typeof getMockDirectorPacket>[0];
type MockDirectorRuntimeState = Parameters<typeof getMockDirectorPacket>[1];
type LessonDirectorRequestBody = {
  lesson: MockDirectorLesson;
  runtimeState: MockDirectorRuntimeState;
};

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return Response.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getLessonScene(lesson: unknown, sceneId: string) {
  if (!isObject(lesson) || !Array.isArray(lesson.scenes)) {
    return undefined;
  }

  return lesson.scenes.find((scene) => isObject(scene) && scene.id === sceneId);
}

function isSpeechSegment(value: unknown) {
  return (
    isObject(value) &&
    typeof value.text === "string" &&
    typeof value.lang === "string"
  );
}

function isFallbackUsableScene(scene: unknown) {
  return (
    isObject(scene) &&
    typeof scene.id === "string" &&
    typeof scene.backgroundPreference === "string" &&
    typeof scene.tutorCueZh === "string" &&
    typeof scene.childTarget === "string" &&
    isSpeechSegment(scene.sceneLine) &&
    isSpeechSegment(scene.modelLine)
  );
}

function isLessonDirectorRequestBody(
  requestBody: unknown
): requestBody is LessonDirectorRequestBody {
  if (
    !isObject(requestBody) ||
    requestBody.lesson == null ||
    requestBody.runtimeState == null
  ) {
    return false;
  }

  if (!validateLessonDefinition(requestBody.lesson).ok) {
    return false;
  }

  const currentScene =
    isObject(requestBody.runtimeState) &&
    typeof requestBody.runtimeState.currentSceneId === "string"
      ? getLessonScene(requestBody.lesson, requestBody.runtimeState.currentSceneId)
      : undefined;

  if (
    !isObject(requestBody.runtimeState) ||
    typeof requestBody.runtimeState.currentSceneId !== "string" ||
    !isFallbackUsableScene(currentScene)
  ) {
    return false;
  }

  return true;
}

async function loadProviderModule(): Promise<LessonDirectorProviderModule> {
  try {
    return await import("./lesson-director-provider");
  } catch {
    return await import("./lesson-director-provider" + ".ts");
  }
}

async function callLessonDirectorProvider(
  requestBody: unknown,
  env: LessonDirectorProviderEnv
) {
  const providerModule = await loadProviderModule();
  return providerModule.callLessonDirectorProvider(requestBody, env);
}

function createDirectorFallbackPacket(
  lesson: MockDirectorLesson,
  runtimeState: MockDirectorRuntimeState
) {
  const packet = getMockDirectorPacket(lesson, runtimeState);
  return {
    ...packet,
    lessonControl: {
      ...packet.lessonControl,
      reason: "director_fallback",
    },
  };
}

async function createFallbackResponse(
  lesson: MockDirectorLesson,
  runtimeState: MockDirectorRuntimeState
) {
  const packet = createDirectorFallbackPacket(lesson, runtimeState);
  return jsonResponse(packet);
}

export async function handleLessonDirector(
  request: Request,
  env: LessonDirectorProviderEnv,
  providerCall: LessonDirectorProviderCall = callLessonDirectorProvider
) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, { status: 400 });
  }

  if (!isLessonDirectorRequestBody(requestBody)) {
    return jsonResponse({ error: "invalid_request" }, { status: 400 });
  }

  const { lesson, runtimeState } = requestBody;

  let providerPacket: unknown;
  try {
    providerPacket = await providerCall(requestBody, env);
  } catch {
    return createFallbackResponse(lesson, runtimeState);
  }

  const validation = validateLessonDirectorResponse(providerPacket, lesson);
  if (!validation.ok) {
    return createFallbackResponse(lesson, runtimeState);
  }

  try {
    return jsonResponse(providerPacket);
  } catch {
    return createFallbackResponse(lesson, runtimeState);
  }
}
