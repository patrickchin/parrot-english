import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaSnapshot } from '../src/media-diagnostics.ts';

test('media diagnostics whitelist state before cleanup and tolerate unavailable output timestamps', () => {
  const video = { currentTime: 3, paused: false, seeking: true, readyState: 2, networkState: 2,
    ended: false, playbackRate: 1, muted: true, error: { code: 3, message: 'PRIVATE' },
    src: 'https://PRIVATE', currentSrc: 'blob:PRIVATE', title: 'PRIVATE' };
  const context = { currentTime: 8, state: 'running', sampleRate: 48000, baseLatency: 0.01, outputLatency: 0.1,
    getOutputTimestamp: () => ({ contextTime: 7.8, performanceTime: 100, extra: 'PRIVATE' }), recording: 'PRIVATE' };
  const snapshot = mediaSnapshot(video, context);
  assert.equal(snapshot.video.time, 3);
  assert.equal(snapshot.video.paused, false);
  assert.equal(snapshot.video.error, 3);
  assert.equal(snapshot.audio.outputTime, 7.8);
  assert.ok(!JSON.stringify(snapshot).includes('PRIVATE'));
  context.getOutputTimestamp = () => { throw new Error('Unavailable'); };
  assert.equal(mediaSnapshot(video, context).audio.outputTime, undefined);
  assert.equal(mediaSnapshot(null, null).audio, null);
});
