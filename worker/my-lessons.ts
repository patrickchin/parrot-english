import { prepareLesson } from "../lib/lesson-data.js";
import type { Lesson } from "../src/lesson-catalog.ts";
import type { Database } from "./database.ts";
import {
  generateLessonScript,
  LessonGenerationError,
} from "./lesson-generator.ts";
import { LESSON_VISUAL_CATALOG } from "./lesson-catalog.ts";
import { createMyLessonRepository } from "./my-lessons-repository.ts";
import type { OnboardingIdentity } from "./onboarding.ts";
import {
  readBoundedText,
  RequestBodyTooLargeError,
} from "./request-body.ts";
import type { ApiEnv } from "./groq.ts";

const MAX_BODY_BYTES = 256 * 1024;

export type MyLessonsEnv = ApiEnv & { DB: D1Database };
export type MyLessonRequestInput = {
  database: Database;
  env: MyLessonsEnv;
  identity: OnboardingIdentity;
  request: Request;
};

type HandlerDependencies = {
  createId: () => string;
  generateLesson: typeof generateLessonScript;
  now: () => Date;
};

class MyLessonApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message = code) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function json(payload: unknown, init?: ResponseInit) {
  return Response.json(payload, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) },
  });
}

async function readJson(request: Request) {
  let text: string;
  try {
    text = await readBoundedText(request, MAX_BODY_BYTES);
  } catch (caughtError) {
    if (caughtError instanceof RequestBodyTooLargeError) {
      throw new MyLessonApiError(413, "payload_too_large");
    }
    throw caughtError;
  }

  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("not an object");
    }
    return value as Record<string, unknown>;
  } catch {
    throw new MyLessonApiError(400, "invalid_json");
  }
}

function clientLesson(row: {
  createdAt: Date;
  id: string;
  lessonJson: string;
  source: string;
  updatedAt: Date;
}) {
  return {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    lesson: JSON.parse(row.lessonJson) as Lesson,
    source: row.source,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function preparedLesson(
  value: unknown,
  sourceName = "lesson",
  defaults?: { childName?: string },
) {
  try {
    return prepareLesson(value, LESSON_VISUAL_CATALOG, sourceName, defaults);
  } catch (caughtError) {
    throw new MyLessonApiError(
      400,
      "invalid_lesson",
      caughtError instanceof Error ? caughtError.message : "The lesson is invalid.",
    );
  }
}

export async function handleMyLessonRequest(
  input: MyLessonRequestInput,
  overrides: Partial<HandlerDependencies> = {},
) {
  const dependencies: HandlerDependencies = {
    createId: overrides.createId ?? (() => crypto.randomUUID()),
    generateLesson: overrides.generateLesson ?? generateLessonScript,
    now: overrides.now ?? (() => new Date()),
  };
  const repository = createMyLessonRepository(input.database, dependencies);
  const url = new URL(input.request.url);
  const detailMatch = url.pathname.match(/^\/api\/lessons\/my\/([^/]+)$/);

  try {
    if (url.pathname === "/api/lessons/my" && input.request.method === "GET") {
      const rows = await repository.listOwned(input.identity.userId);
      return json({ lessons: rows.map(clientLesson) });
    }

    if (url.pathname === "/api/lessons/my" && input.request.method === "POST") {
      const body = await readJson(input.request);
      if (body.source !== "generated" && body.source !== "uploaded") {
        throw new MyLessonApiError(400, "invalid_source");
      }
      const draft = preparedLesson(body.lesson);
      const row = await repository.create(
        input.identity.userId,
        body.source,
        draft.lesson,
      );
      if (!row) throw new Error("Lesson could not be loaded after saving.");
      return json(
        { lesson: clientLesson(row), warnings: draft.warnings },
        { status: 201 },
      );
    }

    if (
      url.pathname === "/api/lessons/my/generate" &&
      input.request.method === "POST"
    ) {
      const body = await readJson(input.request);
      const topic = typeof body.topic === "string" ? body.topic.trim() : "";
      if (!topic || topic.length > 500) {
        throw new MyLessonApiError(
          400,
          "invalid_topic",
          "Please describe the lesson topic in 500 characters or fewer.",
        );
      }
      const childName =
        (await repository.learnerName(input.identity.userId)) ??
        input.identity.userName?.trim();
      if (!childName) {
        throw new MyLessonApiError(
          400,
          "learner_name_required",
          "Add the learner's name to their profile before generating a lesson.",
        );
      }
      const generated = await dependencies.generateLesson({
        childName,
        env: input.env,
        topic,
      });
      const draft = preparedLesson(
        generated.lesson,
        "generated lesson",
        { childName },
      );
      return json({
        lesson: draft.lesson,
        warnings: [...generated.warnings, ...draft.warnings],
      });
    }

    if (detailMatch && input.request.method === "PUT") {
      const body = await readJson(input.request);
      const draft = preparedLesson(body.lesson, "edited lesson");
      const row = await repository.updateOwned(
        decodeURIComponent(detailMatch[1]),
        input.identity.userId,
        draft.lesson,
      );
      if (!row) throw new MyLessonApiError(404, "not_found");
      return json({ lesson: clientLesson(row), warnings: draft.warnings });
    }

    if (detailMatch && input.request.method === "GET") {
      const row = await repository.findOwned(
        decodeURIComponent(detailMatch[1]),
        input.identity.userId,
      );
      if (!row) throw new MyLessonApiError(404, "not_found");
      return json({ lesson: clientLesson(row) });
    }

    throw new MyLessonApiError(404, "not_found");
  } catch (caughtError) {
    if (caughtError instanceof MyLessonApiError) {
      return json(
        {
          error: caughtError.code,
          ...(caughtError.message !== caughtError.code
            ? { message: caughtError.message }
            : {}),
        },
        { status: caughtError.status },
      );
    }
    if (caughtError instanceof LessonGenerationError) {
      return json(
        { error: caughtError.code, message: caughtError.message },
        { status: caughtError.status },
      );
    }
    return json(
      { error: "internal_error", message: "The lesson request failed." },
      { status: 500 },
    );
  }
}
