import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as schema from "../src/db/schema.ts";
import { prepareAccountDeletion } from "./account-deletion.ts";
import { createDatabase } from "./database.ts";
import { PUBLIC_APP_ORIGIN } from "./public-origin.ts";

const PR_PREVIEW_ORIGIN_PATTERN =
  "https://*-parrot-english.p-ch.workers.dev";

export interface AuthEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  PERSONALIZED_STORY_ART_BUCKET: R2Bucket;
}

function requireEnvironmentValue(
  env: AuthEnv,
  key: "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL"
) {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required to configure Better Auth.`);
  }

  return value;
}

function requireAuthSecret(env: AuthEnv) {
  const secret = requireEnvironmentValue(env, "BETTER_AUTH_SECRET");
  if (secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters long.");
  }

  return secret;
}

export function createAuth(env: AuthEnv) {
  const secret = requireAuthSecret(env);
  const baseURL = requireEnvironmentValue(env, "BETTER_AUTH_URL");
  const database = createDatabase(env.DB);

  return betterAuth({
    appName: "Parrot English",
    baseURL,
    trustedOrigins: [PUBLIC_APP_ORIGIN, PR_PREVIEW_ORIGIN_PATTERN],
    secret,
    database: drizzleAdapter(database, {
      provider: "sqlite",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    rateLimit: {
      enabled: true,
    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          const bucket = env.PERSONALIZED_STORY_ART_BUCKET;
          if (!bucket) {
            throw new Error(
              "PERSONALIZED_STORY_ART_BUCKET is required to delete an account.",
            );
          }
          await prepareAccountDeletion({
            bucket,
            database,
            userId: user.id,
          });
        },
      },
    },
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip"],
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
