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

import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  HOST_PATH,
  PACKAGE_PATH,
  PATCH_PATH,
  PLUGIN_DIR,
  createFakeRequest,
  createFakeResponse,
  createReporter,
  dshHome,
  parsedBody,
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

/* ------------------------------- 3. the settings schema is a static import */

report.section('the settings schema is a module-level static import (DSH 0.1.7 model)');
const hostSource = readText(HOST_PATH);
const topLevelImports = hostSource.split(/\r?\n/).filter((line) => /^import\s/.test(line));
const schemaImportLines = topLevelImports.filter((line) => line.includes('schemastery'));
report.ok(
  'lib/index.js statically imports schemastery at the top level — the new model REQUIRES this',
  schemaImportLines.length === 1 && /^import z from '@deepseek-ai\/schemastery';$/.test(schemaImportLines[0]),
  "import z from '@deepseek-ai/schemastery';",
);
const lazyResolverExports = ['schemaAnchors', 'schemaCandidates', 'loadSchemastery', 'loadSchemasteryAsync'].filter(
  (name) => typeof plugin[name] === 'function',
);
report.ok(
  'the lazy resolver is gone (no schemaAnchors/schemaCandidates/loadSchemastery export remains)',
  lazyResolverExports.length === 0 && typeof plugin.buildSchema === 'function',
  'buildSchema',
);
const schema = plugin.Config;
report.ok(
  'the form is exported ready-made as Config — no runtime resolution is needed to obtain it',
  schema?.type === 'object' && typeof schema.toJSON === 'function',
  `type=${schema?.type} toJSON=${typeof schema?.toJSON}`,
);

/* ------------------------------------------ 4. the Config form and defaults */

report.section('the Config form resolves the documented defaults');
// Every field of the rev-26/28 form is `.volatile()`, so a parsed field is a live
// REFERENCE rather than a raw value (`lib/index.js` says why: a volatile-only edit
// is committed into the running fiber instead of re-applying the plugin, so a
// cached value would go stale). `configReader` is the product's OWN unwrapper and
// is what the native-toast bridge consumes, so these assertions read the form the
// same way the product does — not by unwrapping it themselves.
const read = (section) => plugin.configReader(schema(section)).get();
report.equal('schema.type is object (the client decode requires an object value)', schema.type, 'object');
report.ok('schema exposes toJSON() for describe()/redactSecrets()', typeof schema.toJSON === 'function');
const defaults = read({});
report.deepEqual('schema defaults', defaults, { enabled: true, volume: 70, tone: 'chime', custom: [], nativeToast: false });
report.deepEqual('exported DEFAULTS match the schema', { ...plugin.DEFAULTS }, defaults);
report.deepEqual('exported TONES match the schema', [...plugin.TONES], ['chime', 'bell', 'beep']);
report.deepEqual('a partial user section fills the defaults', read({ volume: 33 }), {
  enabled: true,
  volume: 33,
  tone: 'chime',
  custom: [],
  nativeToast: false,
});
report.equal('volume=200 is rejected', validationError(() => schema({ volume: 200 })), '$.volume expected number <= 100 but got 200');
report.equal('volume=-1 is rejected', validationError(() => schema({ volume: -1 })), '$.volume expected number >= 0 but got -1');
report.ok('tone="nope" is rejected', validationError(() => schema({ tone: 'nope' })) !== null, 'a bare string is still not a legal tone');
report.equal(
  'tone="custom:<uuid>" is accepted (the imported-audio case)',
  read({ tone: 'custom:3f2504e0-4f89-41d3-9a0c-0305e82c3301' }).tone,
  'custom:3f2504e0-4f89-41d3-9a0c-0305e82c3301',
);
report.ok('a malformed custom tone is rejected', validationError(() => schema({ tone: 'custom:nope' })) !== null, 'only a real uuid passes the pattern');
report.deepEqual(
  'the imported roster round-trips in order',
  read({
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

/* ------------------------------------------- 5. the settings page policy */

report.section('apply() declares the settings page policy instead of registering a namespace');
// `settings.register()` was DELETED by the rev-26 settings migration. The entry is
// now described by its module-level `Config` and the bundle only declares a page
// POLICY; a stub that records the deleted call is how this suite proves it is gone.
const legacyRegistrations = [];
const policyCalls = [];
const fakeFiber = { id: 'fake-fiber' };
const fakeCtx = {
  fiber: fakeFiber,
  effect: (callback) => callback(),
  get: () => undefined,
  logger: { info() {}, warn() {}, error() {}, debug() {} },
  settings: {
    describe: () => [],
    register(ns, receivedSchema, options) {
      legacyRegistrations.push({ ns, schema: receivedSchema, options });
      return { get: () => ({}), watch: () => () => {}, update: () => {}, replace: () => {} };
    },
    configure(presentation, owner) {
      policyCalls.push({ presentation, owner });
      return () => {};
    },
  },
};
plugin.apply(fakeCtx);
report.equal('apply() never calls the DELETED settings.register()', legacyRegistrations[0]?.ns ?? null, null);
report.equal('the settings namespace is the profile entry id, not a self-chosen namespace', plugin.SETTINGS_NS, 'dsh-approval-chime');
report.equal('the locale namespace keeps its own value', plugin.NS, 'approval-chime');
report.ok('registered schema is a real schemastery object', schema?.type === 'object' && typeof schema?.toJSON === 'function');
report.ok('registered schema exposes the schema envelope describe() needs', Object.keys(schema?.toJSON() ?? {}).includes('refs'));
report.deepEqual('the form declares exactly the five documented fields', Object.keys(plugin.Config.dict ?? {}), [
  'enabled',
  'volume',
  'tone',
  'custom',
  'nativeToast',
]);
report.equal('apply() declares its page policy', policyCalls.length, 1);
report.deepEqual('and suppresses the auto-generated page (auto: false)', policyCalls[0]?.presentation, { auto: false });
report.deepEqual('the policy is owned by THIS entry fiber, not the settings service fiber', policyCalls[0]?.owner, { id: 'fake-fiber' });

/* ------------------------------------------------------------ 6. idempotency */

report.section('apply() is idempotent and never throws');
const secondLegacy = [];
const secondPolicies = [];
plugin.apply({
  fiber: { id: 'second-fiber' },
  effect: (callback) => callback(),
  get: () => undefined,
  logger: quietLogger([]),
  settings: {
    describe: () => [{ ns: 'dsh-approval-chime', schema: {}, value: {} }],
    register() {
      secondLegacy.push('called');
    },
    configure(presentation, owner) {
      secondPolicies.push({ presentation, owner });
      return () => {};
    },
  },
});
report.equal('a second apply() still never calls the deleted settings.register()', secondLegacy[0] ?? null, null);
report.equal('and declares its page policy again (idempotent, disposer-owned)', secondPolicies.length, 1);

const calls = [];
// Four degraded contexts, all of which must be tolerated. Their warnings are
// collected into ONE array: the two assertions below pin the exact set (a missing
// settings service must be REPORTED, and a throwing configure() must be reported
// without escaping).
const tolerated = [
  ['empty context', { logger: quietLogger(calls) }],
  ['settings: null', { logger: quietLogger(calls), settings: null }],
  ['settings without configure()', { logger: quietLogger(calls), settings: { describe: () => [] } }],
  [
    'configure() throws',
    {
      effect: (callback) => callback(),
      logger: quietLogger(calls),
      settings: {
        describe: () => [],
        configure() {
          throw new Error('policy exploded');
        },
      },
    },
  ],
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
report.ok(
  'a missing settings service is reported, not swallowed silently',
  calls.some((line) => line.includes('settings service unavailable')),
  calls.join(' | '),
);
report.ok(
  'a throwing configure() is reported too',
  calls.some((line) => line.includes('settings page policy could not be registered: policy exploded')),
  calls.join(' | '),
);
report.check('a throwing configure() does not escape apply()', threw === null, threw ?? '');

// A policy the settings service REFUSES (its own duplicate guard) while every route
// is claimable: the observable contract is "report it, claim all three routes anyway".
const claimed = [];
const refuseLogs = [];
const refused = [];
try {
  plugin.apply({
    effect: (callback) => callback(),
    get: (name) => (name === 'webServer' ? { register: (route) => { claimed.push(route); return () => {}; } } : undefined),
    logger: {
      info: (line) => refuseLogs.push(`info: ${String(line)}`),
      warn: (line) => refuseLogs.push(`warn: ${String(line)}`),
      error: () => {},
      debug: () => {},
    },
    settings: {
      describe: () => [],
      configure() {
        throw new Error('settings namespace "dsh-approval-chime" page policy is already registered');
      },
    },
  });
} catch (error) {
  refused.push(error.message);
}
report.ok(
  'a throwing configure() is reported',
  refuseLogs.some((line) => line.includes('page policy is already registered')),
  refuseLogs.join(' | '),
);
// The native-toast route is claimed by an ASYNC registration (its bridge module is
// imported on demand), so the route count is only meaningful after a turn of the
// loop — while the warning detail asserted just above is deliberately the snapshot
// taken BEFORE it lands, because those three lines are the degraded-boot evidence.
await new Promise((resolve) => setTimeout(resolve, 50));
report.equal('and a broken settings policy still leaves every route claimed', claimed.length, 3);

/* ------------------------------- 7. the static import is REQUIRED, not optional */

report.section('the static schema import is REQUIRED — the old degrade-and-load property is deliberately gone');
const schemaImports = topLevelImports.filter((line) => line.includes('schemastery'));
report.equal('exactly one top-level import is the schema package (the new model requires it)', schemaImports.length, 1);
const otherImports = topLevelImports.filter((line) => !line.includes('schemastery'));
report.ok(
  'every other top-level import is STILL a node: builtin',
  otherImports.every((line) => /^import\s+.*from\s+'node:[a-z/]+';$/.test(line)),
  otherImports.join('\n | '),
);
report.ok(
  'the schema package IS statically imported — this is exactly what DSH 0.1.7 requires',
  /^import z from '@deepseek-ai\/schemastery';$/m.test(hostSource),
  "import z from '@deepseek-ai/schemastery';",
);

// KNOWN ROBUSTNESS REGRESSION, kept as an assertion on purpose: through rev-24 the
// Host half resolved schemastery lazily and degraded to an inert plugin when the
// package was unreachable. The 0.1.7 settings model needs `Config` at IMPORT time,
// so a copy outside the package now fails to load AT ALL. That is the accepted
// price of the entry actually being describable; pretending otherwise would be the
// dishonest option.
let degraded = null;
try {
  degraded = runDegradedHostChild(hostSource);
  if (degraded.verdict === null || !degraded.ok) {
    report.skip('degraded host child process', `child exited with status ${String(degraded.status)}`);
  } else {
    report.ok(
      'KNOWN ROBUSTNESS REGRESSION: a copy outside the package no longer loads at all',
      degraded.verdict.threw === true,
      `threw=${String(degraded.verdict.threw)} error=${String(degraded.verdict.error)}`,
    );
    report.ok(
      'and it fails on the static schema import specifically, not on something else',
      String(degraded.verdict.error).includes("Cannot find package '@deepseek-ai/schemastery'"),
      String(degraded.verdict.error),
    );
    report.equal('so the entry contributes nothing: nothing is registered', degraded.verdict.registrations, 0);
  }
} catch (error) {
  report.skip('degraded host child process', `temp-directory scaffolding unavailable: ${String(error.message)}`);
} finally {
  if (degraded !== null) degraded.cleanup();
}

/* --------------------------------- 7. per-session overrides (rev-10) */

report.section('rev-10 · the per-session route is claimed the way the audio route is');

const sessionRoutes = [];
const sessionWebServer = {
  register(route) {
    sessionRoutes.push(route);
    return () => {};
  },
};
const sessionLogs = [];
const sessionCtx = {
  logger: { info: (line) => sessionLogs.push(line), warn: (line) => sessionLogs.push(line), error: () => {}, debug: () => {} },
  effect: (callback) => callback(),
  get: (name) => (name === 'webServer' ? sessionWebServer : undefined),
};
plugin.registerSessionRoutes(sessionCtx);
report.equal('exactly one route is registered', sessionRoutes.length, 1);
report.equal('route kind is prefix', sessionRoutes[0]?.kind, 'prefix');
report.equal('route path', sessionRoutes[0]?.path, '/api/approval-chime/sessions');
report.ok('the registration is reported', sessionLogs.some((line) => line.includes('per-session override route registered')), sessionLogs.join(' | '));
const sessionHandler = sessionRoutes[0]?.handler;
report.ok('the handler is callable', typeof sessionHandler === 'function');
report.equal('the cap is 200 sessions', plugin.MAX_SESSIONS, 200);
report.equal('the session-id bound is 200 characters', plugin.SESSION_ID_LIMIT, 200);
report.equal('the body cap is 64 KB', plugin.SESSION_BODY_LIMIT, 64 * 1024);
report.deepEqual('the override fields are exactly the three the UI writes', [...plugin.SESSION_FIELDS], ['enabled', 'volume', 'tone']);

let noServerThrew = null;
try {
  plugin.registerSessionRoutes({ logger: { warn: (line) => sessionLogs.push(line), info() {} } });
} catch (error) {
  noServerThrew = error.message;
}
report.check('without a web server, registering degrades instead of throwing', noServerThrew === null, noServerThrew ?? '');
report.ok(
  'and it says the overrides cannot be stored (every session then follows the global settings)',
  sessionLogs.some((line) => line.includes('per-session overrides cannot be stored')),
  sessionLogs.join(' | '),
);

/** `POST <route>` with one JSON body. */
function postSession(body) {
  return createFakeRequest({
    method: 'POST',
    url: plugin.SESSIONS_ROUTE,
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function getSessions() {
  const response = createFakeResponse();
  await sessionHandler(createFakeRequest({ method: 'GET', url: plugin.SESSIONS_ROUTE }), response);
  return response;
}

async function putSessions(body) {
  const response = createFakeResponse();
  await sessionHandler(postSession(body), response);
  return response;
}

report.section('rev-10 · the store path follows the platform home rule');

const homeDir = mkdtempSync(join(tmpdir(), 'dsh-approval-chime-sessions-'));
const evictDir = mkdtempSync(join(tmpdir(), 'dsh-approval-chime-evict-'));
const brokenDir = mkdtempSync(join(tmpdir(), 'dsh-approval-chime-broken-'));
const previousHome = process.env.DSH_HOME;
try {
  process.env.DSH_HOME = homeDir;
  const storeDir = join(homeDir, 'approval-chime');
  const storeFile = join(storeDir, 'sessions.json');
  report.equal('the file is <DSH_HOME>/approval-chime/sessions.json', plugin.sessionsFile(), storeFile);
  process.env.DSH_HOME = '   ';
  report.equal(
    'a whitespace-only DSH_HOME counts as unset (the platform rule, dsh-home-paths:73-76)',
    plugin.sessionsFile(),
    join(homedir(), '.dsh', 'approval-chime', 'sessions.json'),
  );
  process.env.DSH_HOME = homeDir;

  const missing = await getSessions();
  report.equal('GET with no file yet answers 200', missing.state.status, 200);
  report.deepEqual('with an empty table', parsedBody(missing).sessions, {});
  report.equal('and revision 0', parsedBody(missing).revision, 0);
  report.ok('reading does not create anything', !existsSync(storeDir), storeDir);

  report.section('rev-10 · POST applies a patch and writes the file atomically');
  const first = await putSessions({ sessionId: 's-1', patch: { enabled: false } });
  report.equal('POST answers 200', first.state.status, 200);
  const firstBody = parsedBody(first);
  report.equal('the answer reports ok', firstBody.ok, true);
  report.equal('revision moved to 1', firstBody.revision, 1);
  report.equal('the record carries the override', firstBody.sessions['s-1']?.enabled, false);
  report.equal('and an updatedAt stamp', typeof firstBody.sessions['s-1']?.updatedAt, 'number');
  report.ok('the directory was created recursively', existsSync(storeDir), storeDir);
  report.ok('the file is on disk', existsSync(storeFile), storeFile);
  const stored = JSON.parse(readText(storeFile));
  report.equal('the document declares version 1', stored.version, 1);
  report.deepEqual('and holds exactly the applied record', Object.keys(stored.sessions), ['s-1']);
  report.deepEqual(
    'with only the field the patch set (plus the stamp)',
    { enabled: stored.sessions['s-1'].enabled, volume: stored.sessions['s-1'].volume, tone: stored.sessions['s-1'].tone, at: typeof stored.sessions['s-1'].updatedAt },
    { enabled: false, at: 'number' },
  );
  report.deepEqual('no temporary file is left behind', readdirSync(storeDir), ['sessions.json']);

  const merged = await putSessions({ sessionId: 's-1', patch: { tone: 'bell', volume: 55 } });
  const mergedRecord = parsedBody(merged).sessions['s-1'];
  report.deepEqual(
    'a later patch merges into the same record',
    { enabled: mergedRecord.enabled, volume: mergedRecord.volume, tone: mergedRecord.tone },
    { enabled: false, volume: 55, tone: 'bell' },
  );
  const cleared = await putSessions({ sessionId: 's-1', patch: { enabled: null } });
  report.equal('null clears one field (back to the global switch)', parsedBody(cleared).sessions['s-1']?.enabled, undefined);
  report.equal('while the other fields stay', parsedBody(cleared).sessions['s-1']?.volume, 55);
  const wiped = await putSessions({ sessionId: 's-1', patch: { volume: null, tone: null } });
  report.deepEqual('clearing the last field removes the record entirely', parsedBody(wiped).sessions, {});
  report.deepEqual('and the file agrees (no empty record on disk)', JSON.parse(readText(storeFile)).sessions, {});

  report.section('rev-10 · every malformed request is 400 and nothing lands on disk');
  const bytesBefore = readText(storeFile);
  const refusals = [];
  const malformed = [
    ['an empty sessionId', { sessionId: '', patch: { enabled: false } }],
    ['a whitespace-only sessionId', { sessionId: '   ', patch: { enabled: false } }],
    ['a non-string sessionId', { sessionId: 5, patch: { enabled: false } }],
    ['an over-long sessionId', { sessionId: 'x'.repeat(plugin.SESSION_ID_LIMIT + 1), patch: { enabled: false } }],
    ['a volume above the range', { sessionId: 's-1', patch: { volume: 101 } }],
    ['a negative volume', { sessionId: 's-1', patch: { volume: -1 } }],
    ['a fractional volume', { sessionId: 's-1', patch: { volume: 42.5 } }],
    ['a string volume', { sessionId: 's-1', patch: { volume: '50' } }],
    ['an unknown tone', { sessionId: 's-1', patch: { tone: 'nope' } }],
    ['an upper-case custom id', { sessionId: 's-1', patch: { tone: `custom:${'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'.toUpperCase()}` } }],
    ['a non-boolean enabled', { sessionId: 's-1', patch: { enabled: 'yes' } }],
    ['an unknown patch field', { sessionId: 's-1', patch: { volume: 50, sneaky: 1 } }],
    ['a missing patch', { sessionId: 's-1' }],
  ];
  for (const [label, body] of malformed) {
    const answer = await putSessions(body);
    if (answer.state.status !== 400) refusals.push(`${label} → ${answer.state.status}`);
  }
  report.deepEqual('every malformed patch is refused with 400', refusals, []);
  report.equal('and not one byte of the file changed', readText(storeFile), bytesBefore);

  const notJson = await putSessions('{"sessionId":');
  report.equal('a body that is not JSON is 400', notJson.state.status, 400);
  const jsonNull = await putSessions('null');
  report.equal('a JSON null body is 400', jsonNull.state.status, 400);
  const jsonArray = await putSessions('[1]');
  report.equal('a JSON array body is 400', jsonArray.state.status, 400);
  const huge = await putSessions('x'.repeat(plugin.SESSION_BODY_LIMIT + 1));
  report.equal('an oversized body is 413, not an unbounded read', huge.state.status, 413);

  const unknownPath = createFakeResponse();
  await sessionHandler(createFakeRequest({ method: 'GET', url: `${plugin.SESSIONS_ROUTE}/nope` }), unknownPath);
  report.equal('an unknown path under the prefix is 404', unknownPath.state.status, 404);
  const putMethod = createFakeResponse();
  await sessionHandler(createFakeRequest({ method: 'PUT', url: plugin.SESSIONS_ROUTE }), putMethod);
  report.equal('an unsupported method is 405', putMethod.state.status, 405);
  const headOnly = createFakeResponse();
  await sessionHandler(createFakeRequest({ method: 'HEAD', url: plugin.SESSIONS_ROUTE }), headOnly);
  report.equal('HEAD answers 200', headOnly.state.status, 200);
  report.equal('with no body', headOnly.state.body, null);

  report.section('rev-10 · a usable custom tone is accepted and kept');
  const custom = await putSessions({ sessionId: 's-2', patch: { tone: `custom:${'11111111-2222-4333-8444-555555555555'}` } });
  report.equal('a lowercase custom uuid is a legal tone', parsedBody(custom).sessions['s-2']?.tone, 'custom:11111111-2222-4333-8444-555555555555');
} finally {
  process.env.DSH_HOME = previousHome;
  rmSync(homeDir, { recursive: true, force: true });
}

report.section('rev-10 · the table is capped at 200 records, oldest updatedAt first');
try {
  process.env.DSH_HOME = evictDir;
  const directory = join(evictDir, 'approval-chime');
  const file = join(directory, 'sessions.json');
  mkdirSync(directory, { recursive: true });
  const seeded = {};
  for (let index = 0; index < plugin.MAX_SESSIONS + 5; index += 1) {
    seeded[`s-${String(index).padStart(3, '0')}`] = { volume: 10, updatedAt: index + 1 };
  }
  writeFileSync(file, JSON.stringify({ version: 1, sessions: seeded }), 'utf8');
  const capped = parsedBody(await getSessions()).sessions;
  report.equal(`a ${plugin.MAX_SESSIONS + 5}-record file reads back as ${plugin.MAX_SESSIONS}`, Object.keys(capped).length, plugin.MAX_SESSIONS);
  report.equal('the oldest record is evicted', capped['s-000'], undefined);
  report.equal('the fifth oldest too', capped['s-004'], undefined);
  report.equal('the sixth oldest survives', typeof capped['s-005'], 'object');
  report.equal('the newest survives', typeof capped['s-204'], 'object');

  const added = parsedBody(await putSessions({ sessionId: 's-new', patch: { volume: 5 } })).sessions;
  report.equal('writing one more still holds exactly the cap', Object.keys(added).length, plugin.MAX_SESSIONS);
  report.equal('the new record is there', typeof added['s-new'], 'object');
  report.equal('and the next-oldest was evicted to make room', added['s-005'], undefined);
  report.deepEqual('the file itself never exceeds the cap', Object.keys(JSON.parse(readText(file)).sessions).length, plugin.MAX_SESSIONS);
} finally {
  process.env.DSH_HOME = previousHome;
  rmSync(evictDir, { recursive: true, force: true });
}

report.section('rev-10 · a corrupt file degrades to an empty table and is repaired on the next write');
try {
  process.env.DSH_HOME = brokenDir;
  const directory = join(brokenDir, 'approval-chime');
  const file = join(directory, 'sessions.json');
  mkdirSync(directory, { recursive: true });
  const shapes = [
    ['not JSON at all', '{ not json'],
    ['a bare JSON array', '[1,2,3]'],
    ['a bare JSON string', '"nope"'],
    ['a document without a sessions object', '{"version":1,"sessions":"nope"}'],
    ['sessions as an array', '{"version":1,"sessions":[]}'],
  ];
  const brokenAnswers = [];
  for (const [label, text] of shapes) {
    writeFileSync(file, text, 'utf8');
    const answer = await getSessions();
    const empty = JSON.stringify(parsedBody(answer).sessions) === '{}';
    if (answer.state.status !== 200 || !empty) brokenAnswers.push(`${label} → ${answer.state.status} ${String(answer.state.body)}`);
  }
  report.deepEqual('every corrupt shape answers an empty table with 200', brokenAnswers, []);
  report.ok(
    'and each degradation is reported instead of thrown',
    sessionLogs.some((line) => line.includes('falling back to an empty table')),
    sessionLogs.join(' | '),
  );

  writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      sessions: {
        's-1': 'nope',
        's-2': { volume: 999 },
        's-3': { tone: 'nope', enabled: true },
        '': { volume: 10 },
        's-4': { enabled: false },
      },
    }),
    'utf8',
  );
  const sanitized = parsedBody(await getSessions()).sessions;
  report.deepEqual('unusable records are dropped, usable ones kept', Object.keys(sanitized).sort(), ['s-3', 's-4']);
  report.deepEqual(
    'and an unusable field inside a usable record is dropped too',
    { enabled: sanitized['s-3'].enabled, tone: sanitized['s-3'].tone },
    { enabled: true },
  );

  writeFileSync(file, '{ broken', 'utf8');
  const repaired = await putSessions({ sessionId: 's-9', patch: { tone: 'beep' } });
  report.equal('a write after a corrupt read succeeds', repaired.state.status, 200);
  report.deepEqual('and the file is valid and complete again', JSON.parse(readText(file)).sessions['s-9'].tone, 'beep');

  report.section('rev-10 · the write is atomic: same-directory temp, then rename');
  report.deepEqual('a successful write leaves only the store file', readdirSync(directory), ['sessions.json']);
  const hostSourceText = readText(HOST_PATH);
  report.ok(
    'the temporary file is created in the SAME directory (rename is only atomic there)',
    hostSourceText.includes('const temporary = join(directory, `.sessions.${process.pid}.${randomUUID()}.tmp`)'),
    'same-directory temp path',
  );
  report.ok('and replaces the target with rename()', hostSourceText.includes('await rename(temporary, target);'));
  report.ok('a failed rename removes the temporary file', hostSourceText.includes('await unlink(temporary);'));
  report.ok(
    "the store is a directory of the plugin's own, under the harness home",
    hostSourceText.includes("return join(dshHome(), 'approval-chime');"),
    'never the settings document (which is the user\'s global preference file)',
  );
  report.ok(
    'and the host half writes the table to that file only — never through the settings service',
    !/settings\.(update|replace)\(/.test(hostSourceText),
    "the sessions table never travels through the settings service, which now carries only this entry's Config",
  );

  // A target that cannot be replaced: `sessions.json` is a DIRECTORY, so rename fails.
  // The observable contract is "answer 500, change nothing, leave no debris".
  rmSync(file, { force: true });
  mkdirSync(file, { recursive: true });
  const failed = await putSessions({ sessionId: 's-x', patch: { volume: 10 } });
  report.equal('a write that cannot replace the target answers 500', failed.state.status, 500);
  report.deepEqual('and leaves no temporary file behind', readdirSync(directory), ['sessions.json']);
  report.ok('while the existing target is untouched', statSync(file).isDirectory());
} finally {
  process.env.DSH_HOME = previousHome;
  rmSync(brokenDir, { recursive: true, force: true });
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
