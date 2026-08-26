export type GuardianAccessState =
  | { mode: "learner" }
  | { mode: "guardian"; expiresAt: string };

export type GuardianAccessRequestOptions = {
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
};

export class GuardianAccessApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    status: number,
    code: string,
    message: string,
  ) {
    super(message);
    this.name = "GuardianAccessApiError";
    this.status = status;
    this.code = code;
  }
}

export const GUARDIAN_ACCESS_REQUIRED_EVENT = "guardian-access-required";

export function notifyGuardianAccessRequired() {
  if (typeof document === "undefined") return;
  document.dispatchEvent(new Event(GUARDIAN_ACCESS_REQUIRED_EVENT));
}

export function subscribeGuardianAccessRequired(listener: () => void) {
  if (typeof document === "undefined") return () => {};
  document.addEventListener(GUARDIAN_ACCESS_REQUIRED_EVENT, listener);
  return () =>
    document.removeEventListener(GUARDIAN_ACCESS_REQUIRED_EVENT, listener);
}

const INVALID_RESPONSE_MESSAGE =
  "Guardian access could not be checked. Please try again.";
const REQUEST_FAILED_MESSAGE =
  "The guardian access request could not be completed.";

function parseState(
  payload: unknown,
  status: number,
  expectedMode?: GuardianAccessState["mode"],
): GuardianAccessState {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new GuardianAccessApiError(
      status,
      "invalid_response",
      INVALID_RESPONSE_MESSAGE,
    );
  }
  const state = payload as { expiresAt?: unknown; mode?: unknown };
  if (state.mode === "learner" && expectedMode !== "guardian") {
    return { mode: "learner" };
  }
  if (
    expectedMode !== "learner" &&
    state.mode === "guardian" &&
    typeof state.expiresAt === "string" &&
    Number.isFinite(Date.parse(state.expiresAt))
  ) {
    return { mode: "guardian", expiresAt: state.expiresAt };
  }
  throw new GuardianAccessApiError(
    status,
    "invalid_response",
    INVALID_RESPONSE_MESSAGE,
  );
}

async function requestGuardianAccess(
  method: "GET" | "POST" | "DELETE",
  body: string | undefined,
  {
    fetch: request = globalThis.fetch,
    signal,
  }: GuardianAccessRequestOptions = {},
) {
  const response = await request("/api/guardian-access", {
    method,
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          body,
          headers: { "Content-Type": "application/json" },
        }),
    signal,
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    if (response.ok) {
      throw new GuardianAccessApiError(
        response.status,
        "invalid_response",
        INVALID_RESPONSE_MESSAGE,
      );
    }
    payload = null;
  }

  if (!response.ok) {
    const error =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as { error?: unknown; message?: unknown })
        : {};
    throw new GuardianAccessApiError(
      response.status,
      typeof error.error === "string" ? error.error : "request_failed",
      typeof error.message === "string"
        ? error.message
        : REQUEST_FAILED_MESSAGE,
    );
  }
  return parseState(
    payload,
    response.status,
    method === "DELETE" ? "learner" : undefined,
  );
}

export function loadGuardianAccess(options?: GuardianAccessRequestOptions) {
  return requestGuardianAccess("GET", undefined, options);
}

export function unlockGuardianAccess(
  password: string,
  options?: GuardianAccessRequestOptions,
) {
  return requestGuardianAccess(
    "POST",
    JSON.stringify({ password }),
    options,
  );
}

export function lockGuardianAccess(options?: GuardianAccessRequestOptions) {
  return requestGuardianAccess("DELETE", undefined, options);
}
