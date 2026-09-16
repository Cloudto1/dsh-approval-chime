/**
 * Independent adversarial probe 9 (rev-4, task t1) — concurrency and the buffer cache.
 *
 * Claims under attack:
 *   4. the same id triggered concurrently fetches ONCE; two different ids in
 *      flight do not interfere; replaying reuses the decoded buffer.
 *
 * Adversarial extras: how the in-flight dedup behaves when the first request is
 * DEFERRED (both chimes issued while the fetch is still pending), what happens
 * after a failed load (negative caching?), and whether removing a roster entry
 * really drops the cached buffer.
 */

import { boot, entry, uuid, makeFetch, suite, settle, watchRejections } from './kit/rev4.mjs';

const S = suite('probe-9 rev-4 concurrency + sample cache (independent)');
const rejections = watchRejections();

const A = uuid(31);
const B = uuid(32);
const TONE_A = `custom:${A}`;
const TONE_B = `custom:${B}`;
const ROSTER = [entry(31, 'a.wav'), entry(32, 'b.wav')];

/** Boot with the roster above; `routes` maps an id to a fetch spec. */
function bootWith(routes, options = {}) {
  const fetchStub = makeFetch({
    get: (id) => {
      const spec = routes[id];
      if (spec === undefined) return { status: 404, json: { ok: false, error: 'audio not found' } };
      return spec;
    },
    del: { json: { ok: true, removed: true } },
  });
  const api = boot({
    scopeValue: { enabled: true, volume: 70, tone: options.tone === undefined ? 'chime' : options.tone, custom: ROSTER },
    fetch: fetchStub,
    audio: options.audio,
  });
  const driver = api.mountCard({});
  return { api, fetchStub, driver, tree: driver.render() };
}

const audioGets = (fetchStub) => fetchStub.audioCalls().map((call) => call.url.slice(call.url.lastIndexOf('/') + 1));

/* --------------------------------------- same id, two triggers in the same tick */

S.group('claim 4a — one id, two triggers in the same tick, a DEFERRED first response');
{
  const { api, fetchStub } = bootWith({ [A]: { defer: true, response: { bytes: { tag: A } } } });
  api.setSetting('tone', TONE_A);
  const one = api.diagnostics.preview();
  const two = api.diagnostics.preview();
  await settle(4);
  S.same('both triggers were accepted', JSON.stringify([one, two]), JSON.stringify([true, true]));
  S.same('exactly ONE fetch was issued while the first was in flight', audioGets(fetchStub).length, 1);
  S.same('the in-flight request is still the only one', fetchStub.deferred.length, 1);

  fetchStub.deferred[0].resolve();
  await settle(8);
  S.same('both triggers land as plays once the buffer arrives (shared promise)', api.stats().previews, 2);
  S.same('two buffer sources were started', api.recorder.bufferSources.length, 2);
  S.same('still only one fetch for the whole burst', audioGets(fetchStub).length, 1);
  S.check('both sources carry the SAME decoded buffer object', api.recorder.bufferSources[0].buffer === api.recorder.bufferSources[1].buffer, `identity equal = ${api.recorder.bufferSources[0].buffer === api.recorder.bufferSources[1].buffer}`);
}

/* ------------------------------------------------------ replaying reuses the buffer */

S.group('claim 4b — replaying a ready sample reuses the decoded buffer');
{
  const { api, fetchStub } = bootWith({ [A]: { bytes: { tag: A } } }, { tone: TONE_A });
  api.diagnostics.preview();
  await settle(8);
  const afterFirst = audioGets(fetchStub).length;
  api.diagnostics.preview();
  api.diagnostics.preview();
  await settle(8);
  S.same('three plays happened', api.stats().previews, 3);
  S.same('the network was touched exactly once', audioGets(fetchStub).length, afterFirst);
  S.same('three buffer sources were created (one per play)', api.recorder.bufferSources.length, 3);
  const buffers = api.recorder.bufferSources.map((source) => source.buffer);
  S.check('every play reused one and the same AudioBuffer instance', buffers[0] === buffers[1] && buffers[1] === buffers[2], JSON.stringify(buffers.map((buffer) => buffer === null ? null : buffer.id)));
  S.same('the decode happened once', api.recorder.decodeCalls.length, 1);
}

/* ------------------------------------------------- two different ids in one tick */

S.group('claim 4c — two different ids in flight do not interfere');
{
  const { api, fetchStub } = bootWith({ [A]: { defer: true, response: { bytes: { tag: A } } }, [B]: { defer: true, response: { bytes: { tag: B } } } });
  api.setSetting('tone', TONE_A);
  api.diagnostics.preview();
  api.setSetting('tone', TONE_B);
  api.diagnostics.preview();
  await settle(4);
  S.same('both files were requested', audioGets(fetchStub).sort().join(','), [A, B].sort().join(','));
  S.same('two independent in-flight requests', fetchStub.deferred.length, 2);
  fetchStub.deferred[1].resolve(); // resolve B first: the order must not matter
  await settle(6);
  S.same('B landed', api.stats().previews, 1);
  S.same('B produced a source carrying B bytes', api.recorder.bufferSources[0].buffer.bytes.tag, B);
  fetchStub.deferred[0].resolve();
  await settle(6);
  S.same('A landed afterwards without a second request', api.stats().previews, 2);
  S.same('A produced a source carrying A bytes', api.recorder.bufferSources[1].buffer.bytes.tag, A);
  S.same('still exactly two requests for two ids', audioGets(fetchStub).length, 2);
  S.check('the two decodes are distinct buffer objects', api.recorder.bufferSources[0].buffer !== api.recorder.bufferSources[1].buffer, 'distinct');
}

/* --------------------------------------------- two approvals in the same tick */

S.group('claim 4d — two approvals in one tick share one request');
{
  const { api, fetchStub } = bootWith({ [A]: { bytes: { tag: A } } }, { tone: TONE_A });
  api.fakeApi.publish([['s1', { sessionId: 's1', kind: 'approval', key: 'k1' }]]);
  api.fakeApi.publish([['s1', { sessionId: 's1', kind: 'approval', key: 'k2' }]]);
  await settle(10);
  S.same('two approvals were seen', api.stats().approvalsSeen, 2);
  S.same('two triggers were counted', api.stats().triggers, 2);
  S.same('but the file was fetched once', audioGets(fetchStub).length, 1);
  S.same('and decoded once', api.recorder.decodeCalls.length, 1);
  S.same('two plays used one buffer', api.recorder.bufferSources.length, 2);
  S.same('no counter was left in a failure state', api.stats().suppressedFailed, 0);
}

/* ---------------------------------------------- a failed load is not cached */

S.group('adversarial — a failed load is retried (there is no negative cache)');
{
  const { api, fetchStub } = bootWith({ [A]: { status: 404, json: { ok: false, error: 'audio not found' } } }, { tone: TONE_A });
  api.diagnostics.preview();
  await settle(8);
  api.diagnostics.preview();
  await settle(8);
  S.same('one failed request per attempt', audioGets(fetchStub).length, 2);
  S.same('each attempt is counted as a failure', api.stats().suppressedFailed, 2);
  S.same('no play was counted', api.stats().previews, 0);
  S.same('nothing stayed stuck in the in-flight table (a later success still works)', api.recorder.bufferSources.length, 0);
  // Now flip the file to "present" and show the retry succeeds.
  const retry = bootWith({ [A]: { bytes: { tag: A } } }, { tone: TONE_A });
  retry.api.diagnostics.preview();
  await settle(8);
  S.same('a present file plays', retry.api.stats().previews, 1);
}

/* --------------------------------------- removing a roster entry drops the buffer */

S.group('adversarial — the remove button drops the cached buffer');
{
  const { api, fetchStub, driver } = bootWith({ [A]: { bytes: { tag: A } } }, { tone: TONE_A });
  api.diagnostics.preview();
  await settle(8);
  S.same('played once', api.stats().previews, 1);
  const finds = [];
  const walk = (node) => {
    if (node === null || node === undefined || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (node.type === 'button') finds.push(node);
    walk(node.children);
  };
  walk(driver.tree);
  const remove = finds.find((button) => button.children.join('') === '移除');
  S.check('the card offers a 移除 button while a custom tone is selected', remove !== undefined, `buttons: ${finds.map((button) => button.children.join('')).join(' | ')}`);
  if (remove !== undefined) {
    remove.props.onClick();
    await settle(10);
    S.same('the delete request was sent to the host', fetchStub.calls.filter((call) => call.method === 'DELETE').length, 1);
    S.same('the roster was written back without the removed entry (B is kept)', JSON.stringify(api.scopeState.value.custom), JSON.stringify([{ id: B, name: 'b.wav' }]));
    S.same('the tone fell back to the built-in default', api.scopeState.value.tone, 'chime');
    const before = audioGets(fetchStub).length;
    api.setSetting('tone', TONE_A); // a stale document still naming the removed id
    api.diagnostics.preview();
    await settle(8);
    S.same('the buffer cache was dropped, so the file is fetched again', audioGets(fetchStub).length - before, 1);
  }
}

S.group('instrument control — no unhandled rejection anywhere in this probe');
{
  await settle(4);
  S.deep('rejections observed', rejections.seen.map((item) => String(item && item.message ? item.message : item)), []);
}

S.done();
rejections.stop();
