import { DUB_ID } from "../src/dubbing/dub-script.ts";

const GENERATION_MARKER = ".dub-generation";
const FENCE_FORMAT = "parrot-dub-fence-v1";

export const R2_WRITE_INTERVAL_MS = 1_050;
export const MAX_R2_WRITE_ATTEMPTS = 3;

export function objectPrefix(userId: string) {
  // ponytail: shared private bucket; split when voice and art retention policies differ.
  return `personalized-story-art/${encodeURIComponent(userId)}/learner-dubs/${DUB_ID}/`;
}

export function objectKey(userId: string, lineId: string) {
  return `${objectPrefix(userId)}${lineId}.audio`;
}

export function markerKey(userId: string) {
  return `${objectPrefix(userId)}${GENERATION_MARKER}`;
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
