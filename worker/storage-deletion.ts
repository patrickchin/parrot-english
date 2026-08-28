import {
  fenceBody,
  hasState,
  isR2WriteRateError,
  MAX_R2_WRITE_ATTEMPTS,
  retryDelay,
} from "./dub-storage.ts";

export type StorageDeletionBucket = Pick<
  R2Bucket,
  "delete" | "head" | "list" | "put"
>;
export type StorageDeletionWait = (delay: number) => Promise<void>;

const MAX_FENCE_CONFLICTS = 16;
const MAX_PARALLEL_FENCE_WRITES = 4;

export async function deleteWithRetry(
  bucket: Pick<R2Bucket, "delete">,
  keys: string[],
  wait: StorageDeletionWait,
) {
  for (let attempt = 0; attempt < MAX_R2_WRITE_ATTEMPTS; attempt += 1) {
    try {
      await bucket.delete(keys);
      return;
    } catch (error) {
      if (!isR2WriteRateError(error) || attempt === MAX_R2_WRITE_ATTEMPTS - 1) {
        throw error;
      }
      await wait(retryDelay(attempt));
    }
  }
}

function conditionalWrite(object: R2Object | null) {
  return object ? { etagMatches: object.etag } : { etagDoesNotMatch: "*" };
}

export async function persistFence(
  bucket: Pick<R2Bucket, "head" | "put">,
  key: string,
  kind: "marker" | "slot",
  generation: string,
  state: string,
  wait: StorageDeletionWait,
  terminalStates: readonly string[] = [],
) {
  let rateFailures = 0;
  for (let conflict = 0; conflict < MAX_FENCE_CONFLICTS; conflict += 1) {
    const current = await bucket.head(key);
    if (
      (current && hasState(current, generation, state)) ||
      (current?.customMetadata?.state &&
        terminalStates.includes(current.customMetadata.state))
    ) {
      return;
    }
    try {
      const stored = await bucket.put(key, fenceBody(kind, generation, state), {
        customMetadata: { generation, state },
        onlyIf: conditionalWrite(current),
      });
      if (stored) return;
    } catch (error) {
      if (!isR2WriteRateError(error)) throw error;
      const latest = await bucket.head(key);
      if (
        (latest && hasState(latest, generation, state)) ||
        (latest?.customMetadata?.state &&
          terminalStates.includes(latest.customMetadata.state))
      ) {
        return;
      }
      rateFailures += 1;
      if (rateFailures >= MAX_R2_WRITE_ATTEMPTS) throw error;
      await wait(retryDelay(rateFailures - 1));
    }
  }
  throw new Error("Storage-deletion fence contention exceeded.");
}

export async function runBoundedFenceWrites(
  tasks: Array<() => Promise<void>>,
) {
  let nextTask = 0;
  let failed = false;
  let failure: unknown;

  async function worker() {
    while (!failed) {
      const taskIndex = nextTask;
      nextTask += 1;
      const task = tasks[taskIndex];
      if (!task) return;
      try {
        await task();
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(MAX_PARALLEL_FENCE_WRITES, tasks.length) },
      () => worker(),
    ),
  );
  if (failed) throw failure;
}
