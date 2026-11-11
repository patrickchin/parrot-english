import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { LessonState } from '../lesson-state';
import { newDubId, saveDub, storageError, type RestoredDub } from '../dub-store';
import type { Pack } from '../pack';
import { autosaveView, transitionAutosave, type AutosaveState, type DubSnapshot } from '../autosave-state';

export function useDubAutosave(pack: Pack, slug: string, lesson: LessonState, initial: RestoredDub | undefined, source?: Blob) {
  const [identity, setIdentity] = useState(() => ({ id: initial?.saved.id ?? newDubId(), createdAt: initial?.saved.createdAt ?? Date.now() }));
  const [retry, setRetry] = useState(0);
  const operation = useRef(0);
  const queue = useRef(Promise.resolve());
  const persistenceRequested = useRef(false);
  // Overlays and playback do not write. Only accepted takes and lesson navigation do.
  const { step, roleId, lineIndex, progress } = lesson;
  const snapshot = useMemo<DubSnapshot | undefined>(() => step === 'choose' ? undefined : { ...identity, step, roleId, lineIndex, progress, source }, [identity, step, roleId, lineIndex, progress, source]);
  const [state, send] = useReducer(transitionAutosave, initial && snapshot
    ? { status: 'saved', checkpoint: { operation: 0, snapshot } } satisfies AutosaveState : { status: 'idle' } satisfies AutosaveState);
  const view = autosaveView(state, snapshot);
  useEffect(() => {
    if (!snapshot) { send({ type: 'RESET' }); return; }
    if (!view.dirty) return;
    if (!persistenceRequested.current) {
      persistenceRequested.current = true;
      void Promise.resolve().then(() => navigator.storage?.persist?.()).catch(() => false);
    }
    const id = ++operation.current;
    send({ type: 'SAVE', operation: id, snapshot });
    const save = queue.current.catch(() => {}).then(() => saveDub(snapshot.id, snapshot.createdAt, slug, pack, { ...snapshot, overlay: 'none' }, snapshot.source));
    queue.current = save.then(() => {}, () => {});
    void save.then(() => send({ type: 'SAVED', operation: id, snapshot }), error => send({ type: 'FAILED', operation: id, error: storageError(error) }));
  }, [pack, slug, snapshot, retry, view.dirty]);
  return { ...view, id: identity.id, retry: () => setRetry(n => n + 1), startNew: () => setIdentity({ id: newDubId(), createdAt: Date.now() }) };
}
