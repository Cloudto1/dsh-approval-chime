/**
 * probe-7 — rev-4 host half: the audio route driven over a REAL http server and
 * RAW sockets (attack surfaces 1-4 of the brief).
 *
 * Why raw sockets: the shipped self-test drives the handler with a Readable and
 * a hand-made response object, so it can never see what a socket actually sees
 * (chunked framing, socket destruction, truncated responses, HEAD framing).
 * Here the handler is registered through the fake `webServer` that the plugin's
 * own `registerAudioRoutes` asks for, and the dispatch in front of it replicates
 * the real matcher verbatim:
 *
 *   dsh-host-webserver/lib/index.js:231  const rawPath = new URL(req.url ?? "/", "http://x").pathname;
 *   dsh-host-webserver/lib/index.js:327  if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) continue;
 *
 * Nothing under lib/** or verify/** is modified; the only files this probe writes
 * live in dsh-approval-chime/audio and are removed again (a stray file it plants
 * to probe the lookup is deleted too).
 *
 * Run: node dsh-approval-chime/verify-independent/probe-7-host-audio-http.mjs
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import net from 'node:net';
import { join } from 'node:path';

import { AUDIO_DIR, PLUGIN_DIR, createLog, settle, sha256, trackHazards } from './kit/rev4-kit.mjs';

const plugin = await import('../lib/index.js');

const ROUTE = plugin.AUDIO_ROUTE;
const MAX = plugin.MAX_AUDIO_BYTES;
const log = createLog('probe-7-host-audio-http');
const hazards = trackHazards();
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');

log.note('command: node dsh-approval-chime/verify-independent/probe-7-host-audio-http.mjs');
log.note(`node ${process.version} / ${process.platform}`);
log.note(`lib/index.js sha256 ${sha256(join(PLUGIN_DIR, 'lib', 'index.js'))}`);
log.note(`lib/client.js sha256 ${sha256(join(PLUGIN_DIR, 'lib', 'client.js'))}`);
log.note(`AUDIO_ROUTE=${ROUTE} MAX_AUDIO_BYTES=${MAX} types=${Object.keys(plugin.AUDIO_TYPES).join(',')} prefix=${plugin.CUSTOM_TONE_PREFIX}`);

const baseline = readdirSync(AUDIO_DIR).sort();
log.note(`audio/ baseline: ${baseline.length === 0 ? '(empty)' : baseline.join(', ')}`);
const CANARIES = ['package.json', 'cordis.patch.yml', 'lib/index.js', 'lib/client.js', 'README.md'];
const canaryBefore = new Map(CANARIES.map((name) => [name, sha256(join(PLUGIN_DIR, name))]));

/* --------------------------------------------------- 1. route wiring capture */

const routes = [];
const hostLogs = [];
const serverStub = {
  register(route) {
    routes.push(route);
    return () => {};
  },
};
plugin.registerAudioRoutes({
  logger: {
    info: (line) => hostLogs.push(['info', line]),
    warn: (line) => hostLogs.push(['warn', line]),
    error: (line) => hostLogs.push(['error', line]),
    debug: () => {},
  },
  effect: (callback) => callback(),
  get: (name) => (name === 'webServer' ? serverStub : undefined),
});

log.section('1. the host half claims exactly one prefix route');
log.equal('route count', routes.length, 1);
log.equal('route kind', routes[0]?.kind, 'prefix');
log.equal('route path', routes[0]?.path, ROUTE);
log.equal('handler is a function', typeof routes[0]?.handler, 'function');
log.check(
  'registration is announced at info level (not warn)',
  hostLogs.some(([level, line]) => level === 'info' && line.includes('audio route registered')),
  JSON.stringify(hostLogs),
);
const handler = routes[0].handler;

/* ------------------------------------------------- 2. real server, real dispatch */

const fellThrough = [];
/** Server-side view of every response: did the bytes actually reach the socket? */
const serverSide = [];
const server = createServer((req, res) => {
  let rawPath;
  try {
    rawPath = new URL(req.url ?? '/', 'http://x').pathname;
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  const record = { method: req.method, rawPath, aborted: false, complete: null, bytesRead: null, writableEnded: null, bytesWritten: null };
  serverSide.push(record);
  req.on('aborted', () => {
    record.aborted = true;
  });
  req.on('close', () => {
    record.complete = req.complete;
    record.bytesRead = req.socket === null ? null : req.socket.bytesRead;
  });
  res.on('close', () => {
    record.writableEnded = res.writableEnded;
    record.bytesWritten = req.socket === null ? null : req.socket.bytesWritten;
  });
  if (rawPath === ROUTE || rawPath.startsWith(`${ROUTE}/`)) {
    Promise.resolve(handler(req, res)).catch((error) => {
      try {
        res.writeHead(500);
        res.end(String(error));
      } catch {
        /* already answered */
      }
    });
    return;
  }
  fellThrough.push(rawPath);
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'SERVER-FALLBACK' }));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const clientErrors = [];
server.on('clientError', (error, socket) => {
  clientErrors.push(error.code ?? error.message);
  try {
    socket.destroy();
  } catch {
    /* gone */
  }
});
const PORT = server.address().port;
log.note(`real http server listening on 127.0.0.1:${PORT}`);
const serverRecord = (from) => JSON.stringify(serverSide.slice(from));

function buildRequest({ method, target, headers = {}, body = null, keepAlive = false }) {
  const lines = [`${method} ${target} HTTP/1.1`, 'Host: 127.0.0.1'];
  if (!keepAlive) lines.push('Connection: close');
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) for (const one of value) lines.push(`${key}: ${one}`);
    else lines.push(`${key}: ${value}`);
  }
  if (body !== null) lines.push(`Content-Length: ${body.length}`);
  const head = `${lines.join('\r\n')}\r\n\r\n`;
  return Buffer.concat([Buffer.from(head, 'latin1'), body === null ? Buffer.alloc(0) : body]);
}

/** Decode a chunked body; returns null while the terminating chunk is missing. */
function decodeChunked(buffer) {
  const out = [];
  let index = 0;
  for (;;) {
    const lineEnd = buffer.indexOf('\r\n', index);
    if (lineEnd < 0) return null;
    const size = Number.parseInt(buffer.slice(index, lineEnd).toString('latin1').split(';')[0], 16);
    if (!Number.isFinite(size)) return null;
    if (size === 0) return { body: Buffer.concat(out), end: lineEnd + 2 };
    const dataStart = lineEnd + 2;
    if (buffer.length < dataStart + size + 2) return null;
    out.push(buffer.slice(dataStart, dataStart + size));
    index = dataStart + size + 2;
  }
}

function parseResponse(raw, headOnly) {
  const at = raw.indexOf('\r\n\r\n');
  if (at < 0) {
    return { status: null, statusLine: raw.slice(0, 80).toString('latin1'), headers: {}, head: '', body: Buffer.alloc(0), bodyText: '', complete: false };
  }
  const headText = raw.slice(0, at).toString('latin1');
  const lines = headText.split('\r\n');
  const status = Number(/^HTTP\/1\.[01] (\d{3})/.exec(lines[0])?.[1] ?? NaN);
  const headers = {};
  for (const line of lines.slice(1)) {
    const colon = line.indexOf(':');
    if (colon > 0) headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }
  const tail = raw.slice(at + 4);
  let body = Buffer.alloc(0);
  let complete = false;
  if (headOnly) {
    body = Buffer.alloc(0);
    complete = true;
  } else if (headers['transfer-encoding'] === 'chunked') {
    const decoded = decodeChunked(tail);
    if (decoded === null) {
      body = tail;
    } else {
      body = decoded.body;
      complete = true;
    }
  } else if (headers['content-length'] !== undefined) {
    const wanted = Number(headers['content-length']);
    body = tail.slice(0, wanted);
    complete = tail.length >= wanted;
  } else {
    body = tail;
    complete = false;
  }
  return { status, statusLine: lines[0], headers, head: headText, body, bodyText: body.toString('utf8'), complete };
}

/** One request on a fresh socket; resolves as soon as the framing is complete. */
function exchange(request, options = {}) {
  const { headOnly = false, idleMs = 2000 } = options;
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: PORT });
    const chunks = [];
    let error = null;
    let finished = false;
    const timer = setTimeout(() => finish('timer'), idleMs + 3000);
    timer.unref?.();
    const finish = (why) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      const raw = Buffer.concat(chunks);
      try {
        socket.destroy();
      } catch {
        /* gone */
      }
      resolve({ why, error, raw, parsed: parseResponse(raw, headOnly) });
    };
    socket.setTimeout(idleMs + 3000, () => finish('timeout'));
    socket.on('connect', () => {
      socket.write(request);
    });
    socket.on('data', (chunk) => {
      chunks.push(chunk);
      const parsed = parseResponse(Buffer.concat(chunks), headOnly);
      if (parsed.status !== null && parsed.complete) finish('complete');
    });
    socket.on('error', (err) => {
      error = err.code ?? err.message;
      finish('error');
    });
    socket.on('close', () => finish('close'));
  });
}

const json = (parsed) => {
  try {
    return JSON.parse(parsed.bodyText);
  } catch {
    return null;
  }
};
const request = (method, target, options = {}) =>
  exchange(buildRequest({ method, target, headers: options.headers ?? {}, body: options.body ?? null }), options);

/* --------------------------------------------------------- 3. happy path (real I/O) */

async function happyPath() {
  log.section('2. upload -> serve -> HEAD -> delete over real HTTP');

  const mp3Bytes = Buffer.from('ID3\u0004probe-7-payload-\u00e9\u00e8', 'binary');
  const uploadA = await request('POST', ROUTE, {
    headers: { 'x-chime-name': encodeURIComponent('我的铃声.mp3'), 'content-type': 'audio/mpeg' },
    body: mp3Bytes,
  });
  log.raw('POST /audio status line + framing headers', `${uploadA.parsed.statusLine} | transfer-encoding=${uploadA.parsed.headers['transfer-encoding'] ?? '-'} content-length=${uploadA.parsed.headers['content-length'] ?? '-'} content-type=${uploadA.parsed.headers['content-type']}`);
  log.raw('POST /audio body', uploadA.parsed.bodyText);
  const uploadABody = json(uploadA.parsed);
  log.equal('upload status', uploadA.parsed.status, 200);
  log.equal('upload ok flag', uploadABody?.ok, true);
  const idA = String(uploadABody?.id ?? '');
  log.check('answered id is a lowercase uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(idA), idA);
  log.equal('display name round-trip', uploadABody?.name, '我的铃声.mp3');
  log.equal('bytes reported', uploadABody?.bytes, mp3Bytes.length);
  log.equal('ext reported', uploadABody?.ext, 'mp3');
  log.equal('content type reported', uploadABody?.type, 'audio/mpeg');

  const storedA = join(AUDIO_DIR, `${idA}.mp3`);
  const onDisk = readdirSync(AUDIO_DIR);
  log.check('file landed at <plugin>/audio/<uuid>.mp3', onDisk.includes(`${idA}.mp3`), `${storedA} — dir holds ${JSON.stringify(onDisk)}`);
  log.check('stored bytes are byte-identical', hash(readFileSync(storedA)) === hash(mp3Bytes));

  const getA = await request('GET', `${ROUTE}/${idA}`);
  log.raw('GET status line + framing headers', `${getA.parsed.statusLine} | content-length=${getA.parsed.headers['content-length'] ?? '-'} content-type=${getA.parsed.headers['content-type'] ?? '-'} cache-control=${getA.parsed.headers['cache-control'] ?? '-'}`);
  log.equal('GET status', getA.parsed.status, 200);
  log.equal('GET content-type', getA.parsed.headers['content-type'], 'audio/mpeg');
  log.equal('GET content-length', getA.parsed.headers['content-length'], String(mp3Bytes.length));
  log.equal('GET cache-control', getA.parsed.headers['cache-control'], 'no-store');
  log.check('GET returns the exact bytes', hash(getA.parsed.body) === hash(mp3Bytes), `sha ${hash(getA.parsed.body)}`);
  log.check('GET answer is not chunked (explicit length)', getA.parsed.headers['transfer-encoding'] === undefined, String(getA.parsed.headers['transfer-encoding']));

  const headA = await request('HEAD', `${ROUTE}/${idA}`, { headOnly: true });
  log.equal('HEAD status', headA.parsed.status, 200);
  log.equal('HEAD sends zero body bytes on the wire', headA.raw.length - (headA.raw.indexOf('\r\n\r\n') + 4), 0);
  log.equal('HEAD content-length matches GET', headA.parsed.headers['content-length'], getA.parsed.headers['content-length']);
  log.equal('HEAD content-type matches GET', headA.parsed.headers['content-type'], getA.parsed.headers['content-type']);

  const uploadB = await request('POST', ROUTE, { headers: { 'x-chime-name': 'second.wav' }, body: Buffer.from('RIFFprobe') });
  const idB = String(json(uploadB.parsed)?.id ?? '');
  log.check('two uploads get distinct ids', idB.length > 0 && idB !== idA, `${idA} vs ${idB}`);
  log.check('the second file is on disk too', readdirSync(AUDIO_DIR).includes(`${idB}.wav`));

  const delB = await request('DELETE', `${ROUTE}/${idB}`);
  log.equal('DELETE status', delB.parsed.status, 200);
  log.equal('DELETE removed=true', json(delB.parsed)?.removed, true);
  const delB2 = await request('DELETE', `${ROUTE}/${idB}`);
  log.equal('second DELETE is idempotent (200)', delB2.parsed.status, 200);
  log.equal('second DELETE removed=false', json(delB2.parsed)?.removed, false);
  log.equal('GET after DELETE is 404', (await request('GET', `${ROUTE}/${idB}`)).parsed.status, 404);
  return { idA, storedA };
}

/* ------------------------------------------------- 4. id validation / traversal */

async function idMatrix({ idA }) {
  log.section('3. id validation and path traversal (GET, raw sockets)');

  const cases = [
    ['encoded ../ twice (..%2F..%2Fpackage.json)', `${ROUTE}/..%2F..%2Fpackage.json`, 404],
    ['lowercase %2f', `${ROUTE}/..%2f..%2fpackage.json`, 404],
    ['encoded dots %2e%2e%2f', `${ROUTE}/%2e%2e%2f%2e%2e%2fpackage.json`, 404],
    ['encoded backslash ..%5C', `${ROUTE}/..%5C..%5Cpackage.json`, 404],
    ['literal ../../ (URL-normalized OUT of the route)', `${ROUTE}/../../package.json`, 404, 'normalized'],
    ['literal sibling file name', `${ROUTE}/package.json`, 404],
    ['literal ../lib/client.js (normalized out of the route)', `${ROUTE}/../lib/client.js`, 404, 'normalized'],
    ['absolute posix path //etc/passwd', `${ROUTE}//etc/passwd`, 404],
    ['windows path C:%5CWindows%5Cwin.ini', `${ROUTE}/C:%5CWindows%5Cwin.ini`, 404],
    ['relative windows path ..%5C..%5Clib%5Cindex.js', `${ROUTE}/..%5C..%5Clib%5Cindex.js`, 404],
    ['5000-character id', `${ROUTE}/${'a'.repeat(5000)}`, 404],
    ['non-uuid id (not-a-uuid)', `${ROUTE}/not-a-uuid`, 404],
    ['uppercase uuid of an EXISTING file', `${ROUTE}/${idA.toUpperCase()}`, 404],
    ['id with an extension (<uuid>.mp3)', `${ROUTE}/${idA}.mp3`, 404],
    ['id plus trailing dot', `${ROUTE}/${idA}.`, 404],
    ['id plus trailing slash', `${ROUTE}/${idA}/`, 404],
    ['uuid plus %20', `${ROUTE}/${idA}%20`, 404],
    ['uuid plus %00', `${ROUTE}/${idA}%00`, 404],
    ['uuid minus one digit', `${ROUTE}/${idA.slice(0, -1)}`, 404],
    ['uuid with dashes removed', `${ROUTE}/${idA.replace(/-/g, '')}`, 404],
    ['malformed escape %E0%A4%A', `${ROUTE}/%E0%A4%A`, 404],
    ['bare %ZZ', `${ROUTE}/%ZZ`, 404],
    ['real id with a query string', `${ROUTE}/${idA}?probe=1`, 200],
    ['real id behind a double slash', `${ROUTE}//${idA}`, 200],
    ['real id behind a triple slash', `${ROUTE}///${idA}`, 200],
  ];

  for (const [label, target, expected, kind] of cases) {
    const response = await request('GET', target);
    const parsed = response.parsed;
    const body = json(parsed);
    log.raw(label, `${parsed.statusLine} | body=${parsed.bodyText.slice(0, 110)} | socket=${response.why}/${response.error ?? 'no-error'}`);
    log.equal(`${label} -> ${expected}`, parsed.status, expected);
    if (kind === 'normalized') {
      // URL() collapses ".." before the route matcher runs, so this request is not
      // even ours: the finding is that the route never sees a dotted segment.
      log.check(`${label}: normalized away before the route (server fallback, not the handler)`, body?.error === 'SERVER-FALLBACK', parsed.bodyText.slice(0, 60));
      log.check(`${label}: no file content was served`, parsed.bodyText.includes('{') && parsed.status === 404, parsed.bodyText.slice(0, 60));
      continue;
    }
    if (expected === 404) {
      log.check(`${label}: answered by the plugin (JSON error), not the server fallback`, typeof body?.error === 'string' && body.error !== 'SERVER-FALLBACK', parsed.bodyText.slice(0, 60));
    }
    if (expected === 200) {
      log.check(`${label}: the real file comes back`, hash(parsed.body) === hash(readFileSync(join(AUDIO_DIR, `${idA}.mp3`))));
    }
  }
  log.deepEqual(
    'only URL-normalized ".." paths ever left the route (they are not routed to us)',
    fellThrough,
    ['/api/package.json', '/api/approval-chime/lib/client.js'],
  );

  const delA = await request('DELETE', `${ROUTE}/${idA}`);
  log.equal('DELETE of the real upload answers removed=true', json(delA.parsed)?.removed, true);
  log.equal('GET of the deleted id is 404', (await request('GET', `${ROUTE}/${idA}`)).parsed.status, 404);

  /* the lookup is a prefix scan of audio/, not an exact name match */
  const shadow = await request('POST', ROUTE, { headers: { 'x-chime-name': 'shadow.mp3' }, body: Buffer.from('REAL-AUDIO-BYTES') });
  const idShadow = String(json(shadow.parsed)?.id ?? '');
  const shadowStray = join(AUDIO_DIR, `${idShadow}.aaa`);
  writeFileSync(shadowStray, Buffer.from('STRAY-SHADOW'));
  const shadowLookup = await request('GET', `${ROUTE}/${idShadow}`);
  log.note(
    `stray "<id>.aaa" planted next to the real "<id>.mp3": GET /<id> -> ${shadowLookup.parsed.status}, content-type=${shadowLookup.parsed.headers['content-type']}, body=${JSON.stringify(shadowLookup.parsed.bodyText.slice(0, 20))}`,
  );
  const shadowDelete = await request('DELETE', `${ROUTE}/${idShadow}`);
  const stillThere = readdirSync(AUDIO_DIR).filter((name) => name.startsWith(idShadow));
  log.note(`after DELETE /<id> with the stray present: removed=${json(shadowDelete.parsed)?.removed}, left on disk=${JSON.stringify(stillThere)}`);
  for (const name of stillThere) rmSync(join(AUDIO_DIR, name), { force: true });
}

/* ------------------------------------------------------ 5. extension / name matrix */

async function nameMatrix() {
  log.section('4. extension allow-list and display-name cleaning (POST)');

  const cases = [
    ['../../evil.mp3', 200, 'evil.mp3'],
    ['..\\..\\evil.mp3', 200, 'evil.mp3'],
    ['/etc/passwd.mp3', 200, 'passwd.mp3'],
    ['a.MP3', 200, 'a.MP3'],
    ['a.Mp3', 200, 'a.Mp3'],
    ['a.mp3.exe', 415, null],
    ['a', 415, null],
    ['', 415, null],
    ['.mp3', 415, null],
    ['a.', 415, null],
    ['a.mp3.', 415, null],
    ['%00a%01.mp3', 200, 'a.mp3'],
    ['%00%01.mp3', 200, '.mp3'],
    ['a%0A.mp3', 200, 'a.mp3'],
    ['%20%20.mp3', 200, '.mp3'],
    ['%ZZ.mp3', 200, '%ZZ.mp3'],
    [`${'x'.repeat(5000)}.mp3`, 200, null],
    ['payload.mp3%20', 415, null],
    ['notes.txt', 415, null],
    ['archive.zip', 415, null],
    ['trailing%20space%20.mp3', 200, 'trailing space .mp3'],
  ];

  for (const [rawName, expectedStatus, expectedName] of cases) {
    const response = await request('POST', ROUTE, { headers: { 'x-chime-name': rawName }, body: Buffer.from('probe-payload') });
    const parsed = response.parsed;
    const body = json(parsed);
    const label = rawName === '' ? '(empty header value)' : rawName.length > 40 ? `${rawName.slice(0, 10)}…len${rawName.length}` : rawName;
    log.raw(`name=${label}`, `${parsed.statusLine} | ${parsed.bodyText.slice(0, 150)}`);
    log.equal(`name=${label} -> HTTP ${expectedStatus}`, parsed.status, expectedStatus);
    if (expectedStatus === 200 && body?.ok === true) {
      const storedName = `${body.id}.${body.ext}`;
      log.check(`name=${label}: land path stays inside audio/`, readdirSync(AUDIO_DIR).includes(storedName) && !/[\\/]/.test(storedName), storedName);
      if (expectedName !== null) log.equal(`name=${label}: cleaned display name`, body.name, expectedName);
      if (rawName.startsWith('xxxx')) log.equal(`name=${label}: display name truncated to 120`, String(body.name).length, 120);
      if (/%0[0-9A-F]/.test(rawName)) log.check(`name=${label}: control characters stripped from the display name`, !/[\u0000-\u001f\u007f]/.test(String(body.name)), JSON.stringify(body.name));
      await request('DELETE', `${ROUTE}/${body.id}`);
    }
    if (expectedStatus === 415) {
      log.check(`name=${label}: 415 names the offending extension`, typeof body?.error === 'string' && body.error.includes('unsupported audio type'), JSON.stringify(body?.error));
    }
  }

  log.section('4b. header shape corners');
  const noHeader = await request('POST', ROUTE, { body: Buffer.from('has-a-body-but-no-name') });
  log.raw('POST without x-chime-name (small body)', `${noHeader.parsed.statusLine} | ${noHeader.parsed.bodyText.slice(0, 140)} | socket=${noHeader.why}/${noHeader.error ?? 'no-error'}`);
  log.equal('missing x-chime-name -> 415', noHeader.parsed.status, 415);
  log.check('missing-name POST (small body) got a clean answer', noHeader.error === null, String(noHeader.error));

  const bigNoHeader = await request('POST', ROUTE, { body: Buffer.alloc(1024 * 1024, 0x42) });
  log.raw('POST without x-chime-name (1 MB body)', `${bigNoHeader.parsed.statusLine} | socket=${bigNoHeader.why}/${bigNoHeader.error ?? 'no-error'} | receivedBytes=${bigNoHeader.raw.length}`);
  log.note(`1 MB body without a name: status=${bigNoHeader.parsed.status} socket=${bigNoHeader.why}/${bigNoHeader.error ?? 'none'}`);

  const upperHeader = await request('POST', ROUTE, { headers: { 'X-Chime-Name': 'cap.mp3' }, body: Buffer.from('cap') });
  log.equal('header name is case-insensitive', upperHeader.parsed.status, 200);
  const upperId = String(json(upperHeader.parsed)?.id ?? '');
  if (upperId.length > 0) await request('DELETE', `${ROUTE}/${upperId}`);

  const dupHeader = await request('POST', ROUTE, { headers: { 'x-chime-name': ['a.mp3', 'b.mp3'] }, body: Buffer.from('dup') });
  const dupBody = json(dupHeader.parsed);
  log.raw('duplicate x-chime-name headers', `${dupHeader.parsed.statusLine} | ${dupHeader.parsed.bodyText.slice(0, 140)}`);
  log.note(`duplicate header -> status=${dupHeader.parsed.status} name=${JSON.stringify(dupBody?.name)}`);
  if (dupBody?.ok === true) await request('DELETE', `${ROUTE}/${dupBody.id}`);
}

/* ------------------------------------------------------------------ 6. size cap */

async function sizeCap() {
  log.section('5. the 5 MB cap: exact limit, limit + 1, streamed overflow');

  const listBefore = readdirSync(AUDIO_DIR).sort();

  const exact = Buffer.alloc(MAX, 0x5a);
  const uploadExact = await request('POST', ROUTE, { headers: { 'x-chime-name': 'exact.wav' }, body: exact });
  const exactBody = json(uploadExact.parsed);
  log.raw('POST exactly MAX_AUDIO_BYTES', `${uploadExact.parsed.statusLine} | ${uploadExact.parsed.bodyText.slice(0, 140)}`);
  log.equal('exactly at the cap -> 200', uploadExact.parsed.status, 200);
  log.equal('reported byte count equals the cap', exactBody?.bytes, MAX);
  if (exactBody?.ok === true) {
    log.equal('the file on disk is exactly the cap', readFileSync(join(AUDIO_DIR, `${exactBody.id}.wav`)).length, MAX);
    const back = await request('GET', `${ROUTE}/${exactBody.id}`);
    log.check('5 MB round-trips byte-identically', hash(back.parsed.body) === hash(exact), `sha ${hash(back.parsed.body)}`);
    log.equal('the 5 MB file is deleted again', json((await request('DELETE', `${ROUTE}/${exactBody.id}`)).parsed)?.removed, true);
  }

  const started = Date.now();
  const beforeOver = serverSide.length;
  const over = await request('POST', ROUTE, { headers: { 'x-chime-name': 'over.wav' }, body: Buffer.alloc(MAX + 1, 0x6b) });
  await settle(2);
  log.raw('POST MAX+1 run 1', `${over.parsed.statusLine} | ${over.parsed.bodyText.slice(0, 150)}`);
  log.raw('POST MAX+1 run 1 socket', `why=${over.why} error=${over.error ?? 'none'} receivedBytes=${over.raw.length} elapsedMs=${Date.now() - started}`);
  log.raw('POST MAX+1 run 1 server-side record', serverRecord(beforeOver));
  const over2 = await request('POST', ROUTE, { headers: { 'x-chime-name': 'over2.mp3' }, body: Buffer.alloc(MAX + 1, 0x6c) });
  log.raw('POST MAX+1 run 2', `${over2.parsed.statusLine} | socket=${over2.why}/${over2.error ?? 'none'} | receivedBytes=${over2.raw.length}`);
  const over3 = await request('POST', ROUTE, { headers: { 'x-chime-name': 'over3.flac' }, body: Buffer.alloc(MAX * 2, 0x6d) });
  log.raw('POST 2×MAX run 3', `${over3.parsed.statusLine} | socket=${over3.why}/${over3.error ?? 'none'} | receivedBytes=${over3.raw.length}`);
  await settle(2);
  log.note(
    `oversize POST (content-length, like a browser File body): run1 status=${over.parsed.status} socket=${over.why}/${over.error ?? 'none'} bytesReceived=${over.raw.length} · ` +
      `run2 status=${over2.parsed.status} socket=${over2.why}/${over2.error ?? 'none'} · run3 status=${over3.parsed.status} socket=${over3.why}/${over3.error ?? 'none'}`,
  );
  log.check(
    'an oversized POST is refused with a readable 413',
    [over, over2, over3].every((run) => run.parsed.status === 413),
    `statuses=${[over, over2, over3].map((run) => run.parsed.status).join(',')} bytesReceived=${[over, over2, over3].map((run) => run.raw.length).join(',')}`,
  );

  const atCapStream = await chunkedUpload({ name: 'streamed-at-cap.wav', totalBytes: MAX });
  const atCapText = atCapStream.received.toString('latin1');
  log.raw('chunked upload exactly at the cap (head)', atCapText.split('\r\n').slice(0, 4).join(' | '));
  const atCapBody = json(parseResponse(atCapStream.received, false));
  log.check('a chunked body exactly at the cap is accepted (200 + uuid)', /^HTTP\/1\.[01] 200/.test(atCapText) && typeof atCapBody?.id === 'string', `status=${atCapText.slice(0, 20)} writeError=${atCapStream.writeError ?? 'none'}`);
  if (typeof atCapBody?.id === 'string') {
    log.equal('the streamed file is exactly the cap on disk', readFileSync(join(AUDIO_DIR, `${atCapBody.id}.wav`)).length, MAX);
    await request('DELETE', `${ROUTE}/${atCapBody.id}`);
  }

  const streamed = await chunkedUpload({ name: 'streamed.wav', totalBytes: MAX + 3 * 1024 * 1024 });
  log.raw(
    'chunked overflow socket outcome',
    `why=${streamed.why} writeError=${streamed.writeError ?? 'none'} framesSent=${streamed.frames} bytesOffered=${streamed.written} bytesReceived=${streamed.received.length}`,
  );
  log.raw('chunked overflow response (first 400 bytes)', streamed.received.toString('latin1').slice(0, 400) || '(nothing received)');
  log.check(
    'a streamed overflow yields a readable 413 to the client',
    /^HTTP\/1\.[01] 413/.test(streamed.received.toString('latin1')),
    `received=${JSON.stringify(streamed.received.toString('latin1').slice(0, 60))} writeError=${streamed.writeError ?? 'none'}`,
  );

  const paced = await chunkedUpload({ name: 'paced.wav', totalBytes: MAX + 1024 * 1024, frameBytes: 32768, paceMs: 4 });
  await settle(2);
  const pacedRecord = serverSide[serverSide.length - 1];
  log.raw(
    'paced chunked overflow socket outcome',
    `why=${paced.why} writeError=${paced.writeError ?? 'none'} framesSent=${paced.frames} bytesOffered=${paced.written} bytesReceived=${paced.received.length} first=${JSON.stringify(paced.received.toString('latin1').slice(0, 60))}`,
  );
  log.raw(
    'paced chunked overflow server-side record',
    `res.writableEnded=${pacedRecord?.writableEnded} socket.bytesWritten=${pacedRecord?.bytesWritten} req.complete=${pacedRecord?.complete} req.aborted=${pacedRecord?.aborted} bytesRead=${pacedRecord?.bytesRead}`,
  );
  log.check(
    'a SLOW streamed overflow still yields a readable 413 (not a race)',
    /^HTTP\/1\.[01] 413/.test(paced.received.toString('latin1')),
    `received=${paced.received.length}B writeError=${paced.writeError ?? 'none'}`,
  );

  const streamed2 = await chunkedUpload({ name: 'streamed2.wav', totalBytes: MAX + 1 });
  log.raw(
    'chunked overflow (cap + 1 only) socket outcome',
    `why=${streamed2.why} writeError=${streamed2.writeError ?? 'none'} framesSent=${streamed2.frames} bytesOffered=${streamed2.written} bytesReceived=${streamed2.received.length} first=${JSON.stringify(streamed2.received.toString('latin1').slice(0, 40))}`,
  );

  log.deepEqual('no residue after the oversized uploads', readdirSync(AUDIO_DIR).sort(), listBefore);
}

/** Write a chunked body (optionally paced) and collect everything the server sends. */
function chunkedUpload({ name, totalBytes, frameBytes = 65536, paceMs = 0, timeoutMs = 20000 }) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: PORT });
    const received = [];
    const frame = Buffer.alloc(frameBytes, 0x41);
    const crlf = Buffer.from('\r\n', 'latin1');
    let written = 0;
    let frames = 0;
    let writeError = null;
    let finished = false;
    const timer = setTimeout(() => finish('timeout'), timeoutMs);
    timer.unref?.();
    const finish = (why) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
        /* gone */
      }
      resolve({ why, writeError, written, frames, received: Buffer.concat(received) });
    };
    const oneFrame = () => {
      const size = Math.min(frameBytes, totalBytes - written);
      const payload = size === frameBytes ? frame : frame.subarray(0, size);
      try {
        // Three separate writes: `a && b && c` would SHORT-CIRCUIT and silently
        // drop the payload whenever the first write reports back-pressure.
        const first = socket.write(Buffer.from(`${size.toString(16)}\r\n`, 'latin1'));
        const second = socket.write(payload);
        const third = socket.write(crlf);
        written += size;
        frames += 1;
        if (!first || !second || !third) {
          socket.once('drain', pump);
          return;
        }
      } catch (error) {
        writeError = error.code ?? error.message;
        finish('write-threw');
        return;
      }
      pump();
    };
    const pump = () => {
      if (finished || socket.destroyed) return;
      if (written >= totalBytes) {
        try {
          socket.write('0\r\n\r\n');
        } catch (error) {
          writeError = writeError ?? error.code ?? error.message;
        }
        return;
      }
      if (paceMs > 0) setTimeout(oneFrame, paceMs);
      else oneFrame();
    };
    socket.on('connect', () => {
      socket.write(
        `POST ${ROUTE} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n` +
          `x-chime-name: ${encodeURIComponent(name)}\r\ncontent-type: audio/wav\r\ntransfer-encoding: chunked\r\n\r\n`,
      );
      pump();
    });
    socket.on('data', (chunk) => received.push(chunk));
    socket.on('error', (error) => {
      writeError = writeError ?? error.code ?? error.message;
      finish('error');
    });
    socket.on('close', () => finish('close'));
  });
}

/* ------------------------------------------------------------------ 7. shapes */

async function shapeMatrix({ idA }) {
  log.section('6. request shapes: methods, empty ids, malformed escapes, absolute form');

  const cases = [
    ['POST to /<uuid>', 'POST', `${ROUTE}/${idA}`, 405],
    ['POST to /<non-uuid>', 'POST', `${ROUTE}/nope`, 405],
    ['PUT to the route', 'PUT', ROUTE, 405],
    ['PATCH to the route', 'PATCH', ROUTE, 405],
    ['OPTIONS to the route', 'OPTIONS', ROUTE, 405],
    ['TRACE to the route', 'TRACE', ROUTE, 405],
    ['DELETE the bare route (empty id)', 'DELETE', ROUTE, 405],
    ['DELETE the route with a trailing slash', 'DELETE', `${ROUTE}/`, 405],
    ['DELETE with only slashes', 'DELETE', `${ROUTE}///`, 405],
    ['GET the bare route', 'GET', ROUTE, 404],
    ['HEAD the bare route', 'HEAD', ROUTE, 404],
    ['GET an unknown uuid', 'GET', `${ROUTE}/99999999-9999-4999-8999-999999999999`, 404],
    ['HEAD an unknown uuid', 'HEAD', `${ROUTE}/99999999-9999-4999-8999-999999999999`, 404],
  ];
  for (const [label, method, target, expected] of cases) {
    const response = await request(method, target, { headOnly: method === 'HEAD' });
    log.raw(label, `${response.parsed.statusLine} | ${response.parsed.bodyText.slice(0, 110)}`);
    log.equal(`${label} -> ${expected}`, response.parsed.status, expected);
    if (method === 'HEAD') {
      log.equal(`${label}: no body bytes on the wire`, response.raw.length - (response.raw.indexOf('\r\n\r\n') + 4), 0);
    }
  }

  const postTrailingSlash = await request('POST', `${ROUTE}/`, { headers: { 'x-chime-name': 'trail.mp3' }, body: Buffer.from('t') });
  log.raw('POST to the route with a trailing slash', `${postTrailingSlash.parsed.statusLine} | ${postTrailingSlash.parsed.bodyText.slice(0, 120)}`);
  log.note(`POST /audio/ behaves as POST /audio (status ${postTrailingSlash.parsed.status})`);
  const trailBody = json(postTrailingSlash.parsed);
  if (trailBody?.ok === true) await request('DELETE', `${ROUTE}/${trailBody.id}`);

  const absoluteForm = await request('GET', `http://127.0.0.1:${PORT}${ROUTE}/${idA.toUpperCase()}`);
  log.raw('absolute-form request line (uppercase id)', `${absoluteForm.parsed.statusLine} | ${absoluteForm.parsed.bodyText.slice(0, 80)}`);
  log.note('the handler parses req.url with URL(), so absolute-form reaches the same branch');
}

/* ---------------------------------------------------- 8. survival, residue, hazards */

async function finish() {
  log.section('7. the server survives, nothing is left behind');

  await settle(2);
  const silent = serverSide.filter((record) => record.writableEnded === true && record.bytesWritten === 0);
  log.raw('responses that ended with ZERO bytes on the socket', silent.map((r) => `${r.method} ${r.rawPath} bytesRead=${r.bytesRead}`).join(' ; ') || '(none)');
  log.check(
    'every answer the handler produced actually reached the socket',
    silent.length === 0,
    `${silent.length} response(s) wrote 0 bytes: ${silent.map((r) => `${r.method} ${r.rawPath}`).join(', ')}`,
  );
  log.check('the probe itself spoke valid HTTP (no clientError)', clientErrors.length === 0, clientErrors.slice(0, 5).join(', '));

  const finalGet = await request('GET', `${ROUTE}/00000000-0000-4000-8000-000000000000`);
  log.check('the server still answers after every attack', finalGet.parsed.status === 404, String(finalGet.parsed.status));
  log.deepEqual('audio/ is back to its baseline', readdirSync(AUDIO_DIR).sort(), baseline);
  log.deepEqual(
    'only URL-normalized ".." paths ever left the route',
    fellThrough,
    ['/api/package.json', '/api/approval-chime/lib/client.js'],
  );
  for (const name of CANARIES) {
    log.check(`canary unchanged: ${name}`, sha256(join(PLUGIN_DIR, name)) === canaryBefore.get(name));
  }
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => setTimeout(resolve, 300));
  log.equal('no unhandled rejection during the run', hazards.rejections.length, 0);
  log.equal('no uncaught exception during the run', hazards.exceptions.length, 0);
  if (hazards.rejections.length > 0) log.raw('rejections', hazards.rejections.join('\n'));
  if (hazards.exceptions.length > 0) log.raw('exceptions', hazards.exceptions.join('\n'));
}

try {
  const uploaded = await happyPath();
  await idMatrix(uploaded);
  await nameMatrix();
  await sizeCap();
  await shapeMatrix(uploaded);
  await finish();
} catch (error) {
  log.check('the probe itself did not crash', false, String((error && error.stack) || error));
  try {
    server.close();
  } catch {
    /* already closed */
  }
}

const failures = log.summary();
hazards.stop();
process.exitCode = failures === 0 ? 0 : 1;
