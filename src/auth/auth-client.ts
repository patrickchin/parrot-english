import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  fetchOptions: {
    onError: ({ response }) => {
      // Status only: account URLs, request bodies and sessions contain private data.
      console.error(
        "Account API request failed",
        response.status,
        response.headers.get("content-type"),
      );
    },
  },
});
