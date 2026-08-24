import { validateLesson } from "../../lib/lesson-data.js";
import { LESSON_VISUAL_CATALOG } from "../../lib/lesson-visual-catalog.ts";
import { isSafeRouteId } from "../../lib/route-id.ts";
import type { Lesson, LessonDraft } from "./lesson-catalog";

export type MyLessonSource = "generated" | "uploaded";
export type MyLessonDescriptor = {
  createdAt?: string;
  id: string;
  lesson: Lesson;
  source: MyLessonSource;
  updatedAt?: string;
};

export type MyLessonsRequestOptions = {
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
};

export class MyLessonsApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(
    status: number,
    code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MyLessonsApiError";
    this.code = code;
    this.status = status;
  }
}

type JsonResponse<Result> = {
  parseError: unknown;
  payload: Result;
  status: number;
};

async function requestJson<Result>(
  path: string,
  init: RequestInit,
  {
    fetch: request = globalThis.fetch,
    signal,
  }: MyLessonsRequestOptions = {},
): Promise<JsonResponse<Result>> {
  const response = await request(path, { ...init, signal });
  let payload: unknown;
  let parseError: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
    parseError = new SyntaxError(
      "The My Lessons response was not valid JSON.",
    );
  }
  if (!response.ok) {
    const error =
      payload && typeof payload === "object"
        ? (payload as { error?: unknown; message?: unknown })
        : {};
    const code =
      typeof error.error === "string" ? error.error : "request_failed";
    const message =
      typeof error.message === "string"
        ? error.message
        : "The lesson request could not be completed.";
    throw new MyLessonsApiError(
      response.status,
      code,
      message,
      parseError ? { cause: parseError } : undefined,
    );
  }
  return {
    parseError,
    payload: payload as Result,
    status: response.status,
  };
}

async function jsonPost<Result>(
  path: string,
  body: unknown,
  options?: MyLessonsRequestOptions,
) {
  const response = await requestJson<Result>(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    options,
  );
  return response.payload;
}

async function jsonPut<Result>(
  path: string,
  body: unknown,
  options?: MyLessonsRequestOptions,
) {
  const response = await requestJson<Result>(
    path,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    options,
  );
  return response.payload;
}

function requireMyLessonDescriptor(
  value: unknown,
  index: number,
): MyLessonDescriptor {
  const path = `My Lessons response.lessons[${index}]`;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }

  const descriptor = value as {
    createdAt?: unknown;
    id?: unknown;
    lesson?: unknown;
    source?: unknown;
    updatedAt?: unknown;
  };
  if (!isSafeRouteId(descriptor.id)) {
    throw new Error(`${path}.id must be a safe route ID.`);
  }
  if (descriptor.source !== "generated" && descriptor.source !== "uploaded") {
    throw new Error(`${path}.source is not supported.`);
  }
  for (const key of ["createdAt", "updatedAt"] as const) {
    const timestamp = descriptor[key];
    if (timestamp !== undefined && typeof timestamp !== "string") {
      throw new Error(`${path}.${key} must be a string when provided.`);
    }
  }

  return {
    ...(descriptor.createdAt !== undefined
      ? { createdAt: descriptor.createdAt as string }
      : {}),
    id: descriptor.id,
    lesson: validateLesson(
      descriptor.lesson,
      LESSON_VISUAL_CATALOG,
      `${path}.lesson`,
    ),
    source: descriptor.source,
    ...(descriptor.updatedAt !== undefined
      ? { updatedAt: descriptor.updatedAt as string }
      : {}),
  };
}

function parseMyLessonsResponse(
  payload: unknown,
  status: number,
  parseError: unknown,
): MyLessonDescriptor[] {
  try {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      if (parseError) throw parseError;
      throw new Error("My Lessons response must be an object.");
    }
    const lessons = (payload as { lessons?: unknown }).lessons;
    if (!Array.isArray(lessons)) {
      throw new Error("My Lessons response.lessons must be an array.");
    }
    const descriptors = lessons.map(requireMyLessonDescriptor);
    if (new Set(descriptors.map(({ id }) => id)).size !== descriptors.length) {
      throw new Error("My Lessons response contains duplicate lesson IDs.");
    }
    return descriptors;
  } catch (caughtError) {
    throw new MyLessonsApiError(
      status,
      "invalid_response",
      "The My Lessons response was invalid.",
      { cause: caughtError },
    );
  }
}

export async function generateMyLesson(
  topic: string,
  options?: MyLessonsRequestOptions,
) {
  return jsonPost<LessonDraft>(
    "/api/lessons/my/generate",
    { topic },
    options,
  );
}

export async function saveMyLesson(
  lesson: Lesson,
  source: MyLessonSource,
  options?: MyLessonsRequestOptions,
) {
  const result = await jsonPost<{ lesson: MyLessonDescriptor }>(
    "/api/lessons/my",
    { lesson, source },
    options,
  );
  return result.lesson;
}

export async function loadMyLessons(options?: MyLessonsRequestOptions) {
  const response = await requestJson<unknown>(
    "/api/lessons/my",
    { method: "GET" },
    options,
  );
  return parseMyLessonsResponse(
    response.payload,
    response.status,
    response.parseError,
  );
}

export async function loadMyLesson(
  lessonId: string,
  options?: MyLessonsRequestOptions,
) {
  const response = await requestJson<unknown>(
    `/api/lessons/my/${encodeURIComponent(lessonId)}`,
    { method: "GET" },
    options,
  );
  try {
    if (response.parseError) throw response.parseError;
    const lesson = (response.payload as { lesson?: unknown } | null)?.lesson;
    return requireMyLessonDescriptor(lesson, 0);
  } catch (caughtError) {
    throw new MyLessonsApiError(
      response.status,
      "invalid_response",
      "The My Lessons response was invalid.",
      { cause: caughtError },
    );
  }
}

export async function updateMyLesson(
  lessonId: string,
  lesson: Lesson,
  options?: MyLessonsRequestOptions,
) {
  return jsonPut<{ lesson: MyLessonDescriptor; warnings: string[] }>(
    `/api/lessons/my/${encodeURIComponent(lessonId)}`,
    { lesson },
    options,
  );
}
