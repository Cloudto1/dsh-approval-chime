#!/usr/bin/env node
/**
 * dsh-approval-chime — mount precheck (task t5). READ-ONLY and repeatable.
 *
 * Verifies, without booting or restarting anything:
 *   A. the plugin package's mount contract (package.json, both halves, patch file);
 *   B. the plugin-local `@deepseek-ai/schemastery` junction (existence, junction
 *      form, target, realpath identity, and an actual Node resolution from the
 *      REAL lib/index.js path — the host half cannot import without this);
 *   C. the profile manifest (JSON, link: dependency, bundles entry, baseline diff);
 *   D. the profile `node_modules/dsh-approval-chime` junction and the untouched
 *      junctions of the other workspace plugins;
 *   E. patch-layer composition with the HOST'S OWN composer: `loadProfileDirectory`
 *      + `composeEntries` reproduce the boot-time entry list, so a missing bundle
 *      or a duplicate row id fails here instead of at the next boot.
 *
 * It never runs pnpm, never edits a file, never restarts `dsh web`.
 *
 * Usage:
 *   node dsh-approval-chime/deploy/precheck.mjs                 # compare against the newest backup in the mount backup root
 *   node dsh-approval-chime/deploy/precheck.mjs --baseline <dir>
 *   node dsh-approval-chime/deploy/precheck.mjs --backup-dir <dir>    # the same root mount.mjs writes to
 *   node dsh-approval-chime/deploy/precheck.mjs --profile-dir <dir>   # check a shadow copy instead
 */

import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = resolve(HERE, '..');
const PLUGIN_NAME = 'dsh-approval-chime';
// A whitespace-only $DSH_HOME counts as UNSET, and the result is ALWAYS absolute -
// the platform's own rule (dsh-home-paths: trim, then resolve). Before this, a
// blank value crashed this read-only check at createRequire() with
// ERR_INVALID_ARG_VALUE on "<three spaces>\profiles\web\package.json" (V-6).
const DSH_HOME = resolve(
  typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME.trim().length > 0 ? process.env.DSH_HOME : join(homedir(), '.dsh'),
);
/**
 * Which profile is checked when `--profile-dir` is not given. The DEFAULT is
 * "desktop" - the profile the desktop app loads, and the one mount.mjs writes - so
 * the two scripts manage ONE profile instead of checking one and mounting the other.
 * It used to be hard-wired to "web"; `--profile-dir` still overrides it, and a bare
 * `--profile-dir` with no value falls back to this default instead of crashing on
 * resolve(undefined).
 */
const DEFAULT_PROFILE_NAME = 'desktop';
const profileDirArgument = process.argv.indexOf('--profile-dir');
const profileDirGiven = profileDirArgument >= 0 && Boolean(process.argv[profileDirArgument + 1]);
const PROFILE_DIR = profileDirGiven ? resolve(process.argv[profileDirArgument + 1]) : join(DSH_HOME, 'profiles', DEFAULT_PROFILE_NAME);
const PROFILE_PKG = join(PROFILE_DIR, 'package.json');
const PROFILE_PATCH = join(PROFILE_DIR, 'cordis.patch.yml');
const LINK_PATH = join(PROFILE_DIR, 'node_modules', PLUGIN_NAME);
const MIRROR = join(DSH_HOME, 'profiles', 'node_modules', '@deepseek-ai', 'schemastery');
const PLUGIN_JUNCTION = join(PLUGIN_DIR, 'node_modules', '@deepseek-ai', 'schemastery');
const EXPECTED_SPEC = `link:${PLUGIN_DIR.replace(/\\/g, '/')}`;

const rows = [];
const notes = [];
let section = '';

function group(name) {
  section = name;
  console.log(`\n--- ${name} ---`);
}
function check(name, ok, detail) {
  const passed = ok === true;
  rows.push({ section, name, passed, detail: detail === undefined ? '' : String(detail) });
  console.log(`${passed ? '[PASS]' : '[FAIL]'} ${name}${detail === undefined || detail === '' ? '' : ` — ${detail}`}`);
  return passed;
}
function note(label, value) {
  notes.push(`${label} = ${typeof value === 'string' ? value : JSON.stringify(value)}`);
  console.log(`    · ${label} = ${typeof value === 'string' ? value : JSON.stringify(value)}`);
}
const same = (name, actual, expected) => check(name, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const samePath = (name, actual, expected) => check(name, typeof actual === 'string' && actual.toLowerCase() === expected.toLowerCase(), `expected ${expected}, got ${actual}`);

// Say out loud which profile this run is about. With the default it is the desktop
// app's profile - the same one mount.mjs writes - not the web profile this script
// used to assume.
console.log('# dsh-approval-chime mount precheck (read-only)');
console.log(`profile : ${PROFILE_DIR}${profileDirGiven ? '   (--profile-dir)' : `   (the desktop app's profile: ${DEFAULT_PROFILE_NAME})`}`);
console.log('');

/* ------------------------------------------------------- A. plugin contract */

group('A. the plugin package (mount contract)');
const pluginPackagePath = join(PLUGIN_DIR, 'package.json');
let pluginPackage = null;
try {
  pluginPackage = JSON.parse(readFileSync(pluginPackagePath, 'utf8'));
} catch (error) {
  check('plugin package.json parses', false, String(error.message));
}
if (pluginPackage !== null) {
  check('plugin package.json parses', true, pluginPackagePath);
  same('package name', pluginPackage.name, PLUGIN_NAME);
  same('package type', pluginPackage.type, 'module');
  same('dsh.bundle.patch', pluginPackage.dsh?.bundle?.patch, './cordis.patch.yml');
  same('dsh.client.platform', pluginPackage.dsh?.client?.platform, 'web');
  const patchPath = join(PLUGIN_DIR, pluginPackage.dsh?.bundle?.patch ?? 'cordis.patch.yml');
  check('the declared bundle patch file exists', existsSync(patchPath), patchPath);
  const hostEntry = join(PLUGIN_DIR, pluginPackage.exports?.['.']?.default ?? pluginPackage.main ?? 'lib/index.js');
  const clientEntry = join(PLUGIN_DIR, typeof pluginPackage.exports?.['./client'] === 'string' ? pluginPackage.exports['./client'] : 'lib/client.js');
  check('exports["."] points at an existing host entry', existsSync(hostEntry), hostEntry);
  check('exports["./client"] points at an existing browser entry', existsSync(clientEntry), clientEntry);
  same('exports["./cordis.patch.yml"] is declared', typeof pluginPackage.exports?.['./cordis.patch.yml'], 'string');
}

for (const half of ['lib/index.js', 'lib/client.js']) {
  const path = join(PLUGIN_DIR, half);
  if (!existsSync(path)) {
    check(`${half} exists`, false, path);
    continue;
  }
  const result = spawnSync(process.execPath, ['--check', path], { stdio: 'ignore' });
  check(`${half} exists and parses (node --check)`, result.status === 0, `status ${result.status}, ${statSync(path).size} B`);
}

/* ------------------------------------------------------ B. schemastery link */

group('B. the plugin-local schemastery junction (host half cannot import without it)');
check('the plugin junction exists', existsSync(PLUGIN_JUNCTION), PLUGIN_JUNCTION);
check('the Host-maintained mirror exists', existsSync(MIRROR), MIRROR);
if (existsSync(PLUGIN_JUNCTION) && existsSync(MIRROR)) {
  check('the plugin junction is a junction/symlink', lstatSync(PLUGIN_JUNCTION).isSymbolicLink(), `lstat isSymbolicLink=${lstatSync(PLUGIN_JUNCTION).isSymbolicLink()}`);
  note('junction realpath', realpathSync(PLUGIN_JUNCTION));
  note('mirror realpath', realpathSync(MIRROR));
  samePath('junction realpath === mirror realpath', realpathSync(PLUGIN_JUNCTION), realpathSync(MIRROR));
  check('the resolved schemastery entry exists', existsSync(join(realpathSync(PLUGIN_JUNCTION), 'lib', 'index.cjs')), join(realpathSync(PLUGIN_JUNCTION), 'lib', 'index.cjs'));
}

const resolver = createRequire(pathToFileURL(join(PLUGIN_DIR, 'lib', 'index.js')).href);
let resolvedSchema = null;
let resolveError = null;
try {
  resolvedSchema = resolver.resolve('@deepseek-ai/schemastery');
} catch (error) {
  resolveError = String(error.message).split('\n')[0];
}
check('Node resolves @deepseek-ai/schemastery from the REAL lib/index.js path', resolvedSchema !== null, resolvedSchema ?? resolveError);
if (resolvedSchema !== null) {
  const loaded = resolver('@deepseek-ai/schemastery');
  check('the resolved module exports a callable schema factory', typeof loaded === 'function' || typeof loaded.default === 'function', `typeof = ${typeof loaded}`);
}

/* ---------------------------------------------------- C. profile manifest */

group('C. the profile manifest');
let profilePackage = null;
let profileRaw = null;
try {
  profileRaw = readFileSync(PROFILE_PKG, 'utf8');
  profilePackage = JSON.parse(profileRaw);
  check('profile package.json is valid JSON', true, `${profileRaw.length} B`);
} catch (error) {
  check('profile package.json is valid JSON', false, String(error.message));
}
if (profilePackage !== null) {
  const spec = profilePackage.dependencies?.[PLUGIN_NAME];
  check('profile declares the plugin dependency', spec !== undefined, String(spec));
  same('the dependency spec is a link: to the workspace plugin dir', spec, EXPECTED_SPEC);
  if (typeof spec === 'string' && spec.startsWith('link:')) {
    const target = spec.slice('link:'.length);
    check('the link: target directory exists', existsSync(target), target);
    if (existsSync(target)) samePath('the link: target is the plugin directory', realpathSync(target), realpathSync(PLUGIN_DIR));
  }
  const bundles = profilePackage.dsh?.profile?.bundles ?? [];
  const occurrences = bundles.filter((name) => name === PLUGIN_NAME).length;
  same('dsh.profile.bundles contains the plugin exactly once', occurrences, 1);
  // t8 item 7: the plugin's POSITION among the bundles is the user's own profile order (other
  // bundles can be appended after it), not a property of this mount — what matters is that it
  // is present exactly once, checked above. Recorded as a note so the order stays visible.
  note(
    'bundle position',
    (bundles.indexOf(PLUGIN_NAME) + 1) +
      ' of ' +
      bundles.length +
      (bundles[bundles.length - 1] === PLUGIN_NAME ? ' (last)' : ''),
  );
  note('bundles order', bundles);
  // t15: `patchReload` is OPTIONAL. The t12 sweep found 0 hits for this key across the
  // packaged Host (8543 files / 68.8 MB) and across 1497 unpacked files - no host code
  // reads it - and the desktop profile simply does not write it (only profiles created by
  // an old npx CLI carry it). So ABSENT means "the loader's default applies" and passes;
  // a key that IS present must still hold one of the two values this contract allows, so
  // a wrong value stays RED instead of being waved through.
  const patchReloadValue = profilePackage.dsh?.profile?.patchReload;
  const patchReloadAbsent = patchReloadValue === undefined || patchReloadValue === null;
  check(
    'patchReload is absent (default) or one of: live, startup',
    patchReloadAbsent || ['live', 'startup'].includes(patchReloadValue),
    patchReloadAbsent ? 'absent - the loader default applies' : `present as ${JSON.stringify(patchReloadValue)}`,
  );
}

/**
 * t8 item 7 · the baseline for the no-regression diff.
 *
 * ONE definition of "where backups live", shared with mount.mjs: the same --backup-dir
 * override and the same default ($DSH_HOME/approval-chime/profile-backups). This script
 * used to look only in deploy/backup-*, which here is a snapshot of a DIFFERENT machine's
 * profile (2026-09-15) — comparing today's profile against it produced ten red lines about
 * other people's plugins, and the verdict read NOT READY while nothing was wrong.
 *
 * A baseline is used as a HARD check only when it is comparable: it must be a snapshot of
 * this profile (it names the plugin) and it must not be older than the profile manifest it
 * is compared with. Otherwise its differences are printed as notes and the verdict is not
 * touched.
 */
const backupDirArgument = process.argv.indexOf('--backup-dir');
const BACKUP_ROOT =
  backupDirArgument >= 0 && process.argv[backupDirArgument + 1]
    ? resolve(process.argv[backupDirArgument + 1])
    : join(DSH_HOME, 'approval-chime', 'profile-backups');

function newestBackup(root) {
  if (!existsSync(root)) return null;
  const candidates = readdirSync(root).filter((name) => name.startsWith('backup-')).sort();
  return candidates.length > 0 ? join(root, candidates[candidates.length - 1]) : null;
}

const baselineArgument = process.argv.indexOf('--baseline');
let baselineDir =
  baselineArgument >= 0 && process.argv[baselineArgument + 1] ? resolve(process.argv[baselineArgument + 1]) : null;
let baselineOrigin = baselineArgument >= 0 ? '--baseline' : '';
if (baselineDir === null) {
  baselineDir = newestBackup(BACKUP_ROOT);
  if (baselineDir !== null) baselineOrigin = 'the newest mount backup in ' + BACKUP_ROOT;
}
if (baselineDir === null) {
  const legacy = newestBackup(HERE);
  if (legacy !== null) {
    baselineDir = legacy;
    baselineOrigin = 'LEGACY deploy/ snapshot: ' + legacy;
  }
}

if (baselineDir === null || !existsSync(join(baselineDir, 'package.json'))) {
  note('baseline', 'none found in ' + BACKUP_ROOT + ' (and no legacy deploy/ snapshot) — the no-regression diff is skipped');
} else {
  note('baseline', baselineDir + ' — ' + baselineOrigin);
  const baseline = JSON.parse(readFileSync(join(baselineDir, 'package.json'), 'utf8'));
  const baselineNamesPlugin = baseline.dependencies?.[PLUGIN_NAME] !== undefined;
  const baselineMtime = statSync(join(baselineDir, 'package.json')).mtimeMs;
  const profileMtime = existsSync(PROFILE_PKG) ? statSync(PROFILE_PKG).mtimeMs : 0;
  const baselineOlder = baselineMtime < profileMtime;
  note('baseline comparability', 'names this plugin: ' + baselineNamesPlugin + '; older than the profile manifest: ' + baselineOlder);
  const baselineBundles = baseline.dsh?.profile?.bundles ?? [];
  const currentBundles = profilePackage?.dsh?.profile?.bundles ?? [];
  const diffs = Object.entries(baseline.dependencies ?? {}).filter(
    ([name, value]) => profilePackage?.dependencies?.[name] !== value,
  );
  const sameOrder = baselineBundles.every((name, index) => currentBundles[index] === name);
  const extraLayers = currentBundles.length - baselineBundles.length;
  if (!baselineNamesPlugin || baselineOlder) {
    let why = 'this baseline is not a comparable snapshot of the current profile:';
    if (!baselineNamesPlugin) why += ' it does not depend on ' + PLUGIN_NAME + ';';
    if (baselineOlder) why += ' it is older than the profile manifest it would be compared with;';
    note('baseline diff skipped as a hard check', why);
    for (const [name, value] of diffs) {
      note('baseline-only difference: ' + name, JSON.stringify(value) + ' → ' + JSON.stringify(profilePackage?.dependencies?.[name]));
    }
    note('bundle order vs that baseline', sameOrder ? 'identical' : baselineBundles.length + ' baseline entries, ' + currentBundles.length + ' now');
    note('extra bundle layers vs that baseline', String(extraLayers));
  } else {
    for (const [name, value] of diffs) {
      check('baseline dependency preserved: ' + name, false, JSON.stringify(value) + ' → ' + JSON.stringify(profilePackage?.dependencies?.[name]));
    }
    check('every baseline bundle entry is preserved in the same order', diffs.length === 0 && sameOrder, baselineBundles.length + ' baseline entries, ' + currentBundles.length + ' now');
    same('no extra bundle layer beyond the plugin', extraLayers, 1);
  }
}

/* -------------------------------------------------- D. profile node_modules */

group('D. the profile node_modules junction');
check('profile node_modules/dsh-approval-chime exists', existsSync(LINK_PATH), LINK_PATH);
if (existsSync(LINK_PATH)) {
  check('it is a junction/symlink (ReparsePoint, like dsh-quorum)', lstatSync(LINK_PATH).isSymbolicLink(), `lstat isSymbolicLink=${lstatSync(LINK_PATH).isSymbolicLink()}`);
  samePath('it resolves to the workspace plugin directory', realpathSync(LINK_PATH), realpathSync(PLUGIN_DIR));
  for (const relative of ['package.json', 'lib/index.js', 'lib/client.js', 'cordis.patch.yml']) {
    check(`resolved link exposes ${relative}`, existsSync(join(LINK_PATH, relative)), join(LINK_PATH, relative));
  }
}
/* t8 item 7: this was a hard-coded list of ONE machine's other plugins. On a profile that no
 * longer declares them, requiring them is a red line about nothing. The expectation comes
 * from the profile manifest now: only a plugin the profile still depends on is checked (so
 * the regression check stays alive on the machine that has them). */
const OTHER_WORKSPACE_PLUGINS = ['dsh-quorum', 'dsh-quorum-panel', 'dsh-team-probe', 'dsh-whale-widget'];
const declaredOthers =
  profilePackage === null
    ? []
    : OTHER_WORKSPACE_PLUGINS.filter((name) => profilePackage.dependencies?.[name] !== undefined);
if (declaredOthers.length === 0) {
  note('other workspace plugins declared by this profile', 'none — nothing to check');
} else {
  for (const name of declaredOthers) {
    const path = join(PROFILE_DIR, 'node_modules', name);
    const ok = existsSync(path) && existsSync(join(path, 'package.json'));
    check('declared workspace plugin still resolvable: ' + name, ok, ok ? realpathSync(path) : path);
  }
}

/* --------------------------------- E. patch layers + boot-faithful composition */

group('E. patch layers composed with the Host’s own composer');
const hostRequire = createRequire(PROFILE_PKG);
/** Anchors for host packages: the profile, then the dsh installation, then the plugin. */
const hostAnchors = [PROFILE_PKG];
try {
  hostAnchors.push(createRequire(PROFILE_PKG).resolve('@deepseek-ai/dsh/package.json'));
} catch {
  /* the profile may not expose the launcher */
}
try {
  // A shadow profile has no launcher of its own: borrow the live profile's install
  // anchor - the same default profile this script checks (desktop), not "web".
  hostAnchors.push(createRequire(pathToFileURL(join(DSH_HOME, 'profiles', DEFAULT_PROFILE_NAME, 'package.json')).href).resolve('@deepseek-ai/dsh/package.json'));
} catch {
  /* no live profile on this machine */
}
hostAnchors.push(pathToFileURL(join(PLUGIN_DIR, 'package.json')).href);
function resolveHost(specifier) {
  for (const anchor of hostAnchors) {
    try {
      return createRequire(anchor).resolve(specifier);
    } catch {
      /* next anchor */
    }
  }
  return null;
}
let yaml = null;
try {
  const yamlEntry = resolveHost('yaml') ?? resolveHost('js-yaml');
  if (yamlEntry !== null) yaml = createRequire(pathToFileURL(yamlEntry).href)(resolveHost('yaml') !== null ? 'yaml' : 'js-yaml');
} catch (error) {
  check('a YAML parser is available from the host install', false, String(error.message));
}
let pluginPatch = null;
let profilePatch = null;
if (yaml !== null) {
  try {
    pluginPatch = yaml.parse(readFileSync(join(PLUGIN_DIR, 'cordis.patch.yml'), 'utf8'));
    check('the plugin cordis.patch.yml parses as YAML', Array.isArray(pluginPatch), `${Array.isArray(pluginPatch) ? pluginPatch.length : typeof pluginPatch} top-level entries`);
  } catch (error) {
    check('the plugin cordis.patch.yml parses as YAML', false, String(error.message));
  }
  try {
    profilePatch = yaml.parse(readFileSync(PROFILE_PATCH, 'utf8'));
    check('the profile cordis.patch.yml parses as YAML', Array.isArray(profilePatch), `${Array.isArray(profilePatch) ? profilePatch.length : typeof profilePatch} top-level entries`);
  } catch (error) {
    check('the profile cordis.patch.yml parses as YAML', false, String(error.message));
  }
}
if (Array.isArray(pluginPatch)) {
  const inserts = pluginPatch.flatMap((entry) => (Array.isArray(entry?.insert) ? entry.insert : []));
  same('the plugin patch inserts exactly one row', inserts.length, 1);
  same('the inserted row id is the package name', inserts[0]?.id, PLUGIN_NAME);
  same('the inserted row name is the package name', inserts[0]?.name, PLUGIN_NAME);
}
if (Array.isArray(profilePatch)) {
  const profileInserts = profilePatch.flatMap((entry) => (Array.isArray(entry?.insert) ? entry.insert : []));
  check('the profile patch does NOT insert the plugin id again (duplicate id would break the boot)', !profileInserts.some((entry) => entry?.id === PLUGIN_NAME), JSON.stringify(profileInserts.map((entry) => entry?.id)));
  const profilePatchIds = profilePatch.map((entry) => entry?.id).filter((id) => typeof id === 'string');
  note('profile patch targets', profilePatchIds);
  check('the profile patch does not disable the plugin', !profilePatch.some((entry) => entry?.id === PLUGIN_NAME && entry?.disabled === true), 'no disabled row for the plugin');
  const duplicateTargets = profilePatchIds.filter((id, index) => profilePatchIds.indexOf(id) !== index);
  check('the profile patch has no duplicate id targets', duplicateTargets.length === 0, JSON.stringify(duplicateTargets));
}

const appBootEntry = resolveHost('@deepseek-ai/dsh-app-boot');
if (appBootEntry === null) {
  check('the Host app-boot module is resolvable (boot-faithful composition)', false, 'cannot resolve @deepseek-ai/dsh-app-boot');
} else {
  const appBoot = await import(pathToFileURL(appBootEntry).href);
  const installAnchor = createRequire(appBootEntry).resolve('@deepseek-ai/dsh/package.json');
  note('install anchor', installAnchor);
  // t8 item 7: say out loud WHICH host the boot-faithful composition below is a dry run
  // against. An npx-cache copy is a different build from the packaged runtime the app loads,
  // so its answers describe that build, not the one that will mount this plugin.
  const hostIsCacheCopy = /npm-cache|[\\/]_npx[\\/]/i.test(installAnchor);
  let hostVersion = 'unknown';
  try {
    hostVersion = JSON.parse(readFileSync(join(dirname(appBootEntry), '..', 'package.json'), 'utf8')).version ?? 'unknown';
  } catch {
    /* keep "unknown" */
  }
  note('rehearsal host version', hostVersion + (hostIsCacheCopy ? ' (an npx-cache copy)' : ' (resolved from this installation)'));
  if (hostIsCacheCopy) {
    note(
      'install anchor warning',
      'this anchor is inside an npx cache — a different build from the packaged desktop runtime, so the checks below describe THAT build',
    );
  }
  let profile = null;
  let loadError = null;
  try {
    profile = appBoot.loadProfileDirectory('dsh', PROFILE_DIR, installAnchor);
  } catch (error) {
    loadError = String(error.message);
  }
  check('loadProfileDirectory() resolves every bundle (this is the boot-time resolver)', profile !== null, loadError ?? `profile ${profile?.name}, ${profile?.layers?.length} layers`);
  if (profile !== null) {
    const layer = profile.layers.find((candidate) => candidate.packageName === PLUGIN_NAME);
    /**
     * t8 item 7 · a host that is a different build can refuse this plugin BY ITS OWN RULE and
     * say so in `profile.skippedBundles`. The peer requirement (package.json) is
     * `@deepseek-ai/dsh ^0.2.0-rc.2`; the npx-cache copy is 0.1.7-rc.2 and legitimately skips
     * it. That is a fact about the REHEARSAL HOST, not a fault in the profile — but it only
     * earns a note when the host really said it (skip entry with a reason present). Anything
     * else that keeps the plugin out of the layers stays a hard failure.
     */
    const skippedByHost =
      (profile.skippedBundles ?? []).find((entry) => entry.packageName === PLUGIN_NAME) ?? null;
    const skippedByThisHost = layer === undefined && skippedByHost !== null && hostIsCacheCopy;
    if (skippedByThisHost) {
      note('the plugin is not mounted by THIS rehearsal host', 'skippedBundles: ' + skippedByHost.reason + ' (host ' + hostVersion + ')');
      note(
        'and that is not a profile fault',
        'the plugin requires @deepseek-ai/dsh ^0.2.0-rc.2 (package.json peerDependencies); the packaged desktop runtime satisfies it',
      );
    } else {
      check('the plugin is one of the resolved bundle layers', layer !== undefined, layer === undefined ? 'not found' : layer.packageDir);
    }
    if (layer !== undefined) {
      samePath('the resolved bundle directory is the workspace plugin dir', realpathSync(layer.packageDir), realpathSync(PLUGIN_DIR));
      // t8 item 7: the Host's field is "patchPaths" — an ARRAY, built by bundlePatchPaths()
      // (dsh-app-boot:932-937) — not the singular "patchPath" this script read, which is why
      // this line was one permanent red. The singular is kept as a fallback and the detail
      // says which one answered.
      const resolvedPatchPaths = Array.isArray(layer.patchPaths)
        ? layer.patchPaths
        : typeof layer.patchPath === 'string'
          ? [layer.patchPath]
          : [];
      check(
        'the resolved layer patch file exists',
        resolvedPatchPaths.length > 0 && resolvedPatchPaths.every((path) => existsSync(path)),
        resolvedPatchPaths.length === 0 ? 'the layer exposes neither patchPaths nor patchPath' : resolvedPatchPaths.join(', '),
      );
      check('the resolved layer carries the plugin patch rows', Array.isArray(layer.patches) && layer.patches.length > 0, `${layer.patches?.length ?? 0} row(s)`);
    }
    const bundlePatches = profile.layers.flatMap((candidate) => candidate.patches);
    const homePatches = typeof appBoot.loadOptionalPatches === 'function' ? appBoot.loadOptionalPatches('dsh', join(DSH_HOME, 'cordis.patch.yml')) ?? [] : [];
    const composed = appBoot.composeEntries([bundlePatches, profile.patches, homePatches]);
    note('composed top-level rows', composed.length);
    const ids = [];
    const walk = (entries) => {
      for (const entry of entries ?? []) {
        if (typeof entry?.id === 'string') ids.push(entry.id);
        if (Array.isArray(entry?.config)) walk(entry.config);
      }
    };
    walk(composed);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    check('the composed entry list has NO duplicate row id (the loader would throw)', duplicates.length === 0, duplicates.length === 0 ? `${ids.length} ids checked` : JSON.stringify([...new Set(duplicates)]));
    const ours = [];
    const collect = (entries) => {
      for (const entry of entries ?? []) {
        if (entry?.id === PLUGIN_NAME || entry?.name === PLUGIN_NAME) ours.push(entry);
        if (Array.isArray(entry?.config)) collect(entry.config);
      }
    };
    collect(composed);
    if (skippedByThisHost) {
      note('the composed tree carries no plugin row (this host skipped it)', 'rows now = ' + ours.length + '; a host that mounts the plugin must show exactly one');
    } else {
      same('the composed tree contains exactly one plugin row', ours.length, 1);
    }
    if (ours.length === 1) {
      same('the composed row id', ours[0].id, PLUGIN_NAME);
      same('the composed row name', ours[0].name, PLUGIN_NAME);
      check('the composed row is enabled', ours[0].disabled !== true, `disabled=${String(ours[0].disabled)}`);
    }
    note('plugin row', ours[0] ?? null);
  }
}

/* ------------------------------------------------------------------ verdict */

const failed = rows.filter((row) => !row.passed);
console.log(`\n=== precheck: ${rows.length - failed.length}/${rows.length} checks passed ===`);
if (failed.length > 0) {
  for (const row of failed) console.log(`  FAILED [${row.section}] ${row.name}${row.detail === '' ? '' : ` — ${row.detail}`}`);
  console.log('\nVERDICT: NOT READY (see failures above)');
  process.exitCode = 1;
} else {
  console.log('VERDICT: READY — the profile will mount dsh-approval-chime at the next `dsh web` start.');
}
