/**
 * probe-9 — rev-4 imported audio at playback time (attack surfaces 6 and 7).
 *
 * Claims under attack:
 *   - a failed custom tone only bumps `suppressedFailed` + `lastError`, with no
 *     unhandled rejection, and does NOT break the synthesized tones;
 *   - one id played twice concurrently is fetched once; different ids do not
 *     interfere; a second play of the same file reuses the decoded buffer;
 *   - the sample goes through the SAME master gain as a synthesized chime.
 *
 * Instrument: kit/rev4-kit.mjs (own stubs), `lib/client.js` unmodified in a vm.
 *
 * Run: node dsh-approval-chime/verify-independent/probe-9-client-playback.mjs
 */

import { join } from 'node:path';

import {
  CLIENT_HALF,
  ID_A,
  ID_B,
  PLUGIN_DIR,
  createAudioStub,
  createClientHarness,
  createClientSandbox,
  createLog,
  createScope,
  failFastOnCrash,
  settle,
  sha256,
  trackHazards,
} from './kit/rev4-kit.mjs';

const plugin = await import('../lib/index.js');
const log = createLog('probe-9-client-playback');
const hazards = trackHazards();
failFastOnCrash(log, hazards);

log.note('command: node dsh-approval-chime/verify-independent/probe-9-client-playback.mjs');
log.note(`node ${process.version} / ${process.platform}`);
log.note(`lib/client.js sha256 ${sha256(CLIENT_HALF)}`);

const GAIN = 0.6;

/** Build a client whose fetch is scripted per URL. */
function build({ fetchImpl, audioOptions = {}, settings = {}, react = {} } = {}) {
  const sandbox = createClientSandbox();
  const scope = createScope({ enabled: true, volume: 50, tone: `custom:${ID_A}`, custom: [{ id: ID_A, name: 'a.mp3' }, { id: ID_B, name: 'b.mp3' }], ...settings });
  const audioStub = createAudioStub(audioOptions);
  sandbox.window.AudioContext = audioStub.AudioContext;
  /** Every request, including the mount-time table read. */
  const calls = [];
  /**
   * rev-10 rebaseline: since rev-10 the bundle reads the per-session override table once
   * at mount (`refreshSessions()` → fetch(SESSIONS_ROUTE), lib/client.js:2982/1162). That
   * read is not a sample fetch, so the "N fetches" assertions below count `sampleCalls`
   * and the mount read is asserted separately — the raw `calls` ledger is kept intact.
   */
  const sampleCalls = [];
  let mountReads = 0;
  if (fetchImpl !== undefined) {
    sandbox.setGlobal('fetch', (url, options = {}) => {
      const record = { url, options };
      calls.push(record);
      if (String(url) === plugin.SESSIONS_ROUTE) mountReads += 1;
      else sampleCalls.push(record);
      return fetchImpl(url, options, calls);
    });
  }
  const harness = createClientHarness(sandbox, { scope });
  harness.apply();
  harness.mountCard({});
  return { sandbox, scope, audioStub, harness, calls, sampleCalls, mountReads: () => mountReads };
}

const okFetch = (bytes = 32) => (url, options = {}) => {
  if (options.method === 'DELETE') return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, removed: true }) });
  return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(bytes)) });
};

/* ------------------------------------------- 1. the happy path wires the gain */

log.section('1. an imported tone plays through the same master gain as a chime');

const main = build({ fetchImpl: okFetch() });
main.harness.diagnostics.preview();
await settle();
const track = main.audioStub.track;
log.equal('one buffer source started', track.sources.length, 1);
log.equal('one master gain was created for the sample', track.gains.length, 1);
log.equal('the master gain is volume/100 x MASTER_GAIN', track.gains[0]?.gain.value, (50 / 100) * GAIN);
log.check('the source is connected to the master gain', track.sources[0]?.connected[0] === track.gains[0], JSON.stringify(track.sources[0]?.connected.map((node) => node.kind)));
log.check('the master gain is connected to the destination', track.gains[0]?.connected[0]?.kind === 'destination', JSON.stringify(track.gains[0]?.connected));
log.equal('the buffer handed to the source is the decoded one', track.sources[0]?.buffer?.duration, 0.2);
log.equal('the preview counter moved', main.harness.diagnostics.stats().previews, 1);
log.equal('the trigger counter did not', main.harness.diagnostics.stats().triggers, 0);
log.equal('lastGain records the same value', main.harness.diagnostics.stats().lastGain, (50 / 100) * GAIN);
log.equal('lastTone records the imported id', main.harness.diagnostics.stats().lastTone, `custom:${ID_A}`);
log.equal('the sample was fetched from the audio route', main.sampleCalls[0]?.url, `${plugin.AUDIO_ROUTE}/${ID_A}`);
log.equal('the sample fetch asks for same-origin credentials', main.sampleCalls[0]?.options.credentials, 'same-origin');
log.equal('the mount read of the per-session table is not a sample fetch (rev-10)', main.mountReads(), 1);

const synth = build({ fetchImpl: okFetch(), settings: { tone: 'bell', custom: [] } });
synth.harness.diagnostics.preview();
const synthGain = synth.audioStub.track.gains[0];
log.equal('a synthesized chime creates the same gain value', synthGain?.gain.value, (50 / 100) * GAIN);
log.equal('the synthesized chime creates no buffer source', synth.audioStub.track.sources.length, 0);
log.check('the synthesized chime creates oscillators', synth.audioStub.track.oscillators.length === 2, String(synth.audioStub.track.oscillators.length));

/* ------------------------------------------------- 2. failure paths (must not throw) */

log.section('2. failure paths: counted, surfaced, never unhandled');

const notFound = build({ fetchImpl: (url) => Promise.resolve({ ok: false, status: 404, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }) });
notFound.harness.diagnostics.preview();
await settle();
log.equal('404 -> suppressedFailed +1', notFound.harness.diagnostics.stats().suppressedFailed, 1);
log.equal('404 -> previews stays 0 (nothing was audible)', notFound.harness.diagnostics.stats().previews, 0);
log.check('404 -> lastError names the status', String(notFound.harness.diagnostics.audio().lastError).includes('404'), String(notFound.harness.diagnostics.audio().lastError));
log.equal('404 -> no buffer source started', notFound.audioStub.track.sources.length, 0);
log.equal('404 -> the audio state is not poisoned', notFound.harness.diagnostics.audio().state, 'running');
log.equal('404 -> no unhandled rejection so far', hazards.rejections.length, 0);

const decodeRejects = build({ fetchImpl: okFetch(), audioOptions: { decodeRejects: true } });
decodeRejects.harness.diagnostics.preview();
await settle();
log.equal('decode rejection -> suppressedFailed +1', decodeRejects.harness.diagnostics.stats().suppressedFailed, 1);
log.check('decode rejection -> lastError carries the decode message', String(decodeRejects.harness.diagnostics.audio().lastError).includes('decode'), String(decodeRejects.harness.diagnostics.audio().lastError));
log.equal('decode rejection -> no unhandled rejection', hazards.rejections.length, 0);

const decodeThrows = build({ fetchImpl: okFetch(), audioOptions: { decodeThrows: true } });
decodeThrows.harness.diagnostics.preview();
await settle();
log.equal('synchronous decode throw -> suppressedFailed +1', decodeThrows.harness.diagnostics.stats().suppressedFailed, 1);
log.equal('synchronous decode throw -> no unhandled rejection', hazards.rejections.length, 0);

const noFetch = build({ fetchImpl: undefined });
noFetch.harness.diagnostics.preview();
await settle();
log.equal('no fetch at all -> suppressedFailed +1', noFetch.harness.diagnostics.stats().suppressedFailed, 1);
log.check('no fetch at all -> lastError explains', String(noFetch.harness.diagnostics.audio().lastError).includes('cannot fetch'), String(noFetch.harness.diagnostics.audio().lastError));
log.equal('no fetch at all -> no unhandled rejection', hazards.rejections.length, 0);

const fetchRejects = build({ fetchImpl: () => Promise.reject(new Error('network down')) });
fetchRejects.harness.diagnostics.preview();
await settle();
log.equal('a rejecting fetch -> suppressedFailed +1', fetchRejects.harness.diagnostics.stats().suppressedFailed, 1);
log.check('a rejecting fetch -> lastError explains', String(fetchRejects.harness.diagnostics.audio().lastError).includes('network down'), String(fetchRejects.harness.diagnostics.audio().lastError));
log.equal('a rejecting fetch -> no unhandled rejection', hazards.rejections.length, 0);

const notOkResponse = build({ fetchImpl: () => Promise.resolve(undefined) });
notOkResponse.harness.diagnostics.preview();
await settle();
log.equal('an undefined response -> suppressedFailed +1', notOkResponse.harness.diagnostics.stats().suppressedFailed, 1);

log.section('2b. a failed imported tone does not break the built-in tones');
const recovered = build({
  fetchImpl: (url) => Promise.resolve({ ok: false, status: 404, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }),
});
recovered.harness.diagnostics.preview();
await settle();
const afterFailure = recovered.harness.diagnostics.stats().suppressedFailed;
recovered.scope.poke('tone', 'bell');
recovered.harness.diagnostics.preview();
await settle();
log.equal('the synthesized tone still renders after the failure', recovered.audioStub.track.oscillators.length, 2);
log.equal('the synthesized preview counted', recovered.harness.diagnostics.stats().previews, 1);
log.equal('suppressedFailed did not grow on the synthesized path', recovered.harness.diagnostics.stats().suppressedFailed, afterFailure);
log.equal('the failure left the audio state usable', recovered.harness.diagnostics.audio().state, 'running');
log.equal('still no unhandled rejection', hazards.rejections.length, 0);

log.section('2c. a missing file that appears later recovers');
let lateServed = false;
const late = build({
  fetchImpl: () => (lateServed ? Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }) : Promise.resolve({ ok: false, status: 404, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) })),
});
late.harness.diagnostics.preview();
await settle();
log.equal('first attempt fails', late.harness.diagnostics.stats().suppressedFailed, 1);
lateServed = true;
late.harness.diagnostics.preview();
await settle();
log.equal('the second attempt refetches and plays', late.audioStub.track.sources.length, 1);
log.equal('and counts as a preview', late.harness.diagnostics.stats().previews, 1);
log.equal('the failed attempt was not cached as a success', late.harness.diagnostics.stats().suppressedFailed, 1);

/* ---------------------------------------------- 3. concurrency and buffer caching */

log.section('3. concurrency: one fetch per id, per-id isolation, buffer reuse');

const concurrent = build({ fetchImpl: okFetch() });
concurrent.harness.diagnostics.preview();
concurrent.harness.diagnostics.preview();
await settle();
log.equal('two plays in one tick fetched the sample once', concurrent.calls.filter((call) => call.url === `${plugin.AUDIO_ROUTE}/${ID_A}`).length, 1);
log.equal('both plays started a source', concurrent.audioStub.track.sources.length, 2);
log.equal('both plays were counted', concurrent.harness.diagnostics.stats().previews, 2);
log.check('both sources share one decoded buffer object', concurrent.audioStub.track.sources[0]?.buffer === concurrent.audioStub.track.sources[1]?.buffer, 'buffer identity');
log.equal('decode ran once', concurrent.audioStub.track.decoded.length, 1);

concurrent.harness.diagnostics.preview();
await settle();
log.equal('a later play reuses the cached buffer (still one fetch)', concurrent.calls.filter((call) => call.url === `${plugin.AUDIO_ROUTE}/${ID_A}`).length, 1);
log.equal('and still starts a new source', concurrent.audioStub.track.sources.length, 3);
log.equal('decode still ran once', concurrent.audioStub.track.decoded.length, 1);

const twoIds = build({
  fetchImpl: (url) => Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(url.includes(ID_B) ? 64 : 16)) }),
});
twoIds.scope.poke('tone', `custom:${ID_A}`);
twoIds.harness.diagnostics.preview();
twoIds.scope.poke('tone', `custom:${ID_B}`);
twoIds.harness.diagnostics.preview();
await settle();
log.equal('two different ids -> two fetches', twoIds.sampleCalls.length, 2);
log.equal('two different ids -> two decodes', twoIds.audioStub.track.decoded.length, 2);
log.equal('two different ids -> two sources', twoIds.audioStub.track.sources.length, 2);
log.check(
  'each source carries its own buffer (16 vs 64 bytes)',
  twoIds.audioStub.track.sources[0]?.buffer?.byteLength === 16 && twoIds.audioStub.track.sources[1]?.buffer?.byteLength === 64,
  `${twoIds.audioStub.track.sources[0]?.buffer?.byteLength} / ${twoIds.audioStub.track.sources[1]?.buffer?.byteLength}`,
);
log.check('the fetch URLs are the two distinct ids', twoIds.sampleCalls[0]?.url !== twoIds.sampleCalls[1]?.url, twoIds.sampleCalls.map((call) => call.url).join(' , '));
log.equal('still no unhandled rejection', hazards.rejections.length, 0);

/* ------------------------------------------------------- 4. approval-triggered path */

log.section('4. an approval-triggered imported chime (not just the preview button)');

const approvalSandbox = createClientSandbox();
const approvalScope = createScope({ enabled: true, volume: 100, tone: `custom:${ID_A}`, custom: [{ id: ID_A, name: 'a.mp3' }] });
const approvalAudio = createAudioStub();
approvalSandbox.window.AudioContext = approvalAudio.AudioContext;
const approvalCalls = [];
approvalSandbox.setGlobal('fetch', (url, options = {}) => {
  approvalCalls.push({ url, options });
  return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(24)) });
});
let pendingMap = new Map();
let notifyPending = () => {};
const approvalHarness = createClientHarness(approvalSandbox, {
  scope: approvalScope,
  pendingSource: {
    getSnapshot: () => pendingMap,
    subscribe: (listener) => {
      notifyPending = listener;
      return () => {
        notifyPending = () => {};
      };
    },
  },
});
approvalHarness.apply();
pendingMap = new Map([['session-1', { kind: 'approval', key: 'approval-1' }]]);
notifyPending();
await settle();
log.equal('the approval chime fetched the imported file', approvalCalls.filter((call) => call.url === `${plugin.AUDIO_ROUTE}/${ID_A}`).length, 1);
log.equal('the approval play counted as a trigger', approvalHarness.diagnostics.stats().triggers, 1);
log.equal('the approval play did not count as a preview', approvalHarness.diagnostics.stats().previews, 0);
log.equal('the trigger used volume 100 -> gain 0.6', approvalAudio.track.gains[0]?.gain.value, GAIN);
log.equal('approvalsSeen recorded the interaction', approvalHarness.diagnostics.stats().approvalsSeen, 1);

/* --------------------------------------------------------- 5. cache invalidation */

log.section('5. removing a tone drops its decoded buffer');
const remove = build({ fetchImpl: okFetch() });
remove.harness.diagnostics.preview();
await settle();
log.equal('played once (one fetch)', remove.sampleCalls.length, 1);
remove.harness.clickButton('移除');
await settle();
remove.scope.poke('tone', `custom:${ID_A}`);
remove.harness.diagnostics.preview();
await settle();
log.equal('after removal the sample is fetched again', remove.calls.filter((call) => call.url.endsWith(ID_A) && call.options.method !== 'DELETE').length, 2);
log.equal('the DELETE was actually issued', remove.calls.filter((call) => call.options.method === 'DELETE').length, 1);

/* ------------------------------------------------------------------- hygiene */

log.section('6. hygiene');
await settle(4);
log.equal('no unhandled rejection during the whole probe', hazards.rejections.length, 0);
log.equal('no uncaught exception during the whole probe', hazards.exceptions.length, 0);
if (hazards.rejections.length > 0) log.raw('rejections', hazards.rejections.join('\n'));
if (hazards.exceptions.length > 0) log.raw('exceptions', hazards.exceptions.join('\n'));

const failures = log.summary();
hazards.stop();
process.exitCode = failures === 0 ? 0 : 1;
