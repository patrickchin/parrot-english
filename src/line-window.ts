import type { Line, Scene } from './scene';

// Show a natural lead-in, retain a little breathing room, and never include the
// next speaker in a practice clip. Split short gaps so adjacent takes cannot overlap.
export function lineWindow(scene: Pick<Scene, 'duration' | 'lines'>, line: Line) {
  const index = scene.lines.findIndex(turn => turn.id === line.id);
  const previous = scene.lines[index - 1], next = scene.lines[index + 1];
  const start = Math.max(0, line.start - 0.5);
  const end = Math.min(scene.duration, line.end + 0.5, next?.start ?? scene.duration);
  return {
    start, end,
    voiceStart: Math.max(start, previous ? (previous.end + line.start) / 2 : 0),
    voiceEnd: Math.min(end, next ? (line.end + next.start) / 2 : scene.duration),
  };
}
