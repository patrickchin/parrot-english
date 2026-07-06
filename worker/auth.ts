import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as schema from "../src/db/schema.ts";
import { createDatabase } from "./database.ts";

const PR_PREVIEW_ORIGIN_PATTERN =
  "https://*-parrot-english.p-ch.workers.dev";

export interface AuthEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
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

  return betterAuth({
    appName: "Parrot English",
    baseURL,
    trustedOrigins: [PR_PREVIEW_ORIGIN_PATTERN],
    secret,
    database: drizzleAdapter(createDatabase(env.DB), {
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
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip"],
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
