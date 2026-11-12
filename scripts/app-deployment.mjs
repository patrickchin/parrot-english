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

export async function deployApp({ expectedCommit, ref = process.env.GITHUB_REF, call = aliyun, run = git,
  fetchHealth = () => fetch('https://parrotbook.com/api/health', { cache: 'no-store', signal: AbortSignal.timeout(15000) }),
  wait = sleep, now = Date.now, log = console.log, buildTimeout = 10 * 60 * 1000,
  cleanupTimeout = 2 * 60 * 1000, healthTimeout = 2 * 60 * 1000, interval = 15000,
}) {
  if (ref !== 'refs/heads/main' || !commit(expectedCommit)) throw new Error('Only a valid main commit can request a production build.');
  const refreshMain = () => run(['fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main']);
  refreshMain();
  run(['merge-base', '--is-ancestor', expectedCommit, 'refs/remotes/origin/main']);
  const created = await call('CreateRoutineBuild', { RoutineName: 'parrotbook-prototype', Branch: 'main' });
  const buildId = String(created.RoutineBuildId ?? '');
  if (!/^[1-9][0-9]{0,19}$/.test(buildId)) throw new Error('ESA did not return a valid build ID.');
  log(`ESA build ${buildId} requested from main.`);
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
    // Stop only the task this dispatcher created, then keep the deployment lock
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
  if (build.RoutineName !== 'parrotbook-prototype' || build.Branch !== 'main' || build.ProductionBranch !== 'main' || !commit(build.CommitId)) throw new Error('ESA returned an unexpected production build.');
  // ESA selects the branch head when it clones, not a caller-supplied commit.
  // A queued push can therefore build a newer main commit containing the event.
  refreshMain();
  run(['merge-base', '--is-ancestor', expectedCommit, build.CommitId]);
  run(['merge-base', '--is-ancestor', build.CommitId, 'refs/remotes/origin/main']);
  const healthDeadline = now() + healthTimeout;
  while (now() < healthDeadline) {
    try {
      const response = await fetchHealth();
      const health = response.ok ? await response.json() : undefined;
      if (health?.ok === true && health.revision === build.CommitId) {
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
