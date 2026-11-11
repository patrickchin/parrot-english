export type Activity = 'preview' | 'recording' | 'replay' | 'listening';
export type Preparation = 'microphone' | 'worklet' | 'audio' | 'decoding' | 'backing' | 'video' | 'capture' | 'playing';
export type MediaState =
  | { phase: 'idle'; error: string }
  | { phase: 'loading'; operation: number; activity: Activity; stage: Preparation }
  | { phase: Activity | 'saving'; operation: number };

type PreparationEvent = 'MICROPHONE_GRANTED' | 'WORKLET_READY' | 'AUDIO_READY' | 'TAKES_READY' | 'BACKING_READY' | 'USE_ORIGINAL' | 'VIDEO_READY' | 'CAPTURE_READY' | 'PLAYING';
export type MediaEvent =
  | { type: 'START'; operation: number; activity: Activity }
  | { type: PreparationEvent | 'FINISH' | 'SAVED'; operation: number }
  | { type: 'STOP'; error?: string }
  | { type: 'CLEAR_ERROR' };

export const idleMedia: MediaState = { phase: 'idle', error: '' };

// Side effects stay in useDubbing. Only the current operation can advance this
// machine; a late permission response, decode, or worklet message cannot revive it.
export function transitionMedia(state: MediaState, event: MediaEvent): MediaState {
  if (event.type === 'START') return {
    phase: 'loading', operation: event.operation, activity: event.activity,
    stage: event.activity === 'recording' ? 'microphone' : event.activity === 'preview' ? 'video' : 'audio',
  };
  if (event.type === 'STOP') return { phase: 'idle', error: event.error ?? (state.phase === 'idle' ? state.error : '') };
  if (event.type === 'CLEAR_ERROR') return state.phase === 'idle' ? idleMedia : state;
  if (state.phase === 'idle' || state.operation !== event.operation) return state;
  if (event.type === 'FINISH') return state.phase === 'recording' ? { ...state, phase: 'saving' } : state;
  if (event.type === 'SAVED') return state.phase === 'saving' ? idleMedia : state;
  if (state.phase !== 'loading') return state;

  const { activity, stage } = state;
  let next: Preparation | undefined;
  switch (event.type) {
    case 'MICROPHONE_GRANTED': if (activity === 'recording' && stage === 'microphone') next = 'worklet'; break;
    case 'WORKLET_READY': if (activity === 'recording' && stage === 'worklet') next = 'audio'; break;
    case 'AUDIO_READY': if (stage === 'audio') next = activity === 'recording' ? 'video' : 'decoding'; break;
    case 'TAKES_READY': if (stage === 'decoding') next = 'backing'; break;
    case 'BACKING_READY': if (stage === 'backing') next = 'video'; break;
    case 'USE_ORIGINAL': if ((activity === 'replay' || activity === 'listening') && stage === 'audio') next = 'video'; break;
    case 'VIDEO_READY': if (stage === 'video') next = activity === 'recording' ? 'capture' : 'playing'; break;
    case 'CAPTURE_READY': if (activity === 'recording' && stage === 'capture') next = 'playing'; break;
    case 'PLAYING': if (stage === 'playing') return { phase: activity, operation: state.operation }; break;
  }
  return next ? { ...state, stage: next } : state;
}
