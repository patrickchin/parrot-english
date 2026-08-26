import { DUB_ID } from "../src/dubbing/dub-script.ts";
import type { LearnerIdentity } from "./request-identity.ts";

const GENERATION_MARKER = ".dub-generation";
const FENCE_FORMAT = "parrot-dub-fence-v1";
const LEGACY_DUB_ID = "five-little-ducks-v1";

export const LEGACY_DUB_LINE_IDS = [
  "line-1",
  "line-2",
  "line-3",
  "line-4",
  "line-5",
  "line-6",
  "line-7",
  "line-8",
  "line-9",
] as const;

export const R2_WRITE_INTERVAL_MS = 1_050;
export const MAX_R2_WRITE_ATTEMPTS = 3;

export type DubStorageKeys = {
  markerKey: string;
  objectKey(lineId: string): string;
  objectPrefix: string;
  retiredLegacyMarkerKey: string | null;
  retiredLegacyObjectKey(lineId: string): string | null;
};

export function objectPrefix(userId: string) {
  // ponytail: shared private bucket; split when voice and art retention policies differ.
  return `personalized-story-art/${encodeURIComponent(userId)}/learner-dubs/${DUB_ID}/`;
}

export function legacyObjectPrefix(userId: string) {
  return `personalized-story-art/${encodeURIComponent(userId)}/learner-dubs/${LEGACY_DUB_ID}/`;
}

export function legacyObjectKey(userId: string, lineId: string) {
  return `${legacyObjectPrefix(userId)}${lineId}.audio`;
}

export function legacyMarkerKey(userId: string) {
  return `${legacyObjectPrefix(userId)}${GENERATION_MARKER}`;
}

export function objectKey(userId: string, lineId: string) {
  return `${objectPrefix(userId)}${lineId}.audio`;
}

export function markerKey(userId: string) {
  return `${objectPrefix(userId)}${GENERATION_MARKER}`;
}

export function createDubStorageKeys(
  identity: Pick<
    LearnerIdentity,
    "userId" | "learnerProfileId" | "legacyStorageOwner"
  >,
): DubStorageKeys {
  const prefix = identity.legacyStorageOwner
    ? objectPrefix(identity.userId)
    : `personalized-story-art/${encodeURIComponent(identity.userId)}/learners/${encodeURIComponent(identity.learnerProfileId)}/learner-dubs/${DUB_ID}/`;
  return {
    markerKey: `${prefix}${GENERATION_MARKER}`,
    objectKey: (lineId) => `${prefix}${lineId}.audio`,
    objectPrefix: prefix,
    retiredLegacyMarkerKey: identity.legacyStorageOwner
      ? legacyMarkerKey(identity.userId)
      : null,
    retiredLegacyObjectKey: identity.legacyStorageOwner
      ? (lineId) => legacyObjectKey(identity.userId, lineId)
      : () => null,
  };
}

export function fenceBody(
  kind: "marker" | "slot",
  generation: string,
  state: string,
) {
  return new TextEncoder().encode(
    JSON.stringify([FENCE_FORMAT, kind, generation, state]),
  );
}

export function hasState(
  object: R2Object,
  generation: string,
  state: string,
) {
  const metadata = object.customMetadata;
  return metadata?.generation === generation && metadata.state === state;
}

export function isR2WriteRateError(error: unknown) {
  return error instanceof Error && /\(10058\)\s*$/.test(error.message);
}

export function retryDelay(attempt: number) {
  return R2_WRITE_INTERVAL_MS + attempt * 100 + Math.floor(Math.random() * 100);
}
