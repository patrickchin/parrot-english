import { and, asc, eq, isNull } from "drizzle-orm";
import {
  learnerProfile,
  learnerProfileDeletionTombstone,
  sessionLearnerSelection,
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
  prepareLearnerDeletion,
} from "./learner-deletion.ts";
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
  activeProfileId?: string | null,
) {
  const resolution =
    activeProfileId === undefined
      ? await resolveLearnerIdentity(database, identity)
      : null;
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
      activeProfileId !== undefined
        ? activeProfileId
        : resolution?.status === "selected"
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

async function currentProfileId(
  database: Database,
  identity: AccountIdentity,
) {
  const [selected] = await database
    .select({ id: learnerProfile.id })
    .from(sessionLearnerSelection)
    .innerJoin(
      learnerProfile,
      and(
        eq(sessionLearnerSelection.learnerProfileId, learnerProfile.id),
        eq(sessionLearnerSelection.authUserId, learnerProfile.authUserId),
      ),
    )
    .leftJoin(
      learnerProfileDeletionTombstone,
      eq(
        learnerProfileDeletionTombstone.learnerProfileId,
        learnerProfile.id,
      ),
    )
    .where(
      and(
        eq(sessionLearnerSelection.sessionId, identity.sessionId),
        eq(sessionLearnerSelection.authUserId, identity.userId),
        isNull(learnerProfileDeletionTombstone.learnerProfileId),
      ),
    )
    .limit(1);
  return selected?.id ?? null;
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
    !(
      (keys.length === 1 && keys[0] === "name") ||
      (keys.length === 2 &&
        keys.includes("name") &&
        keys.includes("activate") &&
        typeof body.activate === "boolean")
    )
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
  return { activate: body.activate !== false, name };
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

function deletedProfileId(pathname: string) {
  const match = /^\/api\/learner-profiles\/([^/]+)$/.exec(pathname);
  if (!match) return null;
  try {
    const profileId = decodeURIComponent(match[1]);
    if (
      !profileId ||
      profileId.includes("/") ||
      new TextEncoder().encode(profileId).byteLength > 128
    ) {
      return null;
    }
    return profileId;
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
      const { activate, name } = await readLearnerCreation(input.request);
      const previousProfileId = activate
        ? null
        : await currentProfileId(input.database, input.identity);
      if (activate) {
        await resolveLearnerIdentity(input.database, input.identity);
      }
      const profileId = crypto.randomUUID();
      const createProfile = input.database.$client
        .prepare(
          `INSERT INTO learner_profile (
             id, auth_user_id, legacy_storage_owner, name,
             created_at, updated_at
           )
           SELECT ?, ?, 0, ?, next_created_at, next_created_at
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
          input.identity.userId,
        );
      if (!activate) {
        await createProfile.run();
        const updatedRoster = await roster(
          input.database,
          input.identity,
          previousProfileId,
        );
        return json({ ...updatedRoster, createdProfileId: profileId });
      }

      const now = Date.now();
      await input.database.$client.batch([
        createProfile,
        input.database.$client
          .prepare(
            `INSERT INTO session_learner_selection (
               session_id, auth_user_id, learner_profile_id,
               created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(session_id) DO UPDATE SET
               auth_user_id = excluded.auth_user_id,
               learner_profile_id = excluded.learner_profile_id,
               updated_at = excluded.updated_at`,
          )
          .bind(
            input.identity.sessionId,
            input.identity.userId,
            profileId,
            now,
            now,
          ),
        input.database.$client
          .prepare(
            `DELETE FROM learner_selection_required
             WHERE session_id = ?`,
          )
          .bind(input.identity.sessionId),
      ]);
      const updatedRoster = await roster(input.database, input.identity);
      return json({ ...updatedRoster, createdProfileId: profileId });
    }

    if (input.request.method === "PUT") {
      const profileId = selectedProfileId(url.pathname);
      if (!profileId) return json({ error: "not_found" }, { status: 404 });
      const now = Date.now();
      const [result] = await input.database.$client.batch([
        input.database.$client.prepare(
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
        ),
        input.database.$client
          .prepare(
            `DELETE FROM learner_selection_required
             WHERE session_id = ?
               AND EXISTS (
                 SELECT 1 FROM session_learner_selection
                 WHERE session_id = ?
                   AND learner_profile_id = ?
                   AND auth_user_id = ?
               )
               AND NOT EXISTS (
                 SELECT 1 FROM learner_profile_deletion_tombstone
                 WHERE learner_profile_id = ?
               )`,
          )
          .bind(
            input.identity.sessionId,
            input.identity.sessionId,
            profileId,
            input.identity.userId,
            profileId,
          ),
      ]);
      if (result.results.length !== 1) {
        return json({ error: "not_found" }, { status: 404 });
      }
      return json(await roster(input.database, input.identity));
    }

    if (input.request.method === "DELETE") {
      const profileId = deletedProfileId(url.pathname);
      if (!profileId || !input.env.PRIVATE_MEDIA_BUCKET) {
        return json({ error: "not_found" }, { status: 404 });
      }
      await prepareLearnerDeletion({
        bucket: input.env.PRIVATE_MEDIA_BUCKET,
        database: input.database,
        identity: input.identity,
        profileId,
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
    throw error;
  }

  return json({ error: "not_found" }, { status: 404 });
}
