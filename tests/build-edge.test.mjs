import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

test('ESA serves only application assets and rejects content packs and media', async t => {
  const root = await mkdtemp(join(tmpdir(), 'parrotbook-edge-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'dist/assets'), { recursive: true });
  await mkdir(join(root, 'server'));
  await copyFile(new URL('../server/worker.mjs', import.meta.url), join(root, 'server/worker.mjs'));
  await Promise.all([
    writeFile(join(root, 'dist/index.html'), '<html>Parrotbook</html>'),
    writeFile(join(root, 'dist/assets/app.js'), 'console.log("Parrotbook");'),
  ]);
  const script = fileURLToPath(new URL('../scripts/build-edge.mjs', import.meta.url));
  const options = {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, GIT_DIR: execFileSync('git', ['rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).trim() },
  };
  execFileSync(process.execPath, [script], options);
  const { default: worker } = await import(pathToFileURL(join(root, 'build/edge-worker.mjs')).href);
  const get = path => worker.fetch(new Request('https://parrotbook.test' + path));
  const text = async response => {
    const bytes = Buffer.from(await response.arrayBuffer());
    return (response.headers.get('content-encoding') === 'gzip' ? gunzipSync(bytes) : bytes).toString();
  };
  assert.equal(await text(await get('/')), '<html>Parrotbook</html>');
  assert.equal(await text(await get('/assets/app.js')), 'console.log("Parrotbook");');
  assert.equal((await get('/scenes/example/scene.json')).status, 404);
  for (const file of ['scenes/example/scene.json', 'content/catalog.json', 'packs/pack_example/pack.json', 'assets/waveform-v2.json', 'assets/example.mp4']) {
    const path = join(root, 'dist', file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, '{}');
    const rejected = spawnSync(process.execPath, [script], options);
    assert.notEqual(rejected.status, 0, file);
    assert.match(rejected.stderr, /Keep (?:content packs|media) in object storage/, file);
    await rm(join(root, 'dist', file.split('/')[0]), { recursive: true, force: true });
  }
});
