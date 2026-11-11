import test from 'node:test';
import assert from 'node:assert/strict';
import { lineWindow } from '../src/line-window.ts';

test('practice has half a second of context; retained voices share gaps without covering neighboring turns', () => {
  const lines = [{ id: 'line_before', start: 0, end: 1 }, { id: 'line_short', start: 1.7, end: 2.32 }, { id: 'line_after', start: 5, end: 6 }];
  const pack = { duration: 6, lines };
  assert.deepEqual(lineWindow(pack, lines[1]), { start: 1.2, end: 2.82, voiceStart: 1.35, voiceEnd: 2.82 });
  assert.equal(lineWindow(pack, lines[0]).voiceEnd, lineWindow(pack, lines[1]).voiceStart);
  assert.equal(lineWindow(pack, lines[0]).start, 0);
  assert.equal(lineWindow(pack, lines[2]).end, 6);
  lines[2].start = 2.32;
  assert.equal(lineWindow(pack, lines[1]).end, 2.32, 'practice never plays the next speaker');
  assert.equal(lineWindow(pack, lines[1]).voiceEnd, 2.32);
  assert.equal(lineWindow(pack, lines[2]).voiceStart, 2.32);
});
