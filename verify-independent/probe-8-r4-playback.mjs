/**
 * Independent adversarial probe 8 (rev-4, task t1) — a missing imported file,
 * and the three failure modes of the sample path.
 *
 * Claims under attack:
 *   2. `tone` names a deleted / never-existing id: does the card still render a
 *      row instead of a blank select, and does playing it only add
 *      `suppressedFailed` + `lastError` (no unhandled rejection, no damage to the
 *      built-in tones)?
 *   3. fetch 404 / `decodeAudioData` rejecting / `typeof fetch === 'undefined'`:
 *      do the built-in tones still sound?
 *
 * Adversarial extras beyond the wording: a hanging fetch, a fetch that throws
 * SYNCHRONOUSLY, a response that is `null`, and a control proving this sandbox
 * can actually observe an unhandled rejection.
 */

import { boot, optionRows, selectOf, uuid, makeFetch, suite, settle, watchRejections, chooseFile, makeFile, findAll, allText } from './kit/rev4.mjs';
import vm from 'node:vm';

const S = suite('probe-8 rev-4 missing sample + playback failure modes (independent)');
const MISSING = uuid(99);
const MISSING_TONE = `custom:${MISSING}`;
const rejections = watchRejections();

/** One boot with a single imported tone selected, and its file gone. */
function bootMissing(options = {}) {
  const api = boot({
    scopeValue: { enabled: true, volume: 70, tone: MISSING_TONE, custom: [] },
    fetch: options.fetch === undefined ? makeFetch({ get: { status: 404, json: { ok: false, error: 'audio not found' } } }) : options.fetch,
    audio: options.audio,
  });
  const driver = api.mountCard({});
  return { api, driver, tree: driver.render() };
}

/** Counters that must NOT move when one sample fails. */
function quietCounters(stats) {
  return {
    triggers: stats.triggers,
    previews: stats.previews,
    suppressedDisabled: stats.suppressedDisabled,
    suppressedSilent: stats.suppressedSilent,
    suppressedUnsupported: stats.suppressedUnsupported,
    suppressedPolicy: stats.suppressedPolicy,
    lastTone: stats.lastTone,
    lastAt: stats.lastAt,
  };
}

/* ------------------------------------------------- the missing-roster-row claim */

S.group('claim 2a — a tone whose file is gone still renders a row (no blank select)');
{
  const { api, tree } = bootMissing();
  const rows = optionRows(tree);
  S.note('rendered options', rows.map((row) => ({ value: row.value, label: row.label })));
  S.deep('the missing tone is the FIRST row and carries the missing-file label', rows[0], { value: MISSING_TONE, label: '（文件缺失）' });
  S.same('the missing row is not one of the built-ins', rows.length, 4);
  S.same('the select value is the tone that is stored', selectOf(tree).props.value, MISSING_TONE);
  S.check('the select value matches a rendered option (this is what stops `<select>` from rendering blank)', rows.some((row) => row.value === selectOf(tree).props.value), rows.map((row) => row.value).join(' | '));
  S.deep('the built-in rows still follow the missing row', optionRows(tree).slice(1).map((row) => row.value), ['chime', 'bell', 'beep']);

  // Counter-case: an id that is NOT of the custom shape falls back to the default
  // tone instead of producing a row. Recorded because it is an asymmetry.
  const other = boot({ scopeValue: { enabled: true, volume: 70, tone: 'no-such-tone', custom: [] }, fetch: makeFetch({ get: { status: 404 } }) });
  const otherTree = other.mountCard({}).render();
  S.note('a non-custom unknown tone id renders', optionRows(otherTree).map((row) => row.value));
  S.same('a built-in-shaped unknown id falls back to the default tone (no row is added)', selectOf(otherTree).props.value, 'chime');
}

/* ------------------------------------------------------- the failure accounting */

S.group('claim 2b/3a — fetch answers 404');
{
  const { api } = bootMissing();
  const before = api.stats();
  const audioBefore = api.audio();
  const played = api.diagnostics.preview();
  await settle(8);
  const after = api.stats();
  S.same('the attempt reports "scheduled" (true) rather than throwing', played, true);
  S.deep('every other counter is untouched', quietCounters(after), quietCounters(before));
  S.same('suppressedFailed went up by exactly 1', after.suppressedFailed - before.suppressedFailed, 1);
  S.same('lastError records the 404', api.audio().lastError, 'audio fetch failed (404)');
  S.same('audio.state is not marked broken by a missing file', api.audio().state === 'error', false);
  S.same('the engine state is a normal context state', ['running', 'suspended', 'idle'].includes(api.audio().state), true);
  S.same('unlocked was not forced back to false', api.audio().unlocked, true);
  S.same('no AudioBufferSource was created', api.recorder.bufferSources.length, 0);
  S.same('no master gain was created either', api.recorder.gains.length, 0);
  S.same('the fetch went to the host route', api.bundle.sandbox.fetch.calls[0].url, `/api/approval-chime/audio/${MISSING}`);
  S.same('the fetch used the GET method with same-origin credentials', JSON.stringify({ method: api.bundle.sandbox.fetch.calls[0].method, credentials: api.bundle.sandbox.fetch.calls[0].init.credentials }), JSON.stringify({ method: 'GET', credentials: 'same-origin' }));

  // Built-in tones must be unaffected, right after the failure.
  void api.setSetting('tone', 'bell');
  const bell = api.diagnostics.preview();
  await settle(8);
  S.same('the built-in preview is counted', api.stats().previews, 1);
  S.same('the built-in oscillator pair was created', api.recorder.oscillators.length, 2);
  S.same('the built-in play did not add another suppressedFailed', api.stats().suppressedFailed, 1);
  void bell;
}

S.group('claim 3b — `decodeAudioData` rejects');
{
  const { api } = bootMissing({ fetch: makeFetch({ get: { bytes: new ArrayBuffer(16) } }), audio: { decodeError: 'probe: unsupported audio container' } });
  api.diagnostics.preview();
  await settle(8);
  S.same('suppressedFailed went up', api.stats().suppressedFailed, 1);
  S.same('lastError carries the decoder message', api.audio().lastError, 'probe: unsupported audio container');
  S.same('previews did not move', api.stats().previews, 0);
  S.same('the decoded-buffer cache stayed empty', Object.keys(api.recorder.bufferSources).length, 0);
  api.setSetting('tone', 'chime');
  api.diagnostics.preview();
  await settle(8);
  S.same('the built-in tone still renders after a decode failure', api.recorder.oscillators.length, 2);
  S.same('the built-in preview is counted', api.stats().previews, 1);
}

S.group('claim 3c — `typeof fetch === "undefined"`');
{
  const { api } = bootMissing({ fetch: 'absent' });
  S.same('the global really is gone inside the sandbox', vm.runInContext('typeof fetch', api.bundle.context), 'undefined');
  const played = api.diagnostics.preview();
  await settle(8);
  S.same('the attempt is still reported as scheduled', played, true);
  S.same('the failure is counted', api.stats().suppressedFailed, 1);
  S.same('lastError explains why', api.audio().lastError, 'this browser cannot fetch the uploaded audio');
  api.setSetting('tone', 'beep');
  api.diagnostics.preview();
  await settle(8);
  S.same('the built-in beep still renders (2 oscillators)', api.recorder.oscillators.length, 2);
  S.same('the built-in preview is counted', api.stats().previews, 1);
}

S.group('claim 3d — the fetch promise rejects (offline, DNS, abort)');
{
  const { api } = bootMissing({ fetch: makeFetch({ get: { reject: 'probe: network down' } }) });
  api.diagnostics.preview();
  await settle(8);
  S.same('counted', api.stats().suppressedFailed, 1);
  S.same('lastError carries the reason', api.audio().lastError, 'probe: network down');
  api.setSetting('tone', 'chime');
  api.diagnostics.preview();
  await settle(8);
  S.same('built-in unaffected', api.stats().previews, 1);
}

S.group('claim 3e — a response object that is not ok-ish at all');
{
  const { api } = bootMissing({ fetch: makeFetch({ get: { noResponse: true } }) });
  api.diagnostics.preview();
  await settle(8);
  S.same('counted', api.stats().suppressedFailed, 1);
  S.same('lastError says there was no response', api.audio().lastError, 'audio fetch failed (no response)');
}

S.group('adversarial — a fetch that never settles');
{
  const { api } = bootMissing({ fetch: makeFetch({ get: { hang: true } }) });
  const played = api.diagnostics.preview();
  await settle(12);
  S.same('the call is still "scheduled" and never rejects', played, true);
  S.same('no counter moved while the request hangs', api.stats().suppressedFailed, 0);
  S.same('no error text was invented', api.audio().lastError, '');
  api.setSetting('tone', 'chime');
  api.diagnostics.preview();
  await settle(8);
  S.same('a built-in chime does not wait for the hanging sample', api.stats().previews, 1);
  S.same('the built-in oscillator pair exists', api.recorder.oscillators.length, 2);
}

S.group('F1 (rev-5) — `fetch` throws SYNCHRONOUSLY: it must be converted, not escape');
let syncThrow = null;
{
  const { api } = bootMissing({ fetch: makeFetch({ get: { throw: 'probe: fetch threw before returning a promise' } }) });
  let played = null;
  try {
    played = api.diagnostics.preview();
  } catch (error) {
    syncThrow = error;
  }
  await settle(8);
  S.note('synchronous exception escaping the preview call', syncThrow === null ? null : String(syncThrow.message));
  S.note('counters after the synchronous throw', api.stats());
  S.note('audio state after the synchronous throw', api.audio());
  S.same('① the preview call does not throw', syncThrow, null);
  S.same('① it reports "scheduled" like any other sample attempt', played, true);
  S.same('③ suppressedFailed is updated exactly once', api.stats().suppressedFailed, 1);
  S.same('③ lastError carries the thrown message', api.audio().lastError, 'probe: fetch threw before returning a promise');
  S.same('③ no play was counted', api.stats().previews, 0);
  S.same('③ no audio node was built', api.recorder.gains.length + api.recorder.bufferSources.length, 0);
  api.setSetting('tone', 'chime');
  api.diagnostics.preview();
  await settle(8);
  S.same('③ the built-in tone still plays afterwards', api.stats().previews, 1);

  // ② The approval path reaches `chime` from the observable's listener fan-out.
  const { api: watchApi } = bootMissing({ fetch: makeFetch({ get: { throw: 'probe: fetch threw before returning a promise' } }) });
  let escaped = null;
  try {
    watchApi.fakeApi.publishRaw([['session-1', { sessionId: 'session-1', kind: 'approval', key: 'k-sync' }]]);
  } catch (error) {
    escaped = error;
  }
  await settle(8);
  S.same('② nothing escapes the pendingInteractions listener', escaped, null);
  S.same('② the approval was still counted as seen', watchApi.stats().approvalsSeen, 1);
  S.same('② and the failure landed in the counters, not on the floor', watchApi.stats().suppressedFailed, 1);
  S.same('② with lastError set', watchApi.audio().lastError, 'probe: fetch threw before returning a promise');
  // The guarded fan-out the app really uses must stay clean too.
  S.deep('② the app-side subscriber error log stays empty', watchApi.log.subscribeErrors, []);
}

S.group('F1 (rev-5) — a synchronous throw from `uploadAudio` must not wedge the import button');
{
  const fetchStub = makeFetch({ get: { bytes: new ArrayBuffer(8) }, post: { throw: 'probe: fetch threw synchronously on POST' } });
  const api = boot({ scopeValue: { enabled: true, volume: 70, tone: 'chime', custom: [] }, fetch: fetchStub });
  const driver = api.mountCard({});
  let tree = driver.render();
  let escaped = null;
  try {
    chooseFile(tree, makeFile('ok.wav'));
  } catch (error) {
    escaped = error;
  }
  await settle(6);
  tree = driver.render();
  const buttons = findAll(tree, (node) => node.type === 'button');
  const importButton = buttons.find((button) => button.children.join('') === '导入音频');
  S.note('buttons after the throw', buttons.map((button) => `${button.children.join('')}${button.props.disabled === true ? ' [disabled]' : ''}`));
  S.note('card text tail', allText(tree).slice(-120));
  S.same('④ nothing escapes the change handler', escaped, null);
  S.check('④ the import button is back to 导入音频 and enabled', importButton !== undefined && importButton.props.disabled !== true, importButton === undefined ? 'no button found' : `label="${importButton.children.join('')}" disabled=${String(importButton.props.disabled)}`);
  S.deep('④ no button is stuck on 导入中…', buttons.filter((button) => button.children.join('') === '导入中…').map((button) => button.children.join('')), []);
  S.check('④ the failure is reported on the card', allText(tree).includes('导入失败'), allText(tree).slice(-160));
  S.same('④ nothing was written to the roster', api.scopeState.value.custom.length, 0);
}

/* ------------------------------------------------ unhandled-rejection control */
S.group('instrument control — can this sandbox even see an unhandled rejection?');
{
  const control = bootMissing();
  vm.runInContext('Promise.reject(new Error("probe: deliberate unhandled rejection")); globalThis.__PROBE_PROMISE__ = 1;', control.api.bundle.context);
  await settle(4);
  S.check('control: an unhandled rejection raised inside the vm realm IS observed by the watcher', rejections.seen.length >= 1, `watcher saw ${rejections.seen.length} rejection(s): ${rejections.seen.map((item) => String(item && item.message ? item.message : item)).join(' | ')}`);
  const pluginRejections = rejections.seen.filter((item) => String(item && item.message ? item.message : item).includes('probe: deliberate') === false);
  S.deep('no rejection from the plugin under test was observed anywhere in this probe', pluginRejections.map((item) => String(item && item.message ? item.message : item)), []);
}

S.done();
rejections.stop();
