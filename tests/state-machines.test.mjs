import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLesson, lessonTakes, transitionLesson } from '../src/lesson-state.ts';
import { waitForVideo } from '../src/video-events.ts';

test('lesson keeps line dispositions exclusive, wraps unfinished lines, and resets without stale takes', async () => {
  const scene = JSON.parse(await readFile('tests/fixtures/sintel/scene.json', 'utf8'));
  let state = createLesson(scene);
  const send = event => { state = transitionLesson(state, event, scene); };
  const lines = scene.lines.filter(line => line.roleId === state.roleId);
  const take = { blob: new Blob(['take']), duration: 1, start: 0, peaks: [0.2] };
  send({ type: 'START' });
  send({ type: 'CHOOSE_LINE', index: lines.length - 1 });
  send({ type: 'NEXT' });
  assert.equal(state.progress[lines.at(-1).id].status, 'skipped');
  assert.equal(state.step, 'practice');
  assert.equal(state.lineIndex, 0, 'last line wraps to the first unfinished line');
  send({ type: 'SAVE_TAKE', id: lines[0].id, take });
  for (let i = 0; i < lines.length; i++) send({ type: 'NEXT' });
  assert.equal(state.step, 'result');
  assert.deepEqual(lessonTakes(state.progress), { [lines[0].id]: take });
  send({ type: 'CHOOSE_LINE', index: lines.length - 1 });
  send({ type: 'SAVE_TAKE', id: lines.at(-1).id, take });
  assert.equal(state.progress[lines.at(-1).id].status, 'recorded', 'recording replaces skipped disposition');
  const roleId = state.roleId;
  send({ type: 'SELECT_ROLE', roleId: scene.roles.find(role => role.id !== roleId).id });
  assert.equal(state.roleId, roleId, 'role cannot change during practice');
  send({ type: 'OPEN_OVERLAY', overlay: 'reset' });
  send({ type: 'CLOSE_OVERLAY' });
  assert.equal(state.progress[lines[0].id].status, 'recorded', 'cancelling reset keeps takes');
  send({ type: 'RESET' });
  send({ type: 'SAVE_TAKE', id: lines[0].id, take });
  assert.deepEqual(lessonTakes(state.progress), {}, 'late save cannot repopulate a reset lesson');
  assert.equal(state.step, 'choose');
  assert.ok(Object.values(state.progress).every(line => line.status === 'unattempted'));
});

test('video startup times out, aborts, and follows playing rather than a delayed play promise', async () => {
  const video = new EventTarget();
  const abort = new AbortController();
  await assert.rejects(waitForVideo(video, 'playing', abort.signal, { start: () => new Promise(() => {}), timeout: 5 }), /errors\.seekTimeout/);
  const waiting = waitForVideo(video, 'seeked', abort.signal);
  abort.abort();
  await assert.rejects(waiting, { name: 'AbortError' });
  const signal = new AbortController().signal;
  let rejectPlay, lateError;
  const playing = waitForVideo(video, 'playing', signal, {
    start: () => new Promise((_resolve, reject) => { rejectPlay = reject; }),
    onLateError: error => { lateError = error; },
  });
  video.dispatchEvent(new Event('playing'));
  await playing;
  rejectPlay(new Error('late failure'));
  await Promise.resolve();
  assert.equal(lateError.message, 'late failure');
  const failedReady = waitForVideo(video, 'playing', signal, {
    onReady: () => { throw new Error('audio scheduling failed'); },
  });
  video.dispatchEvent(new Event('playing'));
  await assert.rejects(failedReady, /audio scheduling failed/);
});
