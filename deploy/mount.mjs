#!/usr/bin/env node
/**
 * dsh-approval-chime — profile mount script (task t5).
 *
 * Performs exactly three profile-side changes, after taking a full backup:
 *   1. `dependencies["dsh-approval-chime"] = "link:<workspace plugin dir>"`   (profile package.json)
 *   2. append `"dsh-approval-chime"` to `dsh.profile.bundles`                (profile package.json)
 *   3. `node_modules/dsh-approval-chime` junction → the workspace plugin dir (profile node_modules)
 *
 * It never runs pnpm, never restarts `dsh web`, and never touches any other key.
 * Idempotent: re-running it makes no change and says so.
 *
 * Usage:
 *   node dsh-approval-chime/deploy/mount.mjs --dry-run   # show the diff, write nothing
 *   node dsh-approval-chime/deploy/mount.mjs --emit-expected dsh-approval-chime/deploy/expected-package.json
 *   node dsh-approval-chime/deploy/mount.mjs             # backup + apply (the desktop app's profile)
 *   node dsh-approval-chime/deploy/mount.mjs --profile-dir <dir>   # mount a different profile
 *
 * Backups: written to `$DSH_HOME/approval-chime/profile-backups/backup-<ts>/` —
 * i.e. OUTSIDE any git work tree. The backup is a byte-for-byte copy of the
 * profile files, so it must never land inside a repository (the profile's
 * cordis.patch.yml can contain plaintext tokens). Override with
 * `--backup-dir <path>`; if the resolved root still sits inside a git work tree,
 * the script prints a loud warning.
 */

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = resolve(HERE, '..');
const PLUGIN_NAME = 'dsh-approval-chime';
// A whitespace-only $DSH_HOME counts as UNSET, and the result is ALWAYS absolute -
// the platform's own rule (dsh-home-paths: trim, then resolve), so this script and
// the Host can never disagree about which directory is being mounted. Before this,
// a blank value produced the relative path "<three spaces>\profiles\web" (V-6).
const DSH_HOME = resolve(
  typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME.trim().length > 0 ? process.env.DSH_HOME : join(homedir(), '.dsh'),
);
/**
 * t8 item 15: which profile is mounted. The DEFAULT is "desktop" — the one the desktop app
 * loads (`~/.dsh/profiles/desktop`, whose `dsh.profile.bundles` ends with this plugin).
 * It used to be hard-wired to "web", so on a machine that only runs the desktop profile the
 * script rewrote ANOTHER profile while the app still showed nothing — and the closing line
 * told the user to restart `dsh web`. `--profile-dir` overrides it, exactly as precheck.mjs
 * does, and the run always prints which profile it is using.
 */
const DEFAULT_PROFILE_NAME = 'desktop';
const profileDirArgument = process.argv.indexOf('--profile-dir');
const PROFILE_DIR =
  profileDirArgument >= 0 && process.argv[profileDirArgument + 1]
    ? resolve(process.argv[profileDirArgument + 1])
    : join(DSH_HOME, 'profiles', DEFAULT_PROFILE_NAME);
const PROFILE_PKG = join(PROFILE_DIR, 'package.json');
const PROFILE_PATCH = join(PROFILE_DIR, 'cordis.patch.yml');
const PROFILE_LOCK = join(PROFILE_DIR, 'pnpm-lock.yaml');
const LINK_PATH = join(PROFILE_DIR, 'node_modules', PLUGIN_NAME);
/** pnpm writes `link:` specs with forward slashes, exactly like the dsh-quorum entry. */
const LINK_SPEC = `link:${PLUGIN_DIR.replace(/\\/g, '/')}`;

/**
 * 备份根目录：默认在 $DSH_HOME 之下 —— 那里不在任何 git 工作树里，所以备份
 * （profile 配置的逐字节副本，可能含明文令牌）永远不会落进仓库树。
 * 位置可用 `--backup-dir <path>` 覆盖；覆盖后若不巧落在某个 git 工作树里，
 * 脚本会明确告警（见 findGitWorkTree）。
 *
 * t8 item 7：这是"备份放哪儿"的**唯一**定义 —— precheck.mjs 用同一条规则找基线
 * （同样的 `--backup-dir` 覆盖、同样的默认值），所以"mount 往哪写"和"precheck 去哪读"
 * 不可能再各说各话（以前 precheck 只看 deploy/backup-*，那是另一台机器的快照）。
 */
const backupDirIndex = process.argv.indexOf('--backup-dir');
const BACKUP_ROOT = backupDirIndex >= 0 && process.argv[backupDirIndex + 1]
  ? resolve(process.argv[backupDirIndex + 1])
  : join(DSH_HOME, 'approval-chime', 'profile-backups');

const dryRun = process.argv.includes('--dry-run');
const expectedIndex = process.argv.indexOf('--emit-expected');
const expectedPath = expectedIndex >= 0 ? resolve(process.argv[expectedIndex + 1]) : null;
const changes = [];
const notes = [];

function say(line) {
  console.log(line);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/* ------------------------------------------------------------------- backup */

/** 从 dir 向上找 .git，判断这个位置是否落在某个 git 工作树里（找不到返回 null）。 */
function findGitWorkTree(dir) {
  let current = resolve(dir);
  for (;;) {
    if (existsSync(join(current, '.git'))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function backup() {
  const directory = join(BACKUP_ROOT, `backup-${timestamp()}`);
  mkdirSync(directory, { recursive: true });
  const files = [];
  for (const path of [PROFILE_PKG, PROFILE_PATCH, PROFILE_LOCK]) {
    if (!existsSync(path)) continue;
    const target = join(directory, basename(path));
    copyFileSync(path, target);
    files.push({ source: path, backup: target, bytes: statSync(path).size, sha256: sha256(path) });
  }
  const nodeModules = join(PROFILE_DIR, 'node_modules');
  const entries = [];
  if (existsSync(nodeModules)) {
    for (const name of [PLUGIN_NAME, 'dsh-quorum', 'dsh-quorum-panel', 'dsh-team-probe', 'dsh-whale-widget']) {
      const path = join(nodeModules, name);
      entries.push({ name, exists: existsSync(path), link: existsSync(path) ? lstatSync(path).isSymbolicLink() : false, target: existsSync(path) && lstatSync(path).isSymbolicLink() ? readlinkSync(path) : null });
    }
  }
  const manifest = {
    createdAt: new Date().toISOString(),
    profileDir: PROFILE_DIR,
    pluginDir: PLUGIN_DIR,
    files,
    nodeModulesSample: entries,
    packageJsonBefore: existsSync(PROFILE_PKG) ? JSON.parse(readFileSync(PROFILE_PKG, 'utf8')) : null,
  };
  writeFileSync(join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { directory, files, manifest };
}

/* -------------------------------------------------------------------- apply */

function applyManifest() {
  const raw = readFileSync(PROFILE_PKG, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`profile package.json is not valid JSON: ${String(error.message)}`);
  }
  const dependencies = { ...(parsed.dependencies ?? {}) };
  const bundles = [...(parsed.dsh?.profile?.bundles ?? [])];
  const originalDeps = JSON.stringify(dependencies);
  const originalBundles = JSON.stringify(bundles);

  if (dependencies[PLUGIN_NAME] === undefined) {
    // Insert in pnpm's alphabetical position so a later `pnpm install` has nothing to reorder.
    const names = Object.keys(dependencies);
    const index = names.findIndex((name) => name.localeCompare(PLUGIN_NAME) > 0);
    const next = {};
    for (const name of names) {
      if (index >= 0 && name === names[index]) next[PLUGIN_NAME] = LINK_SPEC;
      next[name] = dependencies[name];
    }
    if (index < 0) next[PLUGIN_NAME] = LINK_SPEC;
    for (const key of Object.keys(dependencies)) delete dependencies[key];
    Object.assign(dependencies, next);
    changes.push(`dependencies["${PLUGIN_NAME}"] = ${JSON.stringify(LINK_SPEC)}`);
  } else if (dependencies[PLUGIN_NAME] !== LINK_SPEC) {
    throw new Error(`dependencies["${PLUGIN_NAME}"] already exists with a different spec: ${JSON.stringify(dependencies[PLUGIN_NAME])}`);
  } else {
    notes.push(`dependencies["${PLUGIN_NAME}"] already correct`);
  }

  if (!bundles.includes(PLUGIN_NAME)) {
    bundles.push(PLUGIN_NAME);
    changes.push(`dsh.profile.bundles[] += ${JSON.stringify(PLUGIN_NAME)} (appended as the last layer)`);
  } else {
    notes.push('dsh.profile.bundles already contains the plugin');
  }
  if (bundles.filter((name) => name === PLUGIN_NAME).length > 1) throw new Error(`dsh.profile.bundles lists ${PLUGIN_NAME} more than once`);

  const nextManifest = {
    ...parsed,
    dependencies,
    dsh: {
      ...(parsed.dsh ?? {}),
      profile: { ...(parsed.dsh?.profile ?? {}), bundles },
    },
  };
  const nextRaw = `${JSON.stringify(nextManifest, null, 2)}\n`;
  const changed = JSON.stringify(dependencies) !== originalDeps || JSON.stringify(bundles) !== originalBundles;

  if (changed && !dryRun) writeFileSync(PROFILE_PKG, nextRaw, 'utf8');
  if (!changed) notes.push('profile package.json already up to date — nothing written');
  return { changed, nextRaw, nextManifest };
}

function applyLink() {
  if (existsSync(LINK_PATH)) {
    const stats = lstatSync(LINK_PATH);
    if (!stats.isSymbolicLink()) throw new Error(`${LINK_PATH} exists but is not a link/junction`);
    const target = realpathSync(LINK_PATH);
    if (resolve(target).toLowerCase() !== resolve(PLUGIN_DIR).toLowerCase()) {
      throw new Error(`${LINK_PATH} points at ${target}, expected ${PLUGIN_DIR}`);
    }
    notes.push(`junction ${LINK_PATH} already points at the plugin directory`);
    return false;
  }
  if (!dryRun) symlinkSync(PLUGIN_DIR, LINK_PATH, 'junction');
  changes.push(`New-Item -ItemType Junction -Path "${LINK_PATH}" -Target "${PLUGIN_DIR}"`);
  return true;
}

/* ----------------------------------------------------------------------- run */

say(`# dsh-approval-chime mount${dryRun ? ' (dry run — nothing is written)' : ''}`);
say('profile : ' + PROFILE_DIR + (profileDirArgument >= 0 ? '   (--profile-dir)' : '   (the desktop app\'s profile: ' + DEFAULT_PROFILE_NAME + ')'));
say(`plugin  : ${PLUGIN_DIR}`);
say(`backup  : ${BACKUP_ROOT}${dryRun ? ' (dry run — no backup is written)' : ''}`);
say('');

if (!existsSync(PROFILE_PKG)) throw new Error(`profile manifest not found: ${PROFILE_PKG}`);
if (!existsSync(join(PLUGIN_DIR, 'lib', 'index.js'))) throw new Error(`plugin host half not found: ${join(PLUGIN_DIR, 'lib', 'index.js')}`);

// Round-trip guard: prove we can parse before we ever write.
JSON.parse(readFileSync(PROFILE_PKG, 'utf8'));

let backupResult = null;
if (!dryRun) {
  backupResult = backup();
  say(`[backup] ${backupResult.directory}`);
  for (const file of backupResult.files) say(`         ${file.source} → ${basename(file.backup)} (${file.bytes} B, sha256 ${file.sha256.slice(0, 16)}…)`);
  const repo = findGitWorkTree(backupResult.directory);
  if (repo) {
    say(`[warn] 备份目录落在 git 工作树内：${repo}`);
    say('       备份是 profile 的逐字节副本（可能含明文令牌），不要放进仓库树；');
    say('       默认位置 $DSH_HOME/approval-chime/profile-backups 在仓库之外，');
    say('       需要改位置请用 --backup-dir <仓库外的路径>。');
  }
  say('');
}

const manifestResult = applyManifest();
const linkChanged = applyLink();

if (expectedPath !== null) {
  writeFileSync(expectedPath, manifestResult.nextRaw, 'utf8');
  say(`[expected] wrote the would-be profile manifest to ${expectedPath}`);
}

say('[changes]');
if (changes.length === 0) say('  (none — the profile already has all three changes)');
for (const change of changes) say(`  • ${change}`);
say('[notes]');
for (const note of notes) say(`  · ${note}`);
if (linkChanged && dryRun) changes.push('junction would be created');
say('');
if (!dryRun) {
  // Post-write invariants: the file must still parse and contain exactly the expected deltas.
  const written = JSON.parse(readFileSync(PROFILE_PKG, 'utf8'));
  if (written.dependencies?.[PLUGIN_NAME] !== LINK_SPEC) throw new Error('post-write check failed: dependency spec is wrong');
  if (written.dsh?.profile?.bundles?.filter((name) => name === PLUGIN_NAME).length !== 1) throw new Error('post-write check failed: bundles entry is wrong');
  say('[post-write] profile package.json re-parsed OK; dependency + bundles entry verified.');
}
say(
  dryRun
    ? '[done] dry run complete — no file was written.'
    : '[done] mount applied. Restart the DSH desktop app (or \`dsh web\` for the web profile) to activate (NOT done by this script).',
);
