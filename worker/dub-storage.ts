import {
  DUB_DEFINITIONS,
  DUB_ID,
} from "../src/dubbing/rhyme-catalog.ts";
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

type DubStorageClosure = {
  markerKeys: string[];
  slotKeys: string[];
};

export function objectPrefix(userId: string, dubId: string = DUB_ID) {
  // ponytail: shared private bucket; split when voice and art retention policies differ.
  return `personalized-story-art/${encodeURIComponent(userId)}/learner-dubs/${dubId}/`;
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

export function objectKey(userId: string, lineId: string, dubId: string = DUB_ID) {
  return `${objectPrefix(userId, dubId)}${lineId}.audio`;
}

export function markerKey(userId: string, dubId: string = DUB_ID) {
  return `${objectPrefix(userId, dubId)}${GENERATION_MARKER}`;
}

export function createDubStorageKeys(
  identity: Pick<
    LearnerIdentity,
    "userId" | "learnerProfileId" | "legacyStorageOwner"
  >,
  dubId: string = DUB_ID,
): DubStorageKeys {
  const prefix = identity.legacyStorageOwner
    ? objectPrefix(identity.userId, dubId)
    : `personalized-story-art/${encodeURIComponent(identity.userId)}/learners/${encodeURIComponent(identity.learnerProfileId)}/learner-dubs/${dubId}/`;
  const includeLegacyCleanup = identity.legacyStorageOwner && dubId === DUB_ID;
  return {
    markerKey: `${prefix}${GENERATION_MARKER}`,
    objectKey: (lineId) => `${prefix}${lineId}.audio`,
    objectPrefix: prefix,
    retiredLegacyMarkerKey: includeLegacyCleanup
      ? legacyMarkerKey(identity.userId)
      : null,
    retiredLegacyObjectKey: includeLegacyCleanup
      ? (lineId) => legacyObjectKey(identity.userId, lineId)
      : () => null,
  };
}

export function dubStorageClosureKeys(storage: DubStorageKeys): DubStorageClosure;
export function dubStorageClosureKeys(
  storage: DubStorageKeys,
  definitions: typeof DUB_DEFINITIONS,
): DubStorageClosure;
export function dubStorageClosureKeys(
  storage: DubStorageKeys,
  definitions: typeof DUB_DEFINITIONS | number = DUB_DEFINITIONS,
): DubStorageClosure {
  const catalog = typeof definitions === "number" ? DUB_DEFINITIONS : definitions;
  const definition = catalog.find(({ id }) =>
    storage.objectPrefix.endsWith(`/learner-dubs/${id}/`)
  );
  if (!definition) {
    throw new Error("Dub storage prefix did not match a supported definition.");
  }
  const markerKeys = [storage.markerKey];
  const slotKeys = definition.lines.map(({ id }) => storage.objectKey(id));
  if (storage.retiredLegacyMarkerKey) {
    markerKeys.push(storage.retiredLegacyMarkerKey);
    for (const lineId of LEGACY_DUB_LINE_IDS) {
      const key = storage.retiredLegacyObjectKey(lineId);
      if (key) slotKeys.push(key);
    }
  }
  return { markerKeys, slotKeys };
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
