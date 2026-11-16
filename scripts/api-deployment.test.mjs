import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { account, region, functions, execute, shouldDeploy, apiChanged, verifySource, verifyConfig, verifyPackage, ownerSnapshot, deployApi } from './api-deployment.mjs';

const revision = 'a'.repeat(40);
const event = 'b'.repeat(40);
const roleArn = name => `acs:ram::${account}:role/${name}`;
const env = {
  // The source-selection step exports a real revision in CI; this fixture uses a fake one.
  API_REVISION: revision,
  GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'patrickchin/parrot-english', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'push', GITHUB_SHA: event,
  API_OIDC_PROVIDER_ARN: `acs:ram::${account}:oidc-provider/parrot-github-actions`, API_DEPLOY_ROLE_ARN: roleArn('parrotbook-fc-github-main'),
  OWNER_API_EXECUTION_ROLE_ARN: roleArn(functions[0].role), SHARE_API_EXECUTION_ROLE_ARN: roleArn(functions[1].role),
  ALIBABA_CLOUD_ACCESS_KEY_ID: 'temporary-id', ALIBABA_CLOUD_ACCESS_KEY_SECRET: 'temporary-secret', ALIBABA_CLOUD_SECURITY_TOKEN: 'temporary-token',
};
const source = args => args[0] === 'rev-parse' ? revision + '\n' : '';
const template = () => ({ edition: '3.0.0', name: 'parrotbook-owner-packs', resources: Object.fromEntries(functions.map(fn => [fn.resource, {
  component: 'fc3@0.1.27', props: {
    region, functionName: fn.name, runtime: 'nodejs20', handler: fn.handler, code: './api/dist', memorySize: 512, timeout: fn.timeout,
    internetAccess: true, role: `\${env('${fn.roleEnv}')}`, concurrencyConfig: { reservedConcurrency: 1 },
    environmentVariables: fn.resource === 'owner-api' ? {
      OWNER_API_BUCKET: 'parrotbook-media-f6e09412', OWNER_API_REGION: 'oss-cn-hongkong', OWNER_API_ORIGIN: 'https://parrotbook.com', OWNER_API_REVISION: "${env('OWNER_API_REVISION')}",
    } : { SHARE_API_BUCKET: 'parrotbook-media-f6e09412', SHARE_API_REGION: 'oss-cn-hongkong', SHARE_API_ORIGIN: 'https://parrotbook.com', SHARE_API_DAILY_LIMIT: '100' },
    ...(fn.resource === 'guest-sharing-api' ? { triggers: [{ triggerName: 'guest-http', triggerType: 'http', triggerConfig: { authType: 'anonymous', methods: ['GET', 'POST', 'DELETE', 'OPTIONS'] } }] } : {}),
  },
}])) });
const protectedTrigger = () => ({ triggers: [{ triggerName: 'owner-http', triggerType: 'http', qualifier: 'LATEST', triggerConfig: JSON.stringify({ authType: 'native-protected-config', methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], authConfig: { token: 'secret-never-log' } }) }] });
function cloud({ bootstrap = false, quota = 1, mutateOwner = false } = {}) {
  let deployed = false;
  const calls = [];
  return {
    calls,
    get(path) {
      calls.push(path);
      const fn = functions.find(fn => path.startsWith(`/functions/${fn.name}`));
      assert.ok(fn, 'only the two API resources may be read');
      if (bootstrap && !deployed) return null;
      if (path.endsWith('/concurrency')) return { reservedConcurrency: quota };
      if (path.endsWith('/triggers')) {
        if (fn.resource === 'owner-api') {
          if (bootstrap) return { triggers: [] };
          const result = protectedTrigger();
          if (deployed && mutateOwner) result.triggers[0].triggerConfig = JSON.stringify({ authType: 'anonymous', methods: ['GET'] });
          return result;
        }
        return { triggers: template().resources['guest-sharing-api'].props.triggers };
      }
      return { functionName: fn.name, runtime: 'nodejs20', handler: fn.handler, memorySize: 512, timeout: fn.timeout, role: roleArn(fn.role), environmentVariables: { OWNER_API_REVISION: revision } };
    },
    native(file, args, options) {
      const staged = args[2] !== 's.yaml';
      calls.push(staged ? 'bootstrap' : 'deploy');
      assert.equal(file, 's');
      assert.deepEqual(args, ['deploy', '--template', args[2], '--assume-yes', '--access', 'default_serverless_devs_key']);
      if (staged) {
        assert.match(args[2], /^\.api-bootstrap-[A-Za-z0-9_-]+\.yaml$/);
        const source = JSON.parse(readFileSync(args[2], 'utf8'));
        const expected = template();
        delete expected.resources['guest-sharing-api'].props.triggers;
        assert.deepEqual(source, expected);
      }
      assert.equal(options.env.OWNER_API_REVISION, revision);
      const key = JSON.parse(options.env.default_serverless_devs_key);
      assert.equal(key.SecurityToken, 'temporary-token');
      assert.equal(key.AccountID, account);
      assert.ok(!args.join(' ').includes('temporary-'));
      deployed = true;
    },
  };
}
const options = extra => ({ env, run: source, template: template(), checkPackage: async () => {}, log: () => {}, ...extra });

test('full-diff gate includes API/shared validators/policies and falls back safely on missing history', () => {
  for (const path of ['api/build.mjs', 'server/share-api.mjs', 's.yaml', 'src/scene.ts', 'src/content-pack.ts', 'src/waveform.ts', '.github/workflows/deploy-api.yml', 'scripts/api-deployment.test.mjs', 'infrastructure/owner-api/execution-policy.json']) assert.equal(shouldDeploy([path]), true, path);
  assert.equal(shouldDeploy(['docs/release.md', 'content/catalog.json', 'src/App.tsx']), false);
  assert.equal(apiChanged('', revision), true);
  assert.equal(apiChanged(event, revision, () => { throw Error('missing history'); }), true);
  assert.equal(apiChanged(event, revision, () => 'docs/a.md\0server/owner-api.mjs\0'), true);
  assert.equal(apiChanged(event, revision, () => 'content/catalog.json\0'), false);
});

test('source gate rejects non-main, fork, local, dirty, and changed selections', () => {
  assert.equal(verifySource(env, source), revision);
  for (const change of [{ GITHUB_REF: 'refs/pull/1/merge' }, { GITHUB_REPOSITORY: 'fork/parrot-english' }, { GITHUB_ACTIONS: 'false' }, { GITHUB_EVENT_NAME: 'pull_request_target' }, { GITHUB_SHA: 'invalid' }, { API_REVISION: event }]) assert.throws(() => verifySource({ ...env, ...change }, source));
  assert.throws(() => verifySource(env, args => args[0] === 'status' ? ' M server/owner-api.mjs\n' : source(args)), /unchanged/);
  assert.throws(() => verifySource(env, args => { if (args[0] === 'merge-base') throw Error('not main'); return source(args); }), /not main/);
});

test('descriptor gate forbids owner trigger writes, wrong code, changed roles/quotas and extra services', () => {
  assert.ok(verifyConfig(template()));
  for (const change of [
    t => { t.resources['owner-api'].props.triggers = []; },
    t => { t.resources['owner-api'].props.code = '.'; },
    t => { t.resources['owner-api'].props.role = 'another-role'; },
    t => { t.resources['owner-api'].props.concurrencyConfig.reservedConcurrency = 2; },
    t => { t.resources['owner-api'].component = 'fc3'; },
    t => { t.resources['owner-api'].props.vpcConfig = {}; },
    t => { t.resources.third = {}; },
    t => { t.actions = []; },
    t => { t.resources['guest-sharing-api'].props.triggers[0].triggerConfig.methods.push('PUT'); },
  ]) { const t = template(); change(t); assert.throws(() => verifyConfig(t)); }
});

test('package gate requires compiled handlers/SDK and rejects media, outside symlinks and excessive bytes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'parrot-api-package-'));
  try {
    await mkdir(join(dir, 'node_modules/ali-oss'), { recursive: true });
    for (const file of ['index.js', 'share.js', 'package.json', 'package-lock.json']) await writeFile(join(dir, file), '{}');
    await writeFile(join(dir, 'node_modules/ali-oss/package.json'), '{"version":"6.23.0"}');
    assert.ok(await verifyPackage(dir) > 0);
    await writeFile(join(dir, 'video.mp4'), 'media');
    await assert.rejects(verifyPackage(dir), /Media/);
    await rm(join(dir, 'video.mp4'));
    await symlink('/tmp', join(dir, 'escape'));
    await assert.rejects(verifyPackage(dir), /symlink/);
    await rm(join(dir, 'escape'));
    await writeFile(join(dir, 'oversize.js'), Buffer.alloc(40 * 1024 * 1024));
    await assert.rejects(verifyPackage(dir), /40 MiB/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('owner snapshot rejects anonymous, incomplete methods and incomplete/multiple trigger lists', () => {
  assert.equal(ownerSnapshot(protectedTrigger()).triggerName, 'owner-http');
  for (const bad of [null, {}, { triggers: [], nextToken: 'more' }, { triggers: [] }, { triggers: [...protectedTrigger().triggers, ...protectedTrigger().triggers] }, { triggers: [{ triggerType: 'http', triggerConfig: { authType: 'anonymous', methods: ['GET'] } }] }, { triggers: [{ triggerType: 'http', triggerConfig: { authType: 'protected', methods: ['GET'] } }] }]) assert.throws(() => ownerSnapshot(bad));
});

test('normal deployment pins STS-only native command and preserves owner native config without logging secrets', async () => {
  const fake = cloud();
  const logs = [];
  assert.deepEqual(await deployApi(options({ ...fake, log: text => logs.push(text) })), { revision, ownerConfigured: true });
  assert.equal(fake.calls.filter(call => call === 'deploy').length, 1);
  assert.ok(!JSON.stringify(logs).includes('secret-never-log'));
});

test('bootstrap requires explicit manual input and leaves owner trigger absent', async () => {
  await assert.rejects(deployApi(options(cloud({ bootstrap: true }))), /bootstrap=true/);
  const fake = cloud({ bootstrap: true });
  assert.deepEqual(await deployApi(options({ ...fake, env: { ...env, GITHUB_EVENT_NAME: 'workflow_dispatch', API_BOOTSTRAP: 'true' } })), { revision, ownerConfigured: false });
  const stagedAt = fake.calls.indexOf('bootstrap');
  const publicAt = fake.calls.indexOf('deploy');
  assert.ok(stagedAt >= 0 && publicAt > stagedAt);
  for (const fn of functions) assert.ok(fake.calls.slice(stagedAt + 1, publicAt).includes(`/functions/${fn.name}/concurrency`));
  await assert.rejects(deployApi(options({ ...cloud({ bootstrap: true }), env: { ...env, API_BOOTSTRAP: 'true' } })), /bootstrap=true/);
  const partial = cloud({ bootstrap: true });
  const getPartial = path => path === '/functions/parrotbook-owner-packs' ? { functionName: 'parrotbook-owner-packs', runtime: 'nodejs20', handler: 'index.handler', memorySize: 512, timeout: 120, role: roleArn(functions[0].role), environmentVariables: { OWNER_API_REVISION: revision } } : path === '/functions/parrotbook-owner-packs/triggers' ? { triggers: [] } : partial.get(path);
  assert.deepEqual(await deployApi(options({ ...partial, get: getPartial, env: { ...env, GITHUB_EVENT_NAME: 'workflow_dispatch', API_BOOTSTRAP: 'true' } })), { revision, ownerConfigured: false });
});

test('wrong roles, absent STS and unsafe existing quota fail before native deployment', async () => {
  for (const change of [{ OWNER_API_EXECUTION_ROLE_ARN: roleArn('other') }, { API_DEPLOY_ROLE_ARN: roleArn('other') }, { ALIBABA_CLOUD_SECURITY_TOKEN: '' }]) {
    const fake = cloud();
    await assert.rejects(deployApi(options({ ...fake, env: { ...env, ...change } })));
    assert.ok(!fake.calls.includes('deploy'));
  }
  const fake = cloud({ quota: 2 });
  await assert.rejects(deployApi(options(fake)), /concurrency one/);
  assert.ok(!fake.calls.includes('deploy'));
});

test('post-deploy quota, function and owner-auth drift fail closed', async () => {
  await assert.rejects(deployApi(options(cloud({ mutateOwner: true }))), /authentication|methods/);
  const fake = cloud();
  await assert.rejects(deployApi(options({ ...fake, get(path) { const value = fake.get(path); return path.endsWith('/parrotbook-guest-shares') ? { ...value, role: roleArn('other') } : value; } })), /readback mismatch/);
  const quota = cloud();
  let deployed = false;
  await assert.rejects(deployApi(options({ ...quota, native(...args) { quota.native(...args); deployed = true; }, get(path) { return deployed && path.endsWith('/concurrency') ? { reservedConcurrency: 2 } : quota.get(path); } })), /concurrency is not one/);
});

test('native errors do not print provider output containing secrets', async () => {
  await assert.rejects(deployApi(options({ ...cloud(), native() { throw Error('SECRET provider output'); } })), error => !error.message.includes('SECRET') && /Native FC deployment failed/.test(error.message));
});

test('scoped policy has no owner trigger mutation, wildcard service, OSS, IAM write or unrelated resource access', async () => {
  const policy = JSON.parse(await readFile(new URL('../infrastructure/api-deployment/deploy-policy.json', import.meta.url)));
  const trust = JSON.parse(await readFile(new URL('../infrastructure/api-deployment/oidc-trust.json', import.meta.url)));
  for (const statement of policy.Statement) {
    for (const action of statement.Action) assert.ok(action.startsWith('fc:') || action === 'ram:PassRole');
    for (const resource of statement.Resource) assert.ok(resource.includes('parrotbook-owner-packs') || resource.includes('parrotbook-guest-shares'));
    if (statement.Action.some(action => /(?:Create|Update|Delete)Trigger$/.test(action))) assert.deepEqual(statement.Resource, [`acs:fc:${region}:${account}:functions/parrotbook-guest-shares/triggers/guest-http`]);
    assert.ok(!statement.Action.some(action => /Delete|InvokeFunction|PutProvision|CreateVpc/.test(action)));
  }
  const pass = policy.Statement.find(statement => statement.Action.includes('ram:PassRole'));
  assert.deepEqual(pass.Condition, { StringEquals: { 'acs:Service': 'fc.aliyuncs.com' } });
  assert.equal(trust.Statement[0].Condition.StringEquals['oidc:sub'], 'repo:patrickchin/parrot-english:ref:refs/heads/main');
  assert.equal(trust.Statement[0].Condition.StringEquals['oidc:aud'], 'sts.aliyuncs.com');
});

// Test the OS subprocess boundary: a mocked throw cannot detect Node echoing stderr.
test('failing provider subprocess stderr stays private even when caller asks to inherit it', () => {
  const wrapper = new URL('./api-deployment.mjs', import.meta.url).href;
  const sentinel = 'private-provider-stderr-sentinel';
  const childSource = `import { execute } from ${JSON.stringify(wrapper)};
    try { execute(process.execPath, ['-e', ${JSON.stringify("process.stderr.write('" + sentinel + "'); process.exit(7)")}], { stdio: 'inherit' }); }
    catch (error) { if (error.status !== 7 || !String(error.stderr).includes(${JSON.stringify(sentinel)})) process.exit(8); }`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', childSource], { encoding: 'utf8', stdio: 'pipe' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('bootstrap quota failure prevents public-trigger deployment and cleans generated descriptor', async () => {
  const fake = cloud({ bootstrap: true });
  let stagedPath;
  let staged = false;
  const get = path => staged && path.endsWith('/concurrency') ? { reservedConcurrency: 2 } : fake.get(path);
  const native = (...args) => { stagedPath = args[1][2]; fake.native(...args); staged = true; };
  await assert.rejects(deployApi(options({ ...fake, get, native, env: { ...env, GITHUB_EVENT_NAME: 'workflow_dispatch', API_BOOTSTRAP: 'true' } })), /before creating the public guest trigger/);
  assert.ok(fake.calls.includes('bootstrap'));
  assert.ok(!fake.calls.includes('deploy'));
  assert.equal(existsSync(stagedPath), false);
});

test('real native CLI subprocesses run quota-first bootstrap and stop before public trigger on failed quota', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'parrot-native-cli-'));
  const trace = join(directory, 'trace.jsonl');
  try {
    const cli = join(directory, 's');
    await writeFile(cli, `#!${process.execPath}
const fs = require('node:fs');
const path = process.argv[process.argv.indexOf('--template') + 1];
const template = JSON.parse(path === 's.yaml' ? process.env.TEST_FINAL_TEMPLATE : fs.readFileSync(path, 'utf8'));
fs.appendFileSync(process.env.TEST_TRACE, JSON.stringify({type:'native', publicTrigger: Boolean(template.resources['guest-sharing-api'].props.triggers)}) + '\\n');
`);
    await chmod(cli, 0o700);
    for (const quota of [1, 2]) {
      await writeFile(trace, '');
      const fake = cloud({ bootstrap: true });
      let staged = false;
      const settings = options({ ...fake, env: { ...process.env, ...env, GITHUB_EVENT_NAME: 'workflow_dispatch', API_BOOTSTRAP: 'true', PATH: directory + ':' + process.env.PATH, TEST_TRACE: trace, TEST_FINAL_TEMPLATE: JSON.stringify(template()) },
        native(...args) { fake.native(...args); execute(...args); staged = true; },
        get(path) {
          if (staged && path.endsWith('/concurrency')) {
            appendFileSync(trace, JSON.stringify({ type: 'quota', path, quota }) + '\n');
            return { reservedConcurrency: quota };
          }
          return fake.get(path);
        },
      });
      if (quota === 1) await deployApi(settings);
      else await assert.rejects(deployApi(settings), /before creating the public guest trigger/);
      const events = (await readFile(trace, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
      assert.deepEqual(events[0], { type: 'native', publicTrigger: false });
      const publicAt = events.findIndex(item => item.type === 'native' && item.publicTrigger);
      if (quota === 1) {
        assert.ok(publicAt > 0);
        for (const fn of functions) assert.ok(events.slice(1, publicAt).some(item => item.type === 'quota' && item.path === `/functions/${fn.name}/concurrency` && item.quota === 1));
      } else assert.equal(publicAt, -1);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
