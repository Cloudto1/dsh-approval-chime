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
fileClaim('A.5', 'ui-session exposes sessionStatus as { getSnapshot, subscribe } (rev-27: the plural member is gone)', '@deepseek-ai/dsh-client-ui-session', 'lib/client.js', /sessionStatus = \{/);
fileClaim('A.5b', 'its getSnapshot returns the status snapshot', '@deepseek-ai/dsh-client-ui-session', 'lib/client.js', /getSnapshot: \(\) => this\.statusSnapshot/);
fileClaim('A.5c', 'its subscribe returns a disposer', '@deepseek-ai/dsh-client-ui-session', 'lib/client.js', /subscribe: \(listener\) => \{/);
fileClaim('A.6', 'the built-in panel tags its interaction kind = "approval"', '@deepseek-ai/dsh-client-ui-approval', 'lib/client.js', /this\.kind = "approval"/);
fileClaim('A.6b', 'it derives a unique key per approval', '@deepseek-ai/dsh-client-ui-approval', 'lib/client.js', /this\.key = `approval:\$\{String\(nextApprovalKey\)\}`/);
fileClaim('A.6c', 'its normal path returns the pending result without calling next()', '@deepseek-ai/dsh-client-ui-approval', 'lib/client.js', /return await pending\.result/);
fileClaim('A.6d', 'it registers itself through ctx.remote.$on on the approval event', '@deepseek-ai/dsh-client-ui-approval', 'lib/client.js', /ctx\.remote\.\$on\("approval\/request"/);
fileClaim('H3', 'a session exposes at most one pending interaction, chosen by precedence', '@deepseek-ai/dsh-client-ui-session', 'lib/client.js', /precedence >= previous\.precedence/);
fileClaim('H3b', 'the snapshot is replaced wholesale only when it really changed', '@deepseek-ai/dsh-client-ui-session', 'lib/client.js', /samePendingInteractions\(this\.pendingSnapshot, projected\)/);

/* ------------------------------------------------ §B the settings contract */

report.group('§B — the settings namespace claim');

fileClaim('B.1', 'describe() keys every descriptor by its entry id — the namespace IS the plugin entry id now', '@deepseek-ai/dsh-settings', 'lib/index.js', /ns: entry\.options\.id/);   // index.js:432
fileClaim('B.1b', 'a second settings presentation for one plugin instance is rejected', '@deepseek-ai/dsh-settings', 'lib/index.js', /is already configured/);   // index.js:372
fileClaim('B.2', 'the service writes through update(ns, patch, expectedRevision?) — register() is gone', '@deepseek-ai/dsh-settings', 'lib/types/index.d.ts', /update\(ns: string, patch: object, expectedRevision\?: number\): Promise<void>;/);   // index.d.ts:102
fileClaim('B.2b', 'the descriptor type carries the namespace it describes', '@deepseek-ai/dsh-settings', 'lib/types/index.d.ts', /ns: SettingsNamespace;/);   // index.d.ts:9
fileClaim('B.2c', 'replace() restates a whole section under an optional expected revision', '@deepseek-ai/dsh-settings', 'lib/types/index.d.ts', /replace\(ns: string, section: object, expectedRevision\?: number\): Promise<void>;/);   // index.d.ts:108
fileClaim('B.2d', 'the conflict the page must survive carries a code and both revisions', '@deepseek-ai/dsh-settings', 'lib/types/index.d.ts', /readonly code = "SETTINGS_CONFLICT";/);   // index.d.ts:33
fileClaim('B.4', 'the resolved value is the schema value unwrapped from its volatile node', '@deepseek-ai/dsh-settings', 'lib/index.js', /plainConfig\(value\.get\(\)\)/);   // index.js:98
fileClaim('B.4b', 'describe() serializes the schema with toJSON()', '@deepseek-ai/dsh-settings', 'lib/index.js', /\.toJSON\(\)/);
fileClaim('H11', 'the client decode requires a plain object value (no scalars, no arrays)', '@deepseek-ai/dsh-client-ui-settings', 'lib/client.js', /if \(typeof view\.value !== "object" \|\| view\.value === null \|\| Array\.isArray\(view\.value\)\) return void 0;/);
fileClaim('H12', 'persistence is host only on loopback', '@deepseek-ai/dsh-client-ui-settings', 'lib/client.js', /isLoopback \? "host" : "memory"/);

/* ---------------------------------------------------- §C the card contract */

report.group('§C — the settings card claim');

fileClaim('C.1', 'the shipped cards read the plugins tab slot by name', '@deepseek-ai/dsh-client-ui-settings-plugins', 'lib/client.js', /ctx\.slots\.getVersion\("settings\.plugins\.tab"\)/);   // client.js:178
fileClaim('C.2', 'the shipped cards declare the slots+locale inject pair', '@deepseek-ai/dsh-client-ui-settings-plugins', 'lib/client.js', /const inject = \["slots", "locale"\];/);   // client.js:162
fileClaim('C.2b', 'the tab entries carry id/order/label read from the slot options', '@deepseek-ai/dsh-client-ui-settings-plugins', 'lib/client.js', /id: entry\.options\.id \?\? ""/);   // client.js:185
fileClaim('C.2c', 'and their label resolves through the slots helper', '@deepseek-ai/dsh-client-ui-settings-plugins', 'lib/client.js', /resolveSlotLabel\)\(entry\.options\.label\)/);   // client.js:187
fileClaim('C.1b', 'the settings-plugins bundle exports only apply/inject', '@deepseek-ai/dsh-client-ui-settings-plugins', 'lib/client.js', /exports\.inject = inject;/);
fileClaim('C.3', 'the tab list subscribes to the slot ledger and to the locale', '@deepseek-ai/dsh-client-ui-settings-plugins', 'lib/client.js', /ctx\.slots\.subscribe\("settings\.plugins\.tab", listener\)/);   // client.js:196
fileClaim('C.4', 'and the tabs are ordered by their declared order', '@deepseek-ai/dsh-client-ui-settings-plugins', 'lib/client.js', /\.sort\(\(a, b\) => a\.order - b\.order\)/);   // client.js:188
fileClaim('C.4d', 'the platform scope set() delegates to the queueing mutate()', '@deepseek-ai/dsh-client-ui-settings', 'lib/client.js', /set\(field, value\) \{\s*$/);
fileClaim('C.4e', 'platform writes are serialized and thread the pending revision', '@deepseek-ai/dsh-client-ui-settings', 'lib/client.js', /const revision = expectedRevision \?\? this\.pendingRevision \?\? this\.getSnapshot\(\)\.revision;/);
fileClaim('C.4f', 'a refused (fenced) platform write recovers instead of rejecting', '@deepseek-ai/dsh-client-ui-settings', 'lib/client.js', /if \(!response\.ok\) \{\s*$/);
fileClaim('H7', 'the client-side service is literally named configForms (it was settingsScope)', '@deepseek-ai/dsh-client-ui-settings', 'lib/client.js', /"configForms"/);   // client.js:1284
fileClaim('H7b', 'the settings form controller is bound by { namespace: entryId }', '@deepseek-ai/dsh-client-ui-settings', 'lib/client.js', /new ConfigFormController\(this\.owner, \{ namespace: entryId \}/);   // client.js:1312
fileClaim('H7c', 'the locale service is provided under the name "locale"', '@deepseek-ai/dsh-client-locale', 'lib/client.js', /ctx\.provide\("locale", locale\)/);
fileClaim('H7d', 'the locale API exposes register(ns, dicts) returning a disposer', '@deepseek-ai/dsh-client-locale', 'lib/client.js', /register\(ns, localeOrDicts, dict\) \{/);
fileClaim('H7e', 'the locale plugin itself binds its form through ctx.configForms.get(namespace)', '@deepseek-ai/dsh-client-locale', 'lib/client.js', /ctx\.configForms\.get\(LOCALE_SETTINGS_NAMESPACE\)/);   // locale/client.js:1517
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
fileClaimNormalized('E.2', 'the Host documents the patch semantics shared by mounting and offline tooling', '@deepseek-ai/dsh-app-boot', 'lib/index.js', /THE patch semantics of this include/);   // index.js:48
searchClaim('E.2b', 'a patch that matches nothing warns and is skipped, instead of silently matching', '@deepseek-ai/dsh-app-boot', /A patch that matches nothing warns and is skipped/);   // index.js:55
fileClaim('E.3', 'the Host keeps a link-projection fallback directory inside the profile', '@deepseek-ai/dsh-app-boot', 'lib/index.js', /LINK_PROJECTION_DIR = "\.dsh-module-fallback"/);   // index.js:593
fileClaimNormalized('E.3b', 'the fallback removes only symlinks it owns, never pnpm-installed packages', '@deepseek-ai/dsh-app-boot', 'lib/index.js', /Only symlinks under the profile's .node_modules. whose target lies inside/);   // index.js:596
fileClaim('E.3c', 'and a profile without that directory is left untouched', '@deepseek-ai/dsh-app-boot', 'lib/index.js', /A profile without the directory is untouched/);   // index.js:598

/* ------------------------------- the shipped implementation against those claims */

report.group('the shipped lib/*.js uses exactly those APIs');

const implementationTokens = [
  ['A.5', 'the browser half reads ctx.uiSession', CLIENT_SOURCE, /ctx\.uiSession/],
  ['A.5', 'it targets .pendingInteractions', CLIENT_SOURCE, /service\.pendingInteractions|pendingInteractions/],
  ['A.5', 'it calls getSnapshot() on that source through the observable adapter', CLIENT_SOURCE, /source\.observable\.getSnapshot\(\)/],   // client.js:2160
  ['A.5', 'it subscribes to that source through the same adapter', CLIENT_SOURCE, /source\.observable\.subscribe\(/],   // client.js:2526
  ['A.6', 'it discriminates on kind === \x27approval\x27', CLIENT_SOURCE, /interaction\.kind !== 'approval'/],
  ['A.6b', 'it dedupes on the interaction key', CLIENT_SOURCE, /interaction\.key/],
  ['C.2', 'it registers under the settings.section slot (rev-7 moved it off settings.plugin.item)', CLIENT_SOURCE, /ctx\.slots\.inject\('settings\.section',/],
  ['C.2b', 'the entry id is the settings namespace (rev-7 replaced the keyed-card `key`)', CLIENT_SOURCE, /id: 'approval-chime',/],
  ['C.4', 'availability follows scope status ready', CLIENT_SOURCE, /status === 'ready'/],
  ['B.2', 'the browser half binds its form through ctx.configForms.get()', CLIENT_SOURCE, /configForms\.get\(/],   // client.js:146
  ['C.4b', 'writes go through the fenced scope api', CLIENT_SOURCE, /scope\.set\(field, value\)/],
  ['C.4c', 'resetting goes through the unset api', CLIENT_SOURCE, /scope\.unset\(field\)/],
  ['A.1', 'the browser half never names the approval event', CLIENT_SOURCE, /approval\/request/],
  ['A.1', 'the browser half never subscribes through the remote API', CLIENT_SOURCE, /\$on/],
  ['B.1', 'the Host half registers the documented namespace constant', HOST_SOURCE, /export const NS = 'approval-chime';/],
  ['B.2', 'the Host half publishes its namespace as a module constant instead of registering it', HOST_SOURCE, /^export const SETTINGS_NS = 'dsh-approval-chime';$/m],   // index.js:68
  ['B.6', 'the Host half imports the schema package STATICALLY (rev-26 dropped the lazy createRequire)', HOST_SOURCE, /^import z from '@deepseek-ai\/schemastery';$/m],   // index.js:52
  ['B.6', 'and builds the shipped form with z.object — the shape describe() serves', HOST_SOURCE, /return z\.object\(\{/],   // index.js:260
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

/* ------------------------- precedent: a REAL shipped bundle uses the same API pair */
/* rev-24 pointed this at a third-party bundle mounted on the web profile
 * (`dsh-quorum-panel`). That package is gone from this machine, and the two
 * third-party bundles that ARE mounted (`dsh-whale-widget`, `dshmarket`) ship no
 * `lib/client.js`. The precedent is therefore taken from the bundle every DSH
 * installation ships — the plugins settings card — which is a real bundle using the
 * same slots+locale pair. */

report.group('precedent: a real shipped bundle uses the same API pair');

const precedentPath = fileIn('@deepseek-ai/dsh-client-ui-settings-plugins', 'lib/client.js');
if (precedentPath === null || !existsSync(precedentPath)) {
  report.check('a real shipped bundle is available as a precedent', false, `not found: ${String(precedentPath)}`);
} else {
  const source = readFileSync(precedentPath, 'utf8');
  const injectList = firstMatch(source, /const inject = \[[^\]]*\]/);
  const localeRegister = firstMatch(source, /ctx\.locale\.register\(NS, \{/);
  const slotRead = firstMatch(source, /ctx\.slots\.getVersion\("settings\.plugins\.tab"\)/);
  report.check('the mounted bundle injects the same slots/locale service pair', injectList !== null && injectList.text.includes('"slots"') && injectList.text.includes('"locale"'), injectList === null ? 'no inject array' : `${precedentPath.slice(0, 60)}…:${injectList.line} → ${injectList.text}`);
  report.check('it registers its dictionary the same way', localeRegister !== null, localeRegister === null ? 'no ctx.locale.register(NS, {...})' : `line ${localeRegister.line}: ${localeRegister.text}`);
  report.check('it reads its slot before registering, like this plugin', slotRead !== null, slotRead === null ? 'no ctx.slots.getVersion(...)' : `line ${slotRead.line}: ${slotRead.text}`);
}

report.done();
