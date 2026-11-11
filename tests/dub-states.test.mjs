import test from 'node:test';
import assert from 'node:assert/strict';
import { autosaveView, transitionAutosave } from '../src/autosave-state.ts';
import { transitionExport } from '../src/export-state.ts';

test('autosave confirms only its requested snapshot and stale writes cannot settle a newer save', () => {
  const original = { id: 'dub_first', createdAt: 1, step: 'practice', roleId: 'role_first', lineIndex: 0, progress: {} };
  const next = { ...original, lineIndex: 1 };
  let state = { status: 'saved', checkpoint: { operation: 0, snapshot: original } };
  assert.deepEqual(autosaveView(state, next), { status: 'saving', dirty: true, error: '' });
  state = transitionAutosave(state, { type: 'SAVE', operation: 1, snapshot: next });
  assert.equal(autosaveView(state, original).dirty, true, 'returning to the old position must not leave while a different queued write can overwrite it');
  const newer = { ...next, progress: {} };
  state = transitionAutosave(state, { type: 'SAVE', operation: 2, snapshot: newer });
  assert.equal(transitionAutosave(state, { type: 'FAILED', operation: 1, error: 'old failure' }), state);
  state = transitionAutosave(state, { type: 'SAVED', operation: 1, snapshot: next });
  assert.equal(state.status, 'saving');
  assert.equal(state.operation, 2, 'the older completion cannot settle the newer request');
  state = transitionAutosave(state, { type: 'FAILED', operation: 2, error: 'quota exceeded' });
  assert.equal(state.checkpoint.snapshot, next, 'failure preserves what the previous write actually committed');
  assert.equal(autosaveView(state, original).dirty, true, 'the original position needs saving again after an intermediate commit');
  assert.deepEqual(autosaveView(state, newer), { status: 'error', dirty: true, error: 'quota exceeded' });
  assert.deepEqual(autosaveView(state, { ...newer, lineIndex: 2 }), { status: 'saving', dirty: true, error: '' }, 'a previous failure does not describe newer edits');
  state = transitionAutosave(state, { type: 'SAVE', operation: 3, snapshot: newer });
  state = transitionAutosave(state, { type: 'SAVED', operation: 3, snapshot: newer });
  assert.deepEqual(autosaveView(state, newer), { status: 'saved', dirty: false, error: '' });
  assert.equal(autosaveView(state, { ...newer, id: 'dub_second' }).dirty, true, 'a new attempt needs its own checkpoint');
  assert.equal(transitionAutosave(state, { type: 'SAVED', operation: 1, snapshot: next }), state, 'an older completion cannot roll back the durable checkpoint');
  state = transitionAutosave(state, { type: 'RESET' });
  assert.equal(transitionAutosave(state, { type: 'SAVED', operation: 3, snapshot: newer }), state);
  assert.deepEqual(autosaveView(state, undefined), { status: 'idle', dirty: false, error: '' });
});

test('export owns its result, keeps progress monotonic, and ignores cancelled or superseded callbacks', () => {
  let state = transitionExport({ status: 'idle' }, { type: 'START', operation: 1 });
  state = transitionExport(state, { type: 'PROGRESS', operation: 1, percent: 75 });
  assert.equal(transitionExport(state, { type: 'PROGRESS', operation: 1, percent: 20 }).percent, 75);
  assert.equal(transitionExport(state, { type: 'PROGRESS', operation: 1, percent: NaN }), state);
  const cancelled = transitionExport(state, { type: 'RESET' });
  for (const type of ['PROGRESS', 'READY', 'FAILED']) {
    const event = { type, operation: 1, percent: 100, url: 'blob:stale', error: 'late failure' };
    assert.equal(transitionExport(cancelled, event), cancelled);
    const replacement = transitionExport(cancelled, { type: 'START', operation: 2 });
    assert.equal(transitionExport(replacement, event), replacement);
  }
  state = transitionExport(cancelled, { type: 'START', operation: 3 });
  state = transitionExport(state, { type: 'READY', operation: 3, url: 'blob:current' });
  assert.deepEqual(state, { status: 'ready', url: 'blob:current' });
  assert.equal(transitionExport(state, { type: 'FAILED', operation: 3, error: 'late failure' }), state);
  state = transitionExport(state, { type: 'START', operation: 4 });
  state = transitionExport(state, { type: 'FAILED', operation: 4, error: 'encode failed' });
  assert.deepEqual(state, { status: 'error', error: 'encode failed' });
  assert.deepEqual(transitionExport(state, { type: 'START', operation: 5 }), { status: 'exporting', operation: 5, percent: 0 });
});
