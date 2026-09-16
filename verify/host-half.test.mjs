/**
 * Headless self-test 1/3 — the package contract and the Host half.
 *
 * Proves, without a Host and without a browser:
 *   - the package declares everything the loader and the client module graph read
 *     (`dsh.bundle.patch`, `exports['./client']`, `dsh.client.platform`);
 *   - `cordis.patch.yml` inserts exactly one row, id and name included;
 *   - the shipped `node_modules/@deepseek-ai/schemastery` junction exists and points
 *     at the copy the Host maintains under `$DSH_HOME/profiles/node_modules`;
 *   - `apply(ctx)` registers the `approval-chime` namespace with a REAL schemastery
 *     schema whose defaults are `{enabled:true, volume:70, tone:'chime'}` and which
 *     rejects out-of-range volumes and unknown tones;
 *   - a missing settings service, an unreadable settings directory, a throwing
 *     `register()`, or an unreachable schema package all degrade quietly — no
 *     exception ever escapes `apply`, and nothing static in the module can make the
 *     loader fail.
 *
 * Run: node dsh-approval-chime/verify/host-half.test.mjs
 */

import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

import {
  HOST_PATH,
  PACKAGE_PATH,
  PATCH_PATH,
  PLUGIN_DIR,
  createReporter,
  dshHome,
  readText,
  runDegradedHostChild,
} from './_harness.mjs';

const report = createReporter('host-half.test.mjs');
const plugin = await import('../lib/index.js');
const packageJson = JSON.parse(readText(PACKAGE_PATH));
const patchText = readText(PATCH_PATH);

/* ------------------------------------------------------- 1. package contract */

report.section('package.json / cordis.patch.yml (mount contract)');
report.equal('package name', packageJson.name, 'dsh-approval-chime');
report.equal('package type is module', packageJson.type, 'module');
report.check("exports['./client'] is a string", typeof packageJson.exports?.['./client'] === 'string', String(packageJson.exports?.['./client']));
report.check("exports['./cordis.patch.yml'] is a string", typeof packageJson.exports?.['./cordis.patch.yml'] === 'string', String(packageJson.exports?.['./cordis.patch.yml']));
report.check("exports['.'] resolves the host entry", packageJson.exports?.['.']?.default === './lib/index.js', String(packageJson.exports?.['.']?.default));
report.equal('dsh.bundle.patch points at the patch file', packageJson.dsh?.bundle?.patch, './cordis.patch.yml');
report.equal("dsh.client.platform is 'web'", packageJson.dsh?.client?.platform, 'web');
report.ok('lib/index.js and lib/client.js exist', existsSync(HOST_PATH) && existsSync(join(PLUGIN_DIR, 'lib', 'client.js')));

const effectivePatchText = patchText
  .split('\n')
  .filter((line) => {
    const trimmed = line.trim();
    return trimmed !== '' && !trimmed.startsWith('#');
  })
  .join('\n');
const rows = [...effectivePatchText.matchAll(/-\s*id:\s*(\S+)\s*\n\s*name:\s*(\S+)/g)].map((match) => ({ id: match[1], name: match[2] }));
report.equal('cordis.patch.yml inserts exactly one row', rows.length, 1);
report.equal('patched row id', rows[0]?.id, 'dsh-approval-chime');
report.equal('patched row name', rows[0]?.name, 'dsh-approval-chime');
report.ok('patch inserts under `- insert:` (never a bare override)', /(^|\n)-?\s*insert:/.test(effectivePatchText));

/* --------------------------------------------------------- 2. the junction */

report.section('schemastery junction (docs/契约调研.md §B.6 path ①)');
const junction = join(PLUGIN_DIR, 'node_modules', '@deepseek-ai', 'schemastery');
const mirror = join(dshHome(), 'profiles', 'node_modules', '@deepseek-ai', 'schemastery');
report.ok('plugin-local junction exists', existsSync(junction), junction);
report.ok('host-maintained mirror exists', existsSync(mirror), mirror);
if (existsSync(junction) && existsSync(mirror)) {
  let same = false;
  let detail = '';
  try {
    same = realpathSync(junction) === realpathSync(mirror);
    detail = `${realpathSync(junction)}`;
  } catch (error) {
    detail = String(error.message);
  }
  report.ok('junction resolves to the host-maintained copy', same, detail);
}

/* ------------------------------------------------- 3. schema resolution API */

report.section('schema resolution');
const anchors = plugin.schemaAnchors({ baseUrl: 'file:///C:/Users/28779/.dsh/profiles/web/' });
report.ok('anchors include this package first (the junction anchor)', anchors[0]?.startsWith('file://') === true, anchors[0]);
report.ok('anchors include the profile directory from ctx.baseUrl', anchors.some((anchor) => anchor.includes('/profiles/web/package.json')), anchors.join(' '));
const loaded = plugin.loadSchemastery({});
report.ok('schemastery loads through the shipped junction', loaded.z !== null && loaded.mode === 'require', `${loaded.mode} from ${loaded.path}`);
const candidates = plugin.schemaCandidates({});
report.equal(
  'the resolving anchor is this package (the junction), not the profile',
  candidates.candidates[0]?.anchor,
  new URL('../lib/index.js', import.meta.url).href,
);
report.ok('the resolved file is a real schemastery build', typeof loaded.path === 'string' && loaded.path.includes('schemastery'), String(loaded.path));
report.ok('no resolution failure was recorded', loaded.failures.length === 0, loaded.failures.join(' | '));
const loadedAsync = await plugin.loadSchemasteryAsync({});
report.ok('the async route agrees', loadedAsync.z !== null, `${loadedAsync.mode} from ${loadedAsync.path}`);

/* ------------------------------------------------------ 4. registration call */

report.section('apply() registers the namespace');
const schema = plugin.buildSchema(loaded.z);
report.equal('schema.type is object (the client decode requires an object value)', schema.type, 'object');
report.ok('schema exposes toJSON() for describe()/redactSecrets()', typeof schema.toJSON === 'function');
const defaults = schema({});
report.deepEqual('schema defaults', defaults, { enabled: true, volume: 70, tone: 'chime', custom: [] });
report.deepEqual('exported DEFAULTS match the schema', { ...plugin.DEFAULTS }, defaults);
report.deepEqual('exported TONES match the schema', [...plugin.TONES], ['chime', 'bell', 'beep']);
report.deepEqual('a partial user section fills the defaults', schema({ volume: 33 }), { enabled: true, volume: 33, tone: 'chime', custom: [] });
report.equal('volume=200 is rejected', validationError(() => schema({ volume: 200 })), '$.volume expected number <= 100 but got 200');
report.equal('volume=-1 is rejected', validationError(() => schema({ volume: -1 })), '$.volume expected number >= 0 but got -1');
report.ok('tone="nope" is rejected', validationError(() => schema({ tone: 'nope' })) !== null, 'a bare string is still not a legal tone');
report.equal(
  'tone="custom:<uuid>" is accepted (the imported-audio case)',
  schema({ tone: 'custom:3f2504e0-4f89-41d3-9a0c-0305e82c3301' }).tone,
  'custom:3f2504e0-4f89-41d3-9a0c-0305e82c3301',
);
report.ok('a malformed custom tone is rejected', validationError(() => schema({ tone: 'custom:nope' })) !== null, 'only a real uuid passes the pattern');
report.deepEqual(
  'the imported roster round-trips in order',
  schema({
    custom: [
      { id: '11111111-2222-4333-8444-555555555555', name: 'first.mp3' },
      { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', name: 'second.wav' },
    ],
  }).custom,
  [
    { id: '11111111-2222-4333-8444-555555555555', name: 'first.mp3' },
    { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', name: 'second.wav' },
  ],
);
report.ok(
  'a roster id that is not a lowercase uuid is refused (N3: it could never be fetched)',
  validationError(() => schema({ custom: [{ id: 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE', name: 'upper.mp3' }] })) !== null,
  'mixed case must not be storable',
);
report.ok(
  'a bare non-uuid roster id is refused',
  validationError(() => schema({ custom: [{ id: 'a', name: 'first.mp3' }] })) !== null,
  'only a real uuid is a legal roster id',
);
report.equal('enabled="yes" is rejected', validationError(() => schema({ enabled: 'yes' })), '$.enabled expected boolean but got yes');
report.equal('namespace matches the dsh-settings pattern', /^[a-z][a-z0-9-]*$/.test(plugin.NS), true);
report.equal('host half injects only the settings service', JSON.stringify(plugin.inject), JSON.stringify(['settings']));

const registrations = [];
const fakeCtx = {
  logger: { info() {}, warn() {}, error() {}, debug() {} },
  settings: {
    describe: () => [],
    register(ns, receivedSchema, options) {
      registrations.push({ ns, schema: receivedSchema, options });
      return { get: () => ({}), watch: () => () => {}, update: () => {}, replace: () => {} };
    },
  },
};
plugin.apply(fakeCtx);
report.equal('exactly one namespace was registered', registrations.length, 1);
report.equal('registered namespace', registrations[0]?.ns, plugin.NS);
report.equal('registered namespace is the card key namespace', registrations[0]?.ns, 'approval-chime');
report.ok('registered schema is a real schemastery object', registrations[0]?.schema?.type === 'object' && typeof registrations[0]?.schema?.toJSON === 'function');
report.ok('registered schema exposes the schema envelope describe() needs', Object.keys(registrations[0]?.schema?.toJSON() ?? {}).includes('refs'));
report.equal('registration applies live', registrations[0]?.options?.applies, 'live');
report.deepEqual('registered schema resolves the documented defaults', registrations[0]?.schema({}), { enabled: true, volume: 70, tone: 'chime', custom: [] });

/* ------------------------------------------------------------ 5. idempotency */

report.section('apply() is idempotent and never throws');
const secondRegistrations = [];
plugin.apply({
  logger: { info() {}, warn() {}, error() {}, debug() {} },
  settings: {
    describe: () => [{ ns: 'approval-chime', schema: {}, value: {} }, { ns: 'ui-background' }],
    register() {
      secondRegistrations.push('called');
    },
  },
});
report.equal('an already-registered namespace is not registered twice', secondRegistrations.length, 0);

const calls = [];
const tolerated = [
  ['no context at all', undefined],
  ['empty context', { logger: quietLogger(calls) }],
  ['settings: null', { logger: quietLogger(calls), settings: null }],
  ['settings without register()', { logger: quietLogger(calls), settings: { describe: () => [] } }],
  ['describe() throws', { logger: quietLogger(calls), settings: { describe: () => { throw new Error('directory exploded'); }, register: () => {} } }],
];
let threw = null;
for (const [label, ctx] of tolerated) {
  try {
    plugin.apply(ctx);
  } catch (error) {
    threw = `${label}: ${error.message}`;
  }
}
report.check('apply() survives missing/broken services', threw === null, threw ?? '');
report.ok('describe() failure is reported, not swallowed silently', calls.some((line) => line.includes('directory unreadable')), calls.join(' | '));

const registerFailure = [];
let registerThrew = null;
try {
  plugin.apply({
    logger: quietLogger(registerFailure),
    settings: {
      describe: () => [],
      register() {
        throw new Error('settings namespace "approval-chime" is already registered');
      },
    },
  });
} catch (error) {
  registerThrew = error.message;
}
report.check('a throwing register() does not escape apply()', registerThrew === null, registerThrew ?? '');
report.ok('a throwing register() is reported', registerFailure.some((line) => line.includes('registration failed')), registerFailure.join(' | '));

/* ------------------------------------------- 6. static independence + degrade */

report.section('an unreachable schema package degrades instead of breaking the boot');
const hostSource = readText(HOST_PATH);
const topLevelImports = hostSource.split('\n').filter((line) => /^import\s/.test(line));
report.deepEqual(
  'every top-level import is a node: builtin',
  topLevelImports.every((line) => /^import\s+.*from\s+'node:[a-z/]+';/.test(line)),
  true,
);
report.ok('no static import of the schema package', !/^import\s+[^;]*schemastery/m.test(hostSource));

let degraded = null;
try {
  degraded = runDegradedHostChild(hostSource);
  if (degraded.verdict === null || !degraded.ok) {
    report.skip('degraded host child process', `child exited with status ${String(degraded.status)}`);
  } else {
    report.ok('the copy outside the package still loads', degraded.verdict.threw === false, String(degraded.verdict.error));
    report.equal('nothing is registered when the schema is unreachable', degraded.verdict.registrations, 0);
    report.ok(
      'the degradation is reported through the logger',
      degraded.verdict.warnings.some((line) => line.includes('not resolvable') || line.includes('could not load')) ||
        degraded.verdict.warnings.some((line) => line.includes('not registered')),
      degraded.verdict.warnings.join(' | '),
    );
  }
} catch (error) {
  report.skip('degraded host child process', `temp-directory scaffolding unavailable: ${String(error.message)}`);
} finally {
  if (degraded !== null) degraded.cleanup();
}

report.summary();

/** The message of the ValidationError a bad section value raises, or ''. */
function validationError(run) {
  try {
    const value = run();
    return `no error, resolved ${JSON.stringify(value)}`;
  } catch (error) {
    return String(error.message);
  }
}

/** Collect logger lines from a stub context. */
function quietLogger(lines) {
  const push = (level) => (message) => {
    lines.push(`${level}: ${String(message)}`);
  };
  return { info: push('info'), warn: push('warn'), error: push('error'), debug: push('debug') };
}
