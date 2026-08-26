import { DUB_ID } from "./dub-script.ts";
import { notifyGuardianAccessRequired } from "../auth/guardian-access-api.ts";

const GUARDIAN_CONSENT_VERSION = "guardian-voice-r2-v2" as const;
const LOAD_FAILURE = "Your saved dub could not be loaded.";
const SAVE_FAILURE = "Your take was not saved. Try again.";
const DELETE_FAILURE = "Your saved dub was not deleted.";

export type DubStatus = {
  complete: boolean;
  consentState: "granted" | "not_granted" | "revoking";
  dubId: typeof DUB_ID;
  guardianConsentVersion: typeof GUARDIAN_CONSENT_VERSION;
  lines: Array<{ id: string; recordedAt: string | null; saved: boolean }>;
  recordingEnabled: boolean;
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

export class DubTakeRejectedError extends Error {
  readonly code = "dub_take_rejected" as const;

  constructor(message = "That recording is too long. Try the line again.") {
    super(message);
    this.name = "DubTakeRejectedError";
  }
}

export class DubNotEnabledError extends Error {
  readonly code = "dubbing_not_enabled" as const;

  constructor() {
    super("Voice dubbing is not turned on right now.");
    this.name = "DubNotEnabledError";
  }
}

export async function dubConsentLossError(response: Response) {
  if (response.status !== 403 && response.status !== 409) return null;
  const body: unknown = await response.clone().json().catch(() => null);
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    (body.error === "dubbing_not_enabled" ||
      body.error === "dub_consent_revoking")
  ) {
    return new DubNotEnabledError();
  }
  return null;
}

function requireOk(response: Response, fallback: string) {
  if (!response.ok) throw new Error(fallback);
  return response;
}

async function notifyGuardianAccessRequiredForResponse(response: Response) {
  if (response.status !== 403) return;
  const body: unknown = await response.clone().json().catch(() => null);
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    body.error === "guardian_required"
  ) {
    notifyGuardianAccessRequired();
  }
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
    (status.consentState === "granted" ||
      status.consentState === "not_granted" ||
      status.consentState === "revoking") &&
    status.dubId === DUB_ID &&
    status.guardianConsentVersion === GUARDIAN_CONSENT_VERSION &&
    Array.isArray(status.lines) &&
    typeof status.recordingEnabled === "boolean" &&
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
      },
      method: "PUT",
      signal: options.signal,
    },
    SAVE_FAILURE,
  );
  if (!response.ok) {
    const consentLoss = await dubConsentLossError(response);
    if (consentLoss) throw consentLoss;
    if (response.status === 413) throw new DubTakeRejectedError();
    if (response.status === 400 || response.status === 415) {
      const body: unknown = await response.clone().json().catch(() => null);
      if (
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        (body.error === "audio_required" || body.error === "unsupported_audio")
      ) {
        throw new DubTakeRejectedError(
          "That recording did not work. Record the line again.",
        );
      }
    }
    throw new Error(SAVE_FAILURE);
  }
  const result = await parseJson(response, SAVE_FAILURE);
  if (!isSaveResult(result)) throw new Error(SAVE_FAILURE);
  return result;
}

export async function grantDubConsent(options: DubRequestOptions = {}) {
  const response = await requestResponse(
    options.fetch ?? globalThis.fetch,
    `/api/dubs/${DUB_ID}/consent`,
    {
      body: JSON.stringify({ accepted: true, consentVersion: GUARDIAN_CONSENT_VERSION }),
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      method: "PUT",
      signal: options.signal,
    },
    "Voice dubbing could not be turned on.",
  );
  await notifyGuardianAccessRequiredForResponse(response);
  requireOk(response, "Voice dubbing could not be turned on.");
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
  await notifyGuardianAccessRequiredForResponse(response);
  requireOk(response, DELETE_FAILURE);
}
