import { DUB_ID } from "./dub-script.ts";

const GUARDIAN_CONSENT_VERSION = "guardian-voice-r2-v1" as const;

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

function requireOk(response: Response, fallback: string) {
  if (!response.ok) throw new Error(fallback);
  return response;
}

export const getDubLineAudioUrl = (lineId: string) =>
  `/api/dubs/${DUB_ID}/lines/${encodeURIComponent(lineId)}/audio`;

export async function loadDubStatus(options: DubRequestOptions = {}) {
  const response = await (options.fetch ?? globalThis.fetch)(
    `/api/dubs/${DUB_ID}`,
    {
      credentials: "same-origin",
      signal: options.signal,
    },
  );
  return (await requireOk(
    response,
    "Your saved dub could not be loaded.",
  ).json()) as DubStatus;
}

export async function saveDubLine(
  lineId: string,
  blob: Blob,
  options: DubRequestOptions = {},
) {
  const response = await (options.fetch ?? globalThis.fetch)(
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
  );
  if (!response.ok) {
    throw new Error(
      response.status === 413
        ? "That recording is too long. Try the line again."
        : "Your take was not saved. Try again.",
    );
  }
  return response.json() as Promise<{ recordedAt: string }>;
}

export async function deleteDub(options: DubRequestOptions = {}) {
  const response = await (options.fetch ?? globalThis.fetch)(
    `/api/dubs/${DUB_ID}`,
    {
      credentials: "same-origin",
      method: "DELETE",
      signal: options.signal,
    },
  );
  requireOk(response, "Your saved dub was not deleted.");
}
