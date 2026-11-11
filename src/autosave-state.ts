import type { LessonState } from './lesson-state';

export type DubSnapshot = Pick<LessonState, 'roleId' | 'lineIndex' | 'progress'> & {
  id: string; createdAt: number; step: 'practice' | 'result'; source?: Blob;
};
type Checkpoint = { operation: number; snapshot: DubSnapshot };
export type AutosaveState =
  | { status: 'idle'; checkpoint?: undefined }
  | { status: 'saving'; operation: number; snapshot: DubSnapshot; checkpoint?: Checkpoint }
  | { status: 'saved'; checkpoint: Checkpoint }
  | { status: 'error'; snapshot: DubSnapshot; checkpoint?: Checkpoint; error: string };
export type AutosaveEvent =
  | { type: 'RESET' }
  | { type: 'SAVE'; operation: number; snapshot: DubSnapshot }
  | { type: 'SAVED'; operation: number; snapshot: DubSnapshot }
  | { type: 'FAILED'; operation: number; error: string };

function sameSnapshot(a: DubSnapshot | undefined, b: DubSnapshot | undefined) {
  return a === b || !!a && !!b && a.id === b.id && a.step === b.step && a.roleId === b.roleId &&
    a.lineIndex === b.lineIndex && a.progress === b.progress && a.source === b.source;
}

export function transitionAutosave(state: AutosaveState, event: AutosaveEvent): AutosaveState {
  if (event.type === 'RESET') return { status: 'idle' };
  if (event.type === 'SAVE') return { status: 'saving', operation: event.operation, snapshot: event.snapshot, checkpoint: state.checkpoint };
  if (event.type === 'SAVED') {
    if (state.status === 'idle' || event.operation <= (state.checkpoint?.operation ?? 0)) return state;
    const checkpoint = { operation: event.operation, snapshot: event.snapshot };
    // Queued writes still reach IndexedDB after newer edits. Track what actually
    // committed, while allowing only the latest request to settle its status.
    return state.status === 'saving' && state.operation === event.operation
      ? { status: 'saved', checkpoint } : { ...state, checkpoint };
  }
  if (state.status !== 'saving' || state.operation !== event.operation) return state;
  return { status: 'error', snapshot: state.snapshot, checkpoint: state.checkpoint, error: event.error };
}

// A lesson can change before its effect starts the next write. Never advertise
// an old checkpoint (or its error) as the outcome of the current lesson.
export function autosaveView(state: AutosaveState, snapshot: DubSnapshot | undefined) {
  if (!snapshot) return { status: 'idle' as const, dirty: false, error: '' };
  // A queued write could overwrite even a matching checkpoint before we leave.
  if (state.status === 'saving') return { status: 'saving' as const, dirty: true, error: '' };
  if (sameSnapshot(state.checkpoint?.snapshot, snapshot)) return { status: 'saved' as const, dirty: false, error: '' };
  if (state.status === 'error' && sameSnapshot(state.snapshot, snapshot)) return { status: 'error' as const, dirty: true, error: state.error };
  return { status: 'saving' as const, dirty: true, error: '' };
}
