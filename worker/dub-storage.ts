import {
  DUB_DEFINITIONS,
} from "../src/dubbing/rhyme-catalog.ts";
import { learnerRecordingsPrefix } from "./private-media-storage.ts";
import type { LearnerIdentity } from "./request-identity.ts";

const GENERATION_MARKER = ".dub-generation";
const FENCE_FORMAT = "parrot-dub-fence-v1";

export const R2_WRITE_INTERVAL_MS = 1_050;
export const MAX_R2_WRITE_ATTEMPTS = 3;

export type DubStorageKeys = {
  markerKey: string;
  objectKey(lineId: string): string;
  objectPrefix: string;
};

type DubStorageClosure = {
  markerKeys: string[];
  slotKeys: string[];
};

export function createDubStorageKeys(
  identity: Pick<
    LearnerIdentity,
    "privateMediaName" | "userEmail"
  >,
  dubId: string,
): DubStorageKeys {
  const prefix = `${learnerRecordingsPrefix(identity)}nursery-rhymes/${dubId}/`;
  return {
    markerKey: `${prefix}${GENERATION_MARKER}`,
    objectKey: (lineId) => `${prefix}${lineId}.audio`,
    objectPrefix: prefix,
  };
}

export function dubStorageClosureKeys(
  storage: DubStorageKeys,
  definitions: typeof DUB_DEFINITIONS = DUB_DEFINITIONS,
): DubStorageClosure {
  const definition = definitions.find(({ id }) =>
    storage.objectPrefix.endsWith(`/nursery-rhymes/${id}/`)
  );
  if (!definition) {
    throw new Error("Dub storage prefix did not match a supported definition.");
  }
  const markerKeys = [storage.markerKey];
  const slotKeys = definition.lines.map(({ id }) => storage.objectKey(id));
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
