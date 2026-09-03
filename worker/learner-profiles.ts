import { asc, eq } from "drizzle-orm";
import {
  learnerProfile,
  learnerProfileDeletionTombstone,
} from "../src/db/schema.ts";
import {
  containsLikelyFullLearnerName,
  containsPrivateLearnerProfileDetails,
  PREFERRED_NAME_FIELD_ERROR,
  PRIVATE_PROFILE_FIELD_ERROR,
} from "../lib/learner-profile-privacy.ts";
import type { Database } from "./database.ts";
import {
  LearnerDeletionError,
  learnerDeletionUserIdHash,
  prepareLearnerDeletion,
} from "./learner-deletion.ts";
import { LEARNER_PROFILE_QUESTIONNAIRE } from "./learner-profile-definition.ts";
import {
  readBoundedText,
  RequestBodyTooLargeError,
} from "./request-body.ts";
import {
  availablePrivateMediaName,
  isLearnerNameConflict,
  learnerNameKey,
  LEARNER_NAME_CONFLICT_MESSAGE,
  parseLearnerProfileResource,
  resolveLearnerIdentity,
  type AccountIdentity,
} from "./request-identity.ts";

export type LearnerProfilesEnv = {
  PRIVATE_MEDIA_BUCKET: R2Bucket;
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

async function roster(
  database: Database,
  identity: AccountIdentity,
) {
  const resolution = await resolveLearnerIdentity(database, identity);
  const profiles = await database
    .select({
      id: learnerProfile.id,
      name: learnerProfile.name,
      age: learnerProfile.age,
      profileStatus: learnerProfile.profileStatus,
      createdAt: learnerProfile.createdAt,
      tombstoneProfileId: learnerProfileDeletionTombstone.learnerProfileId,
    })
    .from(learnerProfile)
    .leftJoin(
      learnerProfileDeletionTombstone,
      eq(
        learnerProfileDeletionTombstone.learnerProfileId,
        learnerProfile.id,
      ),
    )
    .where(eq(learnerProfile.authUserId, identity.userId))
    .orderBy(asc(learnerProfile.createdAt), asc(learnerProfile.id));

  return {
    activeProfileId:
      resolution.status === "selected"
        ? resolution.identity.learnerProfileId
        : null,
    profiles: profiles.map(
      ({ id, name, age, profileStatus, createdAt, tombstoneProfileId }) => ({
        id,
        name: name?.trim() || "Learner",
        age,
        profileStatus,
        createdAt: createdAt.toISOString(),
        deletionPending: tombstoneProfileId !== null,
      }),
    ),
  };
}

async function readLearnerCreation(request: Request) {
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
  const keys = Object.keys(body);
  if (
    typeof body.name !== "string" ||
    keys.length !== 1 ||
    keys[0] !== "name"
  ) {
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

  try {
    if (
      url.pathname === "/api/learner-profiles" &&
      input.request.method === "POST"
    ) {
      const name = await readLearnerCreation(input.request);
      const profileId = crypto.randomUUID();
      const privateMediaNames = await input.database
        .select({ value: learnerProfile.privateMediaName })
        .from(learnerProfile)
        .where(eq(learnerProfile.authUserId, input.identity.userId));
      const deletedPrivateMediaNames = await input.database
        .select({ value: learnerProfileDeletionTombstone.privateMediaName })
        .from(learnerProfileDeletionTombstone)
        .where(
          eq(
            learnerProfileDeletionTombstone.userIdHash,
            await learnerDeletionUserIdHash(input.identity.userId),
          ),
        );
      const privateMediaName = availablePrivateMediaName(
        name,
        [
          ...privateMediaNames.map(({ value }) => value),
          ...deletedPrivateMediaNames.map(({ value }) => value),
        ],
      );
      const createProfile = input.database.$client
        .prepare(
          `INSERT INTO learner_profile (
             id, auth_user_id, name, private_media_name, name_key,
             created_at, updated_at
           )
           SELECT ?, ?, ?, ?, ?, next_created_at, next_created_at
           FROM (
             SELECT max(
               cast(unixepoch('subsecond') * 1000 as integer),
               coalesce(max(created_at), 0) + 1
             ) AS next_created_at
             FROM learner_profile
             WHERE auth_user_id = ?
           )`,
        )
        .bind(
          profileId,
          input.identity.userId,
          name,
          privateMediaName,
          learnerNameKey(name),
          input.identity.userId,
        );
      await createProfile.run();
      const updatedRoster = await roster(input.database, input.identity);
      return json({ ...updatedRoster, createdProfileId: profileId });
    }

    if (input.request.method === "PUT") {
      const resource = parseLearnerProfileResource(url.pathname);
      if (resource?.action !== "active") {
        return json({ error: "not_found" }, { status: 404 });
      }
      const profileId = resource.learnerProfileId;
      const now = Date.now();
      const result = await input.database.$client.prepare(
          `INSERT INTO session_learner_selection (
             session_id, auth_user_id, learner_profile_id, created_at, updated_at
           )
           SELECT ?, auth_user_id, id, ?, ?
           FROM learner_profile
           WHERE id = ? AND auth_user_id = ?
             AND NOT EXISTS (
               SELECT 1 FROM learner_profile_deletion_tombstone
               WHERE learner_profile_id = learner_profile.id
             )
           ON CONFLICT(session_id) DO UPDATE SET
             auth_user_id = excluded.auth_user_id,
             learner_profile_id = excluded.learner_profile_id,
             updated_at = excluded.updated_at
           RETURNING learner_profile_id`,
        )
        .bind(
          input.identity.sessionId,
          now,
          now,
          profileId,
          input.identity.userId,
        )
        .all();
      if (result.results.length !== 1) {
        return json({ error: "not_found" }, { status: 404 });
      }
      return json(await roster(input.database, input.identity));
    }

    if (input.request.method === "DELETE") {
      const resource = parseLearnerProfileResource(url.pathname);
      if (
        resource?.action !== "details" ||
        !input.env.PRIVATE_MEDIA_BUCKET
      ) {
        return json({ error: "not_found" }, { status: 404 });
      }
      await prepareLearnerDeletion({
        bucket: input.env.PRIVATE_MEDIA_BUCKET,
        database: input.database,
        identity: input.identity,
        profileId: resource.learnerProfileId,
      });
      return json(await roster(input.database, input.identity));
    }
  } catch (error) {
    if (error instanceof LearnerProfilesApiError) {
      return json(
        { error: error.code, message: error.responseMessage },
        { status: error.status },
      );
    }
    if (error instanceof LearnerDeletionError) {
      return json({ error: error.code }, { status: error.status });
    }
    if (isLearnerNameConflict(error)) {
      return json(
        {
          error: "learner_name_conflict",
          message: LEARNER_NAME_CONFLICT_MESSAGE,
        },
        { status: 409 },
      );
    }
    throw error;
  }

  return json({ error: "not_found" }, { status: 404 });
}
