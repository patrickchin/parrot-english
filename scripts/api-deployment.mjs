import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFile, lstat, readdir, realpath, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const account = '1263482499936169';
export const region = 'cn-hongkong';
export const functions = [
  { resource: 'owner-api', name: 'parrotbook-owner-packs', handler: 'index.handler', timeout: 120, role: 'parrotbook-owner-packs-runtime', roleEnv: 'OWNER_API_EXECUTION_ROLE_ARN' },
  { resource: 'guest-sharing-api', name: 'parrotbook-guest-shares', handler: 'share.handler', timeout: 60, role: 'parrotbook-guest-shares-runtime', roleEnv: 'SHARE_API_EXECUTION_ROLE_ARN' },
];
const commit = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value) && !/^0+$/.test(value);
export const execute = (file, args, options = {}) => execFileSync(file, args, { encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024, ...options, stdio: 'pipe' });
const git = args => execute('git', args);
const fail = message => { throw new Error(message); };
const same = (a, b, message) => { if (!isDeepStrictEqual(a, b)) fail(message); };
const roleArn = name => `acs:ram::${account}:role/${name}`;

export function shouldDeploy(paths) {
  return paths.some(path => /^(?:api\/|server\/|infrastructure\/(?:api-deployment|owner-api)\/)/.test(path) ||
    ['s.yaml', 'scripts/api-deployment.mjs', 'scripts/api-deployment.test.mjs', '.github/workflows/deploy-api.yml', 'src/content-pack.ts', 'src/scene.ts', 'src/waveform.ts'].includes(path));
}
export function apiChanged(before, after, run = git) {
  if (!commit(before) || !commit(after)) return true;
  try { return shouldDeploy(run(['diff', '--no-renames', '--name-only', '-z', before, after, '--']).split('\0').filter(Boolean)); }
  catch { return true; }
}

export function verifySource(env = process.env, run = git) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== 'patrickchin/parrot-english' || env.GITHUB_REF !== 'refs/heads/main' ||
      !['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME) || !commit(env.GITHUB_SHA)) fail('Deployment requires the merged-main GitHub Actions workflow.');
  run(['fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main']);
  const selected = run(['rev-parse', 'HEAD']).trim();
  if (!commit(selected) || (env.API_REVISION && env.API_REVISION !== selected)) fail('The selected source revision changed.');
  run(['merge-base', '--is-ancestor', env.GITHUB_SHA, selected]);
  run(['merge-base', '--is-ancestor', selected, 'refs/remotes/origin/main']);
  if (run(['status', '--porcelain', '--untracked-files=no']).trim()) fail('Tracked source must be unchanged after checkout.');
  return selected;
}

export function verifyConfig(template) {
  same(Object.keys(template).sort(), ['edition', 'name', 'resources'], 'Unexpected deployment-level configuration.');
  same(template.edition, '3.0.0', 'Unexpected descriptor edition.');
  same(template.name, 'parrotbook-owner-packs', 'Unexpected deployment name.');
  same(Object.keys(template.resources).sort(), functions.map(fn => fn.resource).sort(), 'Only the two API functions may be deployed.');
  for (const fn of functions) {
    const resource = template.resources[fn.resource];
    same(Object.keys(resource).sort(), ['component', 'props'], 'Unexpected component configuration.');
    same(resource.component, 'fc3@0.1.26', 'The reviewed FC3 component version must be pinned.');
    const expected = {
      region, functionName: fn.name, runtime: 'nodejs20', handler: fn.handler, code: './api/dist', memorySize: 512,
      timeout: fn.timeout, internetAccess: true, role: `\${env('${fn.roleEnv}')}`, concurrencyConfig: { reservedConcurrency: 1 },
      environmentVariables: fn.resource === 'owner-api' ? {
        OWNER_API_BUCKET: 'parrotbook-media-f6e09412', OWNER_API_REGION: 'oss-cn-hongkong', OWNER_API_ORIGINS: '["https://parrotbook.com","https://www.parrotbook.com"]',
        OWNER_API_REVISION: "${env('OWNER_API_REVISION')}",
      } : {
        SHARE_API_BUCKET: 'parrotbook-media-f6e09412', SHARE_API_REGION: 'oss-cn-hongkong', SHARE_API_ORIGINS: '["https://parrotbook.com","https://www.parrotbook.com"]', SHARE_API_DAILY_LIMIT: '100',
      },
    };
    if (fn.resource === 'guest-sharing-api') expected.triggers = [{ triggerName: 'guest-http', triggerType: 'http', triggerConfig: { authType: 'anonymous', methods: ['GET', 'POST', 'DELETE', 'OPTIONS'] } }];
    same(resource.props, expected, `Unexpected configuration for ${fn.name}; review the deployment gate before changing infrastructure.`);
  }
  return template;
}

export async function verifyPackage(directory = 'api/dist') {
  const root = await realpath(directory);
  let bytes = 0;
  const walk = async path => {
    for (const name of await readdir(path)) {
      const file = resolve(path, name);
      const stat = await lstat(file);
      const local = relative(root, file);
      if (stat.isSymbolicLink()) {
        const target = relative(root, await realpath(file));
        if (target === '..' || target.startsWith('..' + sep) || resolve(root, target) === root) fail('Package symlink leaves its code directory.');
      } else if (stat.isDirectory()) await walk(file);
      else if (!stat.isFile()) fail('Package contains a non-file entry.');
      else {
        // Dependency documentation is harmless; authored media never belongs in either location.
        if (/\.(?:mp4|m4v|webm|mov|mp3|wav|m4a|aac|ogg|flac|zip|tar|gz)$/i.test(local) || /^(?:content|clips|guest-shares)(?:\/|\\)/.test(local)) fail('Media or content archives must not be deployed as function code.');
        bytes += stat.size;
      }
    }
  };
  await walk(root);
  if (bytes > 40 * 1024 * 1024) fail('API code package exceeds the reviewed 40 MiB limit.');
  for (const name of ['index.js', 'share.js', 'package.json', 'package-lock.json', 'node_modules/ali-oss/package.json']) {
    if (!(await lstat(resolve(root, name))).isFile()) fail(`Missing package entry: ${name}.`);
  }
  const sdk = JSON.parse(await readFile(resolve(root, 'node_modules/ali-oss/package.json'), 'utf8'));
  if (sdk.version !== '6.23.0') fail('Unexpected OSS SDK version.');
  return bytes;
}

const readbackPaths = new Set(functions.flatMap(fn => ['', '/concurrency', '/triggers'].map(suffix => `/functions/${fn.name}${suffix}`)));
const providerCodes = new Set(['AccessDenied', 'Forbidden', 'Unauthorized', 'FunctionNotFound', 'TriggerNotFound',
  'InvalidArgument', 'InvalidParameter', 'MissingParameter', 'Throttling', 'Throttling.User', 'InternalError',
  'ServiceUnavailable', 'InvalidAccessKeyId', 'InvalidSecurityToken', 'ExpiredSecurityToken', 'SecurityTokenExpired', 'SignatureDoesNotMatch']);
function providerDiagnostic(stderr) {
  // Only native CLI error envelopes count. Never search messages or nested data.
  let envelope;
  try { envelope = JSON.parse(stderr); } catch { return {}; }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return {};
  const code = envelope.error_code ?? envelope.Code ?? envelope.ErrorCode;
  if (!providerCodes.has(code)) return {};
  const id = envelope.request_id ?? envelope.RequestId;
  const validId = typeof id === 'string' && /^(?:[a-f0-9]{16,64}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(id);
  return { code, ...(validId ? { requestId: id } : {}) };
}
export function cloudGet(path, run = execute) {
  const label = readbackPaths.has(path) ? `GET ${path}` : 'GET [unexpected path]';
  let output;
  // Pinned CLI 3.5.3 emits remote provider errors as JSON only in this mode.
  try { output = run('aliyun', ['fc', 'GET', '/2023-03-30' + path, '--region', region, '--version', '2023-03-30', '--cli-ai-mode']); }
  catch (error) {
    // Native HTTP trigger output can contain owner tokens. Treat only a parsed
    // provider code as not-found; messages, stdout and config are never metadata.
    const diagnostic = providerDiagnostic(String(error.stderr ?? ''));
    if (diagnostic.code === 'FunctionNotFound') return null;
    const category = error.code === 'ETIMEDOUT' ? 'timeout' : 'child-exit';
    const details = [category, diagnostic.code ? `providerCode=${diagnostic.code}` : '', diagnostic.requestId ? `requestId=${diagnostic.requestId}` : ''].filter(Boolean);
    fail(`FC readback ${label} failed (${details.join('; ')}).`);
  }
  try { return JSON.parse(output); }
  catch { fail(`FC readback ${label} failed (json-parse).`); }
}
const triggerConfig = trigger => typeof trigger.triggerConfig === 'string' ? JSON.parse(trigger.triggerConfig) : trigger.triggerConfig;
export function ownerSnapshot(response) {
  if (!response || !Array.isArray(response.triggers) || response.nextToken) fail('Unable to read a complete owner trigger list.');
  if (response.triggers.length !== 1 || response.triggers[0].triggerType !== 'http') fail('Owner requires exactly one manually configured native HTTP trigger.');
  const trigger = response.triggers[0];
  const config = triggerConfig(trigger);
  if (!config || typeof config.authType !== 'string' || !config.authType || config.authType === 'anonymous') fail('Owner HTTP authentication must be configured before normal deployment.');
  if (!['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'].every(method => config.methods?.includes(method))) fail('Owner trigger must support all management and preflight methods.');
  // Bearer semantics and preflight require the hosted smoke test. Keep the entire
  // native config (including secrets) in memory only, and compare without logging.
  return { triggerName: trigger.triggerName, triggerType: trigger.triggerType, qualifier: trigger.qualifier, triggerConfig: config };
}

export async function deployApi({ env = process.env, run = git, get = cloudGet, native = execute, template,
  checkPackage = verifyPackage, log = console.log } = {}) {
  const revision = verifySource(env, run);
  verifyConfig(template);
  await checkPackage();
  for (const fn of functions) if (env[fn.roleEnv] !== roleArn(fn.role)) fail(`Unexpected ${fn.roleEnv}.`);
  if (env.API_DEPLOY_ROLE_ARN !== roleArn('parrotbook-fc-github-main') || env.API_OIDC_PROVIDER_ARN !== `acs:ram::${account}:oidc-provider/parrot-github-actions`) fail('Unexpected deployment role or OIDC provider.');
  const bootstrap = env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.API_BOOTSTRAP === 'true';
  const existing = get(`/functions/${functions[0].name}`);
  let before;
  if (existing) {
    const triggers = get(`/functions/${functions[0].name}/triggers`);
    const emptyBootstrap = bootstrap && triggers && Array.isArray(triggers.triggers) && !triggers.triggers.length && !triggers.nextToken;
    if (!emptyBootstrap) before = ownerSnapshot(triggers);
  } else if (!bootstrap) fail('First deployment requires explicit workflow_dispatch bootstrap=true; configure native owner Bearer authentication afterwards.');
  // A failed first run may have created only one function. Explicit bootstrap
  // may resume it; a normally configured owner always requires safe quotas.
  if (before || !bootstrap) for (const fn of functions) same(get(`/functions/${fn.name}/concurrency`)?.reservedConcurrency, 1, 'Existing APIs must have global concurrency one before deployment.');
  const credentials = {
    AccountID: account, AccessKeyID: env.ALIBABA_CLOUD_ACCESS_KEY_ID, AccessKeySecret: env.ALIBABA_CLOUD_ACCESS_KEY_SECRET, SecurityToken: env.ALIBABA_CLOUD_SECURITY_TOKEN,
  };
  if (Object.values(credentials).some(value => typeof value !== 'string' || !value)) fail('Temporary OIDC STS credentials are required.');
  const deploy = path => {
    try {
      native('s', ['deploy', '--template', path, '--assume-yes', '--access', 'default_serverless_devs_key'], {
        timeout: 10 * 60 * 1000,
        env: { ...env, OWNER_API_REVISION: revision, default_serverless_devs_key: JSON.stringify(credentials) },
      });
    } catch { fail('Native FC deployment failed. No credential or trigger output was logged; inspect the provider deployment using an authorized console session.'); }
  };
  if (bootstrap && !before) {
    const guestName = functions[1].name;
    if (get(`/functions/${guestName}`)) {
      const guestTriggers = get(`/functions/${guestName}/triggers`);
      if (!guestTriggers || !Array.isArray(guestTriggers.triggers) || guestTriggers.nextToken) fail('Unable to inspect existing guest triggers before bootstrap.');
      if (guestTriggers.triggers.length) same(get(`/functions/${guestName}/concurrency`)?.reservedConcurrency, 1, 'An existing public guest trigger requires global concurrency one before bootstrap.');
    }
    // FC3 applies concurrency after triggers. Create/update code and quotas first,
    // without introducing any public trigger. JSON is also valid YAML; placing
    // this generated file in the source root preserves ./api/dist resolution.
    const staged = structuredClone(template);
    delete staged.resources['guest-sharing-api'].props.triggers;
    const path = `.api-bootstrap-${randomBytes(9).toString('base64url')}.yaml`;
    try {
      await writeFile(path, JSON.stringify(staged), { flag: 'wx', mode: 0o600 });
      deploy(path);
      for (const fn of functions) same(get(`/functions/${fn.name}/concurrency`)?.reservedConcurrency, 1, 'Bootstrap must verify both global quotas before creating the public guest trigger.');
    } finally { await rm(path, { force: true }); }
  }
  deploy('s.yaml');
  for (const fn of functions) {
    const actual = get(`/functions/${fn.name}`);
    for (const [key, value] of Object.entries({ functionName: fn.name, runtime: 'nodejs20', handler: fn.handler, memorySize: 512, timeout: fn.timeout, role: roleArn(fn.role) })) same(actual?.[key], value, `FC readback mismatch: ${fn.name} ${key}.`);
    same(get(`/functions/${fn.name}/concurrency`)?.reservedConcurrency, 1, `Global concurrency is not one for ${fn.name}.`);
    const originKey = fn.resource === 'owner-api' ? 'OWNER_API_ORIGINS' : 'SHARE_API_ORIGINS';
    same(actual.environmentVariables?.[originKey], '["https://parrotbook.com","https://www.parrotbook.com"]', `FC readback mismatch: ${fn.name} browser origins.`);
    if (fn.resource === 'owner-api') same(actual.environmentVariables?.OWNER_API_REVISION, revision, 'Owner revision did not match selected main source.');
  }
  const ownerAfter = get(`/functions/${functions[0].name}/triggers`);
  if (before) same(ownerSnapshot(ownerAfter), before, 'Native owner trigger changed unexpectedly.');
  else if (!ownerAfter || ownerAfter.nextToken || !Array.isArray(ownerAfter.triggers) || ownerAfter.triggers.length) fail('Bootstrap must leave owner authentication setup manual, without creating an owner trigger.');
  const guest = get(`/functions/${functions[1].name}/triggers`);
  if (!guest || guest.nextToken || guest.triggers?.length !== 1) fail('Unexpected guest HTTP trigger list.');
  const trigger = guest.triggers[0];
  if (trigger.triggerName !== 'guest-http' || trigger.triggerType !== 'http') fail('Unexpected guest HTTP trigger.');
  const config = triggerConfig(trigger);
  same(config?.authType, 'anonymous', 'Unexpected guest trigger authentication.');
  same([...config.methods].sort(), ['DELETE', 'GET', 'OPTIONS', 'POST'], 'Unexpected guest HTTP methods.');
  verifySource({ ...env, API_REVISION: revision }, run);
  log(`Verified API revision ${revision}, scoped runtime roles, global concurrency one, and ${before ? 'unchanged native owner authentication' : 'bootstrap without an owner trigger; native Bearer setup and hosted smoke tests remain required'}.`);
  return { revision, ownerConfigured: Boolean(before) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const command = process.argv[2];
    if (command === 'changes') {
      const changed = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' || apiChanged(process.env.BEFORE_COMMIT, process.env.GITHUB_SHA);
      if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `api_changed=${changed}\n`);
      console.log(changed ? 'API changes require deployment.' : 'API deployment skipped.');
    } else if (command === 'source') {
      const revision = verifySource();
      if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, `API_REVISION=${revision}\n`);
      console.log(`Selected merged-main API source ${revision}.`);
    } else if (command === 'check-config' || command === 'deploy') {
      const template = JSON.parse(execute('js-yaml', ['s.yaml']));
      if (command === 'deploy') await deployApi({ template });
      else { verifyConfig(template); console.log('Verified API deployment descriptor.'); }
    } else fail('Usage: node scripts/api-deployment.mjs changes|source|check-config|deploy');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
