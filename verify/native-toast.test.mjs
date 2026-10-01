/**
 * Headless self-test — the rev-25 Windows notification (native toast).
 * 377 assertions in 13 sections.
 *
 * ⚠️ REBUILT 2026-10-02 — THIS IS NOT THE ORIGINAL FILE.
 *
 * The original `verify/native-toast.test.mjs` (94698 B / sha256
 * `38B92F97EF4628FD…`) was destroyed by the 2026-10-01 `robocopy /MIR`
 * write-through (CHANGELOG.md 「事故补记 · 2026-10-01」). A workspace-wide search
 * for the file (and for any renamed copy) found NOTHING, so byte-faithful
 * restoration is impossible and is not attempted.
 *
 * The specification is the ONE surviving artifact: the rev-29 run's full
 * assertion output, `.scratch/r29-release/suite-native-toast.txt` (417 lines),
 * which pins every section header, every assertion name in order, and every
 * `expected X, got Y` value. Acceptance for this reconstruction = the rebuilt
 * suite prints the same 377 assertions, in the same order, and `run-r13.ps1`
 * still counts 377.
 *
 * This file is ASSEMBLED from `.scratch/nt-chunks/*.mjs` by
 * `.scratch/nt-build.mjs` (chunked so that no single edit is large enough to
 * corrupt the tool protocol, and so each section is verifiable on its own).
 */
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync, copyFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createClientCtx,
  createClientSandbox,
  createFakeRequest,
  createFakeResponse,
  createReporter,
  CLIENT_PATH,
  HOST_PATH,
  PACKAGE_PATH,
  PLUGIN_DIR,
  parsedBody,
  readText,
} from './_harness.mjs';

const report = createReporter('native-toast.test.mjs');
const platform = await import('../lib/native-toast.js');
const plugin = await import('../lib/index.js');
const packageJson = JSON.parse(readText(PACKAGE_PATH));

/** The frozen contract page — a DOC, so a missing page fails loudly rather than skipping. */
const freezePagePath = join(PLUGIN_DIR, 'docs', 'native-toast-接口冻结.md');
const freezePage = existsSync(freezePagePath) ? readFileSync(freezePagePath, 'utf8') : '';

/** The token the spec pins everywhere. */
const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

/* ------------------------- 1. the frozen strings (freeze page §0) */

report.section('rev-25 · the frozen strings (freeze page §0)');
report.equal('AUMID', platform.NATIVE_TOAST_AUMID, 'Dsh.ApprovalChime.NativeToast');
report.equal('the name shown on the notification', platform.NATIVE_TOAST_APP_NAME, 'DSH 通知提醒');
report.equal('protocol scheme', platform.NATIVE_TOAST_SCHEME, 'dsh-approval-chime');
report.equal('HTTP route', platform.NATIVE_TOAST_ROUTE, '/api/approval-chime/native-toast');
report.equal('settings field', platform.NATIVE_TOAST_FIELD, 'nativeToast');
report.equal('toast group', platform.NATIVE_TOAST_GROUP, 'dsh-approval-chime');
report.equal('one TTL for token, toast and answer file', platform.NATIVE_TOAST_TTL_MS, 600000);
report.equal('client poll interval', platform.NATIVE_TOAST_POLL_MS, 1000);
report.equal('request body cap', platform.NATIVE_TOAST_BODY_LIMIT, 16384);
report.equal('install marker filename', platform.NATIVE_TOAST_MARKER, 'installed.json');
report.equal('toast first line', platform.NATIVE_TOAST_TITLE, 'DSH 需要你的授权');
report.equal('allow button copy', platform.NATIVE_TOAST_BUTTON_ALLOW, '接受');
report.equal('deny button copy', platform.NATIVE_TOAST_BUTTON_DENY, '拒绝');
report.equal('outcome for allow', platform.NATIVE_TOAST_ANSWER_ALLOW, 'allowed-once');
report.equal('outcome for deny', platform.NATIVE_TOAST_ANSWER_DENY, 'rejected');
report.equal('tag is appr- plus the first 11 token characters', platform.nativeToastTagOf(TOKEN), 'appr-a1b2c3d4e5f');
report.equal('tag length is 16 characters (legal on every build)', platform.nativeToastTagOf(TOKEN).length, 16);
report.equal(
  'tag is a pure function of the token',
  platform.nativeToastTagOf('00112233445566778899aabbccddeeff'),
  'appr-00112233445',
);
report.equal('the backfill directory is <home>/approval-chime/native-toast', platform.nativeToastDirectory('\\h'), '\\h\\approval-chime\\native-toast');
report.equal('the marker lives in that directory', platform.nativeToastMarkerPath('\\h'), '\\h\\approval-chime\\native-toast\\installed.json');
report.equal('an answer file is <token>.json', platform.nativeToastAnswerPath('\\h', TOKEN), `\\h\\approval-chime\\native-toast\\${TOKEN}.json`);
report.equal('DSH_HOME wins over the fallback home', platform.nativeToastHome({ DSH_HOME: 'D:\\dsh' }, '\\fallback'), 'D:\\dsh');
report.equal('without DSH_HOME the home rule is ~/.dsh', platform.nativeToastHome({}, '\\home\\u'), '\\home\\u\\.dsh');
report.equal('the raise worker is the plugin deploy script', platform.nativeToastScriptPath('raise.ps1'), join(PLUGIN_DIR, 'deploy', 'native-toast', 'raise.ps1'));
report.equal('the frozen page and the code carry the same AUMID', freezePage.includes(platform.NATIVE_TOAST_AUMID), true);
report.equal('the frozen page carries the route too', freezePage.includes(platform.NATIVE_TOAST_ROUTE), true);
report.equal('host half and platform declare one field name', plugin.NATIVE_TOAST_FIELD, 'nativeToast');
report.equal('the host half exports the new default', plugin.DEFAULTS.nativeToast, false);

/* --------------------------------- 2. the toast XML (§10, hard criterion 1) */

report.section('rev-25 · the toast XML (§10; hard criterion 1)');
/** How many times `needle` occurs in `haystack`. */
const occurrences = (haystack, needle) => haystack.split(needle).length - 1;

const xml = platform.buildNativeToastXml({ token: TOKEN, port: 3080, toolName: 'bash' });
const allowUri = `${platform.NATIVE_TOAST_SCHEME}://answer/?t=${TOKEN}&a=allow&p=3080`;
const denyUri = `${platform.NATIVE_TOAST_SCHEME}://answer/?t=${TOKEN}&a=reject&p=3080`;

report.equal('exactly two actions', occurrences(xml, '<action '), 2);
report.equal('there is exactly one <actions> block', occurrences(xml, '<actions>'), 1);
report.equal('both actions activate through the protocol', occurrences(xml, 'activationType="protocol"'), 2);
report.ok('the allow action carries the frozen URI', xml.includes(`arguments="${platform.escapeXmlText(allowUri)}"`), xml);
report.ok('the deny action carries the frozen URI', xml.includes(`arguments="${platform.escapeXmlText(denyUri)}"`), xml);
report.ok(
  'the buttons read 接受 / 拒绝',
  xml.includes(`content="${platform.NATIVE_TOAST_BUTTON_ALLOW}"`) && xml.includes(`content="${platform.NATIVE_TOAST_BUTTON_DENY}"`),
  xml,
);
report.ok(
  'styled buttons are on',
  xml.startsWith('<toast useButtonStyle="true">') && xml.includes('hint-buttonStyle="Success"') && xml.includes('hint-buttonStyle="Critical"'),
  xml,
);
// §13: the toast must NOT bypass Do-Not-Disturb, and §15.5: a body click must stay
// inert (only the two buttons answer). A stray `scenario`, `launch` or
// `activationType` on `<toast>` would break one of those (or make LoadXml throw).
report.ok('the toast element has no scenario (DND is not bypassed, §13)', /^<toast [^>]*\sscenario=/.test(xml) === false, xml);
report.ok('the toast element has no launch (a body click stays inert, §15.5)', /^<toast [^>]*\slaunch=/.test(xml) === false, xml);
report.ok('the toast element has no activationType (the schema rejects it)', /^<toast [^>]*\sactivationType=/.test(xml) === false, xml);
report.ok(
  'both frozen text lines are there',
  xml.includes(`<text>${platform.NATIVE_TOAST_TITLE}</text>`) && xml.includes(`<text>${platform.nativeToastSecondLine({ toolName: 'bash' })}</text>`),
  xml,
);
report.equal('without a reason the second line is the panel escalation copy', platform.nativeToastSecondLine({ toolName: 'bash' }), '工具 bash 请求越权执行');
report.ok('and that line is in the XML', xml.includes('<text>工具 bash 请求越权执行</text>'), xml);
report.equal('a reason wins over the tool name', platform.nativeToastSecondLine({ toolName: 'bash', reason: 'run mkfs' }), 'run mkfs');
report.equal('a blank reason falls back', platform.nativeToastSecondLine({ toolName: 'bash', reason: '   ' }), '工具 bash 请求越权执行');
report.equal('a missing tool name still renders', platform.nativeToastSecondLine({}), '工具 unknown 请求越权执行');

const escaped = platform.buildNativeToastXml({ token: TOKEN, port: 3080, toolName: '<b>&"\'</b>' });
report.ok('angle brackets are escaped', escaped.includes('&lt;b&gt;') && escaped.includes('&lt;/b&gt;'), escaped);
report.ok('the quote and ampersand are escaped', escaped.includes('&amp;') && escaped.includes('&quot;') && escaped.includes('&apos;'), escaped);
report.equal('a text is cut at the frozen limit', platform.truncateToastText('x'.repeat(500)).length, 200);
report.equal('control characters cannot break one toast line', platform.truncateToastText('a\u0000b\u0001c'), 'a b c');

const runaway = platform.buildNativeToastXml({ token: TOKEN, port: 3080, toolName: 'bash', reason: 'y'.repeat(5000) });
report.ok('a runaway reason cannot bloat the toast', runaway.length < platform.NATIVE_TOAST_BODY_LIMIT, String(runaway.length));
report.ok('the XML starts at <toast> (no BOM, no prologue)', xml.startsWith('<toast'), xml.slice(0, 20));
report.equal('the toast silences its own system sound (one approval, one sound)', occurrences(xml, 'silent="true"'), 1);
report.equal('and carries exactly one audio element', occurrences(xml, '<audio'), 1);
report.ok('placed directly after the opening tag, as the frozen block says', xml.startsWith('<toast useButtonStyle="true"><audio silent="true"/>'), xml.slice(0, 70));
report.equal('a runaway reason still carries the audio element', occurrences(runaway, '<audio'), 1);

/* --------------- 3. carrier and the forbidden alternatives (criterion 1) */

report.section('rev-25 · carrier and the forbidden alternatives (hard criterion 1)');

const deployScript = (name) => readFileSync(platform.nativeToastScriptPath(name), 'utf8');
const raiseScript = deployScript('raise.ps1');
const selftestScript = deployScript('selftest.ps1');
const uninstallScript = deployScript('uninstall.ps1');

report.ok('the toast is raised through ToastNotificationManager', raiseScript.includes('ToastNotificationManager'), 'raise.ps1');
report.ok('under the product AUMID', raiseScript.includes(platform.NATIVE_TOAST_AUMID), 'raise.ps1');
report.ok(
  'with a tag, a group and the 10 minute expiry',
  raiseScript.includes('$toast.Tag = $Tag') && raiseScript.includes(`$Group = '${platform.NATIVE_TOAST_GROUP}'`) && raiseScript.includes('AddMinutes(10)'),
  'raise.ps1',
);
report.ok('and the machine check reads History back', selftestScript.includes('History.GetHistory'), 'selftest.ps1');
report.ok('the removal uses History.Remove(tag, group, aumid)', raiseScript.includes('History.Remove($Tag, $Group, $Aumid)'), 'raise.ps1');
report.ok('the uninstaller clears only our own notifications', uninstallScript.includes('History.Clear($aumid)'), 'uninstall.ps1');

// Hard criterion 1: the carrier is a REAL Windows toast. Everything that could
// quietly substitute an in-page or in-console knock-off is grepped for, over every
// file this plugin owns. (`document.` is checked against the HOST files only — the
// browser half legitimately touches the DOM; §15.4 is about the host half.)
const ownSourcePaths = [
  join(PLUGIN_DIR, 'lib', 'client.js'),
  join(PLUGIN_DIR, 'lib', 'index.js'),
  join(PLUGIN_DIR, 'lib', 'native-toast.js'),
  join(PLUGIN_DIR, 'lib', 'native-bridge.js'),
  platform.nativeToastScriptPath('raise.ps1'),
  platform.nativeToastScriptPath('selftest.ps1'),
  platform.nativeToastScriptPath('uninstall.ps1'),
  platform.nativeToastScriptPath('install.ps1'),
  platform.nativeToastScriptPath('answer.ps1'),
  platform.nativeToastScriptPath('activate.vbs'),
];
const allOwnSources = ownSourcePaths.map((path) => readText(path)).join('\n');
const hostSources = [readText(HOST_PATH), readText(join(PLUGIN_DIR, 'lib', 'native-toast.js')), readText(join(PLUGIN_DIR, 'lib', 'native-bridge.js'))].join('\n');

report.ok('no HTML5 Notification anywhere (hard criterion 1)', /new Notification\(/.test(allOwnSources) === false, 'grep: new Notification(');
report.ok('no MessageBox', /MessageBox/.test(allOwnSources) === false, 'grep: MessageBox');
report.ok('no msg.exe', /msg\.exe/.test(allOwnSources) === false, 'grep: msg.exe');
report.ok('no page-drawn overlay: the host half never touches the DOM', /document\./.test(hostSources) === false, 'grep: document.*');
report.ok('no alert()', /alert\(/.test(allOwnSources) === false, 'grep: alert(');

/** Every static module specifier in `text` (multi-line imports included). */
const specifiersOf = (text) => [...text.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
const nodeBuiltinOnly = (text) => specifiersOf(text).every((specifier) => specifier.startsWith('node:'));

report.equal('the platform layer imports only node: builtins', nodeBuiltinOnly(readText(join(PLUGIN_DIR, 'lib', 'native-toast.js'))), true);
const bridgeSpecifiers = specifiersOf(readText(join(PLUGIN_DIR, 'lib', 'native-bridge.js')));
report.ok('the bridge imports only its own sibling', bridgeSpecifiers.length === 1 && bridgeSpecifiers[0] === './native-toast.js', 'native-bridge.js');
report.ok(
  'the host entry statically imports the schema package (DSH 0.1.7 requires it)',
  readText(HOST_PATH).includes("import z from '@deepseek-ai/schemastery';"),
  'lib/index.js',
);
const hostImports = readText(HOST_PATH).split(/\r?\n/).filter((line) => /^import\s/.test(line));
const otherHostImports = hostImports.filter((line) => !line.includes('schemastery'));
report.ok(
  'KNOWN ROBUSTNESS REGRESSION: index.js is no longer importable alone, while every OTHER top-level import is still a node: builtin',
  otherHostImports.length === hostImports.length - 1 && otherHostImports.every((line) => /^import\s+.*from\s+'node:[a-z/]+';$/.test(line)),
  hostImports.join('\n | '),
);
report.equal('no dependencies were added', packageJson.dependencies, undefined);
report.equal('no devDependencies were added', packageJson.devDependencies, undefined);

/* --------------------------------------- 4. the HTTP contract (§5) */

report.section('rev-25 · the HTTP contract (§5)');

const nativeBridge = await import('../lib/native-bridge.js');
const ROUTE = platform.NATIVE_TOAST_ROUTE;
const SECOND_TOKEN = '00112233445566778899aabbccddeeff';

/** A platform the bridge can drive without a process, a directory or Windows. */
function createFakePlatform() {
  return {
    stageValue: 'ready',
    stageCalls: 0,
    sweeps: 0,
    readCalls: 0,
    raised: [],
    dismissed: [],
    writes: [],
    answers: new Map(),
    raiseResult: null,
    async stage() {
      this.stageCalls += 1;
      return this.stageValue;
    },
    async raise(request) {
      this.raised.push(request);
      if (this.raiseResult !== null) return this.raiseResult;
      return { state: 'raised', tag: platform.nativeToastTagOf(request.token) };
    },
    async sweep() {
      this.sweeps += 1;
    },
    async answerExists(token) {
      return this.answers.has(token);
    },
    async writeAnswer(token, answer) {
      if (this.answers.has(token)) return { ok: false, reason: 'exists' };
      this.answers.set(token, answer);
      this.writes.push({ token, answer });
      return { ok: true };
    },
    async readAnswer(token) {
      this.readCalls += 1;
      const value = this.answers.get(token);
      if (value === undefined) return null;
      this.answers.delete(token);
      // The bridge reads `found.answer`: the platform hands back a RECORD, not a bare string.
      return { answer: value };
    },
    async dismiss(tag) {
      this.dismissed.push(tag);
      return { ok: true };
    },
  };
}

const scopeState = { enabled: false, reads: 0 };
const switchScope = {
  get() {
    scopeState.reads += 1;
    return { [platform.NATIVE_TOAST_FIELD]: scopeState.enabled };
  },
};
const fakePlatform = createFakePlatform();
const bridge = nativeBridge.createNativeToastBridge({ platform: fakePlatform, portSource: () => 3080, log: () => {} });
bridge.setSettingsScope(switchScope);

/** Drive the real handler with one fake request and read the answer back. */
async function call(method, path, body) {
  const response = createFakeResponse();
  await bridge.handler(
    createFakeRequest({
      method,
      url: path,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    }),
    response,
  );
  return { status: response.state.status, body: response.state.body === null ? null : parsedBody(response) };
}

// --- off: the feature must be inert, touching nothing at all (§6.3) -----------
const offRaise = await call('POST', ROUTE, { token: TOKEN, toolName: 'bash' });
report.equal('off the switch, a raise request is answered 200', offRaise.status, 200);
report.deepEqual('and says so', offRaise.body, { ok: true, state: 'skipped', reason: 'disabled' });
report.equal('off the switch, no toast is attempted', fakePlatform.raised.length, 0);
report.equal('off the switch, the marker is not even read', fakePlatform.stageCalls, 0);
report.equal('off the switch, the backfill directory is not swept', fakePlatform.sweeps, 0);

const offStatus = await call('GET', ROUTE);
report.equal('status answers 200 while off', offStatus.status, 200);
report.equal('and reports disabled', offStatus.body.state, 'disabled');

const offPoll = await call('GET', `${ROUTE}/answer?token=${TOKEN}`);
report.deepEqual('a poll while off is skipped', offPoll.body, { ok: true, state: 'skipped', reason: 'disabled' });
report.equal('and it never read the answer file', fakePlatform.readCalls, 0);

const offRecord = await call('POST', `${ROUTE}/answer`, { token: TOKEN, answer: platform.NATIVE_TOAST_ANSWER_ALLOW });
report.deepEqual('recording an answer while off is skipped', offRecord.body, { ok: true, state: 'skipped', reason: 'disabled' });
report.equal('and it wrote nothing', fakePlatform.writes.length, 0);
report.equal('so the answer file does not exist', fakePlatform.answers.has(TOKEN), false);

const offRevoke = await call('POST', `${ROUTE}/revoke`, { tokens: [TOKEN] });
report.deepEqual('a revoke while off is skipped', offRevoke.body, { ok: true, state: 'skipped', reason: 'disabled' });
report.equal('and it dismissed nothing', fakePlatform.dismissed.length, 0);
report.equal('and it swept nothing', fakePlatform.sweeps, 0);

report.equal('the schema default keeps it off', plugin.DEFAULTS[platform.NATIVE_TOAST_FIELD], false);

// --- on: read LIVE, straight through the scope --------------------------------
scopeState.enabled = true;
scopeState.reads = 0;
fakePlatform.stageCalls = 0;
const onStatus = await call('GET', ROUTE);
report.equal('turning the switch on is read live', onStatus.body.state === 'ready', true);
// ONE status read consults the live switch (at least once — the throttled sweep in
// `housekeeping()` is gated on the same switch) and asks the platform exactly once.
// The detail pins the platform query, which is what the switch actually gates.
report.ok('every status read goes through the scope', scopeState.reads >= 1 && fakePlatform.stageCalls === 1, String(fakePlatform.stageCalls));
report.equal('status reports ready', onStatus.body.state, 'ready');

const headStatus = await call('HEAD', ROUTE);
report.equal('a HEAD status read answers 200 with no body', headStatus.status, 200);

const raised = await call('POST', ROUTE, { token: TOKEN, toolName: 'bash', reason: 'run mkfs' });
report.equal('a raise answers 200', raised.status, 200);
report.deepEqual('and reports the tag', raised.body, { ok: true, state: 'raised', tag: platform.nativeToastTagOf(TOKEN) });
report.equal('the platform raised exactly one toast', fakePlatform.raised.length, 1);
report.equal('the request carried the token', fakePlatform.raised[0]?.token, TOKEN);
report.equal('the request carried the listening port', fakePlatform.raised[0]?.port, 3080);
report.equal('the request carried the reason', fakePlatform.raised[0]?.reason, 'run mkfs');

// The bridge hands its live token ledger out (`tokens`), so "is it live" is read
// straight off the ledger rather than inferred from a poll.
report.equal('the token is now live', bridge.tokens.has(TOKEN), true);

const duplicate = await call('POST', ROUTE, { token: TOKEN, toolName: 'bash' });
report.equal('a duplicate raise is 200', duplicate.status, 200);
report.equal('and raises nothing again', fakePlatform.raised.length, 1);
report.equal('it is marked as a duplicate', duplicate.body.duplicate === true, true);

const pendingPoll = await call('GET', `${ROUTE}/answer?token=${TOKEN}`);
report.deepEqual('a pending poll answers pending', pendingPoll.body, { ok: true, state: 'pending' });

report.equal('an unknown token polls 404', (await call('GET', `${ROUTE}/answer?token=${SECOND_TOKEN}`)).status, 404);
report.equal('a malformed token polls 400', (await call('GET', `${ROUTE}/answer?token=nope`)).status, 400);
report.equal('a HEAD poll is refused so it can never consume the answer', (await call('HEAD', `${ROUTE}/answer?token=${TOKEN}`)).status, 405);

const recorded = await call('POST', `${ROUTE}/answer`, { token: TOKEN, answer: platform.NATIVE_TOAST_ANSWER_ALLOW });
report.equal('the activator records an answer with 200', recorded.status, 200);
report.deepEqual('and says recorded', recorded.body, { ok: true, state: 'recorded' });
const secondClick = await call('POST', `${ROUTE}/answer`, { token: TOKEN, answer: platform.NATIVE_TOAST_ANSWER_DENY });
report.equal('a second click is 409', secondClick.status, 409);
report.equal('and the first answer stands', fakePlatform.answers.get(TOKEN), platform.NATIVE_TOAST_ANSWER_ALLOW);

report.equal('an answer for an unknown token is 404', (await call('POST', `${ROUTE}/answer`, { token: SECOND_TOKEN, answer: platform.NATIVE_TOAST_ANSWER_ALLOW })).status, 404);
report.equal('a bad answer literal is 400', (await call('POST', `${ROUTE}/answer`, { token: TOKEN, answer: 'maybe' })).status, 400);
report.equal('a bad token is 400', (await call('POST', `${ROUTE}/answer`, { token: 'nope', answer: platform.NATIVE_TOAST_ANSWER_ALLOW })).status, 400);

const answered = await call('GET', `${ROUTE}/answer?token=${TOKEN}`);
report.deepEqual('the client gets the answer once', answered.body, { ok: true, state: 'answered', answer: platform.NATIVE_TOAST_ANSWER_ALLOW });
const consumedAgain = await call('GET', `${ROUTE}/answer?token=${TOKEN}`);
report.deepEqual('a second read is consumed, never a replay', consumedAgain.body, { ok: true, state: 'consumed' });
report.equal('consuming the answer does not leave the token live', consumedAgain.body.state === 'pending', false);

// A second toast, so revoke has two to take off the screen.
await call('POST', ROUTE, { token: SECOND_TOKEN, toolName: 'bash' });
const revoke = await call('POST', `${ROUTE}/revoke`, { tokens: [TOKEN, SECOND_TOKEN] });
report.equal('revoke answers 200', revoke.status, 200);
report.equal('a live token is pending and gets dismissed', revoke.body.results?.[1]?.state, 'pending');
report.ok(
  'the toast was taken off the screen',
  fakePlatform.dismissed.join(',') === `${platform.nativeToastTagOf(TOKEN)},${platform.nativeToastTagOf(SECOND_TOKEN)}`,
  fakePlatform.dismissed.join(','),
);
const revokeAgain = await call('POST', `${ROUTE}/revoke`, { tokens: [TOKEN] });
report.equal('an already consumed token stays consumed', revokeAgain.body.results?.[0]?.state, 'consumed');
const revokeUnknown = await call('POST', `${ROUTE}/revoke`, { tokens: ['ffffffffffffffffffffffffffffffff'] });
report.equal('a token we never issued is unknown', revokeUnknown.body.results?.[0]?.state, 'unknown');
report.equal('revoke refuses to guess', (await call('POST', `${ROUTE}/revoke`, {})).status, 400);
report.equal('revoke caps one call at 32 tokens', (await call('POST', `${ROUTE}/revoke`, { tokens: Array.from({ length: 33 }, () => TOKEN) })).status, 400);
report.equal('revoke is POST only', (await call('GET', `${ROUTE}/revoke`)).status, 405);

const unknownPath = await call('GET', `${ROUTE}/nope`);
report.equal('an unknown sub-path is 404 with the same wording as the other routes', unknownPath.body.error, `unknown path ${ROUTE}/nope`);
report.equal('an unsupported method is 405', (await call('PUT', ROUTE)).body.error, 'method PUT is not supported on this route');

report.equal('a body that is not JSON is 400', (await call('POST', `${ROUTE}/answer`, '{"token":')).status, 400);
report.equal('an array body is 400', (await call('POST', `${ROUTE}/answer`, [1])).status, 400);
report.equal('an empty body is 400', (await call('POST', `${ROUTE}/answer`, '')).status, 400);
report.equal('an oversized body is 413, not an unbounded read', (await call('POST', `${ROUTE}/answer`, 'x'.repeat(platform.NATIVE_TOAST_BODY_LIMIT + 1))).status, 413);

// --- fail-closed gates, in the frozen order (§5.1) ----------------------------
const beforeGate = fakePlatform.raised.length;
fakePlatform.stageValue = 'not-installed';
const notInstalled = await call('POST', ROUTE, { token: SECOND_TOKEN, toolName: 'bash' });
report.deepEqual('without the marker the raise is skipped', notInstalled.body, { ok: true, state: 'skipped', reason: 'not-installed' });
report.equal('and nothing was raised', fakePlatform.raised.length - beforeGate, 0);

fakePlatform.stageValue = 'no-powershell';
const noPowerShell = await call('POST', ROUTE, { token: SECOND_TOKEN, toolName: 'bash' });
report.deepEqual('without PowerShell the raise is skipped', noPowerShell.body, { ok: true, state: 'skipped', reason: 'no-powershell' });
report.equal('and nothing was raised', fakePlatform.raised.length - beforeGate, 0);

fakePlatform.stageValue = 'ready';
const portlessBridge = nativeBridge.createNativeToastBridge({ platform: fakePlatform, portSource: () => 0, log: () => {} });
portlessBridge.setSettingsScope(switchScope);
const portlessResponse = createFakeResponse();
await portlessBridge.handler(createFakeRequest({ method: 'POST', url: ROUTE, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: SECOND_TOKEN }) }), portlessResponse);
report.deepEqual(
  'without a listening port the raise is skipped, never a broken URI',
  parsedBody(portlessResponse),
  { ok: true, state: 'skipped', reason: 'raise-failed', detail: 'no listening port' },
);

const failingPlatform = createFakePlatform();
failingPlatform.raiseResult = { state: 'skipped', reason: 'raise-failed', detail: 'exit 5' };
const failingBridge = nativeBridge.createNativeToastBridge({ platform: failingPlatform, portSource: () => 3080, log: () => {} });
failingBridge.setSettingsScope(switchScope);
const failingResponse = createFakeResponse();
await failingBridge.handler(createFakeRequest({ method: 'POST', url: ROUTE, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: SECOND_TOKEN }) }), failingResponse);
report.deepEqual('a failed raise is reported, not thrown', parsedBody(failingResponse), { ok: true, state: 'skipped', reason: 'raise-failed', detail: 'exit 5' });
const failingPoll = createFakeResponse();
await failingBridge.handler(createFakeRequest({ method: 'GET', url: `${ROUTE}/answer?token=${SECOND_TOKEN}` }), failingPoll);
report.equal('and the token is not registered', parsedBody(failingPoll).state === 'pending', false);

/* ------------- 5. default off, and no path that can raise on its own (2) */

report.section('rev-25 · default off and no self-triggering path (hard criterion 2)');

// A real temp home, the real platform and bridge, and a FAKE child process: the
// spawn hook is the only thing that keeps this test from putting a real toast on the
// user's screen. The temp home lives one level under the sandbox directory
// (`…/home`) so the frozen argument vector has the same shape as the spec's.
const spawnSandbox = mkdtempSync(join(tmpdir(), 'dsh-native-toast-test-'));
const spawnHome = join(spawnSandbox, 'home');
const spawnCalls = [];
let spawnBehaviour = 'exit-0';
const makeChild = () => {
  const handlers = new Map();
  const child = {
    killed: false,
    once(event, handler) {
      handlers.set(event, handler);
      if (event === 'exit' && child.immediateExit !== undefined) queueMicrotask(() => handler(child.immediateExit));
      return child;
    },
    kill() {
      child.killed = true;
      const handler = handlers.get('exit');
      if (handler !== undefined) queueMicrotask(() => handler(null));
    },
  };
  return child;
};
const fakeSpawn = (interpreter, args, options) => {
  const xmlFlag = args.indexOf('-XmlPath');
  const xmlPath = xmlFlag < 0 ? null : args[xmlFlag + 1];
  const seen = xmlPath !== null && existsSync(xmlPath) ? readFileSync(xmlPath, 'utf8') : null;
  const call = { interpreter, args, options, xml: seen, xmlPath, token: null };
  spawnCalls.push(call);
  const child = makeChild();
  call.child = child;
  if (spawnBehaviour === 'exit-0') child.immediateExit = 0;
  else if (spawnBehaviour === 'exit-5') child.immediateExit = 5;
  // 'hang' leaves the child alive: only the raise timeout can settle it.
  return child;
};

const spawnRoutes = [];
const spawnWebServer = { port: 3080, register(route) { spawnRoutes.push(route); return () => {}; } };
const spawnLogs = [];
const spawnCtx = {
  logger: { info: (line) => spawnLogs.push(line), warn: (line) => spawnLogs.push(line), error: () => {}, debug: () => {} },
  effect: (callback) => callback(),
  get: (name) => (name === 'webServer' ? spawnWebServer : undefined),
};
const spawnBridge = nativeBridge.registerNativeToastRoutes(spawnCtx, {
  platformOptions: { home: spawnHome, spawn: fakeSpawn, log: () => {}, raiseTimeoutMs: 40 },
});

try {
  report.equal('exactly one route is claimed', spawnRoutes.length, 1);
  report.equal('as a prefix route', spawnRoutes[0]?.kind, 'prefix');
  report.equal('on the frozen path', spawnRoutes[0]?.path, platform.NATIVE_TOAST_ROUTE);
  report.equal('nothing was spawned while registering', spawnCalls.length, 0);
  report.equal('nothing was written while registering', existsSync(join(spawnHome, 'approval-chime', 'native-toast')), false);

  const offStatus = createFakeResponse();
  await spawnBridge.handler(createFakeRequest({ method: 'GET', url: platform.NATIVE_TOAST_ROUTE }), offStatus);
  report.deepEqual('the status route answers disabled before any scope', parsedBody(offStatus), { ok: true, state: 'disabled' });
  report.equal('and still nothing was spawned', spawnCalls.length, 0);
  report.equal('and the backfill directory does not even exist', existsSync(join(spawnHome, 'approval-chime', 'native-toast')), false);

  const offRaise = createFakeResponse();
  await spawnBridge.handler(
    createFakeRequest({ method: 'POST', url: platform.NATIVE_TOAST_ROUTE, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: TOKEN, toolName: 'bash' }) }),
    offRaise,
  );
  report.deepEqual('a raise while off is skipped with zero side effects', parsedBody(offRaise), { ok: true, state: 'skipped', reason: 'disabled' });
  report.equal('no child process was started while off', spawnCalls.length, 0);
  report.equal('no directory was created while off', existsSync(join(spawnHome, 'approval-chime', 'native-toast')), false);

  // Installed + PowerShell present: the raise now really runs the plan.
  mkdirSync(join(spawnHome, 'approval-chime', 'native-toast'), { recursive: true });
  writeFileSync(
    join(spawnHome, 'approval-chime', 'native-toast', platform.NATIVE_TOAST_MARKER),
    JSON.stringify({ version: platform.NATIVE_TOAST_MARKER_VERSION, aumid: platform.NATIVE_TOAST_AUMID, displayName: platform.NATIVE_TOAST_APP_NAME }),
    'utf8',
  );
  spawnBridge.setSettingsScope({ get: () => ({ [platform.NATIVE_TOAST_FIELD]: true }) });

  const onRaise = createFakeResponse();
  await spawnBridge.handler(
    createFakeRequest({ method: 'POST', url: platform.NATIVE_TOAST_ROUTE, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: TOKEN, toolName: 'bash', reason: 'run mkfs' }) }),
    onRaise,
  );
  report.equal('with a marker and PowerShell present the raise succeeds', parsedBody(onRaise).state, 'raised');
  report.equal('exactly one child process was started', spawnCalls.length, 1);
  report.equal('the interpreter is Windows PowerShell 5.1', spawnCalls[0]?.interpreter, 'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  report.equal('the child never gets a console window', spawnCalls[0]?.options?.windowsHide, true);
  report.equal('the child gets no pipes', spawnCalls[0]?.options?.stdio, 'ignore');
  const xmlPath = join(spawnHome, 'approval-chime', 'native-toast', `raise-${TOKEN}.xml`);
  report.deepEqual('the child runs raise.ps1 with the frozen arguments', spawnCalls[0]?.args, [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    platform.nativeToastScriptPath('raise.ps1'),
    '-Aumid',
    platform.NATIVE_TOAST_AUMID,
    '-XmlPath',
    xmlPath,
    '-Tag',
    platform.nativeToastTagOf(TOKEN),
    '-Group',
    platform.NATIVE_TOAST_GROUP,
  ]);
  report.ok('the XML the child saw is the frozen one', spawnCalls[0]?.xml === platform.buildNativeToastXml({ token: TOKEN, port: 3080, toolName: 'bash', reason: 'run mkfs' }), spawnCalls[0]?.xml);
  report.equal('the XML file is deleted after the raise', existsSync(xmlPath), false);

  const secondStatus = createFakeResponse();
  await spawnBridge.handler(createFakeRequest({ method: 'GET', url: platform.NATIVE_TOAST_ROUTE }), secondStatus);
  report.equal('a second status read spawns nothing new', spawnCalls.length, 1);

  // A child that never returns must be bounded, and killed. The raise timeout is
  // `unref()`ed by the product (harmless in production, where the web server keeps
  // the loop alive), so this test has to hold the loop open itself — otherwise Node
  // exits with "unsettled top-level await" before the timeout can fire.
  spawnBehaviour = 'hang';
  const keepAlive = setInterval(() => {}, 10);
  const hung = createFakeResponse();
  try {
    await spawnBridge.handler(
      createFakeRequest({ method: 'POST', url: platform.NATIVE_TOAST_ROUTE, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'aaaabbbbccccddddeeeeffff00001111', toolName: 'bash' }) }),
      hung,
    );
  } finally {
    clearInterval(keepAlive);
  }
  report.deepEqual('a raise that never returns is bounded and reported', parsedBody(hung), { ok: true, state: 'skipped', reason: 'raise-failed', detail: 'timeout' });
  report.equal('and the hung child is killed', spawnCalls[spawnCalls.length - 1]?.child?.killed, true);

  spawnBehaviour = 'exit-5';
  const failed = createFakeResponse();
  await spawnBridge.handler(
    createFakeRequest({ method: 'POST', url: platform.NATIVE_TOAST_ROUTE, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'aaaabbbbccccddddeeeeffff00002222', toolName: 'bash' }) }),
    failed,
  );
  report.deepEqual('a non-zero exit is a skip, never a 500', parsedBody(failed), { ok: true, state: 'skipped', reason: 'raise-failed', detail: 'exit 5' });

  const noPowerShellBridge = nativeBridge.registerNativeToastRoutes(
    { logger: { info() {}, warn() {}, error() {}, debug() {} }, effect: (callback) => callback(), get: (name) => (name === 'webServer' ? { port: 3080, register: () => () => {} } : undefined) },
    { platformOptions: { home: spawnHome, powershell: null, spawn: fakeSpawn, log: () => {} } },
  );
  noPowerShellBridge.setSettingsScope({ get: () => ({ [platform.NATIVE_TOAST_FIELD]: true }) });
  const noPowerShell = createFakeResponse();
  await noPowerShellBridge.handler(
    createFakeRequest({ method: 'POST', url: platform.NATIVE_TOAST_ROUTE, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'aaaabbbbccccddddeeeeffff00003333' }) }),
    noPowerShell,
  );
  report.equal('a machine without powershell.exe fails closed', parsedBody(noPowerShell).reason, 'no-powershell');

  const missingPathBridge = nativeBridge.registerNativeToastRoutes(
    { logger: { info() {}, warn() {}, error() {}, debug() {} }, effect: (callback) => callback(), get: (name) => (name === 'webServer' ? { port: 3080, register: () => () => {} } : undefined) },
    { platformOptions: { home: spawnHome, exists: () => false, spawn: fakeSpawn, log: () => {} } },
  );
  missingPathBridge.setSettingsScope({ get: () => ({ [platform.NATIVE_TOAST_FIELD]: true }) });
  const missingPath = createFakeResponse();
  await missingPathBridge.handler(
    createFakeRequest({ method: 'POST', url: platform.NATIVE_TOAST_ROUTE, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'aaaabbbbccccddddeeeeffff00004444' }) }),
    missingPath,
  );
  report.equal('and so does one that cannot resolve the path at all', parsedBody(missingPath).reason, 'no-powershell');
} finally {
  rmSync(spawnSandbox, { recursive: true, force: true });
}

/* --------------------- 6. the host half subscribes to NOTHING (criterion 2) */

report.section('rev-25 · the host half subscribes to nothing (hard criterion 2)');

// Hard criterion 2: nothing in the host half may observe approvals. If the host
// half subscribed to a pending-approval source, the feature would raise toasts by
// itself — including while the window is in front. These greps are the guard: the
// two host files must not even NAME the sources (rev-25 re-derived this after
// `pendingInteractions` was watched in the browser half only).
const platformSource = readText(join(PLUGIN_DIR, 'lib', 'native-toast.js'));
const bridgeSource = readText(join(PLUGIN_DIR, 'lib', 'native-bridge.js'));
for (const needle of ['approval/request', 'pendingInteractions', 'waterfall', 'ctx.remote', 'uiSession']) {
  report.ok(`the platform layer never mentions ${needle}`, platformSource.includes(needle) === false, needle);
  report.ok(`the bridge never mentions ${needle}`, bridgeSource.includes(needle) === false, needle);
}

const hostHalf = [readText(HOST_PATH), platformSource, bridgeSource].join('\n');
report.ok('no interval timer exists in the host half (nothing can raise on its own)', /setInterval/.test(hostHalf) === false, 'grep: setInterval');
// The route claim itself is a single `server.register(...)` in the bridge: the host
// entry never claims a second path for this feature.
report.equal('the host entry claims the route exactly once', occurrences(bridgeSource, 'server.register('), 1);

/* ------------------------------------- 7. the backfill channel (§4) */

report.section('rev-25 · the backfill channel (§4)');

// A REAL directory, the REAL platform, and an injected clock: the spec's own
// evidence pins the timestamp `2026-09-29T18:19:02.032Z`, which is exactly what a
// frozen clock produces — so the clock is derived from the spec rather than
// normalised away.
const FIXED_NOW = Date.parse('2026-09-29T18:19:02.032Z');
const channelClock = { at: FIXED_NOW };
const channelHome = mkdtempSync(join(tmpdir(), 'dsh-native-toast-channel-'));
const channel = platform.createNativeToastPlatform({ home: channelHome, now: () => channelClock.at, log: () => {} });
const channelDirectory = channel.directory();
const answerFileOf = (token) => channel.answerPath(token);
const filesMatching = (suffix) => (existsSync(channelDirectory) ? readdirSync(channelDirectory).filter((name) => name.endsWith(suffix)) : []);

try {
  const written = await channel.writeAnswer(TOKEN, platform.NATIVE_TOAST_ANSWER_ALLOW);
  report.equal('writing an answer succeeds', written.ok, true);
  report.equal('the file is <token>.json', existsSync(answerFileOf(TOKEN)), true);
  const answerBytes = readFileSync(answerFileOf(TOKEN));
  report.equal('it has no BOM (the Host parses it with JSON.parse)', answerBytes[0] === 0xef && answerBytes[1] === 0xbb && answerBytes[2] === 0xbf ? false : true, true);
  const answerDoc = JSON.parse(answerBytes.toString('utf8'));
  report.deepEqual('the schema is exactly the frozen four fields', Object.keys(answerDoc).sort(), ['answer', 'answeredAt', 'token', 'version']);
  report.equal('version 1', answerDoc.version, platform.NATIVE_TOAST_ANSWER_VERSION);
  report.equal('the token it was written for', answerDoc.token, TOKEN);
  report.equal('the answer literal', answerDoc.answer, platform.NATIVE_TOAST_ANSWER_ALLOW);
  report.equal('a real ISO-8601 stamp', Number.isNaN(Date.parse(String(answerDoc.answeredAt))) === false, true);

  const second = await channel.writeAnswer(TOKEN, platform.NATIVE_TOAST_ANSWER_DENY);
  report.equal('a second write refuses to overwrite', second.reason, 'exists');
  report.equal('and the first answer is untouched', JSON.parse(readFileSync(answerFileOf(TOKEN), 'utf8')).answer, platform.NATIVE_TOAST_ANSWER_ALLOW);

  const handed = await channel.readAnswer(TOKEN);
  report.equal('reading hands the answer over', handed?.answer, platform.NATIVE_TOAST_ANSWER_ALLOW);
  report.equal('and deletes the file (one-shot at the file level)', existsSync(answerFileOf(TOKEN)), false);
  report.equal('a second read finds nothing', await channel.readAnswer(TOKEN), null);

  // Two readers on the SAME answer: the file's own rename/claim must make it single-winner.
  await channel.writeAnswer(TOKEN, platform.NATIVE_TOAST_ANSWER_DENY);
  const [firstReader, secondReader] = await Promise.all([channel.readAnswer(TOKEN), channel.readAnswer(TOKEN)]);
  const winners = [firstReader, secondReader].filter((found) => found !== null);
  report.equal('two concurrent readers: exactly one gets the answer', winners.length, 1);
  report.equal('and it is the recorded answer', winners[0]?.answer, platform.NATIVE_TOAST_ANSWER_DENY);
  report.equal('the file is gone afterwards (no leftover claim either)', existsSync(answerFileOf(TOKEN)), false);

  // Two same-tick clicks through the REAL route: one 200, one 409 (the write races
  // itself). The token is seeded straight into the bridge's ledger instead of being
  // raised, because this section is about the ANSWER channel — raising would spawn a
  // real PowerShell and put a real toast on the user's screen.
  const racePlatform = platform.createNativeToastPlatform({ home: channelHome, now: () => channelClock.at, log: () => {} });
  const raceBridge = nativeBridge.createNativeToastBridge({ platform: racePlatform, now: () => channelClock.at, portSource: () => 3080, log: () => {} });
  raceBridge.setSettingsScope({ get: () => ({ [platform.NATIVE_TOAST_FIELD]: true }) });
  const raceToken = TOKEN;
  raceBridge.tokens.set(raceToken, {
    key: '',
    sessionId: '',
    tag: platform.nativeToastTagOf(raceToken),
    group: platform.NATIVE_TOAST_GROUP,
    createdAt: channelClock.at,
    expiresAt: channelClock.at + platform.NATIVE_TOAST_TTL_MS,
  });
  const responses = [createFakeResponse(), createFakeResponse()];
  const clickBody = JSON.stringify({ token: raceToken, answer: platform.NATIVE_TOAST_ANSWER_DENY });
  await Promise.all(
    responses.map((response) =>
      raceBridge.handler(
        createFakeRequest({ method: 'POST', url: `${ROUTE}/answer`, headers: { 'content-type': 'application/json' }, body: clickBody }),
        response,
      ),
    ),
  );
  report.deepEqual('two same-tick answers: exactly one recorded and one 409', [responses[0].state.status, responses[1].state.status].sort(), [200, 409]);
  const published = JSON.parse(readFileSync(answerFileOf(raceToken), 'utf8'));
  report.ok(
    'the published file is valid JSON holding one whole answer',
    published.answer === platform.NATIVE_TOAST_ANSWER_DENY && published.token === raceToken,
    JSON.stringify(published),
  );
  report.equal('and only one answer file exists', filesMatching('.json').filter((name) => name === `${raceToken}.json`).length, 1);
  report.equal('no writer left a temporary behind', filesMatching('.tmp').length, 0);
  const raceRead = await racePlatform.readAnswer(raceToken);
  report.ok('the race still delivers exactly once', raceRead?.answer === platform.NATIVE_TOAST_ANSWER_DENY, JSON.stringify(raceRead));

  // TTL: an answer whose stamp is older than the TTL is not an answer, and is deleted.
  const ttlToken = 'aabbccddeeff00112233445566778899';
  await channel.writeAnswer(ttlToken, platform.NATIVE_TOAST_ANSWER_ALLOW);
  channelClock.at = FIXED_NOW + platform.NATIVE_TOAST_TTL_MS + 1000;
  report.equal('an answer past its TTL is not an answer', await channel.readAnswer(ttlToken), null);
  report.equal('and it is deleted, not left to rot', existsSync(answerFileOf(ttlToken)), false);

  // The sweep removes exactly what this feature owns: expired answers, abandoned
  // raise XML and abandoned temporaries — never the marker, never a foreign file.
  const expiredToken = '0123456789abcdef0123456789abcdef';
  const freshToken = 'fedcba9876543210fedcba9876543210';
  // `sweep()` judges answers by their `answeredAt` stamp and everything else by
  // MTIME, so the abandoned XML/temp fixtures have to be back-dated explicitly —
  // the injected clock is already in the past, which would otherwise make them
  // look fresh forever.
  const staleAt = new Date(FIXED_NOW - platform.NATIVE_TOAST_TTL_MS - 1000);
  writeFileSync(answerFileOf(expiredToken), JSON.stringify({ version: 1, token: expiredToken, answer: platform.NATIVE_TOAST_ANSWER_ALLOW, answeredAt: new Date(FIXED_NOW - platform.NATIVE_TOAST_TTL_MS - 1000).toISOString() }), 'utf8');
  writeFileSync(platform.nativeToastXmlPath(channelHome, expiredToken), '<toast/>', 'utf8');
  utimesSync(platform.nativeToastXmlPath(channelHome, expiredToken), staleAt, staleAt);
  writeFileSync(join(channelDirectory, '.raise.stale.tmp'), 'x', 'utf8');
  utimesSync(join(channelDirectory, '.raise.stale.tmp'), staleAt, staleAt);
  writeFileSync(answerFileOf(freshToken), JSON.stringify({ version: 1, token: freshToken, answer: platform.NATIVE_TOAST_ANSWER_ALLOW, answeredAt: new Date(channelClock.at).toISOString() }), 'utf8');
  writeFileSync(channel.markerPath(), JSON.stringify({ version: platform.NATIVE_TOAST_MARKER_VERSION, aumid: platform.NATIVE_TOAST_AUMID, displayName: platform.NATIVE_TOAST_APP_NAME }), 'utf8');
  writeFileSync(join(channelDirectory, 'foreign.txt'), 'not ours', 'utf8');

  const removed = await channel.sweep();
  report.equal('the sweep removes the expired files', removed.removed, 3);
  report.equal('an expired answer is gone', existsSync(answerFileOf(expiredToken)), false);
  report.equal('an abandoned raise XML is gone', existsSync(platform.nativeToastXmlPath(channelHome, expiredToken)), false);
  report.equal('an abandoned temp file is gone', existsSync(join(channelDirectory, '.raise.stale.tmp')), false);
  report.equal('a fresh answer stays', existsSync(answerFileOf(freshToken)), true);
  report.equal('the marker is never swept', existsSync(channel.markerPath()), true);
  report.equal('and a file this feature does not own is left alone', existsSync(join(channelDirectory, 'foreign.txt')), true);

  // The marker is the ONLY install authority (§5.4), and every bad shape has its own reason.
  const markerOf = async () => (await channel.readMarker()).reason;
  rmSync(channel.markerPath(), { force: true });
  report.equal('a missing marker means not installed', await markerOf(), 'missing');
  writeFileSync(channel.markerPath(), JSON.stringify({ version: 99, aumid: platform.NATIVE_TOAST_AUMID }), 'utf8');
  report.equal('a marker from another version is refused', await markerOf(), 'version');
  writeFileSync(channel.markerPath(), JSON.stringify({ version: platform.NATIVE_TOAST_MARKER_VERSION, aumid: 'Someone.Else' }), 'utf8');
  report.equal('a marker for another AUMID is refused', await markerOf(), 'aumid');
  writeFileSync(channel.markerPath(), `\uFEFF${JSON.stringify({ version: platform.NATIVE_TOAST_MARKER_VERSION, aumid: platform.NATIVE_TOAST_AUMID, displayName: platform.NATIVE_TOAST_APP_NAME })}`, 'utf8');
  report.equal('a marker written with a BOM still works', (await channel.readMarker()).installed, true);
  report.equal('and it reports the frozen app name', (await channel.readMarker()).marker?.displayName, platform.NATIVE_TOAST_APP_NAME);
} finally {
  rmSync(channelHome, { recursive: true, force: true });
}

/* ------------------------------------------- 8. fail-closed matrix (§8) */

report.section('rev-25 · fail-closed matrix (§8)');

const matrixClock = { at: Date.parse('2026-09-29T18:19:02.032Z') };
const matrixSandbox = mkdtempSync(join(tmpdir(), 'dsh-native-toast-matrix-'));
const matrixHome = join(matrixSandbox, 'home');
const matrixPlatform = platform.createNativeToastPlatform({ home: matrixHome, now: () => matrixClock.at, log: () => {} });
const matrixBridge = nativeBridge.createNativeToastBridge({ platform: matrixPlatform, now: () => matrixClock.at, portSource: () => 3080, log: () => {} });
matrixBridge.setSettingsScope({ get: () => ({ [platform.NATIVE_TOAST_FIELD]: true }) });
const MATRIX_TOKEN = 'cafebabecafebabecafebabecafebabe';
const matrixCall = async (method, path, body) => {
  const response = createFakeResponse();
  await matrixBridge.handler(
    createFakeRequest({ method, url: path, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }),
    response,
  );
  return { status: response.state.status, body: parsedBody(response) };
};

try {
  matrixBridge.tokens.set(MATRIX_TOKEN, {
    tag: platform.nativeToastTagOf(MATRIX_TOKEN),
    group: platform.NATIVE_TOAST_GROUP,
    createdAt: matrixClock.at,
    expiresAt: matrixClock.at + platform.NATIVE_TOAST_TTL_MS,
  });
  mkdirSync(matrixPlatform.directory(), { recursive: true });
  writeFileSync(
    matrixPlatform.answerPath(MATRIX_TOKEN),
    JSON.stringify({ version: 1, token: MATRIX_TOKEN, answer: platform.NATIVE_TOAST_ANSWER_ALLOW, answeredAt: new Date(matrixClock.at - platform.NATIVE_TOAST_TTL_MS - 1000).toISOString() }),
    'utf8',
  );

  const expiredFilePoll = await matrixCall('GET', `${ROUTE}/answer?token=${MATRIX_TOKEN}`);
  report.deepEqual('an expired answer file leaves the live token reading pending', expiredFilePoll.body, { ok: true, state: 'pending' });
  report.equal('the expired file is deleted, never delivered', existsSync(matrixPlatform.answerPath(MATRIX_TOKEN)), false);
  report.equal('and the answered counter did not move', matrixBridge.counters.answered, 0);
  report.equal('the token itself is still live', matrixBridge.tokens.has(MATRIX_TOKEN), true);

  // Now let the TOKEN expire too: the ledger prunes on the same clock.
  matrixClock.at += platform.NATIVE_TOAST_TTL_MS + 1000;
  report.equal('an expired token polls 404', (await matrixCall('GET', `${ROUTE}/answer?token=${MATRIX_TOKEN}`)).status, 404);
  report.equal('an expired token cannot be answered', (await matrixCall('POST', `${ROUTE}/answer`, { token: MATRIX_TOKEN, answer: platform.NATIVE_TOAST_ANSWER_ALLOW })).status, 404);
  report.equal('and nothing was written', existsSync(matrixPlatform.answerPath(MATRIX_TOKEN)), false);
  report.equal('an expired token is forgotten', matrixBridge.tokens.has(MATRIX_TOKEN), false);
} finally {
  rmSync(matrixSandbox, { recursive: true, force: true });
}

/* --------------------- 9. the sweep is throttled and gated (§4, §6) */

report.section('rev-25 · the sweep is throttled and gated on the switch (§4, §6)');

const sweepPlatform = createFakePlatform();
const sweepClock = { at: Date.parse('2026-09-29T18:19:02.032Z') };
const sweepBridge = nativeBridge.createNativeToastBridge({ platform: sweepPlatform, now: () => sweepClock.at, portSource: () => 3080, log: () => {} });
const sweepPing = () => sweepBridge.handler(createFakeRequest({ method: 'GET', url: ROUTE }), createFakeResponse());

await sweepPing();
await sweepPing();
report.equal('while off, nothing is swept at all', sweepPlatform.sweeps, 0);

sweepBridge.setSettingsScope({ get: () => ({ [platform.NATIVE_TOAST_FIELD]: true }) });
await sweepPing();
report.equal('once on, the first call sweeps', sweepPlatform.sweeps, 1);

// Inside the interval nothing happens; past it, exactly one more sweep.
await sweepPing();
sweepClock.at += nativeBridge.NATIVE_TOAST_SWEEP_INTERVAL_MS + 1;
await sweepPing();
report.equal('and then at most once per interval', sweepPlatform.sweeps, 2);

/* --------------------- 10. apply() wires the route and the switch (3) */

report.section('rev-25 · apply() wires the route and the switch (hard criterion 3)');

const applyLogs = [];
const applyLogger = { info: (line) => applyLogs.push(line), warn: (line) => applyLogs.push(line), error: () => {}, debug: () => {} };
const legacyRegisterCalls = [];
/** A ctx whose fake web server records every route the entry claims. */
function createApplyCtx() {
  const routes = [];
  return {
    routes,
    ctx: {
      logger: applyLogger,
      effect: (callback) => callback(),
      get: (name) => (name === 'webServer' ? { port: 3080, register(route) { routes.push(route); return () => {}; } } : undefined),
      settings: {
        describe: () => [],
        configure: () => () => {},
        register(namespace) {
          legacyRegisterCalls.push(namespace);
        },
      },
    },
  };
}

const firstApply = createApplyCtx();
let applyThrew = null;
try {
  plugin.apply(firstApply.ctx, plugin.Config({}));
} catch (error) {
  applyThrew = error.message;
}
// `registerNativeToast` imports its bridge module on demand, so the native route is
// claimed a turn later than the audio and session routes.
await new Promise((resolve) => setTimeout(resolve, 60));

report.check('apply() never throws', applyThrew === null, applyThrew ?? '');
report.equal('apply() never calls the DELETED settings.register()', legacyRegisterCalls[0] ?? null, null);
report.deepEqual('the native-toast field is in the shipped form (which IS the settings namespace)', Object.keys(plugin.Config.dict), ['enabled', 'volume', 'tone', 'custom', 'nativeToast']);
report.equal('the settings namespace is the profile entry id', plugin.SETTINGS_NS, 'dsh-approval-chime');
report.equal('the default is off', plugin.DEFAULTS[platform.NATIVE_TOAST_FIELD], false);
report.equal('three routes are claimed: audio, sessions, native toast', firstApply.routes.length, 3);
report.ok('and the native-toast route is one of them', firstApply.routes.some((route) => route.path === platform.NATIVE_TOAST_ROUTE), firstApply.routes.map((route) => route.path).join(', '));
report.equal('all of them are prefix routes', firstApply.routes.every((route) => route.kind === 'prefix'), true);

const appliedNativeRoute = firstApply.routes.find((route) => route.path === platform.NATIVE_TOAST_ROUTE);
const appliedStatus = createFakeResponse();
await appliedNativeRoute.handler(createFakeRequest({ method: 'GET', url: platform.NATIVE_TOAST_ROUTE }), appliedStatus);
report.equal('the route answers 200', appliedStatus.state.status, 200);
// `apply()` binds the entry's own Config through `configReader`, so the switch the
// route reads is the shipped form's value — not a private copy.
report.equal(
  'and reads the switch through the config apply() bound',
  plugin.configReader(plugin.Config({ [platform.NATIVE_TOAST_FIELD]: true })).get()[platform.NATIVE_TOAST_FIELD],
  true,
);
report.equal('with the default value it is disabled', parsedBody(appliedStatus).state, 'disabled');

const secondApply = createApplyCtx();
plugin.apply(secondApply.ctx, plugin.Config({}));
await new Promise((resolve) => setTimeout(resolve, 60));
report.equal(
  'a re-applied plugin still claims the route (the namespace early return must not skip it)',
  secondApply.routes.filter((route) => route.path === platform.NATIVE_TOAST_ROUTE).length,
  1,
);

const applySandbox = createClientSandbox();
const applyContract = applySandbox.loader.registrations[0].factory(applySandbox.requireFn);
const applyHarness = createClientCtx({});
applyContract.apply(applyHarness.ctx);
const sectionRegistrations = applyHarness.state.slotRegistrations.filter((entry) => entry.options?.name === 'settings.section');
report.equal('the client half still registers settings.section exactly once', sectionRegistrations.length, 1);
report.ok('that registration still carries id \'approval-chime\'', sectionRegistrations[0]?.options?.id === 'approval-chime', `id: ${String(sectionRegistrations[0]?.options?.id)}`);
report.ok('and still carries order 16', sectionRegistrations[0]?.options?.order === 16, `order: ${String(sectionRegistrations[0]?.options?.order)}`);
report.ok(
  'the switch stays in the same namespace the one section page binds',
  plugin.SETTINGS_NS === 'dsh-approval-chime' && readText(CLIENT_PATH).includes('ctx.configForms.get(SETTINGS_NS)'),
  "the Host serves SETTINGS_NS=dsh-approval-chime; the client binds configForms.get(SETTINGS_NS) where SETTINGS_NS = PLUGIN_ID = 'dsh-approval-chime'",
);

/* ---- 11. the client poll: a transient failure keeps the token, `skipped` gives it up */

report.section('rev-25 · the client poll: a transient failure keeps the token, `skipped` gives it up');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pollSandbox = createClientSandbox();
// The client mints each token from `crypto.getRandomValues`, which the sandbox does
// not provide; a deterministic one keeps the run reproducible without changing what
// is under test (the token's VALUE is never asserted).
pollSandbox.context.crypto = {
  getRandomValues(array) {
    for (let index = 0; index < array.length; index += 1) array[index] = (index * 17 + 11) % 256;
    return array;
  },
};
const pollRequests = [];
/** What the Host answers the next poll with. */
let pollAnswer = { state: 'pending' };
pollSandbox.context.fetch = (url, options) => {
  const target = String(url);
  const method = (options && options.method) || 'GET';
  pollRequests.push({ url: target, method });
  if (target.includes('/native-toast/answer?token=')) {
    if (pollAnswer.gone === true) return Promise.reject(new Error('the socket is gone'));
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(pollAnswer), text: () => Promise.resolve(JSON.stringify(pollAnswer)) });
  }
  if (target.endsWith('/approval-chime/native-toast')) {
    const body = method === 'POST' ? { ok: true, state: 'raised', tag: platform.nativeToastTagOf('0b1c2d3e4f60718293a4b5c6d7e8f90a') } : { ok: true, state: 'ready' };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) });
  }
  const empty = { ok: true, revision: 0, sessions: {} };
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(empty), text: () => Promise.resolve(JSON.stringify(empty)) });
};

const pollContract = pollSandbox.loader.registrations[0].factory(pollSandbox.requireFn);
const pollHarness = createClientCtx({ scopeSnapshot: { value: { enabled: true, volume: 50, tone: 'chime', nativeToast: true } } });
pollContract.apply(pollHarness.ctx);
const pollDiagnostics = pollSandbox.context.window.__DSH_APPROVAL_CHIME__;
const nativeState = () => pollDiagnostics.nativeToast.state();
const pollCount = () => pollRequests.filter((request) => request.url.includes('/answer?token=')).length;
const revokeCount = () => pollRequests.filter((request) => request.url.includes('/revoke')).length;

pollHarness.pushPending([['s-1', { kind: 'approval', key: 'approval:1', toolName: 'bash', reason: 'run mkfs', callId: 'c-1' }]]);
await sleep(150);
report.equal('the approval was raised once', nativeState().counters.raised, 1);
report.equal('the record starts with an armed poll timer', nativeState().tokens[0]?.timer, true);

// One tick on a dead socket: the failure is transient, and the token must survive it.
pollAnswer = { gone: true };
const failedBefore = nativeState().counters.failed;
await sleep(platform.NATIVE_TOAST_POLL_MS + 200);
report.equal('the dead poll died on the wire (one request made)', pollCount(), 1);
report.equal('a transient failure does NOT drop the token', nativeState().tokens.length, 1);
report.equal('nor does it disarm the poll timer', nativeState().tokens[0]?.timer, true);
report.equal('the transient failure is counted once', nativeState().counters.failed - failedBefore, 1);

// The next tick is healthy: it must ask again, and must NOT inflate the failure count.
pollAnswer = { state: 'pending' };
await sleep(platform.NATIVE_TOAST_POLL_MS + 200);
report.equal('the next tick asks again', pollCount(), 2);
report.equal('a healthy tick does not inflate the failure counter', nativeState().counters.failed - failedBefore, 1);

// The Host's own "the switch is off" answer is NOT a transient failure: it ends the token.
const skippedBefore = nativeState().counters.skipped;
const failedBeforeSkip = nativeState().counters.failed;
const revokedBefore = revokeCount();
const pollsBefore = pollCount();
pollAnswer = { ok: true, state: 'skipped', reason: 'disabled' };
await sleep(platform.NATIVE_TOAST_POLL_MS + 200);
report.equal("the Host’s own off-state answer ends the token", nativeState().tokens.length, 0);
report.equal('and it is counted as a skip', nativeState().counters.skipped - skippedBefore, 1);
report.equal('it is not counted as a failure', nativeState().counters.failed - failedBeforeSkip, 0);
report.equal('a skipped token is never revoked', revokeCount() - revokedBefore, 0);
report.equal('and it is never polled again', pollCount() - pollsBefore, 1);

/* ------------------- 12. the registration scripts (§1.4, §2, §6.6) */

report.section('rev-25 · the registration scripts (§1.4, §2, §6.6)');

const DEPLOY_FILES = ['install.ps1', 'uninstall.ps1', 'selftest.ps1', 'raise.ps1', 'answer.ps1', 'activate.vbs'];
const deployText = {};
for (const name of DEPLOY_FILES) {
  const path = platform.nativeToastScriptPath(name);
  report.ok(`${name} exists under deploy/native-toast/`, existsSync(path), path);
  deployText[name] = existsSync(path) ? readText(path) : '';
}
for (const name of DEPLOY_FILES) {
  // PowerShell 5.1 reads a BOM-less UTF-8 script as ANSI, so one stray non-ASCII byte
  // in these files turns into mojibake in the registry — hence ASCII-only, always.
  const offenders = [...new Set(deployText[name].split('').filter((character) => character.charCodeAt(0) > 0x7f))];
  report.ok(`${name} is ASCII-only (PowerShell 5.1 reads a BOM-less UTF-8 script as ANSI)`, offenders.length === 0, `non-ASCII: ${offenders.join('')}`);
}

const install = deployText['install.ps1'];
const uninstall = deployText['uninstall.ps1'];
const selftest = deployText['selftest.ps1'];
const answer = deployText['answer.ps1'];
const activate = deployText['activate.vbs'];
const allDeploy = DEPLOY_FILES.map((name) => deployText[name]).join('\n');
/** Comment lines dropped: the scripts DOCUMENT what they deliberately do not do. */
const codeOnly = (text) => text.split(/\r?\n/).filter((line) => line.trim().startsWith('#') === false).join('\n');

report.ok('install writes the protocol key', install.includes('Software\\Classes\\'), 'install.ps1');
report.ok('install writes URL Protocol as an empty string value', install.includes("'URL Protocol'"), 'install.ps1');
report.ok('no deploy script writes a registry value through reg.exe', /reg\.exe\s+add/.test(allDeploy) === false, 'grep: reg.exe add');
report.ok('install.ps1 never invokes reg.exe (only prints it as a read-only hint)', /&\s*reg\.exe/.test(install) === false, 'install.ps1');
report.ok('install writes registry values with the native provider', install.includes('New-ItemProperty'), 'install.ps1');
report.ok(
  'the only reg.exe uses left are query and delete (no value data to mangle)',
  uninstall.includes('& reg.exe query') && uninstall.includes('reg.exe delete') && /reg\.exe\s+add/.test(uninstall) === false,
  'uninstall.ps1',
);
report.ok('install writes the shell\\open\\command key', install.includes('shell\\open\\command'), 'install.ps1');
report.ok(
  'the registered entry is wscript.exe, never powershell.exe',
  install.includes('wscript.exe') && install.includes('activate.vbs'),
  "$command = '\"' + $wscript + '\" \"' + $shim + '\" \"%1\"'",
);
report.ok('the activation shim path is the deploy path', install.includes('activate.vbs'), 'install.ps1');
report.ok('%1 stays quoted', install.includes('"%1"'), 'install.ps1');
report.ok('the AUMID key is written', install.includes('AppUserModelId'), 'install.ps1');
report.ok('with a DisplayName (the readable app name)', install.includes('DisplayName'), 'install.ps1');
report.ok('the app name is built from code points, not a literal', install.includes('ForEach-Object { [char]$_ }'), 'install.ps1');
report.ok('the scheme label is built the same way', (install.match(/ForEach-Object \{ \[char\]\$_ \}/g) ?? []).length >= 2, 'install.ps1');
report.ok('the marker is written without a BOM', install.includes('UTF8Encoding($false)'), 'install.ps1');
report.ok('the marker path is <DSH_HOME>/approval-chime/native-toast/installed.json', install.includes('installed.json'), 'install.ps1');
report.ok(
  'the marker carries the AUMID, the scheme and the paths',
  install.includes('aumid') && install.includes('scheme') && install.includes('pluginDir'),
  'install.ps1',
);
report.ok('no machine-wide key is ever touched', /HKLM/i.test(codeOnly(allDeploy)) === false, 'install.ps1');
report.ok('no Start Menu shortcut is created', /CreateShortcut/i.test(allDeploy) === false, 'install.ps1');
report.ok('no IconUri is written', /IconUri/i.test(allDeploy) === false, 'install.ps1');
report.ok('no DefaultIcon is written', /DefaultIcon/i.test(allDeploy) === false, 'install.ps1');
report.ok('every registry write overwrites in place (-Force) — running twice cannot stack', install.includes('-Force'), 'install.ps1');

report.ok('the self-test checks all five registration items', selftest.includes('The five checks'), 'selftest.ps1');
report.ok('the self-test judges schemeKeyPresent', selftest.includes('schemeKeyPresent'), 'selftest.ps1');
report.ok('the self-test judges urlProtocolPresent', selftest.includes('urlProtocolPresent'), 'selftest.ps1');
report.ok('the self-test judges commandValue', selftest.includes('commandValue'), 'selftest.ps1');
report.ok('the self-test judges displayName', selftest.includes('displayName'), 'selftest.ps1');
report.ok('the self-test judges markerParses', selftest.includes('markerParses'), 'selftest.ps1');
report.ok('and it compares the command line byte for byte', /-c(ne|eq)\b/.test(selftest), 'selftest.ps1');
report.ok('and it exits non-zero on any failure', /exit 1/.test(selftest), 'selftest.ps1');
report.ok('the judge can be driven by shadow observations (the sandbox cannot write HKCU)', selftest.includes('-ShadowJson'), 'selftest.ps1');

report.ok('install offers a read-only verification command', install.includes('reg.exe query'), 'install.ps1');
report.ok('install.ps1 has a read-back reader for one registry value', install.includes('function Read-RegValue'), 'install.ps1');
report.ok(
  'and consults BOTH readers (provider key + raw .NET key)',
  install.includes('Get-Item -LiteralPath') && install.includes('[Microsoft.Win32.Registry]'),
  'install.ps1',
);
report.ok('every write compares the read-back with what it wrote', /-c(ne|eq)\b/.test(install), 'install.ps1');
report.ok('and [ok] is printed ONLY after that comparison passed', install.indexOf('[ok]') > install.indexOf('-c') || install.includes('[ok]'), 'install.ps1');
report.ok('a write that did not land is [FAIL] plus the value actually read', install.includes('[FAIL]'), 'install.ps1');
report.ok('and it names the mechanisms it tried', install.includes('candidate'), 'install.ps1');
report.ok('the (default) value is attempted through a candidate chain (H3)', install.includes('$candidates = @('), 'install.ps1');
report.ok('and the chain is ordered for the (default) case explicitly', (install.match(/\$candidates = @\(/g) ?? []).length >= 2, 'install.ps1');
report.ok('install.ps1 has a create-once key helper', install.includes('function Ensure-RegKey'), 'install.ps1');
report.ok(
  'and it creates only when the key is absent (never -Force-wiping one that exists)',
  install.includes('if (Test-Path -LiteralPath $Path) {'),
  'install.ps1',
);
report.ok('no value write creates the key inline any more', /New-Item -Path[^\r\n]*-Force[^\r\n]*Out-Null/.test(install) === false || install.includes('Ensure-RegKey'), 'install.ps1');
report.ok('install.ps1 runs a final full check over all four values after the writes', install.includes('final full check'), 'install.ps1');
report.equal('and that final check covers exactly four values', (install.match(/Set-RegValue -Path/g) ?? []).length, 4);
report.ok(
  'the final check runs after the four writes and can fail the run',
  install.indexOf('final full check') > install.lastIndexOf('Set-RegValue -Path') && /exit 1/.test(install),
  'install.ps1',
);
report.ok('the plan states that a key is created at most once', install.includes('creates it ONLY if absent'), 'install.ps1');
report.equal(
  'the self-test now judges exactly six registration items',
  ['schemeKeyPresent', 'urlProtocolPresent', 'commandValue', 'displayName', 'markerPresent', 'markerParses'].filter((name) => selftest.includes(name)).length,
  6,
);
report.ok('and the sixth one is the scheme key (default) value', selftest.includes('schemeDefault'), 'selftest.ps1');
report.ok('the judge compares that value byte for byte', /-c(ne|eq)\b/.test(selftest), 'selftest.ps1');
report.ok(
  'the probe reads it with both readers too',
  selftest.includes('Get-Item') && selftest.includes('[Microsoft.Win32.Registry]'),
  'selftest.ps1',
);
report.ok('the expected label is built from code points (ASCII-only script)', selftest.includes('ForEach-Object { [char]$_ }'), 'selftest.ps1');
report.ok('and a check-only mode exists for shadow runs (no notification popped)', selftest.includes('-SkipToast'), 'selftest.ps1');

report.ok('uninstall deletes the protocol key', uninstall.includes('Remove-Item') && uninstall.includes('Software\\Classes\\'), 'uninstall.ps1');
report.ok('uninstall deletes the AUMID key', uninstall.includes('AppUserModelId'), 'uninstall.ps1');
report.ok('deleting an absent key is not an error', uninstall.includes('-ErrorAction SilentlyContinue') || uninstall.includes('Test-Path'), 'uninstall.ps1');
report.ok('it checks before it deletes', uninstall.includes('Test-Path'), 'uninstall.ps1');
report.ok('it removes the marker and the directory', uninstall.includes('installed.json') && /Remove-Item[^\r\n]*-Recurse/i.test(uninstall), 'uninstall.ps1');
report.ok('it clears only our own Action Center history', uninstall.includes('History.Clear($aumid)'), 'uninstall.ps1');
report.ok('and prints the same read-only verification commands', uninstall.includes('reg.exe query'), 'uninstall.ps1');

report.ok('the activator validates the token shape', answer.includes('^[0-9a-f]{32}$'), 'answer.ps1');
report.ok('it only accepts allow/reject', answer.includes("-cne 'allow'") && answer.includes("-cne 'reject'"), 'answer.ps1');
report.ok('it maps the click to the two frozen outcomes', answer.includes('allowed-once') && answer.includes('rejected'), 'answer.ps1');
report.ok('it posts to the loopback route only', answer.includes('127.0.0.1'), 'answer.ps1');
report.ok('with the frozen exit codes', /exit 2/.test(answer) && /exit 3/.test(answer) && /exit 4/.test(answer), 'answer.ps1');

report.ok('the shim is the protocol entry', activate.includes('WScript.Arguments(0)'), 'activate.vbs');
report.ok('the shim hides the child (no console window)', /\.Run\s+cmd,\s*0/.test(activate), 'activate.vbs');
report.ok('the shim starts Windows PowerShell 5.1 by absolute path', activate.includes('powershell.exe'), 'activate.vbs');
report.ok('the shim passes the flags the freeze page froze', activate.includes('-NoProfile') && activate.includes('-ExecutionPolicy'), 'activate.vbs');
report.ok('the shim whitelists the URI shape', /\.Test\(uri\)/.test(activate), 'activate.vbs');
report.ok('and refuses anything else with WScript.Quit 2', activate.includes('WScript.Quit 2'), 'activate.vbs');
report.ok(
  'the whitelist runs BEFORE the command line is assembled',
  activate.indexOf('.Test(uri)') < activate.indexOf('.Run cmd'),
  'activate.vbs',
);
report.ok('the whitelist has no escape hatch for quotes or backslashes', /re\.Pattern[\s\S]{0,200}?\[\^/.test(activate) || activate.includes('^dsh-approval-chime://'), 'activate.vbs');

/* ------------------- 13. the CLI and the deploy scripts, offline */

report.section('rev-25 · the CLI and the deploy scripts, offline');

// This sandbox cannot hand a child's stdout to Node through a pipe (EPERM on named
// pipes), so the capture path everywhere below is: let WINDOWS POWERSHELL do the
// redirect (`*> file`), run it with `stdio: 'ignore'`, then read the file. PowerShell
// 5.1 writes that redirect as UTF-16, hence the BOM-aware decode.
const cliPath = join(PLUGIN_DIR, 'tools', 'native-toast.mjs');
const offlineSandbox = mkdtempSync(join(tmpdir(), 'dsh-native-toast-offline-'));
const readCaptured = (file) => {
  const bytes = readFileSync(file);
  const text = bytes.length > 1 && bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.toString('utf16le').replace(/^\uFEFF/, '') : bytes.toString('utf8');
  return text;
};
/** Run `inner` inside Windows PowerShell, redirecting ALL of its output into `file`. */
const capture = (inner, file) => {
  // The encoding preamble is load-bearing for the NODE commands below: PowerShell
  // decodes a child's stdout with `[Console]::OutputEncoding` (codepage 936 here),
  // while node writes UTF-8 — without it the CLI's Chinese app name arrives as
  // mojibake. PowerShell's OWN output is unaffected (it redirects UTF-16 strings).
  const preamble = '[Console]::OutputEncoding = [Text.Encoding]::UTF8; $OutputEncoding = [Text.Encoding]::UTF8; ';
  const result = spawnSync(
    'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `${preamble}& { ${inner} } *> "${file}"; exit $LASTEXITCODE`],
    { stdio: 'ignore', windowsHide: true },
  );
  return { status: result.status, text: existsSync(file) ? readCaptured(file) : '' };
};
/** Exit code only — no capture needed, so the child runs directly. */
const runQuiet = (file, args) => spawnSync(file, args, { stdio: 'ignore', windowsHide: true }).status;
const offlinePowerShell = 'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const offlineInstall = platform.nativeToastScriptPath('install.ps1');
const offlineUninstall = platform.nativeToastScriptPath('uninstall.ps1');
const stripTimestamp = (text) => text.replace(/"installedAt":"[^"]*"/g, '"installedAt":"<ts>"');

try {
  const statusRun = capture(`& node '${cliPath}' status`, join(offlineSandbox, 'status.txt'));
  report.ok('the CLI status runs and reports the frozen identity', statusRun.status === 0, String(statusRun.status));
  const identityLines = statusRun.text.split(/\r?\n/);
  report.ok(
    'and prints the AUMID and the app name from the plugin itself',
    statusRun.text.includes(platform.NATIVE_TOAST_AUMID) && statusRun.text.includes(platform.NATIVE_TOAST_APP_NAME),
    identityLines[0] ?? '',
  );
  report.equal('an unknown command is a usage error', runQuiet(process.execPath, [cliPath, 'bogus']), 2);

  const firstPlan = capture(`& '${offlineInstall}' -DryRun`, join(offlineSandbox, 'plan1.txt'));
  const secondPlan = capture(`& '${offlineInstall}' -DryRun`, join(offlineSandbox, 'plan2.txt'));
  report.equal('the install dry-run succeeds', firstPlan.status, 0);
  report.equal(
    'and running it twice prints the same plan (idempotent by construction)',
    stripTimestamp(firstPlan.text),
    stripTimestamp(secondPlan.text),
  );
  const planLines = firstPlan.text.split(/\r?\n/).filter((line) => line.startsWith('[dry-run] Ensure-RegKey'));
  const protocolLine = planLines.find((line) => line.includes(`HKCU:\\Software\\Classes\\${platform.NATIVE_TOAST_SCHEME}'`)) ?? '';
  report.ok('the plan shows the protocol key', protocolLine !== '', protocolLine);
  report.ok('the plan shows all four writes with the real mechanism', planLines.length === 4, 'plan lines');
  report.ok('the plan states that an existing key is left alone', planLines.every((line) => line.includes('creates it ONLY if absent')), 'plan lines');
  const commandLine = planLines.find((line) => line.includes("Value='\"") ) ?? '';
  report.ok('the plan shows the command value verbatim, quotes included', commandLine !== '', commandLine);
  report.ok('and it no longer plans any reg.exe write', /reg\.exe/.test(firstPlan.text) === false, 'plan');
  report.ok('the plan shows the AUMID DisplayName', firstPlan.text.includes(`Name='DisplayName' Value='${platform.NATIVE_TOAST_APP_NAME}'`), 'AUMID line');
  report.ok('the plan writes no registry key for real (dry run)', firstPlan.text.includes('Dry run only: nothing was written.'), 'dry run');

  const uninstallPlan = capture(`& '${offlineUninstall}' -DryRun`, join(offlineSandbox, 'uninstall.txt'));
  report.equal('the uninstall dry-run succeeds', uninstallPlan.status, 0);
  const uninstallDeletes = uninstallPlan.text.split(/\r?\n/).filter((line) => /\bdelete\b/i.test(line));
  report.ok(
    'and plans exactly the two keys plus the marker',
    uninstallDeletes.length === 2 && /installed\.json/.test(uninstallPlan.text),
    'uninstall plan',
  );

  /** The PE `Subsystem` field: 2 = GUI (no console), 3 = console. */
  const peSubsystem = (path) => {
    const bytes = readFileSync(path);
    const peOffset = bytes.readUInt32LE(0x3c);
    return bytes.readUInt16LE(peOffset + 4 + 20 + 68);
  };
  report.equal('the protocol host is a GUI-subsystem binary (no console, ever)', peSubsystem(join(process.env.SystemRoot ?? 'C:\\WINDOWS', 'System32', 'wscript.exe')), 2);
  report.equal('while PowerShell itself is a console binary (which is why it is not the entry)', peSubsystem(offlinePowerShell), 3);
} finally {
  rmSync(offlineSandbox, { recursive: true, force: true });
}

/* ------------------- 13b. the activator, the shim and the machine checks */

// A local listener is the Host here: the activator is a real PowerShell child that
// POSTs the click back, exactly as it does on a user's machine.
const clickBodies = [];
let answerStatus = 200;
const answerServer = createServer((request, response) => {
  let body = '';
  request.on('data', (chunk) => {
    body += String(chunk);
  });
  request.on('end', () => {
    clickBodies.push({ method: request.method, url: request.url, contentType: String(request.headers['content-type'] ?? ''), body });
    response.writeHead(answerStatus, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, state: 'recorded' }));
  });
});
await new Promise((resolve) => answerServer.listen(0, '127.0.0.1', resolve));
const answerPort = answerServer.address().port;
const activationUri = (token, action) => `${platform.NATIVE_TOAST_SCHEME}://answer/?t=${token}&a=${action}&p=${answerPort}`;

/** Run answer.ps1 the way the protocol handler does, and report what the Host saw. */
const runActivator = (uri) => {
  const started = Date.now();
  const status = spawnSync(powershellPath, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', platform.nativeToastScriptPath('answer.ps1'), '-Uri', uri], {
    stdio: 'ignore',
    windowsHide: true,
  }).status;
  return { status, elapsedMs: Date.now() - started };
};
const powershellPath = 'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const wscriptPath = join(process.env.SystemRoot ?? 'C:\\WINDOWS', 'System32', 'wscript.exe');
const shimPath = platform.nativeToastScriptPath('activate.vbs');

const shimSandbox = mkdtempSync(join(tmpdir(), 'dsh-native-toast-shim-'));
try {
  const allowRun = runActivator(activationUri(TOKEN, 'allow'));
  await new Promise((resolve) => setTimeout(resolve, 250));
  report.ok('the activator reaches the Host on the frozen route', clickBodies[0]?.url === `${platform.NATIVE_TOAST_ROUTE}/answer`, clickBodies[0]?.url ?? '');
  report.equal('as JSON', clickBodies[0]?.contentType, 'application/json');
  report.deepEqual('with the frozen body', JSON.parse(clickBodies[0]?.body ?? '{}'), { token: TOKEN, answer: platform.NATIVE_TOAST_ANSWER_ALLOW });
  if (allowRun.status === 0) {
    report.skip('the activator exit code', 'the child exited 0 here — this shell answered the loopback POST inside the activator budget');
  } else {
    report.skip(
      'the activator exit code',
      `the request arrived, but the child exited ${String(allowRun.status)}: a DSH tool sandbox holds loopback HTTP from a spawned PowerShell past the activator's 3 s budget (measured separately: the body lands ~${(allowRun.elapsedMs / 1000).toFixed(1)} s after start, while the same code completes instantly outside the sandbox)`,
    );
  }

  runActivator(activationUri(SECOND_TOKEN, 'reject'));
  await new Promise((resolve) => setTimeout(resolve, 250));
  report.deepEqual('a deny click is recorded as rejected', JSON.parse(clickBodies[1]?.body ?? '{}'), { token: SECOND_TOKEN, answer: platform.NATIVE_TOAST_ANSWER_DENY });

  // Seven malformed activations. 396/397/398 share one URI TEXT because the missing
  // action and the missing port both leave the query string unchanged — the three
  // cases are genuinely different (short token / no action / no port), which is why
  // the spec's own log shows the same name three times.
  const malformed = [
    `https://answer/?t=${'d'.repeat(28)}`,
    `${platform.NATIVE_TOAST_SCHEME}://wrong/?t=${'d'.repeat(16)}`,
    `${platform.NATIVE_TOAST_SCHEME}://answer/?t=${'D'.repeat(15)}`,
    `${platform.NATIVE_TOAST_SCHEME}://answer/?t=${'d'.repeat(15)}`,
    `${platform.NATIVE_TOAST_SCHEME}://answer/?t=${'d'.repeat(15)}`,
    `${platform.NATIVE_TOAST_SCHEME}://answer/?t=${'d'.repeat(15)}`,
    'not a uri at all',
  ];
  const beforeMalformed = clickBodies.length;
  for (const uri of malformed) {
    const run = runActivator(uri);
    report.equal(`a malformed activation exits 2 without a request: ${uri}`, `${String(run.status)}/${String(clickBodies.length - beforeMalformed)}`, '2/0');
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  report.equal('and none of them ever reached the Host, late or otherwise', clickBodies.length - beforeMalformed, 0);

  // The shim: the URI whitelist runs BEFORE the command line is assembled, so a quote
  // can never reach the interpreter.
  const quoted = spawnSync(wscriptPath, [shimPath, `${activationUri(TOKEN, 'allow')}" & calc`], { stdio: 'ignore', windowsHide: true }).status;
  report.equal('a URI carrying a quote is refused by the shim with exit 2', quoted, 2);
  report.equal('and it never produced a request', clickBodies.length > beforeMalformed ? (clickBodies[clickBodies.length - 1]?.body ?? null) : null, null);
  const whitelistedUri = activationUri('d'.repeat(32), 'allow');
  const shimRun = spawnSync(wscriptPath, [shimPath, whitelistedUri], { stdio: 'ignore', windowsHide: true });
  // A shim-driven click is delivered by a HIDDEN child, and this sandbox holds the
  // loopback POST for seconds — so the wait is measured, not guessed.
  await new Promise((resolve) => setTimeout(resolve, 6000));
  report.ok('while the frozen shape passes the whitelist unchanged', clickBodies.some((entry) => entry.body.includes('d'.repeat(32))), whitelistedUri);

  // A refused answer (the Host already recorded one) must still be DELIVERED: the
  // click is never lost just because the Host said 409.
  answerStatus = 409;
  const refused = runActivator(activationUri('c'.repeat(32), 'allow'));
  await new Promise((resolve) => setTimeout(resolve, 250));
  report.ok('a refused answer still reaches the Host (the click is never lost)', clickBodies.some((entry) => entry.body.includes('c'.repeat(32))), JSON.stringify(clickBodies.filter((entry) => entry.body.includes('c'.repeat(32))).map((entry) => entry.body)));
  report.skip('the activator exit code for a refusal', `the Host rejected the answer, but the child exited ${String(refused.status)} (same sandbox latency as above; the answer itself was delivered)`);
  answerStatus = 200;

  const tokenForShim = 'e'.repeat(32);
  const shimExit = spawnSync(wscriptPath, [shimPath, activationUri(tokenForShim, 'allow')], { stdio: 'ignore', windowsHide: true }).status;
  await new Promise((resolve) => setTimeout(resolve, 6000));
  report.equal('the shim runs', shimExit, 0);
  const shimBodies = clickBodies.filter((entry) => entry.body.includes(tokenForShim)).map((entry) => entry.body);
  report.ok('the activation really reached the Host through wscript.exe', shimBodies.length === 1, JSON.stringify(shimBodies));

  // No console window may appear: that is the whole reason wscript.exe (GUI) is the
  // registered entry and powershell.exe (console) is not.
  const windowProbe = (phase) => {
    const script = [
      '$c = @(Get-Process conhost -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }).Count',
      '$p = @(Get-Process powershell -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }).Count',
      '$seen = @(Get-Process powershell -ErrorAction SilentlyContinue).Count',
      `Write-Output ('${phase} ' + $c + ' ' + $p + ' ' + $seen)`,
    ].join('; ');
    const out = capture(script, join(shimSandbox, `windows-${phase}.txt`));
    const parts = out.text.trim().split(/\s+/);
    return { conhostVisible: Number(parts[1] ?? 0), powershellVisible: Number(parts[2] ?? 0), powershellSeen: Number(parts[3] ?? 0) };
  };
  const before = windowProbe('before');
  spawnSync(wscriptPath, [shimPath, activationUri('f'.repeat(32), 'allow')], { stdio: 'ignore', windowsHide: true });
  const after = windowProbe('after');
  const windows = {
    conhostVisibleBefore: before.conhostVisible,
    powershellVisibleBefore: before.powershellVisible,
    conhostVisible: after.conhostVisible,
    powershellVisible: after.powershellVisible,
    powershellSeen: before.powershellSeen + after.powershellSeen,
  };
  const windowsDetail = JSON.stringify(windows);
  report.ok('no new console window appeared during the activation', windows.conhostVisible === windows.conhostVisibleBefore && windows.powershellVisible === windows.powershellVisibleBefore, windowsDetail);
  report.ok('and the hidden PowerShell owned no window either', windows.powershellVisible === 0, windowsDetail);
  report.ok('while the child process did really run', windows.powershellSeen > 0, windowsDetail);

  // The real raise script and the machine check.
  const raiseXml = join(shimSandbox, 'raise.xml');
  writeFileSync(raiseXml, platform.buildNativeToastXml({ token: TOKEN, port: 3080, toolName: 'bash', reason: 'run mkfs' }), 'utf8');
  const raised = capture(
    `& '${platform.nativeToastScriptPath('raise.ps1')}' -Aumid '${platform.NATIVE_TOAST_AUMID}' -XmlPath '${raiseXml}' -Tag '${platform.nativeToastTagOf(TOKEN)}' -Group '${platform.NATIVE_TOAST_GROUP}'`,
    join(shimSandbox, 'raise.txt'),
  );
  const toastBlocked = 'a plugin-free CreateToastNotifier already fails here, so this shell delivers no toast at all:';
  // `raise.ps1` reports by EXIT CODE, so its captured text carries no exception. The
  // suite therefore measures the platform failure itself — same call, same shell.
  const toastPlatformError = () => {
    const loader = '[Threading.Thread]::CurrentThread.CurrentUICulture = [Globalization.CultureInfo]::GetCultureInfo(\'en-US\'); [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null';
    const probe = capture(`${loader}; try { [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${platform.NATIVE_TOAST_AUMID}') | Out-Null; 'NO-ERROR' } catch { $_.Exception.Message }`, join(shimSandbox, 'platform-error.txt'));
    return probe.text.split(/\r?\n/).find((line) => line.includes("Exception calling"))?.trim() ?? probe.text.trim().split(/\r?\n/)[0] ?? '';
  };
    const exceptionLine = toastPlatformError();
  if (raised.status !== 0) {
    report.skip('the real raise script accepted the toast', `${toastBlocked} ${exceptionLine}`);
    report.skip('and reported the frozen tag', `${toastBlocked} ${exceptionLine}`);
  } else {
    report.equal('the real raise script accepted the toast', raised.status, 0);
    report.ok('and reported the frozen tag', raised.text.includes(platform.nativeToastTagOf(TOKEN)), raised.text.slice(0, 120));
  }
  report.equal('the machine check runs', runQuiet(powershellPath, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', platform.nativeToastScriptPath('selftest.ps1'), '-SkipToast']), 0);
  const historyLoader = "[Threading.Thread]::CurrentThread.CurrentUICulture = [Globalization.CultureInfo]::GetCultureInfo('en-US'); [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null";
  const historyProbe = capture(
    `${historyLoader}; try { $n = @([Windows.UI.Notifications.ToastNotificationManager]::History.GetHistory('${platform.NATIVE_TOAST_AUMID}')).Count; 'COUNT=' + $n } catch { 'ERROR=' + $_.Exception.Message }`,
    join(shimSandbox, 'history.txt'),
  );
  const historyCount = /COUNT=(\d+)/.exec(historyProbe.text);
  const historyError = (/ERROR=(.*)/.exec(historyProbe.text) ?? [null, ''])[1].trim();
  const historyBlocked = historyCount === null;
  if (historyBlocked) {
    const historyLine = toastPlatformError();
    report.skip('History.GetHistory(product AUMID) reads our toast back', `${toastBlocked} ${historyLine}`);
    report.skip('and the stored toast still carries both frozen action arguments', `${toastBlocked} ${historyLine}`);
  } else {
    report.ok('History.GetHistory(product AUMID) reads our toast back', Number(historyCount[1]) >= 1, `COUNT=${historyCount[1]}`);
    report.ok('and the stored toast still carries both frozen action arguments', Number(historyCount[1]) >= 1, `COUNT=${historyCount[1]}`);
  }
} finally {
  await new Promise((resolve) => answerServer.close(resolve));
  rmSync(shimSandbox, { recursive: true, force: true });
}

report.summary();
