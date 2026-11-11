import type { Scene } from './scene';
import type { Take, Takes } from './useDubbing';

export type LineProgress = { status: 'unattempted' | 'skipped' } | { status: 'recorded'; take: Take };
export type LessonState = {
  step: 'choose' | 'practice' | 'result';
  roleId: string;
  lineIndex: number;
  progress: Record<string, LineProgress>;
  overlay: 'none' | 'help' | 'details' | 'reset';
};
export type LessonEvent =
  | { type: 'SELECT_ROLE'; roleId: string }
  | { type: 'START' | 'NEXT' | 'RESET' | 'CLOSE_OVERLAY' }
  | { type: 'CHOOSE_LINE'; index: number }
  | { type: 'SAVE_TAKE'; id: string; take: Take }
  | { type: 'OPEN_OVERLAY'; overlay: Exclude<LessonState['overlay'], 'none'> };

export function createLesson(scene: Scene): LessonState {
  return {
    step: 'choose', roleId: scene.roles.find(role => role.selectable !== false)!.id, lineIndex: 0,
    progress: Object.fromEntries(scene.lines.map(line => [line.id, { status: 'unattempted' }])), overlay: 'none',
  };
}

export function lessonTakes(progress: LessonState['progress']): Takes {
  return Object.fromEntries(Object.entries(progress).flatMap(([id, line]) => line.status === 'recorded' ? [[id, line.take]] : []));
}

export function transitionLesson(state: LessonState, event: LessonEvent, scene: Scene): LessonState {
  const lines = scene.lines.filter(line => line.roleId === state.roleId);
  switch (event.type) {
    case 'SELECT_ROLE':
      return state.step === 'choose' && scene.roles.some(role => role.id === event.roleId && role.selectable !== false)
        ? { ...state, roleId: event.roleId, lineIndex: 0 } : state;
    case 'START': return state.step === 'choose' ? { ...state, step: 'practice', lineIndex: 0 } : state;
    case 'CHOOSE_LINE': return state.step !== 'choose' && lines[event.index]
      ? { ...state, step: 'practice', lineIndex: event.index } : state;
    case 'SAVE_TAKE': return state.step === 'practice' && lines[state.lineIndex].id === event.id
      ? { ...state, progress: { ...state.progress, [event.id]: { status: 'recorded', take: event.take } } } : state;
    case 'NEXT': {
      if (state.step !== 'practice') return state;
      const id = lines[state.lineIndex].id;
      const progress = state.progress[id].status !== 'unattempted' ? state.progress : { ...state.progress, [id]: { status: 'skipped' } as const };
      if (state.lineIndex < lines.length - 1) return { ...state, progress, lineIndex: state.lineIndex + 1 };
      const remaining = lines.findIndex(line => progress[line.id].status === 'unattempted');
      return remaining < 0 ? { ...state, progress, step: 'result' } : { ...state, progress, lineIndex: remaining };
    }
    case 'RESET': return { ...createLesson(scene), roleId: state.roleId };
    case 'OPEN_OVERLAY': return { ...state, overlay: event.overlay };
    case 'CLOSE_OVERLAY': return { ...state, overlay: 'none' };
  }
}
