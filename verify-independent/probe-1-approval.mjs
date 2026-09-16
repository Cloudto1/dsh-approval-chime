/**
 * Independent probe 1 — the approval pathway.
 *
 * Covers, independently of `verify/waterfall.test.mjs` and `verify/client-half.test.mjs`:
 *   (1) STATIC: the shipped bundle contains no approval-waterfall listener code.
 *   (2) GROUND TRUTH: with the Host's real cordis, a chain that starts with a
 *       listener which answers without calling `next()` (the built-in approval
 *       panel's shape) delivers the request to that listener and returns its
 *       answer; a later listener never runs. Recorded, not assumed.
 *   (3) DIFFERENTIAL: the same chain, run before and after `apply()`, with
 *       `remote.$on` WIRED INTO the real cordis context (so any subscription
 *       would really join the chain). Trace and answer must be identical and no
 *       subscription may be created.
 *   (4) ADVERSARIAL DEDUP: one chime per new approval key, never twice.
 *   (5) ADVERSARIAL FAILURE: a throwing interaction, a throwing snapshot, a
 *       throwing AudioContext and a throwing settings scope must not escape into
 *       the Host's publish loop, and must not change the Host's decision.
 *
 * Run: node dsh-approval-chime/verify-independent/probe-1-approval.mjs
 */

import {
  CLIENT_SOURCE,
  approval,
  loadBundle,
  makeCtx,
  resolveFromProfile,
  settle,
  suite,
  watchRejections,
} from './kit/platform.mjs';
import { pathToFileURL } from 'node:url';

const report = suite('probe-1-approval.mjs');
const rejections = watchRejections();

/* ------------------------------------------------------------------- (1) static */

report.group('1. static: the bundle carries no waterfall listener');

/** Comments describe the rejected design; only executable text counts as a hit. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
const CLIENT_CODE = stripComments(CLIENT_SOURCE);

const interestingPatterns = [
  ['approval event name', /approval\/request/g, CLIENT_SOURCE],
  ['remote subscription API ($on)', /\$on/g, CLIENT_SOURCE],
  ['any .on( / .once( call', /\.\s*(on|once)\s*\(/g, CLIENT_SOURCE],
  ['waterfall( call', /\bwaterfall\s*\(/g, CLIENT_SOURCE],
  ['next( call in executable code', /\bnext\s*\(/g, CLIENT_CODE],
  ['remote service in inject', /['"]remote['"]/g, CLIENT_SOURCE],
];

for (const [label, pattern, text] of interestingPatterns) {
  const hits = [...text.matchAll(pattern)].map((match) => {
    const line = text.slice(0, match.index).split('\n').length;
    return `${line}:${text.split('\n')[line - 1].trim().slice(0, 90)}`;
  });
  report.check(`lib/client.js has no ${label}`, hits.length === 0, hits.length === 0 ? 'no match' : JSON.stringify(hits));
}
report.note('raw next( occurrences (all inside the explanatory comment)', [...CLIENT_SOURCE.matchAll(/\bnext\s*\(/g)].length);

const bundle = loadBundle();
report.same('the file loads as a classic script', bundle.loadError, null);
report.same('one module registration', bundle.registrations.length, 1);
report.same('module id equals the package name', bundle.registration === null ? null : bundle.registration.id, 'dsh-approval-chime');
report.deep('inject[] has no remote service', [...bundle.contract.inject].sort(), ['locale', 'settingsScope', 'slots', 'uiSession']);
report.deep('the bundle required only react', bundle.ledger.requires, ['react']);

/* ------------------------------------------------- (2) real-cordis ground truth */

report.group("2. ground truth: the Host's real cordis chain semantics");

const cordisEntry = resolveFromProfile('@deepseek-ai/cordis');
report.check('the Host cordis package is resolvable (real semantics, not a mimic)', typeof cordisEntry === 'string', String(cordisEntry));
const cordis = cordisEntry === null ? null : await import(pathToFileURL(cordisEntry).href);
report.check('cordis exports Context', cordis !== null && typeof cordis.Context === 'function');

const chain = new cordis.Context();
const trace = [];
const request = { toolName: 'Bash', callId: 'call-7' };
let builtinSaw = null;
const runChain = async () => {
  trace.length = 0;
  builtinSaw = null;
  return chain.waterfall('approval/request', request, () => {
    trace.push('inner-fallback');
    return { decision: 'inner' };
  });
};

// The built-in approval panel's own shape: it answers and never calls next().
chain.on('approval/request', async (incoming) => {
  builtinSaw = incoming;
  trace.push('builtin-panel');
  return { decision: 'allow-once' };
});
// A later listener — where the rejected `$on(..., {prepend:true})` design would live.
chain.on('approval/request', async (incoming, next) => {
  trace.push('late-listener');
  return next();
});

const answerBefore = await runChain();
report.check('the first listener receives the exact request object (identity)', builtinSaw === request, `same object: ${builtinSaw === request}`);
report.deep('its answer is returned unchanged', answerBefore, { decision: 'allow-once' });
report.deep('the chain stops at that listener', [...trace], ['builtin-panel']);

/* ----------------------------------------------- (3) differential non-interference */

report.group('3. differential: apply() changes nothing about that chain');

// Bridge remote.$on into the REAL cordis context: if the plugin subscribed, its
// listener would genuinely join the chain above.
const harness = makeCtx({ bridgeRemote: (event, listener, options) => chain.on(event, listener, options) });
bundle.contract.apply(harness.ctx);

report.same('zero remote-event subscriptions were created', harness.log.remoteSubs.length, 0);
report.same('exactly one pendingInteractions subscriber exists instead', harness.api.pendingListeners.size, 1);

const answerAfter = await runChain();
report.check('the built-in listener still receives the same request object', builtinSaw === request, `same object: ${builtinSaw === request}`);
report.deep('the answer is byte-identical to the pre-apply run', answerAfter, answerBefore);
report.deep('the execution trace is identical to the pre-apply run', [...trace], ['builtin-panel']);

// The chime still fires in the world where the waterfall never reaches it.
harness.api.publish([['session-1', approval('approval:1')]]);
const diagnostics = bundle.diagnostics();
report.same('an approval published on the session source rings once', diagnostics.stats().triggers, 1);
report.same('the Host decision was untouched by the chime', (await runChain()).decision, 'allow-once');

/* --------------------------------------------------------------- (4) dedup matrix */

report.group('4. adversarial dedup: one chime per new approval key');

const dedup = loadBundle();
const dedupHarness = makeCtx();
dedup.contract.apply(dedupHarness.ctx);
const stats = () => dedup.diagnostics().stats();
const publish = (entries) => dedupHarness.api.publish(entries);
/** One `[sessionId, interaction]` pair for the fake source. */
const pair = (sessionId, key) => [sessionId, approval(key, { sessionId })];

publish([pair('session-1', 'approval:1')]);
report.same('first appearance rings', stats().triggers, 1);

for (let round = 0; round < 5; round += 1) publish([pair('session-1', 'approval:1')]);
report.same('five identical re-publishes stay silent', stats().triggers, 1);
report.same('and are never counted twice either', stats().approvalsSeen, 1);

publish([pair('session-1', 'approval:2'), pair('session-2', 'approval:3')]);
report.same('a batch of two new approvals rings exactly once (documented batching)', stats().triggers, 2);
report.same('both new keys are counted as seen', stats().approvalsSeen, 3);

publish([pair('session-1', 'approval:2'), pair('session-2', 'approval:3')]);
report.same('re-publishing that same batch is silent', stats().triggers, 2);

publish([pair('session-1', 'approval:4')]);
report.same('a replacement request (new key) rings again', stats().triggers, 3);

publish([]);
publish([pair('session-1', 'approval:4')]);
report.same('a key that disappears and comes back does not ring twice', stats().triggers, 3);

publish([['session-1', { sessionId: 'session-1', kind: 'question', key: 'question:1' }]]);
report.same('a non-approval kind never rings', stats().triggers, 3);

publish([['session-1', { sessionId: 'session-1', kind: 'approval' }]]);
publish([['session-1', { sessionId: 'session-1', kind: 'approval' }]]);
report.same('an approval without a key falls back to the session id (rings once)', stats().triggers, 4);

publish([
  ['session-1', { sessionId: 'session-1', kind: 'approval' }],
  ['session-2', { sessionId: 'session-2', kind: 'approval' }],
]);
report.same('keyless approvals in two sessions are distinct', stats().triggers, 5);

publish([pair('session-1', 'approval:9'), pair('session-2', 'approval:10'), pair('session-3', 'approval:11')]);
report.same('three fresh keys at once ring once', stats().triggers, 6);
report.same('every distinct approval was counted', stats().approvalsSeen, 9);

/* ------------------------------------------------- (5) failure containment */

report.group('5. adversarial failures: nothing escapes into the Host');

const hostile = loadBundle({ audio: { constructThrows: true } });
const hostileHarness = makeCtx();
hostile.contract.apply(hostileHarness.ctx);
const hostileStats = () => hostile.diagnostics().stats();
const escapes = [];

const attempt = (label, run) => {
  try {
    run();
    report.check(`${label}: nothing escapes`, true, 'no exception reached the caller');
  } catch (error) {
    escapes.push({ label, message: String(error.message || error) });
    report.fail(`${label}: nothing escapes`, String(error.message || error));
  }
};

// (a) the interaction's own discriminator getter throws while the Host iterates.
const poisonedKind = { sessionId: 'session-1', key: 'approval:poison' };
Object.defineProperty(poisonedKind, 'kind', {
  get() {
    throw new Error('probe: kind getter exploded');
  },
});
attempt('throwing interaction.kind during forEach', () => hostileHarness.api.publishRaw([['session-1', poisonedKind]]));

// (b) the same for the dedup key.
const poisonedKey = { sessionId: 'session-1', kind: 'approval' };
Object.defineProperty(poisonedKey, 'key', {
  get() {
    throw new Error('probe: key getter exploded');
  },
});
attempt('throwing interaction.key during forEach', () => hostileHarness.api.publishRaw([['session-1', poisonedKey]]));

// (c) the source itself refuses to produce a snapshot.
hostileHarness.api.pendingThrows = true;
attempt('pendingInteractions.getSnapshot() throws', () => hostileHarness.api.publishRaw([['session-1', approval('approval:20')]]));
hostileHarness.api.pendingThrows = false;

// (d) the settings scope refuses to be read while an approval arrives.
hostileHarness.api.scopeThrows = true;
attempt('settingsScope.getSnapshot() throws during a chime', () => hostileHarness.api.publishRaw([['session-1', approval('approval:21')]]));
hostileHarness.api.scopeThrows = false;

// (e) the browser refuses to build audio at all.
attempt('AudioContext constructor throws', () => hostileHarness.api.publishRaw([['session-1', approval('approval:22')]]));

report.same('no subscriber error was ever recorded by the Host loop', hostileHarness.log.subscribeErrors.length, 0);
report.same('no exception escaped at all', escapes.length, 0);
report.note('browser-half console lines', hostile.ledger.console);
report.check(
  'the failure modes are reported through the browser console',
  hostile.ledger.console.some((line) => line.includes('dsh-approval-chime')),
  hostile.ledger.console.join(' | ').slice(0, 240),
);
report.check('the audio failure is visible as a degradation, not a crash', hostileStats().suppressedUnsupported >= 1, JSON.stringify(hostileStats()));
report.note('counters after the hostile run', hostileStats());

// The poisoned interaction was skipped BEFORE its key was recorded, so the same
// approval is still a legitimate first sighting once the source recovers.
const seenBeforeRecovery = hostileStats().approvalsSeen;
hostileHarness.api.publish([['session-1', approval('approval:20')]]);
report.check(
  'a source that recovers is processed again (the read error did not poison dedup)',
  hostileStats().approvalsSeen === seenBeforeRecovery + 1,
  `approvalsSeen ${seenBeforeRecovery} -> ${hostileStats().approvalsSeen}`,
);
report.same('a degraded audio stack still never escapes', escapes.length, 0);

const answerAfterHostility = await runChain();
report.deep('the Host chain still answers identically after all of that', answerAfterHostility, { decision: 'allow-once' });

/* ------------------------------------------------------- (6) teardown safety */

report.group('6. teardown: the watcher unsubscribes cleanly');

const watchEffect = harness.api.effectDisposers.find((entry) => String(entry.label).includes('approval chime'));
report.check('the approval watcher installed a ctx.effect with a disposer', watchEffect !== undefined, JSON.stringify(harness.log.effectLabels));
if (watchEffect !== undefined) {
  const before = harness.api.pendingListeners.size;
  watchEffect.dispose();
  report.same('disposing the effect removes the subscription', harness.api.pendingListeners.size, before - 1);
  const triggersBefore = bundle.diagnostics().stats().triggers;
  harness.api.publishRaw([['session-1', approval('approval:99')]]);
  report.same('a disposed watcher never rings again', bundle.diagnostics().stats().triggers, triggersBefore);
}

await settle();
report.same('no unhandled rejection anywhere in this probe', rejections.seen.length, 0);
rejections.stop();
report.done();
