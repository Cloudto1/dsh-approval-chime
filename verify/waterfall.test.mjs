/**
 * Headless self-test — the approval waterfall is untouched (the central risk of
 * this plugin, and the reason its trigger is not a waterfall listener).
 *
 * Three independent kinds of evidence:
 *  1. STATIC — the shipped browser bundle contains neither the approval event name
 *     nor the remote-event subscription API, and never injects `remote`; the Host
 *     half contains the event name nowhere either. A plain text check is therefore
 *     a valid check.
 *  2. RUNTIME (stubbed platform) — after `apply()`, zero remote-event subscriptions
 *     exist, while the pending-interaction source is subscribed. The chime fires
 *     even in the exact hostile scenario a waterfall listener would die in.
 *  3. RUNTIME (the Host's real cordis, when this machine has it) — the measured
 *     waterfall semantics the design decision rests on:
 *       - a listener that never calls `next()` ends the chain and its answer is
 *         returned unchanged;
 *       - every listener registered after it is never invoked;
 *       - `prepend` does work through `ctx.on`, so the only reason the remote-event
 *         API cannot be used is that it forwards exactly two arguments.
 *
 * Run: node dsh-approval-chime/verify/waterfall.test.mjs
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  CLIENT_PATH,
  HOST_PATH,
  approvalInteraction,
  createClientCtx,
  createClientSandbox,
  createReporter,
  readText,
  resolveCordis,
  resolveHostPackage,
} from './_harness.mjs';

const report = createReporter('waterfall.test.mjs');
const clientSource = readText(CLIENT_PATH);
const hostSource = readText(HOST_PATH);

/* ------------------------------------------------------------------ 1. static */

report.section('static: the bundle never joins the approval waterfall');
report.ok('lib/client.js never names the approval event', !clientSource.includes('approval/request'));
report.ok('lib/index.js never names the approval event', !hostSource.includes('approval/request'));
report.ok('lib/client.js never uses the remote-event subscription API', !clientSource.includes('$on'));
report.ok('lib/client.js never calls a bare .on/.once(event, …)', !/\.\s*(on|once)\s*\(/.test(clientSource));
report.ok('lib/client.js never dispatches a waterfall itself', !/\bwaterfall\s*\(/.test(clientSource));

/* ------------------------------------------------- 2. runtime, stubbed platform */

report.section('runtime: zero waterfall listeners, one pending-interaction watcher');
const sandbox = createClientSandbox();
const registration = sandbox.loader.registrations[0];
const contract = registration.factory(sandbox.requireFn);
report.ok('the remote service is NOT injected', !contract.inject.includes('remote'), JSON.stringify(contract.inject));
const harness = createClientCtx();
contract.apply(harness.ctx);
report.equal('no remote-event subscription exists after apply()', harness.state.remoteSubscriptions.length, 0);
report.equal('the pending-interaction source is subscribed instead', harness.state.pendingListeners.size, 1);
report.equal('the card is still registered (the feature works without the waterfall)', harness.state.slotRegistrations.length, 1);

/* ------------------------------------------- 3. runtime, the Host's real cordis */

report.section("runtime: the Host's real cordis waterfall semantics");
const cordisPath = resolveCordis();
let cordis = null;
if (cordisPath === null) {
  report.skip('real cordis experiments', '@deepseek-ai/cordis is not resolvable from the profile anchors');
} else {
  try {
    cordis = await import(pathToFileURL(cordisPath).href);
  } catch (error) {
    cordis = null;
    report.skip('real cordis experiments', `import failed: ${String(error.message)}`);
  }
}

let builtinAnswer = null;
if (cordis !== null && typeof cordis.Context === 'function') {
  // (a) The hostile shape we must never join: a first listener that answers the
  // request without handing it on. This is what the built-in approval panel does on
  // its normal path (`return await pending.result`).
  const hostile = new cordis.Context();
  const hostileOrder = [];
  hostile.on('approval/request', async () => {
    hostileOrder.push('builtin: decides, never calls next()');
    return 'allowed-once';
  });
  hostile.on('approval/request', async (request, next) => {
    hostileOrder.push('a listener registered afterwards');
    return next();
  });
  builtinAnswer = await hostile.waterfall('approval/request', { toolName: 'Bash' }, () => {
    hostileOrder.push('inner fallback');
    return 'inner';
  });
  report.equal('the decision made before the cut is returned unchanged', builtinAnswer, 'allowed-once');
  report.deepEqual('every listener after the cut is never invoked', hostileOrder, ['builtin: decides, never calls next()']);
  report.check('the chime-owner idea would have been dead code', !hostileOrder.includes('a listener registered afterwards'));

  // (b) `prepend` itself is real cordis behaviour — the remote-event API is what
  // cannot carry it.
  const ordered = new cordis.Context();
  const order = [];
  ordered.on('approval/request', async (request, next) => {
    order.push('reg1');
    return next();
  });
  ordered.on('approval/request', async () => {
    order.push('reg2');
    return 'reg2-answer';
  });
  ordered.on('approval/request', async (request, next) => {
    order.push('prepended');
    return next();
  }, { prepend: true });
  const orderedAnswer = await ordered.waterfall('approval/request', {}, () => {
    order.push('inner');
    return 'inner';
  });
  report.deepEqual('prepend runs first, then registration order', order, ['prepended', 'reg1', 'reg2']);
  report.equal('the first listener that does not call next() owns the answer', orderedAnswer, 'reg2-answer');

  // (c) Our plugin in exactly that hostile world: the waterfall never reaches a
  // chime listener, and the chime still fires.
  harness.pushPending([['session-1', approvalInteraction('approval:1')]]);
  report.equal('the chime fires although the waterfall never reached a chime listener', sandbox.context.window.__DSH_APPROVAL_CHIME__.stats().triggers, 1);
  report.equal('and the Host decision stayed exactly as the Host made it', builtinAnswer, 'allowed-once');
} else if (cordis !== null) {
  report.skip('real cordis experiments', 'the resolved cordis module exports no Context class');
}

/* ------------------------------------------- 4. the host source that proves it */

report.section('host source: the remote-event API forwards exactly two arguments');
const gatewayEntry = resolveHostPackage('@deepseek-ai/dsh-api-gateway');
const gatewayClient = gatewayEntry === null ? null : join(dirname(gatewayEntry), 'client.js');
if (gatewayEntry === null || !existsSync(gatewayClient)) {
  report.skip('dsh-api-gateway source inspection', `client.js not found (${String(gatewayEntry)})`);
} else {
  const gatewaySource = readFileSync(gatewayClient, 'utf8');
  const signature = /\$on\s*\(([^)]*)\)\s*\{([\s\S]{0,240}?)\}/.exec(gatewaySource);
  const params = (signature?.[1] ?? '').split(',').map((part) => part.trim()).filter((part) => part !== '');
  report.equal('$on declares exactly two parameters, so {prepend:true} is dropped', params.length, 2);
  report.check('$on forwards the caller, the event and the listener to subscribe()', /subscribe\s*\(\s*this\.ctx\s*,\s*event\s*,\s*listener\s*\)/.test(signature?.[2] ?? ''), (signature?.[2] ?? '').trim().slice(0, 120));
}

const approvalEntry = resolveHostPackage('@deepseek-ai/dsh-client-ui-approval');
const approvalClient = approvalEntry === null ? null : join(dirname(approvalEntry), 'client.js');
if (approvalEntry === null || !existsSync(approvalClient)) {
  report.skip('dsh-client-ui-approval source inspection', `client.js not found (${String(approvalEntry)})`);
} else {
  const approvalSource = readFileSync(approvalClient, 'utf8');
  report.check('the built-in panel answers with `return await pending.result` (no next())', approvalSource.includes('return await pending.result'), 'the normal path never consults later listeners');
  report.check('it publishes an interaction whose kind is "approval" (what this plugin watches)', /kind\s*=\s*"approval"/.test(approvalSource));
}

report.summary();
