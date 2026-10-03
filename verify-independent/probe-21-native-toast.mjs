/**
 * ⚠️ REBUILT 2026-10-02 — NOT the rev-29 original.
 *
 * The 2026-10-01 `robocopy /MIR` write-through destroyed this file; the surviving
 * copy is the revision from BEFORE the rev-29 second re-anchor pass (172068 B /
 * `4b874ffb16d1904d…`). The rev-29 final was 172536 B / `18fde0dab5d6827c…` — the
 * second pass also added ~468 B of explanatory COMMENT text that cannot be
 * recovered, so byte equality is impossible and is not claimed.
 *
 * Applied from that recorded pass: A14 (the inline byte-image check re-pinned from
 * rev-27 to rev-29) and A15 (the Host-suite literal-row expectation 3 → 2).
 * Also: the freeze-page anchor now points at the RESTORED page, and says so in its
 * own note — the rev-29 page (65195 B / `2c1e0391…`) is itself a loss.
 */
/**
 * Independent probe 21 — rev-25 "Windows native notification" (t7, verifier).
 *
 * Written from the FROZEN CONTRACT ONLY (`docs/native-toast-接口冻结.md`) plus the
 * two real product files and the six deploy scripts. Nothing in this file is
 * copied from `verify/*.test.mjs`: the assertion wording, the expected values and
 * the instruments (reporter, sandbox, HTTP stubs, spawn recorder, manual timer
 * rig, PE reader, UTF-8 child capture) are this probe's own. `verify-independent/
 * kit/platform.mjs` is reused for the classic-script loader and the fake Host
 * context, exactly as the other probes in this directory do.
 *
 * The frozen strings below were read out of the contract page by hand; the
 * notification XML is compared against the contract's own ```xml block, parsed at
 * run time, not against a hand-typed copy of the implementation's output.
 *
 * Sections
 *   1  source-level contract       (no second trigger, no HTML5 path, defaults)
 *   2  frozen toast XML            (contract block vs the implementation)
 *   3  real machine, one-off AUMID (raise -> History read-back -> clean up)
 *   4  real machine, product AUMID + truncation/escaping still load
 *   5  registry, offline tier      (bytes, plan, PE subsystem, no HKLM/.lnk)
 *   6  registry, post-install tier (read-only; names its own "not-installed")
 *   7  Host fail-closed matrix     (real bridge, real files, recorded spawns)
 *   8  client trigger matrix       (four DOM states + return-to-foreground)
 *   9  default-off zero side effect(client + host + registry + child processes)
 *  10  client "unknown key" drop   (with a positive control next to it)
 *  11  independence cross-checks   (author suite counts, probe-4, REVISION)
 *  12  manual checklist presence
 *
 * Run: node dsh-approval-chime/verify-independent/probe-21-native-toast.mjs
 */

import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';

import { approval, findAll, loadBundle, makeCtx, mount, settle, suite, walk, allText, watchRejections, CLIENT_PATH, HOST_PATH, PLUGIN_DIR, readOrNull } from './kit/platform.mjs';

/* ------------------------------------------------------------------ frozen contract */

const AUMID = 'Dsh.ApprovalChime.NativeToast';
const APP_NAME = 'DSH 通知提醒';
const SCHEME = 'dsh-approval-chime';
const ROUTE = '/api/approval-chime/native-toast';
const GROUP = 'dsh-approval-chime';
const TTL_MS = 600000;
const TITLE = 'DSH 需要你的授权';
const BUTTON_ALLOW = '接受';
const BUTTON_DENY = '拒绝';
const TEXT_LIMIT = 200;
const POLL_MS = 1000;
const ETHALON = '工具 bash 请求越权执行';

const FREEZE_DOC = join(PLUGIN_DIR, 'docs', 'native-toast-接口冻结.md');
const MANUAL_DOC = join(PLUGIN_DIR, 'docs', 'native-toast-人工验收.md');
const DEPLOY_DIR = join(PLUGIN_DIR, 'deploy', 'native-toast');
const EVIDENCE_DIR = join(PLUGIN_DIR, 'verify-independent', '_raw', 'r25-evidence');
const SCRATCH_HOME = join(EVIDENCE_DIR, 'scratch-bridge-home');
const PS = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const WSCRIPT = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'wscript.exe');
const RAISE_PS1 = join(DEPLOY_DIR, 'raise.ps1');
const HISTORY_PS1 = join(EVIDENCE_DIR, 'probe21-history.ps1');
const TOKEN_PATTERN = /^[0-9a-f]{32}$/;

const report = suite('probe-21-native-toast.mjs (independent, rev-25)');
const rejections = watchRejections();
const readings = {};

mkdirSync(EVIDENCE_DIR, { recursive: true });

/**
 * Hash discipline (captain, this round): every reading must belong to ONE
 * revision. The product was being edited while this probe was written, so the
 * watched files are hashed before the first check and again after the last one;
 * a difference invalidates the run instead of mixing two revisions.
 */
const WATCHED_FILES = [
  'lib/native-toast.js',
  'lib/native-bridge.js',
  'lib/client.js',
  'lib/index.js',
  'deploy/native-toast/install.ps1',
  'deploy/native-toast/uninstall.ps1',
  'deploy/native-toast/raise.ps1',
  'deploy/native-toast/answer.ps1',
  'deploy/native-toast/activate.vbs',
  'deploy/native-toast/selftest.ps1',
  'docs/native-toast-接口冻结.md',
  // The author suites this probe RUNS belong to the revision too: if one of them moves
  // mid-run the run mixes two revisions and is discarded like any other.
  'verify/host-half.test.mjs',
  'verify/client-half.test.mjs',
  'verify/native-toast.test.mjs',
];
const hashFile = (relative) => createHash('sha256').update(readFileSync(join(PLUGIN_DIR, relative))).digest('hex');

/**
 * The revision this probe is ANCHORED to — rev-25 r5, i.e. after t21 (H3: the
 * installer proves every write by reading it back) and t22 (the notification block
 * became its own group, last on the settings page).
 * Every reading below belongs to these bytes; a mismatch is a hard failure rather
 * than a warning, because the t7 round showed what a silently moving revision does
 * to a report (mixed bytes, then two runs discarded).
 *
 * Movement so far (HISTORY — the table below is the authority, and every literal here was read
 * off the disk at the revision named; the r30 links come from `.scratch/audit-r30/fix-report-3.md`
 * and its verification reports):
 * `lib/client.js` t11 `CB2F97AF…`/217911 → `9D53743B…`/220290 → t4
 * `8ADAACC3…`/220310 (REVISION bump) → t22 `5D94FF5B…`/222960 (UI grouping) → rev-26 settings
 * model migration `14F53B82…`/225496 (left this table stale) → rev-27 `41DAF63A…`/229479
 * (the chime's trigger source moved to `uiSession.sessionStatus`) → rev-29 `63FB447D…`/240875
 * → r30 t10 `D13FFECA…`/244105 → r30 t13 `276D9DA4…`/244417 → r30 tail (the notification
 * test button) `F1B3B3B6…`/253603 → **r30 tail (flood control + the switch-reset fix)
 * `6A7905CD…`/258008**;
 * `lib/native-toast.js` t14 `B8B24D99…`/26479 → `7F66E172…`/28334 → **r30 `6534B167…`/29555**;
 * `lib/native-bridge.js` t14 `DB5948AB…`/25002 → `494FA682…`/25312 → r30 `D0C89824…`/27122
 * → **r30 t13 `B0FE419D…`/27123**;
 * `lib/index.js` — **`066BE96E…`/55458** (the value this table asserts; the r30 batch touched this
 * file, so the row's own note — not this sentence — is what the probe compares);
 * `raise.ps1` **`90EE71C7…`/2808** and `answer.ps1` **`07487CD3…`/2990** — unchanged by r30;
 * contract page t14 `4349F9EC…`/53941 → t4 `A516D2C6…`/61987
 * → **r30 `7C50D945…`/64450 (§3.1's example stops hard-coding the interpreter path)**.
 *
 * r30 re-anchor of the four DEPLOY rows (they had been stale since r30's deploy batch rewrote those
 * files, and this instrument is not in `run-r13.ps1`'s probe list, so no run had noticed):
 * `install.ps1` `B5C73A7D…`/16234 → **`21E7B0CE…`/18500**;
 * `uninstall.ps1` `58D3427F…`/5248 → **`5F674BFF…`/6221**;
 * `selftest.ps1` `A5672083…`/12473 → **`F681293C…`/12470**;
 * `activate.vbs` `8EE7DD9A…`/1985 → **`474DA965…`/2639**.
 *
 * These 11 rows are RE-DERIVED ON EVERY CANONICAL RUN by `probe-24-anchor-drift.mjs`, so a future
 * edit to one of these files turns the run red until its row is re-anchored here. This probe itself
 * stays OUT of the run on purpose (it needs `_raw` records no clone has, plus a live notification
 * platform); its remaining, adjudicated reds are listed in `docs/probe-21-known-red-ledger.md`.
 *
 * A row that moves MUST be re-anchored here (digits and sha256 only) in the same commit, and
 * the movement recorded in this comment — a silently moving revision is what the t7 round
 * turned into two discarded runs.
 */
const REVISION_ANCHORS = {
  'lib/client.js': { sha256: '6a7905cddf909faabaf93c993c66a8d20007e5437e3285dadaeb5ad26ce3cf1a', bytes: 258008, note: 't22 UI grouping: the notification block is its own group, last on the page' },
  'lib/native-toast.js': { sha256: '6534b167056871e0eb00e5e1a66f9eff41f3cde0ebedf1529f7b6579454821bb', bytes: 29555, note: 't14 write path: unique temp + link publish' },
  'lib/native-bridge.js': { sha256: 'b0fe419db341d2dbc16d6c4666c88c094481da3a35a1c05e974b32dabed00264', bytes: 27123, note: 't14 EEXIST -> 409' },
  'lib/index.js': { sha256: '066be96ef0e5c1e78d57e4ef55369fdb20b0550d17c0a238b413112eacf86a31', bytes: 55458, note: 't6 host half' },
  'deploy/native-toast/install.ps1': { sha256: '21e7b0ce76f961ca2bd38d4558e2f8fcc11b13299758c76e492af4faa9744912', bytes: 18500, note: 't21 H3 repair + r30 (T4-F08/F10): USERPROFILE/DSH_HOME order + Ensure-RegKey without -Force' },
  'deploy/native-toast/uninstall.ps1': { sha256: '5f674bff142b224692584100ac907dd4581fad84540931ad0c00c9266c0d5173', bytes: 6221, note: 't17 H2 audit + r30 (T4-F09): fails loudly when neither env var is usable' },
  'deploy/native-toast/selftest.ps1': { sha256: 'f681293c30ffe830a1f9247fc8ec3d6a7de185936648ddf8e7b6cd3860152d29', bytes: 12470, note: 't21 six-check self-test + r30: IsNullOrWhiteSpace instead of a null test' },
  'deploy/native-toast/raise.ps1': { sha256: '90ee71c794ab98191269ec8a7bb8b96fc957adc4261bfa097474daf46baecc68', bytes: 2808, note: 't6 deploy' },
  'deploy/native-toast/answer.ps1': { sha256: '07487cd36ea419cefb8d36b9c05f8732dcfb2390ffa1603ac449f320bd9c7006', bytes: 2990, note: 't6 deploy' },
  'deploy/native-toast/activate.vbs': { sha256: '474da9653fd3dd7984cc2572e2de113b29ee73d63b854faf4c32e54e044d2679', bytes: 2639, note: 't9 F5 whitelist + r30 (T4-F11): the interpreter comes from %SystemRoot% (the hidden-window flag is unchanged)' },
  'docs/native-toast-接口冻结.md': { sha256: '7c50d945f717e76b7a37af3f46e831f29e902bda5f7f4ccc1b2d34d6997b4e8e', bytes: 64450, note: 't14 contract revisions + t4 §16 append (200-char cap, A9 pointer, H1 ruling) + r30: the §3.1 example stops hard-coding the interpreter path' },
};
const hashesAtStart = Object.fromEntries(WATCHED_FILES.map((relative) => [relative, hashFile(relative)]));

/* ------------------------------------------------------------------ instruments */

const newToken = () => randomBytes(16).toString('hex');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const stripBom = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
const utf8NoBom = new TextEncoder();
const sleep = (ms) => new Promise((resolveTick) => setTimeout(resolveTick, ms));

/** Run a child and capture its stdout+stderr through a FILE (a confined Windows sandbox refuses pipes). */
function runToFile(command, args, logPath, options = {}) {
  const fd = openSync(logPath, 'w');
  const result = spawnSync(command, args, { cwd: options.cwd, stdio: ['ignore', fd, fd], timeout: options.timeoutMs ?? 120000, windowsHide: true });
  closeSync(fd);
  return { status: typeof result.status === 'number' ? result.status : null, error: result.error === undefined ? null : String(result.error), text: readOrNull(logPath) ?? '' };
}

/** Same, but the file stays open only for the exit code (no output wanted). */
function runQuiet(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd, stdio: 'ignore', timeout: options.timeoutMs ?? 120000, windowsHide: true });
  return { status: typeof result.status === 'number' ? result.status : null, error: result.error === undefined ? null : String(result.error) };
}

/** Run a PowerShell command string whose OUTPUT is written by PowerShell itself, as UTF-8 without BOM. */
function runPowerShellToUtf8(commandText, outPath, timeoutMs = 120000) {
  const text = `${commandText}; exit 0`.replace(/\r?\n/g, ' ');
  const result = runQuiet(PS, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', text], { timeoutMs });
  return { ...result, text: existsSync(outPath) ? stripBom(readOrNull(outPath) ?? '') : null };
}

/** The `History.GetHistory` / registry helper this probe writes for itself (ASCII only, on purpose). */
const HISTORY_HELPER_LINES = [
  'param([string]$Aumid, [string]$OutPath, [string]$Mode = "list", [string]$Tag = "", [string]$Group = "dsh-approval-chime")',
  "$ErrorActionPreference = 'Continue'",
  '$result = [ordered]@{ ok = $false; error = ""; mode = $Mode; cleared = $false; count = 0; items = @(); schemePresent = $false; aumidPresent = $false; command = $null; displayName = $null; schemeDefault = $null; urlProtocol = $null }',
  'try {',
  '    if ($Mode -eq "registry") {',
  "        $schemeKey = 'HKCU:\\Software\\Classes\\dsh-approval-chime'",
  "        $aumidKey = 'HKCU:\\Software\\Classes\\AppUserModelId\\Dsh.ApprovalChime.NativeToast'",
  '        try {',
  '            $scheme = Get-Item -LiteralPath $schemeKey -ErrorAction Stop',
  '            $result.schemePresent = $true',
  "            $result.schemeDefault = [string]$scheme.GetValue('')",
  "            $result.urlProtocol = [string]$scheme.GetValue('URL Protocol')",
  '            $command = Get-Item -LiteralPath ($schemeKey + "\\shell\\open\\command") -ErrorAction Stop',
  "            $result.command = [string]$command.GetValue('')",
  '        } catch { $result.error = $_.Exception.Message }',
  '        try {',
  '            $aumidItem = Get-Item -LiteralPath $aumidKey -ErrorAction Stop',
  '            $result.aumidPresent = $true',
  "            $result.displayName = [string]$aumidItem.GetValue('DisplayName')",
  '        } catch { }',
  '        $result.ok = $true',
  '    } else {',
  '        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
  '        if ($Mode -eq "clear") { [Windows.UI.Notifications.ToastNotificationManager]::History.Clear($Aumid); $result.cleared = $true }',
  '        if ($Mode -eq "remove") { [Windows.UI.Notifications.ToastNotificationManager]::History.Remove($Tag, $Group, $Aumid) }',
  '        $history = [Windows.UI.Notifications.ToastNotificationManager]::History.GetHistory($Aumid)',
  '        $result.count = @($history).Count',
  '        $items = @()',
  '        for ($i = 0; $i -lt @($history).Count; $i++) {',
  '            $item = $history[$i]',
  '            $items += [ordered]@{ tag = [string]$item.Tag; group = [string]$item.Group; xml = [string]$item.Content.GetXml() }',
  '        }',
  '        $result.items = $items',
  '        $result.ok = $true',
  '    }',
  '} catch { $result.error = $_.Exception.Message }',
  '$json = $result | ConvertTo-Json -Depth 6 -Compress',
  '$json = $json.Replace("\\u0026", "&")',
  '[System.IO.File]::WriteAllText($OutPath, $json, (New-Object System.Text.UTF8Encoding($false)))',
  '',
];
writeFileSync(HISTORY_PS1, HISTORY_HELPER_LINES.join('\r\n'), 'ascii');

const historyCall = (mode, aumid = AUMID, extra = []) => {
  const outPath = join(EVIDENCE_DIR, `probe21-history-${mode}-${Date.now()}.json`);
  const result = runQuiet(PS, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', HISTORY_PS1, '-Aumid', aumid, '-OutPath', outPath, '-Mode', mode, ...extra]);
  if (!existsSync(outPath)) return { exit: result.status, json: null };
  let json = null;
  try {
    json = JSON.parse(readOrNull(outPath));
  } catch (error) {
    json = { ok: false, error: `unreadable helper answer: ${String(error)}` };
  }
  rmSync(outPath, { force: true });
  return { exit: result.status, json };
};

/**
 * Read one AUMID's history until the given tag appears, or give up.
 *
 * `raise.ps1` returning 0 means `Show()` was accepted; the platform indexes the item
 * asynchronously, so a single immediate read can legitimately come back before it is
 * there (measured once in the r5 round: the read saw 2 unrelated items and missed the
 * tag we had just raised). The attempt count is returned so the report can say whether
 * the read was immediate or had to wait — and a tag that never shows up is still a
 * failure.
 */
const historyWaitForTag = async (aumid, tag, attempts = 8, delayMs = 400) => {
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const read = historyCall('list', aumid);
    last = read;
    const item = (read.json?.items ?? []).find((entry) => entry.tag === tag) ?? null;
    if (item !== null) return { read, item, attempts: attempt };
    if (attempt < attempts) await sleep(delayMs);
  }
  return { read: last, item: null, attempts };
};

/** Raise one REAL toast through the product's own raise.ps1 (never through a rewrite of it). */
function raiseRealToast({ aumid, token, xml, tag = `appr-${token.slice(0, 11)}`, group = GROUP }) {
  const xmlPath = join(EVIDENCE_DIR, `probe21-${token}.xml`);
  writeFileSync(xmlPath, xml, 'utf8');
  const result = runQuiet(PS, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', RAISE_PS1, '-Aumid', aumid, '-XmlPath', xmlPath, '-Tag', tag, '-Group', group]);
  rmSync(xmlPath, { force: true });
  return { exit: result.status, error: result.error, tag };
}

/**
 * Normalise one toast XML to the facts the contract freezes: the `<toast>`
 * attributes, the two `<text>` nodes, and every `<action>`'s attributes. Written
 * here so the contract's own ```xml block and the implementation's output go
 * through EXACTLY the same reader.
 */
function normaliseToast(xml) {
  const toastTag = /<toast([^>]*)>/.exec(xml);
  const attribute = (text, name) => {
    const found = new RegExp(`${name}="([^"]*)"`).exec(text ?? '');
    return found === null ? null : found[1];
  };
  const texts = [...xml.matchAll(/<text>([^<]*)<\/text>/g)].map((match) => match[1]);
  const actions = [...xml.matchAll(/<action\b([^>]*)\/>/g)].map((match) => ({
    content: attribute(match[1], 'content'),
    arguments: attribute(match[1], 'arguments'),
    activationType: attribute(match[1], 'activationType'),
    buttonStyle: attribute(match[1], 'hint-buttonStyle'),
  }));
  return {
    useButtonStyle: attribute(toastTag === null ? '' : toastTag[1], 'useButtonStyle'),
    hasToastActivationType: /<toast[^>]*\bactivationType=/.test(xml),
    hasScenario: /<toast[^>]*\bscenario=/.test(xml),
    hasLaunch: /<toast[^>]*\blaunch=/.test(xml),
    bindingTemplate: (/<binding template="([^"]*)"/.exec(xml) ?? [])[1] ?? null,
    texts,
    actions,
  };
}

/** The contract's own §10 ```xml block, with the placeholders replaced. */
function frozenToastXmlFromContract({ token, port, second }) {
  const source = readOrNull(FREEZE_DOC);
  if (source === null) return null;
  const fence = source.split('```xml')[1];
  if (fence === undefined) return null;
  const block = fence.split('```')[0];
  if (!block.includes('<toast useButtonStyle="true">')) return null;
  return (
    block
      .replace(/工具 bash 请求越权执行/g, second)
      .replace(/TOKEN/g, token)
      .replace(/PORT/g, String(port))
      .trim()
  );
}

/** Read the two-byte PE subsystem field: 2 = GUI, 3 = CONSOLE. */
function peSubsystem(path) {
  const bytes = readFileSync(path);
  if (bytes.length < 0x40) return null;
  const peOffset = bytes.readUInt32LE(0x3c);
  if (bytes.readUInt32LE(peOffset) !== 0x00004550) return null;
  return bytes.readUInt16LE(peOffset + 0x18 + 0x44);
}

/** A spawn recorder that looks enough like a ChildProcess and answers with a scripted exit code. */
function makeSpawnRecorder(scriptedCode = () => 0) {
  const calls = [];
  const record = {
    calls,
    kills: 0,
    spawnLog: null,
    spawn(command, args, options) {
      const call = { command, args: [...args], options, code: scriptedCode(command, args, calls.length) };
      calls.push(call);
      if (typeof record.onSpawn === 'function') record.onSpawn(call);
      const handlers = new Map();
      const child = {
        once(type, handler) {
          if (!handlers.has(type)) handlers.set(type, []);
          handlers.get(type).push(handler);
          return child;
        },
        kill() {
          record.kills += 1;
        },
      };
      setImmediate(() => {
        for (const handler of handlers.get('exit') ?? []) handler(call.code);
      });
      return child;
    },
  };
  return record;
}

/** One HTTP exchange against the real bridge handler, with this probe's own request/response doubles. */
async function callRoute(bridge, { method, url, body, headers = {} }) {
  const payload = body === undefined || body === null ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8')];
  const req = Readable.from(payload);
  req.method = method;
  req.url = url;
  req.headers = headers;
  const state = { status: null, headers: null, body: null };
  let finish = () => {};
  const done = new Promise((resolveDone) => {
    finish = resolveDone;
  });
  const res = {
    writeHead(status, responseHeaders) {
      state.status = status;
      state.headers = responseHeaders;
    },
    end(chunk) {
      if (chunk !== undefined && chunk !== null) state.body = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      finish();
    },
  };
  await bridge.handler(req, res);
  await done;
  let json = null;
  if (state.body !== null) {
    try {
      json = JSON.parse(state.body.toString('utf8'));
    } catch (error) {
      json = { __unparsable: String(error) };
    }
  }
  return { status: state.status, headers: state.headers, json };
}

/**
 * The concurrency instrument (r3 / G1): dispatch one request and hand back its
 * still-open response state BEFORE anything is awaited, so two of these can be
 * started in one synchronous block and are therefore genuinely in flight at the
 * same time.
 *
 * Why this is real concurrency and not two sequential calls: `bridge.handler()`
 * is invoked synchronously and returns at its first internal `await` (reading the
 * request body). The caller starts request two before awaiting request one, and
 * the probe records `first.settled === false && second.settled === false` plus
 * `status === null` for both at that instant — neither request can have been
 * answered yet, and each body is still being streamed into the handler. The two
 * promise chains then interleave in the event loop exactly as two sockets would.
 */
function dispatchRoute(bridge, { method, url, body, headers = {} }) {
  const payload = body === undefined || body === null ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8')];
  const req = Readable.from(payload);
  req.method = method;
  req.url = url;
  req.headers = headers;
  const state = { status: null, headers: null, body: null, settled: false };
  let finish = () => {};
  const done = new Promise((resolveDone) => {
    finish = resolveDone;
  });
  const res = {
    writeHead(status, responseHeaders) {
      state.status = status;
      state.headers = responseHeaders;
    },
    end(chunk) {
      if (chunk !== undefined && chunk !== null) state.body = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      state.settled = true;
      finish();
    },
  };
  const settled = (async () => {
    await bridge.handler(req, res);
    await done;
    let json = null;
    if (state.body !== null) {
      try {
        json = JSON.parse(state.body.toString('utf8'));
      } catch (error) {
        json = { __unparsable: String(error) };
      }
    }
    return { status: state.status, json };
  })();
  return { state, settled };
}

/** One complete answer file, or a parse verdict — `{ ok, value, text }`. */
function readAnswerFile(path) {
  const text = readOrNull(path);
  if (text === null) return { ok: false, value: null, text: null, missing: true };
  try {
    return { ok: true, value: JSON.parse(text), text, missing: false };
  } catch (error) {
    return { ok: false, value: null, text, missing: false, error: String(error) };
  }
}

/** Leftovers the write path must never leave behind (`.tmp` from the temp name, `.claim` from the reader). */
const leftoversIn = (directory) => {
  try {
    return readdirSync(directory).filter((name) => name.endsWith('.tmp') || name.endsWith('.claim') || name.endsWith('.partial'));
  } catch {
    return [];
  }
};

/** A manual timer rig: the client's poll interval is fired by THIS probe, never by the clock. */
function installTimerRig(bundle) {
  const intervals = new Map();
  let sequence = 0;
  bundle.sandbox.setInterval = (callback, ms) => {
    sequence += 1;
    intervals.set(sequence, { callback, ms });
    return sequence;
  };
  bundle.sandbox.clearInterval = (identifier) => {
    intervals.delete(identifier);
  };
  return {
    intervals,
    clearAll() {
      intervals.clear();
    },
    fireAll() {
      for (const timer of [...intervals.values()]) timer.callback();
    },
  };
}

/** A `window` event target for the sandbox: without it the bundle cannot bind focus/blur at all. */
function installWindowEvents(bundle) {
  const listeners = new Map();
  bundle.sandbox.addEventListener = (type, handler) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(handler);
  };
  bundle.sandbox.removeEventListener = (type, handler) => {
    const set = listeners.get(type);
    if (set) set.delete(handler);
  };
  return {
    listeners,
    count: () => [...listeners.values()].reduce((total, set) => total + set.size, 0),
    fire(type) {
      for (const handler of [...(listeners.get(type) ?? [])]) handler({ type });
    },
  };
}

/** A fetch recorder that answers from a script written by the caller. */
function makeFetchRecorder(responder) {
  const calls = [];
  const fetch = (url, init) => {
    const call = {
      url: String(url),
      method: typeof init?.method === 'string' ? init.method : 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    };
    calls.push(call);
    const scripted = responder(call, calls.length - 1) ?? {};
    if (scripted.throws === true) return Promise.reject(new Error('probe: this request fails transiently'));
    const status = typeof scripted.status === 'number' ? scripted.status : 200;
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(scripted.body === undefined ? {} : scripted.body),
    });
  };
  return {
    fetch,
    calls,
    nativeCalls: () => calls.filter((call) => call.url.startsWith(ROUTE)),
    countNative: (method) => calls.filter((call) => call.url === ROUTE && call.method === method).length,
  };
}

/** A pending approval the probe owns, with its public `answer()` instrumented. */
function makeInteraction(key) {
  const answers = [];
  const interaction = approval(key);
  interaction.answer = (decision) => {
    answers.push(decision);
    return Promise.resolve();
  };
  return { interaction, answers };
}

const bundleFor = ({ hidden, hasFocus, nativeToast = true, scopeValue = null }) => {  const bundle = loadBundle({});
  const timers = installTimerRig(bundle);
  const windowEvents = installWindowEvents(bundle);
  const fetchRecorder = makeFetchRecorder((call) => {
    if (call.url === ROUTE && call.method === 'POST') {
      return { status: 200, body: { ok: true, state: 'raised', tag: `appr-${String(call.body?.token ?? '').slice(0, 11)}` } };
    }
    if (call.url.startsWith(`${ROUTE}/answer`)) return { status: 200, body: { ok: true, state: 'pending' } };
    if (call.url === `${ROUTE}/revoke`) {
      return { status: 200, body: { ok: true, results: call.body.tokens.map((token) => ({ token, state: 'pending' })) } };
    }
    if (call.url === ROUTE && call.method === 'GET') return { status: 200, body: { ok: true, state: 'ready' } };
    return { status: 404, body: { ok: false, error: 'unknown path' } };
  });
  bundle.sandbox.fetch = fetchRecorder.fetch;
  bundle.sandbox.crypto = {
    getRandomValues(array) {
      const bytes = randomBytes(array.length);
      for (let index = 0; index < array.length; index += 1) array[index] = bytes[index];
      return array;
    },
  };
  bundle.document.hidden = hidden;
  bundle.document.hasFocus = () => hasFocus;
  const host = makeCtx({ scopeValue: scopeValue ?? { enabled: true, volume: 70, tone: 'chime', nativeToast } });
  const applied = bundle.contract !== null && bundle.contract !== undefined;
  if (applied) bundle.contract.apply(host.ctx);
  return { bundle, timers, windowEvents, fetchRecorder, host };
};

const closeBundle = (rig) => {
  rig.timers.clearAll();
  for (const entry of rig.host.api.effectDisposers) {
    try {
      entry.dispose();
    } catch {
      /* a disposer that throws is not this probe's verdict */
    }
  }
};

/* ==================================== 0 · where every expected value comes from */

report.group('0. expected-value provenance: the contract page at read time');

const contractSource = readOrNull(FREEZE_DOC) ?? '';
const contractLineList = contractSource.split(/\r?\n/);
const contractCite = (needle) => {
  const index = contractLineList.findIndex((line) => line.includes(needle));
  return index < 0 ? null : index + 1;
};
const CONTRACT_SHA = sha(contractSource);
const provenance = [
  ['product AUMID', AUMID, contractCite(AUMID)],
  ['display name', APP_NAME, contractCite(APP_NAME)],
  ['scheme', SCHEME, contractCite(`\`${SCHEME}\``)],
  ['HTTP route', ROUTE, contractCite(ROUTE)],
  ['toast group', GROUP, contractCite('toast `group`')],
  ['toast tag prefix', 'appr-', contractCite('`appr-`')],
  ['TTL', String(TTL_MS), contractCite(String(TTL_MS))],
  ['client poll', String(POLL_MS), contractCite('客户端轮询间隔')],
  ['title line 1', TITLE, contractCite(TITLE)],
  ['button captions', BUTTON_ALLOW, contractCite(BUTTON_ALLOW)],
];
readings.contract = {
  path: 'docs/native-toast-接口冻结.md',
  sha256: CONTRACT_SHA,
  lines: contractLineList.length,
  provenance: provenance.map(([name, value, line]) => ({ name, value, contractLine: line })),
};
report.note('docs/native-toast-接口冻结.md sha256 at read time', CONTRACT_SHA);
report.note('docs/native-toast-接口冻结.md lines', contractLineList.length);
for (const [name, value, line] of provenance) report.note(`${name} = ${value}`, `contract line ${line === null ? 'NOT CITED' : String(line)}`);
report.check(
  'every frozen string this probe asserts is citable in the contract page at read time',
  provenance.every(([, , line]) => line !== null),
  JSON.stringify(provenance.filter(([, , line]) => line === null)),
);
report.note('the 200-character text limit', 'NOT in the contract page at read time — recorded as a contract gap (reviewer/§16 work), so this probe asserts it from the implementation side only');
report.note('watched-file hashes at start', JSON.stringify(hashesAtStart));

const anchorRows = Object.entries(REVISION_ANCHORS).map(([relative, anchor]) => {
  const bytes = readFileSync(join(PLUGIN_DIR, relative));
  return {
    relative,
    note: anchor.note,
    expected: anchor.sha256,
    actual: createHash('sha256').update(bytes).digest('hex'),
    expectedBytes: anchor.bytes,
    actualBytes: bytes.length,
  };
});
const anchorMismatch = anchorRows.filter((row) => row.expected !== row.actual || row.expectedBytes !== row.actualBytes);
readings.anchors = { rows: anchorRows, mismatch: anchorMismatch };
for (const row of anchorRows) {
  report.note(`anchor ${row.relative}`, `${row.actual} / ${String(row.actualBytes)} B  (${row.note})${row.expected === row.actual && row.expectedBytes === row.actualBytes ? '' : `  EXPECTED ${row.expected} / ${String(row.expectedBytes)} B`}`);
}
report.check(
  'the probe is reading the anchored revision (rev-25 r4: t14 host bytes + the t4-released client bytes)',
  anchorMismatch.length === 0,
  JSON.stringify(anchorMismatch),
);
const clientAnchor = anchorRows.find((row) => row.relative === 'lib/client.js');
report.check(
  'lib/client.js is the rev-29 byte image of this round (the trigger source), not an older one',
  clientAnchor?.actual === '6a7905cddf909faabaf93c993c66a8d20007e5437e3285dadaeb5ad26ce3cf1a' && clientAnchor?.actualBytes === 258008,
  `${clientAnchor?.actual} / ${String(clientAnchor?.actualBytes)} B`,
);

/* ==================================================================== 1 · source level */

report.group('1. source-level contract: one trigger source, no HTML5 path, defaults');

const plugin = await import(pathToFileURL(HOST_PATH).href);
const bridgeModule = await import(pathToFileURL(join(PLUGIN_DIR, 'lib', 'native-bridge.js')).href);
const platformModule = await import(pathToFileURL(join(PLUGIN_DIR, 'lib', 'native-toast.js')).href);
const HOST_SOURCE = readOrNull(HOST_PATH) ?? '';
const BRIDGE_SOURCE = readOrNull(join(PLUGIN_DIR, 'lib', 'native-bridge.js')) ?? '';
const PLATFORM_SOURCE = readOrNull(join(PLUGIN_DIR, 'lib', 'native-toast.js')) ?? '';
const CLIENT_SOURCE = readOrNull(CLIENT_PATH) ?? '';

const topLevelImports = [...HOST_SOURCE.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm)].map((match) => match[1]);
readings.hostTopLevelImports = topLevelImports;
// rev-26 — THIS INVARIANT IS DELIBERATELY INVERTED, NOT DELETED.
//
// It used to require that EVERY top-level import of the host half be a `node:`
// builtin. That held because the schema package was resolved LAZILY at runtime from
// a candidate list, so a dangling link could only degrade the plugin, never break
// the profile's boot.
//
// DSH 0.1.7 removed `settings.register`, which makes a plugin's settings its own
// `Config` — and the loader reads `Config` at IMPORT time, so the schema import has
// to be static. A dangling junction now FAILS this entry instead of degrading it.
// That is a real regression in robustness against a broken install, and it is the
// price of the new model; `lib/index.js`'s header records the trade-off in full.
//
// The invariant therefore becomes: the static schema import IS present, and it is
// the ONLY non-builtin top-level import — the smallest foreign set the new model
// allows, and the tightest claim that is still true.
const foreignImports = topLevelImports.filter((specifier) => !specifier.startsWith('node:'));
report.check(
  'the Host half is importable standalone: exactly ONE non-builtin top-level import, and it is the schema package the new settings model forces',
  topLevelImports.length > 0 && foreignImports.length === 1 && foreignImports[0] === '@deepseek-ai/schemastery',
  JSON.stringify(topLevelImports),
);
report.deep('the Host half still injects only the settings service', [...plugin.inject], ['settings']);
report.same('the documented switch field is the frozen one', plugin.NATIVE_TOAST_FIELD, 'nativeToast');
report.same('the exported DEFAULTS switch value is false', plugin.DEFAULTS.nativeToast, false);

// rev-26: the host half no longer RESOLVES the schema package at runtime. DSH 0.1.7
// needs `Config` at IMPORT time, so `import z from '@deepseek-ai/schemastery'` is
// static and `loadSchemastery()` / `buildSchema(z)` were deleted with the old
// settings model. The schema is the module-level `Config`, and every field is
// VOLATILE — so a parsed value must be read through `.get()`.
const builtSchema = plugin.Config;
readings.schemaDefaults = builtSchema({});
report.same('the schema resolves the switch to false with no user layer', builtSchema({}).nativeToast.get(), false);
report.same('the schema resolves the switch to false for a partial user section', builtSchema({ volume: 33 }).nativeToast.get(), false);
report.same('the schema REFUSES a non-boolean switch value', (() => {
  try {
    builtSchema({ nativeToast: 'yes' });
    return 'accepted';
  } catch (error) {
    return 'rejected';
  }
})(), 'rejected');

report.check('the Host half never names the registry', !/HKCU|HKLM|reg\.exe/i.test(HOST_SOURCE), 'lib/index.js');
report.check('the Host half never starts a process of its own', !/child_process|\bspawn\(/.test(HOST_SOURCE), 'lib/index.js');
report.check('the bridge never names the registry', !/reg\.exe|HKCU|HKLM/i.test(BRIDGE_SOURCE), 'lib/native-bridge.js');
report.check('the bridge has no timer of its own (no second trigger clock)', !/setInterval|setTimeout/.test(BRIDGE_SOURCE), 'lib/native-bridge.js');
report.check('the bridge never observes the approval chain', !/approval\/request|pendingInteractions|waterfall/.test(BRIDGE_SOURCE), 'lib/native-bridge.js');
report.same('the bridge raises a toast from exactly one place', [...BRIDGE_SOURCE.matchAll(/platform\.raise\(/g)].length, 1);
report.check(
  'no lib module uses the HTML5 Notification constructor',
  !/\bnew\s+Notification\b/.test(CLIENT_SOURCE + HOST_SOURCE + BRIDGE_SOURCE + PLATFORM_SOURCE),
  'grep new Notification( over lib/**',
);
/* ------------------------------------------------- the native-notification block's UI rule
 * r30 tail · the user's ruling (option 1: the criterion is redrawn, the product is untouched).
 *
 * WHAT THE OLD RULE SAID: "no createElement / no Notification / no MessageBox anywhere between the
 * `windows notifications` banner and the `approval watch` banner". It held until `8530452` — the
 * fix for the blank "settings cannot be read here" page — hoisted the SHARED page head into that
 * region so both pages render the same title + revision line. Measured (node, blobs):
 *   f1fe6cf 1648-2385 → 0 createElement | 887a356 1665-2402 → 0 | 8530452 1665-2431 → 3 | HEAD 1673-2444 → 3
 *
 * WHAT THE RULE WAS ALWAYS ABOUT: nothing in this region may raise a notification or build UI of
 * its own. So the criterion now NAMES the one construction it may contain and PINS ITS SIZE: every
 * DOM site in the region must sit inside the single shared `sectionHead()` helper, and that helper's
 * body must be exactly the three elements it is today (wrapper div + h2 title + revision span).
 * A second DOM site anywhere in the region, or a fourth element inside the helper, still fails —
 * the blanket ban is not weakened, it is narrowed to the one exception the user approved.
 *
 * CORRECTED AFTER THE verify6 ROUND (it found that the first redraw had silently NARROWED a ban):
 *   - the region ban is the OLD whole-word `Notification`, not `new Notification`: the narrower
 *     regex let `Notification.requestPermission()`, `new window.Notification(…)` and
 *     `const N = window.Notification` pass, while the old rule caught all three (measured);
 *   - "exactly ONE definition of the helper" is its own assertion below, because the region
 *     predicate returns early when the region is DOM-free and would have accepted a second
 *     definition unseen;
 *   - the pinned number is a count of createElement CALLS, not of elements, which left one route open:
 *     `innerHTML` / `insertAdjacentHTML` inside the helper could add a fourth element and stay green.
 *     The user approved the follow-up ban, so BOTH are now forbidden in the region as well (each was
 *     0 there, so the shipped tree is unaffected) — that route is closed. What stays open is the
 *     limit of text matching itself: computed access such as `React['create'+'Element']` is invisible
 *     to this check, exactly as it was to the old rule; the user chose not to pay for structural
 *     parsing, and the ledger records that as a known, decided hole.
 */
const NATIVE_BLOCK_HELPER_NAME = 'sectionHead';
const NATIVE_BLOCK_HELPER = `function ${NATIVE_BLOCK_HELPER_NAME}(`;

/**
 * The index just past the `}` that closes the function starting at `from` — found by MATCHING
 * BRACES, not by looking for a text pattern. The first version of this check searched for
 * `'\n      }'`, which made the helper's extent a function of its INDENTATION: reduce the helper to
 * two createElement calls, re-indent its closing brace by two spaces and drop a rogue createElement
 * after it, and the old slice swallowed the rogue call — total 3 / inside 3, judged green. Measured
 * by the verify7 round (each deviation ALONE reddened; only the trio did not). String literals and
 * comments are skipped so a brace inside them cannot close the function early.
 *
 * KNOWN FALSE-RED DIRECTION (verify8, safe side): a REGEX LITERAL that contains a brace — e.g.
 * `const re = /\}/;` — is NOT skipped, so the counter can end the body early and the check then
 * reports RED on code that is fine. The direction is safe (nothing can hide behind it), the region
 * contains no regex literal today (measured), and telling a regex apart from a division needs real
 * parsing; the ledger records it as known and unfixed.
 */
function endOfFunction(text, from) {
  const open = text.indexOf('{', from);
  if (open < 0) return -1;
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    const ch = text[index];
    const next = text[index + 1];
    if (ch === "'" || ch === '"' || ch === '`') {
      let cursor = index + 1;
      while (cursor < text.length) {
        if (text[cursor] === '\\') { cursor += 2; continue; }
        if (text[cursor] === ch) break;
        cursor += 1;
      }
      if (cursor >= text.length) return -1;
      index = cursor;
      continue;
    }
    if (ch === '/' && next === '/') {
      const eol = text.indexOf('\n', index);
      if (eol < 0) return -1;
      index = eol;
      continue;
    }
    if (ch === '/' && next === '*') {
      const close = text.indexOf('*/', index + 2);
      if (close < 0) return -1;
      index = close + 1;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}
report.check(
  `the native-notification block builds no UI of its own (no Notification, no MessageBox, no innerHTML/insertAdjacentHTML, no DOM outside the shared ${NATIVE_BLOCK_HELPER_NAME}() head)`,
  (() => {
    const start = CLIENT_SOURCE.indexOf('windows notifications');
    const end = CLIENT_SOURCE.indexOf('approval watch', start);
    if (start < 0 || end < 0) return false;
    const block = CLIENT_SOURCE.slice(start, end);
    readings.nativeBlockBytes = block.length;
    if (/\bNotification\b/.test(block) || block.includes('MessageBox')
      || block.includes('innerHTML') || block.includes('insertAdjacentHTML')) return false; // whole-word Notification = the OLD ban restored; the two HTML sinks = the user's follow-up ban
    const countIn = (text) => (text.match(/createElement/g) ?? []).length;
    const total = countIn(block);
    const helperSites = CLIENT_SOURCE.split(NATIVE_BLOCK_HELPER).length - 1;
    const helperAt = block.indexOf(NATIVE_BLOCK_HELPER);
    readings.nativeBlockDom = { total, helperSites, helperAt };
    if (total === 0) return true; // the region is DOM-free: the original shape, still allowed
    if (helperAt < 0 || helperSites !== 1) return false; // DOM outside the approved exception
    const helperEnd = endOfFunction(block, helperAt);
    if (helperEnd < 0) return false;
    const inside = countIn(block.slice(helperAt, helperEnd));
    readings.nativeBlockDom.inside = inside;
    return inside === total && inside === 3; // all of it in the helper, and the helper body is exactly three CALLS
  })(),
  `the region may contain exactly one DOM construction, the shared ${NATIVE_BLOCK_HELPER_NAME}() head (pinned at three createElement calls)`,
);
report.same(
  `the shared ${NATIVE_BLOCK_HELPER_NAME}() head has exactly ONE definition in the client bundle`,
  // Own check, NOT folded into the region predicate: that one returns early when the region is
  // DOM-free, which would let a SECOND definition through unnoticed (found by the verify6 round).
  CLIENT_SOURCE.split(NATIVE_BLOCK_HELPER).length - 1,
  1,
);
report.check('the frozen route string is the only native endpoint the client knows', CLIENT_SOURCE.includes(`'${ROUTE}'`), ROUTE);
report.check(
  'the contract page itself is present and still frozen at 619 lines',
  (readOrNull(FREEZE_DOC) ?? '').split(/\r?\n/).length >= 619,
  `lines=${(readOrNull(FREEZE_DOC) ?? '').split(/\r?\n/).length}`,
);

/* ================================================================== 2 · frozen XML */

report.group('2. the toast XML against the contract page (not against the tests)');

const sampleToken = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const samplePort = 41234;
const implementationXml = platformModule.buildNativeToastXml({ token: sampleToken, port: samplePort, toolName: 'bash' });
const contractXml = frozenToastXmlFromContract({ token: sampleToken, port: samplePort, second: ETHALON });
readings.implementationXml = implementationXml;
report.check('the contract page still carries the §10 xml block this probe reads', contractXml !== null, FREEZE_DOC);
report.deep('the implementation XML normalises to the contract XML', normaliseToast(implementationXml), normaliseToast(contractXml ?? ''));
/* The `<audio silent="true"/>` guard is the reviewer's F3 (one approval must not
 * sound twice). The §10 block was being revised while this probe was written, so
 * the comparison is done modulo that element and the element itself is asserted
 * separately — the raw strings are printed either way. */
const contractHasAudio = /<audio\b[^>]*\/>/.test(contractXml ?? '');
const implementationAudio = implementationXml.match(/<audio\b[^>]*\/>/g) ?? [];
readings.audioGuard = { contractHasAudio, implementationAudio };
report.note('does the contract §10 block carry an <audio> element at read time?', String(contractHasAudio));
report.note('the implementation emits', JSON.stringify(implementationAudio));
report.same('the implementation carries exactly one <audio> guard', implementationAudio.length, 1);
report.check('that guard is silent="true" (no second system sound)', implementationAudio[0] === '<audio silent="true"/>', String(implementationAudio[0]));
const stripAudio = (xml) => String(xml).replace(/<audio\b[^>]*\/>/g, '');
report.same(
  'the two differ only by whitespace between elements (modulo the <audio> guard)',
  stripAudio(implementationXml).replace(/>\s+</g, '><'),
  stripAudio(contractXml ?? '').replace(/>\s+</g, '><').trim(),
);
const normalised = normaliseToast(implementationXml);
report.same('exactly two action elements', normalised.actions.length, 2);
report.same('the first button caption', normalised.actions[0].content, BUTTON_ALLOW);
report.same('the second button caption', normalised.actions[1].content, BUTTON_DENY);
report.same('the first button URI (unescaped) is the frozen shape', normalised.actions[0].arguments.replace(/&amp;/g, '&'), `${SCHEME}://answer/?t=${sampleToken}&a=allow&p=${samplePort}`);
report.same('the second button URI (unescaped) is the frozen shape', normalised.actions[1].arguments.replace(/&amp;/g, '&'), `${SCHEME}://answer/?t=${sampleToken}&a=reject&p=${samplePort}`);
report.check('both URIs are XML-escaped in the raw text', (implementationXml.match(/&amp;a=/g) ?? []).length === 2, JSON.stringify(normalised.actions.map((action) => action.arguments)));
report.same('both actions activate through the protocol handler', JSON.stringify(normalised.actions.map((action) => action.activationType)), JSON.stringify(['protocol', 'protocol']));
report.same('the two hint styles are Success and Critical', JSON.stringify(normalised.actions.map((action) => action.buttonStyle)), JSON.stringify(['Success', 'Critical']));
report.same('the toast carries useButtonStyle', normalised.useButtonStyle, 'true');
report.same('the toast carries NO activationType of its own', normalised.hasToastActivationType, false);
report.same('the toast carries NO scenario (contract §13 option A)', normalised.hasScenario, false);
report.same('the toast carries NO launch (a body click stays inert)', normalised.hasLaunch, false);
report.same('the binding is ToastGeneric', normalised.bindingTemplate, 'ToastGeneric');
report.same('the first text line is the frozen title', normalised.texts[0], TITLE);
report.same('the second text line falls back to the escalation sentence', normalised.texts[1], ETHALON);
report.same('a reason wins over the tool name', normaliseToast(platformModule.buildNativeToastXml({ token: sampleToken, port: 1, toolName: 'bash', reason: 'a reason' })).texts[1], 'a reason');
report.same('an empty tool name still reads as a sentence', normaliseToast(platformModule.buildNativeToastXml({ token: sampleToken, port: 1, toolName: '' })).texts[1], '工具 unknown 请求越权执行');

/* --- the captain's §2 gap: the 200-character text limit must really be enforced --- */
const longName = 'x'.repeat(500);
const longReason = 'y'.repeat(500);
const longXml = platformModule.buildNativeToastXml({ token: sampleToken, port: 7, toolName: longName, reason: longReason });
const longLine = normaliseToast(longXml).texts[1];
report.same('a 500-character reason is cut to exactly 200 characters', longLine.length, TEXT_LIMIT);
report.same('the truncated line is the first 200 characters, not a re-encoding', longLine, longReason.slice(0, TEXT_LIMIT));
report.same('a 500-character tool name (no reason) is cut to 200 too', normaliseToast(platformModule.buildNativeToastXml({ token: sampleToken, port: 7, toolName: longName })).texts[1], `工具 ${'x'.repeat(TEXT_LIMIT)} 请求越权执行`);
const escapedXml = platformModule.buildNativeToastXml({ token: sampleToken, port: 9, toolName: 'a&b<c>d"e\'f' });
report.check('XML metacharacters in the tool name are escaped', escapedXml.includes('a&amp;b&lt;c&gt;d&quot;e&apos;f'), normaliseToast(escapedXml).texts[1]);
report.check('control characters in a text are replaced, never emitted raw', !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(platformModule.buildNativeToastXml({ token: sampleToken, port: 9, toolName: 'a\u0001b\nc' })), JSON.stringify(normaliseToast(platformModule.buildNativeToastXml({ token: sampleToken, port: 9, toolName: 'a\u0001b\nc' })).texts[1]));
report.same('the tag is appr- plus the first 11 characters, 16 in total', platformModule.nativeToastTagOf(sampleToken).length, 16);
report.same('the tag is exactly the frozen spelling', platformModule.nativeToastTagOf(sampleToken), `appr-${sampleToken.slice(0, 11)}`);
report.same('the TTL constant is the frozen one', platformModule.NATIVE_TOAST_TTL_MS, TTL_MS);

/* ============================================== 3 · real machine, one-off AUMID */

report.group('3. real Windows notification under a throwaway AUMID, read back and cleaned up');

const oneOffAumid = `Probe.T7.NativeToast.${randomBytes(4).toString('hex')}`;
const oneOffToken = newToken();
const oneOffXml = platformModule.buildNativeToastXml({ token: oneOffToken, port: 45123, toolName: 'bash' });
const raiseOneOff = raiseRealToast({ aumid: oneOffAumid, token: oneOffToken, xml: oneOffXml });
readings.oneOff = { aumid: oneOffAumid, token: oneOffToken, raiseExit: raiseOneOff.exit, tag: raiseOneOff.tag };
report.same('the product raise.ps1 exits 0 for a real toast', raiseOneOff.exit, 0);
const oneOffFound = await historyWaitForTag(oneOffAumid, raiseOneOff.tag);
const oneOffRead = oneOffFound.read;
readings.oneOffReadAttempts = oneOffFound.attempts;
report.same('History.GetHistory accepts the call', oneOffRead.json?.ok, true);
report.same('exactly one notification sits in the history for that AUMID', oneOffRead.json?.count, 1);
report.same('the tag round-trips through the platform', oneOffRead.json?.items?.[0]?.tag, raiseOneOff.tag);
report.same('the group round-trips through the platform', oneOffRead.json?.items?.[0]?.group, GROUP);
const oneOffBack = normaliseToast(String(oneOffRead.json?.items?.[0]?.xml ?? ''));
readings.oneOffReadBack = oneOffRead.json?.items?.[0]?.xml ?? null;
report.same('the platform hands back exactly two actions', oneOffBack.actions.length, 2);
report.deep('the captions survive the round trip', oneOffBack.actions.map((action) => action.content), [BUTTON_ALLOW, BUTTON_DENY]);
report.deep(
  'the activation arguments survive the round trip character for character',
  oneOffBack.actions.map((action) => action.arguments.replace(/&amp;/g, '&')),
  [`${SCHEME}://answer/?t=${oneOffToken}&a=allow&p=45123`, `${SCHEME}://answer/?t=${oneOffToken}&a=reject&p=45123`],
);
report.deep('the two text lines survive the round trip', oneOffBack.texts, [TITLE, ETHALON]);
report.deep('the whole read-back XML normalises to the XML that was raised', oneOffBack, normaliseToast(oneOffXml));
report.check('the <audio silent="true"/> guard survives the round trip', String(oneOffRead.json?.items?.[0]?.xml ?? '').includes('<audio silent="true"/>'), String(oneOffRead.json?.items?.[0]?.xml ?? '').slice(0, 120));
const oneOffCleared = historyCall('clear', oneOffAumid);
report.same('the probe cleared its own history for the throwaway AUMID', oneOffCleared.json?.cleared, true);
const oneOffAfter = historyCall('list', oneOffAumid);
report.same('nothing of this probe is left in the throwaway AUMID history', oneOffAfter.json?.count, 0);

/* ======================================== 4 · product AUMID + long text on real platform */

report.group('4. the product AUMID itself, and a truncated/escaped XML the platform accepts');

const productToken = newToken();
const productXml = platformModule.buildNativeToastXml({ token: productToken, port: 45124, toolName: 'bash' });
const raiseProduct = raiseRealToast({ aumid: AUMID, token: productToken, xml: productXml });
readings.product = { token: productToken, raiseExit: raiseProduct.exit, tag: raiseProduct.tag };
report.same('the product AUMID delivers a toast without any registry key being written', raiseProduct.exit, 0);
const productFound = await historyWaitForTag(AUMID, raiseProduct.tag);
const productRead = productFound.read;
readings.productReadAttempts = productFound.attempts;
report.same('History.GetHistory("' + AUMID + '") answers', productRead.json?.ok, true);
const productItem = productFound.item;
report.check('the toast the product raised is in the product AUMID history', productItem !== null, `count=${String(productRead.json?.count)} tag=${raiseProduct.tag}`);
const productBack = normaliseToast(String(productItem?.xml ?? ''));
report.same('the product history item carries exactly two actions', productBack.actions.length, 2);
report.deep('the product history item carries the frozen captions', productBack.actions.map((action) => action.content), [BUTTON_ALLOW, BUTTON_DENY]);
report.check(
  'the product history item carries the frozen argument shapes',
  productBack.actions[0]?.arguments === `${SCHEME}://answer/?t=${productToken}&amp;a=allow&amp;p=45124` && productBack.actions[1]?.arguments === `${SCHEME}://answer/?t=${productToken}&amp;a=reject&amp;p=45124`,
  JSON.stringify(productBack.actions.map((action) => action.arguments)),
);
const productRemoved = historyCall('remove', AUMID, ['-Tag', raiseProduct.tag, '-Group', GROUP]);
report.same('History.Remove took the product own toast back off the screen', productRemoved.json?.ok, true);
const productAfter = historyCall('list', AUMID);
report.same('the product AUMID history is empty again', (productAfter.json?.items ?? []).filter((item) => item.tag === raiseProduct.tag).length, 0);

/* The truncation / escaping acceptance runs use FRESH throwaway AUMIDs on purpose:
 * they test the XML the product builds, not the product's own identity. It also keeps
 * the product AUMID from being hit three times in a row — measured in the r5 round,
 * rapid successive raises under ONE AUMID can coalesce, and a toast that Show()
 * accepted may then not be indexed inside the retry window (the same XML on a fresh
 * AUMID lands on the FIRST read; isolation run in r25-t23-escaping-probe.txt). */
const longToken = newToken();
const longAumid = `Probe.T23.Long.${randomBytes(4).toString('hex')}`;
const longRaise = raiseRealToast({ aumid: longAumid, token: longToken, xml: longXml });
report.same('LoadXml accepts the 200-character truncated XML (raise exits 0)', longRaise.exit, 0);
const longFound = await historyWaitForTag(longAumid, longRaise.tag);
readings.longRead = { aumid: longAumid, attempts: longFound.attempts, count: longFound.read.json?.count ?? null };
const longItem = longFound.item;
report.check('the truncated toast is readable in the history', longItem !== null, `count=${String(longFound.read.json?.count)} attempts=${String(longFound.attempts)}`);
report.same('the platform shows the truncated 200-character line', normaliseToast(String(longItem?.xml ?? '')).texts[1]?.length, TEXT_LIMIT);
historyCall('clear', longAumid);
report.same('the truncation AUMID was cleaned up', (historyCall('list', longAumid).json?.count ?? -1), 0);

const escapedToken = newToken();
const escapedAumid = `Probe.T23.Esc.${randomBytes(4).toString('hex')}`;
const escapedRaise = raiseRealToast({ aumid: escapedAumid, token: escapedToken, xml: escapedXml });
report.same('LoadXml accepts the escaped XML (raise exits 0)', escapedRaise.exit, 0);
const escapedFound = await historyWaitForTag(escapedAumid, escapedRaise.tag);
readings.escapedRead = { aumid: escapedAumid, attempts: escapedFound.attempts, count: escapedFound.read.json?.count ?? null };
report.check('the escaped toast is readable in the history', escapedFound.item !== null, `count=${String(escapedFound.read.json?.count)} attempts=${String(escapedFound.attempts)}`);
const escapedBack = normaliseToast(String(escapedFound.item?.xml ?? ''));
/* The platform hands the text back SERIALIZED: `&`, `<` and `>` come back as entities
 * (the isolation run in r25-t23-escaping-probe.txt measured exactly that). So the
 * round trip is asserted on the DECODED text, and the raw form is printed as well. */
const decodeXmlText = (text) =>
  String(text)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
report.same('the escaped metacharacters survive as their literal characters (decoded round trip)', decodeXmlText(escapedBack.texts[1] ?? ''), '工具 a&b<c>d"e\'f 请求越权执行');
report.note('the raw serialized text the platform returned for that line', JSON.stringify(escapedBack.texts[1] ?? null));
historyCall('clear', escapedAumid);
report.same('the escaping AUMID was cleaned up', (historyCall('list', escapedAumid).json?.count ?? -1), 0);

report.note(
  'product-AUMID read attempts (rapid successive raises under one AUMID can coalesce)',
  JSON.stringify({ product: readings.productReadAttempts, oneOff: readings.oneOffReadAttempts, long: readings.longRead.attempts, escaped: readings.escapedRead.attempts }),
);
historyCall('clear', AUMID);
const finalProductHistory = historyCall('list', AUMID);
readings.productHistoryLeft = finalProductHistory.json?.items ?? [];
report.same('this probe left no notification behind under the product AUMID', (finalProductHistory.json?.items ?? []).length, 0);

/* ================================================= 5 · registry, offline tier */

report.group('5. registry, offline tier: the script bytes, their plan, and the entry binary');

const deployFiles = ['install.ps1', 'uninstall.ps1', 'selftest.ps1', 'raise.ps1', 'answer.ps1', 'activate.vbs'];
const deployBytes = {};
for (const name of deployFiles) {
  const bytes = readFileSync(join(DEPLOY_DIR, name));
  deployBytes[name] = bytes;
  const nonAscii = [...bytes].filter((byte) => byte > 0x7f).length;
  report.same(`${name} is ASCII-only (PS 5.1 reads a BOM-less UTF-8 file as ANSI)`, nonAscii, 0);
}
readings.deployHashes = Object.fromEntries(Object.entries(deployBytes).map(([name, bytes]) => [name, sha(bytes)]));

const installSource = deployBytes['install.ps1'].toString('ascii');
const uninstallSource = deployBytes['uninstall.ps1'].toString('ascii');
const vbsSource = deployBytes['activate.vbs'].toString('ascii');
const answerSource = deployBytes['answer.ps1'].toString('ascii');
const raiseSource = deployBytes['raise.ps1'].toString('ascii');
const allScripts = installSource + uninstallSource + answerSource + raiseSource + deployBytes['selftest.ps1'].toString('ascii') + vbsSource;

report.check('install.ps1 names the product AUMID', installSource.includes(`'${AUMID}'`), AUMID);
report.check('install.ps1 writes the AUMID DisplayName under the exact key', installSource.includes("HKCU:\\Software\\Classes\\AppUserModelId\\") || installSource.includes("HKCU\\Software\\Classes\\AppUserModelId\\"), 'AppUserModelId key');
report.check('install.ps1 names the scheme key through the provider path', installSource.includes("HKCU:\\Software\\Classes\\' + $scheme"), 'scheme provider path');
report.check('install.ps1 quotes %1 (the plugin directory has a space)', installSource.includes('" "%1"'), 'the literal " "%1" in the command template');
report.check(
  'install.ps1 composes the command as "wscript.exe" "shim" "%1"',
  installSource.includes('+ $wscript +') && installSource.includes('+ $shim +') && installSource.includes('" "%1"'),
  'the $command composition line',
);
report.check('the shim is activate.vbs resolved from the plugin root', installSource.includes("'deploy\\native-toast\\activate.vbs'"), 'shim path');
report.check('the AUMID name is built from the four frozen code points', installSource.includes('0x901A, 0x77E5, 0x63D0, 0x9192'), 'tong zhi ti xing');
report.check('the protocol label is built from the four frozen code points', installSource.includes('0x56DE, 0x586B, 0x534F, 0x8BAE'), 'hui tian xie yi');
report.check('the interpreter path is assembled from SystemRoot, never hard-coded as a literal', installSource.includes("Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'"), 'powershell path');
const scriptLines = allScripts.split(/\r?\n/);
const codeLines = scriptLines.filter((line) => !/^\s*(#|')/.test(line));
report.check(
  'no script WRITES or QUERIES HKLM (prose that explains the absence does not count)',
  !/reg\.exe\s+(add|delete|query)[^\r\n]*HKLM/i.test(allScripts) && !/HKEY_LOCAL_MACHINE/i.test(allScripts),
  'the reg.exe command lines only ever name HKCU',
);
report.check(
  'no executable line creates a shortcut or touches the Start Menu folder',
  codeLines.every((line) => !/\.lnk|Start Menu|CreateShortcut/i.test(line)),
  `${codeLines.length} non-comment lines checked`,
);
report.check('no script writes IconUri / DefaultIcon / IconBackgroundColor / CustomActivator', !/IconUri|DefaultIcon|IconBackgroundColor|CustomActivator/.test(allScripts), 'the four forbidden value names');
report.check('the install marker is written without a BOM', installSource.includes('New-Object System.Text.UTF8Encoding($false)'), 'UTF8Encoding($false)');
report.check('uninstall.ps1 guards every delete with a read-only query (idempotent)', (uninstallSource.match(/reg\.exe query/g) ?? []).length >= 2, 'the Remove-RegKey guard');
report.check('uninstall.ps1 removes the install marker file', uninstallSource.includes('Remove-Item -LiteralPath $markerPath'), 'marker removal');
report.check('uninstall.ps1 removes the marker directory too', uninstallSource.includes('Remove-Item -LiteralPath $markerDir -Recurse'), 'directory removal');
report.check('uninstall.ps1 clears only the product AUMID history', uninstallSource.includes('History.Clear($aumid)'), 'History.Clear');

/* --- H2 (t18): no script may hand a VALUE to reg.exe any more -------------------- */
const selftestSource = deployBytes['selftest.ps1'].toString('ascii');
readings.regInvocations = {
  install: (installSource.match(/^\s*&\s*reg\.exe[^\r\n]*/gm) ?? []).map((line) => line.trim()),
  uninstall: (uninstallSource.match(/^\s*&\s*reg\.exe[^\r\n]*/gm) ?? []).map((line) => line.trim()),
};
report.same('install.ps1 contains no reg.exe INVOCATION at all (prose and printed hints only)', readings.regInvocations.install.length, 0);
report.check(
  'no executable line of install.ps1 passes a value to reg.exe (/d, /v, /t, /ve gone)',
  !installSource.split(/\r?\n/).some((line) => !/^\s*#/.test(line) && /reg\.exe/i.test(line) && /(\/d|\/v|\/t|\/ve)\b/.test(line)),
  'the /d <value> form is what PowerShell re-quoted and mangled',
);
report.check(
  'install.ps1 writes through New-ItemProperty -Value $Value (no command line participates)',
  installSource.includes('New-ItemProperty -Path $Path -Name $Name -Value $Value -PropertyType $Type -Force'),
  'the single write statement',
);
report.check(
  'uninstall.ps1 only passes KEY PATHS to reg.exe (query/delete, never a /d or /v value)',
  readings.regInvocations.uninstall.length === 2 && !uninstallSource.split(/\r?\n/).some((line) => !/^\s*#/.test(line) && /reg\.exe/i.test(line) && /(\/d|\/v|\/t|\/ve)\b/.test(line)),
  JSON.stringify(readings.regInvocations.uninstall),
);
report.check(
  'those key paths carry no quote and no whitespace (why the two surviving calls are not the same risk)',
  ['HKCU\\Software\\Classes\\dsh-approval-chime', `HKCU\\Software\\Classes\\AppUserModelId\\${AUMID}`].every((key) => !/["\s]/.test(key)),
  'the two literals',
);

/* --- H3 (t21, r5): a write may not claim success without a read-back -------------- */
report.check(
  'install.ps1 only creates a key when Test-Path says it is absent (ensure-once, no -Force on an existing key)',
  installSource.includes('function Ensure-RegKey') && installSource.includes('if (Test-Path -LiteralPath $Path) {') && /-contains \$Path/.test(installSource),
  'Ensure-RegKey guide + memo',
);
report.check(
  'install.ps1 reads every value back with two readers (provider + raw .NET)',
  installSource.includes('function Read-RegValue') && installSource.includes('$viaProvider') && installSource.includes('$viaDotNet') && installSource.includes('[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey'),
  'Read-RegValue',
);
report.check(
  'a write is only reported [ok] after the read-back equals the value (the H3 false-[ok] gate)',
  /if \(\(Read-RegValue -Path \$Path -Name \$Name\) -ceq \$Value\)/.test(installSource) && installSource.includes("Write-Output ('       write did not land: value ['"),
  'the success test and the named failure',
);
report.check(
  'the default value is attempted through the provider setter FIRST (Set-Item -Value), then raw .NET, then New-ItemProperty',
  (() => {
    const at = (needle) => installSource.indexOf(needle);
    const provider = at("@{ Name = 'Set-Item -Value'");
    const dotnet = at("@{ Name = 'Registry::SetValue('''')'");
    const newItemProperty = at("@{ Name = 'New-ItemProperty (default)'");
    readings.regCandidateOrder = { provider, dotnet, newItemProperty };
    return provider > 0 && provider < dotnet && dotnet < newItemProperty;
  })(),
  JSON.stringify(readings.regCandidateOrder),
);
report.check(
  'install.ps1 runs a FINAL full check over all four values after every write (two readers each)',
  installSource.includes('=== final full check (two readers per value, after all writes) ===') && (installSource.match(/Label = '(scheme \(default\)|scheme URL Protocol|shell\\open\\command \(default\)|AUMID DisplayName)'/g) ?? []).length === 4,
  'the second pass that catches a wipe on the NEXT line',
);

/* --- H2/H3 (t17+t21, r5): the self-test names all SIX installation facts ---------- */
report.check('selftest.ps1 reports a missing scheme key', selftestSource.includes('the scheme key is missing'), 'check 1');
report.check(
  'selftest.ps1 checks the scheme key (default) VALUE against the frozen label (the H3 check)',
  selftestSource.includes("the scheme key''s (default) value is not the frozen label") && selftestSource.includes('-cne $expectedSchemeLabel'),
  'check 2',
);
report.check('selftest.ps1 checks the URL Protocol VALUE (not just the parent key)', selftestSource.includes('the "URL Protocol" value is missing'), 'check 3');
report.check(
  'selftest.ps1 compares shell\\open\\command byte for byte (the H2 check)',
  selftestSource.includes('shell\\open\\command is not the frozen command line') && selftestSource.includes('-cne $expectedCommand'),
  'check 4',
);
report.check('selftest.ps1 compares the DisplayName byte for byte', selftestSource.includes('-cne $appName'), 'check 5');
report.check('selftest.ps1 reports an unparsable marker', selftestSource.includes('not parseable JSON'), 'check 6');
const shadowSummaryPath = join(EVIDENCE_DIR, 'r25-t18-selftest-shadow', 'summary.json');
const shadowSummaryText = readOrNull(shadowSummaryPath);
readings.selftestShadow = shadowSummaryText === null ? null : JSON.parse(shadowSummaryText);
readings.selftestShadowCases = readings.selftestShadow === null ? null : readings.selftestShadow.cases.map((entry) => ({ id: entry.id, exit: entry.exitCode, expectedExit: entry.expectedExit, reported: entry.failuresReported, ok: entry.ok }));
const requiredShadowCases = ['complete', 'no-scheme-key', 'no-scheme-default', 'mangled-scheme-default', 'no-url-protocol', 'no-command-key', 'mangled-command', 'wrong-display-name', 'unparsable-marker'];
report.check(
  'the verifier own shadow matrix proves each of the SIX checks can go red on its own (and the complete fixture passes)',
  readings.selftestShadow !== null &&
    readings.selftestShadow.cases.every((entry) => entry.ok === true) &&
    requiredShadowCases.every((id) => readings.selftestShadow.cases.some((entry) => entry.id === id)),
  readings.selftestShadow === null
    ? 'run r25-t18-selftest-shadow.mjs first'
    : `${String(readings.selftestShadow.cases.filter((entry) => entry.ok === true).length)}/${String(readings.selftestShadow.cases.length)} cases behaved as required; sees ${String(readings.selftestShadow.cases.length)} of the ${String(requiredShadowCases.length)} required cases`,
);
report.check('activate.vbs starts PowerShell with SW_HIDE (shell.Run cmd, 0, False)', vbsSource.includes('shell.Run cmd, 0, False'), 'the hidden launch');
report.check('activate.vbs keeps the full hidden-PowerShell argument vector', vbsSource.includes('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File'), 'the argument vector');
report.check('activate.vbs resolves answer.ps1 next to itself instead of embedding a placeholder', /BuildPath\(.*GetParentFolderName\(WScript\.ScriptFullName\), "answer\.ps1"\)/.test(vbsSource), 'FileSystemObject resolution');
report.check(
  'activate.vbs whitelists the URI shape before splicing it into a command line',
  vbsSource.includes('re.Pattern = "^dsh-approval-chime://answer/\\?[A-Za-z0-9%&=.?/_-]*$"'),
  'the RegExp',
);
report.check('... and quits with code 2 when the URI is outside that shape', vbsSource.includes('If Not re.Test(uri) Then WScript.Quit 2'), 'the guard');
report.check('... and the guard sits BEFORE the Run(...) call', vbsSource.indexOf('WScript.Quit 2') < vbsSource.indexOf('.Run cmd'), 'line order');
report.check('answer.ps1 validates the token with the frozen lowercase regex', answerSource.includes("'^[0-9a-f]{32}$'"), 'token regex');
report.check('answer.ps1 accepts only allow/reject', answerSource.includes("-cne 'allow'") && answerSource.includes("-cne 'reject'"), 'action vocabulary');
report.check('answer.ps1 bounds the port to 1..65535', answerSource.includes('$port -lt 1 -or $port -gt 65535'), 'port range');
report.check('answer.ps1 posts to loopback only', answerSource.includes("'http://127.0.0.1:' + [string]$port + '/api/approval-chime/native-toast/answer'"), 'loopback URL');
report.check('answer.ps1 keeps the 3-second budget the contract measured as too small in the sandbox', answerSource.includes('$request.Timeout = 3000'), 'Timeout = 3000');
report.check('answer.ps1 writes no file and no log', !/WriteAllText|Out-File|Set-Content|Add-Content|Write-Host/.test(answerSource), 'grep writers');
report.check('answer.ps1 maps allow to allowed-once and reject to rejected', answerSource.includes("$answer = 'allowed-once'") && answerSource.includes("$answer = 'rejected'"), 'the two literals');
report.check('raise.ps1 loads the three WinRT types the contract names', raiseSource.includes('Windows.UI.Notifications.ToastNotificationManager') && raiseSource.includes('Windows.UI.Notifications.ToastNotification,') && raiseSource.includes('Windows.Data.Xml.Dom.XmlDocument,'), 'the three ContentType=WindowsRuntime loads');
report.check('raise.ps1 shows through CreateToastNotifier(AUMID)', raiseSource.includes('CreateToastNotifier($Aumid).Show($toast)'), 'Show()');
report.check('raise.ps1 sets the same 10-minute expiry the TTL freezes', raiseSource.includes('AddMinutes(10)'), 'ExpirationTime');
report.check('raise.ps1 removes with History.Remove(tag, group, aumid)', raiseSource.includes('History.Remove($Tag, $Group, $Aumid)'), 'Remove');

/* --- the plan the scripts would execute: -DryRun writes nothing, so it can run here --- */
const installPlanPath = join(EVIDENCE_DIR, 'probe21-install-dryrun.txt');
const installPlan = runPowerShellToUtf8(`$lines = @(& '${join(DEPLOY_DIR, 'install.ps1')}' -DryRun); [System.IO.File]::WriteAllLines('${installPlanPath}', $lines, (New-Object System.Text.UTF8Encoding($false)))`, installPlanPath);
readings.installPlan = installPlan.text;
const installLines = (installPlan.text ?? '').split(/\r?\n/);

/**
 * H2 (t18): the write path is no longer `reg.exe add … /d "<value>"`. The four
 * writes are compared as a (key path, value name, type, data) tuple against the
 * CONTRACT PAGE ITSELF — the §1.4 and §2 registry blocks are parsed at run time and
 * resolved (`<系统盘>` → SystemRoot, `<插件目录>` → the plugin root), so the
 * comparison cannot drift when the page is edited and the contract line numbers are
 * on the record.
 */
const defaultNameInPlan = '(default)';
const expectedRegistryWrites = (() => {
  const rows = [];
  let currentKey = null;
  for (let index = 0; index < contractLineList.length; index += 1) {
    const line = contractLineList[index];
    const keyMatch = /^(HKCU\\Software\\Classes\\[^\s]*)$/.exec(line.trim());
    if (keyMatch !== null) {
      currentKey = { key: keyMatch[1], line: index + 1 };
      continue;
    }
    const rowMatch = /^\s+(\(默认\)|URL Protocol|DisplayName)\s+REG_SZ\s+(.*)$/.exec(line);
    if (rowMatch === null || currentKey === null) continue;
    const raw = rowMatch[2].trim();
    // `""` is the page's notation for an EMPTY value; every other cell is the literal
    // data including its own quotes (the command line keeps all four of them).
    const data = raw === '""' ? '' : raw;
    rows.push({
      key: `HKCU:${currentKey.key.slice('HKCU'.length)}`,
      contractKey: currentKey.key,
      keyLine: currentKey.line,
      name: rowMatch[1] === '(默认)' ? defaultNameInPlan : rowMatch[1],
      nameCell: rowMatch[1],
      type: 'String',
      regType: 'REG_SZ',
      data,
      dataLine: index + 1,
    });
  }
  // `<系统盘>` / `<插件目录>` are the page's placeholders; resolve them the same way
  // the scripts do (SystemRoot and the plugin root).
  return rows.map((row) => ({
    ...row,
    expectedData: row.data.replace(/<系统盘>/g, process.env.SystemRoot ?? 'C:\\Windows').replace(/<插件目录>/g, PLUGIN_DIR),
  }));
})();
readings.expectedRegistryWrites = expectedRegistryWrites;
const planWrites = installLines
  .map((line, index) => {
    // t21 plan text: the four frozen facts AND the mechanism that will really run.
    const match = /Ensure-RegKey '([^']*)' \(creates it ONLY if absent; never touches an existing key\) ; write value: Name='([^']*)' Value='(.*)' Type=(\w+)$/.exec(line.trim());
    return match === null ? null : { key: match[1], name: match[2], data: match[3], type: match[4], planLine: index + 1 };
  })
  .filter((row) => row !== null);
readings.planWrites = planWrites;
report.same('the contract page yields exactly the four frozen registry writes', expectedRegistryWrites.length, 4);
report.same('the install plan is exactly four registry writes (and no reg.exe)', planWrites.length, 4);
report.same(
  'the plan writes nothing but the verified write path (no reg.exe add in the plan at all)',
  installLines.filter((line) => /reg\.exe\s+add/i.test(line)).length,
  0,
);
report.same(
  'every planned write says the key is created ONLY if absent (never touched when it exists)',
  installLines.filter((line) => /creates it ONLY if absent; never touches an existing key/.test(line)).length,
  4,
);
report.check(
  'the plan no longer prints a bare New-Item -Force on an existing key (the H3 wipe shape)',
  !installLines.some((line) => /New-Item -Path '[^']*' -Force\s*$/i.test(line.trim())),
  installLines.find((line) => /New-Item -Path/.test(line)) ?? '(none)',
);
const tuple = (row) => JSON.stringify({ key: row.key, name: row.name, type: row.type, data: row.expectedData ?? row.data });
const byKey = (rows) => [...rows].sort((left, right) => `${left.key}|${left.name}`.localeCompare(`${right.key}|${right.name}`));
report.deep(
  'key path / value name / type / data of all four writes match the contract page',
  byKey(planWrites).map(tuple),
  byKey(expectedRegistryWrites).map(tuple),
);
for (const row of expectedRegistryWrites) {
  const actual = planWrites.find((write) => write.key === row.key && write.name === row.name) ?? null;
  report.check(
    `contract §${row.name === 'DisplayName' ? '1.4' : '2'} line ${String(row.dataLine)}: ${row.key} [${row.name}] ${row.regType} = ${JSON.stringify(row.expectedData)}`,
    actual !== null && actual.data === row.expectedData && actual.type === 'String',
    actual === null ? 'no matching write in the plan' : `plan says ${JSON.stringify(actual.data)} / ${actual.type}`,
  );
}
const commandWrite = planWrites.find((write) => write.key.endsWith('\\shell\\open\\command')) ?? null;
const expectedCommand = expectedRegistryWrites.find((row) => row.key.endsWith('\\shell\\open\\command'))?.expectedData ?? '';
readings.expectedCommand = expectedCommand;
report.check('the shell\\open\\command data is exactly wscript.exe + shim + quoted %1 (byte for byte)', commandWrite?.data === expectedCommand, String(commandWrite?.data));
report.check('that value keeps the quotes in the plan text (the H2 damage was quote loss)', commandWrite?.data.includes('" "%1"') === true, String(commandWrite?.data));
report.check('the command value does not name a console subsystem program first', !/^"?[^"]*powershell\.exe/i.test(String(commandWrite?.data)), String(commandWrite?.data));
report.check('no planned write touches HKLM', !installLines.some((line) => /HKLM/i.test(line)), 'the plan lines');
const markerPlan = installLines.find((line) => line.includes('[dry-run]   {')) ?? '';
const markerJson = (() => {
  try {
    return JSON.parse(markerPlan.replace('[dry-run]   ', ''));
  } catch {
    return null;
  }
})();
readings.markerPlan = markerJson;
report.check('the marker plan carries version 1 and the frozen aumid', markerJson?.version === 1 && markerJson?.aumid === AUMID, JSON.stringify(markerJson));
report.check('the marker plan carries the frozen display name', markerJson?.displayName === APP_NAME, String(markerJson?.displayName));
report.same('the marker plan carries the frozen scheme', markerJson?.scheme, SCHEME);
report.check('the marker plan points at wscript.exe and powershell.exe under SystemRoot', markerJson?.wscript === WSCRIPT && typeof markerJson?.powershell === 'string' && markerJson.powershell.endsWith('System32\\WindowsPowerShell\\v1.0\\powershell.exe'), JSON.stringify([markerJson?.wscript, markerJson?.powershell]));
report.check('the dry run wrote nothing at all', installPlan.text !== null && installPlan.text.includes('Dry run only: nothing was written.'), String(installPlan.exit));

const uninstallPlanPath = join(EVIDENCE_DIR, 'probe21-uninstall-dryrun.txt');
const uninstallPlan = runPowerShellToUtf8(`$lines = @(& '${join(DEPLOY_DIR, 'uninstall.ps1')}' -DryRun); [System.IO.File]::WriteAllLines('${uninstallPlanPath}', $lines, (New-Object System.Text.UTF8Encoding($false)))`, uninstallPlanPath);
readings.uninstallPlan = uninstallPlan.text;
const uninstallLines = (uninstallPlan.text ?? '').split(/\r?\n/);
report.same('the uninstall plan guards two key deletions', uninstallLines.filter((line) => line.includes('reg.exe query') && line.includes('reg.exe delete')).length, 2);
report.check('the uninstall plan deletes the scheme key', uninstallLines.some((line) => line.includes(`delete "HKCU\\Software\\Classes\\${SCHEME}"`)), 'scheme key');
report.check('the uninstall plan deletes the AUMID key', uninstallLines.some((line) => line.includes(`delete "HKCU\\Software\\Classes\\AppUserModelId\\${AUMID}"`)), 'aumid key');
report.check('the uninstall plan removes the marker file', uninstallLines.some((line) => line.includes('installed.json')), 'marker');
report.check('the uninstall plan clears only the product AUMID history', uninstallLines.some((line) => line.includes(`History.Clear("${AUMID}")`)), 'History.Clear');
report.check('no uninstall line touches HKLM', !uninstallLines.some((line) => /HKLM/i.test(line)), 'the plan lines');

const uninstallPlanPath2 = join(EVIDENCE_DIR, 'probe21-uninstall-dryrun-2.txt');
const installPlanPath2 = join(EVIDENCE_DIR, 'probe21-install-dryrun-2.txt');
await settle(1);
const installPlanAgain = runPowerShellToUtf8(`$lines = @(& '${join(DEPLOY_DIR, 'install.ps1')}' -DryRun); [System.IO.File]::WriteAllLines('${installPlanPath2}', $lines, (New-Object System.Text.UTF8Encoding($false)))`, installPlanPath2);
const uninstallPlanAgain = runPowerShellToUtf8(`$lines = @(& '${join(DEPLOY_DIR, 'uninstall.ps1')}' -DryRun); [System.IO.File]::WriteAllLines('${uninstallPlanPath2}', $lines, (New-Object System.Text.UTF8Encoding($false)))`, uninstallPlanPath2);
const normalisePlan = (text) => String(text).replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, '<ISO>');
report.check('the install plan is identical on a second run up to the install timestamp (idempotent by construction)', normalisePlan(installPlanAgain.text) === normalisePlan(installPlan.text), `sha ${sha(normalisePlan(installPlanAgain.text))}`);
report.check('the uninstall plan is identical on a second run (idempotent by construction)', uninstallPlanAgain.text === uninstallPlan.text, `sha ${sha(String(uninstallPlanAgain.text))}`);
report.note(
  'a real uninstall run is NOT executed here',
  'it deletes HKCU keys and clears Action Center history; with the keys absent the sandbox would refuse the delete and the script would legitimately exit 1. The user runs it (manual checklist 1.8).',
);

report.same('wscript.exe is a GUI-subsystem binary (2): no console window can be created', peSubsystem(WSCRIPT), 2);
report.same('powershell.exe is a console-subsystem binary (3): it must not be the entry', peSubsystem(PS), 3);

/* =============================================== 6 · registry, post-install tier */

report.group('6. registry, post-install tier: read-only, and honest about not being run');

const markerPath = join(process.env.USERPROFILE ?? '', '.dsh', 'approval-chime', 'native-toast', 'installed.json');
const schemeQuery = runToFile('reg.exe', ['query', `HKCU\\Software\\Classes\\${SCHEME}`, '/s'], join(EVIDENCE_DIR, 'probe21-regquery-scheme.txt'), { timeoutMs: 30000 });
const aumidQuery = runToFile('reg.exe', ['query', `HKCU\\Software\\Classes\\AppUserModelId\\${AUMID}`], join(EVIDENCE_DIR, 'probe21-regquery-aumid.txt'), { timeoutMs: 30000 });
const markerPresent = existsSync(markerPath);
const tierInstalled = markerPresent || schemeQuery.status === 0 || aumidQuery.status === 0;
readings.postInstallTier = {
  markerPresent,
  markerPath,
  schemeQueryExit: schemeQuery.status,
  aumidQueryExit: aumidQuery.status,
  tierInstalled,
  status: tierInstalled ? 'installed' : 'not-installed',
};
report.same(
  'the post-install tier names its own state instead of passing silently',
  readings.postInstallTier.markerPresent === false && schemeQuery.status !== 0 && aumidQuery.status !== 0 ? 'not-installed' : readings.postInstallTier.status,
  readings.postInstallTier.status,
);
report.check(
  'no install was attempted without -DryRun: the plan file still says nothing was written',
  (readings.installPlan ?? '').includes('Dry run only: nothing was written.') && !(readings.installPlan ?? '').includes('Installed. The notification header'),
  'the dry-run output',
);
report.note('post-install tier status', tierInstalled ? 'installed — the read-only assertions below ran' : 'not-installed — THIS TIER WAS NOT EXECUTED (the install is a user action; this probe must not write HKCU)');
report.note('read-only evidence: scheme key query exit / aumid key query exit / marker present', `${String(schemeQuery.status)} / ${String(aumidQuery.status)} / ${String(markerPresent)}`);
report.note('the user command that creates this tier', `powershell -NoProfile -ExecutionPolicy Bypass -File "${join(DEPLOY_DIR, 'install.ps1')}"`);
if (tierInstalled) {
  const registryRead = historyCall('registry');
  readings.registryRead = registryRead.json;
  report.same('the product scheme key exists', registryRead.json?.schemePresent, true);
  report.check('the registered command line is exactly wscript.exe + shim + quoted %1 (REAL MACHINE)', registryRead.json?.command === expectedCommand, String(registryRead.json?.command));
  report.check('the registered command line is not a console-subsystem entry point', !/powershell\.exe/i.test(String(registryRead.json?.command)), String(registryRead.json?.command));
  report.same('the registered DisplayName is the frozen name (REAL MACHINE)', registryRead.json?.displayName, APP_NAME);
  report.same('the registered URL Protocol value is empty (REAL MACHINE)', registryRead.json?.urlProtocol, '');
  /* The scheme key's DEFAULT value is the fourth frozen write (§2 line 142). It was
   * ABSENT in the t18 round (H3) even though the installer printed [ok]; t21 replaced
   * the write with a read-back-verified chain. This assertion is the independent
   * confirmation that it is back — and the deviation list below still names anything
   * that does not match, so a future regression cannot hide here. */
  const labelRow = expectedRegistryWrites.find((row) => row.key.endsWith(`\\${SCHEME}`) && row.name === defaultNameInPlan) ?? null;
  const liveDeviations = [];
  for (const row of expectedRegistryWrites) {
    const actual =
      row.name === 'DisplayName'
        ? registryRead.json?.displayName
        : row.key.endsWith('\\shell\\open\\command')
          ? registryRead.json?.command
          : row.name === 'URL Protocol'
            ? registryRead.json?.urlProtocol
            : registryRead.json?.schemeDefault;
    if ((actual ?? null) !== row.expectedData) {
      liveDeviations.push({ item: `${row.contractKey} [${row.name}]`, got: actual ?? null, want: row.expectedData, contractLine: row.dataLine });
    }
  }
  readings.liveRegistration = {
    command: registryRead.json?.command ?? null,
    expectedCommand,
    displayName: registryRead.json?.displayName ?? null,
    urlProtocol: registryRead.json?.urlProtocol ?? null,
    schemeDefault: registryRead.json?.schemeDefault ?? null,
    expectedSchemeDefault: labelRow?.expectedData ?? null,
    deviations: liveDeviations,
  };
  report.same(
    'the live scheme key (default) IS the frozen label (the value H3 lost, re-read here)',
    registryRead.json?.schemeDefault,
    labelRow?.expectedData ?? null,
  );
  report.note('live registration deviations from the frozen §1.4/§2 writes (as read right now)', JSON.stringify(liveDeviations));
  report.same('all four frozen writes are present on the live machine, byte for byte', liveDeviations.length, 0);
  report.note('uninstall remains a user action', 'asserting "nothing is left after uninstall" is part of the manual checklist, not of this probe');
} else {
  report.note('skipped assertions', 'the four post-install assertions above are NOT reported as passed; they were never executed');
}

/* ================================================== 7 · Host fail-closed matrix */

report.group('7. Host fail-closed matrix (real bridge, real files, recorded spawns)');

let clock = Date.UTC(2026, 8, 24, 3, 0, 0);

function makeBridgeHome(name) {
  const home = join(SCRATCH_HOME, name);
  const directory = join(home, 'approval-chime', 'native-toast');
  mkdirSync(directory, { recursive: true });
  return { home, directory };
}

function writeMarker(directory, overrides = {}) {
  const marker = {
    version: 1,
    aumid: AUMID,
    displayName: APP_NAME,
    scheme: SCHEME,
    wscript: WSCRIPT,
    powershell: PS,
    pluginDir: PLUGIN_DIR,
    installedAt: new Date(clock).toISOString(),
    ...overrides,
  };
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'installed.json'), JSON.stringify(marker), 'utf8');
  return marker;
}

function makeBridge({ home, directory, enabled, scriptedCode = () => 0, marker = true, port = 45125 }) {
  if (marker) writeMarker(directory);
  const spawns = makeSpawnRecorder(scriptedCode);
  const spawnReads = [];
  const platform = platformModule.createNativeToastPlatform({
    home,
    spawn: spawns.spawn,
    exists: (path) => existsSync(path),
    now: () => clock,
    env: process.env,
    powershell: PS,
    log: () => {},
  });
  spawns.onSpawn = (call) => {
    if (call.args.includes('-XmlPath')) {
      const xmlPath = call.args[call.args.indexOf('-XmlPath') + 1];
      spawnReads.push({ xmlPath, xml: readOrNull(xmlPath) });
    }
  };
  const bridge = bridgeModule.createNativeToastBridge({ platform, log: () => {}, now: () => clock, portSource: () => port });
  if (enabled) {
    bridge.setSettingsScope({ get: () => ({ enabled: true, volume: 70, tone: 'chime', nativeToast: true }) });
  }
  return { bridge, spawns, spawnReads, platform, home, directory, port };
}

const listDirectory = (directory) => {
  try {
    return readdirSync(directory).sort();
  } catch {
    return null;
  }
};

/* 7a — the default (no scope bound) is off, and off touches nothing at all */
{
  const scratch = makeBridgeHome('disabled');
  rmSync(scratch.directory, { recursive: true, force: true });
  const rig = makeBridge({ ...scratch, enabled: false, marker: false });
  const before = listDirectory(scratch.directory);
  const token = newToken();
  const raise = await callRoute(rig.bridge, { method: 'POST', url: ROUTE, body: { token, key: 'k1', sessionId: 's1', toolName: 'bash' } });
  report.same('an unbound bridge answers "disabled"', raise.json?.reason, 'disabled');
  report.same('... with 200, not an error', raise.status, 200);
  report.same('... and a skipped state', raise.json?.state, 'skipped');
  report.same('... without starting any process', rig.spawns.calls.length, 0);
  report.same('... without creating its own directory', listDirectory(scratch.directory), before);
  const status = await callRoute(rig.bridge, { method: 'GET', url: ROUTE });
  report.same('GET / while off also answers "disabled" without touching the platform', status.json?.state, 'disabled');
  report.same('GET / while off starts nothing either', rig.spawns.calls.length, 0);
  rmSync(scratch.home, { recursive: true, force: true });
}

/* 7b — enabled and installed: the raise path, the argv, the XML on disk, the duplicate */
{
  const scratch = makeBridgeHome('raise-ok');
  rmSync(scratch.directory, { recursive: true, force: true });
  const rig = makeBridge({ ...scratch, enabled: true, scriptedCode: () => 0 });
  const token = newToken();
  const raised = await callRoute(rig.bridge, { method: 'POST', url: ROUTE, body: { token, key: 'k2', sessionId: 's2', toolName: 'bash', reason: 'because' } });
  await settle(4);
  readings.raiseOk = { status: raised.status, json: raised.json, spawnArgs: rig.spawns.calls[0]?.args, spawnOptions: rig.spawns.calls[0]?.options };
  report.same('a ready bridge raises and says so', raised.json?.state, 'raised');
  report.same('the tag it answers is appr- plus 11 characters', raised.json?.tag, `appr-${token.slice(0, 11)}`);
  report.same('exactly one process was started', rig.spawns.calls.length, 1);
  report.same('the interpreter is the frozen absolute powershell.exe', rig.spawns.calls[0]?.command, PS);
  const argv = rig.spawns.calls[0]?.args ?? [];
  report.deep('the argument vector is the frozen one', argv, [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    RAISE_PS1,
    '-Aumid',
    AUMID,
    '-XmlPath',
    join(scratch.directory, `raise-${token}.xml`),
    '-Tag',
    `appr-${token.slice(0, 11)}`,
    '-Group',
    GROUP,
  ]);
  report.same('the child is spawned without a window', rig.spawns.calls[0]?.options?.windowsHide, true);
  report.same('the child gets no pipe to hold open', rig.spawns.calls[0]?.options?.stdio, 'ignore');
  report.check('the XML handed to raise.ps1 is the frozen XML with the listening port', rig.spawnReads[0]?.xml === platformModule.buildNativeToastXml({ token, port: 45125, toolName: 'bash', reason: 'because' }), rig.spawnReads[0]?.xml);
  report.same('the XML file is deleted after the raise', existsSync(join(scratch.directory, `raise-${token}.xml`)), false);
  const duplicate = await callRoute(rig.bridge, { method: 'POST', url: ROUTE, body: { token, key: 'k2', sessionId: 's2', toolName: 'bash' } });
  await settle(4);
  report.same('a second raise for a live token does not start a second process', rig.spawns.calls.length, 1);
  report.same('a second raise answers the same tag', duplicate.json?.tag, raised.json?.tag);
  report.same('a second raise is marked as a duplicate', duplicate.json?.duplicate, true);
  report.same('the live token is remembered', rig.bridge.tokens.size, 1);
  rmSync(scratch.home, { recursive: true, force: true });
}

/* 7c — raise failure (exit 1) and the empty port source */
{
  const scratch = makeBridgeHome('raise-fail');
  rmSync(scratch.directory, { recursive: true, force: true });
  const rig = makeBridge({ ...scratch, enabled: true, scriptedCode: () => 1 });
  const token = newToken();
  const failed = await callRoute(rig.bridge, { method: 'POST', url: ROUTE, body: { token, key: 'k3', sessionId: 's3', toolName: 'bash' } });
  await settle(4);
  report.same('a failing raise.ps1 is reported as raise-failed', failed.json?.reason, 'raise-failed');
  report.same('the exit code is carried in the detail text', failed.json?.detail, 'exit 1');
  report.same('a failed raise registers no token', rig.bridge.tokens.size, 0);
  report.same('a failed raise leaves no XML behind', existsSync(join(scratch.directory, `raise-${token}.xml`)), false);
  const noPort = makeBridge({ ...makeBridgeHome('raise-noport'), enabled: true, port: 0 });
  const token2 = newToken();
  const skipped = await callRoute(noPort.bridge, { method: 'POST', url: ROUTE, body: { token: token2, key: 'k4', sessionId: 's4', toolName: 'bash' } });
  await settle(4);
  report.same('without a listening port the bridge refuses to build a URI', skipped.json?.detail, 'no listening port');
  report.same('without a listening port nothing is spawned', noPort.spawns.calls.length, 0);
  rmSync(scratch.home, { recursive: true, force: true });
  rmSync(join(SCRATCH_HOME, 'raise-noport'), { recursive: true, force: true });
}

/* 7d — a forged token: never issued, so POST /answer must refuse with zero side effects */
{
  const scratch = makeBridgeHome('forged-token');
  rmSync(scratch.directory, { recursive: true, force: true });
  const rig = makeBridge({ ...scratch, enabled: true });
  const forged = newToken();
  const before = listDirectory(scratch.directory);
  const refused = await callRoute(rig.bridge, { method: 'POST', url: `${ROUTE}/answer`, body: { token: forged, answer: 'allowed-once' } });
  await settle(4);
  report.same('a token the Host never issued is refused with 404', refused.status, 404);
  report.same('the refusal is an "unknown token"', refused.json?.error, 'unknown token');
  report.same('no answer file was written for the forged token', existsSync(join(scratch.directory, `${forged}.json`)), false);
  report.deep('the directory listing is unchanged by the refusal', listDirectory(scratch.directory), before);
  report.same('the refusal started no process', rig.spawns.calls.length, 0);
  report.same('the refusal counted itself as refused', rig.bridge.counters.refused, 1);
  report.same('no token was minted host-side for it', rig.bridge.tokens.size, 0);
  const malformed = await callRoute(rig.bridge, { method: 'POST', url: `${ROUTE}/answer`, body: { token: 'NOT-A-TOKEN', answer: 'allowed-once' } });
  report.same('a malformed token is a 400, not a 404', malformed.status, 400);
  const badAnswer = await callRoute(rig.bridge, { method: 'POST', url: `${ROUTE}/answer`, body: { token: forged, answer: 'accept' } });
  report.same('an answer outside the two literals is a 400', badAnswer.status, 400);
  rmSync(scratch.home, { recursive: true, force: true });
}

/* 7d2 — a hand-written answer file for a never-issued token.
 *
 * The contract page ruled on exactly this (reviewer F1, captain ruling 2026-09-24):
 * the backfill file is the DELIVERY authority and the memory table gates only the
 * write route; §15 declares that a same-user process can forge an answer. So this
 * block asserts the DECLARED behaviour, cites the clause numbers it read at run
 * time, and records that an earlier revision answered 404 here. It is not a defect
 * claim, and it is not a silent pass either: the reading is on the record. */
{
  const scratch = makeBridgeHome('file-authority');
  rmSync(scratch.directory, { recursive: true, force: true });
  const rig = makeBridge({ ...scratch, enabled: true });
  const forged = newToken();
  const answerPath = join(scratch.directory, `${forged}.json`);
  writeFileSync(answerPath, JSON.stringify({ version: 1, token: forged, answer: 'allowed-once', answeredAt: new Date(clock).toISOString() }), 'utf8');
  const poll = await callRoute(rig.bridge, { method: 'GET', url: `${ROUTE}/answer?token=${forged}` });
  const writeGate = await callRoute(rig.bridge, { method: 'POST', url: `${ROUTE}/answer`, body: { token: newToken(), answer: 'allowed-once' } });
  await settle(4);
  const cites = {
    fileIsData: contractCite('回填文件是**数据**，永不执行'),
    deliveryAuthority: contractCite('回填文件是交付层'),
    writeRouteOnly: contractCite('内存表只用于'),
    sameUserProcessNonClaim: contractCite('不声称能防同一用户下的其它进程'),
  };
  readings.fileAuthority = { poll: { status: poll.status, json: poll.json }, writeGate: { status: writeGate.status, json: writeGate.json }, cites, fileLeft: existsSync(answerPath), spawns: rig.spawns.calls.length };
  report.check(
    'the contract page at read time declares the backfill file to be the delivery authority (F1 ruling)',
    cites.deliveryAuthority !== null && cites.fileIsData !== null,
    JSON.stringify(cites),
  );
  report.check('... and declares that the memory table gates only the write route', cites.writeRouteOnly !== null, `contract line ${String(cites.writeRouteOnly)}`);
  report.check('... and §15 declares that a same-user process can forge an answer', cites.sameUserProcessNonClaim !== null, `contract line ${String(cites.sameUserProcessNonClaim)}`);
  report.same('as declared, a hand-written answer file for a never-issued token IS delivered', poll.json?.state, 'answered');
  report.same('the delivered decision is the one written in the file', poll.json?.answer, 'allowed-once');
  report.same('the write route still refuses a never-issued token (the memory-table gate)', writeGate.status, 404);
  report.same('no notification was dismissed for a token that never existed', rig.spawns.calls.length, 0);
  report.note(
    'the same probe input on the previous revision',
    'native-bridge.js 03:06:06 (sha 7C0A66AF93…) answered 404 — the 03:08+ contract rules the file authoritative instead (captain F1 ruling)',
  );
  rmSync(scratch.home, { recursive: true, force: true });
}

/* 7d3 — with the switch off, EVERY entry point is inert, including one for a live token */
{
  const scratch = makeBridgeHome('disabled-gates');
  rmSync(scratch.directory, { recursive: true, force: true });
  const rig = makeBridge({ ...scratch, enabled: true });
  const live = newToken();
  await callRoute(rig.bridge, { method: 'POST', url: ROUTE, body: { token: live, key: 'kg', sessionId: 'sg', toolName: 'bash' } });
  await settle(4);
  const spawnsBefore = rig.spawns.calls.length;
  rig.bridge.setSettingsScope({ get: () => ({ enabled: true, volume: 70, tone: 'chime', nativeToast: false }) });
  const filesBefore = listDirectory(scratch.directory);
  const poll = await callRoute(rig.bridge, { method: 'GET', url: `${ROUTE}/answer?token=${live}` });
  const record = await callRoute(rig.bridge, { method: 'POST', url: `${ROUTE}/answer`, body: { token: live, answer: 'allowed-once' } });
  const revoke = await callRoute(rig.bridge, { method: 'POST', url: `${ROUTE}/revoke`, body: { tokens: [live] } });
  const raise = await callRoute(rig.bridge, { method: 'POST', url: ROUTE, body: { token: newToken(), key: 'kg2', sessionId: 'sg', toolName: 'bash' } });
  const status = await callRoute(rig.bridge, { method: 'GET', url: ROUTE });
  await settle(4);
  readings.disabledGates = {
    'GET /answer': poll.json,
    'POST /answer': record.json,
    'POST /revoke': revoke.json,
    'POST /': raise.json,
    'GET /': status.json,
    spawnsStarted: rig.spawns.calls.length - spawnsBefore,
    filesBefore,
    filesAfter: listDirectory(scratch.directory),
    liveTokens: rig.bridge.tokens.size,
  };
  for (const [name, response] of [['GET /answer', poll], ['POST /answer', record], ['POST /revoke', revoke], ['POST /', raise]]) {
    report.check(
      `with the switch off, ${name} answers skipped/disabled`,
      response.json?.state === 'skipped' && response.json?.reason === 'disabled',
      JSON.stringify(response.json),
    );
  }
  report.same('with the switch off, GET / reads as disabled', status.json?.state, 'disabled');
  report.same('with the switch off, not one process is started', rig.spawns.calls.length - spawnsBefore, 0);
  report.deep('with the switch off, no file appears or disappears', listDirectory(scratch.directory), filesBefore);
  report.same('the live token is not consumed while off', rig.bridge.tokens.size, 1);
  report.same('the off state leaves the route inert even with a live token in memory', rig.bridge.counters.recorded, 0);
  rmSync(scratch.home, { recursive: true, force: true });
}

/* 7e — an expired answer is not an answer (TTL 600000), and a dead token reads as unknown */{
  const scratch = makeBridgeHome('expired-answer');
  rmSync(scratch.directory, { recursive: true, force: true });
  const rig = makeBridge({ ...scratch, enabled: true });
  const token = newToken();
  const raised = await callRoute(rig.bridge, { method: 'POST', url: ROUTE, body: { token, key: 'k5', sessionId: 's5', toolName: 'bash' } });
  await settle(4);
  report.same('the fixture token was raised', raised.json?.state, 'raised');
  const answerPath = join(scratch.directory, `${token}.json`);
  const written = { version: 1, token, answer: 'allowed-once', answeredAt: new Date(clock - TTL_MS - 1).toISOString() };
  writeFileSync(answerPath, JSON.stringify(written), 'utf8');
  const poll = await callRoute(rig.bridge, { method: 'GET', url: `${ROUTE}/answer?token=${token}` });
  readings.expiredAnswer = { status: poll.status, json: poll.json };
  report.same('an answer older than the TTL is NOT delivered', poll.json?.state, 'pending');
  report.same('... and it carries no decision at all', Object.prototype.hasOwnProperty.call(poll.json ?? {}, 'answer'), false);
  report.same('the expired file is swept away', existsSync(answerPath), false);
  report.same('an expired answer never counts as answered', rig.bridge.counters.answered, 0);
  const fresh = { version: 1, token, answer: 'rejected', answeredAt: new Date(clock - 1000).toISOString() };
  writeFileSync(answerPath, JSON.stringify(fresh), 'utf8');
  clock += TTL_MS + 1;
  const late = await callRoute(rig.bridge, { method: 'GET', url: `${ROUTE}/answer?token=${token}` });
  report.same('a token past its own TTL is unknown, whatever is on disk', late.status, 404);
  clock -= TTL_MS + 1;
  rmSync(scratch.home, { recursive: true, force: true });
}

/* 7f — one shot: a second answer may not replace the first, and no read replays it */
{
  const scratch = makeBridgeHome('one-shot');
  rmSync(scratch.directory, { recursive: true, force: true });
  const rig = makeBridge({ ...scratch, enabled: true });
  const token = newToken();
  await callRoute(rig.bridge, { method: 'POST', url: ROUTE, body: { token, key: 'k6', sessionId: 's6', toolName: 'bash' } });
  await settle(4);
  const first = await callRoute(rig.bridge, { method: 'POST', url: `${ROUTE}/answer`, body: { token, answer: 'allowed-once' } });
  const answerPath = join(scratch.directory, `${token}.json`);
  const firstFile = readOrNull(answerPath);
  readings.oneShotFirstFile = firstFile;
  report.same('the first answer is recorded', first.json?.state, 'recorded');
  report.deep('the answer file is the frozen schema, no extra key', Object.keys(JSON.parse(firstFile)).sort(), ['answer', 'answeredAt', 'token', 'version']);
  report.same('the file carries version 1', JSON.parse(firstFile).version, 1);
  const second = await callRoute(rig.bridge, { method: 'POST', url: `${ROUTE}/answer`, body: { token, answer: 'rejected' } });
  report.same('a second, different answer is refused with 409', second.status, 409);
  report.same('the refusal names the already-answered state', second.json?.state, 'already-answered');
  report.same('the file is untouched by the second answer', readOrNull(answerPath), firstFile);
  const consumed = await callRoute(rig.bridge, { method: 'GET', url: `${ROUTE}/answer?token=${token}` });
  report.same('the first answer is handed over once', consumed.json?.state, 'answered');
  report.same('the handed-over answer is the first one', consumed.json?.answer, 'allowed-once');
  report.same('the file is gone after the hand-over', existsSync(answerPath), false);
  const replay = await callRoute(rig.bridge, { method: 'GET', url: `${ROUTE}/answer?token=${token}` });
  report.same('a second read reads as consumed', replay.json?.state, 'consumed');
  report.same('a consumed token never replays the answer', 'answer' in (replay.json ?? {}), false);
  report.same('the dismiss went through raise.ps1 with -Remove on the frozen tag', rig.spawns.calls.some((call) => call.args.includes('-Remove') && call.args[call.args.indexOf('-Tag') + 1] === `appr-${token.slice(0, 11)}`), true);
  report.same('exactly one answer was recorded host-side across the two clicks', rig.bridge.counters.recorded, 1);
  rmSync(scratch.home, { recursive: true, force: true });
}

/* 7g — revoke: an answer that arrived while the window was hidden still reaches the page */
{
  const scratch = makeBridgeHome('revoke');
  rmSync(scratch.directory, { recursive: true, force: true });
  const rig = makeBridge({ ...scratch, enabled: true });
  const token = newToken();
  await callRoute(rig.bridge, { method: 'POST', url: ROUTE, body: { token, key: 'k7', sessionId: 's7', toolName: 'bash' } });
  await settle(4);
  const opened = await callRoute(rig.bridge, { method: 'POST', url: `${ROUTE}/revoke`, body: { tokens: [token] } });
  report.same('a revoke of a live token answers pending', opened.json?.results?.[0]?.state, 'pending');
  report.same('the pending token is forgotten host-side', rig.bridge.tokens.size, 0);
  const second = newToken();
  await callRoute(rig.bridge, { method: 'POST', url: ROUTE, body: { token: second, key: 'k8', sessionId: 's8', toolName: 'bash' } });
  await settle(4);
  writeFileSync(join(scratch.directory, `${second}.json`), JSON.stringify({ version: 1, token: second, answer: 'rejected', answeredAt: new Date(clock).toISOString() }), 'utf8');
  const answered = await callRoute(rig.bridge, { method: 'POST', url: `${ROUTE}/revoke`, body: { tokens: [second] } });
  report.same('a revoke that finds an answer hands it over', answered.json?.results?.[0]?.state, 'answered');
  report.same('the handed-over answer is the one that was clicked', answered.json?.results?.[0]?.answer, 'rejected');
  const unknown = await callRoute(rig.bridge, { method: 'POST', url: `${ROUTE}/revoke`, body: { tokens: [newToken()] } });
  report.same('a revoke of an unknown token answers unknown', unknown.json?.results?.[0]?.state, 'unknown');
  const tooMany = await callRoute(rig.bridge, { method: 'POST', url: `${ROUTE}/revoke`, body: { tokens: Array.from({ length: 33 }, () => newToken()) } });
  report.same('a revoke of more than 32 tokens is refused with 400', tooMany.status, 400);
  rmSync(scratch.home, { recursive: true, force: true });
}

/* 7h — route shape: one prefix route, method dispatch, unknown paths, HEAD cannot consume */
{
  const scratch = makeBridgeHome('routes');
  rmSync(scratch.directory, { recursive: true, force: true });
  const rig = makeBridge({ ...scratch, enabled: true });
  const token = newToken();
  await callRoute(rig.bridge, { method: 'POST', url: ROUTE, body: { token, key: 'k9', sessionId: 's9', toolName: 'bash' } });
  await settle(4);
  writeFileSync(join(scratch.directory, `${token}.json`), JSON.stringify({ version: 1, token, answer: 'allowed-once', answeredAt: new Date(clock).toISOString() }), 'utf8');
  const head = await callRoute(rig.bridge, { method: 'HEAD', url: `${ROUTE}/answer?token=${token}` });
  report.same('HEAD on /answer is refused', head.status, 405);
  report.same('HEAD did not consume the one-shot answer', existsSync(join(scratch.directory, `${token}.json`)), true);
  const unknownPath = await callRoute(rig.bridge, { method: 'GET', url: `${ROUTE}/nope` });
  report.same('an unknown sub-path is a 404 that names itself', unknownPath.status, 404);
  report.check('the 404 text carries the pathname', String(unknownPath.json?.error).includes('/api/approval-chime/native-toast/nope'), String(unknownPath.json?.error));
  const wrongMethod = await callRoute(rig.bridge, { method: 'DELETE', url: ROUTE });
  report.same('an unsupported method is a 405', wrongMethod.status, 405);
  const notJson = await callRoute(rig.bridge, { method: 'POST', url: ROUTE, body: '{not json' });
  report.same('a body that is not JSON is a 400', notJson.status, 400);
  const tooLarge = await callRoute(rig.bridge, { method: 'POST', url: ROUTE, body: `{"token":"${newToken()}","key":"${'z'.repeat(20000)}"}` });
  report.same('a body over the frozen 16384-byte cap is a 413', tooLarge.status, 413);
  report.same('the loopback-only route answers JSON with no-store', rig === null ? null : (await callRoute(rig.bridge, { method: 'GET', url: ROUTE })).headers?.['content-type'], 'application/json; charset=utf-8');
  rmSync(scratch.home, { recursive: true, force: true });
}

/* 7i — the route registration itself: exactly one prefix route on webServer.port */
{
  const registered = [];
  const effects = [];
  const stubCtx = {
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    get: () => undefined,
    inject: (names, callback) => callback({ ...stubCtx, webServer: { port: 45126, register: (entry) => registered.push(entry) } }),
    effect: (callback) => {
      effects.push(callback());
      return () => {};
    },
    webServer: { port: 45126, register: (entry) => registered.push(entry) },
  };
  const bridge = bridgeModule.registerNativeToastRoutes(stubCtx);
  await settle(2);
  report.same('exactly one route is registered', registered.length, 1);
  report.same('the route is a prefix route', registered[0]?.kind, 'prefix');
  report.same('the route path is the frozen one', registered[0]?.path, ROUTE);
  const scratch = makeBridgeHome('port-source');
  rmSync(scratch.directory, { recursive: true, force: true });
  writeMarker(scratch.directory);
  const spawns = makeSpawnRecorder(() => 0);
  const spawnReads = [];
  spawns.onSpawn = (call) => {
    const xmlPath = call.args[call.args.indexOf('-XmlPath') + 1];
    if (xmlPath) spawnReads.push(readOrNull(xmlPath));
  };
  const platform = platformModule.createNativeToastPlatform({ home: scratch.home, spawn: spawns.spawn, exists: () => true, now: () => clock, powershell: PS, log: () => {} });
  const routed = bridgeModule.createNativeToastBridge({ platform, portSource: () => 45126, log: () => {} });
  routed.setSettingsScope({ get: () => ({ nativeToast: true }) });
  const token = newToken();
  await callRoute(routed, { method: 'POST', url: ROUTE, body: { token, key: 'ka', sessionId: 'sa', toolName: 'bash' } });
  await settle(4);
  report.check('the URI in the toast carries the live web-server port, not a literal', String(spawnReads[0] ?? '').includes('p=45126'), String(spawnReads[0] ?? '').slice(0, 200));
  rmSync(scratch.home, { recursive: true, force: true });
}

/* 7j — r3 / G1: the concurrent write path, 20 rounds of two POSTs in one tick.
 *
 * t14 replaced "write temp + rename" with "per-writer unique temp + link publish,
 * EEXIST → 409". The property under test is the one the contract promises: exactly
 * ONE recorded answer per token, a single well-formed answer file, one delivery —
 * and no torn JSON, which the pre-t14 rename path produced 12/20 times. */
{
  const scratch = makeBridgeHome('concurrent-write');
  rmSync(scratch.directory, { recursive: true, force: true });
  const rig = makeBridge({ ...scratch, enabled: true });
  const rounds = [];
  let tornJson = 0;
  let badPairs = 0;
  const winners = { 'allowed-once': 0, rejected: 0 };

  for (let round = 0; round < 20; round += 1) {
    const token = newToken();
    await callRoute(rig.bridge, { method: 'POST', url: ROUTE, body: { token, key: `g1-${String(round)}`, sessionId: 'g1', toolName: 'bash' } });
    await settle(2);
    const first = dispatchRoute(rig.bridge, { method: 'POST', url: `${ROUTE}/answer`, body: { token, answer: 'allowed-once' } });
    const second = dispatchRoute(rig.bridge, { method: 'POST', url: `${ROUTE}/answer`, body: { token, answer: 'rejected' } });
    const inFlight = {
      firstSettled: first.state.settled,
      secondSettled: second.state.settled,
      firstStatus: first.state.status,
      secondStatus: second.state.status,
    };
    const [left, right] = await Promise.all([first.settled, second.settled]);
    const filePath = join(scratch.directory, `${token}.json`);
    const file = readAnswerFile(filePath);
    const leftover = leftoversIn(scratch.directory);
    const statuses = [left.status, right.status].sort((a, b) => a - b);
    const states = [left.json?.state, right.json?.state].filter(Boolean).sort();
    const okPair = statuses[0] === 200 && statuses[1] === 409 && states.includes('recorded') && states.includes('already-answered');
    if (!okPair) badPairs += 1;
    if (!file.ok) tornJson += 1;
    if (file.ok && (file.value.answer === 'allowed-once' || file.value.answer === 'rejected')) winners[file.value.answer] += 1;
    const delivered = await callRoute(rig.bridge, { method: 'GET', url: `${ROUTE}/answer?token=${token}` });
    const replay = await callRoute(rig.bridge, { method: 'GET', url: `${ROUTE}/answer?token=${token}` });
    rounds.push({
      round,
      token,
      statuses,
      states,
      inFlight,
      okPair,
      fileParses: file.ok,
      fileMissing: file.missing === true,
      fileAnswer: file.ok ? file.value.answer : null,
      fileKeys: file.ok ? Object.keys(file.value).sort() : null,
      leftover,
      delivered: { status: delivered.status, state: delivered.json?.state, answer: delivered.json?.answer ?? null },
      replay: { status: replay.status, state: replay.json?.state, hasAnswer: Object.prototype.hasOwnProperty.call(replay.json ?? {}, 'answer') },
    });
  }

  readings.concurrentWrite = {
    rounds,
    tornJson,
    badPairs,
    winners,
    firstRoundsAllInFlight: rounds.every((row) => row.inFlight.firstSettled === false && row.inFlight.secondSettled === false && row.inFlight.firstStatus === null && row.inFlight.secondStatus === null),
    leftoverRounds: rounds.filter((row) => row.leftover.length > 0).map((row) => ({ round: row.round, leftover: row.leftover })),
  };
  for (const row of rounds) {
    console.log(`    · r3 round ${String(row.round).padStart(2)}: statuses ${JSON.stringify(row.statuses)} states ${JSON.stringify(row.states)} file=${row.fileAnswer ?? '(none)'} tmp=${JSON.stringify(row.leftover)} get1=${String(row.delivered.state)}/${String(row.delivered.answer)} get2=${String(row.replay.state)}`);
  }

  report.same('r3/G1: 20 rounds, each round answered by exactly one 200 and one 409', badPairs, 0);
  report.same('r3/G1: not one round left a torn / unreadable answer file', tornJson, 0);
  report.same('r3/G1: every round left exactly one answer file behind (no missing file)', rounds.filter((row) => row.fileMissing === true).length, 0);
  report.same('r3/G1: every answer file carries the frozen four keys and nothing else', JSON.stringify([...new Set(rounds.map((row) => JSON.stringify(row.fileKeys)))]), JSON.stringify([JSON.stringify(['answer', 'answeredAt', 'token', 'version'])]));
  report.same('r3/G1: the answer in each file is one of the two literals', rounds.filter((row) => row.fileAnswer !== 'allowed-once' && row.fileAnswer !== 'rejected').length, 0);
  report.same('r3/G1: no .tmp / .claim / .partial leftover in any round', readings.concurrentWrite.leftoverRounds.length, 0);
  report.same('r3/G1: every round delivered the answer exactly once', rounds.filter((row) => row.delivered.state !== 'answered').length, 0);
  report.same('r3/G1: the second read never replays it', rounds.filter((row) => row.replay.state !== 'consumed' || row.replay.hasAnswer !== false).length, 0);
  report.same('r3/G1: the delivered answer is the one in the file', rounds.filter((row) => row.delivered.answer !== row.fileAnswer).length, 0);
  report.check(
    'r3/G1: every round was genuinely concurrent (both requests unsettled and unanswered at dispatch time)',
    readings.concurrentWrite.firstRoundsAllInFlight === true,
    JSON.stringify(rounds.map((row) => row.inFlight)),
  );
  report.note('r3/G1 winner distribution (both orders are contract-legal inside one tick)', JSON.stringify(winners));

  /* 7k — read side symmetry: two concurrent GETs deliver the answer once. */
  const readRounds = [];
  for (let round = 0; round < 20; round += 1) {
    const token = newToken();
    await callRoute(rig.bridge, { method: 'POST', url: ROUTE, body: { token, key: `g1r-${String(round)}`, sessionId: 'g1', toolName: 'bash' } });
    await settle(2);
    await callRoute(rig.bridge, { method: 'POST', url: `${ROUTE}/answer`, body: { token, answer: round % 2 === 0 ? 'allowed-once' : 'rejected' } });
    const first = dispatchRoute(rig.bridge, { method: 'GET', url: `${ROUTE}/answer?token=${token}` });
    const second = dispatchRoute(rig.bridge, { method: 'GET', url: `${ROUTE}/answer?token=${token}` });
    const inFlight = { firstSettled: first.state.settled, secondSettled: second.state.settled };
    const [left, right] = await Promise.all([first.settled, second.settled]);
    const states = [left.json?.state, right.json?.state].filter(Boolean).sort();
    const answered = [left, right].filter((response) => response.json?.state === 'answered');
    readRounds.push({
      round,
      states,
      inFlight,
      answeredCount: answered.length,
      answers: answered.map((response) => response.json?.answer),
      leftovers: leftoversIn(scratch.directory),
    });
  }
  readings.concurrentRead = {
    rounds: readRounds,
    answeredTwice: readRounds.filter((row) => row.answeredCount !== 1).length,
    allInFlight: readRounds.every((row) => row.inFlight.firstSettled === false && row.inFlight.secondSettled === false),
    leftoverRounds: readRounds.filter((row) => row.leftovers.length > 0).length,
  };
  report.same('r3/G1 (read side): 20 rounds, two concurrent GETs deliver the answer exactly once', readings.concurrentRead.answeredTwice, 0);
  report.same('r3/G1 (read side): the loser reads as consumed, never as a second answer', readRounds.filter((row) => !(row.states.includes('answered') && row.states.includes('consumed'))).length, 0);
  report.check('r3/G1 (read side): both GETs were in flight together in every round', readings.concurrentRead.allInFlight === true, JSON.stringify(readRounds.map((row) => row.inFlight)));
  report.same('r3/G1 (read side): no leftover files', readings.concurrentRead.leftoverRounds, 0);

  /* 7l — cross concurrency: POST /answer racing GET /answer in the same tick. */
  const crossRounds = [];
  for (let round = 0; round < 20; round += 1) {
    const token = newToken();
    await callRoute(rig.bridge, { method: 'POST', url: ROUTE, body: { token, key: `g1x-${String(round)}`, sessionId: 'g1', toolName: 'bash' } });
    await settle(2);
    const post = dispatchRoute(rig.bridge, { method: 'POST', url: `${ROUTE}/answer`, body: { token, answer: 'allowed-once' } });
    const poll = dispatchRoute(rig.bridge, { method: 'GET', url: `${ROUTE}/answer?token=${token}` });
    const inFlight = { postSettled: post.state.settled, pollSettled: poll.state.settled };
    const [written, read] = await Promise.all([post.settled, poll.settled]);
    // Read the file BEFORE the follow-up GET, or the read would only ever see the
    // already-consumed state and the "no torn file" claim would be vacuous.
    const file = readAnswerFile(join(scratch.directory, `${token}.json`));
    const followUp = await callRoute(rig.bridge, { method: 'GET', url: `${ROUTE}/answer?token=${token}` });
    const answersDelivered = [read, followUp].filter((response) => response.json?.state === 'answered').length;
    crossRounds.push({
      round,
      inFlight,
      post: { status: written.status, state: written.json?.state },
      read: { status: read.status, state: read.json?.state, answer: read.json?.answer ?? null },
      followUp: { state: followUp.json?.state, hasAnswer: Object.prototype.hasOwnProperty.call(followUp.json ?? {}, 'answer'), answer: followUp.json?.answer ?? null },
      answersDelivered,
      filePresent: file.missing !== true,
      fileAnswer: file.ok ? file.value.answer : null,
      fileMark: file.missing ? '(missing)' : file.ok ? file.value.answer : '(unparsable)',
      leftovers: leftoversIn(scratch.directory),
    });
  }
  readings.concurrentCross = {
    rounds: crossRounds,
    doubleDelivered: crossRounds.filter((row) => row.answersDelivered !== 1).length,
    tornFiles: crossRounds.filter((row) => row.fileMark === '(unparsable)').length,
    recordedButNoFile: crossRounds.filter((row) => row.post.state === 'recorded' && row.filePresent !== true).length,
    answeredButFileStillThere: crossRounds.filter((row) => row.read.state === 'answered' && row.filePresent === true).length,
    deliveredAnswerMismatch: crossRounds.filter((row) => {
      if (row.filePresent !== true || typeof row.fileAnswer !== 'string') return false; // consumed by the winning GET: nothing left to compare
      const delivered = [row.read.answer, row.followUp.answer].filter((value) => typeof value === 'string');
      return delivered.some((value) => value !== row.fileAnswer);
    }).length,
    deliveredNotALiteral: crossRounds.filter((row) => [row.read.answer, row.followUp.answer].some((value) => value !== null && value !== 'allowed-once' && value !== 'rejected')).length,
    illegalPairs: crossRounds.filter((row) => {
      const recorded = row.post.state === 'recorded' && row.post.status === 200;
      const conflicted = row.post.state === 'already-answered' && row.post.status === 409;
      const readPending = row.read.state === 'pending';
      const readAnswered = row.read.state === 'answered';
      return !((recorded && readPending) || (conflicted && readAnswered));
    }).length,
    allInFlight: crossRounds.every((row) => row.inFlight.postSettled === false && row.inFlight.pollSettled === false),
    leftoverRounds: crossRounds.filter((row) => row.leftovers.length > 0).length,
  };
  for (const row of crossRounds) {
    console.log(`    · r3 cross round ${String(row.round).padStart(2)}: POST ${String(row.post.status)}/${String(row.post.state)} · GET ${String(row.read.status)}/${String(row.read.state)} · follow-up ${String(row.followUp.state)} · delivered=${String(row.answersDelivered)} file@read-time=${String(row.fileMark)} tmp=${JSON.stringify(row.leftovers)}`);
  }
  report.same('r3/G1 (cross): no round delivered the decision twice', readings.concurrentCross.doubleDelivered, 0);
  report.same('r3/G1 (cross): no round produced an unparsable answer file (file read BEFORE the follow-up)', readings.concurrentCross.tornFiles, 0);
  report.same('r3/G1 (cross): a recorded POST always leaves a readable file behind', readings.concurrentCross.recordedButNoFile, 0);
  report.same('r3/G1 (cross): an answered GET always leaves no file behind (it consumed it)', readings.concurrentCross.answeredButFileStillThere, 0);
  report.same('r3/G1 (cross): every delivered answer equals the answer that was still in the file', readings.concurrentCross.deliveredAnswerMismatch, 0);
  report.same('r3/G1 (cross): every delivered answer is one of the two literals', readings.concurrentCross.deliveredNotALiteral, 0);
  report.same('r3/G1 (cross): every round is one of the two legal outcomes', readings.concurrentCross.illegalPairs, 0);
  report.check('r3/G1 (cross): POST and GET were in flight together in every round', readings.concurrentCross.allInFlight === true, JSON.stringify(crossRounds.map((row) => row.inFlight)));
  report.same('r3/G1 (cross): no leftover files', readings.concurrentCross.leftoverRounds, 0);
  report.note(
    'r3/G1 (cross) branch distribution',
    `${JSON.stringify(crossRounds.reduce((acc, row) => { const key = `${String(row.post.state)}/${String(row.read.state)}`; acc[key] = (acc[key] ?? 0) + 1; return acc; }, {}))} — the free-running race always resolves the same way (the GET has no body to read), so the OTHER legal branch is forced below with a seeded file.`,
  );

  /* 7l2 — the other legal cross outcome, forced with a seeded answer file.
   * Same instrument (both requests dispatched in one synchronous block, both provably
   * unsettled), but the answer file already exists, so the pair must be
   * POST 409 already-answered + GET 200 answered, one delivery, one well-formed file. */
  const seededRounds = [];
  for (let round = 0; round < 20; round += 1) {
    const token = newToken();
    await callRoute(rig.bridge, { method: 'POST', url: ROUTE, body: { token, key: `g1s-${String(round)}`, sessionId: 'g1', toolName: 'bash' } });
    await settle(2);
    const seeded = round % 2 === 0 ? 'allowed-once' : 'rejected';
    writeFileSync(join(scratch.directory, `${token}.json`), `${JSON.stringify({ version: 1, token, answer: seeded, answeredAt: new Date(clock).toISOString() })}\n`, 'utf8');
    const post = dispatchRoute(rig.bridge, { method: 'POST', url: `${ROUTE}/answer`, body: { token, answer: seeded === 'allowed-once' ? 'rejected' : 'allowed-once' } });
    const poll = dispatchRoute(rig.bridge, { method: 'GET', url: `${ROUTE}/answer?token=${token}` });
    const inFlight = { postSettled: post.state.settled, pollSettled: poll.state.settled };
    const [written, read] = await Promise.all([post.settled, poll.settled]);
    const followUp = await callRoute(rig.bridge, { method: 'GET', url: `${ROUTE}/answer?token=${token}` });
    seededRounds.push({
      round,
      inFlight,
      seeded,
      post: { status: written.status, state: written.json?.state },
      read: { status: read.status, state: read.json?.state, answer: read.json?.answer ?? null },
      followUp: { state: followUp.json?.state, hasAnswer: Object.prototype.hasOwnProperty.call(followUp.json ?? {}, 'answer') },
      answersDelivered: [read, followUp].filter((response) => response.json?.state === 'answered').length,
      fileAfter: readAnswerFile(join(scratch.directory, `${token}.json`)).missing ? '(gone)' : '(still there)',
      leftovers: leftoversIn(scratch.directory),
    });
  }
  readings.concurrentCrossSeeded = {
    rounds: seededRounds,
    wrongPost: seededRounds.filter((row) => row.post.status !== 409 || row.post.state !== 'already-answered').length,
    wrongRead: seededRounds.filter((row) => row.read.state !== 'answered' || row.read.answer !== row.seeded).length,
    deliveredTwice: seededRounds.filter((row) => row.answersDelivered !== 1).length,
    seededAnswerKept: seededRounds.filter((row) => row.read.answer !== row.seeded).length,
    fileLeftBehind: seededRounds.filter((row) => row.fileAfter !== '(gone)').length,
    allInFlight: seededRounds.every((row) => row.inFlight.postSettled === false && row.inFlight.pollSettled === false),
    leftoverRounds: seededRounds.filter((row) => row.leftovers.length > 0).length,
  };
  for (const row of seededRounds.slice(0, 4)) {
    console.log(`    · r3 seeded round ${String(row.round)}: POST ${String(row.post.status)}/${String(row.post.state)} · GET ${String(row.read.status)}/${String(row.read.state)}/${String(row.read.answer)} (seeded ${String(row.seeded)}) · follow-up ${String(row.followUp.state)} · delivered=${String(row.answersDelivered)} · file ${String(row.fileAfter)} tmp=${JSON.stringify(row.leftovers)}`);
  }
  report.same('r3/G1 (seeded cross): a concurrent POST against an existing answer is always 409', readings.concurrentCrossSeeded.wrongPost, 0);
  report.same('r3/G1 (seeded cross): the racing GET delivers the SEEDED answer (the first one wins)', readings.concurrentCrossSeeded.wrongRead, 0);
  report.same('r3/G1 (seeded cross): the seeded answer is never replaced by the loser', readings.concurrentCrossSeeded.seededAnswerKept, 0);
  report.same('r3/G1 (seeded cross): exactly one delivery across the pair plus the follow-up', readings.concurrentCrossSeeded.deliveredTwice, 0);
  report.same('r3/G1 (seeded cross): the consumed file is gone afterwards', readings.concurrentCrossSeeded.fileLeftBehind, 0);
  report.check('r3/G1 (seeded cross): both requests were in flight together in every round', readings.concurrentCrossSeeded.allInFlight === true, JSON.stringify(seededRounds.map((row) => row.inFlight)));
  report.same('r3/G1 (seeded cross): no leftover files', readings.concurrentCrossSeeded.leftoverRounds, 0);

  writeFileSync(join(EVIDENCE_DIR, 'r25-t16-concurrent-rounds.json'), JSON.stringify({ writeRounds: rounds, readRounds, crossRounds, seededCrossRounds: seededRounds }, null, 2), 'utf8');
  rmSync(scratch.home, { recursive: true, force: true });
}

/* ==================================================== 8 · client trigger matrix */

report.group('8. the four DOM states, one request each way (and the return to the foreground)');

const runTriggerCase = async ({ hidden, hasFocus }) => {
  const rig = bundleFor({ hidden, hasFocus });
  const { interaction, answers } = makeInteraction(`probe-key-${String(hidden)}-${String(hasFocus)}`);
  rig.host.api.publish([[interaction.sessionId, interaction]]);
  await settle(14);
  const nativePost = rig.fetchRecorder.countNative('POST');
  const nativeAny = rig.fetchRecorder.nativeCalls().length;
  const state = rig.bundle.diagnostics()?.nativeToast?.state?.() ?? null;
  closeBundle(rig);
  return { nativePost, nativeAny, answers, state, calls: rig.fetchRecorder.calls.map((call) => `${call.method} ${call.url}`) };
};

const visibleFocused = await runTriggerCase({ hidden: false, hasFocus: true });
readings.triggerMatrix = {};
readings.triggerMatrix['visible+focused'] = visibleFocused;
report.same('visible AND focused: not one raise request leaves the page', visibleFocused.nativePost, 0);
report.check('visible AND focused: the native route is never called at all', visibleFocused.nativeAny === 0, JSON.stringify(visibleFocused.calls));
const visibleUnfocused = await runTriggerCase({ hidden: false, hasFocus: false });
readings.triggerMatrix['visible+unfocused'] = visibleUnfocused;
report.same('visible but unfocused: exactly one raise request', visibleUnfocused.nativePost, 1);
const hiddenUnfocused = await runTriggerCase({ hidden: true, hasFocus: false });
readings.triggerMatrix['hidden+unfocused'] = hiddenUnfocused;
report.same('hidden and unfocused: exactly one raise request', hiddenUnfocused.nativePost, 1);
const hiddenFocused = await runTriggerCase({ hidden: true, hasFocus: true });
readings.triggerMatrix['hidden+focused'] = hiddenFocused;
report.same('hidden is enough on its own: exactly one raise request', hiddenFocused.nativePost, 1);

/* 8b — returning to the foreground revokes what is still live */
{
  const rig = bundleFor({ hidden: true, hasFocus: false });
  const { interaction, answers } = makeInteraction('probe-key-revoke');
  rig.host.api.publish([[interaction.sessionId, interaction]]);
  await settle(14);
  const raiseCall = rig.fetchRecorder.calls.find((call) => call.url === ROUTE && call.method === 'POST') ?? null;
  const stateBefore = rig.bundle.diagnostics()?.nativeToast?.state?.() ?? null;
  report.same('the token was minted with 32 lowercase hex characters', TOKEN_PATTERN.test(String(raiseCall?.body?.token)), true);
  report.same('the raise body carries the key the page published', raiseCall?.body?.key, 'probe-key-revoke');
  report.same('one live token before returning to the foreground', stateBefore?.tokens?.length, 1);
  rig.bundle.document.hidden = false;
  rig.bundle.document.fire('visibilitychange');
  await settle(14);
  const revoke = rig.fetchRecorder.calls.find((call) => call.url === `${ROUTE}/revoke`) ?? null;
  report.check('coming back to a visible page sends a revoke', revoke !== null, JSON.stringify(rig.fetchRecorder.calls.map((call) => `${call.method} ${call.url}`)));
  report.deep('the revoke carries exactly the live token', revoke?.body?.tokens, [raiseCall?.body?.token]);
  report.same('the token is dropped after the revoke', rig.bundle.diagnostics()?.nativeToast?.state?.()?.tokens?.length, 0);
  report.same('the answer was never invented by the page', answers.length, 0);
  report.same('the page subscribes to NOTHING on the approval waterfall', rig.host.log.remoteSubs.length, 0);
  closeBundle(rig);
}

/* 8c — the window focus event revokes too, and blur alone does not */
{
  const rig = bundleFor({ hidden: true, hasFocus: false });
  const { interaction } = makeInteraction('probe-key-focus');
  rig.host.api.publish([[interaction.sessionId, interaction]]);
  await settle(14);
  rig.windowEvents.fire('blur');
  await settle(6);
  report.same('blur alone sends nothing', rig.fetchRecorder.calls.filter((call) => call.url === `${ROUTE}/revoke`).length, 0);
  report.same('blur is only counted', rig.bundle.diagnostics()?.nativeToast?.state?.()?.counters?.blurs, 1);
  rig.windowEvents.fire('focus');
  await settle(14);
  report.check('the window focus event revokes the live token', rig.fetchRecorder.calls.filter((call) => call.url === `${ROUTE}/revoke`).length === 1, JSON.stringify(rig.fetchRecorder.calls.map((call) => `${call.method} ${call.url}`)));
  report.check('the window listeners are really bound (focus and blur exist)', rig.windowEvents.count() >= 2, `bound window listeners: ${String(rig.windowEvents.count())}`);
  closeBundle(rig);
}

/* ==================================================== 9 · default-off zero effects */

report.group('9. default off: no request, no process, no registry write, no file');

{
  const rig = bundleFor({ hidden: true, hasFocus: false, nativeToast: false });
  const { interaction, answers } = makeInteraction('probe-key-off');
  rig.host.api.publish([[interaction.sessionId, interaction]]);
  await settle(14);
  readings.defaultOff = { calls: rig.fetchRecorder.calls.length, nativeCalls: rig.fetchRecorder.nativeCalls().length, state: rig.bundle.diagnostics()?.nativeToast?.state?.() ?? null, pendingSubscribers: rig.host.log.pendingSubscribers };
  report.same('with the switch off, a waiting approval sends NOTHING to the native route', readings.defaultOff.nativeCalls, 0);
  report.check('... and the only request the page made is the unrelated session table', rig.fetchRecorder.calls.every((call) => !call.url.startsWith(ROUTE)), JSON.stringify(rig.fetchRecorder.calls.map((call) => `${call.method} ${call.url}`)));
  report.same('the page reads the switch as off', readings.defaultOff.state?.enabled, false);
  report.same('the approval is still observed exactly once (no second subscription, no lost chime)', rig.host.log.pendingSubscribers, 1);
  report.same('nothing was answered behind the user\'s back', answers.length, 0);
  closeBundle(rig);
}
{
  const rig = bundleFor({ hidden: true, hasFocus: false, scopeValue: { enabled: true, volume: 70, tone: 'chime' } });
  const { interaction } = makeInteraction('probe-key-missing-field');
  report.same('a scope without the field behaves as off (that is the pre-describe frame)', rig.bundle.diagnostics()?.nativeToast?.state?.()?.enabled, false);
  rig.host.api.publish([[interaction.sessionId, interaction]]);
  await settle(14);
  report.check('... and it sent nothing to the native route even with an approval waiting', rig.fetchRecorder.nativeCalls().length === 0, JSON.stringify(rig.fetchRecorder.calls.map((call) => `${call.method} ${call.url}`)));
  closeBundle(rig);
}
{
  const registered = [];
  const stubCtx = {
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    get: () => undefined,
    inject: (names, callback) => callback({ logger: stubCtx.logger, effect: (cb) => registered.push(cb()), webServer: { port: 45127, register: () => {} } }),
    webServer: { port: 45127, register: () => {} },
  };
  bridgeModule.registerNativeToastRoutes(stubCtx);
  await settle(2);
  const home = join(SCRATCH_HOME, 'default-off-host');
  rmSync(home, { recursive: true, force: true });
  const spawns = makeSpawnRecorder(() => 0);
  const platform = platformModule.createNativeToastPlatform({ home, spawn: spawns.spawn, exists: () => true, env: process.env, now: () => clock, log: () => {} });
  const bridge = bridgeModule.createNativeToastBridge({ platform, log: () => {} });
  const token = newToken();
  const answer = await callRoute(bridge, { method: 'POST', url: ROUTE, body: { token, key: 'koff', sessionId: 'soff', toolName: 'bash' } });
  await settle(4);
  report.same('the Host half with no settings scope refuses to raise', answer.json?.reason, 'disabled');
  report.same('the Host half started no process while off', spawns.calls.length, 0);
  report.same('the Host half created no directory while off', existsSync(join(home, 'approval-chime')), false);
  report.check('no lib module mentions reg.exe, HKCU or HKLM', !/reg\.exe|HKCU|HKLM/i.test(CLIENT_SOURCE + HOST_SOURCE + BRIDGE_SOURCE + PLATFORM_SOURCE), 'grep over the four lib modules');
  rmSync(home, { recursive: true, force: true });
}

/* ============================================ 10 · the client drops an unknown key */

report.group('10. an answer for a key the page no longer has is discarded (with a control)');

const runDeliveryCase = async (keepKey) => {
  const rig = bundleFor({ hidden: true, hasFocus: false });
  const recorder = makeFetchRecorder((call) => {
    if (call.url === ROUTE && call.method === 'POST') return { status: 200, body: { ok: true, state: 'raised', tag: `appr-${String(call.body?.token ?? '').slice(0, 11)}` } };
    if (call.url === `${ROUTE}/revoke`) {
      return { status: 200, body: { ok: true, results: call.body.tokens.map((token) => ({ token, state: 'answered', answer: 'allowed-once' })) } };
    }
    if (call.url.startsWith(`${ROUTE}/answer`)) return { status: 200, body: { ok: true, state: 'pending' } };
    return { status: 404, body: { ok: false, error: 'unknown path' } };
  });
  rig.bundle.sandbox.fetch = recorder.fetch;
  const { interaction, answers } = makeInteraction(keepKey ? 'probe-key-kept' : 'probe-key-gone');
  rig.host.api.publish([[interaction.sessionId, interaction]]);
  await settle(14);
  if (keepKey) {
    // The approval is STILL waiting, and the window comes back: the revoke is the last read,
    // so the decision has to reach the page's own approval.
    rig.bundle.document.hidden = false;
    rig.bundle.document.fire('visibilitychange');
  } else {
    // The approval is gone from the live snapshot (settled in the page, or aborted) while an
    // answer is waiting host-side: the decision must be discarded, never handed to anything.
    rig.host.api.publish([]);
  }
  await settle(16);
  const state = rig.bundle.diagnostics()?.nativeToast?.state?.() ?? null;
  const revokes = recorder.calls.filter((call) => call.url === `${ROUTE}/revoke`).length;
  closeBundle(rig);
  return { answers, state, revokes };
};

const control = await runDeliveryCase(true);
readings.deliveryControl = { answers: control.answers, revokes: control.revokes, counters: control.state?.counters };
report.same('CONTROL: the return to the foreground revokes the token', control.revokes, 1);
report.deep('CONTROL: the decision carried by the revoke reaches the page\'s own answer()', control.answers, ['allowed-once']);
report.same('CONTROL: it is counted as delivered', control.state?.counters?.answered, 1);
const dropped = await runDeliveryCase(false);
readings.deliveryDropped = { answers: dropped.answers, revokes: dropped.revokes, counters: dropped.state?.counters };
report.same('the unknown key is revoked as well', dropped.revokes, 1);
report.same('the unknown key is DISCARDED: answer() is never called', dropped.answers.length, 0);
report.same('the discard is counted as a drop, not as an answer', dropped.state?.counters?.dropped, 1);
report.same('nothing was answered', dropped.state?.counters?.answered, 0);
report.same('no token is left behind', dropped.state?.tokens?.length, 0);

/* ==================================================== 11 · independence checks */

report.group('10b. t11 poll semantics, reproduced with this probe own instruments');

/**
 * One client rig for the two t11 semantics. The responder is per-case so the poll
 * can be made to fail transiently (a rejected fetch — the real exception entry of
 * `nativeRequest`) or to answer the Host's own `skipped` envelope.
 */
const runPollRig = async (responder) => {
  const rig = bundleFor({ hidden: true, hasFocus: false });
  const recorder = makeFetchRecorder(responder);
  rig.bundle.sandbox.fetch = recorder.fetch;
  const { interaction, answers } = makeInteraction('probe-key-t11');
  rig.host.api.publish([[interaction.sessionId, interaction]]);
  await settle(14);
  const polls = () => recorder.calls.filter((call) => call.url.startsWith(`${ROUTE}/answer`));
  const revokes = () => recorder.calls.filter((call) => call.url === `${ROUTE}/revoke`);
  return { rig, recorder, answers, polls, revokes, state: () => rig.bundle.diagnostics()?.nativeToast?.state?.() ?? null };
};

const raisedAnswer = (call) =>
  call.url === ROUTE && call.method === 'POST'
    ? { status: 200, body: { ok: true, state: 'raised', tag: `appr-${String(call.body?.token ?? '').slice(0, 11)}` } }
    : null;

/* ① a transient failure of the poll must NOT abandon the token (t11's first verb) */
{
  let failNextPoll = false;
  const rig = await runPollRig((call) => {
    const raise = raisedAnswer(call);
    if (raise !== null) return raise;
    if (call.url.startsWith(`${ROUTE}/answer`)) return failNextPoll ? { throws: true } : { status: 200, body: { ok: true, state: 'pending' } };
    if (call.url === `${ROUTE}/revoke`) return { status: 200, body: { ok: true, results: call.body.tokens.map((token) => ({ token, state: 'pending' })) } };
    return { status: 404, body: { ok: false, error: 'unknown path' } };
  });
  const before = rig.state();
  report.same('CONTROL ①: one live token before the failure', before?.tokens?.length, 1);
  report.same('CONTROL ①: its timer is armed (t11 exposes this on the token snapshot)', before?.tokens?.[0]?.timer, true);
  report.same('CONTROL ①: no poll has been sent yet', rig.polls().length, 0);
  failNextPoll = true;
  rig.rig.timers.fireAll();
  await settle(16);
  const afterFailure = rig.state();
  readings.transientPoll = { before: { tokens: before?.tokens, counters: before?.counters }, afterFailure: { tokens: afterFailure?.tokens, counters: afterFailure?.counters, error: afterFailure?.error }, polls: rig.polls().length, revokes: rig.revokes().length };
  report.same('① after a rejected poll the token is STILL live', afterFailure?.tokens?.length, 1);
  report.same('① ... and its timer is STILL armed (the next tick is still scheduled)', afterFailure?.tokens?.[0]?.timer, true);
  report.same('① ... the transient failure added exactly one diagnostic count', afterFailure?.counters?.failed, 1);
  report.same('① ... nothing was delivered', afterFailure?.counters?.answered, 0);
  report.same('① ... nothing was revoked', rig.revokes().length, 0);
  report.check('① ... and the failure was recorded as a diagnostic line', typeof afterFailure?.error === 'string' && afterFailure.error.length > 0, String(afterFailure?.error));
  failNextPoll = false;
  const pollsBeforeRecovery = rig.polls().length;
  rig.rig.timers.fireAll();
  await settle(16);
  readings.transientPoll.pollsAfterRecovery = rig.polls().length;
  report.same('① the NEXT tick still asks the Host', rig.polls().length, pollsBeforeRecovery + 1);
  report.same('① the token survives the recovery tick', rig.state()?.tokens?.length, 1);
  report.same('① the page never invented an answer', rig.answers.length, 0);
  closeBundle(rig.rig);
}

/* ② a poll that answers 200 {state:"skipped"} abandons the token at once (t11's second verb) */
{
  let skippedNextPoll = false;
  const rig = await runPollRig((call) => {
    const raise = raisedAnswer(call);
    if (raise !== null) return raise;
    if (call.url.startsWith(`${ROUTE}/answer`)) return skippedNextPoll ? { status: 200, body: { ok: true, state: 'skipped', reason: 'disabled' } } : { status: 200, body: { ok: true, state: 'pending' } };
    if (call.url === `${ROUTE}/revoke`) return { status: 200, body: { ok: true, results: call.body.tokens.map((token) => ({ token, state: 'pending' })) } };
    return { status: 404, body: { ok: false, error: 'unknown path' } };
  });
  report.same('CONTROL ②: one live token before the skipped poll', rig.state()?.tokens?.length, 1);
  skippedNextPoll = true;
  rig.rig.timers.fireAll();
  await settle(16);
  const afterSkip = rig.state();
  readings.skippedPoll = { tokens: afterSkip?.tokens, counters: afterSkip?.counters, polls: rig.polls().length, revokes: rig.revokes().length };
  report.same('② the skipped poll drops the token immediately', afterSkip?.tokens?.length, 0);
  report.same('② ... counted as a skip, not as a failure', afterSkip?.counters?.skipped, 1);
  report.same('② ... and as nothing else', afterSkip?.counters?.failed, 0);
  report.same('② ... no revoke is sent for it (the token is gone on purpose)', rig.revokes().length, 0);
  const requestsBefore = rig.recorder.calls.length;
  rig.rig.timers.fireAll();
  await settle(12);
  report.same('② ... the timer is gone, so a further tick sends NOTHING', rig.recorder.calls.length, requestsBefore);
  report.same('② exactly one poll happened in total', rig.polls().length, 1);
  report.same('② the page never invented an answer', rig.answers.length, 0);
  closeBundle(rig.rig);
}

/* ②b the raise-side `skipped` verb (pre-existing, re-measured here so both verbs are on record) */
{
  const rig = await runPollRig((call) => {
    if (call.url === ROUTE && call.method === 'POST') return { status: 200, body: { ok: true, state: 'skipped', reason: 'not-installed' } };
    if (call.url.startsWith(`${ROUTE}/answer`)) return { status: 200, body: { ok: true, state: 'pending' } };
    return { status: 404, body: { ok: false, error: 'unknown path' } };
  });
  const state = rig.state();
  readings.raiseSkipped = { tokens: state?.tokens, counters: state?.counters, polls: rig.polls().length, revokes: rig.revokes().length };
  report.same('②b a raise answered "skipped" registers no token', state?.tokens?.length, 0);
  report.same('②b ... counted as skipped', state?.counters?.skipped, 1);
  report.same('②b ... and it never polls afterwards', rig.polls().length, 0);
  report.same('②b ... and never revokes', rig.revokes().length, 0);
  report.same('②b the refusal is also the freshest install verdict on the page', state?.status, 'not-installed');
  closeBundle(rig.rig);
}

report.group('10c. r5: the settings page — the notification block is its own group, and it is LAST');

/* t22 moved the block to the end of the page and gave it a heading. This section
 * mounts the section component with this probe's own renderer and reads the RENDER
 * TREE: order, counts, and which control the aria-label points at. */
{
  const rig = bundleFor({ hidden: false, hasFocus: true });
  const registrations = rig.host.log.slotRegistrations ?? [];
  /** Every node in `root` (document order) whose className is exactly `name`. */
  const byClassOf = (root, name) => {
    const found = [];
    walk(root, (node) => {
      if (node.props !== undefined && node.props.className === name) found.push(node);
    });
    return found;
  };
  const sectionEntries = registrations.filter((entry) => entry.entry?.name === 'settings.section');
  const section = sectionEntries[0]?.component ?? null;
  report.same('the page is still registered exactly once as a settings.section', sectionEntries.length, 1);
  report.same('the section id is the private one', sectionEntries[0]?.entry?.id, 'approval-chime');
  report.same('the section order is unchanged', sectionEntries[0]?.entry?.order, 16);
  report.same('the section keeps its own locale namespace', sectionEntries[0]?.entry?.locale, 'approval-chime');

  const dictionaries = (rig.host.log.localeRegistrations ?? []).filter((entry) => entry.ns === 'approval-chime');
  const zh = dictionaries[0]?.dictionary?.zh ?? {};
  const en = dictionaries[0]?.dictionary?.en ?? {};
  const keyOfValue = (dict, pattern) => Object.keys(dict).find((key) => pattern.test(String(dict[key]))) ?? null;
  const groupKey = keyOfValue(zh, /Windows 系统通知/);
  const switchKey = keyOfValue(zh, /待审批时弹 Windows 系统通知/);
  readings.settingsPage = { groupKey, switchKey, zhKeys: Object.keys(zh).length, enKeys: Object.keys(en).length };
  report.check('the zh dictionary carries the group heading', groupKey !== null, String(groupKey));
  report.check('the en dictionary carries the same group key (no one-sided key)', groupKey !== null && Object.prototype.hasOwnProperty.call(en, groupKey), JSON.stringify({ groupKey, enHas: groupKey !== null && Object.prototype.hasOwnProperty.call(en, groupKey) }));
  report.check('the zh dictionary carries the switch label', switchKey !== null, String(switchKey));
  report.check('the en dictionary carries the same switch key', switchKey !== null && Object.prototype.hasOwnProperty.call(en, switchKey), JSON.stringify({ switchKey, enHas: switchKey !== null && Object.prototype.hasOwnProperty.call(en, switchKey) }));

  if (section === null) {
    report.fail('the settings section component is missing from the registrations', 'cannot mount the page');
  } else {
    const view = mount(rig.bundle.reactRuntime, section, {});
    const tree = view.render();
    const ordered = [];
    walk(tree, (node) => ordered.push(node));
    const at = (node) => ordered.indexOf(node);
    const byClass = (name) => ordered.filter((node) => node.props !== undefined && node.props.className === name);
    const checkboxes = ordered.filter((node) => node.type === 'input' && node.props?.type === 'checkbox');
    const rows = byClass('dacRow');
    const groupBoxes = byClass('dacGroupBox');
    const groupHeadings = byClass('dacGroup');
    const stats = byClass('dacStats');

    readings.settingsPage.tree = {
      checkboxes: checkboxes.length,
      rows: rows.length,
      groupBoxes: groupBoxes.length,
      groupHeadings: groupHeadings.length,
      stats: stats.length,
      rowOrder: rows.map((row) => at(row)),
      groupBoxAt: groupBoxes[0] === undefined ? null : at(groupBoxes[0]),
      statsAt: stats[0] === undefined ? null : at(stats[0]),
      headingText: groupHeadings[0] === undefined ? null : allText(groupHeadings[0]),
      switchLabels: checkboxes.map((node) => node.props?.['aria-label'] ?? null),
      switchChecked: checkboxes.map((node) => node.props?.checked ?? null),
    };
    report.same('the page still carries exactly two switches', checkboxes.length, 2);
    report.same('the notification block is ONE group box', groupBoxes.length, 1);
    report.same('that group has exactly one heading', groupHeadings.length, 1);
    report.same('the heading carries the zh group copy', readings.settingsPage.tree.headingText, zh[groupKey]);
    report.same(
      'the aria-label still locates the notification switch (by its own zh copy)',
      checkboxes.filter((node) => node.props?.['aria-label'] === zh[switchKey]).length,
      1,
    );
    report.check(
      'the chime switch still carries the chime copy',
      typeof checkboxes[0]?.props?.['aria-label'] === 'string' && checkboxes[0].props['aria-label'].includes('提示音'),
      String(checkboxes[0]?.props?.['aria-label']),
    );
    const groupBox = groupBoxes[0] ?? null;
    const insideGroup = groupBox === null ? [] : checkboxes.filter((node) => at(node) > at(groupBox));
    report.same('the notification switch is inside the group (the only checkbox after it)', insideGroup.length, 1);
    report.same('it is a switch, not a bare checkbox', insideGroup[0]?.props?.role, 'switch');
    const chimeRows = rows.filter((row) => groupBox === null || at(row) < at(groupBox));
    const rowsAfterGroup = rows.filter((row) => groupBox === null || at(row) > at(groupBox));
    report.same('the chime side still has exactly its three rows', chimeRows.length, 3);
    report.check(
      'all three chime rows come BEFORE the group box',
      chimeRows.length === 3 && chimeRows.every((row) => at(row) < at(groupBox)),
      JSON.stringify({ chimeRowOrder: chimeRows.map((row) => at(row)), groupBoxAt: at(groupBox) }),
    );
    report.same('the notification row is the ONLY row after the group box (it lives inside it)', rowsAfterGroup.length, 1);
    report.same('... and that row is the one carrying the notification switch', rowsAfterGroup[0]?.children?.length >= 1, true);
    report.check(
      'the group box comes after the stats block too',
      stats.length > 0 && at(stats[0]) < at(groupBox),
      JSON.stringify({ statsAt: at(stats[0]), groupBoxAt: at(groupBox) }),
    );
    const card = ordered.find((node) => node.props !== undefined && node.props.className === 'dacCard') ?? null;
    const cardChildren = (card?.children ?? []).filter((child) => child !== null && typeof child === 'object');
    report.check(
      'the group box is the LAST child of the card',
      cardChildren.length > 0 && cardChildren[cardChildren.length - 1] === groupBox,
      JSON.stringify(cardChildren.map((child) => child.props?.className ?? child.type)),
    );
    const groupChildrenStructure = (groupBox?.children ?? []).filter((child) => child !== null && typeof child === 'object').map((child) => `${String(child.type)}.${String(child.props?.className ?? '')}`);
    report.deep('the group structure is heading + switch row + status line + hint', groupChildrenStructure, ['h3.dacGroup', 'div.dacRow', 'div.dacHint', 'div.dacHint']);

    /* The switch's own default. It must FOLLOW THE SETTING, not be hard-wired: read the
     * same page twice, once with the switch off (the shipped default) and once on. */
    const offRig = bundleFor({ hidden: false, hasFocus: true, nativeToast: false });
    const offSection = (offRig.host.log.slotRegistrations.find((entry) => entry.entry?.name === 'settings.section') ?? {}).component ?? null;
    if (offSection === null) {
      report.fail('the second mount could not find the settings section', 'needed for the default-off reading');
    } else {
      const offView = mount(offRig.bundle.reactRuntime, offSection, {});
      const offTree = offView.render();
      const offCheckboxes = [];
      walk(offTree, (node) => {
        if (node.type === 'input' && node.props?.type === 'checkbox') offCheckboxes.push(node);
      });
      const offNative = offCheckboxes.find((node) => node.props?.['aria-label'] === zh[switchKey]) ?? null;
      readings.settingsPage.defaultOff = { checked: offNative?.props?.checked ?? null, ariaChecked: offNative?.props?.['aria-checked'] ?? null, dataOn: byClassOf(offTree, 'dacSwitch')[1]?.props?.['data-on'] ?? null };
      report.same('with the setting OFF the notification switch renders unchecked', offNative?.props?.checked ?? null, false);
      report.same('... and says so to assistive tech', offNative?.props?.['aria-checked'] ?? null, false);
      closeBundle(offRig);
    }
  }
  closeBundle(rig);
}

report.group('11. independence: the author suite, the independent probe-4, the stamp');

const hostHalfPath = join(PLUGIN_DIR, 'verify', 'host-half.test.mjs');
const hostHalfSource = readOrNull(hostHalfPath) ?? '';
const defaultLines = hostHalfSource.split(/\r?\n/).filter((line) => line.includes('report.deepEqual') && line.includes("tone: 'chime'"));
readings.hostHalfDefaultLines = defaultLines;
// 2026-10-01: the `robocopy /MIR` incident destroyed the original suite; the REBUILT file carries
// exactly ONE such single-line row (`verify/host-half.test.mjs:127` — the row at :133 became a
// multi-line call). Measured on the rebuilt bytes: 1. Before the incident it was 3, and a later
// rev-25 note already recorded 2; the count is a property of a file that no longer exists in its
// original form, so it is pinned to the file that IS on disk. The assertions below still pin the
// row's CONTENT (the four old keys byte for byte, the new key appended).
report.same('the Host suite carries its one literal single-line default-value row (rebuilt file)', defaultLines.length, 1);
report.check(
  'every one of them still spells the four old keys byte for byte, in the old order',
  defaultLines.every((line) => /enabled: true, volume: (70|33), tone: 'chime', custom: \[\]/.test(line)),
  JSON.stringify(defaultLines),
);
report.check(
  'the new key is APPENDED to those same objects (never substituted for an old one)',
  defaultLines.every((line) => /custom: \[\], nativeToast: false \}\);?$/.test(line.trim())),
  JSON.stringify(defaultLines),
);
report.check(
  'the fourth row still compares the exported defaults against the schema, so it cannot drift',
  hostHalfSource.includes("report.deepEqual('exported DEFAULTS match the schema', { ...plugin.DEFAULTS }, defaults)"),
  'the self-consistent row is left alone',
);
// The spelling on disk carries the space (`nativeToast: false`); the no-space form this row used to
// look for never appears in the rebuilt suite — the expectation is corrected to the real bytes.
report.same('the suite still spells the switch in its defaults row (nativeToast: false)', hostHalfSource.includes('nativeToast: false'), true);
const hostHalfRun = runToFile(process.execPath, [hostHalfPath], join(EVIDENCE_DIR, 'probe21-host-half.txt'), { cwd: PLUGIN_DIR });
const hostHalfCount = /(\d+)\/(\d+) checks passed/.exec(hostHalfRun.text ?? '');
readings.hostHalf = { exit: hostHalfRun.status, summary: hostHalfCount === null ? null : `${hostHalfCount[1]}/${hostHalfCount[2]}` };
report.same('the author Host suite still runs green', hostHalfRun.status, 0);
/* 126 is the rev-27/rev-28 baseline (rev-25 wrote 124): the settings-model round appended the two
 * default-value rows to the Host suite. Re-anchored to the measured value, not to a guess. */
report.same('the author Host suite still holds exactly 126 checks', readings.hostHalf.summary, '126/126');
const clientHalfRun = runToFile(process.execPath, [join(PLUGIN_DIR, 'verify', 'client-half.test.mjs')], join(EVIDENCE_DIR, 'probe21-client-half.txt'), { cwd: PLUGIN_DIR });
const clientHalfCount = /(\d+)\/(\d+) checks passed/.exec(clientHalfRun.text ?? '');
readings.clientHalf = { exit: clientHalfRun.status, summary: clientHalfCount === null ? null : `${clientHalfCount[1]}/${clientHalfCount[2]}` };
report.same('the author browser suite still runs green', clientHalfRun.status, 0);

const probeFourPath = join(PLUGIN_DIR, 'verify-independent', 'probe-4-host-half.mjs');
const probeFourSource = readOrNull(probeFourPath) ?? '';
readings.probeFour = { bytes: utf8NoBom.encode(probeFourSource).length, sha256: sha(probeFourSource) };
/* THE ROW THAT USED TO SIT HERE said the opposite: `tone: 'chime', custom: [] }` and NO
 * `nativeToast` anywhere -- true only while t4's pure append had not landed yet. It was
 * archived verbatim as `_raw/r25-evidence/archive/probe-21-native-toast.mjs.6002b747e4a58ac0.txt`
 * and is quoted in §24 of `docs/变异覆盖与残留红.md`. The replacement states the POST-append
 * bytes and is strictly narrower: the four rev-4 keys must still be spelled exactly twice,
 * unchanged, and the new key must be APPENDED after them (a substituted key would leave the
 * old four-key run short of two). */
report.check(
  'probe-4 pins the four rev-4 keys verbatim AND the appended nativeToast default (t4 pure append)',
  probeFourSource.includes("tone: 'chime', custom: [], nativeToast: false }")
    && (probeFourSource.match(/enabled: true, volume: 70, tone: 'chime', custom: \[\]/g) ?? []).length === 2,
  'the two rows at :116 and :117',
);
const probeFourRun = runToFile(process.execPath, [probeFourPath], join(EVIDENCE_DIR, 'probe21-probe-4.txt'), { cwd: PLUGIN_DIR });
const probeFourFailed = (probeFourRun.text ?? '').split(/\r?\n/).filter((line) => line.trim().startsWith('FAILED:'));
readings.probeFourRun = { exit: probeFourRun.status, failed: probeFourFailed.map((line) => line.trim()) };
/* The tolerant arm that used to close this block ("green, OR red in exactly those two rows")
 * is GONE on purpose: after the append, "exactly those two rows are red" is a shape no tree
 * is allowed to have any more, and a run that only LOOKS green (a truncated log, a probe that
 * gave up early) must not pass either. Both halves are asserted, and the raw FAILED lines are
 * kept in the readings. */
report.same('probe-4 exits 0 on this tree (t4 landed its pure append)', probeFourRun.status, 0);
report.check('probe-4 prints no FAILED: line at all', probeFourFailed.length === 0, `exit=${String(readings.probeFourRun.exit)} failures=${JSON.stringify(probeFourFailed)}`);
/* WHICH FILES THE RELEASE ROUND MAY HAVE MOVED. The two rows that used to sit here said
 * "no M/A/D entry under verify-independent/** at all" and "the only untracked entry is this
 * probe" -- true on the tree t7 wrote them against, where nobody had re-anchored yet, and
 * therefore unable to describe the state AFTER the round: rev-25's t4 necessarily edits the
 * revision literals inside these instruments (that is the round's whole job) and adds its own
 * re-anchor tool. Both rows are archived verbatim as
 * `_raw/r25-evidence/archive/probe-21-native-toast.mjs.6002b747e4a58ac0.txt` and quoted in §24.
 * What replaces them names EVERY path the round declared, so a silent edit anywhere else is
 * still an entry this run refuses; nothing may be STAGED (committing is the human's call); and
 * every file the round's own record lists must still hash to the byte image it predicted. */
const ROUND_REANCHORED = [
  'verify-independent/probe-2-gain-and-resources.mjs',
  'verify-independent/probe-3-card-and-scope.mjs',
  'verify-independent/probe-6-autoplay-replay.mjs',
  'verify-independent/probe-8-client-roster-render.mjs',
  'verify-independent/probe-17-r7-section.mjs',
  'verify-independent/probe-18-r10-sessions.mjs',
  'verify-independent/probe-19-r12-select-parity.mjs',
  'verify-independent/r15t2-independent-probe.mjs',
  'verify-independent/r15t6-mutation-table.mjs',
  'verify-independent/run-r13.ps1',
  'verify-independent/probe-21-native-toast.mjs',
];
/* probe-4 is NOT in that list: its edit is the one semantic update of the round (a documented
 * default key appended), it is hand-made, and its pre-edit bytes live in the same archive. */
const ROUND_HAND_EDITED = ['verify-independent/probe-4-host-half.mjs'];
const ROUND_NEW = [
  'verify-independent/r25-reanchor.mjs',
  'verify-independent/r25-t25-reanchor.mjs',
  'verify-independent/r29-reanchor.mjs',
];
/* Later rounds edited files under this directory outside the rev-25 rounds' declared set. They are
 * named here (from `git status --porcelain -- verify-independent` at the rev-29 close-out) so that an
 * entry nobody declared STILL fails: rev-27's re-anchor round, the rev-28 settings work and the
 * rev-29 desktop round (its two probes + the asar extractor) are the sources. */
const LATER_ROUNDS = [
  'verify-independent/kit/platform.mjs',
  'verify-independent/kit/rev4-kit.mjs',
  'verify-independent/probe-1-approval.mjs',
  'verify-independent/probe-5-contract.mjs',
  'verify-independent/probe-10-startup-resilience.mjs',
  'verify-independent/r13v-adv-probe-17-nonunique.mjs',
  'verify-independent/r13v-adv-probe-18-deadanchor.mjs',
  'verify-independent/r13v-adv-probe-18-drift.mjs',
  'verify-independent/r13v-adv-probe-18.mjs',
  'verify-independent/r13v-adv-probe-19-deadanchor.mjs',
  'verify-independent/desktop-runtime-extract.mjs',
  'verify-independent/probe-22-desktop-020.mjs',
  'verify-independent/r27-reanchor.mjs',
];
const declaredPaths = new Set(ROUND_REANCHORED.concat(ROUND_HAND_EDITED, ROUND_NEW, LATER_ROUNDS));
const gitStatus = runToFile('git', ['status', '--porcelain', '--', 'verify-independent'], join(EVIDENCE_DIR, 'probe21-git-verify-independent.txt'), { cwd: PLUGIN_DIR });
const gitEntries = (gitStatus.text ?? '')
  .split(/\r?\n/)
  .filter((line) => line.trim() !== '')
  .map((line) => ({ code: line.slice(0, 2), path: line.slice(3).trim() }));
const undeclared = gitEntries.filter((entry) => !declaredPaths.has(entry.path));
const staged = gitEntries.filter((entry) => entry.code[0] !== ' ' && entry.code[0] !== '?');
readings.gitVerifyIndependent = { exit: gitStatus.status, lines: gitEntries.map((entry) => `${entry.code} ${entry.path}`) };
report.check(
  'every entry git reports under verify-independent/** is one the rev-25 rounds or a later round declared',
  undeclared.length === 0,
  JSON.stringify(undeclared),
);
report.check(
  'nothing under verify-independent/** is staged (the round edits the worktree; committing is the human\'s call)',
  staged.length === 0,
  JSON.stringify(staged),
);
/* The re-anchor RECORDS: every pre-edit byte image is archived under `_raw/r25-evidence/archive/`
 * by content hash, and every post-edit hash was PREDICTED before the write and re-read after it.
 * This probe re-reads the records and measures the disk itself, so the round's claim is not taken
 * on trust. There are TWO batches: t4's (11 files, the first rev-25 close-out) and t25's (5 files,
 * the final merge -- t22 moved the notification block and t26 fixed the suite's PS 5.1 loop, so the
 * client image, the two suites that pin it and the rev-7 reviewer registration moved again). For
 * each declared path the LATEST record that names it is the one compared against the disk.
 * THIS probe is excluded from the hash comparison -- it is the file whose own rows move last, and
 * its anchors are asserted directly above -- and probe-4, whose edit the records do not cover. */
const asPosix = (value) => String(value).split('\\').join('/');
const REANCHOR_RECORDS = [
  'verify-independent/_raw/r25-evidence/r25-t1-reanchor.json',
  'verify-independent/_raw/r25-evidence/r25-t25-reanchor.json',
  'verify-independent/_raw/r29/release/r29-reanchor.json',
];
const reanchorBatches = REANCHOR_RECORDS.map((name) => {
  const raw = readOrNull(join(PLUGIN_DIR, name));
  let files = [];
  try {
    files = raw === null ? [] : (JSON.parse(raw).files ?? []);
  } catch {
    files = [];
  }
  /* A record only contributes an image when it carries an after-sha256 (r27's stores byte counts, so
   * it is evidence, not an image). An empty image is a gap, never a broken hit. */
  return {
    name: name.split('/').pop(),
    files: files
      .filter((entry) => typeof entry?.after?.sha256 === 'string')
      .map((entry) => ({ path: asPosix(entry.path), after: entry.after.sha256 })),
  };
});
const expectedImage = (path) => {
  /* newest batch first: t25 re-pinned five of the instruments t4 had pinned, so the t25 image is the
   * one the disk must match afterwards. */
  for (const batch of [...reanchorBatches].reverse()) {
    const hit = batch.files.find((entry) => entry.path === path);
    if (hit !== undefined) return { expected: hit.after, batch: batch.name };
  }
  return null;
};
const recordGaps = ROUND_REANCHORED.filter((path) => expectedImage(path) === null && path !== 'verify-independent/probe-21-native-toast.mjs');
const recordDrift = ROUND_REANCHORED
  .filter((path) => path !== 'verify-independent/probe-21-native-toast.mjs')
  .map((path) => ({ path, ...(expectedImage(path) ?? { expected: null, batch: null }) }))
  .filter((entry) => {
    try {
      return hashFile(entry.path) !== entry.expected;
    } catch {
      return true;
    }
  });
readings.reanchorRecord = {
  files: 'verify-independent/_raw/r25-evidence/r25-{t1,t25}-reanchor.json + _raw/r29/release/r29-reanchor.json',
  batches: reanchorBatches.map((batch) => ({ name: batch.name, files: batch.files.length })),
  gaps: recordGaps,
  drift: recordDrift,
};
report.check('the t4 re-anchor record is on disk and names 11 files', reanchorBatches[0].files.length === 11, `files=${reanchorBatches[0].files.length}`);
report.check('the t25 re-anchor record is on disk and names the 5 re-pinned files', reanchorBatches[1].files.length === 5, `files=${reanchorBatches[1].files.length}`);
report.check('the r29 re-anchor record is on disk and names the instruments it re-pinned', reanchorBatches[2] !== undefined && reanchorBatches[2].files.length >= 12, `files=${reanchorBatches[2]?.files.length}`);
report.check('the records cover every re-anchored instrument (this probe excluded on purpose)', recordGaps.length === 0, JSON.stringify(recordGaps));
report.check('every declared instrument still hashes to the byte image its latest record predicted', recordDrift.length === 0, JSON.stringify(recordDrift));

{
  const rig = bundleFor({ hidden: true, hasFocus: false, nativeToast: false });
  const revision = rig.bundle.diagnostics()?.revision ?? null;
  const revisionId = rig.bundle.diagnostics()?.revisionId ?? null;
  readings.revision = { revision, revisionId };
  report.check('the bundle stamp is the released rev-29 one (recorded, not judged)', typeof revision === 'string' && revision.startsWith('rev-29'), String(revision));
  report.same('the badge prints only the version id', revisionId, String(revision).split(' · ')[0]);
  closeBundle(rig);
}

const clientHalfSource = readOrNull(join(PLUGIN_DIR, 'verify', 'client-half.test.mjs')) ?? '';
const r24ClientHalfLog = readOrNull(join(PLUGIN_DIR, 'verify-independent', '_raw', 'r24-dev-client-half.txt')) ?? '';
const r24SwitchRows = r24ClientHalfLog
  .split(/\r?\n/)
  .filter((line) => line.includes('[PASS]') && /enable switch|painted switch track|carries exactly one knob/.test(line))
  .map((line) => line.replace(/^\[PASS\]\s*/, '').split(' — ')[0].trim());
readings.r24SwitchRows = r24SwitchRows;
report.same('the r24 (pre-rev-25) log pins three switch/track/knob rows', r24SwitchRows.length, 3);
report.check(
  'all three of those facts are still asserted on this page today',
  r24SwitchRows.every((name) => clientHalfSource.includes(name)),
  JSON.stringify(r24SwitchRows.filter((name) => !clientHalfSource.includes(name))),
);
report.check('the narrowed chime switch count is still asserted for the chime switch itself', clientHalfSource.includes("checkboxes.filter((node) => node.props['aria-label'] === '启用提示音').length, 1"), 'aria-label scoped count');
report.check('the page total is asserted right next to it, so gaining or losing a control is still visible', /checkboxes\.length, 2\)/.test(clientHalfSource), 'the page-level count');
report.check('the painted track and knob counts are still asserted, tied to the page total', clientHalfSource.includes('switchTracks.length, checkboxes.length') && clientHalfSource.includes('switchKnobs.length, switchTracks.length'), 'the three-drawn-facts chain');
const r24Count = /(\d+)\/(\d+) checks passed/.exec(r24ClientHalfLog);
readings.clientHalfGrowth = { r24: r24Count === null ? null : `${r24Count[1]}/${r24Count[2]}`, current: readings.clientHalf.summary };
report.check('the browser suite grew instead of shrinking (rev-25 added assertions)', r24Count !== null && Number(readings.clientHalf.summary.split('/')[1]) > Number(r24Count[2]), JSON.stringify(readings.clientHalfGrowth));

/* ==================================================== 12 · manual checklist */

report.group('12. the manual checklist is on disk and says what it cannot prove');

const manual = readOrNull(MANUAL_DOC);
readings.manualDoc = manual === null ? null : { bytes: utf8NoBom.encode(manual).length, sha256: sha(manual) };
report.check('docs/native-toast-人工验收.md exists', manual !== null, MANUAL_DOC);
report.check('it carries its own "what this page does not claim" section', (manual ?? '').includes('本页不声称的事'), 'the section title');
report.check('it separates the steps only the user can run', (manual ?? '').includes('只能由用户执行'), 'the user-only section');
report.check('it names the install command verbatim', (manual ?? '').includes('install.ps1'), 'install.ps1');
report.check('it names the selftest command verbatim', (manual ?? '').includes('selftest.ps1'), 'selftest.ps1');
report.check('it names the uninstall command verbatim', (manual ?? '').includes('uninstall.ps1'), 'uninstall.ps1');
report.check('it names the History read-back the contract pins', (manual ?? '').includes("History.GetHistory('Dsh.ApprovalChime.NativeToast')"), 'GetHistory');
report.check('it states that the banner itself cannot be machine-checked', /横幅|banner/.test(manual ?? '') && /人工|亲眼|手动/.test(manual ?? ''), 'the banner step');
report.check('it covers the click -> backfill -> approval chain', /点击/.test(manual ?? '') && /回填/.test(manual ?? '') && /审批/.test(manual ?? ''), 'the click chain');
report.check('it states the registry write side is user-executed', /普通 PowerShell|普通PowerShell|管理员/.test(manual ?? ''), 'the ordinary PowerShell step');
report.check('it front-loads falsifiable criteria, not just a command list', (manual ?? '').includes('可证伪') && (manual ?? '').includes('判据'), 'the criteria section');
report.check(
  'it carries the switch-off / stale-notification click criterion (fail-closed)',
  (manual ?? '').includes('1.6b') && /关掉开关后点旧通知/.test(manual ?? '') && /没有任何反应/.test(manual ?? ''),
  'criterion 3',
);
report.check('it states what a failure looks like for each criterion', /不成立的样子/.test(manual ?? ''), 'the falsification wording');
report.check(
  'it registers the r2 (t11) impact instead of silently skipping it',
  (manual ?? '').includes('人工清单不受影响') && (manual ?? '').includes('9D53743B') && (manual ?? '').includes('判据 3'),
  'the r2 impact section',
);

/* Cross-references between the manual page and the contract page are checked against
 * the contract page AT READ TIME — renumbering the contract is exactly how a page
 * ends up citing "§15 第 8 条" for what is now item 9 (t14 found that). */
const freezeSectionFifteen = (() => {
  const start = contractLineList.findIndex((line) => line.startsWith('## §15'));
  const end = contractLineList.findIndex((line, index) => index > start && line.startsWith('## §16'));
  if (start < 0) return [];
  return contractLineList
    .slice(start, end < 0 ? undefined : end)
    .filter((line) => /^\d+\.\s+\*\*/.test(line))
    .map((line, index) => ({ number: index + 1, text: line }));
})();
readings.freezeSectionFifteenItems = freezeSectionFifteen.map((item) => ({ number: item.number, text: item.text.slice(0, 60) }));
const sameUserItem = freezeSectionFifteen.find((item) => item.text.includes('不声称能防同一用户'));
const hardLinkItem = freezeSectionFifteen.find((item) => item.text.includes('硬链接'));
report.check('the contract page still has a §15 list this probe can number', freezeSectionFifteen.length >= 8, `${String(freezeSectionFifteen.length)} items`);
report.check(
  `the manual page cites the same-user-process non-claim with its CURRENT §15 number (item ${String(sameUserItem?.number ?? '?')})`,
  sameUserItem !== undefined && (manual ?? '').includes(`§15 第 ${String(sameUserItem.number)} 条`),
  `freeze item ${String(sameUserItem?.number ?? '?')}`,
);
report.check(
  `the manual page cites the hard-link boundary with its CURRENT §15 number (item ${String(hardLinkItem?.number ?? '?')})`,
  hardLinkItem !== undefined && (manual ?? '').includes(`§15 第 ${String(hardLinkItem.number)} 条`),
  `freeze item ${String(hardLinkItem?.number ?? '?')}`,
);
report.check(
  'the manual page has no dangling pointer to a section it does not have',
  !(manual ?? '').includes('见 §7'),
  'its own sections stop at §7 only if such a heading exists',
);
report.check(
  'the manual page registers the r3 (t14) impact too, including the hard-link boundary',
  (manual ?? '').includes('r3') && (manual ?? '').includes('7F66E172') && (manual ?? '').includes('硬链接'),
  'the r3 impact section',
);

/* r5 (t23): the page must carry the t21/t22 state — six-check self-test, no hand-
 * patched registry values, and the settings group that moved to the end of the page. */
report.check(
  'the manual page lists all SIX self-test lines, including the scheme (default) one (H3)',
  (manual ?? '').includes('六项') && (manual ?? '').includes('scheme key (default) is the frozen label'),
  'the six-check list',
);
report.check(
  'the manual page forbids hand-patching the registry when a check goes red',
  /不要手工/.test(manual ?? '') && /reg add/.test(manual ?? ''),
  'the "do not hand-patch" rule',
);
report.check(
  'the manual page registers the r5 (t21+t22) impact, including where the group moved',
  (manual ?? '').includes('r5') && (manual ?? '').includes('最末') && (manual ?? '').includes('5D94FF5B'),
  'the r5 impact section',
);
report.check(
  'the manual page records that the four live registry values were re-read and matched',
  (manual ?? '').includes('r25-t23-live-registry.txt'),
  'the live read-back pointer',
);

/* r4 (t18, captain's addition): the H2 repair must be reflected in the manual page —
 * a prerequisite check that can falsify H2, the user-confirmed name criterion, and the
 * click chain explicitly still pending. */
report.check(
  'the manual page carries the new FIRST prerequisite check for shell\\open\\command (step 1.1b)',
  (manual ?? '').includes('1.1b') && (manual ?? '').includes('shell\\open\\command') && (manual ?? '').includes('matches  :'),
  'step 1.1b with the pasteable check',
);
report.check(
  'the name criterion is marked as confirmed by the user with a date and the archived evidence',
  (manual ?? '').includes('已确认（用户实读，2026-09-24）') && (manual ?? '').includes('r25-h2-user-install-failure.png'),
  'criterion 1',
);
report.check(
  'the click chain and the switch-off criterion are explicitly still pending',
  (manual ?? '').includes('仍待确认'),
  'criteria 2 and 3',
);
report.check(
  'the manual page names the H2 defect (so a reader knows why 1.1b exists)',
  (manual ?? '').includes('H2') && (manual ?? '').includes('install.ps1'),
  'the H2 repair note',
);

/* ================================================================== verdict */

report.group('verdict inputs');
report.same('no unhandled rejection was produced by any of the above', rejections.seen.length, 0);
const hashesAtEnd = Object.fromEntries(WATCHED_FILES.map((relative) => [relative, hashFile(relative)]));
const changedDuringRun = WATCHED_FILES.filter((relative) => hashesAtStart[relative] !== hashesAtEnd[relative]);
readings.hashes = { atStart: hashesAtStart, atEnd: hashesAtEnd, changedDuringRun };
report.check(
  'no watched file changed while this probe ran (every reading belongs to one revision)',
  changedDuringRun.length === 0,
  `changed mid-run: ${JSON.stringify(changedDuringRun)}`,
);
report.note('watched-file hashes at end', JSON.stringify(hashesAtEnd));
report.note('post-install registry tier', readings.postInstallTier.status === 'installed' ? 'installed: read-only assertions ran' : 'not-installed: THIS TIER WAS NOT EXECUTED');
report.note('activating a button end to end (exit codes of answer.ps1)', 'not executed by this probe: the sandbox delays a spawned child\'s loopback request past the activator\'s 3 s budget (rev25-收尾清单 F.2)');
report.note('banner on screen / click raising the protocol handler', 'NOT PROVEN by any machine check — see docs/native-toast-人工验收.md');

rmSync(SCRATCH_HOME, { recursive: true, force: true });
for (const leftover of readdirSync(EVIDENCE_DIR)) {
  if (/^probe21-history-.*\.json$/.test(leftover)) rmSync(join(EVIDENCE_DIR, leftover), { force: true });
}

const failures = report.done();
writeFileSync(
  join(EVIDENCE_DIR, 'probe-21-evidence.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), checkCount: report.rows.length, failures: report.rows.filter((row) => !row.passed), readings }, null, 2),
  'utf8',
);
rejections.stop();
if (failures !== true) process.exitCode = 1;
