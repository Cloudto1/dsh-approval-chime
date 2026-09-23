/**
 * Independent probe 2 — volume semantics, tone selection, and the resource ledger.
 *
 * Covers, independently of the developer's self-test:
 *   (a) the master gain a chime really builds equals `volume / 100 × 0.6` for
 *       volume = 0 / 50 / 70 / 100, and `enabled === false` builds no audio at all;
 *   (b) every tone choice changes the rendered wave, while the volume→gain
 *       mapping stays independent of the tone;
 *   (c) the silent gates create no AudioContext instance at all (not merely a
 *       muted one);
 *   (d) the bundle makes no external resource request and creates no media
 *       element — measured with outbound-call traps and an element ledger.
 *
 * Run: node dsh-approval-chime/verify-independent/probe-2-gain-and-resources.mjs
 */

import { approval, CLIENT_SOURCE, loadBundle, makeCtx, settle, suite, watchRejections } from './kit/platform.mjs';

const report = suite('probe-2-gain-and-resources.mjs');
const rejections = watchRejections();

const MASTER_GAIN = 0.6; // asserted below against the plugin's own diagnostics

/** Boot the real bundle against a fresh fake platform. */
function boot(options = {}) {
  const bundle = loadBundle({ audio: options.audio === undefined ? {} : options.audio });
  const harness = makeCtx({ scopeValue: options.value, scopeStatus: options.status, writable: options.writable });
  bundle.contract.apply(harness.ctx);
  const diagnostics = bundle.diagnostics();
  return {
    bundle,
    harness,
    diagnostics,
    record: bundle.audio.record,
    /** Write one settings field through the platform scope, like the card does. */
    async configure(patch) {
      for (const key of Object.keys(patch)) await harness.scope.set(key, patch[key]);
      await settle();
    },
    ring(key = 'approval:1') {
      harness.api.publish([['session-1', approval(key)]]);
    },
  };
}

const masterGains = (record) => record.gains.filter((gain) => gain.outputs.some((target) => target && target.kind === 'destination'));

/* ----------------------------------------------------------- (a) volume mapping */

report.group('a. the master gain follows the volume setting');

const gainCases = [
  { label: 'volume 70 (the documented default)', value: { enabled: true, volume: 70, tone: 'chime' }, expected: 0.42 },
  { label: 'volume 50', value: { enabled: true, volume: 50, tone: 'chime' }, expected: 0.3 },
  { label: 'volume 100', value: { enabled: true, volume: 100, tone: 'chime' }, expected: 0.6 },
  { label: 'volume 1 (just above the silence floor)', value: { enabled: true, volume: 1, tone: 'chime' }, expected: 0.006 },
];

for (const testCase of gainCases) {
  const run = boot({ value: testCase.value });
  report.near(`diagnostics.masterGain is the shipped 0.6 constant (${testCase.label})`, run.diagnostics.masterGain, MASTER_GAIN);
  run.ring();
  const masters = masterGains(run.record);
  report.same(`${testCase.label}: exactly one master gain reaches the destination`, masters.length, 1);
  report.near(`${testCase.label}: master gain = value/100 × 0.6`, masters.length === 0 ? NaN : masters[0].value, testCase.expected);
  report.deep(
    `${testCase.label}: the master gain is written once and never ramped`,
    masters.length === 0 ? null : masters[0].valueHistory,
    [testCase.expected],
  );
  report.deep(
    `${testCase.label}: no parameter call ever touched the master gain again`,
    run.record.paramCalls.filter((call) => masters.length > 0 && call.node === masters[0].id),
    [],
  );
}

/* ------------------------------------------------ volume 0 / enabled false gates */

report.group('the silent gates build no audio graph at all');

const silent = boot({ value: { enabled: true, volume: 0, tone: 'chime' } });
silent.ring();
report.same('volume 0: no AudioContext instance is created', silent.record.contexts.length, 0);
report.same('volume 0: no gain node exists', silent.record.gains.length, 0);
report.same('volume 0: no chime is counted', silent.diagnostics.stats().triggers, 0);
report.same('volume 0: the refusal is attributed to silence', silent.diagnostics.stats().suppressedSilent, 1);

const disabled = boot({ value: { enabled: false, volume: 80, tone: 'chime' } });
disabled.ring();
report.same('enabled false: no AudioContext instance is created', disabled.record.contexts.length, 0);
report.same('enabled false: no gain node exists', disabled.record.gains.length, 0);
report.same('enabled false: no chime is counted', disabled.diagnostics.stats().triggers, 0);
report.same('enabled false: the refusal is attributed to the switch', disabled.diagnostics.stats().suppressedDisabled, 1);
report.same('enabled false: even an explicit preview stays silent', disabled.diagnostics.preview(), false);
report.same('enabled false: the preview created no audio', disabled.record.gains.length, 0);

/* ------------------------------------------------------------- (b) tone mapping */

report.group('b. the tone setting changes what is rendered');

const toneExpectations = { chime: 'sine', bell: 'triangle', beep: 'square' };
for (const [tone, wave] of Object.entries(toneExpectations)) {
  const run = boot({ value: { enabled: true, volume: 70, tone } });
  run.ring();
  const masters = masterGains(run.record);
  report.same(`${tone}: exactly one master gain`, masters.length, 1);
  report.near(`${tone}: the same volume yields the same gain (volume is tone-independent)`, masters.length === 0 ? NaN : masters[0].value, 0.42);
  const waves = [...new Set(run.record.oscillators.map((oscillator) => oscillator.type))];
  report.deep(`${tone}: the rendered wave is ${wave}`, waves, [wave]);
  report.check(
    `${tone}: every oscillator has a finite, positive frequency`,
    run.record.oscillators.length > 0 && run.record.oscillators.every((oscillator) => Number.isFinite(oscillator.frequency.value) && oscillator.frequency.value > 0),
    JSON.stringify(run.record.oscillators.map((oscillator) => oscillator.frequency.value)),
  );
  report.check(
    `${tone}: every oscillator is enveloped through a gain node, never wired straight to the destination`,
    run.record.oscillators.every((oscillator) => oscillator.outputs.length === 1 && oscillator.outputs[0].kind === 'gain') &&
      run.record.oscillators.every((oscillator) => !oscillator.outputs.some((target) => target.kind === 'destination')),
    JSON.stringify(run.record.links.map((link) => `${link.from.kind}->${link.to.kind}`)),
  );
  report.check(`${tone}: oscillators are started and stopped`, run.record.starts.length >= 1 && run.record.stops.length === run.record.starts.length, `${run.record.starts.length} start(s) / ${run.record.stops.length} stop(s)`);
  report.same(`${tone}: the chime is counted`, run.diagnostics.stats().triggers, 1);
  report.same(`${tone}: the counter records the tone that played`, run.diagnostics.stats().lastTone, tone);
  report.note(`${tone}: oscillator plan`, run.record.oscillators.map((oscillator) => ({ type: oscillator.type, hz: oscillator.frequency.value, at: oscillator.startedAt })));
}

/* ------------------------------------------------------ out-of-range / bad values */

report.group('the settings value is clamped, never trusted blindly');

const loud = boot({ value: { enabled: true, volume: 1000, tone: 'chime' } });
loud.ring();
report.near('volume 1000 is clamped to 100 (gain 0.6)', masterGains(loud.record)[0]?.value, 0.6);
report.same('volume 1000 is recorded as 100', loud.diagnostics.stats().lastVolume, 100);

const negative = boot({ value: { enabled: true, volume: -40, tone: 'chime' } });
negative.ring();
report.same('volume -40 is treated as silence', negative.diagnostics.stats().triggers, 0);
report.same('volume -40 builds no audio', negative.record.gains.length, 0);

const garbage = boot({ value: { enabled: true, volume: 'loud', tone: 'chime' } });
garbage.ring();
report.near('a non-numeric volume falls back to the documented default 70', masterGains(garbage.record)[0]?.value, 0.42);

const unknownTone = boot({ value: { enabled: true, volume: 70, tone: 'kazoo' } });
unknownTone.ring();
report.same('an unknown tone falls back to the default chime', unknownTone.diagnostics.stats().lastTone, 'chime');
report.deep('and the fallback wave is the chime wave', [...new Set(unknownTone.record.oscillators.map((o) => o.type))], ['sine']);

/* ------------------------------------------------------------- preview semantics */

report.group('the preview button uses the same settings, and is counted separately');

const preview = boot({ value: { enabled: true, volume: 50, tone: 'bell' } });
report.same('preview reports success while enabled', preview.diagnostics.preview(), true);
await settle();
report.near('preview obeys the volume setting', masterGains(preview.record)[0]?.value, 0.3);
report.same('preview uses the configured tone', preview.diagnostics.stats().lastTone, 'bell');
report.same('preview increments the preview counter, not the approval counter', preview.diagnostics.stats().previews, 1);
report.same('the approval counter is untouched by a preview', preview.diagnostics.stats().triggers, 0);
report.same('preview created exactly one context', preview.record.contexts.length, 1);

/* --------------------------------------------------------- autoplay-policy path */

report.group('a locked AudioContext degrades instead of failing');

const locked = boot({ value: { enabled: true, volume: 70, tone: 'chime' }, audio: { state: 'suspended', resumeKeepsSuspended: true } });
locked.ring();
report.same('the chime still renders while locked (nodes exist)', masterGains(locked.record).length, 1);
report.same('the policy block is counted', locked.diagnostics.stats().suppressedPolicy, 1);
report.same('the audio state is reported as suspended', locked.diagnostics.audio().state, 'suspended');
report.same('the context is not claimed to be unlocked', locked.diagnostics.audio().unlocked, false);
report.check('a resume attempt was made', locked.record.resumes >= 1, `${locked.record.resumes} resume() call(s)`);
report.check('gesture listeners stay bound while locked', locked.bundle.document.listenerCount() > 0, `${locked.bundle.document.listenerCount()} listeners`);

/* ------------------------------------------------------------- (d) resource ledger */

report.group('d. no external resource is ever requested');

const resources = boot({ value: { enabled: true, volume: 70, tone: 'chime' } });
resources.ring();
resources.harness.api.publish([['session-2', approval('approval:2', { sessionId: 'session-2' })]]);
resources.diagnostics.preview();
await settle();

/**
 * rev-10 rebaseline of the rev-1 trap ledger.
 *
 * The rev-1 expectation was an EMPTY ledger, which held while a chime was purely
 * synthesized. rev-4 added the audio routes and rev-10 the per-session override
 * table (`refreshSessions()` at mount, lib/client.js:2982 → fetch(SESSIONS_ROUTE)
 * at lib/client.js:1162), so the bundle now makes exactly one outbound call at
 * boot. The bar is NOT lowered: the exact ledger is pinned, the read is counted,
 * and every non-fetch transport and every URL off the bundle's own route prefix
 * still has to be absent.
 */
const OWN_ROUTE_PREFIX = '/api/approval-chime/';
const mountReads = resources.bundle.ledger.traps.filter((trap) => trap.label === 'fetch' && String(trap.args[0]) === '/api/approval-chime/sessions');
const foreignTraps = resources.bundle.ledger.traps.filter((trap) => trap.label !== 'fetch' || !String(trap.args[0]).startsWith(OWN_ROUTE_PREFIX));
report.deep(
  'no outbound-resource trap fired outside the Host-owned same-origin routes (fetch/XHR/WebSocket/Audio/Image/Worker…)',
  foreignTraps,
  [],
);
report.deep(
  'the whole outbound ledger is the single mount-time read of the per-session table (rev-10)',
  resources.bundle.ledger.traps.map((trap) => `${trap.label} ${trap.args[0]}`),
  ['fetch /api/approval-chime/sessions'],
);
report.same('that mount-time read happened exactly once', mountReads.length, 1);
report.deep('the only DOM element created is the <style> tag', resources.bundle.ledger.elementTags, ['style']);
report.deep('the only module required is react', resources.bundle.ledger.requires, ['react']);
report.same('navigator was never touched', resources.bundle.ledger.navigatorReads, 0);

const sourceChecks = [
  ['an absolute http(s) URL', /https?:\/\//],
  ['a fetch of an absolute URL (the bundle only calls its own routes)', /\bfetch\s*\(\s*['"]https?:/],
  ['XMLHttpRequest', /XMLHttpRequest/],
  ['a media file extension', /\.(mp3|wav|ogg|m4a|aac|flac)\b/i],
  ['a data: audio URI', /data:audio/i],
  ['new Audio(', /new\s+Audio\s*\(/],
  ['a CSS url() reference', /url\s*\(\s*['"]?(https?:|data:)/i],
  ['localStorage / sessionStorage', /localStorage|sessionStorage/],
];
for (const [label, pattern] of sourceChecks) {
  const hits = [...CLIENT_SOURCE.matchAll(new RegExp(pattern.source, 'gi'))].map((match) => CLIENT_SOURCE.slice(0, match.index).split('\n').length);
  report.check(`lib/client.js contains no ${label}`, hits.length === 0, hits.length === 0 ? 'no match' : `line(s) ${hits.join(',')}`);
}

/* The rev-1 claim "lib/client.js contains no fetch(" is superseded: rev-4 added the
 * audio routes and rev-10 the sessions read (the registry names the same drift).
 * What must still hold is that EVERY fetch( call targets one of the bundle's own
 * route constants, and that those constants are same-origin paths. Measured on the
 * shipped source, so a new call site or a hardcoded host fails here. */
const fetchTargets = [...CLIENT_SOURCE.matchAll(/\bfetch\s*\(\s*([A-Za-z_$][\w$]*)/g)].map((match) => match[1]);
report.deep('every fetch( call passes one of the bundle\'s own route constants', [...new Set(fetchTargets)].sort(), ['AUDIO_ROUTE', 'SESSIONS_ROUTE']);
report.check(
  'the fetch( call sites still number the five the rev-24 source has (audio×3, sessions×2)',
  fetchTargets.length === 5,
  `call site(s) at line(s) ${[...CLIENT_SOURCE.matchAll(/\bfetch\s*\(/g)].map((match) => CLIENT_SOURCE.slice(0, match.index).split('\n').length).join(',')}`,
);
report.check(
  'both route constants are same-origin /api/approval-chime paths',
  /var AUDIO_ROUTE = '\/api\/approval-chime\/audio';/.test(CLIENT_SOURCE) && /var SESSIONS_ROUTE = '\/api\/approval-chime\/sessions';/.test(CLIENT_SOURCE),
  'lib/client.js:172 / :180',
);

await settle();
report.same('no unhandled rejection in this probe', rejections.seen.length, 0);
rejections.stop();
report.done();
