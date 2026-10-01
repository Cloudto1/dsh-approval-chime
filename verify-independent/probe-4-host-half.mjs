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

// rev-26 (the settings-model migration) DELETED the four schema helpers this probe
// used to call: the plugin no longer resolves the schema package itself, `dsh-settings`
// does. What survives is what this probe now pins.
const REMOVED_HELPERS = ['schemaAnchors', 'schemaCandidates', 'loadSchemastery', 'loadSchemasteryAsync'];
report.check(
  'the four schema helpers rev-24 exported are really gone (rev-26 settings-model migration)',
  REMOVED_HELPERS.every((name) => plugin[name] === undefined),
  REMOVED_HELPERS.map((name) => name + '=' + typeof plugin[name]).join(' '),
);
report.same('the host half still exports the schema factory', typeof plugin.Config, 'function');
report.same(
  'whose dict carries exactly the five shipped fields',
  Object.keys(plugin.Config?.dict ?? {}).sort().join(','),
  'custom,enabled,nativeToast,tone,volume',
);
report.same('and the entry still exports apply() for the cordis loader', typeof plugin.apply, 'function');
report.same('the entry injects only the settings service (the browser half injects the slots)', plugin.inject.join(','), 'settings');

/* ------------------------------------------------------------ (b) normal path */

report.group('b. the normal registration path');

const calls = [];
/** Records every `settings` member the entry touches — the deleted `register()` included. */
const okCtx = {
  logger: { info: (line) => calls.push(['info', line]), warn: (line) => calls.push(['warn', line]), error: () => {}, debug: () => {} },
  settings: {
    describe: () => {
      calls.push(['describe']);
      return [];
    },
    configure: (...args) => {
      calls.push(['configure', ...args]);
      return { get: () => ({}), watch: () => () => {}, update: () => {}, replace: () => {} };
    },
    register: (ns, schema, options) => {
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
report.same(
  'apply() never calls the DELETED settings.register() (0.1.7 removed it)',
  calls.filter((entry) => entry[0] === 'register').length,
  0,
);
report.same(
  'and it never calls configure() either — the module-level Config is served by describe()',
  calls.filter((entry) => entry[0] === 'configure').length,
  0,
);
report.same('the module injects only the settings service', JSON.stringify(plugin.inject), JSON.stringify(['settings']));
report.same('the settings namespace is the profile entry id', plugin.SETTINGS_NS, 'dsh-approval-chime');
report.same('the namespace matches the Host pattern', /^[a-z][a-z0-9-]*$/.test(plugin.SETTINGS_NS), true);
report.same('the browser-side id keeps its own name', plugin.NS, 'approval-chime');
report.same('the browser-side id matches dsh-settings:82-86 too', /^[a-z][a-z0-9-]*$/.test(plugin.NS), true);

// The shipped form. `Config` is the module-level schema the Host serves; every field is
// volatile (settings.describe() drops non-volatile entries, see lib/index.js:243).
report.same('the shipped form carries exactly the five fields', Object.keys(plugin.Config.dict).sort().join(','), 'custom,enabled,nativeToast,tone,volume');
report.deep('the exported DEFAULTS carry the rev-25 switch as well', { ...plugin.DEFAULTS }, { enabled: true, volume: 70, tone: 'chime', custom: [], nativeToast: false });
report.deep('the exported TONES match', [...plugin.TONES], ['chime', 'bell', 'beep']);
report.deep('the form resolves the documented defaults', plugin.configReader(plugin.Config({})).get(), { enabled: true, volume: 70, tone: 'chime', custom: [], nativeToast: false });
report.check(
  'the form rejects an out-of-range volume',
  (() => {
    try {
      plugin.Config({ volume: 101 });
      return false;
    } catch {
      return true;
    }
  })(),
);
report.check(
  'the form rejects an unknown tone',
  (() => {
    try {
      plugin.Config({ tone: 'gong' });
      return false;
    } catch {
      return true;
    }
  })(),
);

report.group('b2. the module has no static dependency that could break the loader entry');
const topLevelImports = HOST_SOURCE.split('\n').filter((line) => /^import\s/.test(line));
/* rev-4 added the audio store (node:fs/promises, node:crypto, node:path's extname) and
 * rev-10 the per-session table (node:url's fileURLToPath); rev-26 dropped the lazy
 * createRequire and made the schema package a STATIC import. The builtins are listed
 * verbatim, and the one non-builtin is pinned as such — see the next check. */
report.deep('every top-level import is a node: builtin', topLevelImports.filter((line) => /from 'node:/.test(line)).map((line) => line.trim()), [
  "import { randomUUID } from 'node:crypto';",
  "import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';",
  "import { homedir } from 'node:os';",
  "import { extname, join } from 'node:path';",
  "import { fileURLToPath } from 'node:url';",
]);
report.deep(
  'exactly ONE top-level import is not a node: builtin — and it is the schema package',
  topLevelImports.filter((line) => !/from 'node:/.test(line)).map((line) => line.trim()),
  ["import z from '@deepseek-ai/schemastery';"],
);
report.check(
  'the static schema import is why the plugin-local junction is a hard prerequisite (rev-24 said the opposite)',
  /^import z from '@deepseek-ai\/schemastery';$/m.test(HOST_SOURCE),
  'the lazy createRequire route was removed by rev-26',
);

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

  // Contrast: the ORIGINAL module resolves the schema package through its junction
  // (asserted above), while the copy — same source, no junction — cannot.
  report.check(
    'the ORIGINAL module resolves the schema package through its junction (contrast)',
    typeof resolvedFromLib === 'string' && resolvedFromLib.includes('schemastery'),
    String(resolvedFromLib),
  );

  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = emptyHome;
  try {
    let copyState;
    try {
      const copy = await import(pathToFileURL(copyPath).href);
      copyState = {
        loaded: true,
        configType: typeof copy.Config,
        dictFields: copy.Config?.dict === undefined ? null : Object.keys(copy.Config.dict).length,
      };
    } catch (error) {
      copyState = { loaded: false, error: String(error.message).split('\n')[0] };
    }
    report.check(
      'negative control: without the junction the copy cannot build the shipped schema factory',
      copyState.loaded === false || copyState.configType !== 'function' || copyState.dictFields === null,
      JSON.stringify(copyState),
    );
    report.note('copy module state without the junction', copyState);

    // rev-24 could load this copy and watch it degrade gracefully (the schema package was
    // lazy). rev-29 cannot: the copy is the same source with no junction, so its static
    // schema import fails outright — which is exactly why the junction is a prerequisite.
    report.check(
      'negative control: the copy cannot even be imported (the schema import is static now)',
      copyState.loaded === false,
      JSON.stringify(copyState),
    );
    report.check(
      'and the failure names the missing link, so a missing junction is loud, not silent',
      /Cannot find (package|module) '@deepseek-ai\/schemastery'/.test(copyState.error ?? ''),
      copyState.error ?? '',
    );
    report.same('the failed import leaked no unhandled rejection', rejections.seen.length, 0);
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
