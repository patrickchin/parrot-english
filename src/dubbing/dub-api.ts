import { notifyGuardianAccessRequired } from "../auth/guardian-access-api.ts";
import { getDubDefinition } from "./rhyme-catalog.ts";
import {
  DUB_PEAK_BARS_HEADER,
  isDubPeakBars,
  serializeDubPeakBars,
} from "./dub-waveform.ts";

const GUARDIAN_CONSENT_VERSION = "guardian-voice-r2-v2" as const;
const LOAD_FAILURE = "Your saved dub could not be loaded.";
const SAVE_FAILURE = "Your take was not saved. Try again.";
const DELETE_FAILURE =
  "Your saved nursery-rhyme voice clips were not deleted.";

export type DubStatus = {
  consentState: "granted" | "not_granted" | "revoking";
  dubId: string;
  guardianConsentVersion: typeof GUARDIAN_CONSENT_VERSION;
  lines: Array<{
    id: string;
    peakBars?: readonly number[] | null;
    recordedAt: string | null;
    saved: boolean;
  }>;
};

export type DubRequestOptions = {
  fetch?: typeof globalThis.fetch;
  learnerProfileId?: string;
  signal?: AbortSignal;
};

type DubResourceRequestOptions = DubRequestOptions & {
  dubId: string;
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

function isDubStatus(value: unknown, expectedDubId: string): value is DubStatus {
  if (typeof value !== "object" || value === null) return false;
  const status = value as Partial<DubStatus>;
  if (status.dubId !== expectedDubId) return false;
  let definition;
  try {
    definition = getDubDefinition(expectedDubId);
  } catch {
    return false;
  }
  const expectedLineIds = definition.lines.map(({ id }) => id);
  return (
    (status.consentState === "granted" ||
      status.consentState === "not_granted" ||
      status.consentState === "revoking") &&
    status.guardianConsentVersion === GUARDIAN_CONSENT_VERSION &&
    Array.isArray(status.lines) &&
    status.lines.length === expectedLineIds.length &&
    status.lines.every((line, index) =>
      typeof line === "object" &&
      line !== null &&
      typeof line.id === "string" &&
      line.id === expectedLineIds[index] &&
      typeof line.saved === "boolean" &&
      (line.recordedAt === null || typeof line.recordedAt === "string") &&
      (
        !("peakBars" in line)
        || line.peakBars === null
        || isDubPeakBars(line.peakBars)
      )
    )
  );
}

function isSaveResult(value: unknown): value is {
  peakBars?: readonly number[] | null;
  recordedAt: string;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "recordedAt" in value &&
    typeof value.recordedAt === "string" &&
    (
      !("peakBars" in value)
      || value.peakBars === null
      || isDubPeakBars(value.peakBars)
    )
  );
}

function appendLearnerProfileTarget(
  path: string,
  learnerProfileId: string | undefined,
) {
  if (learnerProfileId === undefined) return path;
  return `${path}?${new URLSearchParams({ learnerProfileId })}`;
}

export const getDubLineAudioUrl = (
  lineId: string,
  { dubId, learnerProfileId }: Pick<
    DubResourceRequestOptions,
    "dubId" | "learnerProfileId"
  >,
) =>
  appendLearnerProfileTarget(
    `/api/dubs/${dubId}/lines/${encodeURIComponent(lineId)}/audio`,
    learnerProfileId,
  );

export async function loadDubStatus(options: DubResourceRequestOptions) {
  const { dubId } = options;
  getDubDefinition(dubId);
  const response = await requestResponse(
    options.fetch ?? globalThis.fetch,
    appendLearnerProfileTarget(
      `/api/dubs/${dubId}`,
      options.learnerProfileId,
    ),
    {
      credentials: "same-origin",
      signal: options.signal,
    },
    LOAD_FAILURE,
  );
  await notifyGuardianAccessRequiredForResponse(response);
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
  if (!isDubStatus(status, dubId)) throw new Error(LOAD_FAILURE);
  return status;
}

export async function saveDubLine(
  lineId: string,
  blob: Blob,
  options: DubResourceRequestOptions & {
    peakBars?: readonly number[] | null;
  },
) {
  const { dubId } = options;
  getDubDefinition(dubId);
  const serializedPeakBars = options.peakBars == null
    ? null
    : serializeDubPeakBars(options.peakBars);
  if (options.peakBars != null && !serializedPeakBars) {
    throw new Error(SAVE_FAILURE);
  }
  const headers: Record<string, string> = {
    "Content-Type": blob.type,
  };
  if (serializedPeakBars) headers[DUB_PEAK_BARS_HEADER] = serializedPeakBars;
  const response = await requestResponse(
    options.fetch ?? globalThis.fetch,
    appendLearnerProfileTarget(
      `/api/dubs/${dubId}/lines/${encodeURIComponent(lineId)}`,
      options.learnerProfileId,
    ),
    {
      body: blob,
      credentials: "same-origin",
      headers,
      method: "PUT",
      signal: options.signal,
    },
    SAVE_FAILURE,
  );
  await notifyGuardianAccessRequiredForResponse(response);
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
    appendLearnerProfileTarget(
      "/api/dubs/consent",
      options.learnerProfileId,
    ),
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

export async function deleteAllDubs(options: DubRequestOptions = {}) {
  const response = await requestResponse(
    options.fetch ?? globalThis.fetch,
    appendLearnerProfileTarget("/api/dubs", options.learnerProfileId),
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
