/**
 * probe-8 — rev-4 browser half + schema: the roster, the rendered card, the
 * 3-row CSS and the import/remove flow (attack surfaces 5 and 9 of the brief).
 *
 * Instrument: this probe's OWN stubs (kit/rev4-kit.mjs): a mini React with
 * synchronous re-render, a fake DOM that captures the injected <style>, a fake
 * settings scope, and `lib/client.js` executed unmodified inside a vm context as
 * the browser bundle it is. Nothing from verify/** is imported.
 *
 * Run: node dsh-approval-chime/verify-independent/probe-8-client-roster-render.mjs
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  AUDIO_DIR,
  CLIENT_HALF,
  ID_A,
  ID_B,
  ID_C,
  PLUGIN_DIR,
  createAudioStub,
  createClientHarness,
  createClientSandbox,
  createLog,
  createScope,
  extractSupportsBlock,
  failFastOnCrash,
  flattenText,
  elementsOfType,
  settle,
  sha256,
  styleTextOf,
  trackHazards,
} from './kit/rev4-kit.mjs';

const plugin = await import('../lib/index.js');
const log = createLog('probe-8-client-roster-render');
const hazards = trackHazards();
failFastOnCrash(log, hazards);

log.note('command: node dsh-approval-chime/verify-independent/probe-8-client-roster-render.mjs');
log.note(`node ${process.version} / ${process.platform}`);
log.note(`lib/index.js sha256 ${sha256(join(PLUGIN_DIR, 'lib', 'index.js'))}`);
log.note(`lib/client.js sha256 ${sha256(CLIENT_HALF)}`);

/* ------------------------------------------------------------- 1. the schema */

log.section('1. tone/custom schema: the widening really is a closed set');

const loaded = plugin.loadSchemastery({});
log.check('a real @deepseek-ai/schemastery was loaded', typeof loaded.z === 'function', `mode=${loaded.mode} path=${loaded.path}`);
const schema = plugin.buildSchema(loaded.z);
const validate = (value) => {
  try {
    return { ok: true, value: schema(value) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
};

const accept = [
  ['built-in chime', { tone: 'chime' }, 'chime'],
  ['built-in bell', { tone: 'bell' }, 'bell'],
  ['built-in beep', { tone: 'beep' }, 'beep'],
  ['custom:<lowercase uuid>', { tone: `custom:${ID_B}` }, `custom:${ID_B}`],
  ['no tone at all (default applies)', {}, 'chime'],
  ['roster entry', { custom: [{ id: ID_A, name: 'a.mp3' }] }, undefined],
];
for (const [label, input, expected] of accept) {
  const result = validate(input);
  log.check(`accepts ${label}`, result.ok === true, result.ok ? JSON.stringify(result.value) : result.error);
  if (result.ok && expected !== undefined && input.tone !== undefined) log.equal(`  …and keeps the value for ${label}`, result.value.tone, expected);
}

const reject = [
  ['a bare garbage tone', { tone: 'garbage' }],
  ['an empty tone', { tone: '' }],
  ['a capitalised built-in', { tone: 'Chime' }],
  ['a padded built-in', { tone: ' chime ' }],
  ['custom: with no id', { tone: 'custom:' }],
  ['custom:<non-uuid>', { tone: 'custom:not-a-uuid' }],
  ['custom:<uuid> with a path', { tone: 'custom:../../evil' }],
  ['custom:<uuid> plus trailing text', { tone: `custom:${ID_A}x` }],
  ['custom:<uuid> plus a newline (anchoring check)', { tone: `custom:${ID_A}\n` }],
  ['custom:<uuid> with an extra dash group', { tone: `custom:${ID_A}-1` }],
  // rev-6 (N3) rebaseline: the id pattern is lowercase-hex only, so an UPPERCASE uuid
  // is refused by the schema (lib/index.js TONE_PATTERN) instead of being accepted and
  // later 404-ing against the case-sensitive file lookup.
  ['custom:<UPPERCASE uuid> (rev-6 N3: ids are lowercase-only)', { tone: `custom:${ID_B.toUpperCase()}` }],
  ['a non-string tone', { tone: 7 }],
  ['volume above the maximum', { volume: 101 }],
  ['volume below the minimum', { volume: -1 }],
  ['a string volume', { volume: '70' }],
  ['custom as an object', { custom: { id: ID_A } }],
  ['custom entry with a numeric id', { custom: [{ id: 7, name: 'x' }] }],
  // rev-6 (N3) rebaseline: the roster id must be a lowercase uuid, so the malformed ids
  // are refused by the SCHEMA now — the browser half's own filter is exercised in
  // section 2 against a hand-written (unvalidated) scope value below.
  ['a roster id that is not a uuid', { custom: [{ id: 'not-a-uuid', name: 'y' }] }],
  ['a roster id with a path', { custom: [{ id: '../../evil', name: 'x' }] }],
];
for (const [label, input] of reject) {
  const result = validate(input);
  log.check(`refuses ${label}`, result.ok === false, result.ok ? `ACCEPTED as ${JSON.stringify(result.value)}` : result.error.split('\n')[0]);
}

log.deepEqual('the empty document yields the documented defaults', validate({}).value, { enabled: true, volume: 70, tone: 'chime', custom: [] });
const nameless = validate({ custom: [{ id: ID_A }] });
log.check('a roster entry WITHOUT a name is accepted and the name field is dropped', nameless.ok === true && nameless.value.custom[0].name === undefined, JSON.stringify(nameless.ok ? nameless.value.custom : nameless.error));
log.note('so the documented "custom: [{id,name}]" is really "{id, name?}": the browser half substitutes the id for a missing name (see the roster section)');
const manyRoster = validate({ custom: Array.from({ length: 5000 }, (_, index) => ({ id: `${String(index).padStart(8, '0')}-0000-4000-8000-000000000000`, name: 'n'.repeat(1000) })) });
log.check('the schema accepts an unbounded roster (5000 entries, 1000-char names)', manyRoster.ok === true, manyRoster.ok ? `${manyRoster.value.custom.length} entries kept` : manyRoster.error.split('\n')[0]);
const weirdIds = validate({ custom: [{ id: '../../evil', name: 'x' }, { id: 'not-a-uuid', name: 'y' }] });
log.check('the schema refuses non-uuid roster ids (rev-6 N3 closed the widening)', weirdIds.ok === false, JSON.stringify(weirdIds.ok ? weirdIds.value.custom : weirdIds.error));

/* --------------------------------------------------- 2. roster normalisation */

log.section('2. roster normalisation and option order (diagnostics surface)');

const sandbox = createClientSandbox();
log.check('lib/client.js registered exactly one module', sandbox.registrations.length === 1, String(sandbox.registrations.length));
log.equal('module id', sandbox.registrations[0]?.id, 'dsh-approval-chime');

const rosterValue = {
  enabled: true,
  volume: 70,
  tone: `custom:${ID_A}`,
  custom: [
    { id: ID_A, name: 'first.mp3' },
    { id: ID_B, name: 'second.wav' },
    null,
    'nope',
    { id: 'not-a-uuid', name: 'malformed' },
    { id: ID_A, name: 'duplicate of first' },
    { id: ID_C },
    { id: `${ID_A}-extra`, name: 'almost a uuid' },
    { id: ID_B.toUpperCase(), name: 'UPPERCASE uuid' },
    { name: 'no id at all' },
  ],
};
const scope = createScope(rosterValue);
const harness = createClientHarness(sandbox, { scope });
harness.apply();
const diagnostics = harness.diagnostics;
log.check('diagnostics surface installed', diagnostics !== null && typeof diagnostics === 'object');
log.check('revision stamp names the revision under test (rev-20)', String(diagnostics.revision).includes('rev-20'), String(diagnostics.revision));
log.equal('diagnostics.toneRows', diagnostics.toneRows, 3);
log.equal('diagnostics.customPrefix', diagnostics.customPrefix, 'custom:');
log.deepEqual('master gain is unchanged by rev-4', diagnostics.masterGain, 0.6);

log.deepEqual(
  'malformed/duplicate entries are dropped, a nameless entry falls back to its id',
  diagnostics.custom(),
  [
    { id: ID_A, name: 'first.mp3' },
    { id: ID_B, name: 'second.wav' },
    { id: ID_C, name: ID_C },
  ],
);
log.deepEqual(
  'option order is imports (import order) then the built-ins',
  diagnostics.toneOptions(),
  [`custom:${ID_A}`, `custom:${ID_B}`, `custom:${ID_C}`, 'chime', 'bell', 'beep'],
);
log.check(
  'a MIXED-CASE roster id is dropped by the browser half too (rev-6 N3: lowercase-uuid ids only)',
  diagnostics.custom().every((entry) => entry.id !== ID_B.toUpperCase()) &&
    diagnostics.toneOptions().every((value) => value !== `custom:${ID_B.toUpperCase()}`),
  `roster=${JSON.stringify(diagnostics.custom().map((entry) => entry.id))} options=${JSON.stringify(diagnostics.toneOptions())}`,
);
log.note(
  'rebaselined at rev-15: the UPPERCASE-uuid entry in the hand-written roster above is gone from BOTH sides. ' +
    'The schema refuses a mixed-case id (section 1) and the client filters it out again (rev-6 N3: readRoster keys on the lowercase-uuid pattern); ' +
    'the host lookup stays case-sensitive, so an id that cannot be lowercased cannot be resolved.',
);

const longName = 'L'.repeat(200000);
const capScope = createScope({ enabled: true, volume: 70, tone: 'chime', custom: [{ id: ID_A, name: longName }] });
const capSandbox = createClientSandbox();
const capHarness = createClientHarness(capSandbox, { scope: capScope });
capHarness.apply();
const cappedRoster = capHarness.diagnostics.custom();
/* rev-5 (D4/F4) rebaseline: the client bounds every display name to 120 CODE POINTS
 * (lib/client.js `clampName` → NAME_LIMIT = 120), so a hand-edited 200k name can no
 * longer reach the rendered option. */
log.equal('a 200k-character display name IS bounded on the client (rev-5 D4/F4: 120 code points)', String(cappedRoster[0]?.name).length, 120);
log.note(`readRoster bounds the name to ${String(cappedRoster[0]?.name).length} code points (the host bounds its upload echo the same way); an unbounded name is no longer rendered`);

const overflowRoster = Array.from({ length: 60 }, (_, index) => ({
  id: `${String(index).padStart(8, '0')}-1111-4111-8111-111111111111`,
  name: `file-${index}.mp3`,
}));
const overflowScope = createScope({ enabled: true, volume: 70, tone: 'chime', custom: overflowRoster });
const overflowSandbox = createClientSandbox();
const overflowHarness = createClientHarness(overflowSandbox, { scope: overflowScope });
overflowHarness.apply();
log.equal('a 60-entry roster is capped at 50 rendered rows', overflowHarness.diagnostics.custom().length, 50);
log.equal('the cap keeps the FIRST 50 (order preserved)', overflowHarness.diagnostics.custom()[49]?.name, 'file-49.mp3');

for (const [label, custom] of [
  ['custom is a string', 'nope'],
  ['custom is an object', { id: ID_A }],
  ['custom is null', null],
  ['custom is missing', undefined],
]) {
  const s = createClientSandbox();
  const h = createClientHarness(s, { scope: createScope({ enabled: true, volume: 70, tone: 'chime', custom }) });
  h.apply();
  log.deepEqual(`${label} -> empty roster, no crash`, h.diagnostics.custom(), []);
}

log.section('2b. tone values that no longer exist');
for (const [label, tone, expectFirst] of [
  ['tone points at a deleted id', `custom:${ID_B}`, `custom:${ID_B}`],
  ['tone is a malformed custom id', 'custom:not-a-uuid', 'chime'],
  ['tone is unknown text', 'nope', 'chime'],
  ['tone is a number', 42, 'chime'],
  ['tone is null', null, 'chime'],
]) {
  const s = createClientSandbox();
  const h = createClientHarness(s, { scope: createScope({ enabled: true, volume: 70, tone, custom: [{ id: ID_A, name: 'kept.mp3' }] }) });
  h.apply();
  const settings = h.diagnostics.settings();
  log.equal(`${label}: normalised tone`, settings.tone, expectFirst);
  log.deepEqual(`${label}: diagnostics option list`, h.diagnostics.toneOptions(), [`custom:${ID_A}`, 'chime', 'bell', 'beep']);
}

/* ------------------------------------------------- 3. rendered card (real tree) */

log.section('3. the rendered card: rows, order, remove affordance');

harness.mountCard({});
const optionNodes = harness.mini.getTree() === null ? [] : harness.options();
log.deepEqual('the select renders the same order as the diagnostics', optionNodes, diagnostics.toneOptions());
log.equal('the selected value is the first imported tone', harness.select()?.props.value, `custom:${ID_A}`);
log.check(
  'the selected value matches one rendered option (no blank select)',
  optionNodes.includes(harness.select()?.props.value),
  `value=${harness.select()?.props.value} options=${JSON.stringify(optionNodes)}`,
);
log.equal('a remove button is offered for an imported tone', harness.buttonLabels().includes('移除'), true);
log.equal('an import button is offered', harness.buttonLabels().includes('导入音频'), true);
log.equal('the file input accepts audio/*', harness.fileInput()?.props.accept, 'audio/*');
log.equal('the file input is hidden by class (not by display:none in JS)', harness.fileInput()?.props.className, 'dacFile');
log.equal('the tone select is not disabled while the scope is writable', harness.select()?.props.disabled, false);
log.raw('the rendered buttons', harness.buttonLabels().join(' | '));

const missingSandbox = createClientSandbox();
const missingHarness = createClientHarness(missingSandbox, {
  scope: createScope({ enabled: true, volume: 70, tone: `custom:${ID_B}`, custom: [{ id: ID_A, name: 'kept.mp3' }] }),
});
missingHarness.apply();
missingHarness.mountCard({});
const missingOptions = missingHarness.mini.getTree() === null ? [] : missingHarness.options();
log.deepEqual('a tone whose file/roster entry is gone still gets a row, in front', missingOptions, [`custom:${ID_B}`, `custom:${ID_A}`, 'chime', 'bell', 'beep']);
log.equal('the dangling row is labelled as missing', danglingLabel(missingHarness), '（文件缺失）');
log.equal('the select value still resolves to a row', missingOptions.includes(missingHarness.select()?.props.value), true);
log.equal('a remove button is offered for the dangling tone too', missingHarness.buttonLabels().includes('移除'), true);

/** The label of the row rendered for `custom:${ID_B}`. */
function danglingLabel(h) {
  const node = h.mini.getTree();
  if (node === null) return null;
  const found = elementsOfType(node, 'option').find((option) => option.props.value === `custom:${ID_B}`);
  return found === undefined ? null : flattenText(found);
}

const builtinScope = createScope({ enabled: true, volume: 70, tone: 'bell', custom: [] });
const builtinSandbox = createClientSandbox();
const builtinHarness = createClientHarness(builtinSandbox, { scope: builtinScope });
builtinHarness.apply();
builtinHarness.mountCard({});
log.equal('with a built-in tone selected, no remove button is rendered', builtinHarness.buttonLabels().includes('移除'), false);
log.deepEqual('with an empty roster the select is just the built-ins', builtinHarness.options(), ['chime', 'bell', 'beep']);

/* ------------------------------------------------------------------ 4. the CSS */

log.section('4. CSS: three rows, and only inside @supports (appearance:base-select)');

const css = styleTextOf(sandbox);
log.check('the style tag was injected', css.length > 0, `${css.length} characters`);
const supports = extractSupportsBlock(css, '(appearance:base-select)');
log.check('the @supports (appearance:base-select) block exists and is balanced', supports !== null && supports.body.length > 0, supports === null ? 'no block' : `body ${supports.body.length} chars`);
if (supports !== null) {
  // rev-12 rebaseline: the two tone pickers now share one declaration set and differ
  // only in their row count. The card's cap is exactly TONE_ROWS * 28px = 84px; the
  // 92px the rev-4 probe looked for was the previous border-box box that clipped its
  // third row (lib/client.js:1851-1864 records that as review R5-1). The popover's cap
  // is one row longer plus its 8px slack: 4 * 28 + 8 = 120px.
  log.check('the card picker cap (84px = 3 rows) sits INSIDE the @supports block', supports.body.includes('max-height:84px'), supports.body.slice(0, 200));
  log.check('the popover picker cap (120px = 4 rows + 8px slack) sits INSIDE the same block', supports.body.includes('max-height:120px'), supports.body.slice(0, 200));
  log.check('overflow-y:auto sits INSIDE the @supports block', supports.body.includes('overflow-y:auto'), '');
  log.check('the select itself opts into base-select inside the same block', supports.body.includes('select{appearance:base-select;}'), '');
  log.check('the picker keeps its 10px radius inside the same block', supports.body.includes('border-radius:10px'), '');
  log.check('the option row is pinned to line-height:20px', supports.body.includes('line-height:20px'), '');
  log.check('the option row has 4px vertical padding', supports.body.includes('padding:4px 9px'), '');
  log.check('the picker has 4px padding', supports.body.includes('::picker(select){appearance:base-select;margin-top:4px;padding:4px;'), '');
}
const maxHeightCount = css.split('max-height').length - 1;
log.equal('max-height appears exactly twice — the card cap and the popover cap (rev-12 split them)', maxHeightCount, 2);
const outside = css.replace(supports === null ? '' : supports.body, '');
log.check('no max-height leaks outside the @supports block', outside.includes('max-height') === false, outside.includes('max-height') ? 'found outside' : 'clean');
const rowMath = 3 * 28; // TONE_ROWS * TONE_ROW_PX
log.equal('the row height the comment claims (20px line box + 2x4px padding)', 28, 20 + 4 * 2);
log.equal('the card cap is exactly 3 rows (3 x 28px, no picker padding baked in)', rowMath, 84);
log.check(
  'diagnostics agrees with BOTH CSS caps (card = toneRows rows, popover = toneRows + 1 rows + 8px slack)',
  supports !== null &&
    supports.body.includes(`max-height:${diagnostics.toneRows * 28}px;`) &&
    supports.body.includes(`max-height:${(diagnostics.toneRows + 1) * 28 + 8}px;`),
  `toneRows=${diagnostics.toneRows}`,
);
log.unproven(
  'CSS-ROLL',
  'whether 84px really shows exactly three rows (and 120px four) and then a scrollbar is a rendering fact: it needs a browser with appearance:base-select (Chrome/Edge >= 135). This probe can only prove the arithmetic and the selector placement.',
);

/* --------------------------------------------------- 5. import flow (append!) */

log.section('5. the import flow: append, select, preview, refusals');

const importSandbox = createClientSandbox();
const importScope = createScope({ enabled: true, volume: 70, tone: 'chime', custom: [] });
const importHarness = createClientHarness(importSandbox, { scope: importScope });
const fetchCalls = [];
/**
 * rev-10 rebaseline: since rev-10 the bundle also reads the per-session override table
 * once at mount (`refreshSessions()` → fetch(SESSIONS_ROUTE), lib/client.js:2982/1162).
 * That request is NOT an import request, so it is counted on its own (asserted below)
 * and kept out of `fetchCalls` — otherwise `fetchCalls[0]` is the mount read and every
 * "the upload …" assertion below reads the wrong request.
 */
const MOUNT_READ_URL = plugin.SESSIONS_ROUTE;
let mountReads = 0;
const recordFetch = (url, options = {}) => {
  if (String(url) === MOUNT_READ_URL) {
    mountReads += 1;
    return;
  }
  fetchCalls.push({ url, options });
};
const audioStub = createAudioStub();
importSandbox.window.AudioContext = audioStub.AudioContext;
let nextId = ID_A;
importSandbox.setGlobal('fetch', (url, options = {}) => {
  recordFetch(url, options);
  if (options.method === 'POST') {
    const id = nextId;
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, id, name: 'uploaded.mp3', ext: 'mp3', type: 'audio/mpeg', bytes: 12 }) });
  }
  if (options.method === 'DELETE') return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, removed: true }) });
  return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)) });
});
importHarness.apply();
importHarness.mountCard({});
log.equal('the mount-time read of the per-session table happened once and is not an import request (rev-10)', mountReads, 1);

const fileOne = { size: 12, type: 'audio/mpeg', name: 'first upload.mp3' };
importHarness.chooseFile(fileOne);
await settle();
log.equal('the upload posts to the audio route', fetchCalls[0]?.url, plugin.AUDIO_ROUTE);
log.equal('the upload uses POST', fetchCalls[0]?.options.method, 'POST');
log.equal('the upload asks for same-origin credentials', fetchCalls[0]?.options.credentials, 'same-origin');
log.equal('the file rides the dedicated encoded header', fetchCalls[0]?.options.headers['x-chime-name'], encodeURIComponent('first upload.mp3'));
log.equal('the File object itself is the body', fetchCalls[0]?.options.body, fileOne);
log.equal('the content type comes from the file', fetchCalls[0]?.options.headers['content-type'], 'audio/mpeg');
const firstSet = importScope.calls.filter((call) => call.op === 'set');
log.equal('the roster write APPENDS the new entry', JSON.stringify(firstSet.find((call) => call.field === 'custom')?.value), JSON.stringify([{ id: ID_A, name: 'uploaded.mp3' }]));
log.equal('the new tone is selected immediately', firstSet.find((call) => call.field === 'tone')?.value, `custom:${ID_A}`);
await settle();
log.equal('the first import is previewed', importHarness.diagnostics.stats().previews, 1);
log.deepEqual('after one import the option order is [import, builtins]', importHarness.options(), [`custom:${ID_A}`, 'chime', 'bell', 'beep']);
log.deepEqual('diagnostics agree on the roster order', importHarness.diagnostics.custom().map((entry) => entry.id), [ID_A]);

nextId = ID_B;
importHarness.chooseFile({ size: 20, type: 'audio/wav', name: 'second.wav' });
await settle();
const customWrites = importScope.calls.filter((call) => call.op === 'set' && call.field === 'custom');
log.equal('the second import is appended AFTER the first', JSON.stringify(customWrites[customWrites.length - 1]?.value), JSON.stringify([{ id: ID_A, name: 'uploaded.mp3' }, { id: ID_B, name: 'uploaded.mp3' }]));
log.deepEqual(
  'first imported still renders first',
  importHarness.options(),
  [`custom:${ID_A}`, `custom:${ID_B}`, 'chime', 'bell', 'beep'],
);
log.equal('the newest import is selected', importHarness.select()?.props.value, `custom:${ID_B}`);
log.equal('the file input is re-armed so the same file can be picked twice', importHarness.lastFileTarget?.value, '');

const postsBefore = fetchCalls.filter((call) => call.options.method === 'POST').length;
importHarness.chooseFile({ size: plugin.MAX_AUDIO_BYTES + 1, type: 'audio/mpeg', name: 'huge.mp3' });
await settle();
log.equal('an oversized file is refused before any upload', fetchCalls.filter((call) => call.options.method === 'POST').length, postsBefore);
log.check('and the card says so', JSON.stringify(importHarness.mini.getTree()).includes('5 MB'), 'looked for the "文件超过 5 MB 上限" copy in the tree');

importSandbox.setGlobal('fetch', undefined);
const savedFetch = fetchCalls.length;
importHarness.chooseFile({ size: 5, type: 'audio/mpeg', name: 'nofetch.mp3' });
await settle();
log.equal('a browser without fetch imports nothing', fetchCalls.length, savedFetch);
log.check('and the card explains why', JSON.stringify(importHarness.mini.getTree()).includes('不支持文件导入'), 'looked for the "当前浏览器不支持文件导入" copy');
importSandbox.setGlobal('fetch', (url, options = {}) => {
  recordFetch(url, options);
  if (options.method === 'POST') {
    return Promise.resolve({ ok: false, status: 415, json: () => Promise.resolve({ ok: false, error: 'unsupported audio type "txt"' }) });
  }
  return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)) });
});
const rosterBefore = JSON.stringify(importHarness.diagnostics.custom());
importHarness.chooseFile({ size: 5, type: 'text/plain', name: 'notes.txt' });
await settle();
log.equal('a Host refusal leaves the roster untouched', JSON.stringify(importHarness.diagnostics.custom()), rosterBefore);
log.check('a Host refusal surfaces the Host message', JSON.stringify(importHarness.mini.getTree()).includes('unsupported audio type'), 'looked for the 415 message in the tree');

importSandbox.setGlobal('fetch', () => Promise.resolve({ ok: false, status: 500, json: () => Promise.reject(new Error('not json')) }));
importHarness.chooseFile({ size: 5, type: 'audio/mpeg', name: 'broken.mp3' });
await settle();
log.check('a non-JSON error page degrades to the bundled message', JSON.stringify(importHarness.mini.getTree()).includes('导入失败'), 'looked for "导入失败"');

log.section('5b. two imports started from the SAME render (lost-update probe)');
{
  const raceSandbox = createClientSandbox();
  const raceScope = createScope({ enabled: true, volume: 70, tone: 'chime', custom: [] });
  const raceHarness = createClientHarness(raceSandbox, { scope: raceScope });
  raceSandbox.window.AudioContext = createAudioStub().AudioContext;
  let postCount = 0;
  raceSandbox.setGlobal('fetch', (url, options = {}) => {
    if (options.method === 'POST') {
      postCount += 1;
      const sequence = postCount;
      const id = sequence === 1 ? ID_A : ID_B;
      const name = `race-${sequence}.mp3`;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, id, name }) });
    }
    return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
  });
  raceHarness.apply();
  raceHarness.mountCard({});
  // Both change events fire before either upload resolves: exactly what two
  // overlapping imports would do. The shipped UI prevents this (the button is
  // disabled while importing, and the file dialog is modal), so this is a
  // robustness probe, not a reachable path.
  raceHarness.chooseFile({ size: 8, type: 'audio/mpeg', name: 'race-1.mp3' });
  raceHarness.chooseFile({ size: 8, type: 'audio/mpeg', name: 'race-2.mp3' });
  await settle();
  const raceWrites = raceScope.calls.filter((call) => call.op === 'set' && call.field === 'custom').map((call) => call.value.map((entry) => `${entry.name}/${entry.id.slice(0, 8)}`));
  log.raw('roster writes from two overlapping imports', JSON.stringify(raceWrites));
  log.note(
    raceHarness.diagnostics.custom().length === 2
      ? 'both overlapping imports survived'
      : `overlapping imports LOST the first entry: the final roster is ${JSON.stringify(raceHarness.diagnostics.custom().map((entry) => entry.name))} although both uploads succeeded (each handler read the same pre-import roster — a read-modify-write of the scope value)`,
  );
}

/* ---------------------------------------------------------------- 6. removal */
log.section('6. remove: DELETE the file, drop the cache, forget the row');

const removeSandbox = createClientSandbox();
const removeScope = createScope({
  enabled: true,
  volume: 70,
  tone: `custom:${ID_A}`,
  custom: [{ id: ID_A, name: 'a.mp3' }, { id: ID_B, name: 'b.mp3' }],
});
const removeHarness = createClientHarness(removeSandbox, { scope: removeScope });
const removeCalls = [];
removeSandbox.window.AudioContext = createAudioStub().AudioContext;
removeSandbox.setGlobal('fetch', (url, options = {}) => {
  removeCalls.push({ url, options });
  if (options.method === 'DELETE') return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, removed: true }) });
  return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
});
removeHarness.apply();
removeHarness.mountCard({});
removeHarness.clickButton('移除');
await settle();
const deleteCall = removeCalls.find((call) => call.options.method === 'DELETE');
log.equal('remove calls DELETE on the audio route', deleteCall?.url, `${plugin.AUDIO_ROUTE}/${ID_A}`);
log.equal('remove asks for same-origin credentials', deleteCall?.options.credentials, 'same-origin');
const removalWrites = removeScope.calls.filter((call) => call.op === 'set');
log.equal('remove drops exactly the removed entry', JSON.stringify(removalWrites.find((call) => call.field === 'custom')?.value), JSON.stringify([{ id: ID_B, name: 'b.mp3' }]));
log.equal('removing the selected tone falls back to the default', removalWrites.find((call) => call.field === 'tone')?.value, 'chime');
log.deepEqual('the rendered roster follows', removeHarness.diagnostics.custom().map((entry) => entry.id), [ID_B]);

const failSandbox = createClientSandbox();
const failHarness = createClientHarness(failSandbox, {
  scope: createScope({ enabled: true, volume: 70, tone: `custom:${ID_A}`, custom: [{ id: ID_A, name: 'a.mp3' }] }),
});
failSandbox.setGlobal('fetch', () => Promise.reject(new Error('offline')));
failHarness.apply();
failHarness.mountCard({});
failHarness.clickButton('移除');
await settle();
log.deepEqual('a failing DELETE does not block the roster write', failHarness.diagnostics.custom(), []);

/* --------------------------------------------------------------- 7. hygiene */

log.section('7. hygiene');
const audioEntries = readdirSync(AUDIO_DIR);
log.deepEqual('the browser half never touched the real audio directory', audioEntries, []);
await settle(4);
log.equal('no unhandled rejection during the run', hazards.rejections.length, 0);
log.equal('no uncaught exception during the run', hazards.exceptions.length, 0);
if (hazards.rejections.length > 0) log.raw('rejections', hazards.rejections.join('\n'));
if (hazards.exceptions.length > 0) log.raw('exceptions', hazards.exceptions.join('\n'));

const failures = log.summary();
hazards.stop();
process.exitCode = failures === 0 ? 0 : 1;
