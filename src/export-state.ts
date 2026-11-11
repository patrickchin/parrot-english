export type ExportState =
  | { status: 'idle' }
  | { status: 'exporting'; operation: number; percent: number }
  | { status: 'ready'; url: string }
  | { status: 'error'; error: string };
export type ExportEvent =
  | { type: 'RESET' }
  | { type: 'START'; operation: number }
  | { type: 'PROGRESS'; operation: number; percent: number }
  | { type: 'READY'; operation: number; url: string }
  | { type: 'FAILED'; operation: number; error: string };

export function transitionExport(state: ExportState, event: ExportEvent): ExportState {
  if (event.type === 'RESET') return { status: 'idle' };
  if (event.type === 'START') return { status: 'exporting', operation: event.operation, percent: 0 };
  if (state.status !== 'exporting' || state.operation !== event.operation) return state;
  switch (event.type) {
    case 'PROGRESS': return Number.isFinite(event.percent) ? { ...state, percent: Math.min(100, Math.max(state.percent, Math.floor(event.percent))) } : state;
    case 'READY': return { status: 'ready', url: event.url };
    case 'FAILED': return { status: 'error', error: event.error };
  }
}
