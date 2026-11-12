import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appChanged, shouldDeploy, deployApp } from '../scripts/app-deployment.mjs';

const eventCommit = 'a'.repeat(40), newerCommit = 'b'.repeat(40);
const success = { Status: 'succeed', CommitId: newerCommit, Branch: 'main', ProductionBranch: 'main', RoutineName: 'parrotbook-prototype' };

test('content and known authoring changes skip deployment while unknown and application paths deploy', () => {
  const content = Array.from({ length: 1500 }, (_, i) => `content/scenes/scene-${i}.json`);
  assert.equal(shouldDeploy([...content, 'docs/content-packs.md', 'README.md', 'scripts/content.mjs', 'scripts/prepare-tv-scenes.mjs']), false);
  for (const path of ['src/App.tsx', 'server/worker.mjs', 'public/favicon.ico', 'package.json', 'package-lock.json', '.github/workflows/deploy-app.yml', 'scripts/build-edge.mjs', 'scripts/prepare-something-new.mjs', 'unknown-file', 'content/../src/App.tsx']) {
    assert.equal(shouldDeploy([...content, path]), true, path);
  }
});

test('change detection reads every Git path, preserves unusual names, and notices moves out of application code', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'parrotbook-deployment-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE']) delete env[key];
  const run = args => execFileSync('git', args, { cwd: folder, encoding: 'utf8', env });
  run(['init', '--quiet']);
  const commit = () => {
    run(['add', '--all']);
    run(['-c', 'user.name=Deployment test', '-c', 'user.email=deployment@example.com', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'test']);
    return run(['rev-parse', 'HEAD']).trim();
  };
  await mkdir(join(folder, 'src'));
  await writeFile(join(folder, 'src/App.tsx'), 'application');
  const before = commit();
  await mkdir(join(folder, 'content'));
  await Promise.all(Array.from({ length: 350 }, (_, i) => writeFile(join(folder, `content/${i}.json`), '{}')));
  await writeFile(join(folder, 'content/unusual\nname.json'), '{}');
  const contentOnly = commit();
  assert.equal(appChanged(before, contentOnly, run), false);
  await writeFile(join(folder, 'src/App.tsx'), 'updated application');
  const mixed = commit();
  assert.equal(appChanged(before, mixed, run), true);
  await rename(join(folder, 'src/App.tsx'), join(folder, 'content/moved.tsx'));
  assert.equal(appChanged(mixed, commit(), run), true);
});

test('unavailable or unsafe event commits fail toward deployment without becoming Git options or shell code', () => {
  for (const before of [undefined, '', '0'.repeat(40), '--output=somewhere', '$(touch /tmp/unwanted)', eventCommit + '\n--name-only']) {
    assert.equal(appChanged(before, newerCommit, () => assert.fail('Unsafe input must not invoke Git.')), true);
  }
  assert.equal(appChanged(eventCommit, '--help', () => assert.fail('Unsafe input must not invoke Git.')), true);
  assert.equal(appChanged(eventCommit, newerCommit, () => { throw new Error('History unavailable'); }), true);
  assert.equal(appChanged(eventCommit, newerCommit, args => {
    assert.deepEqual(args, ['diff', '--no-renames', '--name-only', '-z', eventCommit, newerCommit, '--']);
    return 'content/a.json\0docs/b.md\0';
  }), false);
});

function harness(overrides = {}) {
  let time = 0;
  const calls = [], gitCalls = [];
  const options = {
    expectedCommit: eventCommit, ref: 'refs/heads/main',
    run: args => { gitCalls.push(args); return ''; },
    call: async (action, parameters) => {
      calls.push([action, parameters]);
      return action === 'CreateRoutineBuild' ? { RoutineBuildId: 42 } : success;
    },
    fetchHealth: async () => new Response(JSON.stringify({ ok: true, revision: newerCommit })),
    now: () => time, wait: async ms => { time += ms; }, log: () => {},
    buildTimeout: 40, cleanupTimeout: 20, healthTimeout: 30, interval: 10,
    ...overrides,
  };
  return { options, calls, gitCalls };
}

test('a queued main event can build a newer main commit and waits for that actual production revision', async () => {
  const state = harness();
  let reads = 0, healthReads = 0;
  const result = await deployApp({ ...state.options,
    call: async (action, parameters) => {
      state.calls.push([action, parameters]);
      if (action === 'CreateRoutineBuild') return { RoutineBuildId: 42 };
      if (++reads === 1) throw new Error('Temporary API error');
      return reads === 2 ? { Status: 'building' } : success;
    },
    fetchHealth: async () => new Response(JSON.stringify({ ok: true, revision: ++healthReads === 1 ? eventCommit : newerCommit })),
  });
  assert.deepEqual(result, { buildId: '42', revision: newerCommit });
  assert.deepEqual(state.calls[0], ['CreateRoutineBuild', { RoutineName: 'parrotbook-prototype', Branch: 'main' }]);
  assert.equal(healthReads, 2);
  assert.ok(state.gitCalls.some(args => args.join(' ') === `merge-base --is-ancestor ${eventCommit} ${newerCommit}`));
  assert.ok(state.gitCalls.some(args => args.join(' ') === `merge-base --is-ancestor ${newerCommit} refs/remotes/origin/main`));
});

test('non-main requests, failed builds, wrong branches and absent live revisions cannot report success', async () => {
  await assert.rejects(deployApp(harness({ ref: 'refs/heads/feature', call: () => assert.fail('Must not request a build') }).options), /Only a valid main/);
  for (const response of [{ ...success, Status: 'failed' }, { ...success, Branch: 'feature' }]) {
    await assert.rejects(deployApp(harness({ call: async action => action === 'CreateRoutineBuild' ? { RoutineBuildId: 42 } : response }).options), /failed|unexpected production build/);
  }
  await assert.rejects(deployApp(harness({ fetchHealth: async () => new Response(JSON.stringify({ ok: true, revision: eventCommit })) }).options), /Production health did not reach/);
  await assert.rejects(deployApp(harness({ call: async () => { throw new Error('Trigger failed'); } }).options), /Trigger failed/);
  const invalidHistory = harness({ run: args => {
    if (args[0] === 'merge-base') throw new Error('Commit not on main');
  } });
  await assert.rejects(deployApp(invalidHistory.options), /Commit not on main/);
  assert.deepEqual(invalidHistory.calls, []);
});

test('a build timeout stops only its own task and checks terminal status before releasing the job', async () => {
  const calls = [];
  let stopped = false, terminalChecked = false;
  const state = harness({ call: async (action, parameters) => {
    calls.push([action, parameters]);
    if (action === 'CreateRoutineBuild') return { RoutineBuildId: 42 };
    if (action === 'StopRoutineBuild') { stopped = true; return {}; }
    if (stopped) { terminalChecked = true; return { Status: 'canceled' }; }
    return { Status: 'building' };
  } });
  await assert.rejects(deployApp(state.options), /timed out \(canceled\)/);
  assert.equal(terminalChecked, true);
  assert.deepEqual(calls.find(([action]) => action === 'StopRoutineBuild'), ['StopRoutineBuild', { RoutineBuildId: '42' }]);
});
