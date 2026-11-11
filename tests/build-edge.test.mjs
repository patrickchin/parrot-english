import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

test('ESA bundle serves current scene assets, omits obsolete waveforms, and still rejects media', async t => {
  const root = await mkdtemp(join(tmpdir(), 'parrotbook-edge-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sceneFolder = join(root, 'dist/scenes/example');
  await mkdir(sceneFolder, { recursive: true });
  await mkdir(join(root, 'dist/assets'));
  await mkdir(join(root, 'server'));
  await copyFile(new URL('../server/worker.mjs', import.meta.url), join(root, 'server/worker.mjs'));
  const scene = { title: '英语 🦜', waveform: 'waveform-current.json' };
  const wave = { version: 2, duration: 1, step: 0.005, peaks: Array(200).fill(0.125) };
  await Promise.all([
    writeFile(join(root, 'dist/index.html'), '<html>Parrotbook</html>'),
    writeFile(join(root, 'dist/assets/app.js'), 'console.log("Parrotbook");'),
    writeFile(join(sceneFolder, 'scene.json'), JSON.stringify(scene, null, 2)),
    writeFile(join(sceneFolder, scene.waveform), JSON.stringify(wave)),
    writeFile(join(sceneFolder, 'waveform-old-hash.json'), JSON.stringify(wave)),
    writeFile(join(sceneFolder, 'waveform-v2.json'), JSON.stringify(wave)),
  ]);
  const script = fileURLToPath(new URL('../scripts/build-edge.mjs', import.meta.url));
  const options = {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, GIT_DIR: execFileSync('git', ['rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).trim() },
  };
  execFileSync(process.execPath, [script], options);
  const { default: worker } = await import(pathToFileURL(join(root, 'build/edge-worker.mjs')).href);
  const get = (path, method = 'GET') => worker.fetch(new Request('https://parrotbook.test' + path, { method }));
  const text = async response => {
    const bytes = Buffer.from(await response.arrayBuffer());
    return (response.headers.get('content-encoding') === 'gzip' ? gunzipSync(bytes) : bytes).toString();
  };
  assert.equal(await text(await get('/')), '<html>Parrotbook</html>');
  assert.equal(await text(await get('/assets/app.js')), 'console.log("Parrotbook");');
  assert.deepEqual(JSON.parse(await text(await get('/scenes/example/scene.json'))), scene);
  assert.deepEqual(JSON.parse(await text(await get('/scenes/example/' + scene.waveform))), wave);
  assert.equal((await get('/scenes/example/' + scene.waveform, 'HEAD')).status, 200);
  for (const name of ['waveform-old-hash.json', 'waveform-v2.json']) {
    assert.equal((await get('/scenes/example/' + name)).status, 404);
  }
  await writeFile(join(sceneFolder, 'waveform-video.mp4'), 'media must stay in OSS');
  const rejected = spawnSync(process.execPath, [script], options);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /Keep media in object storage/);
});
