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

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "MyLessonsApiError";
    this.code = code;
    this.status = status;
  }
}

async function requestJson<Result>(
  path: string,
  init: RequestInit,
  {
    fetch: request = globalThis.fetch,
    signal,
  }: MyLessonsRequestOptions = {},
) {
  const response = await request(path, { ...init, signal });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
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
    throw new MyLessonsApiError(response.status, code, message);
  }
  return payload as Result;
}

function jsonPost<Result>(
  path: string,
  body: unknown,
  options?: MyLessonsRequestOptions,
) {
  return requestJson<Result>(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    options,
  );
}

function jsonPut<Result>(
  path: string,
  body: unknown,
  options?: MyLessonsRequestOptions,
) {
  return requestJson<Result>(
    path,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    options,
  );
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
  const result = await requestJson<{ lessons: MyLessonDescriptor[] }>(
    "/api/lessons/my",
    { method: "GET" },
    options,
  );
  return result.lessons;
}

export async function loadMyLesson(
  lessonId: string,
  options?: MyLessonsRequestOptions,
) {
  const result = await requestJson<{ lesson: MyLessonDescriptor }>(
    `/api/lessons/my/${encodeURIComponent(lessonId)}`,
    { method: "GET" },
    options,
  );
  return result.lesson;
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
