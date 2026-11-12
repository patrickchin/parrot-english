import { execFileSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const contentScripts = new Set([
  'scripts/content.mjs', 'scripts/content-paths.mjs', 'scripts/align-words.py',
  'scripts/prepare-extra-scenes.mjs', 'scripts/prepare-meme-scenes.mjs',
  'scripts/prepare-portraits.py', 'scripts/prepare-review-clips.mjs',
  'scripts/prepare-test-scenes.mjs', 'scripts/prepare-tv-review.mjs',
  'scripts/prepare-tv-scenes.mjs', 'scripts/prepare-waveforms.mjs',
]);
const commit = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value) && !/^0+$/.test(value);
const git = args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 30000 });

export function shouldDeploy(paths) {
  return paths.some(path => !path || path.startsWith('/') || path.split('/').some(part => part === '.' || part === '..') ||
    !(path.startsWith('content/') || path.startsWith('docs/') || path === 'README.md' || contentScripts.has(path)));
}

export function appChanged(before, after, run = git) {
  // Missing history and first pushes must never silently suppress an app release.
  if (!commit(before) || !commit(after)) return true;
  try {
    const paths = run(['diff', '--no-renames', '--name-only', '-z', before, after, '--']).split('\0').filter(Boolean);
    return shouldDeploy(paths);
  } catch { return true; }
}

function aliyun(action, parameters) {
  // The CLI detects STS from the credentials action's temporary environment.
  const args = ['esa', action, ...Object.entries(parameters).flatMap(([key, value]) => ['--' + key, String(value)]), '--region', 'cn-hangzhou'];
  return JSON.parse(execFileSync('aliyun', args, { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 }));
}

const terminal = status => ['succeed', 'failed', 'canceled'].includes(status);
const active = status => ['int', 'pending', 'building'].includes(status);
const releaseBranch = 'release/player';
const releaseRef = `refs/heads/${releaseBranch}`;

export function advanceRelease(expectedCommit, run = git) {
  if (!commit(expectedCommit)) throw new Error('Invalid main event revision.');
  run(['fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main']);
  const selected = run(['rev-parse', 'refs/remotes/origin/main']).trim();
  if (!commit(selected)) throw new Error('Unable to select a valid main revision.');
  run(['merge-base', '--is-ancestor', expectedCommit, selected]);
  const remote = run(['ls-remote', '--heads', 'origin', releaseRef]).trim();
  let previous = '';
  if (remote) {
    const entries = remote.split('\n');
    const fields = entries[0].split(/\s+/);
    if (entries.length !== 1 || !commit(fields[0]) || fields[1] !== releaseRef) throw new Error('Unexpected release ref response.');
    run(['fetch', '--no-tags', 'origin', `${releaseRef}:refs/remotes/origin/${releaseBranch}`]);
    previous = run(['rev-parse', `refs/remotes/origin/${releaseBranch}`]).trim();
    if (!commit(previous)) throw new Error('Unable to read the release revision.');
    run(['merge-base', '--is-ancestor', previous, selected]);
  }
  // No force option: a competing update must pass Git's fast-forward check too.
  if (previous !== selected) run(['push', 'origin', `${selected}:${releaseRef}`]);
  return { selected, updated: previous !== selected };
}

export async function deployApp({ expectedCommit, ref = process.env.GITHUB_REF, call = aliyun, run = git,
  fetchHealth = () => fetch('https://parrotbook.com/api/health', { cache: 'no-store', signal: AbortSignal.timeout(15000) }),
  wait = sleep, now = Date.now, log = console.log, buildTimeout = 10 * 60 * 1000,
  cleanupTimeout = 2 * 60 * 1000, healthTimeout = 2 * 60 * 1000, discoveryTimeout = 45000, interval = 15000,
}) {
  if (ref !== 'refs/heads/main' || !commit(expectedCommit)) throw new Error('Only a valid main commit can request a production build.');
  const { selected, updated } = advanceRelease(expectedCommit, run);
  const liveRevision = async () => {
    const response = await fetchHealth();
    const health = response.ok ? await response.json() : undefined;
    return health?.ok === true ? health.revision : undefined;
  };
  if (!updated) {
    try {
      if (await liveRevision() === selected) {
        log(`Production already serves selected main revision ${selected}.`);
        return { buildId: null, revision: selected };
      }
    } catch { /* A failed health request must not suppress recovery. */ }
  }
  // Updating the release ref normally starts ESA's native Git build. Reuse it
  // instead of requesting a duplicate; an unchanged ref needs explicit recovery.
  let buildId = '';
  const discoveryDeadline = now() + (updated ? discoveryTimeout : 0);
  do {
    try {
      const recent = await call('ListRoutineBuilds', { RoutineName: 'parrotbook-prototype', PageIndex: 1, PageSize: 100, SortBy: 'CreateTime', SortOrder: 'desc' });
      if (!Array.isArray(recent.Data)) throw new Error('ESA returned an invalid recent-build list.');
      const matches = recent.Data.filter(build => build.RoutineName === 'parrotbook-prototype' && build.Branch === releaseBranch && build.ProductionBranch === releaseBranch && build.CommitId === selected);
      const matching = matches.find(build => active(build.Status)) ?? (updated ? matches.find(build => terminal(build.Status)) : undefined);
      if (matching) { buildId = String(matching.RoutineBuildId ?? ''); break; }
    } catch (error) {
      if (now() >= discoveryDeadline) throw error;
      log('ESA build discovery temporarily unavailable; retrying.');
    }
    if (now() >= discoveryDeadline) break;
    await wait(interval);
  } while (now() <= discoveryDeadline);
  if (!buildId) {
    const created = await call('CreateRoutineBuild', { RoutineName: 'parrotbook-prototype', Branch: releaseBranch });
    buildId = String(created.RoutineBuildId ?? '');
  }
  if (!/^[1-9][0-9]{0,19}$/.test(buildId)) throw new Error('ESA did not return a valid build ID.');
  log(`Monitoring ESA production build ${buildId} for selected main revision ${selected}.`);
  const deadline = now() + buildTimeout;
  let build;
  while (now() < deadline) {
    try {
      build = await call('GetRoutineBuild', { RoutineBuildId: buildId });
      log(`ESA build ${buildId}: ${build.Status}`);
      if (terminal(build.Status)) break;
    } catch { log(`ESA build ${buildId}: status temporarily unavailable; retrying.`); }
    await wait(interval);
  }
  if (!terminal(build?.Status)) {
    // Stop only this selected release task, then keep the deployment lock
    // while checking that it actually stopped.
    const cleanupDeadline = now() + cleanupTimeout;
    try { await call('StopRoutineBuild', { RoutineBuildId: buildId }); }
    catch { log(`ESA build ${buildId}: stop request failed; checking its final status.`); }
    while (now() < cleanupDeadline) {
      try {
        build = await call('GetRoutineBuild', { RoutineBuildId: buildId });
        if (terminal(build.Status)) break;
      } catch { /* A temporary API failure does not release the deployment lock. */ }
      await wait(interval);
    }
    throw new Error(`ESA build ${buildId} timed out${terminal(build?.Status) ? ` (${build.Status})` : '; unable to confirm that it stopped'}.`);
  }
  if (build.Status !== 'succeed') throw new Error(`ESA build ${buildId} ${build.Status}.`);
  if (build.RoutineName !== 'parrotbook-prototype' || build.Branch !== releaseBranch || build.ProductionBranch !== releaseBranch || build.CommitId !== selected) throw new Error('ESA returned an unexpected production build.');
  run(['fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main']);
  run(['merge-base', '--is-ancestor', selected, 'refs/remotes/origin/main']);
  const healthDeadline = now() + healthTimeout;
  while (now() < healthDeadline) {
    try {
      if (await liveRevision() === selected) {
        log(`Verified production revision ${build.CommitId} from ESA build ${buildId}.`);
        return { buildId, revision: build.CommitId };
      }
    } catch { /* Publication can finish before every edge serves the new revision. */ }
    await wait(interval);
  }
  throw new Error(`Production health did not reach ESA build ${buildId} revision ${build.CommitId}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const command = process.argv[2];
  if (command === 'changes') {
    const changed = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' || appChanged(process.env.BEFORE_COMMIT, process.env.GITHUB_SHA);
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `app_changed=${changed}\n`);
    console.log(changed ? 'Player changes require an ESA build.' : 'Only content or documentation changed; player deployment skipped.');
  } else if (command === 'deploy') await deployApp({ expectedCommit: process.env.EXPECTED_COMMIT });
  else throw new Error('Usage: node scripts/app-deployment.mjs changes|deploy');
}
