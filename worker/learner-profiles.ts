import { asc, eq } from "drizzle-orm";
import {
  learnerProfile,
  sessionLearnerSelection,
} from "../src/db/schema.ts";
import {
  containsLikelyFullLearnerName,
  containsPrivateLearnerProfileDetails,
  PREFERRED_NAME_FIELD_ERROR,
  PRIVATE_PROFILE_FIELD_ERROR,
} from "../lib/learner-profile-privacy.ts";
import type { Database } from "./database.ts";
import { LEARNER_PROFILE_QUESTIONNAIRE } from "./learner-profile-definition.ts";
import {
  readBoundedText,
  RequestBodyTooLargeError,
} from "./request-body.ts";
import {
  resolveLearnerIdentity,
  type AccountIdentity,
} from "./request-identity.ts";

export type LearnerProfilesEnv = {
  MULTI_LEARNER_PROFILES_ENABLED?: string;
};

const MAX_ROSTER_BODY_BYTES = 8 * 1024;
const PREFERRED_NAME_MAX_LENGTH = LEARNER_PROFILE_QUESTIONNAIRE.questions.find(
  ({ answerKey }) => answerKey === "name",
)!.maxLength;

class LearnerProfilesApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly responseMessage: string;

  constructor(
    status: number,
    code: string,
    responseMessage: string,
  ) {
    super(code);
    this.status = status;
    this.code = code;
    this.responseMessage = responseMessage;
  }
}

function json(payload: unknown, init?: ResponseInit) {
  return Response.json(payload, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) },
  });
}

async function roster(database: Database, identity: AccountIdentity) {
  const resolution = await resolveLearnerIdentity(database, identity);
  const profiles = await database
    .select({
      id: learnerProfile.id,
      name: learnerProfile.name,
      age: learnerProfile.age,
      profileStatus: learnerProfile.profileStatus,
      createdAt: learnerProfile.createdAt,
    })
    .from(learnerProfile)
    .where(eq(learnerProfile.authUserId, identity.userId))
    .orderBy(asc(learnerProfile.createdAt), asc(learnerProfile.id));

  return {
    activeProfileId:
      resolution.status === "selected"
        ? resolution.identity.learnerProfileId
        : null,
    profiles: profiles.map(({ id, name, age, profileStatus, createdAt }) => ({
      id,
      name: name?.trim() || "Learner",
      age,
      profileStatus,
      createdAt: createdAt.toISOString(),
    })),
  };
}

async function readPreferredName(request: Request) {
  let text: string;
  try {
    text = await readBoundedText(request, MAX_ROSTER_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      throw new LearnerProfilesApiError(
        413,
        "payload_too_large",
        "The request body is too large.",
      );
    }
    throw error;
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new LearnerProfilesApiError(400, "invalid_json", "Please send valid JSON.");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new LearnerProfilesApiError(
      400,
      "invalid_request",
      "Please send exactly one preferred name.",
    );
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 1 || typeof body.name !== "string") {
    throw new LearnerProfilesApiError(
      400,
      "invalid_request",
      "Please send exactly one preferred name.",
    );
  }

  const name = body.name.normalize("NFKC").trim();
  if (!name) {
    throw new LearnerProfilesApiError(
      400,
      "invalid_name",
      "Please enter a preferred name.",
    );
  }
  if (name.length > PREFERRED_NAME_MAX_LENGTH) {
    throw new LearnerProfilesApiError(
      400,
      "invalid_name",
      `Please use ${PREFERRED_NAME_MAX_LENGTH} characters or fewer.`,
    );
  }
  if (containsPrivateLearnerProfileDetails(name)) {
    throw new LearnerProfilesApiError(
      400,
      "private_profile_details",
      PRIVATE_PROFILE_FIELD_ERROR,
    );
  }
  if (containsLikelyFullLearnerName(name)) {
    throw new LearnerProfilesApiError(
      400,
      "preferred_name_required",
      PREFERRED_NAME_FIELD_ERROR,
    );
  }
  return name;
}

function selectedProfileId(pathname: string) {
  const match = /^\/api\/learner-profiles\/([^/]+)\/active$/.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]) || null;
  } catch {
    return null;
  }
}

export async function handleLearnerProfilesRequest(input: {
  database: Database;
  env: LearnerProfilesEnv;
  identity: AccountIdentity;
  request: Request;
}): Promise<Response> {
  const url = new URL(input.request.url);

  if (
    url.pathname === "/api/learner-profiles" &&
    input.request.method === "GET"
  ) {
    return json(await roster(input.database, input.identity));
  }

  if (input.env.MULTI_LEARNER_PROFILES_ENABLED !== "1") {
    return json({ error: "not_found" }, { status: 404 });
  }

  try {
    if (
      url.pathname === "/api/learner-profiles" &&
      input.request.method === "POST"
    ) {
      const name = await readPreferredName(input.request);
      await resolveLearnerIdentity(input.database, input.identity);
      const profileId = crypto.randomUUID();
      const now = new Date();
      await input.database.batch([
        input.database.insert(learnerProfile).values({
          id: profileId,
          authUserId: input.identity.userId,
          legacyStorageOwner: false,
          name,
        }),
        input.database
          .insert(sessionLearnerSelection)
          .values({
            sessionId: input.identity.sessionId,
            authUserId: input.identity.userId,
            learnerProfileId: profileId,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: sessionLearnerSelection.sessionId,
            set: {
              authUserId: input.identity.userId,
              learnerProfileId: profileId,
              updatedAt: now,
            },
          }),
      ] as const);
      return json(await roster(input.database, input.identity));
    }

    if (input.request.method === "PUT") {
      const profileId = selectedProfileId(url.pathname);
      if (!profileId) return json({ error: "not_found" }, { status: 404 });
      const now = Date.now();
      const result = await input.database.$client
        .prepare(
          `INSERT INTO session_learner_selection (
             session_id, auth_user_id, learner_profile_id, created_at, updated_at
           )
           SELECT ?, auth_user_id, id, ?, ?
           FROM learner_profile
           WHERE id = ? AND auth_user_id = ?
           ON CONFLICT(session_id) DO UPDATE SET
             auth_user_id = excluded.auth_user_id,
             learner_profile_id = excluded.learner_profile_id,
             updated_at = excluded.updated_at`,
        )
        .bind(
          input.identity.sessionId,
          now,
          now,
          profileId,
          input.identity.userId,
        )
        .run();
      if (Number(result.meta.changes ?? 0) !== 1) {
        return json({ error: "not_found" }, { status: 404 });
      }
      return json(await roster(input.database, input.identity));
    }
  } catch (error) {
    if (error instanceof LearnerProfilesApiError) {
      return json(
        { error: error.code, message: error.responseMessage },
        { status: error.status },
      );
    }
    throw error;
  }

  return json({ error: "not_found" }, { status: 404 });
}
