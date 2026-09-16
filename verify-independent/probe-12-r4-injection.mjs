/**
 * Independent adversarial probe 12 (rev-4, task t1) — the HTML injection surface.
 *
 * Claim under attack:
 *   5. a file's display name (`name`) goes straight into a React text node; a
 *      name containing `<img onerror=...>` must not become HTML — and the Host
 *      half's display-name cleaning must not have turned it into something else.
 *
 * Two independent halves:
 *   A/B. the browser half: no HTML sink exists anywhere in lib/client.js, and the
 *        payload reaches the element tree ONLY as a string child of <option>,
 *        while the option's `value` stays a validated UUID.
 *   C.   the Host half: drive the REAL `handleAudioRoute` (through
 *        `registerAudioRoutes` + a stub web server) with an upload whose
 *        `x-chime-name` header carries the payload, and read `displayName`'s
 *        output out of the JSON answer. The uploaded file is deleted again
 *        through the same route and the audio directory is compared before/after.
 *
 * NOT proven here (stated, not implied): that React DOM escapes string children.
 * No React distribution exists on this machine (no package, no network, and the
 * live GUI answers 401), so that step rests on React's documented contract plus
 * the absence measured here of any sink that could bypass it. The real-browser
 * probe (probe-13) adds the positive control that the payload DOES execute when
 * inserted as HTML in this exact browser.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { boot, entry, uuid, optionRows, findAll, suite, settle, makeFetch, CLIENT_SOURCE } from './kit/rev4.mjs';
import { HOST_PATH, PLUGIN_DIR } from './kit/platform.mjs';

const S = suite('probe-12 rev-4 injection surface (independent)');
const PAYLOAD = '<img src=x onerror="window.__XSS__=1">.wav';

/* ------------------------------------------------- A: static sink scan */

S.group('A — the browser half contains no HTML sink');
{
  const sinks = [
    ['dangerouslySetInnerHTML', /dangerouslySetInnerHTML/],
    ['innerHTML', /\binnerHTML\b/],
    ['outerHTML', /\bouterHTML\b/],
    ['insertAdjacentHTML', /insertAdjacentHTML/],
    ['document.write', /document\.write/],
    ['createContextualFragment', /createContextualFragment/],
    ['DOMParser', /DOMParser/],
    ['eval', /\beval\s*\(/],
    ['new Function', /new\s+Function\s*\(/],
    ['srcdoc', /srcdoc/],
    ['<script', /<script/i],
  ];
  const lines = CLIENT_SOURCE.split(/\r?\n/);
  // Comments are stripped first: the file's own doc block mentions `<script src>`.
  const code = CLIENT_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const codeLines = code.split(/\r?\n/);
  for (const [label, pattern] of sinks) {
    const hits = [];
    for (let index = 0; index < codeLines.length; index += 1) if (pattern.test(codeLines[index])) hits.push(`${index + 1}: ${codeLines[index].trim().slice(0, 90)}`);
    S.same(`${label} appears nowhere in the executable code of lib/client.js`, hits.length, 0);
    if (hits.length > 0) S.note(`${label} hits`, hits);
  }
  S.check('the only `<script` in the file is inside a comment', CLIENT_SOURCE.split('<script').length - 1 === 1 && CLIENT_SOURCE.includes('* Loaded by the Host as a CLASSIC script'), `occurrences: ${CLIENT_SOURCE.split('<script').length - 1}`);
  const createElementCalls = CLIENT_SOURCE.split('\n').filter((line) => line.includes('React.createElement')).length;
  S.note('React.createElement call sites', createElementCalls);
  S.check('the file only builds elements through React.createElement', createElementCalls > 0 && /document\.createElement\('style'\)/.test(CLIENT_SOURCE), 'document.createElement is used once, for the <style> tag');
  const namedUse = lines.map((line, index) => ({ line: index + 1, text: line })).filter((row) => /\.name\b/.test(row.text));
  S.note('every use of a `.name` property', namedUse.map((row) => `${row.line}: ${row.text.trim()}`));
}

/* ------------------------------------------------- B: the element tree */

S.group('B — the payload reaches the tree as a text child only');
{
  const hostile = [{ id: uuid(51), name: PAYLOAD }, entry(52, 'plain.wav')];
  const api = boot({ scopeValue: { enabled: true, volume: 70, tone: `custom:${uuid(51)}`, custom: hostile }, fetch: makeFetch({ get: { bytes: { tag: 'x' } } }) });
  const driver = api.mountCard({});
  const tree = driver.render();
  const rows = optionRows(tree);
  S.note('rendered rows', rows.map((row) => ({ value: row.value, label: row.label })));
  S.same('the payload survives into the DOM text verbatim (not pre-escaped by the plugin)', rows[0].label, PAYLOAD);
  S.same('the option value is the validated UUID, never the name', rows[0].value, `custom:${uuid(51)}`);
  S.check('the payload appears in NO attribute of any element', findAll(tree, (node) => Object.values(node.props).some((value) => typeof value === 'string' && value.includes('<img'))).length === 0, 'no props string contains the payload');

  // Where exactly does the payload live in the tree?
  const placements = [];
  const walkNode = (node, path) => {
    if (node === null || node === undefined) return;
    if (typeof node === 'string') {
      if (node.includes('<img')) placements.push({ path, kind: 'STRING CHILD (React text node)' });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, index) => walkNode(child, `${path}[${index}]`));
      return;
    }
    if (typeof node !== 'object') return;
    if (node.props !== undefined) {
      for (const [key, value] of Object.entries(node.props)) {
        if (typeof value === 'string' && value.includes('<img')) placements.push({ path: `${path}.props.${key}`, kind: 'PROP (attribute)' });
      }
    }
    (node.children ?? []).forEach((child, index) => walkNode(child, `${path}.children[${index}]`));
  };
  walkNode(tree, 'card');
  S.deep('every occurrence of the payload in the tree is a string child', [...new Set(placements.map((item) => item.kind))], ['STRING CHILD (React text node)']);
  S.note('payload placements', placements);
  S.check('no element sets dangerouslySetInnerHTML', findAll(tree, (node) => Object.prototype.hasOwnProperty.call(node.props, 'dangerouslySetInnerHTML')).length === 0, 'none');

  // The select's value still matches a rendered option, so the select is not blank.
  const select = findAll(tree, (node) => node.type === 'select')[0];
  S.same('the select value matches the hostile row', select.props.value, `custom:${uuid(51)}`);
  S.same('the row order is unchanged by a hostile name', JSON.stringify(rows.map((row) => row.value)), JSON.stringify([`custom:${uuid(51)}`, `custom:${uuid(52)}`, 'chime', 'bell', 'beep']));
  void settle;
}

/* ---------------------------------------------- C: the Host half's cleaning */

S.group('C — the Host half\'s display-name cleaning, measured through its own route');
const host = await import(pathToFileURL(HOST_PATH).href);
const audioDir = join(PLUGIN_DIR, 'audio');
const dirBefore = (() => {
  try {
    return readdirSync(audioDir).sort();
  } catch {
    return [];
  }
})();
S.note('audio directory before', dirBefore);

function makeRes() {
  const res = {
    status: null,
    headers: null,
    body: '',
    writeHead(status, headers) {
      res.status = status;
      res.headers = headers;
    },
    end(body) {
      if (body !== undefined && body !== null) res.body += String(body);
    },
  };
  return res;
}

function makeReq(method, path, headerName, bytes) {
  const stream = Readable.from(bytes === undefined ? [] : [Buffer.from(bytes)]);
  stream.method = method;
  stream.url = path;
  stream.headers = headerName === undefined ? {} : { 'x-chime-name': headerName };
  return stream;
}

const handlers = [];
const fakeCtx = {
  logger: { info() {}, warn() {}, error() {}, debug() {} },
  get(name) {
    if (name !== 'webServer') return undefined;
    return {
      register(spec) {
        handlers.push(spec);
        return () => {};
      },
    };
  },
  effect(callback, label) {
    void label;
    return callback();
  },
};
host.registerAudioRoutes(fakeCtx);
S.same('the audio route was registered exactly once', handlers.length, 1);
S.same('the route id is the documented prefix', handlers.length === 0 ? null : `${handlers[0].kind} ${handlers[0].path}`, `prefix ${host.AUDIO_ROUTE}`);

async function upload(headerName, bytes = [1, 2, 3, 4]) {
  const res = makeRes();
  await handlers[0].handler(makeReq('POST', host.AUDIO_ROUTE, headerName, bytes), res);
  let body = null;
  try {
    body = JSON.parse(res.body);
  } catch {
    body = res.body;
  }
  if (res.status === 200 && body !== null && typeof body === 'object') created.add(body.id);
  return { status: res.status, body };
}

const created = new Set();

async function remove(id) {
  const res = makeRes();
  await handlers[0].handler(makeReq('DELETE', `${host.AUDIO_ROUTE}/${id}`), res);
  try {
    created.delete(id);
  } catch {
    /* the sweep below is the backstop */
  }
  return { status: res.status, body: JSON.parse(res.body) };
}

{
  const encoded = encodeURIComponent(PAYLOAD);
  S.note('x-chime-name header (encoded)', encoded);
  const answer = await upload(encoded);
  S.same('the upload is accepted', answer.status, 200);
  S.same('the display name is the payload verbatim — the cleaning does NOT change it', answer.body.name, PAYLOAD);
  S.same('the display name is echoed byte-for-byte (no HTML entity encoding, no stripping)', Buffer.from(answer.body.name, 'utf8').equals(Buffer.from(PAYLOAD, 'utf8')), true);
  S.same('the file on disk is named by the uuid, not by the display name', answer.body.ext, 'wav');
  const stored = readdirSync(audioDir).filter((name) => name.startsWith(answer.body.id));
  S.check('exactly one stored file exists for this id, and its name is <uuid>.wav', stored.length === 1 && /^[0-9a-f-]{36}\.wav$/.test(stored[0]), JSON.stringify(stored));
  const cleaned = await remove(answer.body.id);
  S.same('the uploaded file was removed again', JSON.stringify([cleaned.status, cleaned.body.removed]), JSON.stringify([200, true]));

  // The other cleaning rules, one upload each (all removed again).
  const cases = [
    ['windows path is stripped', 'C:\\Users\\me\\secret.wav', 'secret.wav'],
    ['posix path is stripped', '/etc/passwd.wav', 'passwd.wav'],
    ['traversal is stripped', '../../evil.wav', 'evil.wav'],
    ['control bytes are stripped', 'a\u0007b\u001fc.wav', 'abc.wav'],
    ['a leading space is trimmed away', ' padded.wav', 'padded.wav'],
    ['rev-5 F6: a TRAILING space is trimmed before the extension is read, so the file is ACCEPTED', 'padded.wav ', 'padded.wav'],
    ['rev-5 F6: a name whose last dot has no usable extension is still refused', 'padded.', 'status 415'],
    ['quotes and angle brackets pass through', '"><img>.wav', '"><img>.wav'],
    ['rev-5 D4/F5: the name is bounded to 120 CODE POINTS', `${'x'.repeat(200)}.wav`, `${'x'.repeat(120)}`],
    ['an empty header is refused with 415 (the extension is read from the name)', '', 'status 415'],
    ['the Host still refuses an extension-less name (the CLIENT is the side that adds the MIME extension, see probe-15)', 'audio', 'status 415'],
  ];
  for (const [label, input, expected] of cases) {
    const answer2 = await upload(encodeURIComponent(input));
    const got = answer2.status === 200 ? answer2.body.name : `status ${answer2.status}`;
    if (label.includes('120')) {
      S.same(`${label} (len ${String(got).length})`, got.length, expected.length);
      S.same(`${label}: the cap cuts the extension off`, got.endsWith('.wav'), false);
    } else {
      S.same(label, got, expected);
    }
    if (answer2.status === 200) await remove(answer2.body.id);
  }

  // rev-5 F5: the cut is by CODE POINT, so the surrogate pair survives intact.
  const emojiName = `${'x'.repeat(119)}😀tail.wav`;
  const emojiAnswer = await upload(encodeURIComponent(emojiName));
  S.same('the emoji-boundary case is accepted', emojiAnswer.status, 200);
  S.deep('the stored name is 120 CODE POINTS (121 UTF-16 units)', [Array.from(emojiAnswer.body.name).length, emojiAnswer.body.name.length], [120, 121]);
  S.check('rev-5 F5: NO lone surrogate is stored any more', /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(emojiAnswer.body.name) === false, `tail=${JSON.stringify(emojiAnswer.body.name.slice(-8))}`);
  S.same('and the emoji itself is intact at the cut point', Array.from(emojiAnswer.body.name).at(-1), '😀');
  if (emojiAnswer.status === 200) await remove(emojiAnswer.body.id);

  // Unsupported extension is refused before anything is stored.
  const bad = await upload(encodeURIComponent('note.txt'));
  S.same('an unsupported extension is refused with 415', bad.status, 415);

  // Backstop sweep: remove anything this probe still has on disk, then compare.
  const strays = readdirSync(audioDir).filter((name) => [...created].some((id) => name.startsWith(id)));
  for (const stray of strays) await remove(stray.slice(0, 36));
  S.same('no file of this probe is left behind', readdirSync(audioDir).filter((name) => [...created].some((id) => name.startsWith(id))).length, 0);
  S.check('every upload of this probe was cleaned up (audio dir unchanged)', readdirSync(audioDir).sort().join(',') === dirBefore.join(','), `before=[${dirBefore.join(',')}] after=[${readdirSync(audioDir).sort().join(',')}]`);
}

S.group('D — residual uncertainty, recorded rather than hidden');
{
  S.note('not re-derived here', 'React DOM escaping of string children. No react/react-dom exists on this machine (searched the DSH checkout, the profile, the npm cacache; network is blocked; http://127.0.0.1:3080 answers 401), so probe-13 only runs a positive control that the payload executes when inserted as HTML in the same browser.');
  S.note('files with < > " in the name', 'Windows forbids these characters in a file name, so a real file-picker upload of this exact payload is only possible on macOS/Linux; the HTTP header can be forged from any client. The rendering path itself is platform independent.');
  void readFileSync;
}

S.done();
