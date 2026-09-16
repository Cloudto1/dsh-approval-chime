/**
 * Headless self-test 4/4 — imported audio (the custom-tone roster).
 *
 * The feature this covers: a 导入 button uploads a file from the user's machine,
 * the Host half stores it, the tone select lists imported files BEFORE the built-in
 * tones in import order, and the popup shows three rows before it scrolls.
 *
 * It proves, without a Host and without a browser:
 *   - `registerAudioRoutes` claims exactly one prefix route and injects `webServer`
 *     optionally (never as a hard dependency, which would stall a profile boot);
 *   - POST stores the bytes under a validated uuid, GET serves them back with the
 *     right content type, DELETE removes them, and the refusals are honest:
 *     415 for an unsupported extension, 413 for an oversized body, 404 for an
 *     unknown id — and a path-shaped id can never reach the filesystem;
 *   - the tone schema still REFUSES a bare/garbage tone while accepting
 *     `custom:<uuid>`, so widening it did not open the document to typos;
 *   - the browser half renders imported options first in import order, drops
 *     malformed and duplicate roster entries, still shows a row for a selected
 *     tone whose file is gone, and stamps the 3-row scroll limit into its CSS;
 *   - a custom tone really plays: the file is fetched through the route, decoded
 *     once, played through a master gain of `volume/100 × MASTER_GAIN`, and cached
 *     so the second chime does not refetch.
 *
 * Files this test creates are deleted at the end; anything that was in the audio
 * directory before the run is left untouched.
 *
 * Run: node dsh-approval-chime/verify/custom-audio.test.mjs
 */

import { existsSync, readdirSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import {
  PLUGIN_DIR,
  createClientCtx,
  createClientSandbox,
  createRenderer,
  createReporter,
  elementsOfType,
  flattenText,
  settle,
  trackUnhandledRejections,
} from './_harness.mjs';

const report = createReporter('custom-audio.test.mjs');
const plugin = await import('../lib/index.js');
const rejections = trackUnhandledRejections();

const AUDIO_DIR = join(PLUGIN_DIR, 'audio');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROUTE = plugin.AUDIO_ROUTE;
const ID_A = '11111111-2222-4333-8444-555555555555';
const ID_B = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ID_C = '12345678-1234-4234-8234-123456789012';

const existedBefore = existsSync(AUDIO_DIR);
/**
 * The directory's contents when this run started. The hygiene check below compares
 * against THIS snapshot rather than against "empty": the audio store is shared with the
 * other probe suites, and a file one of them left behind must not be reported as a
 * product regression (observation O-1, docs/rev6-复验.md).
 */
const filesBefore = existedBefore ? readdirSync(AUDIO_DIR).slice().sort() : [];

/* ------------------------------------------------------------ 1. route wiring */

report.section('the Host half claims the audio route');

function fakeResponse() {
  const state = { status: 0, headers: null, body: null, ended: false };
  let markFinished = () => {};
  const finished = new Promise((resolve) => {
    markFinished = resolve;
  });
  return {
    state,
    /** Resolves when the handler answers — some answers are deliberately deferred. */
    finished,
    writeHead(status, headers) {
      state.status = status;
      state.headers = headers;
    },
    end(body) {
      state.ended = true;
      if (body !== undefined && body !== null) state.body = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
      markFinished();
    },
  };
}

function fakeRequest({ method, url, headers = {}, body = null }) {
  const stream = Readable.from(body === null ? [] : [body]);
  stream.method = method;
  stream.url = url;
  stream.headers = headers;
  return stream;
}

const routes = [];
const webServer = {
  register(route) {
    routes.push(route);
    return () => {};
  },
};
const logs = [];
const routeCtx = {
  logger: { info: (line) => logs.push(line), warn: (line) => logs.push(line), error: () => {}, debug: () => {} },
  effect: (callback) => callback(),
  get: (name) => (name === 'webServer' ? webServer : undefined),
};
plugin.registerAudioRoutes(routeCtx);

report.equal('exactly one route is registered', routes.length, 1);
report.equal('route kind is prefix', routes[0]?.kind, 'prefix');
report.equal('route path', routes[0]?.path, '/api/approval-chime/audio');
report.ok('the registration is reported', logs.some((line) => line.includes('audio route registered')), logs.join(' | '));
const handler = routes[0]?.handler;
report.ok('the handler is callable', typeof handler === 'function');

/* -------------------------------------------------------- 2. upload / serve / drop */

report.section('upload, serve and drop one file');

const bytes = Buffer.from('ID3\u0004fake-mp3-payload');
const uploadResponse = fakeResponse();
await handler(
  fakeRequest({
    method: 'POST',
    url: ROUTE,
    headers: { 'x-chime-name': encodeURIComponent('我的铃声.mp3'), 'content-type': 'audio/mpeg' },
    body: bytes,
  }),
  uploadResponse,
);
report.equal('upload answers 200', uploadResponse.state.status, 200);
const uploaded = JSON.parse(uploadResponse.state.body.toString('utf8'));
report.equal('upload reports ok', uploaded.ok, true);
report.ok('the id is a uuid (the only shape the route will look up)', UUID.test(String(uploaded.id)), String(uploaded.id));
report.equal('the display name survives the round trip', uploaded.name, '我的铃声.mp3');
report.equal('the stored size is reported', uploaded.bytes, bytes.length);
const storedPath = join(AUDIO_DIR, `${uploaded.id}.mp3`);
report.ok('the file is on disk under <uuid>.<ext>', existsSync(storedPath), storedPath);

const serveResponse = fakeResponse();
await handler(fakeRequest({ method: 'GET', url: `${ROUTE}/${uploaded.id}` }), serveResponse);
report.equal('GET answers 200', serveResponse.state.status, 200);
report.equal('GET serves the original content type', serveResponse.state.headers['content-type'], 'audio/mpeg');
report.equal('GET returns the exact bytes', Buffer.compare(serveResponse.state.body, bytes), 0);

const headResponse = fakeResponse();
await handler(fakeRequest({ method: 'HEAD', url: `${ROUTE}/${uploaded.id}` }), headResponse);
report.equal('HEAD answers 200 with no body', headResponse.state.status, 200);
report.equal('HEAD sends no body', headResponse.state.body, null);

report.section('the refusals are honest');

const unknownResponse = fakeResponse();
await handler(fakeRequest({ method: 'GET', url: `${ROUTE}/99999999-9999-4999-8999-999999999999` }), unknownResponse);
report.equal('an unknown id is 404', unknownResponse.state.status, 404);

const traversalResponse = fakeResponse();
await handler(fakeRequest({ method: 'GET', url: `${ROUTE}/..%2F..%2Fpackage.json` }), traversalResponse);
report.equal('a path-shaped id never reaches the filesystem (404)', traversalResponse.state.status, 404);

const textResponse = fakeResponse();
await handler(
  fakeRequest({ method: 'POST', url: ROUTE, headers: { 'x-chime-name': encodeURIComponent('notes.txt') }, body: Buffer.from('nope') }),
  textResponse,
);
report.equal('an unsupported extension is 415', textResponse.state.status, 415);

const emptyResponse = fakeResponse();
await handler(
  fakeRequest({ method: 'POST', url: ROUTE, headers: { 'x-chime-name': encodeURIComponent('empty.mp3') }, body: null }),
  emptyResponse,
);
report.equal('an empty upload is 400', emptyResponse.state.status, 400);

const bigResponse = fakeResponse();
await handler(
  fakeRequest({
    method: 'POST',
    url: ROUTE,
    headers: { 'x-chime-name': encodeURIComponent('huge.wav') },
    body: Buffer.alloc(plugin.MAX_AUDIO_BYTES + 1),
  }),
  bigResponse,
);
// The refusal is answered only AFTER the sender finishes — Node closes the socket the
// moment a response ends while its request is still unread, which is exactly what used
// to turn this 413 into a bare ECONNRESET on the client (D1). So the assertion waits
// for the answer instead of assuming it is already there.
await Promise.race([bigResponse.finished, settle(20)]);
report.equal('an oversized body is 413 (refused, not truncated)', bigResponse.state.status, 413);report.ok(
  'the oversized upload left nothing behind',
  readdirSync(AUDIO_DIR).every((name) => !name.startsWith('huge')),
  readdirSync(AUDIO_DIR).join(', '),
);

const methodResponse = fakeResponse();
await handler(fakeRequest({ method: 'PUT', url: ROUTE }), methodResponse);
report.equal('an unsupported method is 405', methodResponse.state.status, 405);

report.section('the drop path');

const deleteResponse = fakeResponse();
await handler(fakeRequest({ method: 'DELETE', url: `${ROUTE}/${uploaded.id}` }), deleteResponse);
report.equal('DELETE answers 200', deleteResponse.state.status, 200);
report.equal('DELETE reports the removal', JSON.parse(deleteResponse.state.body.toString('utf8')).removed, true);
report.ok('the file is gone', !existsSync(storedPath), storedPath);

const againResponse = fakeResponse();
await handler(fakeRequest({ method: 'DELETE', url: `${ROUTE}/${uploaded.id}` }), againResponse);
report.equal('deleting an absent file still succeeds', againResponse.state.status, 200);
report.equal('and says nothing was removed', JSON.parse(againResponse.state.body.toString('utf8')).removed, false);

/* ------------------------------------------------------------- 3. tone schema */

report.section('the tone schema stays closed while admitting imported ids');

const loaded = plugin.loadSchemastery({});
const schema = plugin.buildSchema(loaded.z);
report.equal('a built-in tone still validates', schema({ tone: 'bell' }).tone, 'bell');
report.equal('an imported tone validates', schema({ tone: `custom:${ID_A}` }).tone, `custom:${ID_A}`);
let garbageError = null;
try {
  schema({ tone: 'custom:not-a-uuid' });
} catch (error) {
  garbageError = error.message;
}
report.ok('a garbage custom id is refused', garbageError !== null, garbageError ?? 'no error');
report.deepEqual('an empty roster is the default', schema({}).custom, []);
report.deepEqual(
  'the roster keeps its order',
  schema({ custom: [{ id: ID_A, name: 'a.mp3' }, { id: ID_B, name: 'b.wav' }] }).custom,
  [{ id: ID_A, name: 'a.mp3' }, { id: ID_B, name: 'b.wav' }],
);

/* --------------------------------------------------------- 4. the browser half */

report.section('the card lists imported tones first, in order');

const sandbox = createClientSandbox();
const contract = sandbox.loader.registrations[0].factory(sandbox.requireFn);
const harness = createClientCtx({
  scopeSnapshot: {
    value: {
      enabled: true,
      volume: 50,
      tone: `custom:${ID_A}`,
      custom: [
        { id: ID_A, name: 'first.mp3' },
        { id: ID_B, name: 'second.wav' },
        { id: 'not-a-uuid', name: 'malformed' },
        { id: ID_A, name: 'duplicate' },
        { id: ID_C, name: '' },
      ],
    },
    user: { tone: `custom:${ID_A}` },
  },
});
contract.apply(harness.ctx);
const diagnostics = sandbox.context.window.__DSH_APPROVAL_CHIME__;
report.ok('the diagnostics surface is installed', diagnostics !== undefined && diagnostics !== null);
report.ok('the revision names this build', String(diagnostics.revision).includes('rev-11'), String(diagnostics.revision));
report.deepEqual(
  'option order is imports (in order, deduplicated) then built-ins',
  diagnostics.toneOptions(),
  [`custom:${ID_A}`, `custom:${ID_B}`, `custom:${ID_C}`, 'chime', 'bell', 'beep'],
);
report.deepEqual(
  'malformed entries are dropped and a nameless one falls back to its id',
  diagnostics.custom(),
  [{ id: ID_A, name: 'first.mp3' }, { id: ID_B, name: 'second.wav' }, { id: ID_C, name: ID_C }],
);

const cardEntry = harness.state.slotRegistrations.find((entry) => entry.options?.name === 'settings.section');
report.equal('the section registers on the settings.section slot (rev-7 move)', cardEntry?.options?.name, 'settings.section');
report.equal('and keeps its own id and order', `${String(cardEntry?.options?.id)}@${String(cardEntry?.options?.order)}`, 'approval-chime@16');
const driver = createRenderer(sandbox.react, cardEntry.component, {});
const tree = driver.render();
const optionNodes = elementsOfType(tree, 'option');
report.deepEqual(
  'the rendered select offers the same order',
  optionNodes.map((node) => node.props.value),
  [`custom:${ID_A}`, `custom:${ID_B}`, `custom:${ID_C}`, 'chime', 'bell', 'beep'],
);
const buttonLabels = elementsOfType(tree, 'button').map((node) => flattenText(node));
report.equal('imported labels are the file names', flattenText(optionNodes[0]), 'first.mp3');
report.equal('the import button is rendered next to the picker', buttonLabels.includes('导入音频'), true);
report.equal('a remove button appears only for an imported tone', buttonLabels.includes('移除'), true);
const sectionText = flattenText(tree);
report.equal('the page still carries exactly one heading', elementsOfType(tree, 'h2').length, 1);
report.equal('the heading is the section title', flattenText(elementsOfType(tree, 'h2')[0]), '通知提醒');
report.check('a user-saved value still shows the overridden badge', sectionText.includes('已覆盖默认值'), sectionText.slice(0, 200));

const fileInputs = elementsOfType(tree, 'input').filter((node) => node.props.type === 'file');
report.equal('exactly one hidden file input', fileInputs.length, 1);
report.equal('it accepts audio', fileInputs[0]?.props.accept, 'audio/*');
report.equal('it is hidden by CSS rather than by a display prop', fileInputs[0]?.props.className, 'dacFile');

const styleTag = sandbox.document.created.find((element) => element.id === 'dsh-approval-chime/styles');
const styleText = styleTag === undefined ? '' : String(styleTag.textContent);
// 3 rows exactly: the UA stylesheet makes ::picker(select) border-box, so the content
// box must be stated as content-box for `max-height` to mean three rows and nothing else
// (the previous 92px/border-box pair left 82px and clipped the third row — R5-1).
report.ok('the popup is capped at exactly three rows', styleText.includes('box-sizing:content-box;max-height:84px'), 'box-sizing:content-box;max-height:84px');
report.ok('the popup scrolls vertically', styleText.includes('overflow-y:auto'));
report.ok('the file input is hidden', styleText.includes('.dacFile{display:none;}'));
report.ok('the popup keeps its rounded corners', styleText.includes('border-radius:10px'));

/* ------------------------------------------ 5. importing and playing a custom tone */

report.section('upload and playback go through the real route');

const fetchCalls = [];
sandbox.context.fetch = (url, options) => {
  const call = { url, options: options ?? {} };
  fetchCalls.push(call);
  if (call.options.method === 'POST') {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, id: ID_C, name: 'custom name.mp3' }) });
  }
  return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)) });
};

const fileLike = { size: 16, type: 'audio/mpeg', name: 'custom name.mp3' };
const uploadResult = await diagnostics.upload(fileLike);
report.equal('the upload posts to the route', fetchCalls[0]?.url, ROUTE);
report.equal('the upload uses POST', fetchCalls[0]?.options.method, 'POST');
report.equal('the upload asks for same-origin credentials', fetchCalls[0]?.options.credentials, 'same-origin');
report.equal('the file name rides the dedicated header, encoded', fetchCalls[0]?.options.headers['x-chime-name'], encodeURIComponent('custom name.mp3'));
report.equal('the file itself is the body', fetchCalls[0]?.options.body, fileLike);
report.deepEqual('the Host answer is what comes back', uploadResult, { id: ID_C, name: 'custom name.mp3' });

sandbox.context.fetch = (url, options) => {
  const call = { url, options: options ?? {} };
  fetchCalls.push(call);
  if (call.options.method === 'POST') {
    return Promise.resolve({ ok: false, json: () => Promise.resolve({ ok: false, error: 'unsupported audio type "txt"' }) });
  }
  return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)) });
};
let rejected = null;
try {
  await diagnostics.upload({ size: 4, type: 'text/plain', name: 'notes.txt' });
} catch (error) {
  rejected = error.message;
}
report.ok('a rejected upload surfaces the Host message', rejected !== null && rejected.includes('unsupported audio type'), rejected ?? 'no error');

report.section('a custom tone really plays, and only decodes once');

const started = [];
const decoded = [];
const AudioContextImpl = sandbox.audio.AudioContext;
AudioContextImpl.prototype.decodeAudioData = function decodeAudioData(buffer) {
  decoded.push(buffer);
  return Promise.resolve({ duration: 0.25, byteLength: buffer.byteLength });
};
AudioContextImpl.prototype.createBufferSource = function createBufferSource() {
  const node = {
    buffer: null,
    connected: [],
    connect(target) {
      this.connected.push(target);
    },
    start() {
      started.push(node);
    },
  };
  return node;
};

const played = diagnostics.preview();
await settle();
const fetchUrl = `${ROUTE}/${ID_A}`;
report.equal('the sample is fetched through the route', fetchCalls.filter((call) => call.url === fetchUrl).length, 1);
report.equal('the file was decoded once', decoded.length, 1);
report.equal('one buffer source started', started.length, 1);
report.equal('it was wired to the master gain', started[0]?.connected.length, 1);
// Read the gain off the node the source was actually connected to: that is the wiring
// the user hears, not a value recomputed from the settings.
const masterGain = started[0]?.connected[0];
report.close('the gain is volume/100 × MASTER_GAIN', masterGain?.gain?.value, (50 / 100) * diagnostics.masterGain);
report.equal('the preview counter moved', diagnostics.stats().previews, 1);
report.equal('the recorded gain matches the slider', diagnostics.stats().lastGain, (50 / 100) * diagnostics.masterGain);
report.equal('the recorded tone is the imported one', diagnostics.stats().lastTone, `custom:${ID_A}`);

diagnostics.preview();
await settle();
report.equal('the cached buffer is not refetched', fetchCalls.filter((call) => call.url === fetchUrl).length, 1);
report.equal('and it plays again', started.length, 2);
report.equal('the preview counter moved twice', diagnostics.stats().previews, 2);
// An imported tone cannot be rendered synchronously, so `true` here means
// "scheduled and counted on start" — deliberately not "already audible".
report.equal('the preview reports the sample as scheduled', played, true);

/* ------------------------------------------------------------------- cleanup */

await settle();
report.ok('no unhandled rejection at the end of the run', rejections.seen.length === 0, rejections.seen.map(String).join(' | '));
rejections.stop();

if (!existedBefore) {
  try {
    if (existsSync(AUDIO_DIR) && readdirSync(AUDIO_DIR).length === 0) rmdirSync(AUDIO_DIR);
  } catch {
    /* leaving an empty directory behind is harmless */
  }
}
const filesAfter = existsSync(AUDIO_DIR) ? readdirSync(AUDIO_DIR).slice().sort() : [];
const leftBehind = filesAfter.filter((name) => !filesBefore.includes(name));
report.ok('the test left no file behind of its own', leftBehind.length === 0, leftBehind.join(', ') || '(none)');

report.summary();
