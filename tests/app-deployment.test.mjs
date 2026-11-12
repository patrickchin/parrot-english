import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appChanged, shouldDeploy, advanceRelease, deployApp } from '../scripts/app-deployment.mjs';

const eventCommit = 'a'.repeat(40), newerCommit = 'b'.repeat(40);
const success = { Status: 'succeed', CommitId: newerCommit, Branch: 'release/player', ProductionBranch: 'release/player', RoutineName: 'parrotbook-prototype' };

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
    run: args => {
      gitCalls.push(args);
      if (args[0] === 'ls-remote') return `${eventCommit}\trefs/heads/release/player\n`;
      if (args[0] === 'rev-parse') return args[1].endsWith('/main') ? newerCommit : eventCommit;
      return '';
    },
    call: async (action, parameters) => {
      calls.push([action, parameters]);
      if (action === 'ListRoutineBuilds') return { Data: [{ ...success, RoutineBuildId: 42, Status: 'building' }] };
      return action === 'CreateRoutineBuild' ? { RoutineBuildId: 42 } : success;
    },
    fetchHealth: async () => new Response(JSON.stringify({ ok: true, revision: newerCommit })),
    now: () => time, wait: async ms => { time += ms; }, log: () => {},
    buildTimeout: 40, cleanupTimeout: 20, healthTimeout: 30, discoveryTimeout: 30, interval: 10,
    ...overrides,
  };
  return { options, calls, gitCalls };
}

function unchangedRelease(state) {
  const run = state.options.run;
  return args => args[0] === 'rev-parse' && args[1].endsWith('/release/player') ? newerCommit : run(args);
}

test('only selected main revisions can create or fast-forward the release ref', () => {
  const state = harness();
  assert.deepEqual(advanceRelease(eventCommit, state.options.run), { selected: newerCommit, updated: true });
  assert.deepEqual(state.gitCalls.at(-1), ['push', 'origin', `${newerCommit}:refs/heads/release/player`]);
  assert.ok(state.gitCalls.some(args => args.join(' ') === `merge-base --is-ancestor ${eventCommit} ${newerCommit}`));
  assert.equal(state.gitCalls.flat().includes('--force'), false);
  const creation = harness();
  advanceRelease(eventCommit, args => args[0] === 'ls-remote' ? '' : creation.options.run(args));
  assert.deepEqual(creation.gitCalls.at(-1), ['push', 'origin', `${newerCommit}:refs/heads/release/player`]);
  const diverged = harness();
  assert.throws(() => advanceRelease(eventCommit, args => {
    if (args[0] === 'merge-base') throw new Error('Not an ancestor');
    return diverged.options.run(args);
  }), /Not an ancestor/);
  assert.equal(diverged.gitCalls.some(args => args[0] === 'push'), false);
  assert.throws(() => advanceRelease('--force', () => assert.fail('Unsafe event must not invoke Git')), /Invalid main/);
});

test('a queued main event advances the release ref and reuses its native ESA task through live verification', async () => {
  const state = harness();
  let discoveries = 0, reads = 0, healthReads = 0;
  const result = await deployApp({ ...state.options,
    call: async (action, parameters) => {
      state.calls.push([action, parameters]);
      if (action === 'ListRoutineBuilds') return { Data: ++discoveries === 1 ? [] : [{ ...success, RoutineBuildId: 42 }] };
      if (++reads === 1) throw new Error('Temporary API error');
      return reads === 2 ? { Status: 'building' } : success;
    },
    fetchHealth: async () => new Response(JSON.stringify({ ok: true, revision: ++healthReads === 1 ? eventCommit : newerCommit })),
  });
  assert.deepEqual(result, { buildId: '42', revision: newerCommit });
  assert.equal(state.calls.some(([action]) => action === 'CreateRoutineBuild'), false);
  assert.equal(healthReads, 2);
  assert.ok(state.gitCalls.some(args => args.join(' ') === `merge-base --is-ancestor ${newerCommit} refs/remotes/origin/main`));
});

test('manual recovery at an unchanged release reuses active tasks or explicitly builds that release ref', async () => {
  for (const existingStatus of ['building', 'failed']) {
    const state = harness();
    let healthReads = 0;
    const result = await deployApp({ ...state.options, run: unchangedRelease(state),
      call: async (action, parameters) => {
        state.calls.push([action, parameters]);
        if (action === 'ListRoutineBuilds') return { Data: [{ ...success, RoutineBuildId: 41, Status: existingStatus }] };
        return action === 'CreateRoutineBuild' ? { RoutineBuildId: 42 } : success;
      },
      fetchHealth: async () => new Response(JSON.stringify({ ok: true, revision: ++healthReads === 1 ? eventCommit : newerCommit })),
    });
    assert.equal(state.gitCalls.some(args => args[0] === 'push'), false);
    assert.equal(result.buildId, existingStatus === 'building' ? '41' : '42');
    assert.equal(state.calls.some(([action]) => action === 'CreateRoutineBuild'), existingStatus === 'failed');
    for (const [action, params] of state.calls) if (action === 'CreateRoutineBuild') assert.equal(params.Branch, 'release/player');
  }
  const live = harness();
  assert.deepEqual(await deployApp({ ...live.options, run: unchangedRelease(live) }), { buildId: null, revision: newerCommit });
  assert.deepEqual(live.calls, []);
});

test('missing native events fall back to a cloud Git build after the discovery window', async () => {
  const state = harness();
  const result = await deployApp({ ...state.options, call: async (action, parameters) => {
    state.calls.push([action, parameters]);
    if (action === 'ListRoutineBuilds') return { Data: [] };
    return action === 'CreateRoutineBuild' ? { RoutineBuildId: 42 } : success;
  } });
  assert.equal(result.buildId, '42');
  assert.equal(state.calls.filter(([action]) => action === 'ListRoutineBuilds').length, 4);
  assert.deepEqual(state.calls.find(([action]) => action === 'CreateRoutineBuild'), ['CreateRoutineBuild', { RoutineName: 'parrotbook-prototype', Branch: 'release/player' }]);
});

test('non-main requests, failed builds, wrong selected revisions and absent live revisions cannot report success', async () => {
  await assert.rejects(deployApp(harness({ ref: 'refs/heads/feature', call: () => assert.fail('Must not request a build') }).options), /Only a valid main/);
  for (const response of [{ ...success, Status: 'failed' }, { ...success, Branch: 'feature' }, { ...success, CommitId: eventCommit }]) {
    const state = harness();
    await assert.rejects(deployApp({ ...state.options, call: async (action, parameters) => action === 'GetRoutineBuild' ? response : state.options.call(action, parameters) }), /failed|unexpected production build/);
  }
  await assert.rejects(deployApp(harness({ fetchHealth: async () => new Response(JSON.stringify({ ok: true, revision: eventCommit })) }).options), /Production health did not reach/);
  const invalidHistory = harness({ run: args => {
    if (args[0] === 'rev-parse') return newerCommit;
    if (args[0] === 'merge-base') throw new Error('Commit not on main');
    return '';
  } });
  await assert.rejects(deployApp(invalidHistory.options), /Commit not on main/);
  assert.deepEqual(invalidHistory.calls, []);
});

test('a build timeout stops only its selected task and checks terminal status before releasing the job', async () => {
  const calls = [];
  let stopped = false, terminalChecked = false;
  const state = harness({ call: async (action, parameters) => {
    calls.push([action, parameters]);
    if (action === 'ListRoutineBuilds') return { Data: [{ ...success, RoutineBuildId: 42, Status: 'building' }] };
    if (action === 'StopRoutineBuild') { stopped = true; return {}; }
    if (stopped) { terminalChecked = true; return { Status: 'canceled' }; }
    return { Status: 'building' };
  } });
  await assert.rejects(deployApp(state.options), /timed out \(canceled\)/);
  assert.equal(terminalChecked, true);
  assert.deepEqual(calls.find(([action]) => action === 'StopRoutineBuild'), ['StopRoutineBuild', { RoutineBuildId: '42' }]);
});
