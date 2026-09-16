/**
 * Independent adversarial probe 7 (rev-4, task t1) — roster parsing / render order.
 *
 * Claims under attack (task wording):
 *   1. `custom` carrying malformed entries, duplicate ids, empty/overlong names,
 *      a non-array, more than 50 entries, mixed-case ids — the options the card
 *      actually renders must be the imported ones FIRST, in import order.
 *
 * Method: run the REAL lib/client.js in a vm sandbox, mount the REAL card
 * component over a fresh React hook runtime, and read the `<option>` rows out of
 * the returned element tree. Nothing from `dsh-approval-chime/verify/` is used.
 */

import { boot, entry, uuid, optionRows, optionValues, selectOf, chooseFile, makeFile, makeFetch, suite, settle, allText } from './kit/rev4.mjs';

const S = suite('probe-7 rev-4 roster parsing / order (independent)');
const BUILT_IN = ['chime', 'bell', 'beep'];

/** Mount a fresh card for one settings document and return `{ api, driver, tree }`. */
function mountWith(scopeValue, options = {}) {
  const api = boot({ scopeValue, fetch: options.fetch === undefined ? makeFetch({ get: { bytes: new ArrayBuffer(8) } }) : options.fetch, audio: options.audio });
  const driver = api.mountCard({});
  driver.runEffects();
  return { api, driver, tree: driver.render() };
}
/** Rows with long labels shortened, so a raw dump stays readable. */
function brief(rows) {
  return rows.map((row) => ({ value: row.value, label: row.label.length > 48 ? `${row.label.slice(0, 48)}…(${row.label.length} chars)` : row.label }));
}

function reportShape(label, api, tree) {
  if (api !== null) {
    S.note(`${label} · diagnostics.custom()`, brief(api.diagnostics.custom().map((item) => ({ value: item.id, label: item.name }))));
    S.note(`${label} · diagnostics.toneOptions()`, api.diagnostics.toneOptions().length > 12 ? `${api.diagnostics.toneOptions().length} values (first 12) ${JSON.stringify(api.diagnostics.toneOptions().slice(0, 12))}` : api.diagnostics.toneOptions());
  }
  S.note(`${label} · rendered options`, brief(optionRows(tree)));
}

/* ------------------------------------------------- shape A: malformed entries */

S.group('shape A — malformed entries inside a valid array');
{
  const v1 = uuid(1);
  const v2 = uuid(2);
  const v3 = uuid(3);
  const upper = uuid(4).toUpperCase(); // rev-6 N3: no longer a valid id — must be dropped
  const longName = 'x'.repeat(5000);
  /** rev-5 (D4/F4): the browser half bounds every display name to 120 CODE POINTS. */
  const clampedLongName = Array.from(longName).slice(0, 120).join('');
  const scopeValue = {
    enabled: true,
    volume: 70,
    tone: 'chime',
    custom: [
      { id: v1, name: 'first' },
      null,
      'not an object',
      42,
      () => {},
      [],
      { name: 'no id at all' },
      { id: 'not-a-uuid' },
      { id: `${v2}-too-long` },
      { id: v2 }, // no name → the id becomes the label
      { id: v1, name: 'duplicate of first' },
      { id: v3, name: '' }, // empty name → the id becomes the label
      { id: v3, name: 'duplicate of third' },
      { id: upper, name: 'upper case id' }, // rev-6 N3: dropped (id is not lowercase-uuid)
      { id: uuid(5), name: '   ' }, // whitespace-only name → rev-6 R-RESID: falls back to the id
      { id: uuid(6), name: longName },
      { id: uuid(7), name: 12345 },
    ],
  };
  const { api, driver, tree } = mountWith(scopeValue);
  reportShape('A', api, tree);

  const rows = optionRows(tree);
  const expected = [
    { value: `custom:${v1}`, label: 'first' },
    { value: `custom:${v2}`, label: v2 },
    { value: `custom:${v3}`, label: v3 },
    { value: `custom:${uuid(5)}`, label: uuid(5) },
    { value: `custom:${uuid(6)}`, label: clampedLongName },
    { value: `custom:${uuid(7)}`, label: uuid(7) },
    { value: 'chime', label: '风铃 chime' },
    { value: 'bell', label: '铃铛 bell' },
    { value: 'beep', label: '蜂鸣 beep' },
  ];
  S.deep('A: rendered rows are exactly the valid entries in source order, then the built-ins', rows, expected);
  S.deep('A: diagnostics.custom() agrees with the rendered rows', api.diagnostics.custom(), expected.slice(0, 6).map((row) => ({ id: row.value.slice('custom:'.length), name: row.label })));
  S.same('A: diagnostics.toneOptions() agrees with the rendered values', JSON.stringify(api.diagnostics.toneOptions()), JSON.stringify(optionValues(tree)));
  S.same('A: rendering did not throw', api.applyError, null);
  S.same('A: the select value is the stored tone', selectOf(tree).props.value, 'chime');
  S.check('A (rev-6 N3): the MIXED-CASE id is dropped — no row is offered for it', rows.some((row) => row.value.toLowerCase() === `custom:${upper.toLowerCase()}`) === false && rows.some((row) => row.value === `custom:${upper}`) === false, `rows=${JSON.stringify(rows.map((row) => row.value))}`);
  S.same('A (rev-6 R-RESID): a whitespace-only name falls back to the id instead of a blank row', rows[3].label, uuid(5));
  S.same('A: over-long name is bounded to 120 CODE POINTS (rev-5 D4/F4)', Array.from(rows[4].label).length, 120);
  S.check('A: and the bound is byte-identical to the first 120 code points of the source name', rows[4].label === clampedLongName, `length=${rows[4].label.length} utf16 units`);
  S.check('A: every rendered label is non-blank (no empty-looking option)', rows.every((row) => row.label.trim().length > 0), JSON.stringify(rows.map((row) => row.label)));
  void driver;
}

/* ------------------------------------------------------ shape B: non-array custom */

S.group('shape B — `custom` is not an array of entries');
{
  const shapes = [
    ['missing key', { enabled: true, volume: 70, tone: 'chime' }],
    ['null', { enabled: true, volume: 70, tone: 'chime', custom: null }],
    ['string', { enabled: true, volume: 70, tone: 'chime', custom: 'nope' }],
    ['number', { enabled: true, volume: 70, tone: 'chime', custom: 7 }],
    ['object map', { enabled: true, volume: 70, tone: 'chime', custom: { 0: { id: uuid(1), name: 'a' } } }],
  ];
  for (const [label, scopeValue] of shapes) {
    const { api, tree } = mountWith(scopeValue);
    const values = optionValues(tree);
    S.deep(`B(${label}): only the built-ins are offered`, values, BUILT_IN);
    S.same(`B(${label}): no exception escaped the render`, api.applyError, null);
  }
}

/* ------------------------------------------------------------ shape B2: holes */

S.group('shape B2 — a sparse array / `undefined` entries never poison the rest');
{
  const { api, tree } = mountWith({ enabled: true, volume: 70, tone: 'chime', custom: [undefined, , null, { id: uuid(2), name: 'after-holes' }] });
  reportShape('B2', api, tree);
  S.deep('B2: the valid entry after the holes is still rendered', optionRows(tree).slice(0, 2), [
    { value: `custom:${uuid(2)}`, label: 'after-holes' },
    { value: 'chime', label: '风铃 chime' },
  ]);
  S.same('B2: nothing else leaked in', optionValues(tree).length, 4);
}

/* ------------------------------------------------------------ shape C: 60 entries */

S.group('shape C — more entries than the CUSTOM_LIMIT (50)');
{
  const many = [];
  for (let index = 1; index <= 60; index += 1) many.push(entry(index, `import-${String(index).padStart(2, '0')}`));
  const { api, tree } = mountWith({ enabled: true, volume: 70, tone: 'chime', custom: many });
  const rows = optionRows(tree);
  S.same('C: exactly 50 imported rows render', rows.filter((row) => row.value.startsWith('custom:')).length, 50);
  S.deep('C: first row is the first import', rows[0], { value: `custom:${uuid(1)}`, label: 'import-01' });
  S.deep('C: 50th row is the 50th import', rows[49], { value: `custom:${uuid(50)}`, label: 'import-50' });
  S.same('C: the 51st import is not offered', rows.some((row) => row.value === `custom:${uuid(51)}`), false);
  S.same('C: order is the source order end to end', JSON.stringify(rows.slice(0, 50).map((row) => row.value)), JSON.stringify(many.slice(0, 50).map((item) => `custom:${item.id}`)));
  S.same('C: diagnostics.custom() length', api.diagnostics.custom().length, 50);
}

/* ------------------------------------------- shape D: duplicates + case variants */

S.group('shape D — duplicate ids and case-only differences');
{
  const a = uuid(1);
  const A = uuid(1).toUpperCase();
  const { tree } = mountWith({
    enabled: true,
    volume: 70,
    tone: 'chime',
    custom: [
      { id: a, name: 'lower' },
      { id: A, name: 'upper (same hex, different case)' },
      { id: a, name: 'lower again' },
    ],
  });
  const rows = optionRows(tree);
  reportShape('D', null, tree);
  S.same('D: entry count (3 source entries: exact duplicate dropped, mixed-case id dropped)', rows.length, 4);
  S.deep('D (rev-6 N3): the mixed-case id is dropped, the exact duplicate keeps the first name', rows.slice(0, 2), [
    { value: `custom:${a}`, label: 'lower' },
    { value: 'chime', label: '风铃 chime' },
  ]);
  S.check('D: no row exists for the mixed-case id (every rendered value is already lowercase)', rows.filter((row) => row.value.startsWith('custom:')).every((row) => row.value === row.value.toLowerCase()), `rows=${JSON.stringify(rows.map((row) => row.value))}`);
  S.same('D: the duplicate of the lowercase id contributed only its first name', rows[0].label, 'lower');
}

/* ------------------------------------------------ shape E: import order, live */

S.group('shape E — the import path appends (order = import order)');
{
  const first = entry(11, 'first.wav');
  const second = entry(12, 'second.wav');
  let uploadIndex = 0;
  const fetchStub = makeFetch({
    get: { bytes: new ArrayBuffer(8) },
    post: (call) => {
      uploadIndex += 1;
      const picked = uploadIndex === 1 ? first : second;
      return { json: { ok: true, id: picked.id, name: picked.name, ext: 'wav', type: 'audio/wav', bytes: 8 } };
    },
  });
  const { api, driver } = mountWith({ enabled: true, volume: 70, tone: 'chime', custom: [] }, { fetch: fetchStub });

  let tree = driver.render();
  chooseFile(tree, makeFile('first.wav'));
  await settle(8);
  tree = driver.render();
  const afterFirst = optionValues(tree);
  S.deep('E: after importing first.wav the imports lead the list and it becomes the selected tone', afterFirst, [`custom:${first.id}`, ...BUILT_IN]);
  S.same('E: the settings write selected the imported tone', selectOf(tree).props.value, `custom:${first.id}`);
  S.same('E: the first import was uploaded once', fetchStub.uploadCalls().length, 1);

  chooseFile(tree, makeFile('second.wav'));
  await settle(8);
  tree = driver.render();
  const afterSecond = optionValues(tree);
  S.deep('E: the second import is APPENDED (first import stays first)', afterSecond, [`custom:${first.id}`, `custom:${second.id}`, ...BUILT_IN]);
  S.same('E: the newly imported tone becomes the selection', selectOf(tree).props.value, `custom:${second.id}`);
  S.same('E: every import is previewed once (previews counter)', api.stats().previews, 2);
  S.same('E: the roster write order was [first, second]', JSON.stringify(api.scopeState.value.custom.map((item) => item.id)), JSON.stringify([first.id, second.id]));
  S.same('E: `custom` label rows keep the Host names verbatim', optionRows(tree)[1].label, 'second.wav');
}

/* ------------------------------------------------------- shape F: malformed file */

S.group('shape F — import guards (oversize / no fetch)');
{
  const fetchStub = makeFetch({ get: { bytes: new ArrayBuffer(8) }, post: { json: { ok: true, id: uuid(21), name: 'n.wav' } } });
  const { driver } = mountWith({ enabled: true, volume: 70, tone: 'chime', custom: [] }, { fetch: fetchStub });
  let tree = driver.render();
  chooseFile(tree, makeFile('huge.wav', 6 * 1024 * 1024));
  await settle(4);
  tree = driver.render();
  S.same('F: an oversize file is refused before any request', fetchStub.uploadCalls().length, 0);
  S.check('F: the refusal is shown on the card', JSON.stringify(tree).includes('文件超过 5 MB 上限'), allText(tree).includes('文件超过 5 MB 上限') ? '' : 'no hint text found');

  const noFetch = mountWith({ enabled: true, volume: 70, tone: 'chime', custom: [] }, { fetch: 'absent' });
  let tree2 = noFetch.driver.render();
  chooseFile(tree2, makeFile('ok.wav'));
  await settle(4);
  tree2 = noFetch.driver.render();
  S.check('F: with no fetch the card says so instead of throwing', allText(tree2).includes('当前浏览器不支持文件导入'), allText(tree2).slice(0, 200));
}

S.done();
