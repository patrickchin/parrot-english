import { DUB_ID } from "./dub-script.ts";

const GUARDIAN_CONSENT_VERSION = "guardian-voice-r2-v1" as const;
const LOAD_FAILURE = "Your saved dub could not be loaded.";
const SAVE_FAILURE = "Your take was not saved. Try again.";
const DELETE_FAILURE = "Your saved dub was not deleted.";

export type DubStatus = {
  complete: boolean;
  dubId: typeof DUB_ID;
  guardianConsentVersion: typeof GUARDIAN_CONSENT_VERSION;
  lines: Array<{ id: string; recordedAt: string | null; saved: boolean }>;
};

type DubRequestOptions = {
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
};

export class DubResetInProgressError extends Error {
  readonly code = "dub_reset_in_progress" as const;

  constructor() {
    super(
      "Deleting your saved dub was interrupted. Ask a grown-up to finish deleting it.",
    );
    this.name = "DubResetInProgressError";
  }
}

function requireOk(response: Response, fallback: string) {
  if (!response.ok) throw new Error(fallback);
  return response;
}

function friendlyFailure(error: unknown, message: string): never {
  if (error instanceof Error && error.name === "AbortError") throw error;
  throw new Error(message);
}

async function requestResponse(
  request: typeof globalThis.fetch,
  input: string,
  init: RequestInit,
  failure: string,
) {
  try {
    return await request(input, init);
  } catch (error) {
    friendlyFailure(error, failure);
  }
}

async function parseJson(response: Response, failure: string) {
  try {
    return await response.json() as unknown;
  } catch (error) {
    friendlyFailure(error, failure);
  }
}

function isDubStatus(value: unknown): value is DubStatus {
  if (typeof value !== "object" || value === null) return false;
  const status = value as Partial<DubStatus>;
  return (
    typeof status.complete === "boolean" &&
    status.dubId === DUB_ID &&
    status.guardianConsentVersion === GUARDIAN_CONSENT_VERSION &&
    Array.isArray(status.lines) &&
    status.lines.every((line) =>
      typeof line === "object" &&
      line !== null &&
      typeof line.id === "string" &&
      typeof line.saved === "boolean" &&
      (line.recordedAt === null || typeof line.recordedAt === "string")
    )
  );
}

function isSaveResult(value: unknown): value is { recordedAt: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "recordedAt" in value &&
    typeof value.recordedAt === "string"
  );
}

export const getDubLineAudioUrl = (lineId: string) =>
  `/api/dubs/${DUB_ID}/lines/${encodeURIComponent(lineId)}/audio`;

export async function loadDubStatus(options: DubRequestOptions = {}) {
  const response = await requestResponse(
    options.fetch ?? globalThis.fetch,
    `/api/dubs/${DUB_ID}`,
    {
      credentials: "same-origin",
      signal: options.signal,
    },
    LOAD_FAILURE,
  );
  if (response.status === 409) {
    const body: unknown = await response.clone().json().catch(() => null);
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      body.error === "dub_reset_in_progress"
    ) {
      throw new DubResetInProgressError();
    }
  }
  requireOk(response, LOAD_FAILURE);
  const status = await parseJson(response, LOAD_FAILURE);
  if (!isDubStatus(status)) throw new Error(LOAD_FAILURE);
  return status;
}

export async function saveDubLine(
  lineId: string,
  blob: Blob,
  options: DubRequestOptions = {},
) {
  const response = await requestResponse(
    options.fetch ?? globalThis.fetch,
    `/api/dubs/${DUB_ID}/lines/${encodeURIComponent(lineId)}`,
    {
      body: blob,
      credentials: "same-origin",
      headers: {
        "Content-Type": blob.type,
        "X-Parrot-Guardian-Consent-Version": GUARDIAN_CONSENT_VERSION,
      },
      method: "PUT",
      signal: options.signal,
    },
    SAVE_FAILURE,
  );
  if (!response.ok) {
    throw new Error(
      response.status === 413
        ? "That recording is too long. Try the line again."
        : SAVE_FAILURE,
    );
  }
  const result = await parseJson(response, SAVE_FAILURE);
  if (!isSaveResult(result)) throw new Error(SAVE_FAILURE);
  return result;
}

export async function deleteDub(options: DubRequestOptions = {}) {
  const response = await requestResponse(
    options.fetch ?? globalThis.fetch,
    `/api/dubs/${DUB_ID}`,
    {
      credentials: "same-origin",
      method: "DELETE",
      signal: options.signal,
    },
    DELETE_FAILURE,
  );
  requireOk(response, DELETE_FAILURE);
}
