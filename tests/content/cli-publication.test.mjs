import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { refreshCatalog } from '../../scripts/content.mjs';

const cli = fileURLToPath(new URL('../../scripts/content.mjs', import.meta.url));

test('refresh invocation preparation needs no credentials, source content, or cloud calls', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'parrotbook-refresh-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const guard = join(folder, 'forbid-fetch.mjs'), destination = join(folder, 'refresh.json');
  await writeFile(guard, "globalThis.fetch = () => { throw new Error('Unexpected cloud request'); };\n");
  const env = { ...process.env };
  delete env.OWNER_API_URL; delete env.OWNER_API_TOKEN;
  const run = args => spawnSync(process.execPath, ['--import', guard, cli, ...args], { cwd: folder, env, encoding: 'utf8' });
  const result = run(['publish', '--refresh-catalog', '--invocation-file', destination]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Prepared invocation:/);
  assert.doesNotMatch(result.stdout, /Published/);
  assert.deepEqual(JSON.parse(await readFile(destination, 'utf8')), {
    rawPath: '/catalog/refresh', requestContext: { http: { method: 'POST' } },
    headers: { 'Content-Type': 'application/json' }, body: '{}', isBase64Encoded: false,
  });
  assert.deepEqual((await readdir(folder)).sort(), ['forbid-fetch.mjs', 'refresh.json']);
  const repeated = run(['publish', '--refresh-catalog', '--invocation-file', destination]);
  assert.notEqual(repeated.status, 0, 'preparation must not overwrite an existing file');
  assert.match(repeated.stderr, /EEXIST/);
});

test('refresh CLI rejects incompatible or incomplete options before preparing an invocation', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'parrotbook-refresh-options-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const destination = join(folder, 'refresh.json');
  for (const args of [
    ['publish', '--invocation-file', destination],
    ['publish', '--refresh-catalog', '--replace-catalog'],
    ['stage', '--refresh-catalog'],
    ['validate', '--invocation-file', destination],
    ['publish', '--refresh-catalog', 'content'],
    ['publish', '--refresh-catalog', '--invocation-file'],
    ['publish', '--refresh-catalog', '--invocation-file', '--replace-catalog'],
    ['publish', '--refresh-catalog', '--invocation-file', destination, '--invocation-file', destination],
    ['publish', '--refresh-catalog', '--unknown'],
  ]) {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: folder, encoding: 'utf8' });
    assert.notEqual(result.status, 0, args.join(' '));
    assert.doesNotMatch(result.stdout, /Prepared invocation|Published|Refreshed/);
  }
  assert.deepEqual(await readdir(folder), []);
});

test('catalog refresh calls the protected owner service once without reuploading packs', async t => {
  const originalFetch = globalThis.fetch, originalUrl = process.env.OWNER_API_URL, originalToken = process.env.OWNER_API_TOKEN;
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of [['OWNER_API_URL', originalUrl], ['OWNER_API_TOKEN', originalToken]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  process.env.OWNER_API_URL = 'https://owner.example.test'; process.env.OWNER_API_TOKEN = 'test-owner-token';
  const requests = [], expected = { packCount: 21, sceneCount: 128 };
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return Response.json(expected);
  };
  assert.deepEqual(await refreshCatalog(), expected);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://owner.example.test/catalog/refresh');
  assert.equal(requests[0].options.method, 'POST');
  assert.deepEqual(requests[0].options.headers, { Authorization: 'Bearer test-owner-token', 'Content-Type': 'application/json' });
  assert.equal(requests[0].options.body, '{}');
  assert.equal(requests[0].options.redirect, 'error');
});
