import type {
  LessonRecordingSaveResult,
  LessonRecordingSlot,
} from "./lesson-recording-api.ts";

type Save = (
  blob: Blob,
  slot: LessonRecordingSlot,
) => Promise<LessonRecordingSaveResult>;

type RecordingSnapshot = {
  pending: number;
  failed: number;
};

type RetainedFailure = {
  blob: Blob;
  slot: LessonRecordingSlot;
};

function slotKey(slot: LessonRecordingSlot): string {
  return JSON.stringify([slot.lessonId, slot.sceneIndex, slot.stepIndex]);
}

export function createLessonRecordingQueue({ save }: { save: Save }) {
  const tails = new Map<string, Promise<void>>();
  const failures = new Map<string, RetainedFailure>();
  const generations = new Map<string, number>();
  const listeners = new Set<() => void>();
  let pending = 0;
  let currentSnapshot: RecordingSnapshot = { pending: 0, failed: 0 };

  function publish() {
    if (
      currentSnapshot.pending === pending &&
      currentSnapshot.failed === failures.size
    ) {
      return;
    }
    currentSnapshot = { pending, failed: failures.size };
    for (const listener of listeners) listener();
  }

  function enqueue(slot: LessonRecordingSlot, blob: Blob): void {
    const key = slotKey(slot);
    const generation = (generations.get(key) ?? 0) + 1;
    generations.set(key, generation);
    failures.delete(key);
    pending += 1;
    publish();
    const previous = tails.get(key) ?? Promise.resolve();
    const tail = previous
      .catch(() => undefined)
      .then(async () => {
        try {
          await save(blob, slot);
          if (generations.get(key) === generation) {
            failures.delete(key);
            publish();
          }
        } catch {
          if (generations.get(key) === generation) {
            failures.set(key, { blob, slot });
            publish();
          }
        } finally {
          pending -= 1;
          publish();
        }
      });
    tails.set(key, tail);
  }

  async function retryFailed(): Promise<RecordingSnapshot> {
    const retained = [...failures.entries()];
    for (const [key, entry] of retained) {
      failures.delete(key);
      publish();
      enqueue(entry.slot, entry.blob);
    }
    await settle();
    return currentSnapshot;
  }

  async function settle(): Promise<RecordingSnapshot> {
    await Promise.all(tails.values());
    return currentSnapshot;
  }

  return {
    enqueue,
    retryFailed,
    settle,
    snapshot: () => currentSnapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
