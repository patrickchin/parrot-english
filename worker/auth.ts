import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { captcha } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { AUTH_TURNSTILE_ACTION } from "../lib/auth-captcha.ts";
import { SHARED_GUEST_USER_ID } from "../lib/shared-guest.ts";
import * as schema from "../src/db/schema.ts";
import { prepareAccountDeletion } from "./account-deletion.ts";
import { createDatabase } from "./database.ts";
import { accountPrivateMediaPrefix } from "./private-media-storage.ts";
import { PUBLIC_APP_ORIGIN } from "./public-origin.ts";
import { normalizeUserEmail } from "./request-identity.ts";
import { sharedGuestAuth } from "./shared-guest-auth.ts";

const PR_PREVIEW_ORIGIN_PATTERN = "https://*-parrot-english.p-ch.workers.dev";

export interface AuthEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  TURNSTILE_SECRET_KEY?: string;
  PRIVATE_MEDIA_BUCKET: R2Bucket;
}

interface AuthDependencies {
  prepareAccountDeletion: typeof prepareAccountDeletion;
}

function requireEnvironmentValue(
  env: AuthEnv,
  key: "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL" | "TURNSTILE_SECRET_KEY",
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
  const turnstileSecret = requireEnvironmentValue(env, "TURNSTILE_SECRET_KEY");
  const database = createDatabase(env.DB);
  const accountDeletion =
    dependencies.prepareAccountDeletion ?? prepareAccountDeletion;
  const prepareUserDataForDeletion = async (userId: string) => {
    const bucket = env.PRIVATE_MEDIA_BUCKET;
    if (!bucket) {
      throw new Error(
        "PRIVATE_MEDIA_BUCKET is required to delete an account.",
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
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const email = normalizeUserEmail(user.email);
            const [reservation] = await database
              .select({ userIdHash: schema.accountDeletionTombstone.userIdHash })
              .from(schema.accountDeletionTombstone)
              .where(
                eq(
                  schema.accountDeletionTombstone.r2Prefix,
                  accountPrivateMediaPrefix(email),
                ),
              )
              .limit(1);
            if (reservation) {
              throw APIError.fromStatus("UNPROCESSABLE_ENTITY", {
                code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
                message: "Please use a different email address.",
              });
            }
            return { data: { ...user, email } };
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [
      sharedGuestAuth(),
      captcha({
        endpoints: ["/sign-in/shared-guest", "/sign-up/email"],
        expectedAction: AUTH_TURNSTILE_ACTION,
        provider: "cloudflare-turnstile",
        secretKey: turnstileSecret,
      }),
    ],
    rateLimit: {
      enabled: true,
    },
    user: {
      changeEmail: { enabled: false },
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          if (user.id === SHARED_GUEST_USER_ID) {
            throw APIError.fromStatus("FORBIDDEN", {
              code: "SHARED_GUEST_DELETE_FORBIDDEN",
              message: "The shared guest account cannot be deleted.",
            });
          }
          await prepareUserDataForDeletion(user.id);
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
