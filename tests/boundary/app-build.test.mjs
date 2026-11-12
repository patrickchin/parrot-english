import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, symlink, writeFile, mkdir, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Run the real ESA gate in a temporary application snapshot. The editable
// content tree is deliberately absent; test fixtures remain available.
test('the application gate passes with invalid content and builds without the content tree', { timeout: 120000 }, async t => {
  const root = process.cwd();
  const folder = await mkdtemp(join(tmpdir(), 'parrotbook-app-boundary-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const inputs = ['src', 'server', 'scripts', 'tests', 'index.html', 'package.json', 'package-lock.json',
    'vite.config.ts', 'postcss.config.mjs', 'tsconfig.json', 'tsconfig.app.json', 'esa.jsonc', '.gitignore'];
  for (const path of inputs) await cp(join(root, path), join(folder, path), { recursive: true });
  // Keep Vite's temporary config output local while reusing installed dependencies.
  await mkdir(join(folder, 'node_modules'));
  for (const name of await readdir(join(root, 'node_modules'))) {
    if (name === '.vite-temp') continue;
    await symlink(join(root, 'node_modules', name), join(folder, 'node_modules', name));
  }
  await cp(join(root, '.github'), join(folder, '.github'), { recursive: true }).catch(error => { if (error.code !== 'ENOENT') throw error; });
  const options = { cwd: folder, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env } };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE']) delete options.env[key];
  // Node's runner marker otherwise suppresses tests in the child invocation.
  delete options.env.NODE_TEST_CONTEXT;
  execFileSync('git', ['init', '--quiet'], options);
  execFileSync('git', ['-c', 'user.name=Boundary test', '-c', 'user.email=boundary@example.com',
    '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '--allow-empty', '--quiet', '-m', 'Application boundary fixture'], options);
  await mkdir(join(folder, 'content'));
  await writeFile(join(folder, 'content/catalog.json'), 'invalid content deliberately cannot be parsed');
  const checks = execFileSync('npm', ['run', 'test:app'], options);
  assert.match(checks, /pass [1-9][0-9]*/);
  await rm(join(folder, 'content'), { recursive: true });
  const output = execFileSync('npm', ['run', 'build'], options);
  assert.match(output, /Built ESA application/);
  assert.ok((await readdir(join(folder, 'build'))).includes('edge-worker.mjs'));
});
