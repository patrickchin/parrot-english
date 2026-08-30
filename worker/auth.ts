import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous, captcha } from "better-auth/plugins";
import { AUTH_TURNSTILE_ACTION } from "../lib/auth-captcha.ts";
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
  TURNSTILE_SECRET_KEY?: string;
  PERSONALIZED_STORY_ART_BUCKET: R2Bucket;
}

interface AuthDependencies {
  prepareAccountDeletion: typeof prepareAccountDeletion;
}

function requireEnvironmentValue(
  env: AuthEnv,
  key: "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL" | "TURNSTILE_SECRET_KEY"
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

export function createAuth(
  env: AuthEnv,
  dependencies: Partial<AuthDependencies> = {},
) {
  const secret = requireAuthSecret(env);
  const baseURL = requireEnvironmentValue(env, "BETTER_AUTH_URL");
  const turnstileSecret = requireEnvironmentValue(
    env,
    "TURNSTILE_SECRET_KEY",
  );
  const database = createDatabase(env.DB);
  const accountDeletion =
    dependencies.prepareAccountDeletion ?? prepareAccountDeletion;
  const prepareUserDataForDeletion = async (userId: string) => {
    const bucket = env.PERSONALIZED_STORY_ART_BUCKET;
    if (!bucket) {
      throw new Error(
        "PERSONALIZED_STORY_ART_BUCKET is required to delete an account.",
      );
    }
    await accountDeletion({ bucket, database, userId });
  };

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
    plugins: [
      anonymous({
        generateName: () => "Guest",
        onLinkAccount: ({ anonymousUser }) =>
          prepareUserDataForDeletion(anonymousUser.user.id),
      }),
      captcha({
        endpoints: ["/sign-in/anonymous", "/sign-up/email"],
        expectedAction: AUTH_TURNSTILE_ACTION,
        provider: "cloudflare-turnstile",
        secretKey: turnstileSecret,
      }),
    ],
    rateLimit: {
      enabled: true,
    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: (user) => prepareUserDataForDeletion(user.id),
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
