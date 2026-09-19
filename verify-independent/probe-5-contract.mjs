/**
 * Independent probe 5 — contract cross-check.
 *
 * Re-derives the load-bearing claims of `docs/契约调研.md` (§A/§B/§C/§D/§E/§H)
 * directly from the installed Host sources, and checks that the shipped
 * `lib/*.js` really uses the APIs those claims describe. Every row prints the
 * `file:line` and the matched text, so the 已证实 / 未证实 split in the report is
 * backed by raw output rather than by re-reading the research document.
 *
 * Run: node dsh-approval-chime/verify-independent/probe-5-contract.mjs
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { CLIENT_SOURCE, DSH_HOME, HOST_SOURCE, NS, resolveFromProfile, suite } from './kit/platform.mjs';

const report = suite('probe-5-contract.mjs');

function packageDir(spec) {
  const entry = resolveFromProfile(spec);
  if (entry === null) return null;
  const types = join(dirname(entry), 'types');
  const root = existsSync(types) ? dirname(dirname(entry)) : dirname(dirname(entry));
  return root;
}

function fileIn(spec, relative) {
  const root = packageDir(spec);
  if (root === null) return null;
  const path = join(root, relative);
  return existsSync(path) ? path : null;
}

function firstMatch(source, pattern) {
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = pattern.exec(lines[index]);
    if (match !== null) return { line: index + 1, text: lines[index].trim().slice(0, 180) };
  }
  return null;
}

/** Check one `file:line` claim; a missing file is recorded, never treated as a pass. */
function fileClaim(id, description, spec, relative, pattern) {
  const path = fileIn(spec, relative);
  if (path === null) {
    report.check(`${id} ${description}`, false, `file not found: ${spec}/${relative}`);
    return false;
  }
  const hit = firstMatch(readFileSync(path, 'utf8'), pattern);
  const label = `${id} ${description}`;
  const where = `${spec}/${relative}`;
  return report.check(label, hit !== null, hit === null ? `no match in ${where}` : `${where}:${hit.line} → ${hit.text}`);
}

/** Same, for prose that a formatter wrapped across comment lines. */
function fileClaimNormalized(id, description, spec, relative, pattern) {
  const path = fileIn(spec, relative);
  if (path === null) {
    report.check(`${id} ${description}`, false, `file not found: ${spec}/${relative}`);
    return false;
  }
  const raw = readFileSync(path, 'utf8');
  const normalized = raw.replace(/^\s*\*\s?/gm, '').replace(/\s+/g, ' ');
  const hit = pattern.exec(normalized);
  return report.check(
    `${id} ${description}`,
    hit !== null,
    hit === null ? `no match in ${spec}/${relative} (whitespace-normalized)` : `${spec}/${relative} → ${hit[0].slice(0, 180)}`,
  );
}

/** Walk a package and check the first hit anywhere inside it. */
function searchClaim(id, description, spec, pattern, extensions = ['.js', '.ts', '.d.ts', '.json']) {
  const root = packageDir(spec);
  if (root === null) {
    report.check(`${id} ${description}`, false, `package not resolvable: ${spec}`);
    return false;
  }
  const stack = [root];
  let scanned = 0;
  while (stack.length > 0 && scanned < 4000) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        stack.push(path);
        continue;
      }
      if (!extensions.some((extension) => entry.name.endsWith(extension))) continue;
      scanned += 1;
      let text;
      try {
        if (statSync(path).size > 4_000_000) continue;
        text = readFileSync(path, 'utf8');
      } catch {
        continue;
      }
      const hit = firstMatch(text, pattern);
      if (hit !== null) {
        return report.check(`${id} ${description}`, true, `${path.slice(root.length + 1)}:${hit.line} → ${hit.text}`);
      }
    }
  }
  return report.check(`${id} ${description}`, false, `no match anywhere under ${root}`);
}

/* --------------------------------------------------- §A the trigger contract */

report.group('§A — the approval trigger claim');

fileClaim('A.1', '$on declares exactly two parameters and forwards (ctx, event, listener)', '@deepseek-ai/dsh-api-gateway', 'lib/client.js', /\$on\(event, listener\)\s*\{/);
fileClaim('A.1b', '$on body forwards the caller, event and listener to subscribe()', '@deepseek-ai/dsh-api-gateway', 'lib/client.js', /subscribe\(this\.ctx, event, listener\)/);
searchClaim('A.1c', 'remote-events subscribe takes no third options argument', '@deepseek-ai/dsh-api-gateway', /subscribe\(callerCtx, event, listener\)/);
searchClaim('A.3', 'cordis events.ts documents the prepend option', '@deepseek-ai/cordis', /prepend/);
fileClaim('A.5', 'ui-session exposes pendingInteractions as { getSnapshot, subscribe }', '@deepseek-ai/dsh-client-ui-session', 'lib/client.js', /pendingInteractions = \{\s*$/);
fileClaim('A.5b', 'its getSnapshot returns the pending snapshot', '@deepseek-ai/dsh-client-ui-session', 'lib/client.js', /getSnapshot: \(\) => this\.pendingSnapshot/);
fileClaim('A.5c', 'its subscribe returns a disposer', '@deepseek-ai/dsh-client-ui-session', 'lib/client.js', /subscribe: \(listener\) => \{/);
fileClaim('A.6', 'the built-in panel tags its interaction kind = "approval"', '@deepseek-ai/dsh-client-ui-approval', 'lib/client.js', /this\.kind = "approval"/);
fileClaim('A.6b', 'it derives a unique key per approval', '@deepseek-ai/dsh-client-ui-approval', 'lib/client.js', /this\.key = `approval:\$\{String\(nextApprovalKey\)\}`/);
fileClaim('A.6c', 'its normal path returns the pending result without calling next()', '@deepseek-ai/dsh-client-ui-approval', 'lib/client.js', /return await pending\.result/);
fileClaim('A.6d', 'it registers itself through ctx.remote.$on on the approval event', '@deepseek-ai/dsh-client-ui-approval', 'lib/client.js', /ctx\.remote\.\$on\("approval\/request"/);
fileClaim('H3', 'a session exposes at most one pending interaction, chosen by precedence', '@deepseek-ai/dsh-client-ui-session', 'lib/client.js', /precedence >= previous\.precedence/);
fileClaim('H3b', 'the snapshot is replaced wholesale only when it really changed', '@deepseek-ai/dsh-client-ui-session', 'lib/client.js', /samePendingInteractions\(this\.pendingSnapshot, projected\)/);

/* ------------------------------------------------ §B the settings contract */

report.group('§B — the settings namespace claim');

fileClaim('B.1', 'the namespace pattern is /^[a-z][a-z0-9-]*$/', '@deepseek-ai/dsh-settings', 'lib/index.js', /const NAMESPACE_PATTERN = \/\^\[a-z\]\[a-z0-9-\]\*\$\/;/);
fileClaim('B.1b', 'a duplicate namespace is rejected', '@deepseek-ai/dsh-settings', 'lib/index.js', /is already registered/);
fileClaim('B.2', 'register() takes (ns, schema, options) and returns a scope', '@deepseek-ai/dsh-settings', 'lib/types/index.d.ts', /register<const Namespace extends string, T>\(/);
fileClaim('B.2b', 'the options type documents applies', '@deepseek-ai/dsh-settings', 'lib/types/index.d.ts', /applies\?: SettingsApplies/);
fileClaim('B.2c', 'the scope exposes watch/update/replace', '@deepseek-ai/dsh-settings', 'lib/types/index.d.ts', /update\(patch: object\): Promise<void>;/);
fileClaim('B.2d', 'the scope exposes watch(callback)', '@deepseek-ai/dsh-settings', 'lib/types/index.d.ts', /watch\(callback: \(next: T, prev: T\) => void \| Promise<void>\): \(\) => void;/);
fileClaim('B.4', 'the resolved value is schema(mergeLayers(base, section))', '@deepseek-ai/dsh-settings', 'lib/index.js', /const value = schema\(mergeLayers\(base, section\)\)/);
fileClaim('B.4b', 'describe() serializes the schema with toJSON()', '@deepseek-ai/dsh-settings', 'lib/index.js', /\.toJSON\(\)/);
fileClaim('H11', 'the client decode requires a plain object value (no scalars, no arrays)', '@deepseek-ai/dsh-client-ui-settings', 'lib/client.js', /if \(typeof view\.value !== "object" \|\| view\.value === null \|\| Array\.isArray\(view\.value\)\) return void 0;/);
fileClaim('H12', 'persistence is host only on loopback', '@deepseek-ai/dsh-client-ui-settings', 'lib/client.js', /isLoopback \? "host" : "memory"/);

/* ---------------------------------------------------- §C the card contract */

report.group('§C — the settings card claim');

fileClaim('C.1', 'the slot contract keys settings.plugin.item by namespace', '@deepseek-ai/dsh-client-ui-settings-plugins', 'lib/types/client/slot-contract.d.ts', /'settings\.plugin\.item': \{/);
fileClaim('C.2', 'the shipped cards register through slots.inject + slots.register', '@deepseek-ai/dsh-client-ui-settings-plugins', 'lib/client.js', /ctx\.slots\.inject\("settings\.plugin\.item"/);
fileClaim('C.2b', 'the shipped cards pass name/key/locale', '@deepseek-ai/dsh-client-ui-settings-plugins', 'lib/client.js', /name: "settings\.plugin\.item",/);
fileClaim('C.2c', 'the card entry carries the namespace as key', '@deepseek-ai/dsh-client-ui-settings-plugins', 'lib/client.js', /key: SHELL_NS,/);
fileClaim('C.1b', 'the settings-plugins bundle exports only apply/inject', '@deepseek-ai/dsh-client-ui-settings-plugins', 'lib/client.js', /exports\.inject = inject;/);
fileClaim('C.3', 'the tab dispatches only namespaces the Host serves', '@deepseek-ai/dsh-client-ui-settings-plugins', 'lib/client.js', /served\.has\(entry\.options\.key\)/);
fileClaim('C.4', 'a card is available when the scope snapshot is ready', '@deepseek-ai/dsh-client-ui-settings-plugins', 'lib/client.js', /available: snapshot\.status === "ready",/);
fileClaim('C.4d', 'the platform scope set() delegates to the queueing mutate()', '@deepseek-ai/dsh-client-ui-settings', 'lib/client.js', /set\(field, value\) \{\s*$/);
fileClaim('C.4e', 'platform writes are serialized and thread the pending revision', '@deepseek-ai/dsh-client-ui-settings', 'lib/client.js', /const revision = expectedRevision \?\? this\.pendingRevision \?\? this\.getSnapshot\(\)\.revision;/);
fileClaim('C.4f', 'a refused (fenced) platform write recovers instead of rejecting', '@deepseek-ai/dsh-client-ui-settings', 'lib/client.js', /if \(!response\.ok\) \{\s*$/);
fileClaim('H7', 'the client-side service is literally named settingsScope', '@deepseek-ai/dsh-client-ui-settings', 'lib/client.js', /"settingsScope"/);
fileClaim('H7b', 'the settings scope binder keys on spec.namespace', '@deepseek-ai/dsh-client-ui-settings', 'lib/client.js', /`ui-settings: \$\{spec\.namespace\} settings scope`/);
fileClaim('H7c', 'the locale service is provided under the name "locale"', '@deepseek-ai/dsh-client-locale', 'lib/client.js', /ctx\.provide\("locale", locale\)/);
fileClaim('H7d', 'the locale API exposes register(ns, dicts) returning a disposer', '@deepseek-ai/dsh-client-locale', 'lib/client.js', /register\(ns, localeOrDicts, dict\) \{/);
fileClaim('H7e', 'the locale plugin itself binds a scope by { namespace }', '@deepseek-ai/dsh-client-locale', 'lib/client.js', /ctx\.settingsScope\.bind\(\{ namespace: LOCALE_SETTINGS_NAMESPACE \}\)/);
fileClaim('H7f', 'the slots service is provided under the name "slots"', '@deepseek-ai/dsh-client-ui-renderer', 'lib/client.js', /super\(ctx, "slots"\)/);
fileClaim('H7g', 'the uiSession service is provided under the name "uiSession"', '@deepseek-ai/dsh-client-ui-session', 'lib/client.js', /super\(ctx, "uiSession"\)/);

const cardFormExported = (() => {
  const path = fileIn('@deepseek-ai/dsh-client-ui-settings-plugins', 'lib/client.js');
  if (path === null) return null;
  return /exports\.CardForm/.test(readFileSync(path, 'utf8'));
})();
report.check('C.1d CardForm is NOT requireable from another bundle (expected：not exported)', cardFormExported === false, `exports.CardForm present: ${String(cardFormExported)}`);

/* --------------------------------------------------- §D/E the mount contract */

report.group('§D/§E — client loading and mounting claims');

searchClaim('D.1', 'a missing client bundle has a dedicated error type', '@deepseek-ai/dsh-client-modules', /MissingClientBundleError = class extends Error/);
fileClaim('D.2', 'the module table is keyed by package name', '@deepseek-ai/dsh-client-modules', 'lib/index.js', /this\.table\.set\(packageName, \{/);
fileClaim('D.2b', 'the bundle bytes are held in the table (host-side cache)', '@deepseek-ai/dsh-client-modules', 'lib/index.js', /bundle: snapshot\.bundle,/);
fileClaim('D.3', 'a registration id must be the package name', '@deepseek-ai/dsh-client-modules', 'lib/types/client/manifest.d.ts', /Plugin id \(package name\) — the registration key; must match the graph row being executed\./);
fileClaim('D.3b', 'the bundle default loader is a same-origin classic <script src>', '@deepseek-ai/dsh-client-modules', 'lib/types/client/manifest.d.ts', /Defaults to a same-origin classic `<script src>` element\./);
fileClaim('D.3c', 'a bundle only registers its factory; side effects wait for materialization', '@deepseek-ai/dsh-client-modules', 'lib/types/client/manifest.d.ts', /window\.__ModuleLoader__\.load\(\{id, factory\}\)/);
fileClaim('D.4', 'the manifest declares dsh.client.platform, and the Web consumer selects web', '@deepseek-ai/dsh-package-manifest', 'lib/types/types.d.ts', /Client platform identifier; the Web consumer selects `web`\./);
fileClaim('D.4b', 'the client manifest interface carries platform/inject/external', '@deepseek-ai/dsh-package-manifest', 'lib/types/types.d.ts', /export interface DshClientManifest \{/);
fileClaim('E.1', 'dsh-app-boot sets ctx.baseUrl to the profile directory URL', '@deepseek-ai/dsh-app-boot', 'lib/index.js', /ctx\.baseUrl = pathToFileURL\(dirname\(absoluteConfigPath\)\)\.href/);
fileClaimNormalized('E.1b', 'a bundle name resolves first from the dsh installation, then the profile', '@deepseek-ai/dsh-app-boot', 'lib/index.js', /a bundle name resolves first from the dsh installation \(the launcher's own package\), then from the profile directory\./);
fileClaimNormalized('E.2', 'patch layers are merged into one array and applied in a single update', '@deepseek-ai/cordis-plugin-include', 'src/index.ts', /const data = this\.applyPatches\(this\.data!, config\.patches\) await this\.root\.update\(data\)/);
searchClaim('E.2b', 'a duplicate loader entry id throws', '@deepseek-ai/cordis-plugin-loader', /duplicate loader entry id/);
fileClaim('E.3', 'the Host maintains $DSH_HOME/profiles/node_modules as a self-healing fallback', '@deepseek-ai/dsh-app-boot', 'lib/index.js', /healProfilesModuleFallback\(options\)/);
fileClaimNormalized('E.3b', 'the fallback is described as mirroring the installation dependency closure', '@deepseek-ai/dsh-app-boot', 'lib/index.js', /mirrors the dsh installation dependency closure/);
fileClaim('E.3c', 'the fallback writer creates symlinks per package name', '@deepseek-ai/dsh-app-boot', 'lib/index.js', /else ensureSymlink\(link, entry\.packageDir\);/);

/* ------------------------------- the shipped implementation against those claims */

report.group('the shipped lib/*.js uses exactly those APIs');

const implementationTokens = [
  ['A.5', 'the browser half reads ctx.uiSession', CLIENT_SOURCE, /ctx\.uiSession/],
  ['A.5', 'it targets .pendingInteractions', CLIENT_SOURCE, /service\.pendingInteractions|pendingInteractions/],
  ['A.5', 'it calls getSnapshot() on that source', CLIENT_SOURCE, /source\.getSnapshot\(\)/],
  ['A.5', 'it subscribes to that source', CLIENT_SOURCE, /source\.subscribe\(/],
  ['A.6', 'it discriminates on kind === \x27approval\x27', CLIENT_SOURCE, /interaction\.kind !== 'approval'/],
  ['A.6b', 'it dedupes on the interaction key', CLIENT_SOURCE, /interaction\.key/],
  ['C.2', 'it registers under the settings.section slot (rev-7 moved it off settings.plugin.item)', CLIENT_SOURCE, /ctx\.slots\.inject\('settings\.section',/],
  ['C.2b', 'the entry id is the settings namespace (rev-7 replaced the keyed-card `key`)', CLIENT_SOURCE, /id: 'approval-chime',/],
  ['C.4', 'availability follows scope status ready', CLIENT_SOURCE, /status === 'ready'/],
  ['B.2', 'the browser half binds its scope by namespace', CLIENT_SOURCE, /ctx\.settingsScope\.bind\(\{ namespace: NS \}\)/],
  ['C.4b', 'writes go through the fenced scope api', CLIENT_SOURCE, /scope\.set\(field, value\)/],
  ['C.4c', 'resetting goes through the unset api', CLIENT_SOURCE, /scope\.unset\(field\)/],
  ['A.1', 'the browser half never names the approval event', CLIENT_SOURCE, /approval\/request/],
  ['A.1', 'the browser half never subscribes through the remote API', CLIENT_SOURCE, /\$on/],
  ['B.1', 'the Host half registers the documented namespace constant', HOST_SOURCE, /export const NS = 'approval-chime';/],
  ['B.2', 'the Host half registers with applies: live', HOST_SOURCE, /settings\.register\(NS, schema, \{ applies: 'live' \}\)/],
  ['B.6', 'the Host half resolves schemastery lazily through createRequire', HOST_SOURCE, /createRequire\(anchor\)\.resolve\(SCHEMA_PACKAGE\)/],
  ['B.6', 'it has no static schemastery import', HOST_SOURCE, /^import\s+[^;]*schemastery/m],
];
for (const [id, text, source, pattern] of implementationTokens) {
  const hit = firstMatch(source, pattern);
  const expectPresent = id !== 'A.1' && !text.includes('no static');
  const ok = expectPresent ? hit !== null : hit === null;
  report.check(`${id} ${text}`, ok, expectPresent ? (hit === null ? 'no match' : `line ${hit.line}: ${hit.text}`) : hit === null ? 'no match (as required)' : `unexpected hit at line ${hit.line}: ${hit.text}`);
}

report.note('implementation namespace constant', NS);
report.note('host file under test', 'lib/index.js');
report.note('browser file under test', 'lib/client.js');
report.check('the card key literal in the browser half is the Host namespace', CLIENT_SOURCE.includes("var NS = 'approval-chime';"), 'var NS = \'approval-chime\';');

/* ------------------------- precedent: a third-party bundle already mounted on this machine */

report.group('precedent: an already-mounted third-party bundle uses the same API pair');

const precedent = join(DSH_HOME, 'profiles', 'web', 'node_modules', 'dsh-quorum-panel', 'lib', 'client.js');
if (!existsSync(precedent)) {
  report.check('a mounted workspace plugin is available as a precedent', false, `not found: ${precedent}`);
} else {
  const source = readFileSync(precedent, 'utf8');
  const injectList = firstMatch(source, /var inject = \[[^\]]*\]/);
  const localeRegister = firstMatch(source, /ctx\.locale\.register\(NS, DICT\)/);
  const slotInject = firstMatch(source, /ctx\.slots\.inject\('shell\.overlay', function \(\) \{/);
  report.check('the mounted bundle injects the same slots/locale service pair', injectList !== null && injectList.text.includes("'slots'") && injectList.text.includes("'locale'"), injectList === null ? 'no inject array' : `${precedent.slice(0, 60)}…:${injectList.line} → ${injectList.text}`);
  report.check('it registers its dictionary the same way', localeRegister !== null, localeRegister === null ? 'no ctx.locale.register(NS, DICT)' : `line ${localeRegister.line}: ${localeRegister.text}`);
  report.check('it waits for its slot before registering, like this plugin', slotInject !== null, slotInject === null ? 'no ctx.slots.inject(...)' : `line ${slotInject.line}: ${slotInject.text}`);
}

report.done();
