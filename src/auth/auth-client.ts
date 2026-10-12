import { createAuthClient } from "better-auth/react";
import { apiFetch } from "../shared/api-fetch.ts";

export const authClient = createAuthClient({ fetchOptions: { customFetchImpl: apiFetch } });
