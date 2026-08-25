import { asc, eq } from "drizzle-orm";
import { learnerProfile } from "../src/db/schema.ts";
import type { Database } from "./database.ts";
import {
  resolveLearnerIdentity,
  type AccountIdentity,
} from "./request-identity.ts";

export type LearnerProfilesEnv = {
  MULTI_LEARNER_PROFILES_ENABLED?: string;
};

function json(payload: unknown, init?: ResponseInit) {
  return Response.json(payload, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) },
  });
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
    const resolution = await resolveLearnerIdentity(
      input.database,
      input.identity,
    );
    const profiles = await input.database
      .select({
        id: learnerProfile.id,
        name: learnerProfile.name,
        age: learnerProfile.age,
        profileStatus: learnerProfile.profileStatus,
        createdAt: learnerProfile.createdAt,
      })
      .from(learnerProfile)
      .where(eq(learnerProfile.authUserId, input.identity.userId))
      .orderBy(asc(learnerProfile.createdAt), asc(learnerProfile.id));

    return json({
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
    });
  }

  if (input.env.MULTI_LEARNER_PROFILES_ENABLED !== "1") {
    return json({ error: "not_found" }, { status: 404 });
  }

  return json({ error: "not_found" }, { status: 404 });
}
