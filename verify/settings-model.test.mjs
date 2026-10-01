/**
 * Headless self-test — the DSH 0.1.7 settings model (module-level `Config` + the
 * browser `configForms`/entry-id binding). 29 assertions, five sections.
 *
 * ⚠️ REBUILT 2026-10-02 — THIS IS NOT THE ORIGINAL FILE.
 *
 * The original `verify/settings-model.test.mjs` (9856 B / sha256
 * `D50C601FEF2BE60D…`) was destroyed by the 2026-10-01 `robocopy /MIR`
 * write-through (recorded in `CHANGELOG.md` 「事故补记 · 2026-10-01」) and no
 * copy existed in git, in the rig, or anywhere on this machine — the loss was
 * confirmed by a workspace-wide + `~/.dsh` filename search. Byte-faithful
 * restoration is therefore IMPOSSIBLE, and no attempt is made to fake it.
 *
 * What this file is instead: a re-authoring driven by the ONE surviving
 * specification, the rev-29 output log
 * `.scratch/r29-release/suite-settings-model.txt` (41 lines), which pins
 *
 *   - the five section headers, in order;
 *   - the 29 assertion NAMES, verbatim and in order;
 *   - the expected values inside their `expected X, got Y` details;
 *   - the final `=== settings-model.test.mjs: 29/29 checks passed ===` line.
 *
 * The acceptance criterion for the reconstruction is exactly that: it must
 * print the same 29 assertions, in the same order, with the same names, and
 * `run-r13.ps1` must still count 29. Byte equality with the lost file is NOT
 * claimed and cannot be verified by anyone.
 *
 * Provenance of every rig below: the product surface it exercises is the
 * rev-29 `lib/index.js` / `lib/client.js` (byte-identical to the rev-29
 * delivery), and the host package it resolves (`@deepseek-ai/dsh-settings`,
 * for `volatileForm`) is the machine's real 0.1.7-rc.2 copy — the same
 * resolution the other suites use.
 *
 * EOL: LF. The lost file's EOL is unknown; the frozen baseline records the
 * bytes of THIS file, not a guess about the old one.
 */
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import {
  CLIENT_PATH,
  HOST_PATH,
  PATCH_PATH,
  createReporter,
  readText,
  resolveHostPackage,
} from './_harness.mjs';
import {
  Config,
  DEFAULTS,
  NATIVE_TOAST_FIELD,
  NS,
  SETTINGS_NS,
  apply,
  configReader,
} from '../lib/index.js';

const reporter = createReporter('settings-model.test.mjs');

/* ------------------------------------------------------------------ section 1 */

reporter.section('the entry survives the volatileForm gate dsh-settings applies');

// The gate lives in the package's UNBUNDLED source, not on the package's public
// surface: the published `lib/index.js` defines `volatileForm` at its `:122` but
// its export list (`:544`) carries only `SettingsConflictError`, `SettingsForms`,
// `default` and `redactSecrets`, while the shipped `lib/types/schema.js:43` DOES
// export it. It is therefore reached by file URL next to the resolved entry, which
// also keeps the package's `exports` map out of the picture.
const settingsEntry = resolveHostPackage('@deepseek-ai/dsh-settings');
let volatileForm = null;
let gateReach = 'dsh-settings is not resolvable from this machine';
if (settingsEntry !== null) {
  const schemaModule = join(dirname(settingsEntry), 'types', 'schema.js');
  try {
    const schema = await import(pathToFileURL(schemaModule).href);
    if (typeof schema.volatileForm === 'function') volatileForm = schema.volatileForm;
    else gateReach = `lib/types/schema.js exports no volatileForm (${schemaModule})`;
  } catch (error) {
    gateReach = `lib/types/schema.js is unreadable: ${error.message}`;
  }
}

if (volatileForm === null) {
  for (const name of [
    'the Config produces a form at all (a non-volatile Config is dropped from describe())',
    'field "enabled" is volatile, so it reaches the browser form',
    'field "volume" is volatile, so it reaches the browser form',
    'field "tone" is volatile, so it reaches the browser form',
    'field "custom" is volatile, so it reaches the browser form',
    'field "nativeToast" is volatile, so it reaches the browser form',
  ]) {
    reporter.skip(name, gateReach);
  }
} else {
  const form = volatileForm(Config);
  reporter.check(
    'the Config produces a form at all (a non-volatile Config is dropped from describe())',
    form !== undefined,
    'volatileForm(Config) must not be undefined',
  );
  // A NON-volatile field makes `settings.describe()` drop the whole entry
  // (`dsh-settings` applies `volatileForm` at its `:417-419`), which leaves the
  // browser page permanently `unavailable` — the silently-dead-page failure this
  // assertion exists to catch.
  for (const field of ['enabled', 'volume', 'tone', 'custom', NATIVE_TOAST_FIELD]) {
    reporter.check(
      `field "${field}" is volatile, so it reaches the browser form`,
      Config.dict[field].meta.volatile === true,
      `Config.dict.${field}.meta.volatile`,
    );
  }
}

/* ------------------------------------------------------------------ section 2 */

reporter.section('the settings namespace is the profile entry id');

reporter.equal('SETTINGS_NS is the entry id', SETTINGS_NS, 'dsh-approval-chime');
reporter.check(
  'the locale namespace is deliberately NOT reused as the settings namespace',
  NS !== SETTINGS_NS,
  `NS=${NS}, SETTINGS_NS=${SETTINGS_NS}`,
);

// The bundle patch is the ONLY place that inserts this entry, and the settings
// namespace has to be that entry's id — so the ids in the patch ARE the
// namespaces the shell will serve.
const patchIds = readText(PATCH_PATH)
  .split(/\r?\n/)
  .map((line) => /^\s*-\s*id:\s*(\S+)\s*$/.exec(line))
  .filter((match) => match !== null)
  .map((match) => match[1]);
reporter.deepEqual('the bundle patch inserts exactly one entry, under SETTINGS_NS', patchIds, [SETTINGS_NS]);

/* ------------------------------------------------------------------ section 3 */

reporter.section('reads are live: a volatile-only edit is visible without a re-apply');

// A volatile reference is what the loader hands a plugin for a `.volatile()`
// field: the value is read with `.get()` at USE time, never cached — that is how
// a config edit lands in a running fiber without re-applying the plugin.
reporter.equal('the reader unwraps a volatile reference', configReader({ volume: { get: () => 30 } }).get().volume, 30);

let committed = 30;
const live = configReader({ volume: { get: () => committed } });
live.get();
committed = 55;
reporter.equal(
  'a committed volatile edit is visible on the next read (volume) — a cached object would still say 30',
  live.get().volume,
  55,
);

const switchReader = configReader({ [NATIVE_TOAST_FIELD]: { get: () => false } });
reporter.equal(
  'the native-toast switch the bridge polls follows the same live read',
  switchReader.get()[NATIVE_TOAST_FIELD],
  false,
);

reporter.equal('a real schema parse hands back references read with .get()', Config({ volume: 12 }).volume.get(), 12);
reporter.equal('...and applies the schema defaults to omitted fields', Config({}).tone.get(), 'chime');
reporter.deepEqual(
  'an omitted config reads as the documented defaults rather than as undefined',
  configReader(Config({})).get(),
  DEFAULTS,
);
reporter.deepEqual(
  'a plain (non-volatile) config is still readable',
  configReader({ volume: 9 }).get(),
  { ...DEFAULTS, volume: 9 },
);

/* ------------------------------------------------------------------ section 4 */

reporter.section('the page policy is registered against THIS entry fiber');

const warnings = [];
const configureCalls = [];
let registerCalls = 0;
const ctx = {
  fiber: { label: 'the-entry-fiber' },
  logger: {
    warn: (message) => warnings.push(String(message?.message ?? message)),
    info: () => {},
    error: () => {},
    debug: () => {},
  },
  // No web server and no filesystem here: the three route registrations degrade
  // with a warning, which is the documented inert path — and those warnings are
  // exactly what the last assertion of this section distinguishes itself from.
  get: () => undefined,
  effect: (fn) => fn(),
  settings: {
    configure(presentation, owner) {
      configureCalls.push({ presentation, owner });
      return () => {};
    },
    register() {
      registerCalls += 1;
      return () => {};
    },
  },
};

reporter.equal('apply() now takes the Config', apply.length, 2);
apply(ctx, Config({}));
// `attachNativeToastScope` joins the lazily-imported bridge asynchronously, so
// the binding warning (if any) can only be observed after a turn of the loop.
await new Promise((resolve) => setTimeout(resolve, 50));

reporter.equal('exactly one page policy is registered', configureCalls.length, 1);
reporter.deepEqual(
  'the policy owner is this entry fiber, not the settings service default',
  configureCalls[0]?.owner,
  ctx.fiber,
);
reporter.equal(
  'the policy opts OUT of the auto-generated form (the page is hand-drawn)',
  configureCalls[0]?.presentation?.auto,
  false,
);
reporter.equal('apply() never calls the removed settings.register()', registerCalls, 0);

const bindingWarning = warnings.some((warning) => warning.includes('native toast switch could not be bound'));
reporter.check(
  'the Config is bound to the native-toast bridge without throwing',
  bindingWarning === false,
  `no binding warning (${warnings.length} warnings seen)`,
);

/* ------------------------------------------------------------------ section 5 */

reporter.section('the removed APIs are gone and the new ones are in place');

const hostText = readText(HOST_PATH);
const clientText = readText(CLIENT_PATH);

reporter.check(
  'the schema package is imported statically (a Config cannot be declared lazily)',
  /^import z from '@deepseek-ai\/schemastery';$/m.test(hostText),
  "import z from '@deepseek-ai/schemastery'",
);
reporter.check(
  'the host half exports a module-level Config built on the one schema definition',
  hostText.includes('export const Config = buildSchema(z)'),
  'export const Config = buildSchema(z)',
);
reporter.check(
  'the old registerNamespace() helper is gone',
  hostText.includes('function registerNamespace(') === false,
  'no `function registerNamespace(`',
);
reporter.check(
  'the browser half no longer injects the removed settingsScope service',
  clientText.includes("'settingsScope'") === false,
  "no quoted 'settingsScope'",
);
reporter.check(
  'the browser half injects configForms',
  clientText.includes("var inject = ['slots', 'locale', 'configForms', 'uiSession']"),
  "var inject = ['slots', 'locale', 'configForms', 'uiSession']",
);
reporter.check(
  'the browser half binds the ENTRY ID, not the locale namespace',
  clientText.includes('ctx.configForms.get(SETTINGS_NS)'),
  'ctx.configForms.get(SETTINGS_NS)',
);
reporter.check(
  'the diagnostics surface names the settings namespace separately from the locale one',
  /namespace: NS\b/.test(clientText) && /settingsNamespace: SETTINGS_NS\b/.test(clientText),
  'namespace: NS (locale) AND settingsNamespace: SETTINGS_NS (settings)',
);

reporter.summary();
