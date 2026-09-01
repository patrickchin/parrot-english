import { APIError, type BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { parseUserOutput } from "better-auth/db";
import { SHARED_GUEST_USER_ID } from "../lib/shared-guest.ts";

export function sharedGuestAuth(): BetterAuthPlugin {
  return {
    id: "shared-guest",
    endpoints: {
      signInSharedGuest: createAuthEndpoint(
        "/sign-in/shared-guest",
        { method: "POST" },
        async (ctx) => {
          const user =
            await ctx.context.internalAdapter.findUserById(
              SHARED_GUEST_USER_ID,
            );
          if (!user) {
            throw APIError.fromStatus("INTERNAL_SERVER_ERROR", {
              code: "SHARED_GUEST_UNAVAILABLE",
              message: "Shared guest access is unavailable.",
            });
          }

          const session = await ctx.context.internalAdapter.createSession(
            user.id,
          );
          if (!session) {
            throw APIError.fromStatus("INTERNAL_SERVER_ERROR", {
              code: "SHARED_GUEST_SESSION_FAILED",
              message: "Shared guest access is unavailable.",
            });
          }

          await setSessionCookie(ctx, { session, user });
          return ctx.json({
            token: session.token,
            user: parseUserOutput(ctx.context.options, user),
          });
        },
      ),
    },
  };
}
