/**
 * Independent probe 4 — the Host half.
 *
 * Covers, independently of `verify/host-half.test.mjs`:
 *   (a) the real schema package resolves from the REAL `lib/index.js` path, with
 *       the raw paths printed (junction vs host-maintained mirror);
 *   (b) `apply()` registers exactly the documented namespace, options and
 *       defaults on the normal path;
 *   (c) `apply()` never throws and never leaks an unhandled rejection when the
 *       settings service is missing, broken, or when `register()` itself throws;
 *   (d) with the package copied OUTSIDE the plugin tree and `$DSH_HOME` pointed
 *       at an empty directory, the schema package is unreachable (verified
 *       negative control) and the plugin degrades to inert instead of failing
 *       the loader entry.
 *
 * Run: node dsh-approval-chime/verify-independent/probe-4-host-half.mjs
 */

import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  DSH_HOME,
  HOST_PATH,
  HOST_SOURCE,
  NS,
  PLUGIN_DIR,
  readOrNull,
  settle,
  suite,
  watchRejections,
} from './kit/platform.mjs';

const report = suite('probe-4-host-half.mjs');
const rejections = watchRejections();
const plugin = await import(pathToFileURL(HOST_PATH).href);

/* ------------------------------------------------------ (a) schema resolution */

report.group('a. the schema package resolves from the real lib/index.js path');

const junction = join(PLUGIN_DIR, 'node_modules', '@deepseek-ai', 'schemastery');
const mirror = join(DSH_HOME, 'profiles', 'node_modules', '@deepseek-ai', 'schemastery');
report.check('the plugin-local junction exists', existsSync(junction), junction);
report.check('the Host-maintained mirror exists', existsSync(mirror), mirror);
report.same('both resolve to the same real path', existsSync(junction) && existsSync(mirror) ? realpathSync(junction) === realpathSync(mirror) : false, true);
report.note('junction realpath', existsSync(junction) ? realpathSync(junction) : 'missing');

const resolver = createRequire(pathToFileURL(HOST_PATH).href);
let resolvedFromLib = null;
let resolveError = null;
try {
  resolvedFromLib = resolver.resolve('@deepseek-ai/schemastery');
} catch (error) {
  resolveError = String(error.message).split('\n')[0];
}
report.check('createRequire(lib/index.js).resolve() succeeded', resolvedFromLib !== null, resolvedFromLib === null ? resolveError : resolvedFromLib);
report.check('the resolved entry is the real schemastery build', typeof resolvedFromLib === 'string' && resolvedFromLib.includes('schemastery'), String(resolvedFromLib));
if (resolvedFromLib !== null) {
  const loadedViaRequire = resolver('@deepseek-ai/schemastery');
  report.same('the resolved module is callable', typeof loadedViaRequire, 'function');
  report.same('no transpiled default wrapper is needed', loadedViaRequire.default, undefined);
}

const anchors = plugin.schemaAnchors({});
report.same('the first anchor is this package (the junction lives there)', anchors[0], pathToFileURL(HOST_PATH).href);
const candidates = plugin.schemaCandidates({});
report.same('the first candidate resolved through the junction anchor', candidates.candidates[0]?.anchor, pathToFileURL(HOST_PATH).href);
report.same('no resolution failure was recorded with the junction present', candidates.failures.length, 0);
report.note('resolved candidates', candidates.candidates);
report.note('resolution failures', candidates.failures);

const syncLoad = plugin.loadSchemastery({});
report.same('the synchronous route loads a schema factory', typeof syncLoad.z, 'function');
report.same('the synchronous route used require()', syncLoad.mode, 'require');
const asyncLoad = await plugin.loadSchemasteryAsync({});
report.same('the ESM fallback route agrees', typeof asyncLoad.z, 'function');

/* ------------------------------------------------------------ (b) normal path */

report.group('b. the normal registration path');

const calls = [];
const okCtx = {
  logger: { info: (line) => calls.push(['info', line]), warn: (line) => calls.push(['warn', line]), error: () => {}, debug: () => {} },
  settings: {
    describe: () => [],
    register(ns, schema, options) {
      calls.push(['register', ns, options]);
      return { get: () => ({}), watch: () => () => {}, update: () => {}, replace: () => {} };
    },
  },
};

let normalThrew = null;
try {
  plugin.apply(okCtx);
} catch (error) {
  normalThrew = String(error.message);
}
report.same('the normal path does not throw', normalThrew, null);
report.same('exactly one register() call', calls.filter((entry) => entry[0] === 'register').length, 1);
const registered = calls.find((entry) => entry[0] === 'register');
report.same('the registered namespace', registered?.[1], NS);
report.deep('the registration options', registered?.[2], { applies: 'live' });
report.same('the module injects only the settings service', JSON.stringify(plugin.inject), JSON.stringify(['settings']));
report.same('the namespace matches the Host pattern', /^[a-z][a-z0-9-]*$/.test(NS), true);
report.same('the namespace matches dsh-settings:82-86 exactly', /^[a-z][a-z0-9-]*$/.test(plugin.NS), true);

const schema = plugin.buildSchema(syncLoad.z);
report.same('the schema is an object schema', schema.type, 'object');
/* rev-4 added the imported-tone roster, so the namespace's defaults carry `custom: []`
 * (lib/index.js DEFAULTS). The four documented keys are still exactly these. */
report.deep('the schema resolves the documented defaults (rev-4 adds the custom roster)', schema({}), { enabled: true, volume: 70, tone: 'chime', custom: [] });
report.deep('the exported DEFAULTS match (rev-4 adds the custom roster)', { ...plugin.DEFAULTS }, { enabled: true, volume: 70, tone: 'chime', custom: [] });
report.deep('the exported TONES match', [...plugin.TONES], ['chime', 'bell', 'beep']);
const envelope = schema.toJSON();
report.check('the schema exposes the describe() envelope', Array.isArray(envelope.refs) === false && typeof envelope === 'object' && envelope.refs !== undefined, JSON.stringify(envelope).slice(0, 200));
report.check(
  'the schema rejects an out-of-range volume',
  (() => {
    try {
      schema({ volume: 101 });
      return false;
    } catch {
      return true;
    }
  })(),
);
report.check(
  'the schema rejects an unknown tone',
  (() => {
    try {
      schema({ tone: 'gong' });
      return false;
    } catch {
      return true;
    }
  })(),
);

report.group('b2. the module has no static dependency that could break the loader entry');
const topLevelImports = HOST_SOURCE.split('\n').filter((line) => /^import\s/.test(line));
/* rev-4 added the audio store (node:fs/promises, node:crypto, node:path's extname) and
 * rev-10 the per-session table (node:url's fileURLToPath); every one of them is still a
 * node: builtin — schemastery alone stays behind the lazy createRequire in `resolver`. */
report.deep('every top-level import is a node: builtin', topLevelImports.map((line) => line.trim()), [
  "import { randomUUID } from 'node:crypto';",
  "import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';",
  "import { createRequire } from 'node:module';",
  "import { homedir } from 'node:os';",
  "import { extname, join } from 'node:path';",
  "import { fileURLToPath, pathToFileURL } from 'node:url';",
]);
report.check(
  'every top-level import specifier is a node: builtin (re-derived, not just listed)',
  topLevelImports.every((line) => /from 'node:[a-z/]+';/.test(line)),
  topLevelImports.map((line) => line.trim()).join(' | '),
);
report.check('no static schemastery import', !/^import\s+[^;]*schemastery/m.test(HOST_SOURCE), 'a missing link cannot break the boot');

/* ------------------------------------------------------- (c) degradation matrix */

report.group('c. apply() survives every broken-settings shape');

const quietLogger = (sink) => ({ info: (line) => sink.push(line), warn: (line) => sink.push(line), error: (line) => sink.push(line), debug: () => {} });
const matrix = [
  ['no context argument at all', undefined],
  ['an empty context', {}],
  ['settings: null', { settings: null }],
  ['settings without describe()', { settings: { register() {} } }],
  ['settings without register()', { settings: { describe: () => [] } }],
  ['describe() returns a non-array', { settings: { describe: () => ({}), register() {} } }],
  ['describe() throws', { settings: { describe: () => { throw new Error('probe: directory exploded'); }, register() {} } }],
  ['register() throws', { settings: { describe: () => [], register() { throw new Error('probe: already registered'); } } }],
  ['register() returns undefined', { settings: { describe: () => [], register() { return undefined; } } }],
];

for (const [label, ctx] of matrix) {
  const sink = [];
  const withLogger = ctx === undefined ? undefined : { ...ctx, logger: quietLogger(sink) };
  let threw = null;
  try {
    plugin.apply(withLogger);
  } catch (error) {
    threw = String(error.message);
  }
  report.check(`${label}: apply() does not throw`, threw === null, threw ?? 'returned normally');
}

const sink = [];
let throwingGetterThrew = null;
const hostileCtx = {};
Object.defineProperty(hostileCtx, 'settings', {
  get() {
    throw new Error('probe: settings access exploded');
  },
});
throwingGetterThrew = null;
try {
  plugin.apply({ ...hostileCtx, logger: quietLogger(sink) });
} catch (error) {
  throwingGetterThrew = String(error.message);
}
report.check('a throwing settings getter: apply() does not throw', throwingGetterThrew === null, throwingGetterThrew ?? 'returned normally');

// Idempotency: the Host throws on a duplicate namespace, so we must not re-register.
const secondPass = [];
let secondThrew = null;
try {
  plugin.apply({
    logger: quietLogger(sink),
    settings: {
      describe: () => [{ ns: NS }, { ns: 'ui-background' }],
      register() {
        secondPass.push('called');
      },
    },
  });
} catch (error) {
  secondThrew = String(error.message);
}
report.same('an already-served namespace is not registered twice', secondPass.length, 0);
report.same('the idempotency probe did not throw', secondThrew, null);
report.check('the missing-service case is reported, not silent', sink.some((line) => line.includes('settings service unavailable')), sink.filter((line) => line.includes('unavailable')).join(' | ') || 'no matching line');

await settle();
report.same('no unhandled rejection from the whole matrix', rejections.seen.length, 0);

/* ------------------------------------------------- (d) unreachable schema package */

report.group('d. an unreachable schema package degrades to inert (negative control first)');

let degraded = null;
try {
  const root = mkdtempSync(join(tmpdir(), 't3-independent-'));
  const emptyHome = join(root, 'home');
  const copyLib = join(root, 'elsewhere', 'lib');
  mkdirSync(copyLib, { recursive: true });
  mkdirSync(emptyHome, { recursive: true });
  const copyPath = join(copyLib, 'index.js');
  writeFileSync(copyPath, HOST_SOURCE, 'utf8');

  // Negative control: prove the copy really cannot see the schema package, so a
  // passing degradation test is not a false pass.
  const copyRequire = createRequire(pathToFileURL(copyPath).href);
  let copyResolved = null;
  let copyError = null;
  try {
    copyResolved = copyRequire.resolve('@deepseek-ai/schemastery');
  } catch (error) {
    copyError = String(error.message).split('\n')[0];
  }
  report.same('negative control: the copy cannot resolve the schema package', copyResolved, null);
  report.note('negative-control error', copyError);

  const copyAnchors = plugin.schemaAnchors({ baseUrl: pathToFileURL(join(root, 'nowhere', 'package.json')).href });
  report.check(
    'the ORIGINAL module still has the junction on its first anchor (contrast)',
    copyAnchors[0].includes('dsh-approval-chime'),
    copyAnchors[0],
  );

  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = emptyHome;
  try {
    const copy = await import(pathToFileURL(copyPath).href);
    const copyAnchorList = copy.schemaAnchors({});
    report.check(
      'negative control: no anchor of the copy points at the plugin junction',
      copyAnchorList.every((anchor) => !anchor.includes('dsh-approval-chime')),
      copyAnchorList.join(' | '),
    );
    const copyCandidates = copy.schemaCandidates({});
    report.same('the copy resolves nothing synchronously', copyCandidates.candidates.length, 0);
    report.check('and every anchor records a failure', copyCandidates.failures.length === copy.schemaAnchors({}).length, `${copyCandidates.failures.length} failure(s)`);
    report.note('copy anchors', copy.schemaAnchors({}));
    report.note('copy resolution failures', copyCandidates.failures);

    const lines = [];
    const registrations = [];
    let copyThrew = null;
    try {
      copy.apply({
        logger: quietLogger(lines),
        settings: {
          describe: () => [],
          register(ns) {
            registrations.push(ns);
          },
        },
      });
    } catch (error) {
      copyThrew = String(error.message);
    }
    report.same('the degraded copy does not throw', copyThrew, null);
    report.same('nothing was registered', registrations.length, 0);
    await settle(12);
    report.check(
      'the degradation is reported through the logger',
      lines.some((line) => line.includes('not resolvable synchronously')) && lines.some((line) => line.includes('is not registered')),
      lines.join(' | ').slice(0, 400),
    );
    report.same('the asynchronous retry did not leak an unhandled rejection', rejections.seen.length, 0);

    const asyncStub = await copy.loadSchemasteryAsync({});
    report.same('the async route resolves to null instead of rejecting', asyncStub.z, null);
    report.check('the async route reports why', asyncStub.failures.length > 0, `${asyncStub.failures.length} failure(s)`);
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
  }

  degraded = { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
} catch (error) {
  report.fail('the degraded-host scenario could not be built', String(error.message));
}

if (degraded !== null) {
  try {
    degraded.cleanup();
    report.check('the temporary copy was removed', !existsSync(degraded.root), 'cleaned up');
  } catch (error) {
    report.note('cleanup warning', String(error.message));
  }
}

await settle();
report.same('no unhandled rejection at the end of the probe', rejections.seen.length, 0);
report.check('lib/index.js is still the file under test', readOrNull(HOST_PATH) !== null, true);
rejections.stop();
report.done();
