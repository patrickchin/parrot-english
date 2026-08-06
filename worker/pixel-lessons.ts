import {
  preparePixelLesson,
  type PreparedPixelLesson,
} from "../lib/pixel-lesson-data.ts";
import type { Database } from "./database.ts";
import type { LearnerProfileIdentity } from "./learner-profile.ts";
import { createLearnerProfileRepository } from "./learner-profile-repository.ts";
import {
  generatePixelLessonScript,
  PixelLessonGenerationError,
  type PixelLessonGenerationEnv,
} from "./pixel-lesson-generator.ts";
import {
  readBoundedText,
  RequestBodyTooLargeError,
} from "./request-body.ts";

const MAX_BODY_BYTES = 256 * 1024;

export type PixelLessonsEnv = PixelLessonGenerationEnv & { DB: D1Database };
export type PixelLessonRequestInput = {
  database: Database;
  env: PixelLessonsEnv;
  identity: LearnerProfileIdentity;
  request: Request;
};

type HandlerDependencies = {
  generatePixelLesson: typeof generatePixelLessonScript;
};

class PixelLessonApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message = code) {
    super(message);
    this.name = "PixelLessonApiError";
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
      throw new PixelLessonApiError(413, "payload_too_large");
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
    throw new PixelLessonApiError(400, "invalid_json");
  }
}

export async function handlePixelLessonRequest(
  input: PixelLessonRequestInput,
  overrides: Partial<HandlerDependencies> = {},
) {
  const generatePixelLesson =
    overrides.generatePixelLesson ?? generatePixelLessonScript;
  const url = new URL(input.request.url);

  try {
    if (
      url.pathname !== "/api/pixel-lessons/generate" ||
      input.request.method !== "POST"
    ) {
      throw new PixelLessonApiError(404, "not_found");
    }

    const body = await readJson(input.request);
    const topic = typeof body.topic === "string" ? body.topic.trim() : "";
    if (!topic || topic.length > 500) {
      throw new PixelLessonApiError(
        400,
        "invalid_topic",
        "Please describe the lesson topic in 500 characters or fewer.",
      );
    }

    const repository = createLearnerProfileRepository(input.database);
    const profile = await repository.findProfile(input.identity.userId);
    const learnerName = profile?.name?.trim() ?? "";
    if (!learnerName) {
      throw new PixelLessonApiError(
        400,
        "learner_name_required",
        "Add the learner's name to their profile before generating a pixel lesson.",
      );
    }

    const generated: PreparedPixelLesson = await generatePixelLesson({
      env: input.env,
      learnerName,
      topic,
    });
    let prepared: PreparedPixelLesson;
    try {
      prepared = preparePixelLesson(
        generated.lesson,
        "generated pixel lesson",
        { learnerName },
      );
    } catch (caughtError) {
      const detail =
        caughtError instanceof Error ? caughtError.message : "unknown error";
      throw new PixelLessonGenerationError(
        502,
        "invalid_generated_lesson",
        `Generated pixel lesson is invalid: ${detail}`,
      );
    }
    const generatorWarnings = Array.isArray(generated.warnings)
      ? generated.warnings.filter(
          (warning): warning is string => typeof warning === "string",
        )
      : [];
    return json({
      lesson: prepared.lesson,
      warnings: [...generatorWarnings, ...prepared.warnings],
    });
  } catch (caughtError) {
    if (caughtError instanceof PixelLessonApiError) {
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
    if (caughtError instanceof PixelLessonGenerationError) {
      return json(
        { error: caughtError.code, message: caughtError.message },
        { status: caughtError.status },
      );
    }
    return json(
      {
        error: "internal_error",
        message: "The pixel lesson request failed.",
      },
      { status: 500 },
    );
  }
}
