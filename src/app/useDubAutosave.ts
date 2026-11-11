import { useEffect, useRef, useState } from 'react';
import type { LessonState } from '../lesson-state';
import { newDubId, saveDub, storageError, type RestoredDub } from '../dub-store';
import type { Pack } from '../pack';

export function useDubAutosave(pack: Pack, slug: string, lesson: LessonState, initial: RestoredDub | undefined, source?: Blob) {
  const [identity, setIdentity] = useState(() => ({ id: initial?.saved.id ?? newDubId(), createdAt: initial?.saved.createdAt ?? Date.now() }));
  const [state, setState] = useState<{ status: 'idle' | 'saving' | 'saved' | 'error'; error?: string }>({ status: initial ? 'saved' : 'idle' });
  const [retry, setRetry] = useState(0);
  const queue = useRef(Promise.resolve());
  const persistenceRequested = useRef(false);
  // Overlays and playback do not write. Only accepted takes and lesson navigation do.
  const { step, roleId, lineIndex, progress } = lesson;
  const checkpoint = useRef(initial ? { id: identity.id, step, roleId, lineIndex, progress, source } : undefined);
  const saved = checkpoint.current;
  const dirty = step !== 'choose' && (!saved || saved.id !== identity.id || saved.step !== step || saved.roleId !== roleId || saved.lineIndex !== lineIndex || saved.progress !== progress || saved.source !== source);
  useEffect(() => {
    if (step === 'choose') { setState({ status: 'idle' }); return; }
    if (!dirty) return;
    if (!persistenceRequested.current) {
      persistenceRequested.current = true;
      void Promise.resolve().then(() => navigator.storage?.persist?.()).catch(() => false);
    }
    let active = true;
    setState({ status: 'saving' });
    const save = queue.current.catch(() => {}).then(() => saveDub(identity.id, identity.createdAt, slug, pack, { step, roleId, lineIndex, progress, overlay: 'none' }, source));
    queue.current = save.then(() => {}, () => {});
    void save.then(() => { if (active) { checkpoint.current = { id: identity.id, step, roleId, lineIndex, progress, source }; setState({ status: 'saved' }); } }, error => { if (active) setState({ status: 'error', error: storageError(error) }); });
    return () => { active = false; };
  }, [pack, slug, identity, step, roleId, lineIndex, progress, source, retry, dirty]);
  return { ...state, status: dirty && state.status !== 'error' ? 'saving' as const : state.status, dirty, id: identity.id, retry: () => setRetry(n => n + 1), startNew: () => setIdentity({ id: newDubId(), createdAt: Date.now() }) };
}
