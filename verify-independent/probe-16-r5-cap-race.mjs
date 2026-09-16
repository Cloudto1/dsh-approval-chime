/**
 * Independent rev-5 probe 16 — R4-CAP (the 51st import) and R4-RACE (read-modify-write).
 *
 * The browser half is driven exactly like the card drives it: a real file chosen
 * on the hidden input, the real `uploadAudio` request through a scripted `fetch`,
 * and the roster observed in the settings scope the card writes to.
 *
 * Scenarios:
 *   1. roster already at 50  → the import is refused BEFORE any upload, nothing is stored
 *   2. roster fills up while the upload is in flight → the new file is DELETED again (no orphan)
 *   3. another tab adds an entry while the upload is in flight → the write MERGES, nothing is lost
 *   4. the plain happy path still appends and selects, and deletes nothing
 *   5. a stored roster of 51 (legacy document) → 50 rows render, and the 51st tone becomes the
 *      synthetic "（文件缺失）" row — the documented residual behaviour
 *   6. cap enforcement + preview: the refused import must not make a sound or fetch a sample
 */

import { boot, entry, uuid, optionRows, chooseFile, makeFile, makeFetch, suite, settle, findAll, allText } from './kit/rev4.mjs';

const S = suite('probe-16 rev-5 roster cap + write-time re-read (independent)');

const LIMIT = 50;
const FALLBACK_TONE = 'chime';

/** A settings document with `count` valid roster entries. */
function rosterOf(count, prefix = 'item') {
  const list = [];
  for (let index = 1; index <= count; index += 1) list.push(entry(index, `${prefix}-${String(index).padStart(2, '0')}`));
  return list;
}

/**
 * Boot the card with a scripted upload and return handles for driving it.
 * `postPlan` is a `makeFetch` POST spec; `getPlan` covers the sample fetch.
 */
function harness(options = {}) {
  const upload = options.upload === undefined ? { json: { ok: true, id: uuid(90), name: 'new.wav', ext: 'wav', type: 'audio/wav', bytes: 4 } } : options.upload;
  const stub = makeFetch({ get: options.get === undefined ? { bytes: { tag: 'sample' } } : options.get, post: upload, del: { json: { ok: true, removed: true } } });
  const api = boot({
    scopeValue: {
      enabled: true,
      volume: 70,
      tone: options.tone === undefined ? FALLBACK_TONE : options.tone,
      custom: options.custom === undefined ? [] : options.custom,
    },
    fetch: stub,
  });
  const driver = api.mountCard({});
  return { api, driver, stub, tree: driver.render() };
}

const buttonsOf = (tree) => findAll(tree, (node) => node.type === 'button').map((button) => ({ label: button.children.join(''), disabled: button.props.disabled === true }));
const deletes = (stub) => stub.calls.filter((call) => call.method === 'DELETE');

/* ------------------------------------------------- 1. roster already at 50 */

S.group('1 — roster at 50: the 51st import is refused before any upload');
{
  const { api, driver, stub } = harness({ custom: rosterOf(LIMIT) });
  const tree = driver.render();
  S.same('the card renders exactly 50 imported rows', optionRows(tree).filter((row) => row.value.startsWith('custom:')).length, LIMIT);
  chooseFile(tree, makeFile('fifty-first.wav'));
  await settle(8);
  const after = driver.render();
  S.same('no upload request was made', stub.calls.filter((call) => call.method === 'POST').length, 0);
  S.same('no sample was fetched either', stub.audioCalls().length, 0);
  S.check('the card says the roster is full', allText(after).includes('导入音色已达上限（50 个）'), allText(after).slice(-160));
  S.same('the settings document was not touched', api.scopeState.value.custom.length, LIMIT);
  S.deep('the buttons are not stuck on 导入中…', buttonsOf(after).filter((button) => button.label === '导入中…'), []);
}

/* -------------------------------------- 2. roster fills while the upload runs */

S.group('2 — roster hits 50 while the upload is in flight: the new file is deleted again');
{
  const uploadId = uuid(91);
  const { api, driver, stub } = harness({ custom: rosterOf(LIMIT - 1), upload: { defer: true, response: { json: { ok: true, id: uploadId, name: 'late.wav', ext: 'wav', type: 'audio/wav', bytes: 4 } } } });
  let tree = driver.render();
  chooseFile(tree, makeFile('late.wav'));
  await settle(4);
  S.same('the upload really started', stub.calls.filter((call) => call.method === 'POST').length, 1);
  S.same('the request is still in flight', stub.deferred.length, 1);

  // Another tab wins the last slot while this request is on the wire.
  api.setSetting('custom', rosterOf(LIMIT, 'other'));
  stub.deferred[0].resolve();
  await settle(10);
  tree = driver.render();

  S.same('exactly one DELETE was issued for the just-uploaded file', deletes(stub).length, 1);
  S.same('the DELETE names the uploaded id', deletes(stub)[0].url, `/api/approval-chime/audio/${uploadId}`);
  S.same('the roster was NOT written (still the other tab\'s 50)', api.scopeState.value.custom.length, LIMIT);
  S.same('nothing from this import leaked into the roster', api.scopeState.value.custom.some((item) => item.id === uploadId), false);
  S.same('the tone was left alone', api.scopeState.value.tone, FALLBACK_TONE);
  S.check('the card reports the limit instead of a dead row', allText(tree).includes('导入音色已达上限（50 个）'), allText(tree).slice(-160));
  S.deep('the import button is idle again', buttonsOf(tree).filter((button) => button.label === '导入中…'), []);
  S.same('no sample was fetched for the rejected file', stub.audioCalls().length, 0);
}

/* ------------------------------- 3. another tab appends while the upload runs */

S.group('3 — another tab appends during the upload: the write MERGES');
{
  const existing = entry(1, 'first.wav');
  const otherTab = entry(2, 'other-tab.wav');
  const fresh = entry(93, 'mine.wav');
  const { api, driver, stub } = harness({
    custom: [existing],
    upload: { defer: true, response: { json: { ok: true, id: fresh.id, name: fresh.name, ext: 'wav', type: 'audio/wav', bytes: 4 } } },
  });
  const tree = driver.render();
  chooseFile(tree, makeFile('mine.wav'));
  await settle(4);
  api.setSetting('custom', [existing, otherTab]);
  stub.deferred[0].resolve();
  await settle(10);
  const written = api.scopeState.value.custom;
  S.deep('the write kept the other tab\'s entry AND appended ours', written.map((item) => item.id), [existing.id, otherTab.id, fresh.id]);
  S.same('the newly imported tone is selected', api.scopeState.value.tone, `custom:${fresh.id}`);
  S.same('no DELETE was issued', deletes(stub).length, 0);
  const rows = optionRows(driver.render());
  S.deep('the rendered order is [first, other-tab, mine, chime, bell, beep]', rows.map((row) => row.value), [`custom:${existing.id}`, `custom:${otherTab.id}`, `custom:${fresh.id}`, 'chime', 'bell', 'beep']);
  S.same('the imported preview played once', api.stats().previews, 1);
  S.same('and its sample was fetched once', stub.audioCalls().length, 1);
}

/* --------------------------------------------------------- 4. happy path */

S.group('4 — ordinary import: appended, selected, nothing deleted');
{
  const fresh = entry(94, 'only.wav');
  const { api, driver, stub } = harness({ upload: { json: { ok: true, id: fresh.id, name: fresh.name, ext: 'wav', type: 'audio/wav', bytes: 4 } } });
  const tree = driver.render();
  chooseFile(tree, makeFile('only.wav'));
  await settle(10);
  S.same('one upload, no delete', JSON.stringify([stub.calls.filter((call) => call.method === 'POST').length, deletes(stub).length]), JSON.stringify([1, 0]));
  S.deep('the roster holds exactly the new entry', api.scopeState.value.custom.map((item) => item.id), [fresh.id]);
  S.same('the tone points at it', api.scopeState.value.tone, `custom:${fresh.id}`);
  S.deep('and the row is first', optionRows(driver.render()).map((row) => row.value), [`custom:${fresh.id}`, 'chime', 'bell', 'beep']);
}

/* ------------------------------------------- 5. a legacy 51-entry document */

S.group('5 — a stored roster of 51 (older document): the residual behaviour is honest');
{
  const legacy = rosterOf(51, 'legacy');
  const { api, driver } = harness({ custom: legacy });
  const rows = optionRows(driver.render());
  S.same('only 50 imported rows render', rows.filter((row) => row.value.startsWith('custom:')).length, LIMIT);
  S.same('the 51st entry is not among them', rows.some((row) => row.value === `custom:${legacy[50].id}`), false);
  S.same('diagnostics.custom() also stops at 50', api.diagnostics.custom().length, LIMIT);

  // A tone pointing at the 51st (fresh install of an old document) still gets a row.
  const pointing = harness({ custom: legacy, tone: `custom:${legacy[50].id}` });
  const rows2 = optionRows(pointing.driver.render());
  S.deep('the selected 51st tone renders as the synthetic missing row, first', rows2[0], { value: `custom:${legacy[50].id}`, label: '（文件缺失）' });
  S.same('the select value still matches a row (never blank)', rows2.some((row) => row.value === rows2[0].value), true);
}

/* --------------------------------------------- 6. a refused import is silent */

S.group('6 — a refused import makes no sound and fetches nothing');
{
  const { api, driver, stub } = harness({ custom: rosterOf(LIMIT) });
  const before = api.stats();
  chooseFile(driver.render(), makeFile('nope.wav'));
  await settle(8);
  S.same('previews did not move', api.stats().previews, before.previews);
  S.same('no audio node was built', api.recorder.gains.length + api.recorder.oscillators.length + api.recorder.bufferSources.length, 0);
  S.same('no request of any kind was made', stub.calls.length, 0);
}

/* ------------------------------- 5b. TWO imports in flight (the real race) */

S.group('5b — two concurrent uploads: the cap and the re-read hold together');
{
  // (a) 49 entries, two uploads land: the first fills the roster, the second must be refused + deleted.
  const first = entry(95, 'a.wav');
  const second = entry(96, 'b.wav');
  let calls = 0;
  const stubA = makeFetch({
    get: { bytes: { tag: 'x' } },
    post: () => {
      calls += 1;
      return { defer: true, response: { json: { ok: true, id: calls === 1 ? first.id : second.id, name: calls === 1 ? first.name : second.name, ext: 'wav', type: 'audio/wav', bytes: 4 } } };
    },
    del: { json: { ok: true, removed: true } },
  });
  const apiA = boot({ scopeValue: { enabled: true, volume: 70, tone: 'chime', custom: rosterOf(LIMIT - 1, 'pre') }, fetch: stubA });
  const driverA = apiA.mountCard({});
  let treeA = driverA.render();
  chooseFile(treeA, makeFile('a.wav'));
  await settle(4);
  treeA = driverA.render();
  chooseFile(treeA, makeFile('b.wav'));
  await settle(4);
  S.same('both uploads are on the wire at once', stubA.deferred.length, 2);
  stubA.deferred[0].resolve();
  await settle(8);
  stubA.deferred[1].resolve();
  await settle(10);
  S.same('the roster ends at exactly 50, never 51', apiA.scopeState.value.custom.length, LIMIT);
  S.same('the first import is in it', apiA.scopeState.value.custom.some((item) => item.id === first.id), true);
  S.same('the second one is not', apiA.scopeState.value.custom.some((item) => item.id === second.id), false);
  S.same('and its file was deleted again', JSON.stringify(stubA.calls.filter((call) => call.method === 'DELETE').map((call) => call.url)), JSON.stringify([`/api/approval-chime/audio/${second.id}`]));
  S.check('the card reports the limit', allText(driverA.render()).includes('导入音色已达上限（50 个）'), allText(driverA.render()).slice(-120));

  // (b) 0 entries, two uploads land: both must survive (merge, no lost update).
  const one = entry(97, 'one.wav');
  const two = entry(98, 'two.wav');
  let callsB = 0;
  const stubB = makeFetch({
    get: { bytes: { tag: 'x' } },
    post: () => {
      callsB += 1;
      return { defer: true, response: { json: { ok: true, id: callsB === 1 ? one.id : two.id, name: callsB === 1 ? one.name : two.name, ext: 'wav', type: 'audio/wav', bytes: 4 } } };
    },
    del: { json: { ok: true, removed: true } },
  });
  const apiB = boot({ scopeValue: { enabled: true, volume: 70, tone: 'chime', custom: [] }, fetch: stubB });
  const driverB = apiB.mountCard({});
  let treeB = driverB.render();
  chooseFile(treeB, makeFile('one.wav'));
  await settle(4);
  treeB = driverB.render();
  chooseFile(treeB, makeFile('two.wav'));
  await settle(4);
  stubB.deferred[0].resolve();
  await settle(8);
  stubB.deferred[1].resolve();
  await settle(10);
  S.deep('both concurrent imports survive the write', apiB.scopeState.value.custom.map((item) => item.id), [one.id, two.id]);
  S.same('no file was deleted', stubB.calls.filter((call) => call.method === 'DELETE').length, 0);
  S.deep('and both render in order', optionRows(driverB.render()).slice(0, 2).map((row) => row.value), [`custom:${one.id}`, `custom:${two.id}`]);
}

/* ------------------------------- 5c. remove with no fetch at all */

S.group('5c — removing a tone when `fetch` is missing must not throw');
{
  const target = entry(99, 'gone.wav');
  const api = boot({ scopeValue: { enabled: true, volume: 70, tone: `custom:${target.id}`, custom: [target] }, fetch: 'absent' });
  const driver = api.mountCard({});
  const tree = driver.render();
  const remove = findAll(tree, (node) => node.type === 'button').find((button) => button.children.join('') === '移除');
  S.check('the remove button is offered', remove !== undefined, 'probe');
  let threw = null;
  try {
    remove.props.onClick();
  } catch (error) {
    threw = error;
  }
  await settle(6);
  S.same('clicking it does not throw', threw, null);
  S.same('the roster entry is still removed from the document', api.scopeState.value.custom.length, 0);
  S.same('and the tone falls back to the built-in default', api.scopeState.value.tone, 'chime');
}

S.done();
